import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { DEFAULT_CREATOR_MODEL_CONFIG } from "@/lib/calc-creator-core";
import type {
  AcknowledgeExecutionRunCancellationInput,
  BlockExecutionTerminalProjectionInput,
  CheckpointExecutionRunInput,
  ClaimExecutionRunInput,
  ClaimExecutionTerminalProjectionInput,
  ClaimNextExecutionTerminalProjectionInput,
  CompleteExecutionEffectInput,
  ExecutionControlRepository,
  ExecutionEffect,
  ExecutionRun,
  ExecutionScopedRunRef,
  ExecutionTerminalProjection,
  ExecutionTerminalProjectionLeaseMutationInput,
  PrepareExecutionEffectInput,
  RecordExecutionEffectFailureInput,
  RecordExecutionEffectReconcileInput,
  RenewExecutionRunLeaseInput,
  RenewExecutionTerminalProjectionLeaseInput,
  RequeueExecutionTerminalProjectionInput,
} from "@/lib/execution-control";
import { durableEffectPolicyFingerprint } from "@/lib/durable-execution/effect-contract";
import { parseDurableJsonContractValue } from "@/lib/durable-execution/json-contract";
import { DurableExecutionRegistry } from "@/lib/durable-execution/registry";
import { durableExecutionEffectKey } from "@/lib/durable-execution/runtime";
import {
  PARTNERSHIPS_PREPARE_EFFECT_STEP,
  PARTNERSHIPS_YALC_ASSIGN_EFFECT_STEP,
  createPartnershipsDiscoveryHandlerV2LegacyV3,
  parsePartnershipsDiscoveryCommandV2,
  partnershipsDiscoveryEffectPolicyV2LegacyV3,
  partnershipsTargetBindingFingerprint,
  type PartnershipsDiscoveryCommandV2,
} from "../discovery-handler-v2";

const NOW = "2026-07-17T10:00:00.000Z";
const TOKEN = "opaque-cancellation-drain-token";
const PROJECTION_TOKEN = "opaque-cancellation-projection-token";
const TENANT = "hospital-capilar";
const RUN_ID = "xrun_mroob60b_8a9a32b2";
const CANCELLATION_ID = `cancel_${"a".repeat(32)}`;
const workspace = fs.mkdtempSync(
  path.join(os.tmpdir(), "sancho-partnerships-cancellation-drain-"),
);
process.env.MC_WORKSPACE = workspace;
process.env.MC_TASKS_BACKEND = "json";
process.env.PARTNERSHIPS_LIVE_DISCOVERY_TIMEOUT_MS = "270000";
process.env.PARTNERSHIPS_DISCOVERY_HANDLER_TIMEOUT_MS = "360000";

type WorkerModule = typeof import("../discovery-durable-worker");
let worker: WorkerModule;

before(async () => {
  worker = await import("../discovery-durable-worker");
});

after(() => {
  fs.rmSync(workspace, { recursive: true, force: true });
});

function command(searchId = "search-cancellation-drain") {
  return parsePartnershipsDiscoveryCommandV2({
    schemaVersion: 2,
    slug: TENANT,
    searchId,
    attempt: 1,
    executionGeneration: 1,
    modelConfig: DEFAULT_CREATOR_MODEL_CONFIG,
    title: "Creators capilares",
    campaignId: `campaign-${searchId}`,
    projectId: null,
    taskId: null,
    executionIntent: "fixtures",
    plan: {
      title: "Creators capilares",
      sectors: ["salud capilar"],
      networks: ["instagram"],
      tiers: ["micro"],
      targetVolume: 1,
    },
    createdAt: NOW,
    artifactStore: "local-persistent-single-host",
    scrapeCreators: {
      credentialRef: "scrapecreators://default",
      targetBindingFingerprint: partnershipsTargetBindingFingerprint(
        "https://api.scrapecreators.com",
      ),
    },
    yalc: {
      credentialRef: `yalc://tenant/${TENANT}`,
      targetBindingFingerprint: partnershipsTargetBindingFingerprint(
        "https://yalc.example.test",
      ),
    },
    setupRunId: null,
    preparedFingerprint: null,
    modelConfigEvidence: null,
  });
}

