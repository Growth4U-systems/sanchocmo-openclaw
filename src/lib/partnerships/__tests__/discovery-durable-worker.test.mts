import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, beforeEach, test } from "node:test";
import type {
  AppendExecutionEventInput,
  CheckpointExecutionRunInput,
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
import { DEFAULT_CREATOR_MODEL_CONFIG } from "@/lib/calc-creator-core";
import { DurableExecutionRegistry } from "@/lib/durable-execution/registry";
import {
  DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION,
  DurableExecutionEngine,
  DurableExecutionWorker,
  type DurableExecutionHandler,
} from "@/lib/durable-execution/runtime";
import type { DiscoverySearchRecord } from "../discovery-types";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sancho-durable-discovery-"));
process.env.MC_WORKSPACE = tmp;
process.env.MC_TASKS_BACKEND = "json";

const canaryEnv = {
  PARTNERSHIPS_DISCOVERY_EXECUTION_V2: "canary",
  PARTNERSHIPS_DISCOVERY_V2_SLUGS: "hospital-capilar",
  PARTNERSHIPS_DISCOVERY_ARTIFACT_STORE: "local-persistent-single-host",
  PARTNERSHIPS_DISCOVERY_WORKER_LEASE_MS: "5000",
  PARTNERSHIPS_DISCOVERY_WORKER_MAX_ATTEMPTS: "3",
};

type StoreModule = typeof import("../discovery-store");
type WorkerModule = typeof import("../discovery-durable-worker");
let store: StoreModule;
let worker: WorkerModule;

function search(id = "ds-durable-1"): DiscoverySearchRecord {
  return {
    id,
    slug: "hospital-capilar",
    commandId: `command:${id}`,
    commandFingerprint: `fingerprint:${id}`,
    executionIntent: "fixtures",
    executionControl: {
      mode: "canary",
      admittedAt: "2026-07-16T10:00:00.000Z",
      generation: 1,
    },
    executionModelConfig: JSON.parse(
      JSON.stringify(DEFAULT_CREATOR_MODEL_CONFIG),
    ),
    title: "Salud capilar IG",
    plan: {
      title: "Salud capilar IG",
      sectors: ["salud capilar"],
      networks: ["instagram"],
      tiers: ["micro"],
      targetVolume: 1,
    },
    campaignId: "campaign-1",
    projectId: null,
    taskId: null,
    threadId: null,
    runner: {
      status: "queued",
      mode: null,
      attempts: 1,
      queuedAt: "2026-07-16T10:00:00.000Z",
      startedAt: null,
      finishedAt: null,
      error: null,
      stats: null,
    },
    createdAt: "2026-07-16T10:00:00.000Z",
    updatedAt: "2026-07-16T10:00:00.000Z",
  };
}

function executionRun(
  record: DiscoverySearchRecord,
  overrides: Partial<ExecutionRun> = {},
): ExecutionRun {
  return {
    id: `xrun-${record.id}`,
    tenantKey: record.slug,
    idempotencyKey: `partnerships.discovery:${record.slug}:${record.id}:attempt:1:canary:v2`,
    aggregateType: "partnerships.search",
    aggregateId: `${record.slug}:${record.id}`,
    operation: "partnerships.discovery",
    mode: "canary",
    status: "running",
    input: {
      schemaVersion: 2,
      slug: record.slug,
      searchId: record.id,
      attempt: 1,
      executionGeneration: 1,
      modelConfig: JSON.parse(JSON.stringify(DEFAULT_CREATOR_MODEL_CONFIG)),
      title: record.title,
      campaignId: record.campaignId,
      projectId: null,
      taskId: null,
      executionIntent: record.executionIntent,
      plan: record.plan,
      observedRunner: {
        status: "queued",
        mode: null,
        jobId: null,
      },
      createdAt: record.createdAt,
    },
    metadata: { authority: "execution_ledger", executionHandlerVersion: 2 },
    availableAt: "2026-07-16T10:00:00.000Z",
    leaseOwner: "worker-1",
    leaseExpiresAt: "2026-07-16T10:01:00.000Z",
    claimCount: 1,
    handlerAttempt: 0,
    createdAt: "2026-07-16T10:00:00.000Z",
    startedAt: "2026-07-16T10:00:01.000Z",
    updatedAt: "2026-07-16T10:00:01.000Z",
    ...overrides,
  };
}

class FakeRepository implements ExecutionControlRepository {
  creates: CreateExecutionRunInput[] = [];
  claims: ClaimNextExecutionRunInput[] = [];
  renewals: RenewExecutionRunLeaseInput[] = [];
  checkpoints: CheckpointExecutionRunInput[] = [];
  requeues: RequeueExecutionRunInput[] = [];
  finishes: FinishExecutionRunInput[] = [];
  events: AppendExecutionEventInput[] = [];
  receipt: ExecutionLeaseReceipt | null = null;
  createWinner: ExecutionRun | null = null;

  async createRun(input: CreateExecutionRunInput) {
    this.creates.push(input);
    if (!this.createWinner) throw new Error("missing create winner");
    return { run: this.createWinner, created: this.creates.length === 1 };
  }
  async appendEvent(input: AppendExecutionEventInput): Promise<ExecutionEvent> {
    this.events.push(input);
    return {
      sequence: this.events.length,
      id: `event-${this.events.length}`,
      runId: input.runId,
      aggregateType: "partnerships.search",
      aggregateId: "hospital-capilar:ds-durable-1",
      type: input.type,
      ts: "2026-07-16T10:00:00.000Z",
      ...(input.data === undefined ? {} : { data: input.data }),
    };
  }
  async transitionRun(
    _runId: string,
    input: TransitionExecutionRunInput,
  ): Promise<ExecutionRun> {
    if (!this.createWinner) throw new Error("missing create winner");
    this.createWinner = { ...this.createWinner, status: input.status };
    return this.createWinner;
  }
  async getRunById(): Promise<ExecutionRun | null> {
    return this.createWinner;
  }
  async getRunByAggregate(): Promise<ExecutionRun | null> {
    return this.createWinner;
  }
  async getRunByIdForScope(
    input: ExecutionScopedRunRef,
  ): Promise<ExecutionRun | null> {
    const run = this.createWinner;
    return run &&
      run.id === input.runId &&
      run.tenantKey === input.tenantKey &&
      run.operation === input.operation &&
      run.mode === input.mode
      ? run
      : null;
  }
  async getRunByAggregateForScope(
    input: ExecutionScopedAggregateRef,
  ): Promise<ExecutionRun | null> {
    const run = this.createWinner;
    return run &&
      run.tenantKey === input.tenantKey &&
      run.operation === input.operation &&
      run.mode === input.mode &&
      run.aggregateType === input.aggregateType &&
      run.aggregateId === input.aggregateId
      ? run
      : null;
  }
  async listEvents(): Promise<ExecutionEvent[]> {
    const priorHandlerAttempts = Math.max(
      0,
      (this.createWinner?.claimCount ?? 1) - 1,
    );
    return Array.from({ length: priorHandlerAttempts }, (_, index) => ({
      sequence: index + 1,
      id: `claimed-${index + 1}`,
      runId: this.createWinner?.id ?? "xrun-missing",
      aggregateType: "partnerships.search",
      aggregateId: "hospital-capilar:ds-durable-1",
      type: "partnerships.discovery.claimed",
      ts: "2026-07-16T10:00:00.000Z",
    }));
  }
  async claimRun(): Promise<ExecutionLeaseReceipt | null> {
    return this.receipt;
  }
  async claimNextRun(
    input: ClaimNextExecutionRunInput,
  ): Promise<ExecutionLeaseReceipt | null> {
    this.claims.push(input);
    const receipt = this.receipt;
    this.receipt = null;
    return receipt;
  }
  async renewRunLease(
    input: RenewExecutionRunLeaseInput,
  ): Promise<ExecutionLeaseReceipt | null> {
    this.renewals.push(input);
    if (!this.createWinner && !this.receipt) return null;
    const run = this.createWinner ?? executionRun(search());
    return {
      run,
      token: input.token,
      expiresAt: "2026-07-16T10:02:00.000Z",
      recovered: false,
    };
  }
  async checkpointRun(
    input: CheckpointExecutionRunInput,
  ): Promise<ExecutionRun | null> {
    this.checkpoints.push(input);
    const run = this.createWinner ?? executionRun(search());
    const checkpointed: ExecutionRun = {
      ...run,
      currentStep: input.currentStep,
      ...(input.incrementHandlerAttempt
        ? { handlerAttempt: run.handlerAttempt + 1 }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(input, "output")
        ? { output: input.output }
        : {}),
    };
    this.createWinner = checkpointed;
    return checkpointed;
  }
  async requeueRun(
    input: RequeueExecutionRunInput,
  ): Promise<ExecutionRun | null> {
    this.requeues.push(input);
    const queued = {
      ...(this.createWinner ?? executionRun(search())),
      status: "queued" as const,
      currentStep: input.currentStep ?? undefined,
      availableAt: input.availableAt.toISOString(),
      error: input.error,
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
    };
    this.createWinner = queued;
    return queued;
  }
  async finishRun(
    input: FinishExecutionRunInput,
  ): Promise<ExecutionRun | null> {
    this.finishes.push(input);
    const finished = {
      ...(this.createWinner ?? executionRun(search())),
      status: input.status,
      currentStep: input.currentStep ?? undefined,
      output: input.output,
      error: input.error ?? undefined,
      finishedAt: "2026-07-16T10:00:20.000Z",
      updatedAt: "2026-07-16T10:00:20.000Z",
    };
    this.createWinner = finished;
    return finished;
  }
}

function deferred(): { promise: Promise<void>; resolve(): void } {
  let resolve!: () => void;
  const promise = new Promise<void>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

function runtimeProbeHandler(
  operation: string,
  onExecute: () => Promise<void> | void,
): DurableExecutionHandler<Record<string, unknown>, { ok: true }> {
  return {
    contractVersion: DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION,
    operation,
    version: 2,
    decode: (run) => run.input as Record<string, unknown>,
    execute: async () => {
      await onExecute();
      return { status: "completed", output: { ok: true } };
    },
    classifyError: (error) => ({
      code: "probe_failed",
      retryable: false,
      message: error instanceof Error ? error.message : "probe failed",
    }),
    projectTerminal: () => undefined,
  };
}

before(async () => {
  store = await import("../discovery-store");
  worker = await import("../discovery-durable-worker");
});

beforeEach(() => {
  fs.rmSync(path.join(tmp, "brand"), { recursive: true, force: true });
});

after(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("default boot authority revalidates after claim and recovers the same setup receipt", async () => {
  const mutableEnv = {
    ...canaryEnv,
    PARTNERSHIPS_DURABLE_WORKER_BOOT_ENABLED: "1",
  };
  const drainPolicy =
    worker.createPartnershipsDefaultRuntimeDrainPolicy(mutableEnv);
  const setupScope: ExecutionLeaseScope = {
    tenantKey: "hospital-capilar",
    operation: "partnerships.discovery.setup",
    mode: "canary",
  };
  const discoveryScope: ExecutionLeaseScope = {
    ...setupScope,
    operation: "partnerships.discovery",
  };
  assert.equal(drainPolicy.mayDrain(setupScope), true);
  assert.equal(drainPolicy.mayDrain(discoveryScope), true);

  const repository = new FakeRepository();
  const run = executionRun(search("ds-hot-boot-setup"), {
    id: "xrun-hot-boot-setup",
    operation: setupScope.operation,
  });
  repository.createWinner = run;
  repository.receipt = {
    run,
    token: "lease-hot-boot-first",
    expiresAt: "2026-07-16T10:01:00.000Z",
    recovered: false,
  };
  const claimEntered = deferred();
  const releaseClaim = deferred();
  let blockFirstClaim = true;
  repository.claimNextRun = async (input) => {
    repository.claims.push(input);
    const receipt = repository.receipt;
    repository.receipt = null;
    if (blockFirstClaim) {
      blockFirstClaim = false;
      claimEntered.resolve();
      await releaseClaim.promise;
    }
    return receipt;
  };
  let providerIo = 0;
  const registry = new DurableExecutionRegistry().register(
    runtimeProbeHandler(setupScope.operation, () => {
      providerIo += 1;
    }),
  );
  const engine = new DurableExecutionEngine({
    repository,
    registry,
    scope: setupScope,
    workerId: "hot-boot-setup-worker",
    leaseMs: 5_000,
    maxAttempts: 3,
    drainPolicy,
    now: () => new Date("2026-07-16T10:00:10.000Z"),
  });

  const suspended = engine.processNext();
  await claimEntered.promise;
  mutableEnv.PARTNERSHIPS_DURABLE_WORKER_BOOT_ENABLED = "0";
  assert.equal(drainPolicy.mayDrain(setupScope), false);
  assert.equal(drainPolicy.mayDrain(discoveryScope), false);
  releaseClaim.resolve();
  assert.deepEqual(await suspended, {
    kind: "requeued",
    runId: run.id,
  });
  assert.equal(providerIo, 0);
  assert.equal(repository.checkpoints.length, 0);
  assert.equal(repository.finishes.length, 0);
  assert.equal(repository.requeues.length, 1);
  assert.equal(repository.requeues[0]?.runId, run.id);
  assert.equal(
    repository.requeues[0]?.currentStep,
    "awaiting_runtime_authority",
  );

  const queued = repository.createWinner!;
  const recoveredRun: ExecutionRun = {
    ...queued,
    status: "running",
    claimCount: queued.claimCount + 1,
    leaseOwner: "hot-boot-setup-worker",
    leaseExpiresAt: "2026-07-16T10:02:00.000Z",
    updatedAt: "2026-07-16T10:00:11.000Z",
  };
  repository.createWinner = recoveredRun;
  repository.receipt = {
    run: recoveredRun,
    token: "lease-hot-boot-recovered",
    expiresAt: "2026-07-16T10:02:00.000Z",
    recovered: true,
  };
  mutableEnv.PARTNERSHIPS_DURABLE_WORKER_BOOT_ENABLED = "1";
  const recovered = await engine.processNext();
  assert.equal(recovered.kind, "completed");
  assert.equal(recovered.runId, run.id);
  assert.equal(providerIo, 1);
  assert.equal(repository.finishes.length, 1);
});

test("boot disabled by an in-flight discovery effect stops the second claim without aborting the first", async () => {
  const mutableEnv = {
    ...canaryEnv,
    PARTNERSHIPS_DURABLE_WORKER_BOOT_ENABLED: "1",
  };
  const drainPolicy =
    worker.createPartnershipsDefaultRuntimeDrainPolicy(mutableEnv);
  const scope: ExecutionLeaseScope = {
    tenantKey: "hospital-capilar",
    operation: "partnerships.discovery",
    mode: "canary",
  };
  const repository = new FakeRepository();
  const firstRun = executionRun(search("ds-hot-boot-first"), {
    id: "xrun-hot-boot-first",
  });
  const secondRun = executionRun(search("ds-hot-boot-second"), {
    id: "xrun-hot-boot-second",
  });
  const receipts: ExecutionLeaseReceipt[] = [
    {
      run: firstRun,
      token: "lease-hot-boot-discovery-1",
      expiresAt: "2026-07-16T10:01:00.000Z",
      recovered: false,
    },
    {
      run: secondRun,
      token: "lease-hot-boot-discovery-2",
      expiresAt: "2026-07-16T10:01:00.000Z",
      recovered: false,
    },
  ];
  repository.createWinner = firstRun;
  repository.claimNextRun = async (input) => {
    repository.claims.push(input);
    const receipt = receipts.shift() ?? null;
    if (receipt) repository.createWinner = receipt.run;
    return receipt;
  };
  let providerIo = 0;
  const registry = new DurableExecutionRegistry().register(
    runtimeProbeHandler(scope.operation, () => {
      providerIo += 1;
      if (providerIo === 1) {
        // The flag changes while this effect is already in flight. It must be
        // allowed to finish, but the same drain must not claim receipt two.
        mutableEnv.PARTNERSHIPS_DURABLE_WORKER_BOOT_ENABLED = "0";
      }
    }),
  );
  const runtimeWorker = new DurableExecutionWorker({
    repository,
    registry,
    scope,
    workerId: "hot-boot-discovery-worker",
    leaseMs: 5_000,
    pollMs: 60_000,
    maxAttempts: 3,
    maxClaimsPerDrain: 10,
    drainPolicy,
    scheduler: {
      setInterval: () => ({ kind: "manual-interval" }),
      clearInterval: () => undefined,
      queueMicrotask: () => undefined,
    },
    now: () => new Date("2026-07-16T10:00:10.000Z"),
  });
  runtimeWorker.start();
  try {
    await runtimeWorker.poll();
    assert.equal(providerIo, 1);
    assert.equal(repository.claims.length, 1);
    assert.equal(repository.finishes.length, 1);
    assert.equal(repository.finishes[0]?.runId, firstRun.id);
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0]?.run.id, secondRun.id);

    mutableEnv.PARTNERSHIPS_DURABLE_WORKER_BOOT_ENABLED = "1";
    await runtimeWorker.poll();
    assert.equal(providerIo, 2);
    assert.equal(repository.finishes.length, 2);
    assert.equal(repository.finishes[1]?.runId, secondRun.id);
    assert.equal(receipts.length, 0);
  } finally {
    await runtimeWorker.stop();
  }
});

test("canary claims an exact tenant scope and finishes through the lease token", async () => {
  const record = store.saveSearch(search());
  const repository = new FakeRepository();
  const run = executionRun(record);
  repository.createWinner = run;
  repository.receipt = {
    run,
    token: "lease-secret-1",
    expiresAt: "2026-07-16T10:01:00.000Z",
    recovered: false,
  };
  let executionOptions: Record<string, unknown> | undefined;
  const stats = {
    candidates: 1,
    invalid: 0,
    filtered: 0,
    inserted: 1,
    sourced: 1,
    disqualified: 0,
    dropped: 0,
    avgQuality: 80,
  };

  const worked = await worker.processNextCanaryDiscoveryRun(record.slug, {
    repository,
    env: canaryEnv,
    workerId: "worker-test",
    now: () => new Date("2026-07-16T10:00:10.000Z"),
    runSearch: async (options) => {
      executionOptions = options.execution as unknown as Record<
        string,
        unknown
      >;
      await options.execution?.beforeStep?.("discover");
      await options.execution?.beforeStep?.("assign");
      await options.execution?.beforeStep?.("project");
      return {
        search: record,
        stats,
        qualified: [],
        inserted: [],
        dropped: [],
      };
    },
  });

  assert.equal(worked, true);
  assert.deepEqual(repository.claims[0], {
    tenantKey: "hospital-capilar",
    operation: "partnerships.discovery",
    mode: "canary",
    workerId: "worker-test",
    leaseMs: 5000,
  });
  assert.equal(executionOptions?.leaseAuthority, "canary");
  assert.equal(executionOptions?.manageRunnerState, false);
  assert.equal(
    executionOptions?.yalcIdempotencyKey,
    `partnerships.discovery:run:${run.id}:step:yalc.campaign:v2`,
  );
  assert.deepEqual(
    repository.checkpoints.map((checkpoint) => checkpoint.currentStep),
    ["claimed", "discover", "assign", "project"],
  );
  assert.equal(repository.finishes.length, 1);
  assert.equal(repository.finishes[0].token, "lease-secret-1");
  assert.equal(repository.finishes[0].status, "completed");
  assert.equal(store.getSearch(record.slug, record.id)?.runner.status, "done");
});

test("legacy v1 command remains claimable with stable code defaults", async () => {
  const record = store.saveSearch(search("ds-legacy-v1"));
  const currentRun = executionRun(record);
  const currentInput = currentRun.input as Record<string, unknown>;
  const {
    executionGeneration: _executionGeneration,
    modelConfig: _modelConfig,
    ...legacyInput
  } = currentInput;
  const legacyRun: ExecutionRun = {
    ...currentRun,
    id: "xrun-legacy-v1",
    idempotencyKey: `partnerships.discovery:${record.slug}:${record.id}:attempt:1:canary:v1`,
    input: { ...legacyInput, schemaVersion: 1 },
    metadata: { authority: "execution_ledger" },
  };
  const repository = new FakeRepository();
  repository.createWinner = legacyRun;
  repository.receipt = {
    run: legacyRun,
    token: "lease-v1",
    expiresAt: "2026-07-16T10:01:00.000Z",
    recovered: true,
  };
  let effectKey: string | undefined;
  let threshold: number | undefined;

  await worker.processNextCanaryDiscoveryRun(record.slug, {
    repository,
    env: canaryEnv,
    runSearch: async (options) => {
      effectKey = options.execution?.yalcIdempotencyKey;
      threshold = options.execution?.modelConfig?.qualification.threshold;
      return {
        search: record,
        stats: {
          candidates: 0,
          invalid: 0,
          filtered: 0,
          inserted: 0,
          sourced: 0,
          disqualified: 0,
          dropped: 0,
          avgQuality: null,
        },
        qualified: [],
        inserted: [],
        dropped: [],
      };
    },
  });

  assert.equal(
    effectKey,
    "partnerships.discovery:run:xrun-legacy-v1:step:yalc.campaign:v1",
  );
  assert.equal(threshold, DEFAULT_CREATOR_MODEL_CONFIG.qualification.threshold);
  assert.equal(store.getSearch(record.slug, record.id)?.runner.status, "done");
});

test("automatic reclaims keep the functional attempt and one idempotency key", async () => {
  const record = store.saveSearch(search("ds-retry-stable"));
  const repository = new FakeRepository();
  const run = executionRun(record, { claimCount: 2 });
  repository.createWinner = run;
  repository.receipt = {
    run,
    token: "lease-retry",
    expiresAt: "2026-07-16T10:01:00.000Z",
    recovered: true,
  };

  await worker.processNextCanaryDiscoveryRun(record.slug, {
    repository,
    env: canaryEnv,
    workerId: "worker-retry",
    now: () => new Date("2026-07-16T10:00:10.000Z"),
    runSearch: async () => {
      throw new Error("provider timeout");
    },
  });

  const projection = store.getSearch(record.slug, record.id)!;
  assert.equal(repository.requeues.length, 1);
  // Ledger is queued. The secondary JSON projection remains on the last
  // fenced running state; the stale owner never writes after releasing lease.
  assert.equal(projection.runner.status, "running");
  assert.equal(projection.runner.attempts, 1);

  await worker.reconcileCanaryDiscoverySearches(record.slug, {
    repository,
    env: canaryEnv,
  });
  const matchingCreates = repository.creates.filter(
    (create) => create.aggregateId === `${record.slug}:${record.id}`,
  );
  assert.equal(
    matchingCreates.length,
    0,
    "exact linked replay must not call createRun again",
  );
});

test("a hanging YALC assignment is aborted within its bound and requeued", async () => {
  const record = store.saveSearch(search("ds-assignment-timeout"));
  const repository = new FakeRepository();
  const run = executionRun(record);
  repository.createWinner = run;
  repository.receipt = {
    run,
    token: "lease-assignment-timeout",
    expiresAt: "2026-07-16T10:01:00.000Z",
    recovered: false,
  };
  const originalFetch = globalThis.fetch;
  const originalTimeout =
    process.env.PARTNERSHIPS_DISCOVERY_YALC_WRITE_TIMEOUT_MS;
  let aborted = false;
  let idempotencyKey: string | null = null;
  globalThis.fetch = ((_input, init) => {
    const headers = new Headers(init?.headers);
    idempotencyKey = headers.get("idempotency-key");
    return new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      const rejectAbort = () => {
        aborted = true;
        reject(new DOMException("aborted", "AbortError"));
      };
      if (signal?.aborted) rejectAbort();
      else signal?.addEventListener("abort", rejectAbort, { once: true });
    });
  }) as typeof fetch;
  process.env.PARTNERSHIPS_DISCOVERY_YALC_WRITE_TIMEOUT_MS = "25";
  const startedAt = Date.now();
  try {
    await worker.processNextCanaryDiscoveryRun(record.slug, {
      repository,
      env: canaryEnv,
      workerId: "worker-assignment-timeout",
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalTimeout === undefined) {
      delete process.env.PARTNERSHIPS_DISCOVERY_YALC_WRITE_TIMEOUT_MS;
    } else {
      process.env.PARTNERSHIPS_DISCOVERY_YALC_WRITE_TIMEOUT_MS =
        originalTimeout;
    }
  }

  assert.ok(Date.now() - startedAt < 1_000);
  assert.equal(aborted, true);
  assert.equal(
    idempotencyKey,
    `partnerships.discovery:run:${run.id}:step:yalc.campaign:v2`,
  );
  assert.equal(repository.requeues.length, 1);
  assert.equal(repository.requeues[0]?.currentStep, "retry_wait");
  assert.match(repository.requeues[0]?.error ?? "", /timed out/i);
  assert.equal(repository.finishes.length, 0);
});

