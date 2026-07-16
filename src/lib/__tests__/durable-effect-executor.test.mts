import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  BlockExecutionRunInput,
  CheckpointExecutionRunInput,
  ExecutionControlRepository,
  ExecutionEffect,
  ExecutionEffectControlRepository,
  ExecutionLeaseReceipt,
  ExecutionLeaseScope,
  ExecutionRun,
  ExecutionTerminalProjection,
  ExecutionCancellationActor,
  ExecutionCancellationReasonCode,
  FinishExecutionRunInput,
  PrepareExecutionEffectInput,
  RecordExecutionEffectFailureInput,
  RecordExecutionEffectReconcileInput,
  RequeueExecutionRunInput,
  ResumeBlockedExecutionRunInput,
} from "@/lib/execution-control";
import { ExecutionEffectConflictError } from "@/lib/execution-control/types";
import {
  DurableCancellationPendingError,
  DurableCancellationStopError,
  DurableEffectDeadlineExceededError,
  DurableEffectExecutor,
  DurableEffectRetryScheduledError,
  DurableEffectTerminalError,
  type DurableCapabilityPolicy,
  type DurableEffectDeadlineScheduler,
} from "@/lib/durable-execution/effect-executor";
import type {
  DurableEffectDefinition,
  DurableEffectSafety,
  DurableExecutionHandlerV2,
} from "@/lib/durable-execution/effect-contract";
import { durableEffectPolicyFingerprint } from "@/lib/durable-execution/effect-contract";
import type {
  DurableJsonBounds,
  DurableJsonContract,
  DurableJsonObject,
} from "@/lib/durable-execution/json-contract";
import { parseDurableJsonContractValue } from "@/lib/durable-execution/json-contract";
import { FencedExecutionLease } from "@/lib/durable-execution/leased-worker";
import { DurableExecutionRegistry } from "@/lib/durable-execution/registry";
import {
  DurableExecutionBlockAuthorityUnavailableError,
  DurableExecutionEngine,
  type DurableExecutionResult,
} from "@/lib/durable-execution/runtime";

const scope: ExecutionLeaseScope = {
  tenantKey: "tenant-fixture",
  operation: "fixture.effect",
  mode: "canary",
};
const databaseNow = "2026-07-16T10:00:00.000Z";

const bounds: DurableJsonBounds = {
  maxBytes: 4_096,
  maxDepth: 6,
  maxNodes: 64,
  maxStringBytes: 512,
  maxArrayItems: 16,
  maxObjectKeys: 16,
};

function closedObjectContract<T extends DurableJsonObject>(
  parse: (value: unknown) => T,
  schemaVersion = 1,
): DurableJsonContract<T> {
  return {
    schemaVersion,
    bounds,
    secrets: { mode: "reject" },
    parse,
  };
}

const commandContract = closedObjectContract((value) => {
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
});

const receiptContract = closedObjectContract((value) => {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    typeof (value as { receiptId?: unknown }).receiptId !== "string" ||
    Object.keys(value).some((key) => key !== "receiptId")
  ) {
    throw new Error("invalid receipt");
  }
  return { receiptId: (value as { receiptId: string }).receiptId };
});

function commandContractMetadata(value = "alpha") {
  const command = parseDurableJsonContractValue(
    commandContract,
    { value },
    "command",
  );
  return {
    authority: "execution_ledger_v2" as const,
    executionCommandFingerprint: command.fingerprint,
    executionCommandSchemaVersion: command.schemaVersion,
  };
}

function executionRun(overrides: Partial<ExecutionRun> = {}): ExecutionRun {
  return {
    id: "xrun-fixture",
    tenantKey: scope.tenantKey,
    idempotencyKey: "fixture-command-1",
    aggregateType: "fixture.record",
    aggregateId: "record-1",
    operation: scope.operation,
    mode: scope.mode,
    status: "running",
    input: { value: "alpha" },
    metadata: {
      authority: "execution_ledger_v2",
      executionContractVersion: 2,
      executionHandlerVersion: 2,
      ...commandContractMetadata(),
    },
    availableAt: databaseNow,
    leaseOwner: "worker-fixture",
    leaseExpiresAt: "2026-07-16T10:10:00.000Z",
    claimCount: 1,
    handlerAttempt: 0,
    createdAt: databaseNow,
    startedAt: databaseNow,
    updatedAt: databaseNow,
    ...overrides,
  };
}

function effectRow(
  input: PrepareExecutionEffectInput,
  overrides: Partial<ExecutionEffect> = {},
): ExecutionEffect {
  return {
    id: "xeff-fixture",
    runId: input.runId,
    stepKey: input.stepKey,
    effectKey: input.effectKey,
    handlerVersion: input.handlerVersion,
    definitionVersion: input.definitionVersion,
    capability: input.capability,
    safety: input.safety,
    payloadSchemaVersion: input.payloadSchemaVersion,
    payloadFingerprint: input.payloadFingerprint,
    policyFingerprint: input.policyFingerprint,
    receiptSchemaVersion: input.receiptSchemaVersion,
    status: "prepared",
    attemptCount: 1,
    reconcileCount: 0,
    availableAt: databaseNow,
    lastAttemptAt: databaseNow,
    lastDeadlineAt: "2026-07-16T10:00:05.000Z",
    createdAt: databaseNow,
    updatedAt: databaseNow,
    ...overrides,
  };
}

class MemoryEffectRepository implements ExecutionEffectControlRepository {
  effect: ExecutionEffect | null = null;
  prepares: PrepareExecutionEffectInput[] = [];
  completions: Array<Record<string, unknown>> = [];
  failures: RecordExecutionEffectFailureInput[] = [];
  reconciles: RecordExecutionEffectReconcileInput[] = [];
  crashAfterPrepare = false;
  databaseNow = databaseNow;

  setDatabaseNow(value: string): void {
    this.databaseNow = value;
  }

  async prepareEffect(input: PrepareExecutionEffectInput) {
    this.prepares.push(input);
    if (!this.effect) {
      this.effect = effectRow(input, {
        availableAt: this.databaseNow,
        lastAttemptAt: this.databaseNow,
        lastDeadlineAt: new Date(
          Date.parse(this.databaseNow) + input.deadlineMs,
        ).toISOString(),
        createdAt: this.databaseNow,
        updatedAt: this.databaseNow,
      });
      if (this.crashAfterPrepare) {
        this.crashAfterPrepare = false;
        throw new Error("synthetic process crash");
      }
      return { kind: "invoke" as const, effect: this.effect };
    }
    const immutable = this.effect;
    if (
      immutable.stepKey !== input.stepKey ||
      immutable.effectKey !== input.effectKey ||
      immutable.handlerVersion !== input.handlerVersion ||
      immutable.definitionVersion !== input.definitionVersion ||
      immutable.capability !== input.capability ||
      immutable.safety !== input.safety ||
      immutable.payloadSchemaVersion !== input.payloadSchemaVersion ||
      immutable.payloadFingerprint !== input.payloadFingerprint ||
      immutable.policyFingerprint !== input.policyFingerprint ||
      immutable.receiptSchemaVersion !== input.receiptSchemaVersion
    ) {
      throw new ExecutionEffectConflictError();
    }
    if (immutable.status === "succeeded") {
      return { kind: "return_receipt" as const, effect: immutable };
    }
    if (immutable.status === "failed" || immutable.status === "cancelled") {
      return { kind: "retry_wait" as const, effect: immutable };
    }
    const available = Date.parse(immutable.availableAt);
    const deadline = Date.parse(immutable.lastDeadlineAt ?? "");
    const now = Date.parse(this.databaseNow);
    const ambiguous =
      (immutable.status === "prepared" || immutable.status === "uncertain") &&
      immutable.lastErrorCode !== "effect_reconcile_not_found";
    if (
      !Number.isFinite(available) ||
      available > now ||
      (ambiguous && (!Number.isFinite(deadline) || deadline > now))
    ) {
      return { kind: "retry_wait" as const, effect: immutable };
    }
    if (immutable.safety === "reconcile_before_replay" && ambiguous) {
      return { kind: "reconcile" as const, effect: immutable };
    }
    if (immutable.attemptCount >= input.maxAttempts) {
      return { kind: "retry_wait" as const, effect: immutable };
    }
    this.effect = {
      ...immutable,
      status: "prepared",
      attemptCount: immutable.attemptCount + 1,
      lastAttemptAt: this.databaseNow,
      lastDeadlineAt: new Date(
        Date.parse(this.databaseNow) + input.deadlineMs,
      ).toISOString(),
      updatedAt: this.databaseNow,
    };
    return { kind: "invoke" as const, effect: this.effect };
  }

  async completeEffect(input: {
    receipt: Record<string, unknown>;
    receiptFingerprint: string;
  }) {
    if (!this.effect) return null;
    this.completions.push(input.receipt);
    this.effect = {
      ...this.effect,
      status: "succeeded",
      receipt: input.receipt,
      receiptFingerprint: input.receiptFingerprint,
      finishedAt: databaseNow,
      updatedAt: databaseNow,
    };
    return this.effect;
  }

  async recordEffectFailure(input: RecordExecutionEffectFailureInput) {
    this.failures.push(input);
    if (!this.effect) return null;
    this.effect = {
      ...this.effect,
      status: input.terminal
        ? "failed"
        : input.classification === "outcome_unknown"
          ? "uncertain"
          : "retry_wait",
      lastErrorCode: input.errorCode,
      availableAt: (
        input.availableAt ?? new Date(this.databaseNow)
      ).toISOString(),
      ...(input.terminal ? { finishedAt: databaseNow } : {}),
      updatedAt: this.databaseNow,
    };
    return this.effect;
  }

  async recordEffectReconcile(input: RecordExecutionEffectReconcileInput) {
    this.reconciles.push(input);
    if (!this.effect) return null;
    this.effect = {
      ...this.effect,
      reconcileCount: this.effect.reconcileCount + 1,
      status:
        input.outcome === "found"
          ? "succeeded"
          : input.outcome === "conflict"
            ? "failed"
            : input.outcome === "unknown"
              ? "uncertain"
              : "prepared",
      ...(input.outcome === "found"
        ? {
            receipt: input.receipt,
            receiptFingerprint: input.receiptFingerprint,
            finishedAt: databaseNow,
            lastErrorCode: undefined,
          }
        : {
            receipt: undefined,
            receiptFingerprint: undefined,
            lastErrorCode:
              input.outcome === "unknown"
                ? "effect_reconcile_unknown"
                : input.outcome === "conflict"
                  ? input.errorCode
                  : "effect_reconcile_not_found",
            ...(input.outcome === "conflict"
              ? { finishedAt: databaseNow }
              : {}),
          }),
      availableAt: (
        input.availableAt ?? new Date(this.databaseNow)
      ).toISOString(),
      updatedAt: this.databaseNow,
    };
    return this.effect;
  }

  async getEffectForScope() {
    return this.effect;
  }
}

class FakeLease {
  token = "opaque-lease-token";
  run = executionRun();
  renewals = 0;
  loseAtRenewal?: number;

  async renew(): Promise<void> {
    this.renewals += 1;
    if (this.renewals === this.loseAtRenewal) {
      const error = new Error("lease lost");
      error.name = "ExecutionLeaseLostError";
      throw error;
    }
  }
}

class ManualDeadlineScheduler implements DurableEffectDeadlineScheduler {
  callbacks: Array<() => void> = [];
  setTimeout(callback: () => void): unknown {
    this.callbacks.push(callback);
    return callback;
  }
  clearTimeout(handle: unknown): void {
    this.callbacks = this.callbacks.filter((value) => value !== handle);
  }
  fire(): void {
    const callbacks = [...this.callbacks];
    this.callbacks = [];
    callbacks.forEach((callback) => callback());
  }
}

const allowPolicy: DurableCapabilityPolicy = {
  mayAdmit: () => true,
  mayDrain: () => "allow",
};

