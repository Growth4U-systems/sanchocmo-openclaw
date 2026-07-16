import type {
  BlockExecutionRunInput,
  CheckpointExecutionRunInput,
  ExecutionControlRepository,
  ExecutionLeaseReceipt,
  ExecutionLeaseScope,
  ExecutionRun,
  FinishExecutionRunInput,
  RequeueExecutionRunInput,
} from "@/lib/execution-control";

/** Product-agnostic error used to abort a stale owner without side effects. */
export class ExecutionLeaseLostError extends Error {
  constructor(runId: string) {
    super(`Execution lease lost for run ${runId}`);
    this.name = "ExecutionLeaseLostError";
  }
}

export interface ExecutionHeartbeatScheduler {
  setInterval(callback: () => void, delayMs: number): unknown;
  clearInterval(handle: unknown): void;
}

const defaultHeartbeatScheduler: ExecutionHeartbeatScheduler = {
  setInterval: (callback, delayMs) => {
    const timer = setInterval(callback, delayMs);
    timer.unref?.();
    return timer;
  },
  clearInterval: (handle) =>
    clearInterval(handle as ReturnType<typeof setInterval>),
};

/**
 * Reusable fencing session for any Ledger-backed product worker. It owns only
 * lease mechanics; handlers keep their product command/projection logic.
 */
export class FencedExecutionLease {
  private lost = false;
  private timer: unknown;
  private renewal: Promise<void> | null = null;
  private tokenValue: string;
  private runValue: ExecutionRun;

  constructor(
    private readonly repository: ExecutionControlRepository,
    readonly receipt: ExecutionLeaseReceipt,
    private readonly scope: ExecutionLeaseScope,
    private readonly leaseMs: number,
    private readonly heartbeatScheduler: ExecutionHeartbeatScheduler = defaultHeartbeatScheduler,
  ) {
    this.tokenValue = receipt.token;
    this.runValue = receipt.run;
  }

  get token(): string {
    return this.tokenValue;
  }

  /** Latest exact-scope run snapshot observed through a fenced mutation. */
  get run(): ExecutionRun {
    return this.runValue;
  }

  startHeartbeat(): void {
    if (this.timer !== undefined) return;
    const intervalMs = Math.max(1_000, Math.floor(this.leaseMs / 3));
    this.timer = this.heartbeatScheduler.setInterval(() => {
      void this.renew().catch(() => {
        this.lost = true;
      });
    }, intervalMs);
  }

  stopHeartbeat(): void {
    if (this.timer !== undefined) {
      this.heartbeatScheduler.clearInterval(this.timer);
    }
    this.timer = undefined;
  }

  async checkpoint(
    input: Omit<
      CheckpointExecutionRunInput,
      keyof ExecutionLeaseScope | "runId" | "token"
    >,
  ): Promise<ExecutionRun> {
    await this.renew();
    if (this.lost) throw new ExecutionLeaseLostError(this.receipt.run.id);
    const checkpoint = await this.repository.checkpointRun({
      ...this.scope,
      runId: this.receipt.run.id,
      token: this.tokenValue,
      ...input,
    });
    if (!checkpoint) {
      this.lost = true;
      throw new ExecutionLeaseLostError(this.receipt.run.id);
    }
    this.runValue = checkpoint;
    return checkpoint;
  }

  async renew(): Promise<void> {
    if (this.lost) throw new ExecutionLeaseLostError(this.receipt.run.id);
    if (this.renewal) return this.renewal;
    this.renewal = (async () => {
      const renewed = await this.repository.renewRunLease({
        ...this.scope,
        runId: this.receipt.run.id,
        token: this.tokenValue,
        leaseMs: this.leaseMs,
      });
      if (!renewed) {
        this.lost = true;
        throw new ExecutionLeaseLostError(this.receipt.run.id);
      }
      this.tokenValue = renewed.token;
      this.runValue = renewed.run;
    })().finally(() => {
      this.renewal = null;
    });
    return this.renewal;
  }

  async finish(
    input: Omit<
      FinishExecutionRunInput,
      keyof ExecutionLeaseScope | "runId" | "token"
    >,
  ): Promise<ExecutionRun | null> {
    const finished = await this.repository.finishRun({
      ...this.scope,
      runId: this.receipt.run.id,
      token: this.tokenValue,
      ...input,
    });
    if (finished) this.runValue = finished;
    return finished;
  }

  async requeue(
    input: Omit<
      RequeueExecutionRunInput,
      keyof ExecutionLeaseScope | "runId" | "token"
    >,
  ): Promise<ExecutionRun | null> {
    const requeued = await this.repository.requeueRun({
      ...this.scope,
      runId: this.receipt.run.id,
      token: this.tokenValue,
      ...input,
    });
    if (requeued) this.runValue = requeued;
    return requeued;
  }

  async block(
    input: Omit<
      BlockExecutionRunInput,
      keyof ExecutionLeaseScope | "runId" | "token"
    >,
  ): Promise<ExecutionRun | null> {
    const blockRun = this.repository.blockRun;
    if (typeof blockRun !== "function") {
      throw new Error("Execution run block authority is unavailable");
    }
    const blocked = await blockRun.call(this.repository, {
      ...this.scope,
      runId: this.receipt.run.id,
      token: this.tokenValue,
      ...input,
    });
    if (blocked) this.runValue = blocked;
    return blocked;
  }
}

/** Generic single-command claim loop primitive. */
export async function claimAndHandleNextExecution(input: {
  repository: ExecutionControlRepository;
  scope: ExecutionLeaseScope;
  workerId: string;
  leaseMs: number;
  handle: (receipt: ExecutionLeaseReceipt) => Promise<void>;
}): Promise<boolean> {
  const receipt = await input.repository.claimNextRun({
    ...input.scope,
    workerId: input.workerId,
    leaseMs: input.leaseMs,
  });
  if (!receipt) return false;
  await input.handle(receipt);
  return true;
}

export function exponentialRetryDelayMs(
  claimCount: number,
  options: { baseMs?: number; maximumMs?: number } = {},
): number {
  const baseMs = options.baseMs ?? 1_000;
  const maximumMs = options.maximumMs ?? 60_000;
  return Math.min(
    maximumMs,
    baseMs * 2 ** Math.max(0, Math.floor(claimCount) - 1),
  );
}