test("a lost fence cannot finish or requeue the durable run", async () => {
  const record = store.saveSearch(search("ds-fence-lost"));
  const repository = new FakeRepository();
  const run = executionRun(record);
  repository.createWinner = run;
  repository.receipt = {
    run,
    token: "stale-token",
    expiresAt: "2026-07-16T10:01:00.000Z",
    recovered: false,
  };
  repository.checkpointRun = async (input) => {
    repository.checkpoints.push(input);
    return null;
  };

  await worker.processNextCanaryDiscoveryRun(record.slug, {
    repository,
    env: canaryEnv,
    runSearch: async (options) => {
      await options.execution?.beforeStep?.("discover");
      throw new Error("must not reach provider");
    },
  });

  assert.equal(repository.finishes.length, 0);
  assert.equal(repository.requeues.length, 0);
});

test("terminalizes the Ledger before projecting done", async () => {
  const record = store.saveSearch(search("ds-ledger-first"));
  const repository = new FakeRepository();
  const run = executionRun(record);
  repository.createWinner = run;
  repository.receipt = {
    run,
    token: "lease-ledger-first",
    expiresAt: "2026-07-16T10:01:00.000Z",
    recovered: false,
  };
  repository.finishRun = async (input) => {
    repository.finishes.push(input);
    assert.equal(
      store.getSearch(record.slug, record.id)?.runner.status,
      "running",
      "terminal projection must not precede the fenced finish",
    );
    const completed = {
      ...run,
      status: "completed" as const,
      output: {
        stats: {
          candidates: 1,
          invalid: 0,
          filtered: 0,
          inserted: 1,
          sourced: 1,
          disqualified: 0,
          dropped: 0,
          avgQuality: 80,
        },
      },
      finishedAt: "2026-07-16T10:00:20.000Z",
    };
    repository.createWinner = completed;
    return completed;
  };

  await worker.processNextCanaryDiscoveryRun(record.slug, {
    repository,
    env: canaryEnv,
    runSearch: async () => ({
      search: record,
      stats: {
        candidates: 1,
        invalid: 0,
        filtered: 0,
        inserted: 1,
        sourced: 1,
        disqualified: 0,
        dropped: 0,
        avgQuality: 80,
      },
      qualified: [],
      inserted: [],
      dropped: [],
    }),
  });

  assert.equal(store.getSearch(record.slug, record.id)?.runner.status, "done");
});