function legacyRun(
  input: PartnershipsDiscoveryCommandV2 = command(),
  overrides: Partial<ExecutionRun> = {},
): ExecutionRun {
  const handler = createPartnershipsDiscoveryHandlerV2LegacyV3();
  const registry = new DurableExecutionRegistry().register(handler);
  const parsed = parseDurableJsonContractValue(
    handler.command,
    input,
    "command",
  );
  return {
    id: RUN_ID,
    tenantKey: TENANT,
    idempotencyKey: "partnerships.discovery:cancellation-drain:canary:v3",
    aggregateType: "partnerships.search",
    aggregateId: `${TENANT}:${input.searchId}`,
    operation: "partnerships.discovery",
    mode: "canary",
    status: "running",
    input: parsed.value,
    metadata: {
      authority: "execution_ledger_v2",
      executionContractVersion: 2,
      executionHandlerVersion: 3,
      executionPolicyFingerprint: registry.executionPolicyFingerprint(
        "partnerships.discovery",
        3,
      ),
      executionCommandFingerprint: parsed.fingerprint,
      executionCommandSchemaVersion: parsed.schemaVersion,
    },
    availableAt: "2026-07-17T08:00:00.000Z",
    leaseOwner: "stale-provider-worker",
    leaseExpiresAt: "2026-07-17T09:00:00.000Z",
    claimCount: 3,
    handlerAttempt: 3,
    cancelRequestId: CANCELLATION_ID,
    cancelRequestedAt: "2026-07-17T09:30:00.000Z",
    cancelRequestedBy: { type: "user", id: "operator-martin" },
    cancelReasonCode: "operator_intervention",
    createdAt: "2026-07-17T08:00:00.000Z",
    startedAt: "2026-07-17T08:00:01.000Z",
    updatedAt: "2026-07-17T09:30:00.000Z",
    ...overrides,
  };
}

function uncertainPrepareEffect(
  run: ExecutionRun,
  input: PartnershipsDiscoveryCommandV2,
): ExecutionEffect {
  const definition =
    partnershipsDiscoveryEffectPolicyV2LegacyV3[
      PARTNERSHIPS_PREPARE_EFFECT_STEP
    ];
  const assignmentEffectKey = durableExecutionEffectKey({
    operation: run.operation,
    runId: run.id,
    handlerVersion: 3,
    step: PARTNERSHIPS_YALC_ASSIGN_EFFECT_STEP,
  });
  const payload = parseDurableJsonContractValue(
    definition.payload,
    {
      executionRunId: run.id,
      assignmentEffectKey,
      command: input,
    },
    "effect_payload",
  );
  return {
    id: "xeff_prepare_cancellation_drain",
    runId: run.id,
    stepKey: PARTNERSHIPS_PREPARE_EFFECT_STEP,
    effectKey: durableExecutionEffectKey({
      operation: run.operation,
      runId: run.id,
      handlerVersion: 3,
      step: PARTNERSHIPS_PREPARE_EFFECT_STEP,
    }),
    handlerVersion: 3,
    definitionVersion: definition.definitionVersion,
    capability: definition.capability,
    safety: definition.safety.kind,
    payloadSchemaVersion: payload.schemaVersion,
    payloadFingerprint: payload.fingerprint,
    policyFingerprint: durableEffectPolicyFingerprint(definition),
    receiptSchemaVersion: definition.receipt.schemaVersion,
    status: "uncertain",
    attemptCount: 3,
    reconcileCount: 0,
    lastErrorCode: "partnerships_prepare_timeout",
    availableAt: "2026-07-17T09:00:00.000Z",
    lastAttemptAt: "2026-07-17T08:55:00.000Z",
    lastDeadlineAt: "2026-07-17T09:00:00.000Z",
    createdAt: "2026-07-17T08:00:01.000Z",
    updatedAt: "2026-07-17T09:00:00.000Z",
  };
}