function definition(
  input: {
    safety?: DurableEffectSafety;
    maxAttempts?: number;
    invoke?: DurableEffectDefinition<
      { value: string },
      { receiptId: string }
    >["invoke"];
    reconcile?: DurableEffectDefinition<
      { value: string },
      { receiptId: string }
    >["reconcile"];
  } = {},
): DurableEffectDefinition<{ value: string }, { receiptId: string }> {
  return {
    step: "fixture.call",
    definitionVersion: 1,
    capability: "fixture.remote.call",
    payload: commandContract,
    receipt: receiptContract,
    safety: input.safety ?? {
      kind: "target_idempotency",
      delivery: "at_least_once_attempts",
      keyPlacement: "header",
      replay: "same_key_same_payload",
    },
    retry: {
      maxAttempts: input.maxAttempts ?? 3,
      baseDelayMs: 1_000,
      maxDelayMs: 10_000,
      jitter: "full",
    },
    timeoutMs: 2_000,
    invoke:
      input.invoke ??
      (async (_payload, context) => ({ receiptId: context.effectKey })),
    reconcile: input.reconcile ?? (async () => ({ kind: "unknown" as const })),
    classify: () => ({ kind: "outcome_unknown", code: "remote_unknown" }),
  };
}

function handlerFor(
  effectDefinition: ReturnType<typeof definition>,
  execute?: DurableExecutionHandlerV2<
    { value: string },
    { value: string },
    { receiptId: string },
    { "fixture.call": ReturnType<typeof definition> }
  >["execute"],
): DurableExecutionHandlerV2<
  { value: string },
  { value: string },
  { receiptId: string },
  { "fixture.call": ReturnType<typeof definition> }
> {
  return {
    contractVersion: 2,
    operation: scope.operation,
    version: 2,
    command: commandContract,
    checkpoint: commandContract,
    result: receiptContract,
    effects: { "fixture.call": effectDefinition },
    execute:
      execute ??
      (async (command, context) => ({
        output: await context.effect("fixture.call", command),
      })),
    classifyPureError: () => ({
      code: "fixture_invalid",
      retryable: false,
      message: "fixture failed",
    }),
    projectTerminal: () => undefined,
  };
}

function executor(input: {
  repository: MemoryEffectRepository;
  effectDefinition: ReturnType<typeof definition>;
  lease?: FakeLease;
  policy?: DurableCapabilityPolicy;
  scheduler?: DurableEffectDeadlineScheduler;
  now?: () => Date;
  signal?: AbortSignal;
  credentialProvider?: {
    resolve(reference: string): Promise<Readonly<Record<string, string>>>;
  };
}): DurableEffectExecutor {
  const lease = input.lease ?? new FakeLease();
  if (!input.lease) {
    lease.run = executionRun({ updatedAt: input.repository.databaseNow });
  }
  return new DurableEffectExecutor({
    repository: input.repository,
    capabilityPolicy: input.policy ?? allowPolicy,
    handler: handlerFor(input.effectDefinition),
    run: executionRun({ updatedAt: input.repository.databaseNow }),
    scope,
    lease: lease as unknown as FencedExecutionLease,
    signal: input.signal ?? new AbortController().signal,
    credentialProvider: input.credentialProvider,
    deadlineAt: "2099-07-16T10:00:00.000Z",
    deadlineScheduler: input.scheduler,
    now: input.now,
    random: () => 0.5,
  });
}

test("prepare is durable before I/O and recovery reuses the exact key and payload", async () => {
  const repository = new MemoryEffectRepository();
  repository.crashAfterPrepare = true;
  const invocations: Array<{ key: string; payload: unknown }> = [];
  const effectDefinition = definition({
    invoke: async (payload, context) => {
      assert.ok(repository.effect, "effect must exist before provider I/O");
      invocations.push({ key: context.effectKey, payload });
      return { receiptId: "receipt-1" };
    },
  });

  await assert.rejects(
    executor({ repository, effectDefinition }).effect("fixture.call", {
      value: "alpha",
    }),
    /synthetic process crash/,
  );
  assert.equal(invocations.length, 0);
  await assert.rejects(
    executor({ repository, effectDefinition }).effect("fixture.call", {
      value: "alpha",
    }),
    (error) => {
      assert.ok(error instanceof DurableEffectRetryScheduledError);
      assert.equal(error.availableAt.toISOString(), "2026-07-16T10:00:02.000Z");
      return true;
    },
  );
  assert.equal(invocations.length, 0);
  repository.setDatabaseNow("2026-07-16T10:00:03.000Z");

  const recovered = await executor({ repository, effectDefinition }).effect(
    "fixture.call",
    { value: "alpha" },
  );
  assert.deepEqual(recovered, { receiptId: "receipt-1" });
  assert.equal(invocations.length, 1);
  assert.equal(repository.prepares.length, 3);
  assert.equal(
    repository.prepares[0].effectKey,
    repository.prepares[2].effectKey,
  );
  assert.equal(
    repository.prepares[0].payloadFingerprint,
    repository.prepares[2].payloadFingerprint,
  );
});

test("an ambiguous accepted call may replay, but always with the same key and payload", async () => {
  const repository = new MemoryEffectRepository();
  const calls: Array<{ key: string; payload: unknown }> = [];
  const effectDefinition = definition({
    invoke: async (payload, context) => {
      calls.push({ key: context.effectKey, payload });
      if (calls.length === 1) throw new Error("connection cut after accept");
      return { receiptId: "logical-receipt" };
    },
  });
  await assert.rejects(
    executor({ repository, effectDefinition }).effect("fixture.call", {
      value: "alpha",
    }),
    DurableEffectRetryScheduledError,
  );
  repository.setDatabaseNow("2026-07-16T10:00:03.000Z");
  const recovered = await executor({ repository, effectDefinition }).effect(
    "fixture.call",
    { value: "alpha" },
  );
  assert.deepEqual(recovered, { receiptId: "logical-receipt" });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], calls[1]);
  assert.equal(repository.completions.length, 1);
});

test("read-only and definitive rejection policies follow the bounded retry matrix", async () => {
  const readRepository = new MemoryEffectRepository();
  let readCalls = 0;
  const readDefinition = definition({
    safety: { kind: "read_only", retry: "bounded" },
    invoke: async () => {
      readCalls += 1;
      if (readCalls === 1) throw new Error("transient read failure");
      return { receiptId: "read-receipt" };
    },
  });
  await assert.rejects(
    executor({
      repository: readRepository,
      effectDefinition: readDefinition,
    }).effect("fixture.call", { value: "alpha" }),
    DurableEffectRetryScheduledError,
  );
  readRepository.setDatabaseNow("2026-07-16T10:00:03.000Z");
  await executor({
    repository: readRepository,
    effectDefinition: readDefinition,
  }).effect("fixture.call", { value: "alpha" });
  assert.equal(readCalls, 2);

  const rejectedRepository = new MemoryEffectRepository();
  let mutationCalls = 0;
  const rejectedDefinition = definition({
    invoke: async () => {
      mutationCalls += 1;
      throw new Error("request rejected before commit");
    },
  });
  rejectedDefinition.classify = () => ({
    kind: "definitive_rejection",
    code: "request_invalid",
    retryable: false,
  });
  await assert.rejects(
    executor({
      repository: rejectedRepository,
      effectDefinition: rejectedDefinition,
    }).effect("fixture.call", { value: "alpha" }),
    (error) =>
      error instanceof DurableEffectTerminalError &&
      error.code === "request_invalid",
  );
  await assert.rejects(
    executor({
      repository: rejectedRepository,
      effectDefinition: rejectedDefinition,
    }).effect("fixture.call", { value: "alpha" }),
    DurableEffectTerminalError,
  );
  assert.equal(mutationCalls, 1);
});

test("a stored receipt survives a crash before run checkpoint and causes zero new I/O", async () => {
  const repository = new MemoryEffectRepository();
  let calls = 0;
  const effectDefinition = definition({
    invoke: async () => {
      calls += 1;
      return { receiptId: "receipt-sticky" };
    },
  });
  await executor({ repository, effectDefinition }).effect("fixture.call", {
    value: "alpha",
  });
  const replayed = await executor({ repository, effectDefinition }).effect(
    "fixture.call",
    { value: "alpha" },
  );
  assert.deepEqual(replayed, { receiptId: "receipt-sticky" });
  assert.equal(calls, 1);
});

test("payload drift conflicts before a second provider call", async () => {
  const repository = new MemoryEffectRepository();
  let calls = 0;
  const effectDefinition = definition({
    invoke: async () => {
      calls += 1;
      return { receiptId: "receipt-sticky" };
    },
  });
  await executor({ repository, effectDefinition }).effect("fixture.call", {
    value: "alpha",
  });
  await assert.rejects(
    executor({ repository, effectDefinition }).effect("fixture.call", {
      value: "beta",
    }),
    (error) =>
      error instanceof DurableEffectTerminalError &&
      error.code === "execution_effect_conflict",
  );
  assert.equal(calls, 1);
});

test("reconcile found persists a validated receipt without invoking", async () => {
  const repository = new MemoryEffectRepository();
  repository.crashAfterPrepare = true;
  let invokes = 0;
  let reconciles = 0;
  const effectDefinition = definition({
    safety: {
      kind: "reconcile_before_replay",
      delivery: "at_least_once_attempts",
      lookup: "by_effect_key",
      absenceMustBeAuthoritative: true,
    },
    invoke: async () => {
      invokes += 1;
      return { receiptId: "unexpected" };
    },
    reconcile: async () => {
      reconciles += 1;
      return { kind: "found", receipt: { receiptId: "reconciled" } };
    },
  });
  await assert.rejects(
    executor({ repository, effectDefinition }).effect("fixture.call", {
      value: "alpha",
    }),
  );
  repository.setDatabaseNow("2026-07-16T10:00:03.000Z");
  const receipt = await executor({ repository, effectDefinition }).effect(
    "fixture.call",
    { value: "alpha" },
  );
  assert.deepEqual(receipt, { receiptId: "reconciled" });
  assert.equal(reconciles, 1);
  assert.equal(invokes, 0);
});

test("reconcile not_found alone authorizes the next invocation", async () => {
  const repository = new MemoryEffectRepository();
  repository.crashAfterPrepare = true;
  let invokes = 0;
  const effectDefinition = definition({
    safety: {
      kind: "reconcile_before_replay",
      delivery: "at_least_once_attempts",
      lookup: "by_effect_key",
      absenceMustBeAuthoritative: true,
    },
    invoke: async () => {
      invokes += 1;
      return { receiptId: "after-absence" };
    },
    reconcile: async () => ({ kind: "not_found" }),
  });
  await assert.rejects(
    executor({ repository, effectDefinition }).effect("fixture.call", {
      value: "alpha",
    }),
  );
  repository.setDatabaseNow("2026-07-16T10:00:03.000Z");
  const receipt = await executor({ repository, effectDefinition }).effect(
    "fixture.call",
    { value: "alpha" },
  );
  assert.deepEqual(receipt, { receiptId: "after-absence" });
  assert.equal(invokes, 1);
  assert.deepEqual(
    repository.reconciles.map((value) => value.outcome),
    ["not_found"],
  );
});

test("reconcile unknown or error requeues and never becomes not_found", async () => {
  for (const reconcile of [
    async () => ({ kind: "unknown" as const, retryAfterMs: 2_000 }),
    async () => {
      throw new Error("lookup timeout");
    },
  ]) {
    const repository = new MemoryEffectRepository();
    repository.crashAfterPrepare = true;
    let invokes = 0;
    const effectDefinition = definition({
      safety: {
        kind: "reconcile_before_replay",
        delivery: "at_least_once_attempts",
        lookup: "by_effect_key",
        absenceMustBeAuthoritative: true,
      },
      invoke: async () => {
        invokes += 1;
        return { receiptId: "unexpected" };
      },
      reconcile,
    });
    await assert.rejects(
      executor({ repository, effectDefinition }).effect("fixture.call", {
        value: "alpha",
      }),
    );
    repository.setDatabaseNow("2026-07-16T10:00:03.000Z");
    await assert.rejects(
      executor({ repository, effectDefinition }).effect("fixture.call", {
        value: "alpha",
      }),
      DurableEffectRetryScheduledError,
    );
    assert.equal(invokes, 0);
    assert.equal(repository.reconciles.at(-1)?.outcome, "unknown");
  }
});