test("a stale owner whose terminal fence loses cannot project done", async () => {
  const record = store.saveSearch(search("ds-terminal-fence-lost"));
  const repository = new FakeRepository();
  const run = executionRun(record);
  repository.createWinner = run;
  repository.receipt = {
    run,
    token: "lease-terminal-stale",
    expiresAt: "2026-07-16T10:01:00.000Z",
    recovered: false,
  };
  repository.finishRun = async (input) => {
    repository.finishes.push(input);
    return null;
  };

  await worker.processNextCanaryDiscoveryRun(record.slug, {
    repository,
    env: canaryEnv,
    runSearch: async () => ({
      search: record,
      stats: {
        candidates: 1,
        invalid: 0,
        filtered: 0,
        inserted: 1,
        sourced: 1,
        disqualified: 0,
        dropped: 0,
        avgQuality: 80,
      },
      qualified: [],
      inserted: [],
      dropped: [],
    }),
  });

  assert.equal(
    store.getSearch(record.slug, record.id)?.runner.status,
    "running",
  );
});

test("reconciliation projects a terminal Ledger run without executing again", async () => {
  const record = store.saveSearch({
    ...search("ds-terminal-repair"),
    runner: {
      ...search("ds-terminal-repair").runner,
      status: "running",
    },
  });
  const repository = new FakeRepository();
  const run = executionRun(record, {
    status: "completed",
    output: {
      stats: {
        candidates: 1,
        invalid: 0,
        filtered: 0,
        inserted: 1,
        sourced: 1,
        disqualified: 0,
        dropped: 0,
        avgQuality: 80,
      },
    },
    finishedAt: "2026-07-16T10:00:20.000Z",
  });
  repository.createWinner = run;

  const repaired = await worker.reconcileCanaryDiscoverySearches(record.slug, {
    repository,
    env: canaryEnv,
  });

  assert.deepEqual(repaired, [record.id]);
  assert.equal(store.getSearch(record.slug, record.id)?.runner.status, "done");
  assert.equal(repository.claims.length, 0);
});