class CancellationDrainRepository {
  run: ExecutionRun;
  effect: ExecutionEffect;
  projection: ExecutionTerminalProjection | null = null;
  claimRequests = 0;
  providerBoundaryCalls = 0;
  cancellationAcknowledgements = 0;
  projectionClaims = 0;

  constructor(run: ExecutionRun, effect: ExecutionEffect) {
    this.run = run;
    this.effect = effect;
  }

  private runMatches(input: ExecutionScopedRunRef): boolean {
    return (
      input.runId === this.run.id &&
      input.tenantKey === this.run.tenantKey &&
      input.operation === this.run.operation &&
      input.mode === this.run.mode
    );
  }

  private projectionMatches(input: ExecutionScopedRunRef): boolean {
    return Boolean(
      this.projection &&
      input.runId === this.projection.runId &&
      input.tenantKey === this.projection.tenantKey &&
      input.operation === this.projection.operation &&
      input.mode === this.projection.mode,
    );
  }

  async getRunByIdForScope(input: ExecutionScopedRunRef) {
    return this.runMatches(input) ? this.run : null;
  }

  async claimRun(input: ClaimExecutionRunInput) {
    this.claimRequests += 1;
    if (
      !this.runMatches(input) ||
      this.run.status !== "running" ||
      !this.run.leaseExpiresAt ||
      Date.parse(this.run.leaseExpiresAt) > Date.parse(NOW)
    ) {
      return null;
    }
    this.run = {
      ...this.run,
      leaseOwner: input.workerId,
      leaseExpiresAt: "2026-07-17T10:01:00.000Z",
      claimCount: this.run.claimCount + 1,
      updatedAt: NOW,
    };
    return {
      run: this.run,
      token: TOKEN,
      expiresAt: this.run.leaseExpiresAt,
      recovered: true,
    };
  }

  async claimNextRun() {
    throw new Error("claimNextRun must not be used by exact cancellation");
  }

  async renewRunLease(input: RenewExecutionRunLeaseInput) {
    if (!this.runMatches(input) || input.token !== TOKEN) return null;
    return {
      run: this.run,
      token: TOKEN,
      expiresAt: this.run.leaseExpiresAt!,
      recovered: false,
    };
  }

  async checkpointRun(input: CheckpointExecutionRunInput) {
    if (!this.runMatches(input) || input.token !== TOKEN) return null;
    this.run = {
      ...this.run,
      currentStep: input.currentStep,
      handlerAttempt:
        this.run.handlerAttempt + (input.incrementHandlerAttempt ? 1 : 0),
      updatedAt: NOW,
    };
    return this.run;
  }

  async requeueRun() {
    throw new Error("cancelled legacy run must not be requeued");
  }

  async blockRun() {
    throw new Error("compatible legacy cancellation must not be blocked");
  }

  async finishRun() {
    throw new Error(
      "cancelled legacy run must use cancellation acknowledgement",
    );
  }

  async prepareEffect(_input: PrepareExecutionEffectInput) {
    this.providerBoundaryCalls += 1;
    throw new Error("provider effect boundary must remain closed");
  }

  async completeEffect(_input: CompleteExecutionEffectInput) {
    throw new Error("provider effect must not complete");
  }

  async recordEffectFailure(_input: RecordExecutionEffectFailureInput) {
    throw new Error("provider effect attempt must remain unchanged");
  }

  async recordEffectReconcile(_input: RecordExecutionEffectReconcileInput) {
    throw new Error("read-only cancellation must not reconcile externally");
  }

  async getEffectForScope(input: ExecutionScopedRunRef & { stepKey: string }) {
    return this.runMatches(input) && input.stepKey === this.effect.stepKey
      ? this.effect
      : null;
  }

  async requestRunCancellation() {
    throw new Error("cancellation marker must already exist");
  }

