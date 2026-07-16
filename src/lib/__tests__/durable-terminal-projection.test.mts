import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  ExecutionControlRepository,
  ExecutionLeaseScope,
  ExecutionRun,
  ExecutionTerminalProjection,
  ExecutionTerminalProjectionControlRepository,
  ExecutionTerminalProjectionLeaseReceipt,
} from "@/lib/execution-control";
import type { DurableExecutionHandlerV2 } from "@/lib/durable-execution/effect-contract";
import {
  parseDurableJsonContractValue,
  type DurableJsonBounds,
  type DurableJsonContract,
} from "@/lib/durable-execution/json-contract";
import { DurableExecutionRegistry } from "@/lib/durable-execution/registry";
import {
  DurableExecutionEngine,
  DurableExecutionWorker,
} from "@/lib/durable-execution/runtime";
import type { ExecutionHeartbeatScheduler } from "@/lib/durable-execution/leased-worker";

const now = "2026-07-16T10:00:00.000Z";
const scope: ExecutionLeaseScope = {
  tenantKey: "tenant-projection",
  operation: "fixture.projection",
  mode: "canary",
};
const bounds: DurableJsonBounds = {
  maxBytes: 2_048,
  maxDepth: 5,
  maxNodes: 32,
  maxStringBytes: 256,
  maxArrayItems: 8,
  maxObjectKeys: 8,
};
const commandContract: DurableJsonContract<{ value: string }> = {
  schemaVersion: 1,
  bounds,
  secrets: { mode: "reject" },
  parse(value) {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      typeof (value as { value?: unknown }).value !== "string" ||
      Object.keys(value).some((key) => key !== "value")
    ) {
      throw new Error("invalid command");
    }
    return { value: (value as { value: string }).value };
  },
};
const resultContract: DurableJsonContract<{ projected: boolean }> = {
  schemaVersion: 1,
  bounds,
  secrets: { mode: "reject" },
  parse(value) {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      typeof (value as { projected?: unknown }).projected !== "boolean"
    ) {
      throw new Error("invalid result");
    }
    return { projected: (value as { projected: boolean }).projected };
  },
};

function handler(
  projectTerminal: DurableExecutionHandlerV2<
    { value: string },
    { value: string },
    { projected: boolean },
    Record<string, never>
  >["projectTerminal"],
  version = 1,
): DurableExecutionHandlerV2<
  { value: string },
  { value: string },
  { projected: boolean },
  Record<string, never>
> {
  return {
    contractVersion: 2,
    operation: scope.operation,
    version,
    command: commandContract,
    checkpoint: commandContract,
    result: resultContract,
    effects: {},
    execute: async () => ({ output: { projected: true } }),
    classifyPureError: () => ({
      code: "fixture_projection_failed",
      retryable: false,
      message: "fixture projection failed",
    }),
    projectTerminal,
  };
}