test("terminal generation A cannot overwrite retry generation B during reconciliation", async () => {
  const admittedA = search("ds-terminal-generation-race");
  const runA = executionRun(admittedA, {
    id: "xrun-generation-a",
    status: "completed",
    output: {
      stats: {
        candidates: 1,
        invalid: 0,
        filtered: 0,
        inserted: 1,
        sourced: 1,
        disqualified: 0,
        dropped: 0,
        avgQuality: 80,
      },
    },
    finishedAt: "2026-07-16T10:00:20.000Z",
  });
  const recordA = store.saveSearch({
    ...admittedA,
    executionControl: {
      mode: "canary",
      admittedAt: "2026-07-16T10:00:00.000Z",
      generation: 1,
      runId: runA.id,
    },
    runner: { ...admittedA.runner, status: "running", jobId: "effect-a" },
  });
  const repository = new FakeRepository();
  repository.createWinner = runA;
  repository.getRunById = async () => {
    store.saveSearch({
      ...recordA,
      executionControl: {
        mode: "canary",
        admittedAt: "2026-07-16T10:00:30.000Z",
        generation: 2,
        runId: "xrun-generation-b",
      },
      runner: {
        ...recordA.runner,
        status: "running",
        jobId: "effect-b",
        startedAt: "2026-07-16T10:00:31.000Z",
      },
    });
    return runA;
  };

  await worker.reconcileCanaryDiscoverySearches(recordA.slug, {
    repository,
    env: canaryEnv,
  });

  let current = store.getSearch(recordA.slug, recordA.id)!;
  assert.equal(current.executionControl?.generation, 2);
  assert.equal(current.executionControl?.runId, "xrun-generation-b");
  assert.equal(current.runner.status, "running");
  assert.equal(current.runner.jobId, "effect-b");

  // Legacy full-record writers are also generation-aware under the same
  // cross-process lock, so a stale copy cannot roll the projection back.
  store.saveSearch({
    ...recordA,
    runner: { ...recordA.runner, status: "done", jobId: "effect-a" },
  });
  current = store.getSearch(recordA.slug, recordA.id)!;
  assert.equal(current.executionControl?.generation, 2);
  assert.equal(current.executionControl?.runId, "xrun-generation-b");
  assert.equal(current.runner.status, "running");
  assert.equal(current.runner.jobId, "effect-b");
});

