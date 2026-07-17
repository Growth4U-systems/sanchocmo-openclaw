import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import {
  PostgresExecutionControlRepository,
  executionCommandFingerprint,
  type AcknowledgeExecutionRunCancellationInput,
  type BlockExecutionRunInput,
  type CheckpointExecutionRunInput,
  type ClaimExecutionTerminalProjectionInput,
  type ClaimNextExecutionRunInput,
  type ClaimNextExecutionTerminalProjectionInput,
  type CompleteExecutionEffectInput,
  type CreateExecutionRunInput,
  type ExecutionCancellationReceipt,
  type ExecutionControlRepository,
  type ExecutionEffect,
  type ExecutionLeaseReceipt,
  type ExecutionLeaseScope,
  type ListRunnableExecutionScopesPageInput,
  type ExecutionRun,
  type ExecutionScopedAggregateRef,
  type ExecutionScopedRunRef,
  type ExecutionTerminalProjection,
  type ExecutionTerminalProjectionLeaseMutationInput,
  type ExecutionTerminalProjectionLeaseReceipt,
  type FinishExecutionRunInput,
  type PrepareExecutionEffectInput,
  type RecordExecutionEffectFailureInput,
  type RecordExecutionEffectReconcileInput,
  type RenewExecutionRunLeaseInput,
  type RenewExecutionTerminalProjectionLeaseInput,
  type RunnableExecutionScopePage,
  type RequeueExecutionRunInput,
  type RequeueExecutionTerminalProjectionInput,
  type BlockExecutionTerminalProjectionInput,
  type RequestExecutionRunCancellationInput,
} from "@/lib/execution-control";
import {
  ExecutionCancellationConflictError,
  ExecutionCommandConflictError,
} from "@/lib/execution-control/types";
import {
  type DurableExecutionScheduler,
  type DurableExecutionScopeSupervisorScheduler,
  type DurableExecutionTerminalProjectionContext,
} from "@/lib/durable-execution";
import { DurableExecutionWorkerCapacityLimiter } from "@/lib/durable-execution/worker-capacity";
import { createLeadsApolloPeopleSearchEffect } from "../search-apollo-binding";
import {
  LEADS_APOLLO_CAPABILITY,
  LEADS_SEARCH_HANDLER_VERSION,
  LEADS_SEARCH_OPERATION,
  type LeadsSearchResultV2,
} from "../search-contract-v2";
import type {
  LeadsSearchProjectionRepository,
  UpsertLeadsSearchProjectionInput,
} from "../search-projection";
import {
  LeadsSearchError,
  admitLeadsSearch,
  cancelLeadsSearch,
  createLeadsSearchRuntimeCapabilityPolicy,
  createLeadsSearchTerminalProjector,
  getLeadsSearchOperationalReadiness,
  getLeadsSearchRuntimeReadiness,
  getLeadsSearchStatus,
  leadsSearchCapabilityPolicy,
  processNextLeadsSearchRun,
  resolveLeadsSearchPolicy,
  startLeadsSearchWorkers,
  stopLeadsSearchWorkers,
  wakeLeadsSearchWorker,
  type LeadsSearchEnvironment,
} from "../search-durable-worker";

const slug = "hospital-capilar";
const timestamp = "2026-07-16T10:00:00.000Z";
const enabledEnv: LeadsSearchEnvironment = {
  LEADS_SEARCH_DURABLE_WORKER_BOOT_ENABLED: "1",
  LEADS_SEARCH_EXECUTION_V2: "canary",
  LEADS_SEARCH_V2_SLUGS: slug,
};
const offEnv: LeadsSearchEnvironment = {
  LEADS_SEARCH_DURABLE_WORKER_BOOT_ENABLED: "1",
  LEADS_SEARCH_EXECUTION_V2: "off",
  LEADS_SEARCH_V2_SLUGS: "",
};
const bootDisabledEnv: LeadsSearchEnvironment = {
  LEADS_SEARCH_DURABLE_WORKER_BOOT_ENABLED: "0",
  LEADS_SEARCH_EXECUTION_V2: "canary",
  LEADS_SEARCH_V2_SLUGS: slug,
  APOLLO_API_KEY: "must-not-be-used",
};

const criteria = {
  titles: ["Marketing Director"],
  organizationLocations: ["Spain"],
  employeeRanges: ["11,200"],
};

