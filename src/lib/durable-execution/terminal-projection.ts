import type {
  ExecutionLeaseScope,
  ExecutionTerminalProjection,
  ExecutionTerminalProjectionControlRepository,
  ExecutionTerminalProjectionLeaseReceipt,
} from "@/lib/execution-control";
import type { ExecutionHeartbeatScheduler } from "./leased-worker";

const defaultHeartbeatScheduler: ExecutionHeartbeatScheduler = {
  setInterval: (callback, delayMs) => {
    const timer = setInterval(callback, delayMs);
    timer.unref?.();
    return timer;
  },
  clearInterval: (handle) =>
    clearInterval(handle as ReturnType<typeof setInterval>),
};

/** A stale projection owner must stop without acknowledging another attempt. */
export class ExecutionTerminalProjectionLeaseLostError extends Error {
  constructor(runId: string) {
    super(`Terminal projection lease lost for run ${runId}`);
    this.name = "ExecutionTerminalProjectionLeaseLostError";
  }
}

/**
 * Token-fenced delivery session for the terminal projection outbox. This lease
 * is deliberately independent from the command lease: terminal runs no longer
 * have a command lease by the time their product projection is delivered.
 */
export class FencedTerminalProjectionLease {
  private lost = false;
  private readonly lostListeners = new Set<(error: Error) => void>();
  private timer: unknown;
  private renewal: Promise<void> | null = null;
  private tokenValue: string;
  private receiptValue: ExecutionTerminalProjectionLeaseReceipt;

  constructor(
    private readonly repository: ExecutionTerminalProjectionControlRepository,
    receipt: ExecutionTerminalProjectionLeaseReceipt,
    private readonly scope: ExecutionLeaseScope,
    private readonly leaseMs: number,
    private readonly heartbeatScheduler: ExecutionHeartbeatScheduler = defaultHeartbeatScheduler,
  ) {
    this.receiptValue = receipt;
    this.tokenValue = receipt.token;
  }

  get receipt(): ExecutionTerminalProjectionLeaseReceipt {
    return this.receiptValue;
  }

  get projection(): ExecutionTerminalProjection {
    return this.receiptValue.projection;
  }

  get token(): string {
    return this.tokenValue;
  }

  startHeartbeat(): void {
    if (this.timer !== undefined) return;
    const intervalMs = Math.max(1_000, Math.floor(this.leaseMs / 3));
    this.timer = this.heartbeatScheduler.setInterval(() => {
      void this.renew().catch(() => {
        this.markLost();
      });
    }, intervalMs);
  }

  /**
   * Abort product-side work as soon as this delivery can no longer prove
   * ownership. This remains cooperative: projectors must pass the signal to
   * local I/O and keep their sink idempotent by run id.
   */
  onLost(listener: (error: Error) => void): () => void {
    if (this.lost) {
      listener(this.lostError());
      return () => undefined;
    }
    this.lostListeners.add(listener);
    return () => this.lostListeners.delete(listener);
  }

  stopHeartbeat(): void {
    if (this.timer !== undefined) {
      this.heartbeatScheduler.clearInterval(this.timer);
    }
    this.timer = undefined;
  }

  async renew(): Promise<void> {
    if (this.lost) this.throwLost();
    if (this.renewal) return this.renewal;
    this.renewal = (async () => {
      const renewed = await this.repository.renewTerminalProjectionLease({
        ...this.scope,
        runId: this.projection.runId,
        token: this.tokenValue,
        leaseMs: this.leaseMs,
      });
      if (!renewed) {
        this.markLost();
        this.throwLost();
      }
      this.receiptValue = renewed;
      this.tokenValue = renewed.token;
    })().finally(() => {
      this.renewal = null;
    });
    return this.renewal;
  }

  async acknowledge(): Promise<ExecutionTerminalProjection | null> {
    await this.prepareTerminalMutation();
    const projection = await this.repository.acknowledgeTerminalProjection({
      ...this.scope,
      runId: this.projection.runId,
      token: this.tokenValue,
    });
    if (!projection) this.markLost();
    return projection;
  }

  async requeue(
    delayMs: number,
    errorCode: string,
  ): Promise<ExecutionTerminalProjection | null> {
    await this.prepareTerminalMutation();
    const projection = await this.repository.requeueTerminalProjection({
      ...this.scope,
      runId: this.projection.runId,
      token: this.tokenValue,
      delayMs,
      errorCode,
    });
    if (!projection) this.markLost();
    return projection;
  }

  async block(errorCode: string): Promise<ExecutionTerminalProjection | null> {
    await this.prepareTerminalMutation();
    const projection = await this.repository.blockTerminalProjection({
      ...this.scope,
      runId: this.projection.runId,
      token: this.tokenValue,
      errorCode,
    });
    if (!projection) this.markLost();
    return projection;
  }

  private lostError(): ExecutionTerminalProjectionLeaseLostError {
    return new ExecutionTerminalProjectionLeaseLostError(this.projection.runId);
  }

  private markLost(): void {
    if (this.lost) return;
    this.lost = true;
    const error = this.lostError();
    for (const listener of this.lostListeners) {
      try {
        listener(error);
      } catch {
        // Observability/cancellation hooks cannot change lease authority.
      }
    }
    this.lostListeners.clear();
  }

  private throwLost(): never {
    throw this.lostError();
  }

  private async prepareTerminalMutation(): Promise<void> {
    this.stopHeartbeat();
    if (this.renewal) await this.renewal;
    if (this.lost) this.throwLost();
  }
}