  async acknowledgeRunCancellation(
    input: AcknowledgeExecutionRunCancellationInput,
  ) {
    if (
      !this.runMatches(input) ||
      input.token !== TOKEN ||
      input.cancellationId !== CANCELLATION_ID ||
      this.run.status !== "running"
    ) {
      return null;
    }
    this.cancellationAcknowledgements += 1;
    this.run = {
      ...this.run,
      status: "cancelled",
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
      cancelAcknowledgedAt: NOW,
      finishedAt: NOW,
      updatedAt: NOW,
    };
    this.projection = {
      runId: this.run.id,
      tenantKey: this.run.tenantKey,
      operation: this.run.operation,
      mode: "canary",
      terminalStatus: "cancelled",
      state: "pending",
      availableAt: NOW,
      claimCount: 0,
      createdAt: NOW,
      updatedAt: NOW,
    };
    return {
      run: this.run,
      cancellationId: CANCELLATION_ID,
      disposition: "cancelled" as const,
      replayed: false,
      terminalProjection: this.projection,
    };
  }

  async claimTerminalProjection(input: ClaimExecutionTerminalProjectionInput) {
    if (
      !this.projectionMatches(input) ||
      !this.projection ||
      this.projection.state !== "pending"
    ) {
      return null;
    }
    this.projectionClaims += 1;
    this.projection = {
      ...this.projection,
      state: "running",
      claimCount: this.projection.claimCount + 1,
      leaseOwner: input.workerId,
      leaseExpiresAt: "2026-07-17T10:01:00.000Z",
      lastAttemptAt: NOW,
      updatedAt: NOW,
    };
    return {
      projection: this.projection,
      run: this.run,
      token: PROJECTION_TOKEN,
      expiresAt: this.projection.leaseExpiresAt,
      recovered: false,
    };
  }

  async claimNextTerminalProjection(
    _input: ClaimNextExecutionTerminalProjectionInput,
  ) {
    throw new Error("exact cancellation must project only its own run");
  }

  async renewTerminalProjectionLease(
    input: RenewExecutionTerminalProjectionLeaseInput,
  ) {
    if (
      !this.projectionMatches(input) ||
      input.token !== PROJECTION_TOKEN ||
      !this.projection ||
      this.projection.state !== "running"
    ) {
      return null;
    }
    return {
      projection: this.projection,
      run: this.run,
      token: PROJECTION_TOKEN,
      expiresAt: this.projection.leaseExpiresAt!,
      recovered: false,
    };
  }

  async acknowledgeTerminalProjection(
    input: ExecutionTerminalProjectionLeaseMutationInput,
  ) {
    if (
      !this.projectionMatches(input) ||
      input.token !== PROJECTION_TOKEN ||
      !this.projection ||
      this.projection.state !== "running"
    ) {
      return null;
    }
    this.projection = {
      ...this.projection,
      state: "succeeded",
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
      projectedAt: NOW,
      updatedAt: NOW,
    };
    return this.projection;
  }

  async requeueTerminalProjection(
    _input: RequeueExecutionTerminalProjectionInput,
  ) {
    throw new Error("successful cancellation projection must not be requeued");
  }

  async blockTerminalProjection(_input: BlockExecutionTerminalProjectionInput) {
    throw new Error("successful cancellation projection must not be blocked");
  }

  async getTerminalProjectionForScope(input: ExecutionScopedRunRef) {
    return this.projectionMatches(input) ? this.projection : null;
  }

  async getBlockedTerminalProjectionForScope() {
    return null;
  }
}

function repositoryFixture(overrides: Partial<ExecutionRun> = {}) {
  const input = command("search-cancellation-drain-fixture");
  const run = legacyRun(input, overrides);
  return new CancellationDrainRepository(
    run,
    uncertainPrepareEffect(run, input),
  );
}

function executionRepository(repository: CancellationDrainRepository) {
  return repository as unknown as ExecutionControlRepository;
}