test("reconcile unknown backoff advances from each renewed database lease snapshot", async () => {
  const repository = new MemoryEffectRepository();
  repository.crashAfterPrepare = true;
  let reconciles = 0;
  let invokes = 0;
  const effectDefinition = definition({
    safety: {
      kind: "reconcile_before_replay",
      delivery: "at_least_once_attempts",
      lookup: "by_effect_key",
      absenceMustBeAuthoritative: true,
    },
    invoke: async () => {
      invokes += 1;
      return { receiptId: "unexpected" };
    },
    reconcile: async () => {
      reconciles += 1;
      return { kind: "unknown", retryAfterMs: 2_000 };
    },
  });
  await assert.rejects(
    executor({ repository, effectDefinition }).effect("fixture.call", {
      value: "alpha",
    }),
  );

  repository.setDatabaseNow("2026-07-16T10:00:03.000Z");
  await assert.rejects(
    executor({ repository, effectDefinition }).effect("fixture.call", {
      value: "alpha",
    }),
    DurableEffectRetryScheduledError,
  );
  assert.equal(repository.effect?.availableAt, "2026-07-16T10:00:05.000Z");
  assert.equal(reconciles, 1);

  await assert.rejects(
    executor({ repository, effectDefinition }).effect("fixture.call", {
      value: "alpha",
    }),
    DurableEffectRetryScheduledError,
  );
  assert.equal(reconciles, 1, "future backoff must not hammer reconciliation");

  repository.setDatabaseNow("2026-07-16T10:00:05.000Z");
  await assert.rejects(
    executor({ repository, effectDefinition }).effect("fixture.call", {
      value: "alpha",
    }),
    DurableEffectRetryScheduledError,
  );
  assert.equal(repository.effect?.availableAt, "2026-07-16T10:00:07.000Z");
  assert.equal(reconciles, 2);
  assert.equal(invokes, 0);
});

test("an abort queued before the SDK microtask prevents invoke and reconcile I/O", async () => {
  const abortingScheduler: DurableEffectDeadlineScheduler = {
    setTimeout(callback) {
      queueMicrotask(callback);
      return callback;
    },
    clearTimeout() {},
  };
  const repository = new MemoryEffectRepository();
  let invokes = 0;
  let reconciles = 0;
  const effectDefinition = definition({
    safety: {
      kind: "reconcile_before_replay",
      delivery: "at_least_once_attempts",
      lookup: "by_effect_key",
      absenceMustBeAuthoritative: true,
    },
    invoke: async () => {
      invokes += 1;
      return { receiptId: "unexpected" };
    },
    reconcile: async () => {
      reconciles += 1;
      return { kind: "unknown" };
    },
  });

  await assert.rejects(
    executor({
      repository,
      effectDefinition,
      scheduler: abortingScheduler,
    }).effect("fixture.call", { value: "alpha" }),
    DurableEffectRetryScheduledError,
  );
  assert.equal(invokes, 0);

  repository.setDatabaseNow("2026-07-16T10:00:03.000Z");
  await assert.rejects(
    executor({
      repository,
      effectDefinition,
      scheduler: abortingScheduler,
    }).effect("fixture.call", { value: "alpha" }),
    DurableEffectRetryScheduledError,
  );
  assert.equal(reconciles, 0);
  assert.equal(invokes, 0);
  assert.equal(repository.reconciles.at(-1)?.outcome, "unknown");
});