function terminalRun(
  registry: DurableExecutionRegistry,
  overrides: Partial<ExecutionRun> = {},
): ExecutionRun {
  const parsed = parseDurableJsonContractValue(
    commandContract,
    { value: "alpha" },
    "command",
  );
  return {
    id: "xrun-projection",
    tenantKey: scope.tenantKey,
    idempotencyKey: "fixture-projection-1",
    aggregateType: "fixture.record",
    aggregateId: "record-1",
    operation: scope.operation,
    mode: scope.mode,
    status: "completed",
    input: parsed.value,
    output: { projected: true },
    metadata: {
      authority: "execution_ledger_v2",
      executionContractVersion: 2,
      executionHandlerVersion: 1,
      executionPolicyFingerprint: registry.executionPolicyFingerprint(
        scope.operation,
        1,
      ),
      executionCommandFingerprint: parsed.fingerprint,
      executionCommandSchemaVersion: parsed.schemaVersion,
    },
    availableAt: now,
    claimCount: 1,
    handlerAttempt: 1,
    createdAt: now,
    startedAt: now,
    finishedAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function pendingProjection(run: ExecutionRun): ExecutionTerminalProjection {
  return {
    runId: run.id,
    tenantKey: run.tenantKey,
    operation: run.operation,
    mode: run.mode as "canary" | "active",
    terminalStatus: run.status as "completed",
    state: "pending",
    availableAt: now,
    claimCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

class MemoryProjectionRepository implements ExecutionTerminalProjectionControlRepository {
  projection: ExecutionTerminalProjection;
  token = "projection-token";
  run: ExecutionRun;
  loseAcknowledgementOnce = false;
  allowStaleRecovery = false;
  delays: number[] = [];
  errorCodes: string[] = [];
  claims = 0;
  renewals = 0;
  acknowledgements = 0;
  failRenewal = false;

  constructor(run: ExecutionRun) {
    this.run = run;
    this.projection = pendingProjection(run);
  }

  async claimTerminalProjection(input: {
    runId: string;
  }): Promise<ExecutionTerminalProjectionLeaseReceipt | null> {
    if (input.runId !== this.run.id) return null;
    return this.claim();
  }

  async claimNextTerminalProjection(): Promise<ExecutionTerminalProjectionLeaseReceipt | null> {
    return this.claim();
  }

  async renewTerminalProjectionLease(input: {
    token: string;
  }): Promise<ExecutionTerminalProjectionLeaseReceipt | null> {
    this.renewals += 1;
    if (this.failRenewal) return null;
    return input.token === this.token && this.projection.state === "running"
      ? this.receipt(false)
      : null;
  }

  async acknowledgeTerminalProjection(input: {
    token: string;
  }): Promise<ExecutionTerminalProjection | null> {
    this.acknowledgements += 1;
    if (input.token !== this.token || this.projection.state !== "running") {
      return null;
    }
    if (this.loseAcknowledgementOnce) {
      this.loseAcknowledgementOnce = false;
      return null;
    }
    this.projection = {
      ...this.projection,
      state: "succeeded",
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
      lastErrorCode: undefined,
      projectedAt: now,
      updatedAt: now,
    };
    return this.projection;
  }

  async requeueTerminalProjection(input: {
    token: string;
    delayMs: number;
    errorCode: string;
  }): Promise<ExecutionTerminalProjection | null> {
    if (input.token !== this.token || this.projection.state !== "running") {
      return null;
    }
    this.delays.push(input.delayMs);
    this.errorCodes.push(input.errorCode);
    this.projection = {
      ...this.projection,
      state: "retry_wait",
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
      lastErrorCode: input.errorCode,
      updatedAt: now,
    };
    return this.projection;
  }

  async blockTerminalProjection(input: {
    token: string;
    errorCode: string;
  }): Promise<ExecutionTerminalProjection | null> {
    if (input.token !== this.token || this.projection.state !== "running") {
      return null;
    }
    this.errorCodes.push(input.errorCode);
    this.projection = {
      ...this.projection,
      state: "blocked",
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
      lastErrorCode: input.errorCode,
      updatedAt: now,
    };
    return this.projection;
  }

  async getTerminalProjectionForScope(): Promise<ExecutionTerminalProjection> {
    return this.projection;
  }

  async getBlockedTerminalProjectionForScope(): Promise<ExecutionTerminalProjection | null> {
    return this.projection.state === "blocked" ? this.projection : null;
  }

  makeRetryAvailable(): void {
    if (this.projection.state === "retry_wait") {
      this.projection = { ...this.projection, state: "pending" };
    }
  }

  private claim(): ExecutionTerminalProjectionLeaseReceipt | null {
    const recovered =
      this.projection.state === "running" && this.allowStaleRecovery;
    if (
      this.projection.state !== "pending" &&
      this.projection.state !== "retry_wait" &&
      !recovered
    ) {
      return null;
    }
    this.allowStaleRecovery = false;
    this.claims += 1;
    this.projection = {
      ...this.projection,
      state: "running",
      claimCount: this.projection.claimCount + 1,
      leaseOwner: "worker-projection",
      leaseExpiresAt: "2026-07-16T10:01:00.000Z",
      lastAttemptAt: now,
      updatedAt: now,
    };
    return this.receipt(recovered);
  }

  private receipt(recovered: boolean): ExecutionTerminalProjectionLeaseReceipt {
    return {
      projection: this.projection,
      run: this.run,
      token: this.token,
      expiresAt: "2026-07-16T10:01:00.000Z",
      recovered,
    };
  }
}

function engine(
  registry: DurableExecutionRegistry,
  projectionRepository: MemoryProjectionRepository,
  heartbeatScheduler?: ExecutionHeartbeatScheduler,
): DurableExecutionEngine {
  return new DurableExecutionEngine({
    repository: {
      claimNextRun: async () => null,
      claimRun: async () => null,
      blockRun: async () => null,
    } as unknown as ExecutionControlRepository,
    projectionRepository,
    registry,
    scope,
    workerId: "worker-fixture",
    leaseMs: 60_000,
    maxAttempts: 3,
    projectionRetryBaseMs: 1_000,
    projectionRetryMaximumMs: 5_000,
    heartbeatScheduler,
  });
}

test("terminal projection callback is claimed, fenced and acknowledged", async () => {
  const projected: string[] = [];
  const registry = new DurableExecutionRegistry().register(
    handler(async (run, command) => {
      projected.push(`${run.id}:${command.value}`);
    }),
  );
  const repository = new MemoryProjectionRepository(terminalRun(registry));

  const outcome = await engine(registry, repository).processNextProjection();

  assert.deepEqual(outcome, {
    kind: "completed",
    runId: "xrun-projection",
  });
  assert.deepEqual(projected, ["xrun-projection:alpha"]);
  assert.equal(repository.projection.state, "succeeded");
  assert.equal(repository.projection.projectedAt, now);
});

test("transient callback failure is DB-delay requeued and later succeeds", async () => {
  let calls = 0;
  const registry = new DurableExecutionRegistry().register(
    handler(async () => {
      calls += 1;
      if (calls === 1) throw new Error("temporary sink failure");
    }),
  );
  const repository = new MemoryProjectionRepository(terminalRun(registry));
  const runtime = engine(registry, repository);

  const first = await runtime.processNextProjection();
  assert.equal(first.kind, "projection_pending");
  assert.equal(repository.projection.state, "retry_wait");
  assert.deepEqual(repository.delays, [1_000]);
  assert.deepEqual(repository.errorCodes, [
    "terminal_projection_callback_failed",
  ]);

  repository.makeRetryAvailable();
  const second = await runtime.processNextProjection();
  assert.equal(second.kind, "completed");
  assert.equal(calls, 2);
  assert.equal(repository.projection.state, "succeeded");
});

test("missing handler is rolling-safe, while corrupt command blocks without callback", async () => {
  let calls = 0;
  const registry = new DurableExecutionRegistry().register(
    handler(async () => {
      calls += 1;
    }),
  );
  const unavailableRun = terminalRun(registry, {
    metadata: {
      ...terminalRun(registry).metadata,
      executionHandlerVersion: 2,
    },
  });
  const unavailableRepository = new MemoryProjectionRepository(unavailableRun);
  const unavailable = await engine(
    registry,
    unavailableRepository,
  ).processNextProjection();
  assert.equal(unavailable.kind, "projection_pending");
  assert.equal(unavailableRepository.projection.state, "retry_wait");
  assert.equal(
    unavailableRepository.projection.lastErrorCode,
    "terminal_projection_handler_unavailable",
  );

  const corruptRun = terminalRun(registry, {
    metadata: {
      ...terminalRun(registry).metadata,
      executionCommandFingerprint: "0".repeat(64),
    },
  });
  const corruptRepository = new MemoryProjectionRepository(corruptRun);
  const corruptRuntime = engine(registry, corruptRepository);
  const corrupt = await corruptRuntime.processNextProjection();
  assert.equal(corrupt.kind, "projection_blocked");
  assert.equal(corruptRepository.projection.state, "blocked");
  assert.equal(
    corruptRepository.projection.lastErrorCode,
    "terminal_projection_command_mismatch",
  );
  assert.equal((await corruptRuntime.processNextProjection()).kind, "idle");
  assert.equal(calls, 0);
});

test("acknowledgement loss may redeliver but an idempotent run-id sink stays unique", async () => {
  let callbacks = 0;
  const sink = new Map<string, string>();
  const registry = new DurableExecutionRegistry().register(
    handler(async (run, command) => {
      callbacks += 1;
      sink.set(run.id, command.value);
    }),
  );
  const repository = new MemoryProjectionRepository(terminalRun(registry));
  repository.loseAcknowledgementOnce = true;
  const runtime = engine(registry, repository);

  assert.equal((await runtime.processNextProjection()).kind, "lease_lost");
  assert.equal(repository.projection.state, "running");
  repository.allowStaleRecovery = true;
  assert.equal((await runtime.processNextProjection()).kind, "completed");

  assert.equal(callbacks, 2);
  assert.deepEqual([...sink], [["xrun-projection", "alpha"]]);
  assert.equal(repository.projection.state, "succeeded");
});

test("a stale projection owner renews before callback and performs no product write", async () => {
  let callbacks = 0;
  const registry = new DurableExecutionRegistry().register(
    handler(() => {
      callbacks += 1;
    }),
  );
  const repository = new MemoryProjectionRepository(terminalRun(registry));
  repository.failRenewal = true;

  const outcome = await engine(registry, repository).processNextProjection();

  assert.equal(outcome.kind, "lease_lost");
  assert.equal(repository.renewals, 1);
  assert.equal(callbacks, 0);
  assert.equal(repository.acknowledgements, 0);
});

test("heartbeat lease loss aborts a cooperative projector and cannot ACK", async () => {
  let callbackStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    callbackStarted = resolve;
  });
  let callbackAborted!: () => void;
  const aborted = new Promise<void>((resolve) => {
    callbackAborted = resolve;
  });
  let observedAbort = false;
  const callbacks: Array<() => void> = [];
  const heartbeatScheduler: ExecutionHeartbeatScheduler = {
    setInterval(callback) {
      callbacks.push(callback);
      return callback;
    },
    clearInterval() {},
  };
  const registry = new DurableExecutionRegistry().register(
    handler(async (_run, _command, context) => {
      callbackStarted();
      await new Promise<void>((_resolve, reject) => {
        const stop = () => {
          observedAbort = true;
          callbackAborted();
          reject(context.signal.reason);
        };
        if (context.signal.aborted) stop();
        else context.signal.addEventListener("abort", stop, { once: true });
      });
    }),
  );
  const repository = new MemoryProjectionRepository(terminalRun(registry));
  const processing = engine(
    registry,
    repository,
    heartbeatScheduler,
  ).processNextProjection();
  await started;
  assert.equal(repository.renewals, 1, "callback requires an immediate renew");
  repository.failRenewal = true;
  assert.equal(callbacks.length, 1);
  callbacks[0]?.();
  await aborted;

  const outcome = await processing;
  assert.equal(outcome.kind, "lease_lost");
  assert.equal(observedAbort, true);
  assert.equal(repository.acknowledgements, 0);
});

test("contract-v2 fails closed before handler or effect I/O without projection authority", async () => {
  let handlerCalls = 0;
  let effectRepositoryCalls = 0;
  let requeues = 0;
  let blocks = 0;
  const registered = handler(() => {});
  registered.execute = async () => {
    handlerCalls += 1;
    return { output: { projected: true } };
  };
  const registry = new DurableExecutionRegistry().register(registered);
  const running = terminalRun(registry, {
    status: "running",
    output: undefined,
    finishedAt: undefined,
    leaseOwner: "partial-runtime",
    leaseExpiresAt: "2026-07-16T10:01:00.000Z",
  });
  let available = true;
  const repository = {
    claimNextRun: async () => {
      if (!available) return null;
      available = false;
      return {
        run: running,
        token: "partial-runtime-token",
        expiresAt: "2026-07-16T10:01:00.000Z",
        recovered: false,
      };
    },
    claimRun: async () => null,
    renewRunLease: async (input: { token: string }) => ({
      run: running,
      token: input.token,
      expiresAt: "2026-07-16T10:01:00.000Z",
      recovered: false,
    }),
    requeueRun: async () => {
      requeues += 1;
      return { ...running, status: "queued" as const };
    },
    blockRun: async (input: {
      reasonCode: "runtime_authority_unavailable";
    }) => {
      blocks += 1;
      return {
        ...running,
        status: "blocked" as const,
        blockedReasonCode: input.reasonCode,
        blockedAt: now,
        leaseOwner: undefined,
        leaseExpiresAt: undefined,
      };
    },
  } as unknown as ExecutionControlRepository;
  const runtime = new DurableExecutionEngine({
    repository,
    effectRepository: {
      prepareEffect: async () => {
        effectRepositoryCalls += 1;
        return null;
      },
      completeEffect: async () => null,
      recordEffectFailure: async () => null,
      recordEffectReconcile: async () => null,
      getEffectForScope: async () => null,
    },
    cancellationRepository: {
      requestRunCancellation: async () => null,
      acknowledgeRunCancellation: async () => null,
    },
    capabilityPolicy: {
      mayAdmit: () => true,
      mayDrain: () => "allow",
    },
    registry,
    scope,
    workerId: "partial-runtime-worker",
    leaseMs: 60_000,
    maxAttempts: 3,
  });

  const outcome = await runtime.processNext();

  assert.equal(outcome.kind, "blocked");
  assert.equal(outcome.blockReasonCode, "runtime_authority_unavailable");
  assert.equal(handlerCalls, 0);
  assert.equal(effectRepositoryCalls, 0);
  assert.equal(requeues, 0);
  assert.equal(blocks, 1);
});

test("command and projection drain budgets fail closed outside 1 through 100", () => {
  const registry = new DurableExecutionRegistry().register(handler(() => {}));
  const projectionRepository = new MemoryProjectionRepository(
    terminalRun(registry),
  );
  const base = {
    repository: {
      claimNextRun: async () => null,
      claimRun: async () => null,
      blockRun: async () => null,
    } as unknown as ExecutionControlRepository,
    projectionRepository,
    registry,
    scope,
    workerId: "worker-budget",
    leaseMs: 60_000,
    pollMs: 5_000,
    maxAttempts: 3,
  };
  for (const field of [
    "maxClaimsPerDrain",
    "maxProjectionClaimsPerDrain",
  ] as const) {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, 0, 101]) {
      assert.throws(
        () => new DurableExecutionWorker({ ...base, [field]: value }),
        new RegExp(`${field} must be an integer from 1 to 100`),
      );
    }
    assert.doesNotThrow(
      () => new DurableExecutionWorker({ ...base, [field]: 1 }),
    );
    assert.doesNotThrow(
      () => new DurableExecutionWorker({ ...base, [field]: 100 }),
    );
  }
});

test("projection delivery exhaustion becomes blocked evidence instead of a hot loop", async () => {
  let callbacks = 0;
  const registry = new DurableExecutionRegistry().register(
    handler(() => {
      callbacks += 1;
    }),
  );
  const repository = new MemoryProjectionRepository(terminalRun(registry));
  repository.projection = { ...repository.projection, claimCount: 99 };
  const runtime = engine(registry, repository);

  assert.equal(
    (await runtime.processNextProjection()).kind,
    "projection_blocked",
  );
  assert.equal(callbacks, 0);
  assert.equal(repository.projection.state, "blocked");
  assert.equal(
    repository.projection.lastErrorCode,
    "terminal_projection_claims_exhausted",
  );
  assert.equal((await runtime.processNextProjection()).kind, "idle");
});