test("canary startup does not adopt an old shadow queued search", async () => {
  const legacy = search("ds-shadow-not-admitted");
  delete legacy.executionControl;
  store.saveSearch(legacy);
  const repository = new FakeRepository();
  repository.createWinner = executionRun(legacy, { status: "queued" });

  const repaired = await worker.reconcileCanaryDiscoverySearches(legacy.slug, {
    repository,
    env: canaryEnv,
  });

  assert.deepEqual(repaired, []);
  assert.equal(repository.creates.length, 0);
});

test("canary startup repairs an admitted search saved before Ledger creation", async () => {
  const admitted = store.saveSearch(search("ds-admitted-crash-window"));
  const repository = new FakeRepository();
  repository.createWinner = executionRun(admitted, { status: "queued" });

  const repaired = await worker.reconcileCanaryDiscoverySearches(
    admitted.slug,
    { repository, env: canaryEnv },
  );

  assert.equal(repository.creates.length, 1);
  assert.equal(repository.creates[0].mode, "canary");
  assert.ok(repaired.includes(admitted.id));
});

test("a requeued owner never overwrites the next owner's running projection", async () => {
  const record = store.saveSearch(search("ds-requeue-race"));
  const repository = new FakeRepository();
  const run = executionRun(record, { claimCount: 1 });
  repository.createWinner = run;
  repository.receipt = {
    run,
    token: "lease-requeue-race",
    expiresAt: "2026-07-16T10:01:00.000Z",
    recovered: false,
  };
  repository.requeueRun = async (input) => {
    repository.requeues.push(input);
    store.updateRunnerState(record.slug, record.id, {
      status: "running",
      startedAt: "2026-07-16T10:00:30.000Z",
    });
    return { ...run, status: "queued" };
  };

  await worker.processNextCanaryDiscoveryRun(record.slug, {
    repository,
    env: canaryEnv,
    runSearch: async () => {
      throw new Error("provider timeout");
    },
  });

  assert.equal(
    store.getSearch(record.slug, record.id)?.runner.status,
    "running",
  );
});