test("SDK timeout cannot pin the executor and a late response never completes", async () => {
  const repository = new MemoryEffectRepository();
  const scheduler = new ManualDeadlineScheduler();
  let resolveProvider!: (value: { receiptId: string }) => void;
  const provider = new Promise<{ receiptId: string }>((resolve) => {
    resolveProvider = resolve;
  });
  const effectDefinition = definition({ invoke: async () => provider });
  const pending = executor({
    repository,
    effectDefinition,
    scheduler,
  }).effect("fixture.call", { value: "alpha" });
  await new Promise((resolve) => setImmediate(resolve));
  scheduler.fire();
  await assert.rejects(pending, DurableEffectRetryScheduledError);
  assert.equal(repository.completions.length, 0);
  assert.equal(repository.failures[0]?.classification, "outcome_unknown");
  resolveProvider({ receiptId: "too-late" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(repository.completions.length, 0);
});

test("a stale owner discards a response before completion", async () => {
  const repository = new MemoryEffectRepository();
  const lease = new FakeLease();
  lease.loseAtRenewal = 2;
  const effectDefinition = definition({
    invoke: async () => ({ receiptId: "late-owner" }),
  });
  await assert.rejects(
    executor({ repository, effectDefinition, lease }).effect("fixture.call", {
      value: "alpha",
    }),
    (error) =>
      error instanceof Error && error.name === "ExecutionLeaseLostError",
  );
  assert.equal(repository.completions.length, 0);
});

test("stored receipts are revalidated and malformed storage causes zero I/O", async () => {
  const repository = new MemoryEffectRepository();
  const effectDefinition = definition();
  await executor({ repository, effectDefinition }).effect("fixture.call", {
    value: "alpha",
  });
  assert.ok(repository.effect);
  repository.effect = {
    ...repository.effect,
    receipt: { unexpected: "raw" },
  };
  let calls = 0;
  effectDefinition.invoke = async () => {
    calls += 1;
    return { receiptId: "unexpected" };
  };
  await assert.rejects(
    executor({ repository, effectDefinition }).effect("fixture.call", {
      value: "alpha",
    }),
    (error) =>
      error instanceof DurableEffectTerminalError &&
      error.code === "effect_receipt_invalid",
  );
  assert.equal(calls, 0);
});

test("capability credentials resolve only inside the binding and never enter durable rows", async () => {
  const repository = new MemoryEffectRepository();
  const secret = "fixture-runtime-credential-value";
  let resolvedReference: string | undefined;
  const effectDefinition = definition({
    invoke: async (_payload, context) => {
      const credentials = await context.credentials.resolve("credential-ref-1");
      assert.equal(credentials.authorization, secret);
      return { receiptId: "credential-receipt" };
    },
  });
  await executor({
    repository,
    effectDefinition,
    credentialProvider: {
      async resolve(reference) {
        resolvedReference = reference;
        return { authorization: secret };
      },
    },
  }).effect("fixture.call", { value: "alpha" });
  assert.equal(resolvedReference, "credential-ref-1");
  assert.equal(JSON.stringify(repository).includes(secret), false);
});

test("capability suspension requeues before prepare using the DB clock anchor", async () => {
  const repository = new MemoryEffectRepository();
  const appNow = new Date("2040-01-01T00:00:00.000Z");
  const suspended: DurableCapabilityPolicy = {
    mayAdmit: () => true,
    mayDrain: () => "temporarily_suspended",
  };
  await assert.rejects(
    executor({
      repository,
      effectDefinition: definition(),
      policy: suspended,
      now: () => appNow,
    }).effect("fixture.call", { value: "alpha" }),
    (error) => {
      assert.ok(error instanceof DurableEffectRetryScheduledError);
      assert.equal(error.currentStep, "awaiting_capability");
      assert.equal(error.availableAt.toISOString(), "2026-07-16T10:01:00.000Z");
      return true;
    },
  );
  assert.equal(repository.prepares.length, 0);
});

test("ambiguous retry waits for the DB effect deadline even with extreme app skew", async () => {
  const repository = new MemoryEffectRepository();
  const appNow = new Date("2040-01-01T00:00:00.000Z");
  const effectDefinition = definition({
    invoke: async () => {
      throw new Error("ambiguous");
    },
  });
  await assert.rejects(
    executor({
      repository,
      effectDefinition,
      now: () => appNow,
    }).effect("fixture.call", { value: "alpha" }),
    (error) => {
      assert.ok(error instanceof DurableEffectRetryScheduledError);
      assert.equal(error.availableAt.toISOString(), "2026-07-16T10:00:02.000Z");
      return true;
    },
  );
  assert.equal(
    repository.failures[0]?.availableAt?.toISOString(),
    "2026-07-16T10:00:00.500Z",
  );
});

test("target uncertainty reconciles once before terminalizing and never invokes again", async () => {
  const repository = new MemoryEffectRepository();
  let calls = 0;
  let reconcileCalls = 0;
  const effectDefinition = definition({
    maxAttempts: 1,
    invoke: async () => {
      calls += 1;
      throw new Error("unknown outcome");
    },
    reconcile: async () => {
      reconcileCalls += 1;
      return { kind: "unknown" };
    },
  });
  await assert.rejects(
    executor({ repository, effectDefinition }).effect("fixture.call", {
      value: "alpha",
    }),
    DurableEffectRetryScheduledError,
  );
  assert.equal(repository.effect?.status, "uncertain");
  assert.equal(reconcileCalls, 0);

  repository.setDatabaseNow("2026-07-16T10:00:03.000Z");
  await assert.rejects(
    executor({ repository, effectDefinition }).effect("fixture.call", {
      value: "alpha",
    }),
    (error) =>
      error instanceof DurableEffectTerminalError &&
      error.code === "effect_outcome_unknown",
  );
  await assert.rejects(
    executor({ repository, effectDefinition }).effect("fixture.call", {
      value: "alpha",
    }),
    DurableEffectTerminalError,
  );
  assert.equal(calls, 1);
  assert.equal(reconcileCalls, 1);
  assert.deepEqual(
    repository.reconciles.map((value) => value.outcome),
    ["unknown"],
  );
});

test("target final reconciliation recovers found or confirms exhausted absence without replay", async (t) => {
  for (const reconcileOutcome of ["found", "not_found"] as const) {
    await t.test(reconcileOutcome, async () => {
      const repository = new MemoryEffectRepository();
      let invokeCalls = 0;
      let reconcileCalls = 0;
      const effectDefinition = definition({
        maxAttempts: 1,
        invoke: async () => {
          invokeCalls += 1;
          throw new Error("accepted but response lost");
        },
        reconcile: async () => {
          reconcileCalls += 1;
          return reconcileOutcome === "found"
            ? {
                kind: "found" as const,
                receipt: { receiptId: "recovered-target-receipt" },
              }
            : { kind: "not_found" as const };
        },
      });

      await assert.rejects(
        executor({ repository, effectDefinition }).effect("fixture.call", {
          value: "alpha",
        }),
        DurableEffectRetryScheduledError,
      );
      repository.setDatabaseNow("2026-07-16T10:00:03.000Z");

      if (reconcileOutcome === "found") {
        assert.deepEqual(
          await executor({ repository, effectDefinition }).effect(
            "fixture.call",
            { value: "alpha" },
          ),
          { receiptId: "recovered-target-receipt" },
        );
        assert.equal(repository.effect?.status, "succeeded");
      } else {
        await assert.rejects(
          executor({ repository, effectDefinition }).effect("fixture.call", {
            value: "alpha",
          }),
          (error) =>
            error instanceof DurableEffectTerminalError &&
            error.code === "effect_attempts_exhausted",
        );
        assert.equal(repository.effect?.status, "failed");
      }
      assert.equal(invokeCalls, 1);
      assert.equal(reconcileCalls, 1);
      assert.deepEqual(
        repository.reconciles.map((value) => value.outcome),
        [reconcileOutcome],
      );
    });
  }
});

test("target receipt conflict is terminal, increments reconciliation and never invokes again", async () => {
  const repository = new MemoryEffectRepository();
  let invokeCalls = 0;
  let reconcileCalls = 0;
  const effectDefinition = definition({
    maxAttempts: 1,
    invoke: async () => {
      invokeCalls += 1;
      throw new Error("accepted but response lost");
    },
    reconcile: async () => {
      reconcileCalls += 1;
      return {
        kind: "conflict",
        code: "fixture_idempotency_conflict",
      };
    },
  });

  await assert.rejects(
    executor({ repository, effectDefinition }).effect("fixture.call", {
      value: "alpha",
    }),
    DurableEffectRetryScheduledError,
  );
  repository.setDatabaseNow("2026-07-16T10:00:03.000Z");
  await assert.rejects(
    executor({ repository, effectDefinition }).effect("fixture.call", {
      value: "alpha",
    }),
    (error) =>
      error instanceof DurableEffectTerminalError &&
      error.code === "fixture_idempotency_conflict",
  );
  await assert.rejects(
    executor({ repository, effectDefinition }).effect("fixture.call", {
      value: "alpha",
    }),
    DurableEffectTerminalError,
  );

  assert.equal(invokeCalls, 1);
  assert.equal(reconcileCalls, 1);
  assert.equal(repository.effect?.status, "failed");
  assert.equal(repository.effect?.reconcileCount, 1);
  assert.equal(
    repository.effect?.lastErrorCode,
    "fixture_idempotency_conflict",
  );
  assert.deepEqual(
    repository.reconciles.map((value) => ({
      outcome: value.outcome,
      errorCode: value.errorCode,
    })),
    [
      {
        outcome: "conflict",
        errorCode: "fixture_idempotency_conflict",
      },
    ],
  );
});

test("target final reconciliation preserves fencing and cancellation before terminal mutation", async (t) => {
  for (const interruption of ["lease_lost", "cancellation"] as const) {
    await t.test(interruption, async () => {
      const repository = new MemoryEffectRepository();
      let invokeCalls = 0;
      let reconcileCalls = 0;
      const effectDefinition = definition({
        maxAttempts: 1,
        invoke: async () => {
          invokeCalls += 1;
          throw new Error("accepted but response lost");
        },
        reconcile: async () => {
          reconcileCalls += 1;
          return { kind: "unknown" };
        },
      });
      await assert.rejects(
        executor({ repository, effectDefinition }).effect("fixture.call", {
          value: "alpha",
        }),
        DurableEffectRetryScheduledError,
      );
      repository.setDatabaseNow("2026-07-16T10:00:03.000Z");

      const lease = new FakeLease();
      lease.run = executionRun({ updatedAt: repository.databaseNow });
      if (interruption === "lease_lost") {
        lease.loseAtRenewal = 5;
      } else {
        const renew = lease.renew.bind(lease);
        lease.renew = async () => {
          await renew();
          if (lease.renewals === 5) {
            lease.run = executionRun(
              cancellationRequestedRun({
                updatedAt: repository.databaseNow,
              }),
            );
          }
        };
      }

      await assert.rejects(
        executor({ repository, effectDefinition, lease }).effect(
          "fixture.call",
          { value: "alpha" },
        ),
        (error) =>
          interruption === "lease_lost"
            ? error instanceof Error && error.name === "ExecutionLeaseLostError"
            : error instanceof DurableCancellationPendingError,
      );
      assert.equal(invokeCalls, 1);
      assert.equal(reconcileCalls, 1);
      assert.deepEqual(
        repository.reconciles.map((value) => value.outcome),
        ["unknown"],
      );
      assert.equal(repository.failures.length, 1);
      assert.equal(repository.effect?.status, "uncertain");
      assert.equal(
        repository.effect?.lastErrorCode,
        "effect_reconcile_unknown",
      );
    });
  }
});

class EngineRepository extends MemoryEffectRepository {
  run = executionRun({ status: "queued", leaseOwner: undefined });
  terminalProjection: ExecutionTerminalProjection | null = null;
  claimed = false;
  requeues: RequeueExecutionRunInput[] = [];
  finishes: FinishExecutionRunInput[] = [];
  checkpoints: CheckpointExecutionRunInput[] = [];
  order: string[] = [];
  cancellationAcks: string[] = [];
  blocks: BlockExecutionRunInput[] = [];
  blockEvents: Array<"run.blocked" | "run.cancelled"> = [];
  resumes: ResumeBlockedExecutionRunInput[] = [];
  rejectCancellationAcknowledgement = false;
  rejectBlock = false;
  cancelBeforeBlock = false;
  cancelBeforeFinish = false;

  private createTerminalProjection(): ExecutionTerminalProjection {
    if (
      this.run.status !== "completed" &&
      this.run.status !== "partial" &&
      this.run.status !== "failed" &&
      this.run.status !== "cancelled"
    ) {
      throw new Error("terminal projection requires a terminal run");
    }
    const projection: ExecutionTerminalProjection = {
      runId: this.run.id,
      tenantKey: this.run.tenantKey,
      operation: this.run.operation,
      mode: this.run.mode,
      terminalStatus: this.run.status,
      state: "pending",
      availableAt: this.databaseNow,
      claimCount: 0,
      createdAt: this.databaseNow,
      updatedAt: this.databaseNow,
    };
    this.terminalProjection = projection;
    return projection;
  }

  private projectionMatches(input: {
    tenantKey: string;
    operation: string;
    mode: string;
    runId?: string;
  }): boolean {
    return Boolean(
      this.terminalProjection &&
      input.tenantKey === this.terminalProjection.tenantKey &&
      input.operation === this.terminalProjection.operation &&
      input.mode === this.terminalProjection.mode &&
      (!input.runId || input.runId === this.terminalProjection.runId),
    );
  }

  async requestRunCancellation(input: {
    cancellationId: string;
    actor: ExecutionCancellationActor;
    reasonCode: ExecutionCancellationReasonCode;
  }) {
    if (this.run.status === "running") {
      this.run = {
        ...this.run,
        cancelRequestId: input.cancellationId,
        cancelRequestedAt: databaseNow,
        cancelRequestedBy: input.actor,
        cancelReasonCode: input.reasonCode,
      };
      return {
        run: this.run,
        cancellationId: input.cancellationId,
        disposition: "requested" as const,
        replayed: false,
      };
    }
    if (this.run.status === "queued" || this.run.status === "blocked") {
      this.run = {
        ...this.run,
        status: "cancelled",
        blockedReasonCode: undefined,
        blockedAt: undefined,
        cancelRequestId: input.cancellationId,
        cancelRequestedAt: databaseNow,
        cancelRequestedBy: input.actor,
        cancelReasonCode: input.reasonCode,
        cancelAcknowledgedAt: databaseNow,
        finishedAt: databaseNow,
      };
      const terminalProjection = this.createTerminalProjection();
      return {
        run: this.run,
        cancellationId: input.cancellationId,
        disposition: "cancelled" as const,
        replayed: false,
        terminalProjection,
      };
    }
    return null;
  }

  async acknowledgeRunCancellation(input: {
    token: string;
    cancellationId: string;
    safePoint: string;
  }) {
    if (
      this.rejectCancellationAcknowledgement ||
      input.token !== "opaque-lease-token" ||
      this.run.status !== "running" ||
      this.run.cancelRequestId !== input.cancellationId ||
      this.run.cancelAcknowledgedAt
    ) {
      return null;
    }
    this.cancellationAcks.push(input.safePoint);
    this.run = {
      ...this.run,
      status: "cancelled",
      cancelAcknowledgedAt: databaseNow,
    };
    const terminalProjection = this.createTerminalProjection();
    return {
      run: this.run,
      cancellationId: input.cancellationId,
      disposition: "cancelled" as const,
      replayed: false,
      terminalProjection,
    };
  }

  override async prepareEffect(input: PrepareExecutionEffectInput) {
    if (this.run.cancelRequestedAt && !this.run.cancelAcknowledgedAt) {
      return null;
    }
    return super.prepareEffect(input);
  }

  async claimNextRun(): Promise<ExecutionLeaseReceipt | null> {
    if (
      this.claimed ||
      (this.run.status !== "queued" && this.run.status !== "running")
    ) {
      return null;
    }
    this.claimed = true;
    this.run = {
      ...this.run,
      status: "running",
      leaseOwner: "worker-fixture",
      claimCount: this.run.claimCount + 1,
      updatedAt: databaseNow,
    };
    return {
      run: this.run,
      token: "opaque-lease-token",
      expiresAt: "2099-07-16T10:00:00.000Z",
      recovered: false,
    };
  }
  async renewRunLease(input: { token: string }) {
    this.run = {
      ...this.run,
      updatedAt: this.databaseNow,
    };
    return {
      run: this.run,
      token: input.token,
      expiresAt: "2099-07-16T10:00:00.000Z",
      recovered: false,
    };
  }
  async checkpointRun(input: CheckpointExecutionRunInput) {
    this.checkpoints.push(input);
    this.order.push(`checkpoint:${input.currentStep}`);
    this.run = {
      ...this.run,
      currentStep: input.currentStep,
      ...(input.incrementHandlerAttempt
        ? { handlerAttempt: this.run.handlerAttempt + 1 }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(input, "output")
        ? { output: input.output }
        : {}),
    };
    return this.run;
  }
  async requeueRun(input: RequeueExecutionRunInput) {
    this.requeues.push(input);
    if (this.run.cancelRequestedAt && !this.run.cancelAcknowledgedAt) {
      return null;
    }
    this.run = {
      ...this.run,
      status: "queued",
      currentStep: input.currentStep,
    };
    return this.run;
  }
  async blockRun(input: BlockExecutionRunInput) {
    this.blocks.push(input);
    if (
      this.rejectBlock ||
      input.token !== "opaque-lease-token" ||
      this.run.status !== "running"
    ) {
      return null;
    }
    if (this.cancelBeforeBlock && !this.run.cancelRequestedAt) {
      this.run = {
        ...this.run,
        cancelRequestId: "cancel_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        cancelRequestedAt: databaseNow,
        cancelRequestedBy: { type: "user", id: "operator-fixture" },
        cancelReasonCode: "user_requested",
      };
    }
    if (this.run.cancelRequestedAt && !this.run.cancelAcknowledgedAt) {
      this.run = {
        ...this.run,
        status: "cancelled",
        blockedReasonCode: undefined,
        blockedAt: undefined,
        leaseOwner: undefined,
        leaseExpiresAt: undefined,
        cancelAcknowledgedAt: this.databaseNow,
        finishedAt: this.databaseNow,
        updatedAt: this.databaseNow,
      };
      this.blockEvents.push("run.cancelled");
      const terminalProjection = this.createTerminalProjection();
      return { ...this.run, terminalProjection };
    }
    this.run = {
      ...this.run,
      status: "blocked",
      blockedReasonCode: input.reasonCode,
      blockedAt: this.databaseNow,
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
      finishedAt: undefined,
      updatedAt: this.databaseNow,
    };
    this.blockEvents.push("run.blocked");
    return this.run;
  }
  async resumeBlockedRun(input: ResumeBlockedExecutionRunInput) {
    this.resumes.push(input);
    if (
      this.run.status !== "blocked" ||
      this.run.blockedReasonCode !== input.expectedReasonCode ||
      this.run.cancelRequestedAt
    ) {
      return null;
    }
    this.run = {
      ...this.run,
      status: "queued",
      blockedReasonCode: undefined,
      blockedAt: undefined,
      availableAt: this.databaseNow,
      updatedAt: this.databaseNow,
    };
    this.claimed = false;
    return this.run;
  }
  async finishRun(input: FinishExecutionRunInput) {
    this.finishes.push(input);
    this.order.push("finish");
    if (this.cancelBeforeFinish && !this.run.cancelRequestedAt) {
      this.run = {
        ...this.run,
        cancelRequestId: "cancel_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        cancelRequestedAt: databaseNow,
        cancelRequestedBy: { type: "user", id: "operator-fixture" },
        cancelReasonCode: "user_requested",
      };
    }
    if (this.run.cancelRequestedAt && !this.run.cancelAcknowledgedAt) {
      return null;
    }
    this.run = {
      ...this.run,
      status: input.status,
      currentStep: input.currentStep,
      output: input.output,
    };
    const terminalProjection = this.createTerminalProjection();
    return { ...this.run, terminalProjection };
  }

  async claimTerminalProjection(input: {
    tenantKey: string;
    operation: string;
    mode: string;
    runId: string;
    workerId: string;
  }) {
    if (
      !this.projectionMatches(input) ||
      !this.terminalProjection ||
      (this.terminalProjection.state !== "pending" &&
        this.terminalProjection.state !== "retry_wait")
    ) {
      return null;
    }
    this.terminalProjection = {
      ...this.terminalProjection,
      state: "running",
      claimCount: this.terminalProjection.claimCount + 1,
      leaseOwner: input.workerId,
      leaseExpiresAt: "2099-07-16T10:00:00.000Z",
      lastAttemptAt: this.databaseNow,
      updatedAt: this.databaseNow,
    };
    return {
      projection: this.terminalProjection,
      run: this.run,
      token: "opaque-projection-token",
      expiresAt: "2099-07-16T10:00:00.000Z",
      recovered: false,
    };
  }

  async claimNextTerminalProjection(input: {
    tenantKey: string;
    operation: string;
    mode: string;
    workerId: string;
  }) {
    if (!this.terminalProjection) return null;
    return this.claimTerminalProjection({
      ...input,
      runId: this.terminalProjection.runId,
    });
  }

  async renewTerminalProjectionLease(input: {
    tenantKey: string;
    operation: string;
    mode: string;
    runId: string;
    token: string;
  }) {
    if (
      !this.projectionMatches(input) ||
      input.token !== "opaque-projection-token" ||
      !this.terminalProjection ||
      this.terminalProjection.state !== "running"
    ) {
      return null;
    }
    this.terminalProjection = {
      ...this.terminalProjection,
      leaseExpiresAt: "2099-07-16T10:00:00.000Z",
      updatedAt: this.databaseNow,
    };
    return {
      projection: this.terminalProjection,
      run: this.run,
      token: input.token,
      expiresAt: "2099-07-16T10:00:00.000Z",
      recovered: false,
    };
  }

  async acknowledgeTerminalProjection(input: {
    tenantKey: string;
    operation: string;
    mode: string;
    runId: string;
    token: string;
  }) {
    if (
      !this.projectionMatches(input) ||
      input.token !== "opaque-projection-token" ||
      !this.terminalProjection ||
      this.terminalProjection.state !== "running"
    ) {
      return null;
    }
    this.terminalProjection = {
      ...this.terminalProjection,
      state: "succeeded",
      projectedAt: this.databaseNow,
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
      updatedAt: this.databaseNow,
    };
    return this.terminalProjection;
  }

  async requeueTerminalProjection(input: {
    tenantKey: string;
    operation: string;
    mode: string;
    runId: string;
    token: string;
    errorCode: string;
  }) {
    if (
      !this.projectionMatches(input) ||
      input.token !== "opaque-projection-token" ||
      !this.terminalProjection ||
      this.terminalProjection.state !== "running"
    ) {
      return null;
    }
    this.terminalProjection = {
      ...this.terminalProjection,
      state: "retry_wait",
      availableAt: this.databaseNow,
      lastErrorCode: input.errorCode,
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
      updatedAt: this.databaseNow,
    };
    return this.terminalProjection;
  }

  async blockTerminalProjection(input: {
    tenantKey: string;
    operation: string;
    mode: string;
    runId: string;
    token: string;
    errorCode: string;
  }) {
    if (
      !this.projectionMatches(input) ||
      input.token !== "opaque-projection-token" ||
      !this.terminalProjection ||
      this.terminalProjection.state !== "running"
    ) {
      return null;
    }
    this.terminalProjection = {
      ...this.terminalProjection,
      state: "blocked",
      lastErrorCode: input.errorCode,
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
      updatedAt: this.databaseNow,
    };
    return this.terminalProjection;
  }

  async getTerminalProjectionForScope(input: {
    tenantKey: string;
    operation: string;
    mode: string;
    runId: string;
  }) {
    return this.projectionMatches(input) ? this.terminalProjection : null;
  }

  async getBlockedTerminalProjectionForScope(input: {
    tenantKey: string;
    operation: string;
    mode: string;
  }) {
    return this.projectionMatches(input) &&
      this.terminalProjection?.state === "blocked"
      ? this.terminalProjection
      : null;
  }
}

function engineRepository(
  repository: EngineRepository,
): ExecutionControlRepository {
  return repository as unknown as ExecutionControlRepository;
}

function stampV2Run(
  repository: EngineRepository,
  registry: DurableExecutionRegistry,
  overrides: Partial<ExecutionRun> = {},
): void {
  repository.run = executionRun({
    status: "queued",
    leaseOwner: undefined,
    metadata: {
      executionContractVersion: 2,
      executionHandlerVersion: 2,
      executionPolicyFingerprint: registry.executionPolicyFingerprint(
        scope.operation,
        2,
      ),
      ...commandContractMetadata(),
    },
    ...overrides,
  });
}

function cancellationRequestedRun(
  overrides: Partial<ExecutionRun> = {},
): Partial<ExecutionRun> {
  return {
    cancelRequestId: "cancel_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    cancelRequestedAt: databaseNow,
    cancelRequestedBy: { type: "user", id: "operator-fixture" },
    cancelReasonCode: "user_requested",
    ...overrides,
  };
}

function engineFor(
  repository: EngineRepository,
  registry: DurableExecutionRegistry,
  options: {
    deadlineScheduler?: DurableEffectDeadlineScheduler;
    cancellationRepository?: false;
    now?: () => Date;
  } = {},
): DurableExecutionEngine {
  const controlRepository = engineRepository(repository);
  return new DurableExecutionEngine({
    repository: controlRepository,
    effectRepository: repository,
    ...(options.cancellationRepository === false
      ? {}
      : { cancellationRepository: repository }),
    capabilityPolicy: allowPolicy,
    registry,
    scope,
    workerId: "worker-fixture",
    leaseMs: 60_000,
    maxAttempts: 3,
    handlerTimeoutMs: 10_000,
    deadlineScheduler: options.deadlineScheduler,
    now: options.now,
  });
}

function seedPreparedEffect(
  repository: EngineRepository,
  effectDefinition: ReturnType<typeof definition>,
  overrides: Partial<ExecutionEffect> = {},
): void {
  const parsedPayload = parseDurableJsonContractValue(
    effectDefinition.payload,
    { value: "alpha" },
    "effect_payload",
  );
  repository.effect = effectRow(
    {
      ...scope,
      runId: repository.run.id,
      token: "opaque-lease-token",
      stepKey: effectDefinition.step,
      effectKey: `${scope.operation}:run:${repository.run.id}:step:${effectDefinition.step}:v2`,
      handlerVersion: 2,
      definitionVersion: effectDefinition.definitionVersion,
      capability: effectDefinition.capability,
      safety: effectDefinition.safety.kind,
      payloadSchemaVersion: parsedPayload.schemaVersion,
      payloadFingerprint: parsedPayload.fingerprint,
      policyFingerprint: durableEffectPolicyFingerprint(effectDefinition),
      receiptSchemaVersion: effectDefinition.receipt.schemaVersion,
      deadlineMs: effectDefinition.timeoutMs,
      maxAttempts: effectDefinition.retry.maxAttempts,
    },
    overrides,
  );
}

test("engine resolves contract v2, executes only through context.effect, and validates result", async () => {
  const repository = new EngineRepository();
  const effectDefinition = definition({
    invoke: async () => {
      repository.order.push("invoke");
      assert.ok(repository.effect);
      return { receiptId: "engine-receipt" };
    },
  });
  const registry = new DurableExecutionRegistry().register(
    handlerFor(effectDefinition),
  );
  repository.run = executionRun({
    status: "queued",
    leaseOwner: undefined,
    metadata: {
      executionContractVersion: 2,
      executionHandlerVersion: 2,
      executionPolicyFingerprint: registry.executionPolicyFingerprint(
        scope.operation,
        2,
      ),
      ...commandContractMetadata(),
    },
  });
  const engine = new DurableExecutionEngine({
    repository: engineRepository(repository),
    effectRepository: repository,
    capabilityPolicy: allowPolicy,
    registry,
    scope,
    workerId: "worker-fixture",
    leaseMs: 60_000,
    maxAttempts: 3,
    handlerTimeoutMs: 10_000,
  });
  const outcome = await engine.processNext();
  assert.equal(outcome.kind, "completed");
  assert.deepEqual(repository.run.output, { receiptId: "engine-receipt" });
  assert.ok(repository.order.indexOf("invoke") > 0);
  assert.ok(
    repository.order.indexOf("finish") > repository.order.indexOf("invoke"),
  );
});

test("runtime drains a fire-and-forget effect before terminalizing the run", async () => {
  const repository = new EngineRepository();
  let announceStarted!: () => void;
  let releaseProvider!: (value: { receiptId: string }) => void;
  const started = new Promise<void>((resolve) => {
    announceStarted = resolve;
  });
  const provider = new Promise<{ receiptId: string }>((resolve) => {
    releaseProvider = resolve;
  });
  const effectDefinition = definition({
    invoke: async () => {
      announceStarted();
      return provider;
    },
  });
  const fireAndForget = handlerFor(
    effectDefinition,
    async (command, context) => {
      void context.effect("fixture.call", command);
      return { output: { receiptId: "handler-finished" } };
    },
  );
  const registry = new DurableExecutionRegistry().register(fireAndForget);
  stampV2Run(repository, registry);

  let settled = false;
  const processing = engineFor(repository, registry)
    .processNext()
    .finally(() => {
      settled = true;
    });
  await started;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, false);
  assert.equal(repository.finishes.length, 0);

  releaseProvider({ receiptId: "provider-finished" });
  const outcome = await processing;
  assert.equal(outcome.kind, "completed");
  assert.equal(repository.completions.length, 1);
  assert.deepEqual(repository.effect?.receipt, {
    receiptId: "provider-finished",
  });
});

test("runtime rethrows an effect retry even when the handler swallows it", async () => {
  const repository = new EngineRepository();
  let invokes = 0;
  const effectDefinition = definition({
    invoke: async () => {
      invokes += 1;
      throw new Error("accepted but response lost");
    },
  });
  const swallowingHandler = handlerFor(
    effectDefinition,
    async (command, context) => {
      try {
        await context.effect("fixture.call", command);
      } catch {
        // A product adapter cannot convert an effect control outcome to success.
      }
      return { output: { receiptId: "incorrect-success" } };
    },
  );
  const registry = new DurableExecutionRegistry().register(swallowingHandler);
  stampV2Run(repository, registry);

  const outcome = await engineFor(repository, registry).processNext();
  assert.equal(outcome.kind, "requeued");
  assert.equal(invokes, 1);
  assert.equal(repository.finishes.length, 0);
  assert.equal(repository.effect?.status, "uncertain");
});

test("concurrent calls for one effect step drain accepted I/O before requeue", async () => {
  const repository = new EngineRepository();
  let announceStarted!: () => void;
  let releaseProvider!: (value: { receiptId: string }) => void;
  const started = new Promise<void>((resolve) => {
    announceStarted = resolve;
  });
  const provider = new Promise<{ receiptId: string }>((resolve) => {
    releaseProvider = resolve;
  });
  let invokes = 0;
  const effectDefinition = definition({
    invoke: async () => {
      invokes += 1;
      announceStarted();
      return provider;
    },
  });
  const concurrentHandler = handlerFor(
    effectDefinition,
    async (command, context) => {
      const first = context.effect("fixture.call", command);
      const second = context.effect("fixture.call", command);
      const [receipt] = await Promise.all([first, second]);
      return { output: receipt };
    },
  );
  const registry = new DurableExecutionRegistry().register(concurrentHandler);
  stampV2Run(repository, registry);

  let settled = false;
  const processing = engineFor(repository, registry)
    .processNext()
    .finally(() => {
      settled = true;
    });
  await started;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, false);
  assert.equal(repository.finishes.length, 0);

  releaseProvider({ receiptId: "accepted" });
  const outcome = await processing;
  assert.equal(outcome.kind, "requeued");
  assert.equal(invokes, 1);
  assert.equal(repository.effect?.attemptCount, 1);
  assert.equal(repository.completions.length, 1);
  assert.equal(repository.finishes.length, 0);
});