function useLeadsSearchProcessEnvironment(
  t: TestContext,
  env: LeadsSearchEnvironment,
): void {
  const keys = [
    "LEADS_SEARCH_DURABLE_WORKER_BOOT_ENABLED",
    "LEADS_SEARCH_EXECUTION_V2",
    "LEADS_SEARCH_V2_SLUGS",
    "APOLLO_API_KEY",
  ] as const;
  const previous = new Map(keys.map((key) => [key, process.env[key]] as const));
  for (const key of keys) {
    const value = env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  t.after(() => {
    for (const key of keys) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

function matchesScope(
  run: ExecutionRun,
  input: {
    tenantKey: string;
    operation: string;
    mode: string;
  },
): boolean {
  return (
    run.tenantKey === input.tenantKey.trim().toLowerCase() &&
    run.operation === input.operation.trim().toLowerCase() &&
    run.mode === input.mode
  );
}

class AdmissionRepository {
  readonly runs = new Map<string, ExecutionRun>();
  readonly creates: CreateExecutionRunInput[] = [];
  readonly cancellations: RequestExecutionRunCancellationInput[] = [];
  private sequence = 0;

  async createRun(input: CreateExecutionRunInput) {
    this.creates.push(input);
    const fingerprint = executionCommandFingerprint(input);
    const existing = [...this.runs.values()].find(
      (run) =>
        matchesScope(run, {
          tenantKey: input.tenantKey,
          operation: input.operation,
          mode: input.mode ?? "shadow",
        }) &&
        run.aggregateType === input.aggregateType &&
        run.aggregateId === input.aggregateId &&
        run.idempotencyKey === input.idempotencyKey,
    );
    if (existing) {
      if (existing.commandFingerprint !== fingerprint) {
        throw new ExecutionCommandConflictError();
      }
      return { run: existing, created: false };
    }
    const run: ExecutionRun = {
      id: `xrun-${++this.sequence}`,
      tenantKey: input.tenantKey.trim().toLowerCase(),
      idempotencyKey: input.idempotencyKey,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      operation: input.operation.trim().toLowerCase(),
      mode: input.mode ?? "shadow",
      status: "queued",
      ...(input.traceId ? { traceId: input.traceId } : {}),
      input: input.input,
      metadata: input.metadata ?? {},
      commandFingerprint: fingerprint,
      availableAt: timestamp,
      claimCount: 0,
      handlerAttempt: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.runs.set(run.id, run);
    return { run, created: true };
  }

  async getRunByAggregateForScope(
    input: ExecutionScopedAggregateRef,
  ): Promise<ExecutionRun | null> {
    return (
      [...this.runs.values()].find(
        (run) =>
          matchesScope(run, input) &&
          run.aggregateType === input.aggregateType &&
          run.aggregateId === input.aggregateId,
      ) ?? null
    );
  }

  async getRunByIdForScope(
    input: ExecutionScopedRunRef,
  ): Promise<ExecutionRun | null> {
    const run = this.runs.get(input.runId);
    return run && matchesScope(run, input) ? run : null;
  }

  async requestRunCancellation(
    input: RequestExecutionRunCancellationInput,
  ): Promise<ExecutionCancellationReceipt | null> {
    this.cancellations.push(input);
    const run = await this.getRunByIdForScope(input);
    if (!run) return null;
    if (run.cancelRequestId) {
      if (
        run.cancelRequestId !== input.cancellationId ||
        run.cancelRequestedBy?.type !== input.actor.type ||
        run.cancelRequestedBy.id !== input.actor.id ||
        run.cancelReasonCode !== input.reasonCode
      ) {
        throw new ExecutionCancellationConflictError();
      }
      return {
        run,
        cancellationId: input.cancellationId,
        disposition: run.status === "cancelled" ? "cancelled" : "requested",
        replayed: true,
      };
    }
    if (
      run.status !== "queued" &&
      run.status !== "running" &&
      run.status !== "waiting_approval" &&
      run.status !== "blocked"
    ) {
      return null;
    }
    const terminal = run.status !== "running";
    const next: ExecutionRun = {
      ...run,
      status: terminal ? "cancelled" : run.status,
      cancelRequestId: input.cancellationId,
      cancelRequestedAt: timestamp,
      cancelRequestedBy: input.actor,
      cancelReasonCode: input.reasonCode,
      ...(terminal
        ? { cancelAcknowledgedAt: timestamp, finishedAt: timestamp }
        : {}),
      updatedAt: timestamp,
    };
    this.runs.set(next.id, next);
    return {
      run: next,
      cancellationId: input.cancellationId,
      disposition: terminal ? "cancelled" : "requested",
      replayed: false,
    };
  }

  asExecutionRepository(): ExecutionControlRepository {
    return this as unknown as ExecutionControlRepository;
  }
}

/** Minimal success-path Ledger used to exercise the real generic engine. */
class RuntimeRepository extends AdmissionRepository {
  readonly effects = new Map<string, ExecutionEffect>();
  readonly terminalProjections = new Map<string, ExecutionTerminalProjection>();
  private readonly leaseTokens = new Map<string, string>();
  private readonly projectionTokens = new Map<string, string>();
  private leaseSequence = 0;
  private projectionSequence = 0;

  async claimNextRun(
    input: ClaimNextExecutionRunInput,
  ): Promise<ExecutionLeaseReceipt | null> {
    const run = [...this.runs.values()].find(
      (candidate) =>
        candidate.status === "queued" && matchesScope(candidate, input),
    );
    if (!run) return null;
    const token = `lease-${++this.leaseSequence}`;
    const claimed: ExecutionRun = {
      ...run,
      status: "running",
      leaseOwner: input.workerId,
      leaseExpiresAt: "2026-07-16T10:01:00.000Z",
      claimCount: run.claimCount + 1,
      startedAt: run.startedAt ?? timestamp,
      updatedAt: timestamp,
    };
    this.runs.set(run.id, claimed);
    this.leaseTokens.set(run.id, token);
    return {
      run: claimed,
      token,
      expiresAt: claimed.leaseExpiresAt!,
      recovered: false,
    };
  }

  async renewRunLease(
    input: RenewExecutionRunLeaseInput,
  ): Promise<ExecutionLeaseReceipt | null> {
    const run = this.runs.get(input.runId);
    if (
      !run ||
      run.status !== "running" ||
      !matchesScope(run, input) ||
      this.leaseTokens.get(run.id) !== input.token
    ) {
      return null;
    }
    return {
      run,
      token: input.token,
      expiresAt: run.leaseExpiresAt!,
      recovered: false,
    };
  }

  async checkpointRun(
    input: CheckpointExecutionRunInput,
  ): Promise<ExecutionRun | null> {
    const run = this.runs.get(input.runId);
    if (
      !run ||
      run.status !== "running" ||
      !matchesScope(run, input) ||
      this.leaseTokens.get(run.id) !== input.token
    ) {
      return null;
    }
    const next: ExecutionRun = {
      ...run,
      currentStep: input.currentStep,
      handlerAttempt: input.incrementHandlerAttempt
        ? run.handlerAttempt + 1
        : run.handlerAttempt,
      ...(Object.prototype.hasOwnProperty.call(input, "output")
        ? { output: input.output }
        : {}),
      updatedAt: timestamp,
    };
    this.runs.set(run.id, next);
    return next;
  }

  async requeueRun(
    input: RequeueExecutionRunInput,
  ): Promise<ExecutionRun | null> {
    const run = this.runs.get(input.runId);
    if (
      !run ||
      run.status !== "running" ||
      !matchesScope(run, input) ||
      this.leaseTokens.get(run.id) !== input.token
    ) {
      return null;
    }
    this.leaseTokens.delete(run.id);
    const next: ExecutionRun = {
      ...run,
      status: "queued",
      currentStep: input.currentStep ?? undefined,
      availableAt: input.availableAt.toISOString(),
      error: input.error,
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
      updatedAt: timestamp,
    };
    this.runs.set(run.id, next);
    return next;
  }

  async finishRun(
    input: FinishExecutionRunInput,
  ): Promise<ExecutionRun | null> {
    const run = this.runs.get(input.runId);
    if (
      !run ||
      run.status !== "running" ||
      !matchesScope(run, input) ||
      this.leaseTokens.get(run.id) !== input.token
    ) {
      return null;
    }
    this.leaseTokens.delete(run.id);
    const next: ExecutionRun = {
      ...run,
      status: input.status,
      currentStep: input.currentStep ?? undefined,
      output: input.output,
      error: input.error ?? undefined,
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
      finishedAt: timestamp,
      updatedAt: timestamp,
    };
    this.runs.set(run.id, next);
    const projection = this.ensureProjection(next);
    return projection ? { ...next, terminalProjection: projection } : next;
  }

  async blockRun(_input: BlockExecutionRunInput): Promise<ExecutionRun | null> {
    return null;
  }

  async acknowledgeRunCancellation(
    _input: AcknowledgeExecutionRunCancellationInput,
  ): Promise<ExecutionCancellationReceipt | null> {
    return null;
  }

  async prepareEffect(input: PrepareExecutionEffectInput) {
    const key = `${input.runId}:${input.stepKey}`;
    const existing = this.effects.get(key);
    if (existing?.status === "succeeded") {
      return { kind: "return_receipt" as const, effect: existing };
    }
    if (existing) throw new Error("unexpected effect replay before success");
    const effect: ExecutionEffect = {
      id: `xeff-${this.effects.size + 1}`,
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
      availableAt: timestamp,
      lastAttemptAt: timestamp,
      lastDeadlineAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.effects.set(key, effect);
    return { kind: "invoke" as const, effect };
  }

  async completeEffect(input: CompleteExecutionEffectInput) {
    const key = `${input.runId}:${input.stepKey}`;
    const existing = this.effects.get(key);
    if (!existing) return null;
    const next: ExecutionEffect = {
      ...existing,
      status: "succeeded",
      receipt: input.receipt,
      receiptFingerprint: input.receiptFingerprint,
      finishedAt: timestamp,
      updatedAt: timestamp,
    };
    this.effects.set(key, next);
    return next;
  }

  async recordEffectFailure(_input: RecordExecutionEffectFailureInput) {
    throw new Error("unexpected effect failure");
  }

  async recordEffectReconcile(_input: RecordExecutionEffectReconcileInput) {
    throw new Error("unexpected effect reconciliation");
  }

  async getEffectForScope(
    input: ExecutionScopedRunRef & { stepKey: string },
  ): Promise<ExecutionEffect | null> {
    const run = this.runs.get(input.runId);
    if (!run || !matchesScope(run, input)) return null;
    return this.effects.get(`${input.runId}:${input.stepKey}`) ?? null;
  }

  async claimTerminalProjection(
    input: ClaimExecutionTerminalProjectionInput,
  ): Promise<ExecutionTerminalProjectionLeaseReceipt | null> {
    const projection = this.terminalProjections.get(input.runId);
    if (!projection || !this.projectionMatches(projection, input)) return null;
    return this.claimProjection(projection, input.workerId);
  }

  async claimNextTerminalProjection(
    input: ClaimNextExecutionTerminalProjectionInput,
  ): Promise<ExecutionTerminalProjectionLeaseReceipt | null> {
    const projection = [...this.terminalProjections.values()].find(
      (candidate) =>
        candidate.state === "pending" &&
        this.projectionMatches(candidate, input),
    );
    return projection ? this.claimProjection(projection, input.workerId) : null;
  }

  async renewTerminalProjectionLease(
    input: RenewExecutionTerminalProjectionLeaseInput,
  ): Promise<ExecutionTerminalProjectionLeaseReceipt | null> {
    const projection = this.terminalProjections.get(input.runId);
    const run = this.runs.get(input.runId);
    if (
      !projection ||
      !run ||
      projection.state !== "running" ||
      !this.projectionMatches(projection, input) ||
      this.projectionTokens.get(projection.runId) !== input.token
    ) {
      return null;
    }
    return {
      projection,
      run,
      token: input.token,
      expiresAt: projection.leaseExpiresAt!,
      recovered: false,
    };
  }

  async acknowledgeTerminalProjection(
    input: ExecutionTerminalProjectionLeaseMutationInput,
  ): Promise<ExecutionTerminalProjection | null> {
    return this.mutateProjection(input, (projection) => ({
      ...projection,
      state: "succeeded",
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
      projectedAt: timestamp,
      updatedAt: timestamp,
    }));
  }

  async requeueTerminalProjection(
    input: RequeueExecutionTerminalProjectionInput,
  ): Promise<ExecutionTerminalProjection | null> {
    return this.mutateProjection(input, (projection) => ({
      ...projection,
      state: "retry_wait",
      availableAt: timestamp,
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
      lastErrorCode: input.errorCode,
      updatedAt: timestamp,
    }));
  }

  async blockTerminalProjection(
    input: BlockExecutionTerminalProjectionInput,
  ): Promise<ExecutionTerminalProjection | null> {
    return this.mutateProjection(input, (projection) => ({
      ...projection,
      state: "blocked",
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
      lastErrorCode: input.errorCode,
      updatedAt: timestamp,
    }));
  }

  async getTerminalProjectionForScope(
    input: ExecutionScopedRunRef,
  ): Promise<ExecutionTerminalProjection | null> {
    const projection = this.terminalProjections.get(input.runId);
    return projection && this.projectionMatches(projection, input)
      ? projection
      : null;
  }

  async getBlockedTerminalProjectionForScope(
    input: ExecutionLeaseScope,
  ): Promise<ExecutionTerminalProjection | null> {
    return (
      [...this.terminalProjections.values()].find(
        (projection) =>
          projection.state === "blocked" &&
          this.projectionMatches(projection, input),
      ) ?? null
    );
  }

  private ensureProjection(
    run: ExecutionRun,
  ): ExecutionTerminalProjection | undefined {
    if (
      run.mode === "shadow" ||
      run.metadata.authority !== "execution_ledger_v2" ||
      (run.status !== "completed" &&
        run.status !== "partial" &&
        run.status !== "failed" &&
        run.status !== "cancelled")
    ) {
      return undefined;
    }
    const existing = this.terminalProjections.get(run.id);
    if (existing) return existing;
    const projection: ExecutionTerminalProjection = {
      runId: run.id,
      tenantKey: run.tenantKey,
      operation: run.operation,
      mode: run.mode,
      terminalStatus: run.status,
      state: "pending",
      availableAt: timestamp,
      claimCount: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.terminalProjections.set(run.id, projection);
    return projection;
  }

  private claimProjection(
    projection: ExecutionTerminalProjection,
    workerId: string,
  ): ExecutionTerminalProjectionLeaseReceipt | null {
    if (projection.state !== "pending" && projection.state !== "retry_wait") {
      return null;
    }
    const run = this.runs.get(projection.runId);
    if (!run) return null;
    const token = `projection-${++this.projectionSequence}`;
    const claimed: ExecutionTerminalProjection = {
      ...projection,
      state: "running",
      leaseOwner: workerId,
      leaseExpiresAt: "2026-07-16T10:01:00.000Z",
      claimCount: projection.claimCount + 1,
      lastAttemptAt: timestamp,
      updatedAt: timestamp,
    };
    this.terminalProjections.set(claimed.runId, claimed);
    this.projectionTokens.set(claimed.runId, token);
    return {
      projection: claimed,
      run,
      token,
      expiresAt: claimed.leaseExpiresAt!,
      recovered: false,
    };
  }

  private mutateProjection(
    input: ExecutionTerminalProjectionLeaseMutationInput,
    mutate: (
      projection: ExecutionTerminalProjection,
    ) => ExecutionTerminalProjection,
  ): ExecutionTerminalProjection | null {
    const projection = this.terminalProjections.get(input.runId);
    if (
      !projection ||
      projection.state !== "running" ||
      !this.projectionMatches(projection, input) ||
      this.projectionTokens.get(projection.runId) !== input.token
    ) {
      return null;
    }
    const next = mutate(projection);
    this.projectionTokens.delete(projection.runId);
    this.terminalProjections.set(next.runId, next);
    return next;
  }

  private projectionMatches(
    projection: ExecutionTerminalProjection,
    scope: { tenantKey: string; operation: string; mode: string },
  ): boolean {
    return (
      projection.tenantKey === scope.tenantKey.trim().toLowerCase() &&
      projection.operation === scope.operation &&
      projection.mode === scope.mode
    );
  }
}

class ReadinessRepository extends RuntimeRepository {
  scanCalls = 0;
  failNextScan = false;
  runnableScopes: ExecutionLeaseScope[] = [];

  async listRunnableScopesPage(
    _input: ListRunnableExecutionScopesPageInput,
  ): Promise<RunnableExecutionScopePage> {
    this.scanCalls += 1;
    if (this.failNextScan) {
      this.failNextScan = false;
      throw Object.assign(
        new Error("postgres://private-readiness-credential"),
        { code: "database_temporarily_unavailable" },
      );
    }
    return { scopes: this.runnableScopes.map((scope) => ({ ...scope })) };
  }
}

class ManualScopeScheduler implements DurableExecutionScopeSupervisorScheduler {
  private callback?: () => void;

  setInterval(callback: () => void): unknown {
    this.callback = callback;
    return callback;
  }

  clearInterval(handle: unknown): void {
    if (this.callback === handle) this.callback = undefined;
  }

  tick(): void {
    assert.ok(this.callback, "scope supervisor interval is not active");
    this.callback();
  }
}

class PassiveRuntimeScheduler implements DurableExecutionScheduler {
  readonly intervals: Array<() => void> = [];
  readonly microtasks: Array<() => void> = [];

  setInterval(callback: () => void): unknown {
    this.intervals.push(callback);
    return callback;
  }

  clearInterval(): void {
    // No real timer is installed by this deterministic fixture.
  }

  queueMicrotask(callback: () => void): void {
    this.microtasks.push(callback);
  }
}

async function eventually(
  predicate: () => boolean,
  message: string,
): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  assert.fail(message);
}

function admissionInput(
  requestId = "ui-search-request-123",
  overrides: Record<string, unknown> = {},
) {
  return {
    slug,
    requestId,
    criteria,
    limit: 5,
    traceId: "trace-leads-search-1",
    ...overrides,
  };
}

function completedOutput(): LeadsSearchResultV2 {
  return {
    completionBoundary: "search_completed",
    provider: "apollo",
    candidates: [
      {
        providerId: "person-1",
        name: "Ada Lovelace",
        title: "VP Growth",
        linkedinUrl: "https://www.linkedin.com/in/ada-lovelace",
        organizationName: "Analytical Engines",
        organizationDomain: "analytical.example",
      },
    ],
    totalAvailable: 12,
    returned: 1,
    page: 1,
    nextPage: 2,
    hasMore: true,
  };
}

function completedRun(): ExecutionRun {
  return {
    id: "xrun-projection-1",
    tenantKey: slug,
    idempotencyKey: "leads.search:digest:canary:v1",
    aggregateType: "lead_search",
    aggregateId: "a".repeat(64),
    operation: LEADS_SEARCH_OPERATION,
    mode: "canary",
    status: "completed",
    input: {
      schemaVersion: 1,
      slug,
      credentialRef: `apollo://tenant/${slug}`,
      criteria,
      limit: 5,
    },
    output: completedOutput(),
    metadata: {},
    availableAt: timestamp,
    claimCount: 1,
    handlerAttempt: 1,
    createdAt: timestamp,
    finishedAt: timestamp,
    updatedAt: timestamp,
  };
}

test("rollout and capability policy require the exact tenant/mode/operation/capability", () => {
  assert.deepEqual(resolveLeadsSearchPolicy(slug, enabledEnv), {
    mode: "canary",
    enabled: true,
    reason: "enabled",
  });
  assert.equal(
    resolveLeadsSearchPolicy(slug, {
      LEADS_SEARCH_EXECUTION_V2: "canary",
      LEADS_SEARCH_V2_SLUGS: "*",
    }).reason,
    "invalid_allowlist",
  );
  const exact = {
    scope: {
      tenantKey: slug,
      operation: LEADS_SEARCH_OPERATION,
      mode: "canary" as const,
    },
    handlerVersion: LEADS_SEARCH_HANDLER_VERSION,
    capability: LEADS_APOLLO_CAPABILITY,
  };
  assert.equal(leadsSearchCapabilityPolicy.mayAdmit(exact), true);
  assert.equal(leadsSearchCapabilityPolicy.mayDrain(exact), "allow");
  assert.equal(
    leadsSearchCapabilityPolicy.mayAdmit({
      ...exact,
      capability: "yalc.outbound.workflow.start",
    }),
    false,
  );
  assert.equal(
    leadsSearchCapabilityPolicy.mayDrain({
      ...exact,
      scope: { ...exact.scope, mode: "active" },
    }),
    "temporarily_suspended",
  );
});

test("one runtime policy observes Apollo credential rotation without provider I/O", () => {
  const env: LeadsSearchEnvironment = { ...enabledEnv };
  const policy = createLeadsSearchRuntimeCapabilityPolicy(env, {});
  const input = {
    scope: {
      tenantKey: slug,
      operation: LEADS_SEARCH_OPERATION,
      mode: "canary" as const,
    },
    handlerVersion: LEADS_SEARCH_HANDLER_VERSION,
    capability: LEADS_APOLLO_CAPABILITY,
  };

  assert.equal(policy.mayDrain(input), "temporarily_suspended");
  env.APOLLO_API_KEY = "rotated-at-runtime";
  assert.equal(policy.mayDrain(input), "allow");
  env.LEADS_SEARCH_DURABLE_WORKER_BOOT_ENABLED = "0";
  assert.equal(policy.mayDrain(input), "temporarily_suspended");
  env.LEADS_SEARCH_DURABLE_WORKER_BOOT_ENABLED = "1";
  env.APOLLO_API_KEY = "   ";
  assert.equal(policy.mayDrain(input), "temporarily_suspended");
});

test("injected runtime policy does not require the process boot flag", () => {
  const repository = new AdmissionRepository();
  const policy = createLeadsSearchRuntimeCapabilityPolicy(
    {
      LEADS_SEARCH_EXECUTION_V2: "canary",
      LEADS_SEARCH_V2_SLUGS: slug,
    },
    {
      repository: repository.asExecutionRepository(),
      resolveApolloApiKey: () => "injected-key",
    },
  );
  assert.equal(
    policy.mayDrain({
      scope: {
        tenantKey: slug,
        operation: LEADS_SEARCH_OPERATION,
        mode: "canary",
      },
      handlerVersion: LEADS_SEARCH_HANDLER_VERSION,
      capability: LEADS_APOLLO_CAPABILITY,
    }),
    "allow",
  );
});

test("default boot authority blocks start, wake and one-shot execution before runtime creation", async (t) => {
  useLeadsSearchProcessEnvironment(t, bootDisabledEnv);
  await stopLeadsSearchWorkers();

  await assert.rejects(
    startLeadsSearchWorkers(),
    (error: unknown) =>
      error instanceof LeadsSearchError &&
      error.code === "leads_search_runtime_disabled" &&
      error.status === 503,
  );
  assert.equal(getLeadsSearchRuntimeReadiness(), undefined);

  wakeLeadsSearchWorker(slug);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(getLeadsSearchRuntimeReadiness(), undefined);

  await assert.rejects(
    processNextLeadsSearchRun(slug, { env: enabledEnv }),
    (error: unknown) =>
      error instanceof LeadsSearchError &&
      error.code === "leads_search_runtime_disabled" &&
      error.status === 503,
  );
  assert.equal(getLeadsSearchRuntimeReadiness(), undefined);
});

test("operational readiness follows off-to-canary rollout, fails closed on scan errors and recovers", async () => {
  const repository = new ReadinessRepository();
  const executionRepository = repository.asExecutionRepository();
  const scheduler = new ManualScopeScheduler();
  let stopped = false;

  try {
    assert.deepEqual(
      await startLeadsSearchWorkers({
        repository: executionRepository,
        env: enabledEnv,
        scopeScheduler: scheduler,
        resolveApolloApiKey: () => "injected-test-key",
        logError: () => undefined,
        now: () => new Date(timestamp),
      }),
      [slug],
    );

    let readiness = getLeadsSearchOperationalReadiness(
      executionRepository,
      enabledEnv,
    );
    assert.equal(readiness.startup.state, "ready");
    assert.equal(readiness.startup.lastSuccessAt, timestamp);
    assert.equal(readiness.supervisor?.lastFullSuccessAt, timestamp);
    assert.equal(readiness.supervisor?.lastError, undefined);
    assert.equal(readiness.rolloutReady, true);
    assert.equal(readiness.enabledTenantCount, 1);
    assert.equal(readiness.acceptsNewAdmissions, true);

    const rolloutOff = getLeadsSearchOperationalReadiness(
      executionRepository,
      offEnv,
    );
    assert.equal(rolloutOff.rolloutReady, false);
    assert.equal(rolloutOff.enabledTenantCount, 0);
    assert.equal(rolloutOff.acceptsNewAdmissions, false);

    const rolloutWithoutAllowlist = getLeadsSearchOperationalReadiness(
      executionRepository,
      { LEADS_SEARCH_EXECUTION_V2: "canary" },
    );
    assert.equal(rolloutWithoutAllowlist.rolloutReady, false);
    assert.equal(rolloutWithoutAllowlist.enabledTenantCount, 0);
    assert.equal(rolloutWithoutAllowlist.acceptsNewAdmissions, false);

    const invalidRollout = getLeadsSearchOperationalReadiness(
      executionRepository,
      {
        LEADS_SEARCH_EXECUTION_V2: "invalid",
        LEADS_SEARCH_V2_SLUGS: slug,
      },
    );
    assert.equal(invalidRollout.rolloutReady, false);
    assert.equal(invalidRollout.enabledTenantCount, 0);
    assert.equal(invalidRollout.acceptsNewAdmissions, false);

    readiness = getLeadsSearchOperationalReadiness(
      executionRepository,
      enabledEnv,
    );
    assert.equal(readiness.rolloutReady, true);
    assert.equal(readiness.enabledTenantCount, 1);
    assert.equal(readiness.acceptsNewAdmissions, true);

    repository.failNextScan = true;
    scheduler.tick();
    await eventually(
      () =>
        Boolean(
          getLeadsSearchOperationalReadiness(executionRepository, enabledEnv)
            .supervisor?.lastError,
        ),
      "supervisor did not publish the failed authoritative scan",
    );

    readiness = getLeadsSearchOperationalReadiness(
      executionRepository,
      enabledEnv,
    );
    assert.equal(readiness.supervisor?.lastFullSuccessAt, timestamp);
    assert.equal(
      readiness.supervisor?.lastError?.code,
      "database_temporarily_unavailable",
    );
    assert.equal(readiness.acceptsNewAdmissions, false);
    assert.equal(
      JSON.stringify(readiness).includes("private-readiness-credential"),
      false,
    );

    scheduler.tick();
    await eventually(() => {
      const recovered = getLeadsSearchOperationalReadiness(
        executionRepository,
        enabledEnv,
      );
      return (
        !recovered.supervisor?.lastError &&
        recovered.supervisor?.counters.scansSucceeded === 2
      );
    }, "supervisor did not recover after a successful authoritative scan");
    assert.equal(
      getLeadsSearchOperationalReadiness(executionRepository, enabledEnv)
        .acceptsNewAdmissions,
      true,
    );

    await stopLeadsSearchWorkers(executionRepository);
    stopped = true;
    readiness = getLeadsSearchOperationalReadiness(
      executionRepository,
      enabledEnv,
    );
    assert.equal(readiness.startup.state, "stopped");
    assert.equal(readiness.acceptsNewAdmissions, false);
    assert.equal(readiness.supervisor, undefined);
  } finally {
    if (!stopped) await stopLeadsSearchWorkers(executionRepository);
  }
});

test("operational readiness rejects a successful degraded scan and recovers only when the supervisor is ready", async () => {
  const repository = new ReadinessRepository();
  const executionRepository = repository.asExecutionRepository();
  const scopeScheduler = new ManualScopeScheduler();
  const runtimeScheduler = new PassiveRuntimeScheduler();
  repository.runnableScopes = [
    {
      tenantKey: slug,
      operation: LEADS_SEARCH_OPERATION,
      mode: "canary",
    },
    {
      tenantKey: "second-tenant",
      operation: LEADS_SEARCH_OPERATION,
      mode: "canary",
    },
  ];

  try {
    await startLeadsSearchWorkers({
      repository: executionRepository,
      env: enabledEnv,
      scopeScheduler,
      runtimeScheduler,
      capacityLimiter: new DurableExecutionWorkerCapacityLimiter(1),
      resolveApolloApiKey: () => "injected-test-key",
      logError: () => undefined,
      now: () => new Date(timestamp),
    });

    let readiness = getLeadsSearchOperationalReadiness(
      executionRepository,
      enabledEnv,
    );
    assert.equal(readiness.startup.state, "ready");
    assert.equal(readiness.supervisor?.state, "degraded");
    assert.equal(readiness.supervisor?.lastError, undefined);
    assert.equal(readiness.supervisor?.lastScan?.scopesRejected, 0);
    assert.equal(readiness.supervisor?.capacityDeferredScopeCount, 1);
    assert.equal(readiness.acceptsNewAdmissions, false);

    repository.runnableScopes = [repository.runnableScopes[0]!];
    scopeScheduler.tick();
    await eventually(
      () =>
        getLeadsSearchOperationalReadiness(executionRepository, enabledEnv)
          .supervisor?.state === "ready",
      "supervisor did not recover after the deferred scope disappeared",
    );

    readiness = getLeadsSearchOperationalReadiness(
      executionRepository,
      enabledEnv,
    );
    assert.equal(readiness.supervisor?.lastError, undefined);
    assert.equal(readiness.supervisor?.capacityDeferredScopeCount, 0);
    assert.equal(readiness.supervisor?.counters.scansSucceeded, 2);
    assert.equal(readiness.acceptsNewAdmissions, true);
  } finally {
    await stopLeadsSearchWorkers(executionRepository);
  }
});

test("startup failure evidence is stable and redacted after bundle cleanup", async () => {
  const repository = new ReadinessRepository();
  const executionRepository = repository.asExecutionRepository();
  const failingScheduler = {
    setInterval(): unknown {
      throw Object.assign(new Error("postgres://startup-secret"), {
        code: "scope_scheduler_unavailable",
      });
    },
    clearInterval(): void {
      // No timer is installed when startup fails.
    },
  } satisfies DurableExecutionScopeSupervisorScheduler;

  await assert.rejects(
    startLeadsSearchWorkers({
      repository: executionRepository,
      env: enabledEnv,
      scopeScheduler: failingScheduler,
      resolveApolloApiKey: () => "injected-test-key",
      logError: () => undefined,
      now: () => new Date(timestamp),
    }),
  );

  const readiness = getLeadsSearchOperationalReadiness(
    executionRepository,
    enabledEnv,
  );
  assert.equal(readiness.startup.state, "failed");
  assert.equal(readiness.startup.lastAttemptAt, timestamp);
  assert.deepEqual(readiness.startup.lastError, {
    code: "scope_scheduler_unavailable",
    at: timestamp,
  });
  assert.equal(readiness.supervisor, undefined);
  assert.equal(readiness.acceptsNewAdmissions, false);
  assert.equal(JSON.stringify(readiness).includes("startup-secret"), false);
});

test("default new admission with rollout on and boot off performs zero Ledger writes and zero provider I/O", async (t) => {
  useLeadsSearchProcessEnvironment(t, bootDisabledEnv);
  await stopLeadsSearchWorkers();
  let reads = 0;
  let writes = 0;
  let providerCalls = 0;
  t.mock.method(
    PostgresExecutionControlRepository.prototype,
    "getRunByAggregateForScope",
    async (_input: ExecutionScopedAggregateRef) => {
      reads += 1;
      return null;
    },
  );
  t.mock.method(
    PostgresExecutionControlRepository.prototype,
    "createRun",
    async (_input: CreateExecutionRunInput) => {
      writes += 1;
      throw new Error("boot-off admission attempted a Ledger write");
    },
  );
  t.mock.method(
    globalThis,
    "fetch",
    async (..._args: Parameters<typeof fetch>): Promise<Response> => {
      providerCalls += 1;
      throw new Error("boot-off admission attempted provider I/O");
    },
  );

  await assert.rejects(
    admitLeadsSearch(admissionInput("boot-off-new-default"), {
      env: enabledEnv,
    }),
    (error: unknown) =>
      error instanceof LeadsSearchError &&
      error.code === "leads_search_runtime_disabled" &&
      error.status === 503,
  );
  assert.equal(
    reads,
    1,
    "one exact sticky lookup is required before rejection",
  );
  assert.equal(writes, 0);
  assert.equal(providerCalls, 0);
  assert.equal(getLeadsSearchRuntimeReadiness(), undefined);
});

test("default sticky replay with boot off returns the same receipt without write, wake or provider I/O", async (t) => {
  const seededRepository = new AdmissionRepository();
  const seeded = await admitLeadsSearch(
    admissionInput("boot-off-sticky-default"),
    {
      repository: seededRepository.asExecutionRepository(),
      env: enabledEnv,
      wake: () => undefined,
    },
  );
  const existing = seededRepository.runs.get(seeded.runId);
  assert.ok(existing);

  useLeadsSearchProcessEnvironment(t, {
    ...offEnv,
    LEADS_SEARCH_DURABLE_WORKER_BOOT_ENABLED: "0",
    APOLLO_API_KEY: "must-not-be-used",
  });
  await stopLeadsSearchWorkers();
  let writes = 0;
  let providerCalls = 0;
  t.mock.method(
    PostgresExecutionControlRepository.prototype,
    "getRunByAggregateForScope",
    async (_input: ExecutionScopedAggregateRef) => existing,
  );
  t.mock.method(
    PostgresExecutionControlRepository.prototype,
    "createRun",
    async (_input: CreateExecutionRunInput) => {
      writes += 1;
      throw new Error("boot-off replay attempted a Ledger write");
    },
  );
  t.mock.method(
    globalThis,
    "fetch",
    async (..._args: Parameters<typeof fetch>): Promise<Response> => {
      providerCalls += 1;
      throw new Error("boot-off replay attempted provider I/O");
    },
  );

  const replay = await admitLeadsSearch(
    admissionInput("boot-off-sticky-default"),
    { env: enabledEnv },
  );
  assert.equal(replay.runId, seeded.runId);
  assert.equal(replay.created, false);
  assert.equal(replay.replayed, true);
  assert.equal(writes, 0);
  assert.equal(providerCalls, 0);
  assert.equal(getLeadsSearchRuntimeReadiness(), undefined);

  await assert.rejects(
    admitLeadsSearch(
      admissionInput("boot-off-sticky-default", {
        criteria: { titles: ["Chief Financial Officer"] },
      }),
      { env: enabledEnv },
    ),
    (error: unknown) =>
      error instanceof LeadsSearchError &&
      error.code === "execution_command_conflict" &&
      error.status === 409,
  );
  assert.equal(writes, 0);
  assert.equal(providerCalls, 0);
});

test("admission hashes the raw request id and does not touch the product projection", async () => {
  const repository = new AdmissionRepository();
  const rawRequestId = "request-never-persist-987654";
  const forbiddenProjection = new Proxy(
    {},
    {
      get() {
        throw new Error("product projection touched during admission");
      },
    },
  ) as LeadsSearchProjectionRepository;
  const receipt = await admitLeadsSearch(admissionInput(rawRequestId), {
    repository: repository.asExecutionRepository(),
    env: enabledEnv,
    wake: () => undefined,
    productProjectionRepository: forbiddenProjection,
  });

  assert.equal(receipt.created, true);
  assert.equal(receipt.replayed, false);
  assert.equal(receipt.status, "queued");
  assert.match(repository.creates[0].aggregateId, /^[a-f0-9]{64}$/);
  assert.match(
    repository.creates[0].idempotencyKey,
    /^leads\.search:[a-f0-9]{64}:canary:v1$/,
  );
  assert.equal(
    JSON.stringify(repository.creates).includes(rawRequestId),
    false,
  );
  assert.deepEqual(repository.creates[0].input, {
    schemaVersion: 1,
    slug,
    credentialRef: `apollo://tenant/${slug}`,
    criteria,
    limit: 5,
  });
});

test("legacy timeout configuration cannot drift the versioned effect policy", async () => {
  const firstRepository = new AdmissionRepository();
  const secondRepository = new AdmissionRepository();
  const legacyEnv = {
    ...enabledEnv,
    LEADS_SEARCH_APOLLO_TIMEOUT_MS: "999",
  } as LeadsSearchEnvironment;
  await admitLeadsSearch(admissionInput("fixed-timeout-one"), {
    repository: firstRepository.asExecutionRepository(),
    env: enabledEnv,
    wake: () => undefined,
  });
  await admitLeadsSearch(admissionInput("fixed-timeout-two"), {
    repository: secondRepository.asExecutionRepository(),
    env: legacyEnv,
    wake: () => undefined,
  });
  assert.equal(
    firstRepository.creates[0].metadata?.executionPolicyFingerprint,
    secondRepository.creates[0].metadata?.executionPolicyFingerprint,
  );
});

test("sticky replay drains after rollout is off and divergent reuse is 409", async () => {
  const repository = new AdmissionRepository();
  const dependencies = {
    repository: repository.asExecutionRepository(),
    env: enabledEnv,
    wake: () => undefined,
  };
  const first = await admitLeadsSearch(admissionInput(), dependencies);
  const replay = await admitLeadsSearch(admissionInput(), {
    ...dependencies,
    env: offEnv,
  });
  assert.equal(replay.runId, first.runId);
  assert.equal(replay.created, false);
  assert.equal(replay.replayed, true);

  await assert.rejects(
    admitLeadsSearch(
      admissionInput("ui-search-request-123", {
        criteria: { titles: ["Chief Financial Officer"] },
      }),
      { ...dependencies, env: offEnv },
    ),
    (error: unknown) =>
      error instanceof LeadsSearchError &&
      error.code === "execution_command_conflict" &&
      error.status === 409,
  );

  await assert.rejects(
    admitLeadsSearch(admissionInput("another-request"), {
      ...dependencies,
      env: offEnv,
    }),
    (error: unknown) =>
      error instanceof LeadsSearchError &&
      error.code === "leads_search_not_enabled" &&
      error.status === 403,
  );
});

test("status and cancellation are exact-scope, idempotent and raw-id free", async () => {
  const repository = new AdmissionRepository();
  const executionRepository = repository.asExecutionRepository();
  const admitted = await admitLeadsSearch(admissionInput(), {
    repository: executionRepository,
    env: enabledEnv,
    wake: () => undefined,
  });
  assert.equal(
    await getLeadsSearchStatus(
      { slug: "another-tenant", runId: admitted.runId },
      { repository: executionRepository },
    ),
    null,
  );
  assert.equal(
    (
      await getLeadsSearchStatus(
        { slug, runId: admitted.runId },
        { repository: executionRepository },
      )
    )?.runId,
    admitted.runId,
  );

  const rawCancelRequest = "cancel-ui-request-never-persist";
  const first = await cancelLeadsSearch(
    {
      slug,
      runId: admitted.runId,
      requestId: rawCancelRequest,
      actorId: "user_martin",
    },
    { repository: executionRepository },
  );
  assert.equal(first?.disposition, "cancelled");
  assert.equal(first?.replayed, false);
  assert.match(
    repository.cancellations[0].cancellationId,
    /^cancel_[a-f0-9]{64}$/,
  );
  assert.equal(
    JSON.stringify(repository.cancellations).includes(rawCancelRequest),
    false,
  );
  assert.equal(repository.cancellations[0].reasonCode, "user_requested");

  const replay = await cancelLeadsSearch(
    slug,
    admitted.runId,
    { requestId: rawCancelRequest, actorId: "user_martin" },
    { repository: executionRepository },
  );
  assert.equal(replay?.replayed, true);

  await assert.rejects(
    cancelLeadsSearch(
      {
        slug,
        runId: admitted.runId,
        requestId: "different-cancel-request",
        actorId: "user_martin",
      },
      { repository: executionRepository },
    ),
    (error: unknown) =>
      error instanceof LeadsSearchError &&
      error.code === "execution_cancellation_conflict" &&
      error.status === 409,
  );
});

test("native vertical admits, calls Apollo once, completes, projects and replays with zero I/O", async () => {
  const repository = new RuntimeRepository();
  const executionRepository = repository.asExecutionRepository();
  let providerCalls = 0;
  const effect = createLeadsApolloPeopleSearchEffect({
    timeoutMs: 5_000,
    transport: async ({ apiKey, limit, page }) => {
      providerCalls += 1;
      assert.equal(apiKey, "apollo-test-key");
      assert.equal(limit, 5);
      assert.equal(page, 1);
      return {
        people: [
          {
            id: "apollo-person-1",
            name: "Ada Lovelace",
            title: "VP Growth",
            linkedin_url: "https://www.linkedin.com/in/ada-lovelace",
            organization: {
              name: "Analytical Engines",
              primary_domain: "analytical.example",
            },
          },
        ],
        pagination: { total_entries: 1 },
      };
    },
  });
  const projectionWrites: UpsertLeadsSearchProjectionInput[] = [];
  const productRepository = {
    async upsert(input: UpsertLeadsSearchProjectionInput) {
      projectionWrites.push(input);
      return {} as never;
    },
    async get() {
      return null;
    },
    async list() {
      return { items: [] };
    },
  } satisfies LeadsSearchProjectionRepository;
  const shared = {
    repository: executionRepository,
    apolloPeopleSearchEffect: effect,
    productProjectionRepository: productRepository,
    deliverChat: async () => undefined,
  };

  const admitted = await admitLeadsSearch(admissionInput("e2e-search-1"), {
    ...shared,
    env: enabledEnv,
    wake: () => undefined,
  });
  assert.equal(providerCalls, 0);
  assert.equal(projectionWrites.length, 0);

  // The flag is deliberately off at execution time: persisted receipts drain.
  assert.equal(
    await processNextLeadsSearchRun(slug, {
      ...shared,
      env: offEnv,
      credentialProvider: {
        resolve: async () => ({
          tenantKey: slug,
          apiKey: "apollo-test-key",
        }),
      },
      now: () => new Date(timestamp),
    }),
    true,
  );
  assert.equal(
    providerCalls,
    1,
    JSON.stringify({
      run: repository.runs.get(admitted.runId),
      effects: [...repository.effects.values()],
      projection: repository.terminalProjections.get(admitted.runId),
    }),
  );
  assert.equal(projectionWrites.length, 1);
  assert.equal(projectionWrites[0].tenantKey, slug);
  assert.equal(projectionWrites[0].runId, admitted.runId);
  assert.equal(projectionWrites[0].result?.returned, 1);
  assert.equal(
    repository.terminalProjections.get(admitted.runId)?.state,
    "succeeded",
  );
  assert.equal(repository.runs.get(admitted.runId)?.status, "completed");

  const replay = await admitLeadsSearch(admissionInput("e2e-search-1"), {
    ...shared,
    env: offEnv,
    wake: () => undefined,
  });
  assert.equal(replay.runId, admitted.runId);
  assert.equal(replay.replayed, true);
  assert.equal(replay.status, "completed");
  assert.equal(
    await processNextLeadsSearchRun(slug, {
      ...shared,
      env: offEnv,
      credentialProvider: {
        resolve: async () => ({
          tenantKey: slug,
          apiKey: "apollo-test-key",
        }),
      },
      now: () => new Date(timestamp),
    }),
    false,
  );
  assert.equal(providerCalls, 1);
  assert.equal(projectionWrites.length, 1);
});

test("terminal projector strips the Ledger boundary and stale leases never write", async () => {
  const writes: UpsertLeadsSearchProjectionInput[] = [];
  const deliveries: string[] = [];
  const repository = {
    async upsert(input: UpsertLeadsSearchProjectionInput) {
      writes.push(input);
      return {} as never;
    },
    async get() {
      return null;
    },
    async list() {
      return { items: [] };
    },
  } satisfies LeadsSearchProjectionRepository;
  const projector = createLeadsSearchTerminalProjector(
    repository,
    async ({ run }) => {
      deliveries.push(run.id);
    },
  );
  const run = completedRun();
  const command = run.input as never;
  const baseContext = {
    delivery: "at-least-once" as const,
    scope: {
      tenantKey: slug,
      operation: LEADS_SEARCH_OPERATION,
      mode: "canary" as const,
    },
    signal: new AbortController().signal,
    deadlineAt: timestamp,
    effectKey: () => "effect-key",
    now: () => new Date(timestamp),
  };

  await assert.rejects(
    projector(run, command, {
      ...baseContext,
      assertLease: async () => {
        throw new Error("stale projection lease");
      },
    } satisfies DurableExecutionTerminalProjectionContext),
    /stale projection lease/,
  );
  assert.equal(writes.length, 0);
  assert.equal(deliveries.length, 0);

  await projector(run, command, {
    ...baseContext,
    assertLease: async () => undefined,
  } satisfies DurableExecutionTerminalProjectionContext);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].terminalStatus, "completed");
  assert.equal(
    "completionBoundary" in (writes[0].result as Record<string, unknown>),
    false,
  );
  assert.equal(writes[0].result?.returned, 1);
  assert.deepEqual(deliveries, [run.id]);

  const failedRun: ExecutionRun = {
    ...run,
    id: "xrun-projection-failed",
    status: "failed",
    output: undefined,
  };
  await projector(failedRun, command, {
    ...baseContext,
    assertLease: async () => undefined,
  } satisfies DurableExecutionTerminalProjectionContext);
  assert.equal(writes[1].terminalStatus, "failed");
  assert.equal(writes[1].result, null);
  assert.deepEqual(deliveries, [run.id, failedRun.id]);
});

test("terminal projector does not complete until durable chat delivery succeeds", async () => {
  const writes: UpsertLeadsSearchProjectionInput[] = [];
  const deliveries: string[] = [];
  let failDelivery = true;
  const repository = {
    async upsert(input: UpsertLeadsSearchProjectionInput) {
      writes.push(input);
      return {} as never;
    },
    async get() {
      return null;
    },
    async list() {
      return { items: [] };
    },
  } satisfies LeadsSearchProjectionRepository;
  const projector = createLeadsSearchTerminalProjector(
    repository,
    async ({ run }) => {
      deliveries.push(run.id);
      if (failDelivery) throw new Error("chat delivery unavailable");
    },
  );
  const run = completedRun();
  let leaseChecks = 0;
  const context = {
    delivery: "at-least-once" as const,
    scope: {
      tenantKey: slug,
      operation: LEADS_SEARCH_OPERATION,
      mode: "canary" as const,
    },
    signal: new AbortController().signal,
    deadlineAt: timestamp,
    effectKey: () => "effect-key",
    now: () => new Date(timestamp),
    assertLease: async () => {
      leaseChecks += 1;
    },
  } satisfies DurableExecutionTerminalProjectionContext;

  await assert.rejects(
    projector(run, run.input as never, context),
    /chat delivery unavailable/,
  );
  assert.equal(writes.length, 1, "product projection happened before delivery");
  assert.deepEqual(deliveries, [run.id]);
  assert.equal(leaseChecks, 2, "lease is fenced again before chat I/O");

  failDelivery = false;
  await projector(run, run.input as never, context);
  assert.equal(writes.length, 2, "the product upsert is safely replayed");
  assert.deepEqual(deliveries, [run.id, run.id]);
});
