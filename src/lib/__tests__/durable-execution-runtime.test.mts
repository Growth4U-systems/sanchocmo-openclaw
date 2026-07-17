import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  AppendExecutionEventInput,
  CheckpointExecutionRunInput,
  ClaimExecutionRunInput,
  ClaimNextExecutionRunInput,
  CreateExecutionRunInput,
  ExecutionControlRepository,
  ExecutionEvent,
  ExecutionLeaseReceipt,
  ExecutionLeaseScope,
  ExecutionRun,
  ExecutionScopedAggregateRef,
  ExecutionScopedRunRef,
  FinishExecutionRunInput,
  RequeueExecutionRunInput,
  RenewExecutionRunLeaseInput,
  TransitionExecutionRunInput,
} from "@/lib/execution-control";
import {
  DuplicateDurableExecutionHandlerError,
  DurableExecutionHandlerValidationError,
  DurableExecutionRegistry,
  UnknownDurableExecutionHandlerError,
} from "@/lib/durable-execution/registry";
import {
  DuplicateDurableExecutionWorkerError,
  DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION,
  DurableExecutionRuntimeShutdownError,
  DurableExecutionEngine,
  DurableExecutionRuntime,
  DurableExecutionWorker,
  DurableExecutionWorkerRestartError,
  durableExecutionEffectKey,
  type DurableExecutionContext,
  type DurableExecutionDeadlineScheduler,
  type DurableExecutionDrainPolicy,
  type DurableExecutionHandler,
  type DurableExecutionProjectionContext,
  type DurableExecutionReconciliationContext,
  type DurableExecutionScheduler,
} from "@/lib/durable-execution/runtime";
import {
  DEFAULT_DURABLE_EXECUTION_MAX_WORKERS,
  DurableExecutionWorkerCapacityError,
  DurableExecutionWorkerCapacityLimiter,
  isDurableExecutionWorkerCapacityError,
  MAX_DURABLE_EXECUTION_MAX_WORKERS,
  processDurableExecutionWorkerCapacityLimiter,
} from "@/lib/durable-execution/worker-capacity";

const scope: ExecutionLeaseScope = {
  tenantKey: "tenant-a",
  operation: "example.sync",
  mode: "canary",
};