test("final invoke uncertainty remains reconcilable without replay", async (t) => {
  for (const reconcileOutcome of ["found", "not_found"] as const) {
    await t.test(reconcileOutcome, async () => {
      const repository = new EngineRepository();
      let invokes = 0;
      let reconciles = 0;
      const effectDefinition = definition({
        maxAttempts: 1,
        safety: {
          kind: "reconcile_before_replay",
          delivery: "at_least_once_attempts",
          lookup: "by_effect_key",
          absenceMustBeAuthoritative: true,
        },
        invoke: async () => {
          invokes += 1;
          throw new Error("accepted but response lost");
        },
        reconcile: async () => {
          reconciles += 1;
          return reconcileOutcome === "found"
            ? {
                kind: "found" as const,
                receipt: { receiptId: "recovered-final-attempt" },
              }
            : { kind: "not_found" as const };
        },
      });
      const registry = new DurableExecutionRegistry().register(
        handlerFor(effectDefinition),
      );
      stampV2Run(repository, registry);

      const first = await engineFor(repository, registry).processNext();
      assert.equal(first.kind, "requeued");
      assert.equal(repository.effect?.status, "uncertain");
      assert.equal(repository.effect?.attemptCount, 1);
      assert.equal(repository.finishes.length, 0);

      repository.claimed = false;
      repository.setDatabaseNow("2026-07-16T10:00:03.000Z");
      const recovered = await engineFor(repository, registry).processNext();

      assert.equal(invokes, 1, "reconciliation must never replay final I/O");
      assert.equal(reconciles, 1);
      if (reconcileOutcome === "found") {
        assert.equal(recovered.kind, "completed");
        assert.equal(repository.effect?.status, "succeeded");
      } else {
        assert.equal(recovered.kind, "failed");
        assert.equal(repository.effect?.status, "failed");
        assert.equal(
          repository.effect?.lastErrorCode,
          "effect_attempts_exhausted",
        );
      }
    });
  }
});