test("the immutable Ledger snapshot overrides a mutated JSON command", async () => {
  const original = search("ds-snapshot-authority");
  const run = executionRun(original);
  const mutated = store.saveSearch({
    ...original,
    title: "MUTATED",
    campaignId: "campaign-attacker",
    plan: { ...original.plan, title: "MUTATED", targetVolume: 500 },
  });
  const repository = new FakeRepository();
  repository.createWinner = run;
  repository.receipt = {
    run,
    token: "lease-snapshot",
    expiresAt: "2026-07-16T10:01:00.000Z",
    recovered: false,
  };
  let commandSnapshot: Record<string, unknown> | undefined;

  await worker.processNextCanaryDiscoveryRun(original.slug, {
    repository,
    env: canaryEnv,
    runSearch: async (options) => {
      commandSnapshot = options.execution?.commandSnapshot as unknown as Record<
        string,
        unknown
      >;
      return {
        search: mutated,
        stats: {
          candidates: 1,
          invalid: 0,
          filtered: 0,
          inserted: 1,
          sourced: 1,
          disqualified: 0,
          dropped: 0,
          avgQuality: 80,
        },
        qualified: [],
        inserted: [],
        dropped: [],
      };
    },
  });

  assert.equal(commandSnapshot?.campaignId, "campaign-1");
  assert.equal(
    (commandSnapshot?.plan as { targetVolume?: number }).targetVolume,
    1,
  );
  const restored = store.getSearch(original.slug, original.id)!;
  assert.equal(restored.campaignId, "campaign-1");
  assert.equal(restored.plan.title, "Salud capilar IG");
});