test("exact cancellation refuses wrong scope, wrong handler version and missing marker before claim", async () => {
  const wrongScope = repositoryFixture();
  const scopedOutcome = await worker.drainPartnershipsDiscoveryCancellation(
    "growth4u",
    RUN_ID,
    { repository: executionRepository(wrongScope), now: () => new Date(NOW) },
  );
  assert.deepEqual(scopedOutcome, { kind: "idle", runId: RUN_ID });
  assert.equal(wrongScope.claimRequests, 0);

  const wrongVersion = repositoryFixture();
  wrongVersion.run = {
    ...wrongVersion.run,
    metadata: {
      ...wrongVersion.run.metadata,
      executionHandlerVersion: 4,
    },
  };
  await assert.rejects(
    worker.drainPartnershipsDiscoveryCancellation(TENANT, RUN_ID, {
      repository: executionRepository(wrongVersion),
      now: () => new Date(NOW),
    }),
    (error) =>
      error instanceof worker.PartnershipsDiscoveryCancellationDrainError &&
      error.reason === "legacy_cancel_marker_required",
  );
  assert.equal(wrongVersion.claimRequests, 0);

  const noMarker = repositoryFixture({
    cancelRequestId: undefined,
    cancelRequestedAt: undefined,
    cancelRequestedBy: undefined,
    cancelReasonCode: undefined,
  });
  await assert.rejects(
    worker.drainPartnershipsDiscoveryCancellation(TENANT, RUN_ID, {
      repository: executionRepository(noMarker),
      now: () => new Date(NOW),
    }),
    (error) =>
      error instanceof worker.PartnershipsDiscoveryCancellationDrainError &&
      error.reason === "legacy_cancel_marker_required",
  );
  assert.equal(noMarker.claimRequests, 0);

  const incompleteMarker = repositoryFixture({
    cancelRequestedAt: undefined,
  });
  await assert.rejects(
    worker.drainPartnershipsDiscoveryCancellation(TENANT, RUN_ID, {
      repository: executionRepository(incompleteMarker),
      now: () => new Date(NOW),
    }),
    (error) =>
      error instanceof worker.PartnershipsDiscoveryCancellationDrainError &&
      error.reason === "legacy_cancel_marker_required",
  );
  assert.equal(incompleteMarker.claimRequests, 0);
});

test("active lease stays idle without changing provider attempts", async () => {
  const repository = repositoryFixture({
    leaseExpiresAt: "2099-07-17T10:00:00.000Z",
  });
  const outcome = await worker.drainPartnershipsDiscoveryCancellation(
    TENANT,
    RUN_ID,
    {
      repository: executionRepository(repository),
      now: () => new Date(NOW),
    },
  );

  assert.deepEqual(outcome, { kind: "idle", runId: RUN_ID });
  assert.equal(repository.run.status, "running");
  assert.equal(repository.effect.attemptCount, 3);
  assert.equal(repository.providerBoundaryCalls, 0);
  assert.equal(repository.cancellationAcknowledgements, 0);
});

test("exact v3 drain cancels once, never re-enters the provider boundary, and replay is projection-idempotent", async () => {
  const repository = repositoryFixture();
  const deliveries: string[] = [];
  const dependencies = {
    repository: executionRepository(repository),
    now: () => new Date(NOW),
    deliverV2ChatCompletion: async (run: ExecutionRun) => {
      deliveries.push(run.id);
    },
  };

  const first = await worker.drainPartnershipsDiscoveryCancellation(
    TENANT,
    RUN_ID,
    dependencies,
  );
  assert.equal(first.kind, "cancelled");
  assert.equal(repository.run.status, "cancelled");
  assert.equal(repository.run.cancelAcknowledgedAt, NOW);
  assert.equal(repository.effect.attemptCount, 3);
  assert.equal(repository.providerBoundaryCalls, 0);
  assert.equal(repository.cancellationAcknowledgements, 1);
  assert.equal(repository.projectionClaims, 1);
  assert.equal(repository.projection?.state, "succeeded");
  assert.deepEqual(deliveries, [RUN_ID]);

  const replay = await worker.drainPartnershipsDiscoveryCancellation(
    TENANT,
    RUN_ID,
    dependencies,
  );
  assert.deepEqual(replay, { kind: "cancelled", runId: RUN_ID });
  assert.equal(repository.claimRequests, 1);
  assert.equal(repository.effect.attemptCount, 3);
  assert.equal(repository.providerBoundaryCalls, 0);
  assert.equal(repository.cancellationAcknowledgements, 1);
  assert.equal(repository.projectionClaims, 1);
  assert.deepEqual(deliveries, [RUN_ID]);
});
