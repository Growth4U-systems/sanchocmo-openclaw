import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { promisify } from "node:util";
import { DEFAULT_CREATOR_MODEL_CONFIG } from "@/lib/calc-creator-core";
import {
  executionCommandFingerprint,
  type AppendExecutionEventInput,
  type CheckpointExecutionRunInput,
  type ClaimExecutionRunInput,
  type ClaimNextExecutionRunInput,
  type CreateExecutionRunInput,
  type ExecutionControlRepository,
  type ExecutionEvent,
  type ExecutionLeaseReceipt,
  type ExecutionRun,
  type ExecutionScopedAggregateRef,
  type ExecutionScopedRunRef,
  type FinishExecutionRunInput,
  type RequeueExecutionRunInput,
  type RenewExecutionRunLeaseInput,
  type TransitionExecutionRunInput,
} from "@/lib/execution-control";
import { ExecutionCommandConflictError } from "@/lib/execution-control/types";
import { buildCampaignPayload, parseDiscoveryPlan } from "../discovery-plan";

const workspace = fs.mkdtempSync(
  path.join(os.tmpdir(), "sancho-setup-worker-"),
);
const execFileAsync = promisify(execFile);
process.env.MC_WORKSPACE = workspace;
process.env.MC_TASKS_BACKEND = "json";

type SetupModule = typeof import("../discovery-setup-worker");
type StoreModule = typeof import("../discovery-store");
type WorkerModule = typeof import("../discovery-durable-worker");
type TasksModule = typeof import("@/lib/data/tasks");
let admitCanaryDiscoverySetup: SetupModule["admitCanaryDiscoverySetup"];
let DiscoverySetupCommandError: SetupModule["DiscoverySetupCommandError"];
let getDiscoverySetupAdmissionStatus: SetupModule["getDiscoverySetupAdmissionStatus"];
let ensureDiscoverySetupWorkspace: SetupModule["ensureDiscoverySetupWorkspace"];
let getSearch: StoreModule["getSearch"];
let saveSearch: StoreModule["saveSearch"];
let startCanaryDiscoveryWorkers: WorkerModule["startCanaryDiscoveryWorkers"];
let getChildren: TasksModule["getChildren"];
let getTask: TasksModule["getTask"];
let updateTask: TasksModule["updateTask"];
let ensureProjectInsertOnly: TasksModule["ensureProjectInsertOnly"];
const env = {
  PARTNERSHIPS_DISCOVERY_EXECUTION_V2: "canary",
  PARTNERSHIPS_DISCOVERY_V2_SLUGS: "hospital-capilar,other-tenant",
  PARTNERSHIPS_DISCOVERY_ARTIFACT_STORE: "local-persistent-single-host",
};
const unacknowledgedEnv = {
  PARTNERSHIPS_DISCOVERY_EXECUTION_V2: "off",
  PARTNERSHIPS_DISCOVERY_V2_SLUGS: "",
};

before(async () => {
  const [setup, store, worker, tasks] = await Promise.all([
    import("../discovery-setup-worker"),
    import("../discovery-store"),
    import("../discovery-durable-worker"),
    import("@/lib/data/tasks"),
  ]);
  admitCanaryDiscoverySetup = setup.admitCanaryDiscoverySetup;
  DiscoverySetupCommandError = setup.DiscoverySetupCommandError;
  getDiscoverySetupAdmissionStatus = setup.getDiscoverySetupAdmissionStatus;
  ensureDiscoverySetupWorkspace = setup.ensureDiscoverySetupWorkspace;
  getSearch = store.getSearch;
  saveSearch = store.saveSearch;
  startCanaryDiscoveryWorkers = worker.startCanaryDiscoveryWorkers;
  getChildren = tasks.getChildren;
  getTask = tasks.getTask;
  updateTask = tasks.updateTask;
  ensureProjectInsertOnly = tasks.ensureProjectInsertOnly;
});

after(() => {
  fs.rmSync(workspace, { recursive: true, force: true });
});

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function input(commandId = "setup-command-1") {
  const slug = "hospital-capilar";
  const commandHash = hash(`${slug}\u0000${commandId}`);
  const rawPlan = {
    title: "Creators salud capilar",
    sectors: ["salud capilar"],
    networks: ["instagram"],
    targetVolume: 25,
  };
  const executionIntent = "fixtures" as const;
  return {
    slug,
    rawPlan,
    threadId: "thread-private",
    commandId,
    commandHash,
    requestFingerprint: hash(canonical({ plan: rawPlan, executionIntent })),
    searchId: `ds-${commandHash.slice(0, 20)}`,
    executionIntent,
  };
}