test("engine blocks v2 fail-closed when effect repository or policy is missing", async () => {
  for (const missing of ["policy", "repository"] as const) {
    const repository = new EngineRepository();
    const registry = new DurableExecutionRegistry().register(
      handlerFor(definition()),
    );
    stampV2Run(repository, registry);
    const controlOnlyRepository = {
      claimNextRun: repository.claimNextRun.bind(repository),
      renewRunLease: repository.renewRunLease.bind(repository),
      checkpointRun: repository.checkpointRun.bind(repository),
      requeueRun: repository.requeueRun.bind(repository),
      finishRun: repository.finishRun.bind(repository),
      requestRunCancellation:
        repository.requestRunCancellation.bind(repository),
      acknowledgeRunCancellation:
        repository.acknowledgeRunCancellation.bind(repository),
      blockRun: repository.blockRun.bind(repository),
      resumeBlockedRun: repository.resumeBlockedRun.bind(repository),
    } as unknown as ExecutionControlRepository;
    const engine = new DurableExecutionEngine({
      repository:
        missing === "repository"
          ? controlOnlyRepository
          : engineRepository(repository),
      ...(missing === "repository" ? { capabilityPolicy: allowPolicy } : {}),
      registry,
      scope,
      workerId: "worker-fixture",
      leaseMs: 60_000,
      maxAttempts: 3,
    });
    const outcome = await engine.processNext();
    assert.equal(outcome.kind, "blocked");
    assert.equal(outcome.blockReasonCode, "runtime_authority_unavailable");
    assert.equal(repository.prepares.length, 0);
    assert.equal(repository.requeues.length, 0);
    assert.equal(repository.blocks.length, 1);
  }
});

test("contract-v2 runtime requires fenced block authority before startup", () => {
  const repository = new EngineRepository();
  const registry = new DurableExecutionRegistry().register(
    handlerFor(definition()),
  );
  stampV2Run(repository, registry);
  const withoutBlockAuthority = {
    claimNextRun: repository.claimNextRun.bind(repository),
    renewRunLease: repository.renewRunLease.bind(repository),
    checkpointRun: repository.checkpointRun.bind(repository),
    requeueRun: repository.requeueRun.bind(repository),
    finishRun: repository.finishRun.bind(repository),
  } as unknown as ExecutionControlRepository;

  assert.throws(
    () =>
      new DurableExecutionEngine({
        repository: withoutBlockAuthority,
        registry,
        scope,
        workerId: "worker-fixture",
        leaseMs: 60_000,
        maxAttempts: 3,
      }),
    DurableExecutionBlockAuthorityUnavailableError,
  );
});

test("deterministic handler and persisted policy incompatibilities block with zero I/O", async (t) => {
  const cases: Array<{
    name: string;
    reasonCode:
      | "handler_version_invalid"
      | "handler_contract_unsupported"
      | "handler_contract_mismatch"
      | "execution_policy_mismatch";
    mutate(metadata: Record<string, unknown>): void;
  }> = [
    {
      name: "invalid handler version",
      reasonCode: "handler_version_invalid",
      mutate(metadata) {
        metadata.executionHandlerVersion = 0;
      },
    },
    {
      name: "unsupported contract",
      reasonCode: "handler_contract_unsupported",
      mutate(metadata) {
        metadata.executionContractVersion = 99;
      },
    },
    {
      name: "handler contract mismatch",
      reasonCode: "handler_contract_mismatch",
      mutate(metadata) {
        metadata.executionContractVersion = 1;
      },
    },
    {
      name: "persisted policy mismatch",
      reasonCode: "execution_policy_mismatch",
      mutate(metadata) {
        metadata.executionPolicyFingerprint = "0".repeat(64);
      },
    },
  ];

  for (const fixture of cases) {
    await t.test(fixture.name, async () => {
      const repository = new EngineRepository();
      let handlerCalls = 0;
      let providerCalls = 0;
      const effectDefinition = definition({
        invoke: async () => {
          providerCalls += 1;
          return { receiptId: "unexpected" };
        },
      });
      const registeredHandler = handlerFor(effectDefinition, async () => {
        handlerCalls += 1;
        return { output: { receiptId: "unexpected" } };
      });
      const registry = new DurableExecutionRegistry().register(
        registeredHandler,
      );
      stampV2Run(repository, registry);
      const metadata = { ...repository.run.metadata };
      fixture.mutate(metadata);
      repository.run = { ...repository.run, metadata };

      const outcome = await engineFor(repository, registry).processNext();

      assert.equal(outcome.kind, "blocked");
      assert.equal(outcome.blockReasonCode, fixture.reasonCode);
      assert.equal(repository.run.status, "blocked");
      assert.equal(repository.run.blockedReasonCode, fixture.reasonCode);
      assert.equal(repository.blocks.length, 1);
      assert.equal(repository.blockEvents.length, 1);
      assert.equal(repository.requeues.length, 0);
      assert.equal(repository.checkpoints.length, 0);
      assert.equal(repository.finishes.length, 0);
      assert.equal(repository.prepares.length, 0);
      assert.equal(handlerCalls, 0);
      assert.equal(providerCalls, 0);
    });
  }
});

test("handler and effect mutation after registration both block as policy drift with zero I/O", async (t) => {
  for (const drift of ["handler", "effect"] as const) {
    await t.test(drift, async () => {
      const repository = new EngineRepository();
      let handlerCalls = 0;
      let providerCalls = 0;
      const effectDefinition = definition({
        invoke: async () => {
          providerCalls += 1;
          return { receiptId: "unexpected" };
        },
      });
      const registeredHandler = handlerFor(effectDefinition, async () => {
        handlerCalls += 1;
        return { output: { receiptId: "unexpected" } };
      });
      const registry = new DurableExecutionRegistry().register(
        registeredHandler,
      );
      stampV2Run(repository, registry);
      if (drift === "effect") {
        effectDefinition.timeoutMs += 1;
      } else {
        (registeredHandler.command.bounds as { maxBytes: number }).maxBytes +=
          1;
      }

      const outcome = await engineFor(repository, registry).processNext();

      assert.equal(outcome.kind, "blocked");
      assert.equal(outcome.blockReasonCode, "execution_policy_mismatch");
      assert.equal(repository.blocks.length, 1);
      assert.equal(repository.blockEvents.length, 1);
      assert.equal(repository.requeues.length, 0);
      assert.equal(repository.prepares.length, 0);
      assert.equal(handlerCalls, 0);
      assert.equal(providerCalls, 0);
    });
  }
});

test("stale block fence loses ownership without block mutation, event, or I/O", async () => {
  const repository = new EngineRepository();
  repository.rejectBlock = true;
  let handlerCalls = 0;
  let providerCalls = 0;
  const registeredHandler = handlerFor(
    definition({
      invoke: async () => {
        providerCalls += 1;
        return { receiptId: "unexpected" };
      },
    }),
    async () => {
      handlerCalls += 1;
      return { output: { receiptId: "unexpected" } };
    },
  );
  const registry = new DurableExecutionRegistry().register(registeredHandler);
  stampV2Run(repository, registry, {
    metadata: {
      ...repository.run.metadata,
      executionContractVersion: 2,
      executionHandlerVersion: 2,
      executionPolicyFingerprint: "0".repeat(64),
      ...commandContractMetadata(),
    },
  });

  const outcome = await engineFor(repository, registry).processNext();

  assert.equal(outcome.kind, "lease_lost");
  assert.equal(repository.run.status, "running");
  assert.equal(repository.run.blockedReasonCode, undefined);
  assert.equal(repository.blocks.length, 1);
  assert.equal(repository.blockEvents.length, 0);
  assert.equal(repository.requeues.length, 0);
  assert.equal(repository.prepares.length, 0);
  assert.equal(handlerCalls, 0);
  assert.equal(providerCalls, 0);
});

test("exact-scope resume retries a repaired command and reaches compatible success", async () => {
  const repository = new EngineRepository();
  let handlerCalls = 0;
  const registeredHandler = handlerFor(definition(), async () => {
    handlerCalls += 1;
    return { output: { receiptId: "repaired" } };
  });
  const registry = new DurableExecutionRegistry().register(registeredHandler);
  stampV2Run(repository, registry, {
    metadata: {
      executionContractVersion: 2,
      executionHandlerVersion: 2,
      executionPolicyFingerprint: "0".repeat(64),
      ...commandContractMetadata(),
    },
  });

  const blocked = await engineFor(repository, registry).processNext();
  assert.equal(blocked.kind, "blocked");
  assert.equal(blocked.blockReasonCode, "execution_policy_mismatch");
  repository.run = {
    ...repository.run,
    metadata: {
      ...repository.run.metadata,
      executionPolicyFingerprint: registry.executionPolicyFingerprint(
        scope.operation,
        2,
      ),
    },
  };
  const resumed = await repository.resumeBlockedRun({
    ...scope,
    runId: repository.run.id,
    expectedReasonCode: "execution_policy_mismatch",
  });
  assert.equal(resumed?.status, "queued");

  const completed = await engineFor(repository, registry).processNext();

  assert.equal(completed.kind, "completed");
  assert.equal(repository.run.status, "completed");
  assert.equal(handlerCalls, 1);
  assert.equal(repository.resumes.length, 1);
});

test("cancel arriving at block CAS converges to terminal outbox and never reclaims", async () => {
  const repository = new EngineRepository();
  repository.cancelBeforeBlock = true;
  let handlerCalls = 0;
  let providerCalls = 0;
  const registeredHandler = handlerFor(
    definition({
      invoke: async () => {
        providerCalls += 1;
        return { receiptId: "unexpected" };
      },
    }),
    async () => {
      handlerCalls += 1;
      return { output: { receiptId: "unexpected" } };
    },
  );
  const registry = new DurableExecutionRegistry().register(registeredHandler);
  stampV2Run(repository, registry, {
    metadata: {
      executionContractVersion: 2,
      executionHandlerVersion: 2,
      executionPolicyFingerprint: "0".repeat(64),
      ...commandContractMetadata(),
    },
  });

  const raced = await engineFor(repository, registry).processNext();

  assert.equal(raced.kind, "projection_pending");
  assert.equal(repository.run.status, "cancelled");
  assert.ok(repository.run.cancelAcknowledgedAt);
  assert.equal(repository.run.blockedReasonCode, undefined);
  assert.equal(repository.terminalProjection?.state, "pending");
  assert.deepEqual(repository.blockEvents, ["run.cancelled"]);
  assert.equal(repository.blocks.length, 1);
  assert.equal(handlerCalls, 0);
  assert.equal(providerCalls, 0);
  assert.equal(repository.prepares.length, 0);

  repository.claimed = false;
  const reclaimed = await engineFor(repository, registry).processNext();
  assert.equal(reclaimed.kind, "idle");
  assert.equal(repository.blocks.length, 1);
});