test("provider secrets are redacted before Ledger and JSON failure writes", async () => {
  const record = store.saveSearch(search("ds-secret-redaction"));
  const repository = new FakeRepository();
  const run = executionRun(record, {
    claimCount: 3,
    handlerAttempt: 2,
  });
  repository.createWinner = run;
  repository.receipt = {
    run,
    token: "lease-redaction",
    expiresAt: "2026-07-16T10:01:00.000Z",
    recovered: false,
  };

  await worker.processNextCanaryDiscoveryRun(record.slug, {
    repository,
    env: canaryEnv,
    runSearch: async () => {
      throw new Error(
        "Authorization: Bearer sk-secret-value-123456789 api_key=top-secret-123456",
      );
    },
  });

  const serialized = JSON.stringify({
    finish: repository.finishes,
    projection: store.getSearch(record.slug, record.id),
  });
  assert.doesNotMatch(serialized, /sk-secret-value|top-secret/);
  assert.match(serialized, /REDACTED/);
});

test("corrupt JSON is reconstructed from the authoritative run snapshot", async () => {
  const record = store.saveSearch(search("ds-corrupt-projection"));
  const repository = new FakeRepository();
  const run = executionRun(record, {
    status: "completed",
    output: {
      stats: {
        candidates: 1,
        invalid: 0,
        filtered: 0,
        inserted: 1,
        sourced: 1,
        disqualified: 0,
        dropped: 0,
        avgQuality: 80,
      },
    },
    finishedAt: "2026-07-16T10:00:20.000Z",
  });
  repository.createWinner = run;
  fs.writeFileSync(store.searchFile(record.slug, record.id), "{truncated");

  const repaired = await worker.reconcileCanaryDiscoverySearches(record.slug, {
    repository,
    env: canaryEnv,
  });

  assert.ok(repaired.includes(record.id));
  const recovered = store.getSearch(record.slug, record.id)!;
  assert.equal(recovered.runner.status, "done");
  assert.equal(recovered.campaignId, "campaign-1");
});