class MemoryRepository implements ExecutionControlRepository {
  runs = new Map<string, ExecutionRun>();
  events = new Map<string, ExecutionEvent[]>();
  tokens = new Map<string, string>();
  effects: string[] = [];
  checkpoints: CheckpointExecutionRunInput[] = [];
  nextId = 1;
  throwAfterChildCreateOnce = false;
  denyClaims = false;
  scopedRunReads = 0;

  async createRun(value: CreateExecutionRunInput) {
    const existing = [...this.runs.values()].find(
      (run) =>
        run.tenantKey === value.tenantKey &&
        run.aggregateType === value.aggregateType &&
        run.aggregateId === value.aggregateId &&
        run.operation === value.operation &&
        run.idempotencyKey === value.idempotencyKey,
    );
    const fingerprint = executionCommandFingerprint(value);
    if (existing) {
      if (existing.commandFingerprint !== fingerprint) {
        throw new ExecutionCommandConflictError();
      }
      return { run: existing, created: false };
    }
    const id = `xrun_test_${this.nextId++}`;
    const now = value.now?.toISOString() ?? "2026-07-16T10:00:00.000Z";
    const run: ExecutionRun = {
      id,
      tenantKey: value.tenantKey.toLowerCase(),
      idempotencyKey: value.idempotencyKey,
      aggregateType: value.aggregateType,
      aggregateId: value.aggregateId,
      operation: value.operation.toLowerCase(),
      mode: value.mode ?? "shadow",
      status: "queued",
      input: value.input,
      metadata: value.metadata ?? {},
      commandFingerprint: fingerprint,
      availableAt: now,
      claimCount: 0,
      handlerAttempt: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.runs.set(id, run);
    this.effects.push(`ledger:${run.operation}`);
    if (
      this.throwAfterChildCreateOnce &&
      run.operation === "partnerships.discovery"
    ) {
      this.throwAfterChildCreateOnce = false;
      throw new Error("simulated lost child create response");
    }
    return { run, created: true };
  }

  async appendEvent(input: AppendExecutionEventInput): Promise<ExecutionEvent> {
    const run = this.runs.get(input.runId)!;
    const rows = this.events.get(input.runId) ?? [];
    const event: ExecutionEvent = {
      sequence: rows.length + 1,
      id: `event-${input.runId}-${rows.length + 1}`,
      runId: input.runId,
      aggregateType: run.aggregateType,
      aggregateId: run.aggregateId,
      type: input.type,
      ts: "2026-07-16T10:00:00.000Z",
      data: input.data,
    };
    rows.push(event);
    this.events.set(input.runId, rows);
    return event;
  }

  async transitionRun(
    runId: string,
    value: TransitionExecutionRunInput,
  ): Promise<ExecutionRun> {
    const run = this.runs.get(runId)!;
    const next = { ...run, status: value.status };
    this.runs.set(runId, next);
    return next;
  }

  async getRunById(runId: string): Promise<ExecutionRun | null> {
    return this.runs.get(runId) ?? null;
  }

  async getRunByIdForScope(input: ExecutionScopedRunRef) {
    this.scopedRunReads += 1;
    const run = this.runs.get(input.runId);
    return run &&
      run.tenantKey === input.tenantKey.toLowerCase() &&
      run.operation === input.operation &&
      run.mode === input.mode
      ? run
      : null;
  }

  async getRunByAggregate(input: {
    tenantKey: string;
    aggregateType: string;
    aggregateId: string;
    operation?: string;
  }): Promise<ExecutionRun | null> {
    return (
      [...this.runs.values()].find(
        (run) =>
          run.tenantKey === input.tenantKey &&
          run.aggregateType === input.aggregateType &&
          run.aggregateId === input.aggregateId &&
          (!input.operation || run.operation === input.operation),
      ) ?? null
    );
  }

  async getRunByAggregateForScope(input: ExecutionScopedAggregateRef) {
    return (
      [...this.runs.values()].find(
        (run) =>
          run.tenantKey === input.tenantKey.toLowerCase() &&
          run.operation === input.operation &&
          run.mode === input.mode &&
          run.aggregateType === input.aggregateType &&
          run.aggregateId === input.aggregateId,
      ) ?? null
    );
  }

  async listEvents(runId: string): Promise<ExecutionEvent[]> {
    return this.events.get(runId) ?? [];
  }

  async countEventsByType(runId: string, eventType: string): Promise<number> {
    return (this.events.get(runId) ?? []).filter(
      (event) => event.type === eventType,
    ).length;
  }

  async listRunnableTenantKeys(value: {
    operation: string;
    mode: "canary" | "active";
    limit: number;
    afterTenantKey?: string;
  }): Promise<string[]> {
    return [
      ...new Set(
        [...this.runs.values()]
          .filter(
            (run) =>
              run.operation === value.operation &&
              run.mode === value.mode &&
              (run.status === "queued" || run.status === "running"),
          )
          .map((run) => run.tenantKey),
      ),
    ]
      .filter(
        (tenant) => !value.afterTenantKey || tenant > value.afterTenantKey,
      )
      .sort()
      .slice(0, value.limit);
  }

  private claim(input: ClaimExecutionRunInput): ExecutionLeaseReceipt | null {
    if (this.denyClaims) return null;
    const run = this.runs.get(input.runId);
    if (
      !run ||
      run.tenantKey !== input.tenantKey.toLowerCase() ||
      run.operation !== input.operation ||
      run.mode !== input.mode ||
      (run.status !== "queued" && run.status !== "running")
    ) {
      return null;
    }
    if (run.status === "running" && this.tokens.has(run.id)) return null;
    const token = `token-${run.id}-${run.claimCount + 1}`;
    const claimed: ExecutionRun = {
      ...run,
      status: "running",
      leaseOwner: input.workerId,
      leaseExpiresAt: "2026-07-16T10:01:00.000Z",
      claimCount: run.claimCount + 1,
      startedAt: run.startedAt ?? "2026-07-16T10:00:01.000Z",
      updatedAt: "2026-07-16T10:00:01.000Z",
    };
    this.runs.set(run.id, claimed);
    this.tokens.set(run.id, token);
    return {
      run: claimed,
      token,
      expiresAt: claimed.leaseExpiresAt!,
      recovered: run.status === "running",
    };
  }

  async claimRun(input: ClaimExecutionRunInput) {
    return this.claim(input);
  }

  async claimNextRun(input: ClaimNextExecutionRunInput) {
    const run = [...this.runs.values()].find(
      (candidate) =>
        candidate.tenantKey === input.tenantKey.toLowerCase() &&
        candidate.operation === input.operation &&
        candidate.mode === input.mode &&
        candidate.status === "queued",
    );
    return run ? this.claim({ ...input, runId: run.id }) : null;
  }

  async renewRunLease(input: RenewExecutionRunLeaseInput) {
    const run = this.runs.get(input.runId);
    return run && this.tokens.get(input.runId) === input.token
      ? {
          run,
          token: input.token,
          expiresAt: run.leaseExpiresAt!,
          recovered: false,
        }
      : null;
  }

  async checkpointRun(input: CheckpointExecutionRunInput) {
    if (this.tokens.get(input.runId) !== input.token) return null;
    this.checkpoints.push(input);
    const run = this.runs.get(input.runId)!;
    const next = {
      ...run,
      currentStep: input.currentStep,
      ...(input.incrementHandlerAttempt
        ? { handlerAttempt: run.handlerAttempt + 1 }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(input, "output")
        ? { output: input.output }
        : {}),
    };
    this.runs.set(input.runId, next);
    await this.appendEvent({
      runId: input.runId,
      type: input.eventType,
      data: input.eventData,
    });
    this.effects.push(`checkpoint:${input.currentStep}`);
    return next;
  }

  async requeueRun(input: RequeueExecutionRunInput) {
    if (this.tokens.get(input.runId) !== input.token) return null;
    const run = this.runs.get(input.runId)!;
    const next: ExecutionRun = {
      ...run,
      status: "queued",
      currentStep: input.currentStep ?? undefined,
      availableAt: input.availableAt.toISOString(),
      error: input.error,
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
    };
    this.tokens.delete(input.runId);
    this.runs.set(input.runId, next);
    return next;
  }

  async finishRun(input: FinishExecutionRunInput) {
    if (this.tokens.get(input.runId) !== input.token) return null;
    const run = this.runs.get(input.runId)!;
    const next: ExecutionRun = {
      ...run,
      status: input.status,
      currentStep: input.currentStep ?? undefined,
      output: input.output,
      error: input.error ?? undefined,
      finishedAt: "2026-07-16T10:00:20.000Z",
      updatedAt: "2026-07-16T10:00:20.000Z",
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
    };
    this.tokens.delete(input.runId);
    this.runs.set(input.runId, next);
    this.effects.push(`finish:${input.status}`);
    return next;
  }
}

function dependencies(repository: MemoryRepository) {
  let modelReads = 0;
  let campaignWrites = 0;
  let taskWrites = 0;
  return {
    values: {
      get modelReads() {
        return modelReads;
      },
      get campaignWrites() {
        return campaignWrites;
      },
      get taskWrites() {
        return taskWrites;
      },
    },
    options: {
      repository,
      env,
      inlineTimeoutMs: 500,
      now: () => new Date("2026-07-16T10:00:00.000Z"),
      getModelConfig: async () => {
        modelReads += 1;
        const config = JSON.parse(JSON.stringify(DEFAULT_CREATOR_MODEL_CONFIG));
        config.qualification.threshold = modelReads === 1 ? 44 : 91;
        return {
          config,
          overrides: {},
          source: "defaults" as const,
          updatedAt: null,
        };
      },
      createCampaign: async (_slug: string, body: unknown) => {
        campaignWrites += 1;
        assert.ok(
          repository.effects.includes("ledger:partnerships.discovery.setup"),
          "setup Ledger receipt must precede Yalc",
        );
        assert.equal(
          repository.effects.includes("ledger:partnerships.discovery"),
          false,
          "child must not exist before campaign/workspace/search",
        );
        repository.effects.push("effect:campaign");
        assert.equal(
          (body as { disqualifyThreshold: number }).disqualifyThreshold,
          44,
        );
        return { campaignId: "campaign-setup-1" };
      },
      createWorkspace: async () => {
        taskWrites += 1;
        repository.effects.push("effect:workspace");
        return { projectId: "project-setup-1", taskId: "project-setup-1-T01" };
      },
      assignTemplates: async () => undefined,
      wakeDiscovery: async () => undefined,
    },
  };
}

test("setup is persisted before effects, freezes inputs and replays one child", async () => {
  const repository = new MemoryRepository();
  const deps = dependencies(repository);
  const command = input();

  const first = await admitCanaryDiscoverySetup(command, deps.options);
  assert.equal(first.kind, "ready");
  assert.equal(deps.values.modelReads, 1);
  assert.equal(deps.values.campaignWrites, 1);
  assert.equal(deps.values.taskWrites, 1);
  assert.equal(
    repository.effects.filter(
      (entry) => entry === "ledger:partnerships.discovery",
    ).length,
    1,
  );
  const searchReady = repository.effects.indexOf("checkpoint:search_ready");
  const childCreated = repository.effects.indexOf(
    "ledger:partnerships.discovery",
  );
  assert.ok(searchReady >= 0 && childCreated > searchReady);

  const outputs = repository.checkpoints
    .map((checkpoint) => checkpoint.output)
    .filter((value): value is Record<string, unknown> =>
      Boolean(value && typeof value === "object"),
    );
  assert.ok(outputs.some((value) => "campaign" in value));
  assert.ok(
    outputs.some(
      (value) =>
        "campaign" in value &&
        "workspace" in value &&
        "searchProjectedAt" in value &&
        "discoveryRunId" in value,
    ),
  );

  const second = await admitCanaryDiscoverySetup(command, deps.options);
  assert.equal(second.kind, "ready");
  assert.equal(second.replayed, true);
  assert.equal(
    deps.values.modelReads,
    1,
    "replay must not resolve changed config",
  );
  assert.equal(deps.values.campaignWrites, 1);
  assert.equal(deps.values.taskWrites, 1);
  assert.equal(
    (second.kind === "ready" &&
      second.search.executionModelConfig?.qualification.threshold) ||
      null,
    44,
  );
});

test("same command id with another request fingerprint conflicts before effects", async () => {
  const repository = new MemoryRepository();
  const deps = dependencies(repository);
  const command = input("conflict-command");
  await admitCanaryDiscoverySetup(command, deps.options);

  const conflictingPlan = {
    ...command.rawPlan,
    title: "Another request",
  };

  await assert.rejects(
    admitCanaryDiscoverySetup(
      {
        ...command,
        rawPlan: conflictingPlan,
        requestFingerprint: hash(
          canonical({
            plan: conflictingPlan,
            executionIntent: command.executionIntent,
          }),
        ),
      },
      deps.options,
    ),
    (error: unknown) =>
      error instanceof DiscoverySetupCommandError && error.status === 409,
  );
  assert.equal(deps.values.modelReads, 1);
  assert.equal(deps.values.campaignWrites, 1);
});

test("invalid tenant and oversized raw commands are rejected before the Ledger", async () => {
  const cases: Array<ReturnType<typeof input>> = [];
  cases.push({ ...input("invalid-slug-command"), slug: "../hospital-capilar" });

  let deep: Record<string, unknown> = { value: "leaf" };
  for (let index = 0; index < 30; index += 1) deep = { child: deep };
  cases.push({ ...input("deep-plan-command"), rawPlan: deep });
  cases.push({
    ...input("oversized-plan-command"),
    rawPlan: { title: "x".repeat(70 * 1024) },
  });

  for (const command of cases) {
    const repository = new MemoryRepository();
    const deps = dependencies(repository);
    await assert.rejects(
      admitCanaryDiscoverySetup(command, deps.options),
      (error: unknown) =>
        error instanceof DiscoverySetupCommandError &&
        error.status === 400 &&
        error.code === "invalid_setup_command",
    );
    assert.deepEqual(repository.effects, []);
    assert.equal(repository.runs.size, 0);
    assert.equal(deps.values.modelReads, 0);
    assert.equal(deps.values.campaignWrites, 0);
    assert.equal(deps.values.taskWrites, 0);
  }
});

test("artifact-store acknowledgement is required for pending and completed replays", async () => {
  const pendingRepository = new MemoryRepository();
  pendingRepository.denyClaims = true;
  const pendingDeps = dependencies(pendingRepository);
  const pendingCommand = input("ack-pending-command");
  const pending = await admitCanaryDiscoverySetup(pendingCommand, {
    ...pendingDeps.options,
    inlineTimeoutMs: 0,
  });
  assert.equal(pending.kind, "pending");
  const pendingEffects = [...pendingRepository.effects];
  await assert.rejects(
    admitCanaryDiscoverySetup(pendingCommand, {
      ...pendingDeps.options,
      env: unacknowledgedEnv,
      inlineTimeoutMs: 0,
    }),
    (error: unknown) =>
      error instanceof DiscoverySetupCommandError &&
      error.status === 503 &&
      error.code === "setup_store_not_acknowledged",
  );
  assert.deepEqual(pendingRepository.effects, pendingEffects);

  const completedRepository = new MemoryRepository();
  const completedDeps = dependencies(completedRepository);
  const completedCommand = input("ack-completed-command");
  const completed = await admitCanaryDiscoverySetup(
    completedCommand,
    completedDeps.options,
  );
  assert.equal(completed.kind, "ready");
  const completedEffects = [...completedRepository.effects];
  await assert.rejects(
    admitCanaryDiscoverySetup(completedCommand, {
      ...completedDeps.options,
      env: unacknowledgedEnv,
    }),
    (error: unknown) =>
      error instanceof DiscoverySetupCommandError &&
      error.status === 503 &&
      error.code === "setup_store_not_acknowledged",
  );
  assert.deepEqual(completedRepository.effects, completedEffects);

  const completedRun = [...completedRepository.runs.values()].find(
    (run) => run.operation === "partnerships.discovery.setup",
  )!;
  const publicStatus = await getDiscoverySetupAdmissionStatus(
    { slug: completedCommand.slug, runId: completedRun.id },
    { repository: completedRepository },
  );
  assert.equal(publicStatus?.status, "completed");
});

test("settled inline processing polls at a bounded cadence instead of spinning", async () => {
  const repository = new MemoryRepository();
  repository.denyClaims = true;
  const deps = dependencies(repository);
  const startedAt = Date.now();
  const result = await admitCanaryDiscoverySetup(
    input("bounded-poll-command"),
    { ...deps.options, inlineTimeoutMs: 180 },
  );
  const elapsedMs = Date.now() - startedAt;
  assert.equal(result.kind, "pending");
  assert.ok(
    elapsedMs >= 150,
    `inline wait returned too early (${elapsedMs}ms)`,
  );
  assert.ok(
    repository.scopedRunReads <= 8,
    `inline polling spun ${repository.scopedRunReads} exact reads`,
  );
});

test("thread correlation is first-writer-wins and does not change command identity", async () => {
  const repository = new MemoryRepository();
  const deps = dependencies(repository);
  const original = {
    ...input("thread-correlation-command"),
    threadId: "  hospital-capilar:original-thread  ",
  };
  const first = await admitCanaryDiscoverySetup(original, deps.options);
  const effectsAfterFirst = [...repository.effects];
  const replay = await admitCanaryDiscoverySetup(
    { ...original, threadId: "hospital-capilar:different-thread" },
    deps.options,
  );

  assert.equal(first.kind, "ready");
  assert.equal(replay.kind, "ready");
  assert.equal(replay.replayed, true);
  assert.equal(
    replay.kind === "ready" ? replay.search.threadId : null,
    "hospital-capilar:original-thread",
  );
  assert.deepEqual(repository.effects, effectsAfterFirst);
  assert.equal(
    [...repository.runs.values()].filter(
      (run) => run.operation === "partnerships.discovery.setup",
    ).length,
    1,
  );
});

test("model config resolves only after the raw receipt and aborts to evidenced defaults", async () => {
  const repository = new MemoryRepository();
  const deps = dependencies(repository);
  let signal: AbortSignal | undefined;
  const startedAt = Date.now();
  const result = await admitCanaryDiscoverySetup(
    input("model-config-timeout-command"),
    {
      ...deps.options,
      env: {
        ...env,
        PARTNERSHIPS_DISCOVERY_MODEL_CONFIG_TIMEOUT_MS: "25",
      },
      getModelConfig: (_slug, options) => {
        signal = options?.signal;
        assert.ok(
          repository.effects.includes("ledger:partnerships.discovery.setup"),
        );
        return new Promise(() => undefined);
      },
      createCampaign: async () => {
        repository.effects.push("effect:campaign");
        return { campaignId: "campaign-model-timeout" };
      },
    },
  );
  assert.equal(result.kind, "ready");
  assert.ok(Date.now() - startedAt < 1_000);
  assert.equal(signal?.aborted, true);
  const setup = [...repository.runs.values()].find(
    (run) => run.operation === "partnerships.discovery.setup",
  )!;
  const prepared = (
    setup.output as {
      prepared?: { modelConfigEvidence?: Record<string, unknown> };
    }
  ).prepared;
  assert.equal(
    prepared?.modelConfigEvidence?.fallbackReason,
    "model_config_timeout",
  );
});

test("bounded campaign timeout aborts and requeues without later effects", async () => {
  const repository = new MemoryRepository();
  const deps = dependencies(repository);
  let signal: AbortSignal | undefined;
  const result = await admitCanaryDiscoverySetup(
    input("campaign-timeout-command"),
    {
      ...deps.options,
      inlineTimeoutMs: 100,
      env: {
        ...env,
        PARTNERSHIPS_DISCOVERY_YALC_WRITE_TIMEOUT_MS: "25",
      },
      createCampaign: (_slug, _body, _key, options) => {
        signal = options?.signal;
        return new Promise(() => undefined);
      },
    },
  );
  assert.equal(result.kind, "pending");
  assert.equal(signal?.aborted, true);
  assert.equal(deps.values.taskWrites, 0);
  assert.equal(getSearch("hospital-capilar", result.searchId), null);
  assert.equal(
    [...repository.runs.values()].some(
      (run) => run.operation === "partnerships.discovery",
    ),
    false,
  );
  const setup = [...repository.runs.values()].find(
    (run) => run.operation === "partnerships.discovery.setup",
  )!;
  assert.equal(setup.status, "queued");
  assert.equal(setup.currentStep, "retry_wait");
});

test("lost child-create response recovers the frozen child and binds it once", async () => {
  const repository = new MemoryRepository();
  repository.throwAfterChildCreateOnce = true;
  const deps = dependencies(repository);
  const command = input("child-crash-command");

  const pending = await admitCanaryDiscoverySetup(command, {
    ...deps.options,
    inlineTimeoutMs: 0,
  });
  assert.equal(pending.kind, "pending");

  const setupRun = [...repository.runs.values()].find(
    (run) => run.operation === "partnerships.discovery.setup",
  )!;
  for (let index = 0; index < 50; index += 1) {
    const childExists = [...repository.runs.values()].some(
      (run) => run.operation === "partnerships.discovery",
    );
    const setupStatus = repository.runs.get(setupRun.id)?.status;
    if (
      setupStatus === "completed" ||
      (childExists && setupStatus === "queued")
    ) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  const mutableProjection = getSearch(command.slug, command.searchId);
  assert.ok(mutableProjection);
  saveSearch({
    ...mutableProjection,
    runner: {
      ...mutableProjection.runner,
      attempts: 77,
      error: "human diagnostic before child binding",
    },
  });

  const recovered = await admitCanaryDiscoverySetup(command, deps.options);
  assert.equal(
    recovered.kind,
    "ready",
    JSON.stringify({
      effects: repository.effects,
      runs: [...repository.runs.values()].map((run) => ({
        id: run.id,
        operation: run.operation,
        status: run.status,
        step: run.currentStep,
        error: run.error,
      })),
    }),
  );
  assert.equal(deps.values.campaignWrites, 1);
  assert.equal(deps.values.taskWrites, 1);
  assert.equal(
    repository.effects.filter(
      (entry) => entry === "ledger:partnerships.discovery",
    ).length,
    1,
  );
  const linked = getSearch(command.slug, command.searchId);
  assert.ok(linked?.executionControl?.runId);
  assert.equal(linked?.runner.attempts, 77);
  assert.equal(linked?.runner.error, "human diagnostic before child binding");
});

test("pending/status is exact-tenant scoped and exposes no command or model config", async () => {
  const repository = new MemoryRepository();
  repository.denyClaims = true;
  const deps = dependencies(repository);
  const command = input("pending-command");
  const pending = await admitCanaryDiscoverySetup(command, {
    ...deps.options,
    inlineTimeoutMs: 0,
  });
  assert.equal(pending.kind, "pending");
  if (pending.kind !== "pending") return;

  const sticky = await admitCanaryDiscoverySetup(command, {
    ...deps.options,
    env: {
      PARTNERSHIPS_DISCOVERY_EXECUTION_V2: "off",
      PARTNERSHIPS_DISCOVERY_V2_SLUGS: "",
      PARTNERSHIPS_DISCOVERY_ARTIFACT_STORE: "local-persistent-single-host",
    },
    inlineTimeoutMs: 0,
  });
  assert.equal(sticky.kind, "pending");
  assert.equal(
    sticky.kind === "pending" ? sticky.setupRunId : null,
    pending.setupRunId,
  );
  assert.equal(deps.values.campaignWrites, 0);
  assert.equal(deps.values.taskWrites, 0);
  assert.equal(
    repository.effects.filter(
      (entry) => entry === "ledger:partnerships.discovery.setup",
    ).length,
    1,
  );

  const status = await getDiscoverySetupAdmissionStatus(
    { slug: command.slug, runId: pending.setupRunId },
    { repository },
  );
  assert.equal(status?.status, "queued");
  const serialized = JSON.stringify(status);
  assert.doesNotMatch(
    serialized,
    /thread-private|modelConfig|requestFingerprint/,
  );
  assert.equal(
    await getDiscoverySetupAdmissionStatus(
      { slug: "other-tenant", runId: pending.setupRunId },
      { repository },
    ),
    null,
  );
});

test("startup drains setup and child after restart with rollout flag off", async () => {
  const repository = new MemoryRepository();
  repository.denyClaims = true;
  const deps = dependencies(repository);
  const command = input("restart-drain-command");
  const accepted = await admitCanaryDiscoverySetup(command, {
    ...deps.options,
    inlineTimeoutMs: 0,
  });
  assert.equal(accepted.kind, "pending");

  repository.denyClaims = false;
  const started = await startCanaryDiscoveryWorkers({
    repository,
    env: {
      PARTNERSHIPS_DISCOVERY_EXECUTION_V2: "off",
      PARTNERSHIPS_DISCOVERY_V2_SLUGS: "",
      PARTNERSHIPS_DISCOVERY_ARTIFACT_STORE: "local-persistent-single-host",
      PARTNERSHIPS_DISCOVERY_WORKER_POLL_MS: "20",
    },
    setup: deps.options,
    runSearch: (async () => ({
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
    })) as never,
    logError: () => undefined,
  });
  assert.deepEqual(started, ["hospital-capilar"]);

  let terminal = false;
  for (let index = 0; index < 100; index += 1) {
    const runs = [...repository.runs.values()];
    const setup = runs.find(
      (run) => run.operation === "partnerships.discovery.setup",
    );
    const child = runs.find(
      (run) => run.operation === "partnerships.discovery",
    );
    if (setup?.status === "completed" && child?.status === "completed") {
      terminal = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(terminal, true);
  assert.equal(deps.values.campaignWrites, 1);
  assert.equal(deps.values.taskWrites, 1);
});

test("workspace setup replay preserves an already-mutated deterministic task", async () => {
  const commandId = "workspace-replay-command";
  const commandHash = hash(`hospital-capilar\u0000${commandId}`);
  const modelConfig = JSON.parse(JSON.stringify(DEFAULT_CREATOR_MODEL_CONFIG));
  const plan = parseDiscoveryPlan(
    {
      title: "Workspace durable",
      sectors: ["salud capilar"],
      networks: ["instagram"],
    },
    modelConfig,
  );
  const rawPlan = {
    title: "Workspace durable",
    sectors: ["salud capilar"],
    networks: ["instagram"],
  };
  const campaignRequest = buildCampaignPayload(plan);
  const modelConfigEvidence = {
    source: "defaults" as const,
    updatedAt: null,
    hash: hash(canonical(modelConfig)),
  };
  const prepared = {
    preparedFingerprint: hash(
      canonical({
        plan,
        campaignRequest,
        modelConfig,
        modelConfigEvidence,
        executionIntent: "fixtures",
      }),
    ),
    plan,
    campaignRequest,
    modelConfig,
    modelConfigEvidence,
  };
  const command = {
    schemaVersion: 1 as const,
    slug: "hospital-capilar",
    searchId: `ds-${commandHash.slice(0, 20)}`,
    commandId,
    commandHash,
    requestFingerprint: hash(
      canonical({ plan: rawPlan, executionIntent: "fixtures" }),
    ),
    rawPlan,
    threadId: null,
    executionIntent: "fixtures" as const,
    createdAt: "2026-07-16T10:00:00.000Z",
  };

  const first = await ensureDiscoverySetupWorkspace(
    command.slug,
    command,
    prepared,
    "campaign-workspace",
  );
  assert.equal(first.taskSetup, "created");
  assert.ok(first.taskId);
  await updateTask(command.slug, first.taskId!, {
    status: "completed",
    description: "operator mutation that must survive replay",
  });
  const childCount = getChildren(command.slug, first.projectId!).length;

  const replay = await ensureDiscoverySetupWorkspace(
    command.slug,
    command,
    prepared,
    "campaign-workspace",
  );
  const task = (await getTask(command.slug, first.taskId!)) as unknown as {
    status?: string;
    description?: string;
  };
  assert.deepEqual(replay, first);
  assert.equal(task.status, "completed");
  assert.equal(task.description, "operator mutation that must survive replay");
  assert.equal(getChildren(command.slug, first.projectId!).length, childCount);
});

test("JSON insert-only project creation has one cross-process owner receipt", async () => {
  const project = {
    id: "P-Durable-Race",
    name: "Durable race",
    category: "outreach-campaign",
    status: "in-progress",
    owner: "Sancho",
    description: "created once across processes",
    seedFromTaskSet: "outreach-campaign",
    idempotencyMarker: "contract:json-race:v1",
  };
  const script = [
    'const tasks = await import("./src/lib/data/tasks.ts");',
    "const ensureProjectInsertOnly = tasks.ensureProjectInsertOnly ?? tasks.default?.ensureProjectInsertOnly;",
    `await ensureProjectInsertOnly("hospital-capilar", ${JSON.stringify(project)});`,
  ].join("\n");
  await Promise.all(
    Array.from({ length: 4 }, () =>
      execFileAsync(
        process.execPath,
        ["--import", "tsx", "--input-type=module", "--eval", script],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            MC_WORKSPACE: workspace,
            MC_TASKS_BACKEND: "json",
          },
          timeout: 15_000,
        },
      ),
    ),
  );

  const projectDir = path.join(
    workspace,
    "brand",
    "hospital-capilar",
    "projects",
    project.id,
  );
  const receipt = JSON.parse(
    fs.readFileSync(path.join(projectDir, "project.json"), "utf8"),
  ) as { legacy_extras?: { durable_creation_key?: string } };
  const tasks = JSON.parse(
    fs.readFileSync(path.join(projectDir, "tasks.json"), "utf8"),
  ) as Array<{ legacy_extras?: { durable_creation_key?: string } }>;
  assert.equal(
    receipt.legacy_extras?.durable_creation_key,
    project.idempotencyMarker,
  );
  assert.ok(tasks.length > 0);
  assert.ok(
    tasks.every(
      (task) =>
        task.legacy_extras?.durable_creation_key === project.idempotencyMarker,
    ),
  );
});

test("JSON insert-only replay never overwrites mutation or another owner marker", async () => {
  const project = {
    id: "P-Durable-Mutation",
    name: "Original project",
    category: "outreach-campaign",
    status: "in-progress" as const,
    owner: "Sancho",
    description: "original description",
    seedFromTaskSet: "outreach-campaign",
    idempotencyMarker: "contract:json-mutation:v1",
  };
  const first = await ensureProjectInsertOnly("hospital-capilar", project);
  assert.equal(first.created, true);
  await updateTask("hospital-capilar", project.id, {
    name: "Operator-owned title",
    description: "operator mutation",
  });

  const replay = await ensureProjectInsertOnly("hospital-capilar", project);
  assert.equal(replay.created, false);
  assert.equal(replay.project.name, "Operator-owned title");
  assert.equal(replay.project.description, "operator mutation");
  await assert.rejects(
    ensureProjectInsertOnly("hospital-capilar", {
      ...project,
      idempotencyMarker: "contract:another-owner:v1",
    }),
    /owned by another command/,
  );
  const afterConflict = await getTask("hospital-capilar", project.id);
  assert.equal(afterConflict?.name, "Operator-owned title");
});

test("JSON insert-only replay observes a partial receipt without repairing it", async () => {
  const project = {
    id: "P-Durable-Partial",
    name: "Partial project",
    category: "outreach-campaign",
    status: "in-progress" as const,
    seedFromTaskSet: "outreach-campaign",
    idempotencyMarker: "contract:json-partial:v1",
  };
  const first = await ensureProjectInsertOnly("hospital-capilar", project);
  assert.equal(first.created, true);
  const tasksFile = path.join(
    workspace,
    "brand",
    "hospital-capilar",
    "projects",
    project.id,
    "tasks.json",
  );
  fs.rmSync(tasksFile);

  const replay = await ensureProjectInsertOnly("hospital-capilar", project);
  assert.equal(replay.created, false);
  assert.equal(fs.existsSync(tasksFile), false);
  assert.deepEqual(getChildren("hospital-capilar", project.id), []);
});