test("an operator can cancel a blocked managed-v2 run immediately", async () => {
  const repository = new EngineRepository();
  const registry = new DurableExecutionRegistry().register(
    handlerFor(definition()),
  );
  stampV2Run(repository, registry, {
    metadata: {
      executionContractVersion: 2,
      executionHandlerVersion: 2,
      executionPolicyFingerprint: "0".repeat(64),
      ...commandContractMetadata(),
    },
  });
  const blocked = await engineFor(repository, registry).processNext();
  assert.equal(blocked.kind, "blocked");

  const cancelled = await repository.requestRunCancellation({
    ...scope,
    runId: repository.run.id,
    cancellationId: "cancel_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    actor: { type: "user", id: "operator-fixture" },
    reasonCode: "user_requested",
  });

  assert.equal(cancelled?.disposition, "cancelled");
  assert.equal(repository.run.status, "cancelled");
  assert.equal(repository.run.blockedReasonCode, undefined);
  assert.equal(repository.run.blockedAt, undefined);
  assert.equal(repository.terminalProjection?.terminalStatus, "cancelled");
  assert.equal(repository.terminalProjection?.state, "pending");
});

test("v2 command metadata mismatch fails closed before handler or effect I/O", async () => {
  const mutations: Array<(metadata: Record<string, unknown>) => void> = [
    (metadata) => {
      delete metadata.executionCommandFingerprint;
    },
    (metadata) => {
      metadata.executionCommandFingerprint = "0".repeat(64);
    },
    (metadata) => {
      delete metadata.executionCommandSchemaVersion;
    },
    (metadata) => {
      metadata.executionCommandSchemaVersion = 999;
    },
  ];

  for (const mutate of mutations) {
    const repository = new EngineRepository();
    let handlerCalls = 0;
    let providerCalls = 0;
    const effectDefinition = definition({
      invoke: async () => {
        providerCalls += 1;
        return { receiptId: "unexpected" };
      },
    });
    const registeredHandler = handlerFor(effectDefinition, async () => {
      handlerCalls += 1;
      return { output: { receiptId: "unexpected" } };
    });
    const registry = new DurableExecutionRegistry().register(registeredHandler);
    stampV2Run(repository, registry);
    const metadata = { ...repository.run.metadata };
    mutate(metadata);
    repository.run = { ...repository.run, metadata };

    const outcome = await engineFor(repository, registry).processNext();
    assert.equal(outcome.kind, "blocked");
    assert.equal(outcome.blockReasonCode, "command_contract_mismatch");
    assert.equal(repository.blocks.length, 1);
    assert.equal(repository.requeues.length, 0);
    assert.equal(handlerCalls, 0);
    assert.equal(providerCalls, 0);
    assert.equal(repository.prepares.length, 0);
    assert.equal(repository.checkpoints.length, 0);
    assert.equal(repository.finishes.length, 0);
  }
});

test("v2 command parser drift is detected against the admitted fingerprint", async () => {
  const repository = new EngineRepository();
  let drifted = false;
  let handlerCalls = 0;
  let providerCalls = 0;
  const effectDefinition = definition({
    invoke: async () => {
      providerCalls += 1;
      return { receiptId: "unexpected" };
    },
  });
  const driftHandler = handlerFor(effectDefinition, async () => {
    handlerCalls += 1;
    return { output: { receiptId: "unexpected" } };
  });
  driftHandler.command = closedObjectContract((value) => {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      typeof (value as { value?: unknown }).value !== "string" ||
      Object.keys(value).some((key) => key !== "value")
    ) {
      throw new Error("invalid command");
    }
    const parsed = (value as { value: string }).value;
    return { value: drifted ? parsed.toUpperCase() : parsed };
  });
  const registry = new DurableExecutionRegistry().register(driftHandler);
  const admitted = parseDurableJsonContractValue(
    driftHandler.command,
    { value: "alpha" },
    "command",
  );
  stampV2Run(repository, registry, {
    metadata: {
      authority: "execution_ledger_v2",
      executionContractVersion: 2,
      executionHandlerVersion: 2,
      executionPolicyFingerprint: registry.executionPolicyFingerprint(
        scope.operation,
        2,
      ),
      executionCommandFingerprint: admitted.fingerprint,
      executionCommandSchemaVersion: admitted.schemaVersion,
    },
  });
  drifted = true;

  const outcome = await engineFor(repository, registry).processNext();
  assert.equal(outcome.kind, "blocked");
  assert.equal(outcome.blockReasonCode, "command_contract_mismatch");
  assert.equal(repository.blocks.length, 1);
  assert.equal(handlerCalls, 0);
  assert.equal(providerCalls, 0);
  assert.equal(repository.prepares.length, 0);
  assert.equal(repository.checkpoints.length, 0);
  assert.equal(repository.finishes.length, 0);
});

test("unknown contract-v2 handler version is preserved for a compatible worker", async () => {
  const repository = new EngineRepository();
  repository.run = executionRun({
    status: "queued",
    metadata: {
      authority: "execution_ledger_v2",
      executionContractVersion: 2,
      executionHandlerVersion: 99,
    },
  });
  const registry = new DurableExecutionRegistry().register(
    handlerFor(definition()),
  );
  const engine = new DurableExecutionEngine({
    repository: engineRepository(repository),
    effectRepository: repository,
    capabilityPolicy: allowPolicy,
    registry,
    scope,
    workerId: "worker-fixture",
    leaseMs: 60_000,
    maxAttempts: 3,
  });
  const outcome = await engine.processNext();
  assert.equal(outcome.kind, "handler_unavailable");
  assert.equal(repository.requeues[0]?.currentStep, "awaiting_handler");
  assert.equal(repository.finishes.length, 0);
});

test("invalid v2 result and secret classifier diagnostics finish safely instead of stranding", async () => {
  const repository = new EngineRepository();
  const effectDefinition = definition();
  const invalid = handlerFor(effectDefinition, async () => {
    return {
      status: "completed",
      unexpected: true,
    } as unknown as DurableExecutionResult<{
      receiptId: string;
    }>;
  });
  invalid.classifyPureError = () => ({
    code: "result_invalid",
    retryable: false,
    message: "Bearer fixture-secret-token-value",
    output: { authorization: "Bearer fixture-secret-token-value" },
    eventData: { token: "fixture-secret-token-value" },
  });
  const registry = new DurableExecutionRegistry().register(invalid);
  repository.run = executionRun({
    status: "queued",
    leaseOwner: undefined,
    metadata: {
      executionContractVersion: 2,
      executionHandlerVersion: 2,
      executionPolicyFingerprint: registry.executionPolicyFingerprint(
        scope.operation,
        2,
      ),
      ...commandContractMetadata(),
    },
  });
  const engine = new DurableExecutionEngine({
    repository: engineRepository(repository),
    effectRepository: repository,
    capabilityPolicy: allowPolicy,
    registry,
    scope,
    workerId: "worker-fixture",
    leaseMs: 60_000,
    maxAttempts: 3,
  });
  const outcome = await engine.processNext();
  assert.equal(outcome.kind, "failed");
  assert.equal(repository.run.status, "failed");
  assert.deepEqual(repository.run.output, { errorCode: "result_invalid" });
  assert.equal(
    JSON.stringify(repository.finishes).includes("fixture-secret-token-value"),
    false,
  );
});

test("v2 classifier codes are redacted, normalized, and bounded before persistence", async () => {
  const repository = new EngineRepository();
  const effectDefinition = definition();
  const invalid = handlerFor(effectDefinition, async () => {
    throw new Error("synthetic pure failure");
  });
  invalid.classifyPureError = () => ({
    code: `Bearer fixture-secret-token-value ${"x".repeat(512)}`,
    retryable: false,
    message: "synthetic failure",
  });
  const registry = new DurableExecutionRegistry().register(invalid);
  stampV2Run(repository, registry);

  const outcome = await engineFor(repository, registry).processNext();

  assert.equal(outcome.kind, "failed");
  const persistedCode = (repository.run.output as { errorCode: string })
    .errorCode;
  assert.match(persistedCode, /^[a-z][a-z0-9._-]{0,127}$/);
  assert.ok(persistedCode.length <= 128);
  assert.equal(persistedCode.includes("fixture-secret-token-value"), false);
  assert.equal(
    JSON.stringify(repository.finishes).includes("fixture-secret-token-value"),
    false,
  );
});

test("checkpoint preserves and validates explicit null event data", async () => {
  const repository = new EngineRepository();
  const effectDefinition = definition();
  const checkpointing = handlerFor(
    effectDefinition,
    async (command, context) => {
      await context.checkpoint("fixture.checkpoint", command, {
        type: "fixture.checkpointed",
        data: null,
      });
      return { output: { receiptId: "checkpointed" } };
    },
  );
  const registry = new DurableExecutionRegistry().register(checkpointing);
  repository.run = executionRun({
    status: "queued",
    leaseOwner: undefined,
    metadata: {
      executionContractVersion: 2,
      executionHandlerVersion: 2,
      executionPolicyFingerprint: registry.executionPolicyFingerprint(
        scope.operation,
        2,
      ),
      ...commandContractMetadata(),
    },
  });
  const engine = new DurableExecutionEngine({
    repository: engineRepository(repository),
    effectRepository: repository,
    capabilityPolicy: allowPolicy,
    registry,
    scope,
    workerId: "worker-fixture",
    leaseMs: 60_000,
    maxAttempts: 3,
  });
  const outcome = await engine.processNext();
  assert.equal(outcome.kind, "completed");
  const checkpoint = repository.checkpoints.find(
    (value) => value.currentStep === "fixture.checkpoint",
  );
  assert.ok(checkpoint);
  assert.equal(
    Object.prototype.hasOwnProperty.call(checkpoint, "eventData"),
    true,
  );
  assert.equal(checkpoint.eventData, null);
});

test("cancellation before the handler acknowledges with zero handler or provider I/O", async () => {
  const repository = new EngineRepository();
  let handlerCalls = 0;
  let providerCalls = 0;
  const effectDefinition = definition({
    invoke: async () => {
      providerCalls += 1;
      return { receiptId: "unexpected" };
    },
  });
  const handler = handlerFor(effectDefinition, async () => {
    handlerCalls += 1;
    return { output: { receiptId: "unexpected" } };
  });
  const registry = new DurableExecutionRegistry().register(handler);
  stampV2Run(repository, registry, cancellationRequestedRun());

  const outcome = await engineFor(repository, registry).processNext();

  assert.equal(outcome.kind, "cancelled");
  assert.equal(repository.run.status, "cancelled");
  assert.equal(handlerCalls, 0);
  assert.equal(providerCalls, 0);
  assert.equal(repository.prepares.length, 0);
  assert.deepEqual(repository.cancellationAcks, ["before_handler"]);
});

test("cancellation during invoke persists the accepted receipt before acknowledging", async () => {
  const repository = new EngineRepository();
  let providerCalls = 0;
  let announceStarted!: () => void;
  let releaseProvider!: (value: { receiptId: string }) => void;
  const started = new Promise<void>((resolve) => {
    announceStarted = resolve;
  });
  const provider = new Promise<{ receiptId: string }>((resolve) => {
    releaseProvider = resolve;
  });
  const effectDefinition = definition({
    invoke: async () => {
      providerCalls += 1;
      announceStarted();
      return provider;
    },
  });
  const registry = new DurableExecutionRegistry().register(
    handlerFor(effectDefinition),
  );
  stampV2Run(repository, registry);
  const processing = engineFor(repository, registry).processNext();
  await started;
  await repository.requestRunCancellation({
    cancellationId: "cancel_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    actor: { type: "user", id: "operator-fixture" },
    reasonCode: "user_requested",
  });
  releaseProvider({ receiptId: "accepted-before-cancel" });

  const outcome = await processing;

  assert.equal(outcome.kind, "cancelled");
  assert.equal(providerCalls, 1);
  assert.equal(repository.completions.length, 1);
  assert.deepEqual(repository.effect?.receipt, {
    receiptId: "accepted-before-cancel",
  });
  assert.equal(repository.run.status, "cancelled");
  assert.equal(repository.finishes.length, 0);
});