function deferred<T = void>(): {
  promise: Promise<T>;
  resolve(value: T): void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

function run(overrides: Partial<ExecutionRun> = {}): ExecutionRun {
  return {
    id: "xrun-1",
    tenantKey: "tenant-a",
    idempotencyKey: "example:1",
    aggregateType: "example.record",
    aggregateId: "record-1",
    operation: "example.sync",
    mode: "canary",
    status: "running",
    input: { schemaVersion: 1, value: "hello" },
    metadata: { executionHandlerVersion: 1 },
    availableAt: "2026-07-16T10:00:00.000Z",
    leaseOwner: "worker-a",
    leaseExpiresAt: "2026-07-16T10:01:00.000Z",
    claimCount: 1,
    handlerAttempt: 0,
    createdAt: "2026-07-16T10:00:00.000Z",
    startedAt: "2026-07-16T10:00:01.000Z",
    updatedAt: "2026-07-16T10:00:01.000Z",
    ...overrides,
  };
}

function receipt(
  value = run(),
  token = "opaque-lease-token",
): ExecutionLeaseReceipt {
  return {
    run: value,
    token,
    expiresAt: "2026-07-16T10:01:00.000Z",
    recovered: false,
  };
}

class FakeRepository implements ExecutionControlRepository {
  receipts: ExecutionLeaseReceipt[] = [];
  runs = new Map<string, ExecutionRun>();
  claims: ClaimNextExecutionRunInput[] = [];
  explicitClaims: ClaimExecutionRunInput[] = [];
  scopedRunIdReads: ExecutionScopedRunRef[] = [];
  checkpoints: CheckpointExecutionRunInput[] = [];
  renewals: RenewExecutionRunLeaseInput[] = [];
  requeues: RequeueExecutionRunInput[] = [];
  finishes: FinishExecutionRunInput[] = [];
  recordedEvents: ExecutionEvent[] = [];
  eventListReads = 0;
  order: string[] = [];
  loseCheckpoint = false;
  loseFinish = false;
  failClaims: unknown = null;

  enqueue(value: ExecutionLeaseReceipt): void {
    this.receipts.push(value);
    this.runs.set(value.run.id, value.run);
  }

  async createRun(_input: CreateExecutionRunInput) {
    throw new Error("not implemented in runtime fake");
  }
  async appendEvent(input: AppendExecutionEventInput): Promise<ExecutionEvent> {
    return {
      sequence: 1,
      id: "event-1",
      runId: input.runId,
      aggregateType: "example.record",
      aggregateId: "record-1",
      type: input.type,
      ts: "2026-07-16T10:00:00.000Z",
      data: input.data,
    };
  }
  async transitionRun(
    runId: string,
    input: TransitionExecutionRunInput,
  ): Promise<ExecutionRun> {
    const current = this.runs.get(runId);
    if (!current) throw new Error("run missing");
    const next = { ...current, status: input.status };
    this.runs.set(runId, next);
    return next;
  }
  async getRunById(runId: string): Promise<ExecutionRun | null> {
    return this.runs.get(runId) ?? null;
  }
  async getRunByIdForScope(
    input: ExecutionScopedRunRef,
  ): Promise<ExecutionRun | null> {
    this.scopedRunIdReads.push(input);
    const candidate = this.runs.get(input.runId);
    const tenantKey = input.tenantKey.trim().toLowerCase();
    if (
      !candidate ||
      candidate.tenantKey !== tenantKey ||
      candidate.operation !== input.operation ||
      candidate.mode !== input.mode
    ) {
      return null;
    }
    return candidate;
  }
  async getRunByAggregate(): Promise<ExecutionRun | null> {
    return [...this.runs.values()][0] ?? null;
  }
  async getRunByAggregateForScope(
    input: ExecutionScopedAggregateRef,
  ): Promise<ExecutionRun | null> {
    const tenantKey = input.tenantKey.trim().toLowerCase();
    return (
      [...this.runs.values()]
        .filter(
          (candidate) =>
            candidate.tenantKey === tenantKey &&
            candidate.operation === input.operation &&
            candidate.mode === input.mode &&
            candidate.aggregateType === input.aggregateType &&
            candidate.aggregateId === input.aggregateId,
        )
        .sort(
          (left, right) =>
            right.createdAt.localeCompare(left.createdAt) ||
            right.id.localeCompare(left.id),
        )[0] ?? null
    );
  }
  async listEvents(): Promise<ExecutionEvent[]> {
    this.eventListReads += 1;
    return this.recordedEvents;
  }
  async claimRun(
    input: ClaimExecutionRunInput,
  ): Promise<ExecutionLeaseReceipt | null> {
    this.explicitClaims.push(input);
    if (this.failClaims) throw this.failClaims;
    return this.receipts.shift() ?? null;
  }
  async claimNextRun(
    input: ClaimNextExecutionRunInput,
  ): Promise<ExecutionLeaseReceipt | null> {
    this.claims.push(input);
    if (this.failClaims) throw this.failClaims;
    return this.receipts.shift() ?? null;
  }
  async renewRunLease(
    input: RenewExecutionRunLeaseInput,
  ): Promise<ExecutionLeaseReceipt | null> {
    this.renewals.push(input);
    const current = this.runs.get(input.runId);
    return current
      ? {
          run: current,
          token: input.token,
          expiresAt: "2026-07-16T10:02:00.000Z",
          recovered: false,
        }
      : null;
  }
  async checkpointRun(
    input: CheckpointExecutionRunInput,
  ): Promise<ExecutionRun | null> {
    this.checkpoints.push(input);
    this.order.push(`checkpoint:${input.currentStep}`);
    this.recordedEvents.push({
      sequence: this.recordedEvents.length + 1,
      id: `event-${this.recordedEvents.length + 1}`,
      runId: input.runId,
      aggregateType: "example.record",
      aggregateId: "record-1",
      type: input.eventType,
      ts: "2026-07-16T10:00:00.000Z",
      data: input.eventData,
    });
    if (this.loseCheckpoint) return null;
    const current = this.runs.get(input.runId);
    if (!current) return null;
    const checkpointed: ExecutionRun = {
      ...current,
      currentStep: input.currentStep,
      ...(input.incrementHandlerAttempt
        ? { handlerAttempt: current.handlerAttempt + 1 }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(input, "output")
        ? { output: input.output }
        : {}),
    };
    this.runs.set(input.runId, checkpointed);
    return checkpointed;
  }
  async requeueRun(
    input: RequeueExecutionRunInput,
  ): Promise<ExecutionRun | null> {
    this.requeues.push(input);
    this.order.push("requeue");
    const current = this.runs.get(input.runId);
    if (!current) return null;
    const queued = {
      ...current,
      status: "queued" as const,
      availableAt: input.availableAt.toISOString(),
    };
    this.runs.set(input.runId, queued);
    return queued;
  }
  async finishRun(
    input: FinishExecutionRunInput,
  ): Promise<ExecutionRun | null> {
    this.finishes.push(input);
    this.order.push("finish");
    if (this.loseFinish) return null;
    const current = this.runs.get(input.runId);
    if (!current) return null;
    const finished = {
      ...current,
      status: input.status,
      currentStep: input.currentStep ?? undefined,
      output: input.output,
      error: input.error ?? undefined,
      finishedAt: "2026-07-16T10:00:20.000Z",
      updatedAt: "2026-07-16T10:00:20.000Z",
    };
    this.runs.set(input.runId, finished);
    return finished;
  }
}

interface HandlerControls {
  executions: number;
  projections: number;
  reconciliations: number;
  effectKeys: string[];
  contexts: DurableExecutionContext[];
  throwExecute?: unknown;
  throwProjection?: unknown;
  throwReconcile?: unknown;
  beforeExecute?: (context: DurableExecutionContext) => Promise<void>;
}

function controls(): HandlerControls {
  return {
    executions: 0,
    projections: 0,
    reconciliations: 0,
    effectKeys: [],
    contexts: [],
  };
}

function handler(
  state: HandlerControls,
  version = 1,
): DurableExecutionHandler<{ value: string }, { result: string }> {
  return {
    contractVersion: DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION,
    operation: "example.sync",
    version,
    decode(value) {
      const input = value.input as { value?: unknown };
      if (typeof input?.value !== "string") throw new Error("invalid input");
      return { value: input.value };
    },
    async execute(command, context) {
      state.executions += 1;
      state.contexts.push(context);
      state.effectKeys.push(context.effectKey("provider.write"));
      state.effectKeys.push(context.effectKey("provider.write"));
      await context.checkpoint("provider", {
        eventData: { value: command.value },
      });
      await state.beforeExecute?.(context);
      if (state.throwExecute) throw state.throwExecute;
      return {
        currentStep: "verify",
        output: { result: command.value },
      };
    },
    classifyError(error, context) {
      return {
        code: context.phase === "decode" ? "invalid_input" : "provider_timeout",
        retryable: context.phase === "execute",
        message: error instanceof Error ? error.message : "failed",
      };
    },
    projectTerminal() {
      state.projections += 1;
      if (state.throwProjection) throw state.throwProjection;
    },
    async reconcileTerminal() {
      state.reconciliations += 1;
      if (state.throwReconcile) throw state.throwReconcile;
      return 1;
    },
  };
}

function engine(
  repository: FakeRepository,
  registered: DurableExecutionHandler,
  overrides: Partial<{
    maxAttempts: number;
    now: () => Date;
    heartbeatScheduler: DurableExecutionScheduler;
    deadlineScheduler: DurableExecutionDeadlineScheduler;
    drainPolicy: DurableExecutionDrainPolicy;
    handlerTimeoutMs: number;
  }> = {},
): DurableExecutionEngine {
  return new DurableExecutionEngine({
    repository,
    registry: new DurableExecutionRegistry().register(registered),
    scope,
    workerId: "worker-test",
    leaseMs: 5_000,
    maxAttempts: overrides.maxAttempts ?? 3,
    now: overrides.now,
    heartbeatScheduler: overrides.heartbeatScheduler,
    deadlineScheduler: overrides.deadlineScheduler,
    drainPolicy: overrides.drainPolicy,
    handlerTimeoutMs: overrides.handlerTimeoutMs,
  });
}

class FakeScheduler implements DurableExecutionScheduler {
  intervals: Array<() => void> = [];
  microtasks: Array<() => void> = [];
  cleared = 0;

  setInterval(callback: () => void): unknown {
    this.intervals.push(callback);
    return callback;
  }
  clearInterval(): void {
    this.cleared += 1;
  }
  queueMicrotask(callback: () => void): void {
    this.microtasks.push(callback);
  }
}

class FakeDeadlineScheduler implements DurableExecutionDeadlineScheduler {
  timeouts: Array<() => void> = [];
  cleared = 0;

  setTimeout(callback: () => void): unknown {
    this.timeouts.push(callback);
    return callback;
  }
  clearTimeout(): void {
    this.cleared += 1;
  }
}

test("versioned registry rejects duplicate and unknown handlers", () => {
  const state = controls();
  const registry = new DurableExecutionRegistry()
    .register(handler(state, 1))
    .register(handler(state, 2));

  assert.deepEqual(registry.descriptors(), [
    { operation: "example.sync", version: 1 },
    { operation: "example.sync", version: 2 },
  ]);
  assert.equal(registry.require("example.sync", 2).version, 2);
  assert.throws(
    () => registry.register(handler(state, 1)),
    DuplicateDurableExecutionHandlerError,
  );
  assert.throws(
    () => registry.require("unknown.operation", 1),
    UnknownDurableExecutionHandlerError,
  );
  assert.throws(
    () => registry.require("example.sync", 3),
    UnknownDurableExecutionHandlerError,
  );
  assert.throws(
    () =>
      registry.register({
        ...handler(state, 3),
        contractVersion: 2,
      } as unknown as DurableExecutionHandler),
    DurableExecutionHandlerValidationError,
  );
});

test("independent product adapters such as partnerships and leads share the generic registry", () => {
  const state = controls();
  const base = handler(state, 1);
  const registry = new DurableExecutionRegistry()
    .register({ ...base, operation: "partnerships.discovery" })
    .register({ ...base, operation: "leads.discovery" });

  assert.deepEqual(registry.descriptors(), [
    { operation: "leads.discovery", version: 1 },
    { operation: "partnerships.discovery", version: 1 },
  ]);
  assert.equal(
    registry.require("leads.discovery", 1).operation,
    "leads.discovery",
  );
});

test("engine claims exact scope, fences checkpoints and projects only after finish", async () => {
  const repository = new FakeRepository();
  repository.enqueue(receipt());
  const state = controls();

  const outcome = await engine(repository, handler(state)).processNext();

  assert.equal(outcome.kind, "completed");
  assert.deepEqual(repository.claims[0], {
    ...scope,
    workerId: "worker-test",
    leaseMs: 5_000,
  });
  assert.deepEqual(repository.order, [
    "checkpoint:claimed",
    "checkpoint:provider",
    "finish",
  ]);
  assert.deepEqual(repository.checkpoints[0]?.eventData, {
    handlerContractVersion: DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION,
    handlerVersion: 1,
    recovered: false,
    attempt: 1,
  });
  assert.equal(state.projections, 1);
  assert.equal(
    state.contexts[0]?.contractVersion,
    DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION,
  );
  assert.equal(state.contexts[0]?.signal.aborted, false);
  assert.ok(Number.isFinite(Date.parse(state.contexts[0]?.deadlineAt ?? "")));
  assert.equal(repository.finishes[0].token, "opaque-lease-token");
  assert.equal(state.effectKeys[0], state.effectKeys[1]);
  assert.equal(
    state.effectKeys[0],
    durableExecutionEffectKey({
      operation: "example.sync",
      runId: "xrun-1",
      handlerVersion: 1,
      step: "provider.write",
    }),
  );
  assert.notEqual(
    state.effectKeys[0],
    durableExecutionEffectKey({
      operation: "example.sync",
      runId: "xrun-1",
      handlerVersion: 1,
      step: "provider.read",
    }),
  );
});

test("drain policy false or throwing fails closed before any claim", async () => {
  for (const mayDrain of [
    () => false,
    () => {
      throw new Error("authority lookup unavailable");
    },
  ]) {
    const repository = new FakeRepository();
    repository.enqueue(receipt());
    const state = controls();
    const outcome = await engine(repository, handler(state), {
      drainPolicy: { mayDrain },
    }).processNext();

    assert.deepEqual(outcome, { kind: "idle" });
    assert.equal(repository.claims.length, 0);
    assert.equal(repository.requeues.length, 0);
    assert.equal(state.executions, 0);
  }
});

test("drain policy revalidates after an async claim and fenced-requeues the same receipt", async () => {
  const repository = new FakeRepository();
  repository.enqueue(receipt());
  const state = controls();
  let allowed = true;
  const claimEntered = deferred<void>();
  const releaseClaim = deferred<void>();
  let delayFirstClaim = true;
  repository.claimNextRun = async (input) => {
    repository.claims.push(input);
    if (delayFirstClaim) {
      delayFirstClaim = false;
      claimEntered.resolve(undefined);
      await releaseClaim.promise;
    }
    return repository.receipts.shift() ?? null;
  };
  const durableEngine = engine(repository, handler(state), {
    drainPolicy: { mayDrain: () => allowed },
    now: () => new Date("2026-07-16T10:00:10.000Z"),
  });

  const pending = durableEngine.processNext();
  await claimEntered.promise;
  allowed = false;
  releaseClaim.resolve(undefined);
  assert.deepEqual(await pending, { kind: "requeued", runId: "xrun-1" });
  assert.equal(state.executions, 0);
  assert.equal(repository.checkpoints.length, 0);
  assert.equal(repository.finishes.length, 0);
  assert.equal(repository.requeues.length, 1);
  assert.equal(repository.requeues[0]?.runId, "xrun-1");
  assert.equal(
    repository.requeues[0]?.currentStep,
    "awaiting_runtime_authority",
  );

  const queued = repository.runs.get("xrun-1")!;
  repository.enqueue(
    receipt(
      {
        ...queued,
        status: "running",
        claimCount: queued.claimCount + 1,
        leaseOwner: "worker-test",
        leaseExpiresAt: "2026-07-16T10:02:00.000Z",
        updatedAt: "2026-07-16T10:00:11.000Z",
      },
      "opaque-recovered-token",
    ),
  );
  allowed = true;
  const recovered = await durableEngine.processNext();
  assert.deepEqual(recovered, { kind: "completed", runId: "xrun-1" });
  assert.equal(state.executions, 1);
  assert.equal(repository.finishes.length, 1);
  assert.equal(repository.finishes[0]?.token, "opaque-recovered-token");
});

test("a suspended worker does not hot-loop and explicit shutdown remains abort authority", async () => {
  const repository = new FakeRepository();
  repository.enqueue(receipt());
  const scheduler = new FakeScheduler();
  const state = controls();
  const durableWorker = new DurableExecutionWorker({
    repository,
    registry: new DurableExecutionRegistry().register(handler(state)),
    scope,
    workerId: "worker-suspended",
    leaseMs: 5_000,
    pollMs: 60_000,
    maxAttempts: 3,
    drainPolicy: { mayDrain: () => false },
    scheduler,
  });

  durableWorker.start();
  await durableWorker.poll();
  assert.equal(durableWorker.readiness().counters.polls, 1);
  assert.equal(repository.claims.length, 0);
  assert.equal(state.executions, 0);

  await durableWorker.stop();
  assert.equal(durableWorker.readiness().state, "stopped");
  assert.equal(scheduler.cleared, 1);
});

test("engine processes one explicit run through an exact scoped claim", async () => {
  const repository = new FakeRepository();
  repository.enqueue(receipt());
  const state = controls();

  const outcome = await engine(repository, handler(state)).processRun(
    "  xrun-1  ",
  );

  assert.equal(outcome.kind, "completed");
  assert.deepEqual(repository.explicitClaims, [
    {
      ...scope,
      runId: "xrun-1",
      workerId: "worker-test",
      leaseMs: 5_000,
    },
  ]);
  assert.equal(repository.claims.length, 0);
  assert.equal(state.executions, 1);
});

test("engine explicit processing is idle when another owner holds the run", async () => {
  const repository = new FakeRepository();
  const outcome = await engine(repository, handler(controls())).processRun(
    "xrun-busy",
  );

  assert.deepEqual(outcome, { kind: "idle", runId: "xrun-busy" });
  assert.equal(repository.explicitClaims[0].runId, "xrun-busy");
  await assert.rejects(
    engine(repository, handler(controls())).processRun(" "),
    /runId cannot be empty/,
  );
});

test("engine heartbeats an in-flight handler and clears the timer on finish", async () => {
  const repository = new FakeRepository();
  repository.enqueue(receipt());
  const scheduler = new FakeScheduler();
  const state = controls();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  state.beforeExecute = () => gate;

  const pending = engine(repository, handler(state), {
    heartbeatScheduler: scheduler,
  }).processNext();
  while (state.executions === 0) await Promise.resolve();

  assert.equal(scheduler.intervals.length, 1);
  scheduler.intervals[0]();
  while (repository.renewals.length === 0) await Promise.resolve();
  release();
  const outcome = await pending;

  assert.equal(outcome.kind, "completed");
  assert.ok(repository.renewals.length >= 2);
  assert.equal(scheduler.cleared, 1);
});

test("handler contract deadline aborts an infinite execute and releases the drain", async () => {
  const repository = new FakeRepository();
  repository.enqueue(receipt(run({ updatedAt: "2026-07-16T10:00:00.000Z" })));
  const state = controls();
  const deadlineScheduler = new FakeDeadlineScheduler();
  state.beforeExecute = async () => new Promise<void>(() => {});

  const pending = engine(repository, handler(state), {
    now: () => new Date("2026-07-16T10:00:00.000Z"),
    handlerTimeoutMs: 1_000,
    deadlineScheduler,
  }).processNext();
  while (state.executions === 0) await Promise.resolve();

  assert.equal(state.contexts[0]?.signal.aborted, false);
  assert.equal(state.contexts[0]?.deadlineAt, "2026-07-16T10:00:01.000Z");
  deadlineScheduler.timeouts[0]?.();
  const outcome = await pending;

  assert.equal(outcome.kind, "requeued");
  assert.equal(state.contexts[0]?.signal.aborted, true);
  assert.equal(repository.requeues.length, 1);
  assert.deepEqual(repository.requeues[0]?.eventData, {
    errorCode: "durable_execution_deadline_exceeded",
    delayMs: 1_000,
  });
  assert.equal(deadlineScheduler.cleared, 1);
});

test("projection deadline leaves the terminal run repairable and cannot block drain", async () => {
  const repository = new FakeRepository();
  repository.enqueue(receipt());
  const state = controls();
  const deadlineScheduler = new FakeDeadlineScheduler();
  let projectionContext: DurableExecutionProjectionContext | undefined;
  const registered: DurableExecutionHandler = {
    ...handler(state),
    projectTerminal(_run, _command, context) {
      state.projections += 1;
      projectionContext = context;
      return new Promise<void>(() => {});
    },
  };

  const pending = engine(repository, registered, {
    now: () => new Date("2026-07-16T10:00:00.000Z"),
    handlerTimeoutMs: 1_000,
    deadlineScheduler,
  }).processNext();
  while (state.projections === 0) await Promise.resolve();

  assert.equal(projectionContext?.signal.aborted, false);
  assert.equal(projectionContext?.deadlineAt, "2026-07-16T10:00:01.000Z");
  deadlineScheduler.timeouts.at(-1)?.();
  const outcome = await pending;

  assert.equal(outcome.kind, "projection_pending");
  assert.equal(repository.runs.get("xrun-1")?.status, "completed");
  assert.equal(projectionContext?.signal.aborted, true);
  assert.equal(repository.requeues.length, 0);
});

test("terminal reconciliation has the same bounded signal contract", async () => {
  const repository = new FakeRepository();
  const state = controls();
  const deadlineScheduler = new FakeDeadlineScheduler();
  let reconciliationContext: DurableExecutionReconciliationContext | undefined;
  const registered: DurableExecutionHandler = {
    ...handler(state),
    reconcileTerminal(_scope, context) {
      state.reconciliations += 1;
      reconciliationContext = context;
      return new Promise<number>(() => {});
    },
  };
  const durableEngine = engine(repository, registered, {
    now: () => new Date("2026-07-16T10:00:00.000Z"),
    handlerTimeoutMs: 1_000,
    deadlineScheduler,
  });

  const pending = durableEngine.reconcileTerminal();
  while (state.reconciliations === 0) await Promise.resolve();
  assert.equal(reconciliationContext?.signal.aborted, false);
  deadlineScheduler.timeouts.at(-1)?.();
  await assert.rejects(pending, /exceeded its bounded deadline/);
  assert.equal(reconciliationContext?.signal.aborted, true);
});

test("two engines sharing a repository execute one claimed command once", async () => {
  const repository = new FakeRepository();
  repository.enqueue(receipt());
  const state = controls();
  const registered = handler(state);

  const outcomes = await Promise.all([
    engine(repository, registered).processNext(),
    engine(repository, registered).processNext(),
  ]);

  assert.deepEqual(outcomes.map((outcome) => outcome.kind).sort(), [
    "completed",
    "idle",
  ]);
  assert.equal(state.executions, 1);
});

test("old worker requeues an unknown handler version without destroying it", async () => {
  const repository = new FakeRepository();
  const futureRun = run({
    input: { schemaVersion: 2, value: "future" },
    metadata: { executionHandlerVersion: 2 },
    updatedAt: "2026-07-16T10:00:10.000Z",
  });
  repository.enqueue(receipt(futureRun));
  const oldState = controls();
  const now = () => new Date("2026-07-16T10:00:10.000Z");

  const deferred = await engine(repository, handler(oldState, 1), {
    now,
  }).processNext();

  assert.equal(deferred.kind, "handler_unavailable");
  assert.equal(oldState.executions, 0);
  assert.equal(repository.finishes.length, 0);
  assert.equal(repository.requeues.length, 1);
  assert.equal(repository.runs.get(futureRun.id)?.status, "queued");
  assert.equal(
    repository.requeues[0].availableAt.toISOString(),
    "2026-07-16T10:01:10.000Z",
  );

  const compatibleRun = {
    ...repository.runs.get(futureRun.id)!,
    status: "running" as const,
    claimCount: 2,
  };
  repository.enqueue(receipt(compatibleRun, "new-worker-token"));
  const newState = controls();
  const completed = await engine(
    repository,
    handler(newState, 2),
  ).processNext();
  assert.equal(completed.kind, "completed");
  assert.equal(newState.executions, 1);
});

test("lost lease aborts before effects, finish, retry and projection", async () => {
  const repository = new FakeRepository();
  repository.enqueue(receipt(run({ updatedAt: "2026-07-16T10:00:10.000Z" })));
  repository.loseCheckpoint = true;
  const state = controls();

  const outcome = await engine(repository, handler(state)).processNext();

  assert.equal(outcome.kind, "lease_lost");
  assert.equal(state.executions, 0);
  assert.equal(state.projections, 0);
  assert.equal(repository.finishes.length, 0);
  assert.equal(repository.requeues.length, 0);
});

test("lost terminal fence cannot project a completed effect", async () => {
  const repository = new FakeRepository();
  repository.enqueue(receipt());
  repository.loseFinish = true;
  const state = controls();

  const outcome = await engine(repository, handler(state)).processNext();

  assert.equal(outcome.kind, "lease_lost");
  assert.equal(state.executions, 1);
  assert.equal(state.projections, 0);
  assert.equal(repository.requeues.length, 0);
});

test("retry is fenced, delayed and never writes a terminal projection", async () => {
  const repository = new FakeRepository();
  repository.enqueue(receipt(run({ updatedAt: "2026-07-16T10:00:10.000Z" })));
  const state = controls();
  state.throwExecute = new Error("provider timeout");
  const now = () => new Date("2026-07-16T10:00:10.000Z");

  const outcome = await engine(repository, handler(state), {
    now,
  }).processNext();

  assert.equal(outcome.kind, "requeued");
  assert.equal(repository.requeues.length, 1);
  assert.equal(
    repository.requeues[0].availableAt.toISOString(),
    "2026-07-16T10:00:11.000Z",
  );
  assert.equal(repository.requeues[0].token, "opaque-lease-token");
  assert.equal(state.projections, 0);
  assert.equal(repository.order.at(-1), "requeue");
});

test("invalid decoded command fails terminally before product execution", async () => {
  const repository = new FakeRepository();
  repository.enqueue(
    receipt(run({ input: { schemaVersion: 1, value: null } })),
  );
  const state = controls();

  const outcome = await engine(repository, handler(state)).processNext();

  assert.equal(outcome.kind, "failed");
  assert.equal(state.executions, 0);
  assert.equal(state.projections, 0);
  assert.equal(repository.requeues.length, 0);
  assert.equal(repository.finishes[0].status, "failed");
  assert.deepEqual(repository.finishes[0].output, {
    errorCode: "invalid_input",
  });
});

test("retry budget counts persisted effect-bearing handler attempts, then terminalizes", async () => {
  const repository = new FakeRepository();
  repository.enqueue(receipt(run({ claimCount: 7, handlerAttempt: 2 })));
  const state = controls();
  state.throwExecute = new Error("provider still unavailable");

  const outcome = await engine(repository, handler(state), {
    maxAttempts: 3,
  }).processNext();

  assert.equal(outcome.kind, "failed");
  assert.equal(repository.requeues.length, 0);
  assert.equal(repository.finishes[0].status, "failed");
  assert.equal(state.projections, 1);
});

test("explicit durable exhaustion keeps dependency work queued until operator cancellation", async () => {
  const repository = new FakeRepository();
  repository.enqueue(receipt(run({ handlerAttempt: 5 })));
  const state = controls();
  state.throwExecute = new Error("dependency unavailable");
  const durableHandler = handler(state);
  durableHandler.classifyError = (error) => ({
    code: "dependency_unavailable",
    retryable: true,
    exhaustion: "retry_until_cancelled",
    message: error instanceof Error ? error.message : "unavailable",
  });

  const outcome = await engine(repository, durableHandler, {
    maxAttempts: 1,
  }).processNext();

  assert.equal(outcome.kind, "requeued");
  assert.equal(repository.requeues.length, 1);
  assert.equal(repository.finishes.length, 0);
  assert.deepEqual(repository.runs.get("xrun-1")?.output, undefined);
  assert.equal(repository.eventListReads, 0);
  assert.equal(repository.runs.get("xrun-1")?.handlerAttempt, 6);

  const cancelled = await repository.transitionRun("xrun-1", {
    status: "cancelled",
    expectedStatus: "queued",
  });
  assert.equal(cancelled.status, "cancelled");
});

test("terminal projector failure stays terminal and reconciles without repeating effect", async () => {
  const repository = new FakeRepository();
  repository.enqueue(receipt());
  const state = controls();
  state.throwProjection = new Error("projection storage unavailable");
  const registered = handler(state);
  const durableEngine = engine(repository, registered);

  const outcome = await durableEngine.processNext();
  assert.equal(outcome.kind, "projection_pending");
  assert.equal(repository.runs.get("xrun-1")?.status, "completed");
  assert.equal(repository.requeues.length, 0);
  assert.equal(state.executions, 1);

  state.throwProjection = undefined;
  assert.equal(await durableEngine.reconcileTerminal(), 1);
  assert.equal(state.executions, 1);
  assert.equal(state.reconciliations, 1);
});

test("reconciliation aggregate reads stay inside tenant, operation and mode", async () => {
  const repository = new FakeRepository();
  const aggregate = {
    aggregateType: "example.record",
    aggregateId: "shared-record",
  };
  const candidates = [
    run({
      id: "xrun-shadow",
      ...aggregate,
      mode: "shadow",
      createdAt: "2026-07-16T10:02:00.000Z",
    }),
    run({
      id: "xrun-canary",
      ...aggregate,
      mode: "canary",
      createdAt: "2026-07-16T10:00:00.000Z",
    }),
    run({
      id: "xrun-active",
      ...aggregate,
      mode: "active",
      createdAt: "2026-07-16T10:03:00.000Z",
    }),
  ];
  for (const candidate of candidates) {
    repository.runs.set(candidate.id, candidate);
  }

  let reconciledRun: ExecutionRun | null = null;
  const state = controls();
  const registered: DurableExecutionHandler = {
    ...handler(state),
    async reconcileTerminal(_scope, context) {
      reconciledRun = await context.getRunByAggregate(aggregate);
      return reconciledRun ? 1 : 0;
    },
  };

  assert.equal(await engine(repository, registered).reconcileTerminal(), 1);
  assert.equal(reconciledRun?.id, "xrun-canary");
});

test("reconciliation run-id reads reject wrong tenant, operation and mode", async () => {
  const repository = new FakeRepository();
  const target = run({ id: "xrun-scoped" });
  repository.runs.set(target.id, target);

  async function lookup(testScope: ExecutionLeaseScope) {
    let selected: ExecutionRun | null = null;
    const state = controls();
    const registered: DurableExecutionHandler = {
      ...handler(state),
      operation: testScope.operation,
      async reconcileTerminal(_scope, context) {
        selected = await context.getRunById(target.id);
        return 0;
      },
    };
    const durableEngine = new DurableExecutionEngine({
      repository,
      registry: new DurableExecutionRegistry().register(registered),
      scope: testScope,
      workerId: "worker-scoped-read",
      leaseMs: 5_000,
      maxAttempts: 3,
    });
    await durableEngine.reconcileTerminal();
    return selected;
  }

  assert.equal((await lookup(scope))?.id, target.id);
  assert.equal(await lookup({ ...scope, tenantKey: "tenant-b" }), null);
  assert.equal(await lookup({ ...scope, operation: "different.sync" }), null);
  assert.equal(await lookup({ ...scope, mode: "active" }), null);
  assert.deepEqual(repository.scopedRunIdReads, [
    { ...scope, runId: target.id },
    { ...scope, tenantKey: "tenant-b", runId: target.id },
    { ...scope, operation: "different.sync", runId: target.id },
    { ...scope, mode: "active", runId: target.id },
  ]);
});

test("reconciliation run-id reads fail closed without the scoped capability", async () => {
  const repository = new FakeRepository();
  Object.defineProperty(repository, "getRunByIdForScope", {
    value: undefined,
  });
  const state = controls();
  const registered: DurableExecutionHandler = {
    ...handler(state),
    async reconcileTerminal(_scope, context) {
      await context.getRunById("xrun-scoped");
      return 0;
    },
  };

  await assert.rejects(
    engine(repository, registered).reconcileTerminal(),
    /requires exact-scope run reads/,
  );
});

test("runtime rejects duplicate exact-scope workers", async () => {
  const repository = new FakeRepository();
  const scheduler = new FakeScheduler();
  const state = controls();
  const runtime = new DurableExecutionRuntime({
    repository,
    registry: new DurableExecutionRegistry().register(handler(state)),
    scheduler,
  });

  runtime.startWorker(scope);
  assert.throws(
    () => runtime.startWorker(scope),
    DuplicateDurableExecutionWorkerError,
  );
  const shutdown = runtime.shutdown();
  assert.throws(
    () => runtime.startWorker({ ...scope, tenantKey: "tenant-after-stop" }),
    DurableExecutionRuntimeShutdownError,
  );
  assert.equal(runtime.wake(scope), false);
  await shutdown;
  assert.throws(
    () => runtime.startWorker({ ...scope, tenantKey: "tenant-after-stop" }),
    DurableExecutionRuntimeShutdownError,
  );
  for (const lateWake of scheduler.microtasks) lateWake();
  await Promise.resolve();
  assert.equal(repository.claims.length, 0);
});

test("worker capacity defaults to one process-shared 32-slot authority and rejects invalid bounds", () => {
  const shared = processDurableExecutionWorkerCapacityLimiter();
  assert.strictEqual(shared, processDurableExecutionWorkerCapacityLimiter());
  assert.equal(shared.maxWorkers, DEFAULT_DURABLE_EXECUTION_MAX_WORKERS);
  assert.equal(new DurableExecutionWorkerCapacityLimiter().maxWorkers, 32);
  assert.equal(
    new DurableExecutionWorkerCapacityLimiter(MAX_DURABLE_EXECUTION_MAX_WORKERS)
      .maxWorkers,
    256,
  );
  for (const invalid of [0, -1, 1.5, 257, Number.NaN, Infinity]) {
    assert.throws(
      () => new DurableExecutionWorkerCapacityLimiter(invalid),
      /maxWorkers must be an integer from 1 to 256/,
    );
  }
});

test("default capacity is effectively shared across independent runtimes in one process", async () => {
  const shared = processDurableExecutionWorkerCapacityLimiter();
  assert.equal(shared.report().occupiedWorkers, 0);
  const repository = new FakeRepository();
  const scheduler = new FakeScheduler();
  const registered = new DurableExecutionRegistry().register(
    handler(controls()),
  );
  const runtimeA = new DurableExecutionRuntime({
    repository,
    registry: registered,
    scheduler,
    workerIdPrefix: "shared-a",
  });
  const runtimeB = new DurableExecutionRuntime({
    repository,
    registry: registered,
    scheduler,
    workerIdPrefix: "shared-b",
  });

  try {
    for (let index = 0; index < 16; index += 1) {
      runtimeA.startWorker({
        ...scope,
        tenantKey: `tenant-a-${String(index).padStart(2, "0")}`,
      });
      runtimeB.startWorker({
        ...scope,
        tenantKey: `tenant-b-${String(index).padStart(2, "0")}`,
      });
    }
    assert.equal(shared.report().occupiedWorkers, 32);
    assert.equal(scheduler.intervals.length, 32);
    assert.throws(
      () =>
        runtimeB.startWorker({
          ...scope,
          tenantKey: "tenant-over-process-cap",
        }),
      isDurableExecutionWorkerCapacityError,
    );
    assert.equal(scheduler.intervals.length, 32);
  } finally {
    await Promise.all([runtimeA.shutdown(), runtimeB.shutdown()]);
  }
  assert.equal(shared.report().occupiedWorkers, 0);
});

test("default runtimes reserve one process slot for the same exact scope", async () => {
  const shared = processDurableExecutionWorkerCapacityLimiter();
  assert.equal(shared.report().occupiedWorkers, 0);
  assert.equal(shared.report().pendingDemands, 0);
  const repository = new FakeRepository();
  const scheduler = new FakeScheduler();
  const registered = new DurableExecutionRegistry().register(
    handler(controls()),
  );
  const runtimeA = new DurableExecutionRuntime({
    repository,
    registry: registered,
    scheduler,
    workerIdPrefix: "same-scope-a",
  });
  const runtimeB = new DurableExecutionRuntime({
    repository,
    registry: registered,
    scheduler,
    workerIdPrefix: "same-scope-b",
  });

  try {
    runtimeA.startWorker(scope);
    assert.throws(
      () => runtimeB.startWorker({ ...scope }),
      DuplicateDurableExecutionWorkerError,
    );
    assert.equal(shared.report().occupiedWorkers, 1);
    assert.equal(shared.report().pendingDemands, 0);
    assert.equal(scheduler.intervals.length, 1);
  } finally {
    await Promise.all([runtimeA.shutdown(), runtimeB.shutdown()]);
  }
  assert.equal(shared.report().occupiedWorkers, 0);
  assert.equal(shared.report().pendingDemands, 0);
});

test("two runtimes share one limiter and never create a worker or timer past capacity", async () => {
  const limiter = new DurableExecutionWorkerCapacityLimiter(2);
  const repository = new FakeRepository();
  const scheduler = new FakeScheduler();
  const registered = new DurableExecutionRegistry().register(
    handler(controls()),
  );
  const runtimeA = new DurableExecutionRuntime({
    repository,
    registry: registered,
    scheduler,
    capacityLimiter: limiter,
    workerIdPrefix: "runtime-a",
  });
  const runtimeB = new DurableExecutionRuntime({
    repository,
    registry: registered,
    scheduler,
    capacityLimiter: limiter,
    workerIdPrefix: "runtime-b",
  });
  const scopeB = { ...scope, tenantKey: "tenant-b" };
  const scopeC = { ...scope, tenantKey: "tenant-c" };

  try {
    runtimeA.startWorker(scope);
    runtimeB.startWorker(scopeB);
    assert.deepEqual(limiter.report(), {
      maxWorkers: 2,
      activeWorkers: 2,
      stoppingWorkers: 0,
      occupiedWorkers: 2,
      availableSlots: 0,
      pendingDemands: 0,
      fairnessYieldInProgress: false,
    });
    assert.equal(scheduler.intervals.length, 2);
    assert.throws(
      () => runtimeA.startWorker(scopeC),
      (error: unknown) =>
        error instanceof DurableExecutionWorkerCapacityError &&
        error.code === "durable_execution_worker_capacity_deferred",
    );
    assert.equal(runtimeA.readiness().length, 1);
    assert.equal(runtimeB.readiness().length, 1);
    assert.equal(scheduler.intervals.length, 2);
  } finally {
    await Promise.all([runtimeA.shutdown(), runtimeB.shutdown()]);
  }
  assert.equal(limiter.report().occupiedWorkers, 0);
});

test("capacity remains occupied while a worker drains and releases only after stop", async () => {
  const limiter = new DurableExecutionWorkerCapacityLimiter(1);
  const repository = new FakeRepository();
  repository.enqueue(receipt());
  const scheduler = new FakeScheduler();
  const state = controls();
  state.beforeExecute = async () => new Promise<void>(() => {});
  const registered = new DurableExecutionRegistry().register(handler(state));
  const runtimeA = new DurableExecutionRuntime({
    repository,
    registry: registered,
    scheduler,
    capacityLimiter: limiter,
    maxAttempts: 1,
  });
  const runtimeB = new DurableExecutionRuntime({
    repository,
    registry: registered,
    scheduler,
    capacityLimiter: limiter,
  });
  const worker = runtimeA.startWorker(scope);
  const polling = worker.poll();
  while (state.executions === 0) await Promise.resolve();

  const stopping = runtimeA.stopWorker(scope, worker.workerId);
  assert.deepEqual(limiter.report(), {
    maxWorkers: 1,
    activeWorkers: 0,
    stoppingWorkers: 1,
    occupiedWorkers: 1,
    availableSlots: 0,
    pendingDemands: 0,
    fairnessYieldInProgress: false,
  });
  assert.throws(
    () => runtimeB.startWorker({ ...scope, tenantKey: "tenant-b" }),
    DurableExecutionWorkerCapacityError,
  );
  await stopping;
  await polling;
  assert.equal(limiter.report().occupiedWorkers, 0);

  runtimeB.startWorker({ ...scope, tenantKey: "tenant-b" });
  await Promise.all([runtimeA.shutdown(), runtimeB.shutdown()]);
  assert.equal(limiter.report().occupiedWorkers, 0);
});

test("owner-fenced stop cannot stop a current or replacement worker with a stale id", async () => {
  const limiter = new DurableExecutionWorkerCapacityLimiter(1);
  const runtime = new DurableExecutionRuntime({
    repository: new FakeRepository(),
    registry: new DurableExecutionRegistry().register(handler(controls())),
    scheduler: new FakeScheduler(),
    capacityLimiter: limiter,
  });
  const original = runtime.startWorker(scope);
  assert.equal(await runtime.stopWorker(scope, "foreign-worker"), false);
  assert.strictEqual(runtime.getWorker(scope), original);
  assert.equal(await runtime.stopWorker(scope, original.workerId), true);

  const replacement = runtime.startWorker(scope);
  assert.equal(await runtime.stopWorker(scope, original.workerId), false);
  assert.strictEqual(runtime.getWorker(scope), replacement);
  await runtime.shutdown();
  assert.equal(limiter.report().occupiedWorkers, 0);
});

test("a released stale worker reference is one-shot and cannot restart", async () => {
  const limiter = new DurableExecutionWorkerCapacityLimiter(1);
  const scheduler = new FakeScheduler();
  const runtime = new DurableExecutionRuntime({
    repository: new FakeRepository(),
    registry: new DurableExecutionRegistry().register(handler(controls())),
    scheduler,
    capacityLimiter: limiter,
  });
  const worker = runtime.startWorker(scope);
  await runtime.stopWorker(scope, worker.workerId);

  assert.throws(() => worker.start(), DurableExecutionWorkerRestartError);
  assert.equal(limiter.report().occupiedWorkers, 0);
  assert.equal(scheduler.intervals.length, 1);
  await runtime.shutdown();
});

test("cooperative retirement drains accepted work without aborting it", async () => {
  const limiter = new DurableExecutionWorkerCapacityLimiter(1);
  const repository = new FakeRepository();
  repository.enqueue(receipt());
  const scheduler = new FakeScheduler();
  const state = controls();
  const gate = deferred<void>();
  state.beforeExecute = () => gate.promise;
  const runtime = new DurableExecutionRuntime({
    repository,
    registry: new DurableExecutionRegistry().register(handler(state)),
    scheduler,
    capacityLimiter: limiter,
    maxAttempts: 1,
  });
  const worker = runtime.startWorker(scope);
  const polling = worker.poll();
  while (state.executions === 0) await Promise.resolve();

  let retired = false;
  const retirement = runtime
    .retireWorker(scope, worker.workerId)
    .then((result) => {
      retired = result;
      return result;
    });
  await Promise.resolve();
  assert.equal(retired, false);
  assert.equal(state.contexts[0]?.signal.aborted, false);
  assert.equal(limiter.report().stoppingWorkers, 1);

  gate.resolve(undefined);
  assert.equal(await retirement, true);
  await polling;
  assert.equal(state.contexts[0]?.signal.aborted, false);
  assert.equal(repository.requeues.length, 0);
  assert.equal(repository.finishes.length, 1);
  assert.equal(limiter.report().occupiedWorkers, 0);
  assert.throws(() => worker.start(), DurableExecutionWorkerRestartError);
  await runtime.shutdown();
});

test("runtime shutdown escalates an in-flight cooperative retirement", async () => {
  const limiter = new DurableExecutionWorkerCapacityLimiter(1);
  const repository = new FakeRepository();
  repository.enqueue(receipt());
  const scheduler = new FakeScheduler();
  const state = controls();
  state.beforeExecute = async () => new Promise<void>(() => {});
  const runtime = new DurableExecutionRuntime({
    repository,
    registry: new DurableExecutionRegistry().register(handler(state)),
    scheduler,
    capacityLimiter: limiter,
    maxAttempts: 1,
  });
  const worker = runtime.startWorker(scope);
  const polling = worker.poll();
  while (state.executions === 0) await Promise.resolve();

  const retirement = runtime.retireWorker(scope, worker.workerId);
  await Promise.resolve();
  assert.equal(state.contexts[0]?.signal.aborted, false);
  await runtime.shutdown();
  assert.equal(await retirement, true);
  await polling;

  assert.equal(state.contexts[0]?.signal.aborted, true);
  assert.equal(repository.requeues.length, 1);
  assert.equal(limiter.report().occupiedWorkers, 0);
  assert.equal(limiter.report().pendingDemands, 0);
});

test("invalid drain budgets fail before a capacity reservation or timer leaks", async () => {
  const limiter = new DurableExecutionWorkerCapacityLimiter(1);
  const scheduler = new FakeScheduler();
  const runtime = new DurableExecutionRuntime({
    repository: new FakeRepository(),
    registry: new DurableExecutionRegistry().register(handler(controls())),
    scheduler,
    capacityLimiter: limiter,
    maxClaimsPerDrain: 0,
  });
  assert.throws(() => runtime.startWorker(scope), /integer from 1 to 100/);
  assert.equal(limiter.report().occupiedWorkers, 0);
  assert.equal(scheduler.intervals.length, 0);
  await runtime.shutdown();
});

test("worker shutdown aborts a non-cooperating handler and waits for fenced requeue", async () => {
  const repository = new FakeRepository();
  repository.enqueue(receipt());
  const scheduler = new FakeScheduler();
  const state = controls();
  state.beforeExecute = async () => new Promise<void>(() => {});
  const worker = new DurableExecutionWorker({
    repository,
    registry: new DurableExecutionRegistry().register(handler(state)),
    scope,
    workerId: "worker-shutdown",
    leaseMs: 5_000,
    pollMs: 1_000,
    maxAttempts: 1,
    scheduler,
    logError: () => {},
  });

  worker.start();
  const polling = worker.poll();
  while (state.executions === 0) await Promise.resolve();
  await worker.stop();
  await polling;

  assert.equal(worker.readiness().state, "stopped");
  assert.equal(state.contexts[0]?.signal.aborted, true);
  assert.equal(repository.requeues.length, 1);
  assert.equal(
    (repository.requeues[0]?.eventData as { errorCode?: string })?.errorCode,
    "durable_execution_interrupted",
  );
  assert.equal(repository.finishes.length, 0);
});

test("worker shutdown also releases a non-cooperating terminal reconciler", async () => {
  const repository = new FakeRepository();
  const scheduler = new FakeScheduler();
  const state = controls();
  let reconciliationContext: DurableExecutionReconciliationContext | undefined;
  const registered: DurableExecutionHandler = {
    ...handler(state),
    reconcileTerminal(_scope, context) {
      state.reconciliations += 1;
      reconciliationContext = context;
      return new Promise<number>(() => {});
    },
  };
  const worker = new DurableExecutionWorker({
    repository,
    registry: new DurableExecutionRegistry().register(registered),
    scope,
    workerId: "worker-reconcile-shutdown",
    leaseMs: 5_000,
    pollMs: 1_000,
    maxAttempts: 1,
    scheduler,
    logError: () => {},
  });

  worker.start();
  const polling = worker.poll();
  while (state.reconciliations === 0) await Promise.resolve();
  await worker.stop();
  await polling;

  assert.equal(worker.readiness().state, "stopped");
  assert.equal(reconciliationContext?.signal.aborted, true);
  assert.equal(repository.claims.length, 0);
});

test("worker wake, poll, stop and readiness preserve redacted failures", async () => {
  const repository = new FakeRepository();
  repository.enqueue(receipt());
  const scheduler = new FakeScheduler();
  const state = controls();
  state.throwProjection = new Error(
    "Authorization: Bearer sk-secret-value-123456789",
  );
  let tick = 0;
  const now = () => new Date(1_752_659_200_000 + tick++ * 1_000);
  const worker = new DurableExecutionWorker({
    repository,
    registry: new DurableExecutionRegistry().register(handler(state)),
    scope,
    workerId: "worker-readiness",
    leaseMs: 5_000,
    pollMs: 1_000,
    maxAttempts: 3,
    scheduler,
    now,
    logError: () => {},
  });

  worker.start();
  assert.equal(worker.readiness().state, "starting");
  await worker.poll();
  let readiness = worker.readiness();
  assert.equal(readiness.state, "degraded");
  assert.equal(readiness.counters.claims, 1);
  assert.equal(readiness.counters.projectionPending, 1);
  assert.doesNotMatch(
    JSON.stringify(readiness),
    /sk-secret-value|opaque-lease-token/,
  );
  assert.match(JSON.stringify(readiness), /REDACTED/);

  state.throwProjection = undefined;
  worker.wake();
  await worker.poll();
  readiness = worker.readiness();
  assert.equal(readiness.state, "ready");
  assert.equal(readiness.counters.reconciled, 2);
  assert.equal(state.executions, 1);

  const pollsBeforeStop = readiness.counters.polls;
  await worker.stop();
  assert.equal(worker.readiness().state, "stopped");
  assert.equal(scheduler.cleared, 2);
  scheduler.intervals[0]?.();
  await Promise.resolve();
  assert.equal(worker.readiness().counters.polls, pollsBeforeStop);
});