test("recovered cancellation reconciles found or not_found and never invokes", async (t) => {
  for (const outcomeKind of ["found", "not_found"] as const) {
    await t.test(outcomeKind, async () => {
      const repository = new EngineRepository();
      let providerCalls = 0;
      let reconcileCalls = 0;
      const effectDefinition = definition({
        maxAttempts: 1,
        safety: {
          kind: "reconcile_before_replay",
          delivery: "at_least_once_attempts",
          lookup: "by_effect_key",
          absenceMustBeAuthoritative: true,
        },
        invoke: async () => {
          providerCalls += 1;
          return { receiptId: "unexpected" };
        },
        reconcile: async () => {
          reconcileCalls += 1;
          return outcomeKind === "found"
            ? {
                kind: "found" as const,
                receipt: { receiptId: "recovered-receipt" },
              }
            : { kind: "not_found" as const };
        },
      });
      const registry = new DurableExecutionRegistry().register(
        handlerFor(effectDefinition),
      );
      stampV2Run(repository, registry, cancellationRequestedRun());
      seedPreparedEffect(repository, effectDefinition);
      repository.setDatabaseNow("2026-07-16T10:00:06.000Z");

      const outcome = await engineFor(repository, registry).processNext();

      assert.equal(outcome.kind, "cancelled");
      assert.equal(repository.run.status, "cancelled");
      assert.equal(providerCalls, 0);
      assert.equal(reconcileCalls, 1);
      assert.deepEqual(
        repository.reconciles.map((value) => value.outcome),
        [outcomeKind],
      );
      if (outcomeKind === "found") {
        assert.deepEqual(repository.effect?.receipt, {
          receiptId: "recovered-receipt",
        });
      }
    });
  }
});

test("unknown reconciliation keeps cancellation pending and recoverable without replay", async () => {
  const repository = new EngineRepository();
  let providerCalls = 0;
  let reconcileCalls = 0;
  const effectDefinition = definition({
    maxAttempts: 1,
    safety: {
      kind: "reconcile_before_replay",
      delivery: "at_least_once_attempts",
      lookup: "by_effect_key",
      absenceMustBeAuthoritative: true,
    },
    invoke: async () => {
      providerCalls += 1;
      return { receiptId: "unexpected" };
    },
    reconcile: async () => {
      reconcileCalls += 1;
      return { kind: "unknown", retryAfterMs: 2_000 };
    },
  });
  const registry = new DurableExecutionRegistry().register(
    handlerFor(effectDefinition),
  );
  stampV2Run(repository, registry, cancellationRequestedRun());
  seedPreparedEffect(repository, effectDefinition);
  repository.setDatabaseNow("2026-07-16T10:00:06.000Z");

  const outcome = await engineFor(repository, registry).processNext();

  assert.equal(outcome.kind, "cancellation_pending");
  assert.equal(repository.run.status, "running");
  assert.equal(repository.run.cancelAcknowledgedAt, undefined);
  assert.equal(providerCalls, 0);
  assert.deepEqual(
    repository.reconciles.map((value) => value.outcome),
    ["unknown"],
  );
  assert.equal(reconcileCalls, 1);
  assert.equal(repository.effect?.attemptCount, 1);
  assert.equal(repository.effect?.availableAt, "2026-07-16T10:00:08.000Z");

  repository.claimed = false;
  const waiting = await engineFor(repository, registry).processNext();
  assert.equal(waiting.kind, "cancellation_pending");
  assert.equal(
    reconcileCalls,
    1,
    "future backoff must not hammer cancellation",
  );

  repository.claimed = false;
  repository.setDatabaseNow("2026-07-16T10:00:08.000Z");
  const retried = await engineFor(repository, registry).processNext();
  assert.equal(retried.kind, "cancellation_pending");
  assert.equal(reconcileCalls, 2);
  assert.equal(repository.effect?.availableAt, "2026-07-16T10:00:10.000Z");
  assert.equal(providerCalls, 0);
});

test("cancellation drain honors future reconcile backoff using the DB clock", async () => {
  const repository = new EngineRepository();
  let providerCalls = 0;
  let reconcileCalls = 0;
  const effectDefinition = definition({
    safety: {
      kind: "reconcile_before_replay",
      delivery: "at_least_once_attempts",
      lookup: "by_effect_key",
      absenceMustBeAuthoritative: true,
    },
    invoke: async () => {
      providerCalls += 1;
      return { receiptId: "unexpected" };
    },
    reconcile: async () => {
      reconcileCalls += 1;
      return { kind: "unknown" };
    },
  });
  const registry = new DurableExecutionRegistry().register(
    handlerFor(effectDefinition),
  );
  stampV2Run(repository, registry, cancellationRequestedRun());
  seedPreparedEffect(repository, effectDefinition, {
    status: "uncertain",
    lastErrorCode: "effect_reconcile_unknown",
    availableAt: "2026-07-16T10:30:00.000Z",
  });

  const outcome = await engineFor(repository, registry, {
    now: () => new Date("2040-01-01T00:00:00.000Z"),
  }).processNext();

  assert.equal(outcome.kind, "cancellation_pending");
  assert.equal(repository.run.status, "running");
  assert.equal(providerCalls, 0);
  assert.equal(reconcileCalls, 0);
  assert.equal(repository.reconciles.length, 0);
});

test("target ambiguity reconciles before cancellation and never false-acknowledges or invokes", async () => {
  const repository = new EngineRepository();
  let providerCalls = 0;
  let reconcileCalls = 0;
  const effectDefinition = definition({
    invoke: async () => {
      providerCalls += 1;
      return { receiptId: "unexpected" };
    },
    reconcile: async () => {
      reconcileCalls += 1;
      return { kind: "unknown" };
    },
  });
  const registry = new DurableExecutionRegistry().register(
    handlerFor(effectDefinition),
  );
  stampV2Run(repository, registry, cancellationRequestedRun());
  seedPreparedEffect(repository, effectDefinition);
  repository.setDatabaseNow("2026-07-16T10:00:06.000Z");

  const outcome = await engineFor(repository, registry).processNext();

  assert.equal(outcome.kind, "cancellation_pending");
  assert.equal(repository.run.status, "running");
  assert.equal(repository.cancellationAcks.length, 0);
  assert.equal(providerCalls, 0);
  assert.equal(reconcileCalls, 1);
});

test("terminal outcome_unknown and corrupted static identity both block cancellation acknowledgement", async () => {
  const ambiguousRepository = new MemoryEffectRepository();
  let reconcileCalls = 0;
  const ambiguousDefinition = definition({
    maxAttempts: 1,
    invoke: async () => {
      throw new Error("accepted but response lost");
    },
    reconcile: async () => {
      reconcileCalls += 1;
      return { kind: "unknown" };
    },
  });
  await assert.rejects(
    executor({
      repository: ambiguousRepository,
      effectDefinition: ambiguousDefinition,
    }).effect("fixture.call", { value: "alpha" }),
    DurableEffectRetryScheduledError,
  );
  ambiguousRepository.setDatabaseNow("2026-07-16T10:00:03.000Z");
  await assert.rejects(
    executor({
      repository: ambiguousRepository,
      effectDefinition: ambiguousDefinition,
    }).effect("fixture.call", { value: "alpha" }),
    DurableEffectTerminalError,
  );
  assert.equal(reconcileCalls, 1);
  assert.equal(ambiguousRepository.effect?.status, "failed");
  assert.equal(
    ambiguousRepository.effect?.lastErrorCode,
    "effect_outcome_unknown",
  );
  assert.equal(
    await executor({
      repository: ambiguousRepository,
      effectDefinition: ambiguousDefinition,
    }).cancellationCanAcknowledge(),
    false,
  );

  const corruptRepository = new MemoryEffectRepository();
  const stableDefinition = definition();
  await executor({
    repository: corruptRepository,
    effectDefinition: stableDefinition,
  }).effect("fixture.call", { value: "alpha" });
  assert.ok(corruptRepository.effect);
  corruptRepository.effect = {
    ...corruptRepository.effect,
    capability: "fixture.corrupted.capability",
  };
  assert.equal(
    await executor({
      repository: corruptRepository,
      effectDefinition: stableDefinition,
    }).cancellationCanAcknowledge(),
    false,
  );
});

test("stale cancellation token loses the fence and does not mutate terminal state", async () => {
  const repository = new EngineRepository();
  repository.rejectCancellationAcknowledgement = true;
  const effectDefinition = definition();
  const registry = new DurableExecutionRegistry().register(
    handlerFor(effectDefinition),
  );
  stampV2Run(repository, registry, cancellationRequestedRun());

  const outcome = await engineFor(repository, registry).processNext();

  assert.equal(outcome.kind, "lease_lost");
  assert.equal(repository.run.status, "running");
  assert.equal(repository.run.cancelAcknowledgedAt, undefined);
});

test("cancellation wins a concurrent finish through the repository CAS", async () => {
  const repository = new EngineRepository();
  repository.cancelBeforeFinish = true;
  const effectDefinition = definition();
  const handler = handlerFor(effectDefinition, async () => ({
    output: { receiptId: "pure-result" },
  }));
  const registry = new DurableExecutionRegistry().register(handler);
  stampV2Run(repository, registry);

  const outcome = await engineFor(repository, registry).processNext();

  assert.equal(outcome.kind, "cancelled");
  assert.equal(repository.run.status, "cancelled");
  assert.equal(repository.finishes.length, 1);
  assert.deepEqual(repository.cancellationAcks, ["finish_race"]);
});

test("contract v2 fails closed when cancellation capability is missing", async () => {
  const repository = new EngineRepository();
  let providerCalls = 0;
  const effectDefinition = definition({
    invoke: async () => {
      providerCalls += 1;
      return { receiptId: "unexpected" };
    },
  });
  const registry = new DurableExecutionRegistry().register(
    handlerFor(effectDefinition),
  );
  stampV2Run(repository, registry);
  const controlOnlyRepository = {
    claimNextRun: repository.claimNextRun.bind(repository),
    renewRunLease: repository.renewRunLease.bind(repository),
    checkpointRun: repository.checkpointRun.bind(repository),
    requeueRun: repository.requeueRun.bind(repository),
    finishRun: repository.finishRun.bind(repository),
    blockRun: repository.blockRun.bind(repository),
    resumeBlockedRun: repository.resumeBlockedRun.bind(repository),
  } as unknown as ExecutionControlRepository;
  const engine = new DurableExecutionEngine({
    repository: controlOnlyRepository,
    effectRepository: repository,
    capabilityPolicy: allowPolicy,
    registry,
    scope,
    workerId: "worker-fixture",
    leaseMs: 60_000,
    maxAttempts: 3,
  });

  const outcome = await engine.processNext();

  assert.equal(outcome.kind, "blocked");
  assert.equal(outcome.blockReasonCode, "runtime_authority_unavailable");
  assert.equal(providerCalls, 0);
  assert.equal(repository.prepares.length, 0);
  assert.equal(repository.requeues.length, 0);
});

test("cancelled terminal projection remains bounded and repairable", async () => {
  const repository = new EngineRepository();
  const scheduler = new ManualDeadlineScheduler();
  let projectionStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    projectionStarted = resolve;
  });
  const effectDefinition = definition();
  const handler = handlerFor(effectDefinition);
  handler.projectTerminal = async () => {
    projectionStarted();
    await new Promise<void>(() => undefined);
  };
  const registry = new DurableExecutionRegistry().register(handler);
  stampV2Run(repository, registry, cancellationRequestedRun());
  const processing = engineFor(repository, registry, {
    deadlineScheduler: scheduler,
  }).processNext();
  await started;
  scheduler.fire();

  const outcome = await processing;

  assert.equal(outcome.kind, "projection_pending");
  assert.equal(repository.run.status, "cancelled");
  assert.ok(outcome.error);
});
