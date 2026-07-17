import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, beforeEach, test } from "node:test";
import {
  type CreateExecutionRunInput,
  type ExecutionControlRepository,
  type ExecutionRun,
  type ExecutionRunStatus,
  type ExecutionScopedRunRef,
} from "@/lib/execution-control";
import { ExecutionCommandConflictError } from "@/lib/execution-control/types";
import { executionCommandFingerprint } from "@/lib/execution-control/postgres";
import { DEFAULT_CREATOR_MODEL_CONFIG } from "@/lib/calc-creator-core";
import type { DiscoverySearchRecord } from "../discovery-types";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sancho-retry-contract-"));
process.env.MC_WORKSPACE = tmp;
process.env.MC_TASKS_BACKEND = "json";
process.env.YALC_BASE_URL = "http://yalc.retry.test";

const canaryEnv = {
  PARTNERSHIPS_DISCOVERY_EXECUTION_V2: "canary",
  PARTNERSHIPS_DISCOVERY_V2_SLUGS: "hospital-capilar",
  PARTNERSHIPS_DISCOVERY_ARTIFACT_STORE: "local-persistent-single-host",
};

type StoreModule = typeof import("../discovery-store");
type WorkerModule = typeof import("../discovery-durable-worker");
let store: StoreModule;
let worker: WorkerModule;
let originalFetch: typeof fetch;

function search(id: string): DiscoverySearchRecord {
  const commandFingerprint = `linked-fingerprint-${id}`;
  return {
    id,
    slug: "hospital-capilar",
    commandId: `command-${id}`,
    commandFingerprint: `product-${id}`,
    executionIntent: "fixtures",
    executionControl: {
      mode: "canary",
      admittedAt: "2026-07-16T10:00:00.000Z",
      generation: 1,
      runId: `xrun-${id}-g1`,
      commandFingerprint,
    },
    executionModelConfig: JSON.parse(
      JSON.stringify(DEFAULT_CREATOR_MODEL_CONFIG),
    ),
    title: "Salud capilar",
    plan: {
      title: "Salud capilar",
      sectors: ["salud capilar"],
      networks: ["instagram"],
      tiers: ["micro"],
      targetVolume: 1,
    },
    campaignId: `campaign-${id}`,
    projectId: null,
    taskId: null,
    threadId: null,
    runner: {
      // Deliberately stale: retry authority must come from the Ledger status.
      status: "error",
      mode: "fixtures",
      jobId: `partnerships.discovery:run:xrun-${id}-g1:step:yalc.campaign:v2`,
      attempts: 1,
      queuedAt: "2026-07-16T10:00:00.000Z",
      startedAt: "2026-07-16T10:00:01.000Z",
      finishedAt: "2026-07-16T10:00:02.000Z",
      retryable: true,
      errorCode: "provider_timeout",
      error: "stale JSON timeout",
      stats: null,
    },
    createdAt: "2026-07-16T10:00:00.000Z",
    updatedAt: "2026-07-16T10:00:02.000Z",
  };
}

function linkedRun(
  record: DiscoverySearchRecord,
  status: ExecutionRunStatus,
): ExecutionRun {
  return {
    id: record.executionControl!.runId!,
    tenantKey: record.slug,
    idempotencyKey: `partnerships.discovery:${record.slug}:${record.id}:attempt:1:canary:v2`,
    aggregateType: "partnerships.search",
    aggregateId: `${record.slug}:${record.id}`,
    operation: "partnerships.discovery",
    mode: "canary",
    status,
    input: {
      schemaVersion: 2,
      slug: record.slug,
      searchId: record.id,
      attempt: 1,
      executionGeneration: 1,
      modelConfig: record.executionModelConfig,
      title: record.title,
      campaignId: record.campaignId,
      projectId: record.projectId,
      taskId: record.taskId,
      executionIntent: record.executionIntent,
      plan: record.plan,
      observedRunner: {
        status: "queued",
        mode: "fixtures",
        jobId: null,
      },
      createdAt: record.createdAt,
    },
    output:
      status === "completed"
        ? {
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
          }
        : undefined,
    error:
      status === "failed" || status === "partial"
        ? "provider timeout"
        : undefined,
    metadata: { authority: "execution_ledger", schemaVersion: 2 },
    commandFingerprint: record.executionControl!.commandFingerprint,
    availableAt: "2026-07-16T10:00:00.000Z",
    claimCount: status === "queued" ? 0 : 1,
    handlerAttempt: status === "queued" ? 0 : 1,
    createdAt: "2026-07-16T10:00:00.000Z",
    startedAt:
      status === "queued" || status === "waiting_approval"
        ? undefined
        : "2026-07-16T10:00:01.000Z",
    finishedAt: ["completed", "failed", "partial", "cancelled"].includes(status)
      ? "2026-07-16T10:00:03.000Z"
      : undefined,
    updatedAt: "2026-07-16T10:00:03.000Z",
  };
}

class RetryRepository {
  readonly runs = new Map<string, ExecutionRun>();
  readonly idempotencyWinners = new Map<string, ExecutionRun>();
  readonly creates: CreateExecutionRunInput[] = [];
  forceCommandConflict = false;
  scopedLookups: ExecutionScopedRunRef[] = [];

  constructor(run: ExecutionRun) {
    this.runs.set(run.id, run);
  }

  async getRunByIdForScope(input: ExecutionScopedRunRef) {
    this.scopedLookups.push(input);
    const run = this.runs.get(input.runId) ?? null;
    if (
      !run ||
      run.tenantKey !== input.tenantKey ||
      run.operation !== input.operation ||
      run.mode !== input.mode
    ) {
      return null;
    }
    return run;
  }

  async createRun(input: CreateExecutionRunInput) {
    this.creates.push(input);
    if (this.forceCommandConflict) throw new ExecutionCommandConflictError();
    const key = [
      input.tenantKey,
      input.aggregateType,
      input.aggregateId,
      input.operation,
      input.idempotencyKey,
    ].join("|");
    const fingerprint = executionCommandFingerprint(input);
    const winner = this.idempotencyWinners.get(key);
    if (winner) {
      if (winner.commandFingerprint !== fingerprint) {
        throw new ExecutionCommandConflictError();
      }
      return { run: winner, created: false };
    }
    const now = new Date().toISOString();
    const run: ExecutionRun = {
      id: `xrun-retry-${this.idempotencyWinners.size + 1}`,
      tenantKey: input.tenantKey,
      idempotencyKey: input.idempotencyKey,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      operation: input.operation,
      mode: input.mode ?? "shadow",
      status: "queued",
      input: input.input,
      metadata: input.metadata ?? {},
      commandFingerprint: fingerprint,
      availableAt: now,
      claimCount: 0,
      handlerAttempt: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.idempotencyWinners.set(key, run);
    this.runs.set(run.id, run);
    return { run, created: true };
  }
}

function repository(value: RetryRepository): ExecutionControlRepository {
  return value as unknown as ExecutionControlRepository;
}

before(async () => {
  originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ ok: true, overrides: {} }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
  store = await import("../discovery-store");
  worker = await import("../discovery-durable-worker");
});

beforeEach(() => {
  fs.rmSync(path.join(tmp, "brand"), { recursive: true, force: true });
});

after(() => {
  globalThis.fetch = originalFetch;
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("queued, running and waiting_approval reuse the exact linked receipt", async () => {
  for (const status of ["queued", "running", "waiting_approval"] as const) {
    const record = store.saveSearch(
      search(`ds-linked-${status.replace("_", "-")}`),
    );
    const repo = new RetryRepository(linkedRun(record, status));
    const result = await worker.requestDiscoverySearchRun(
      { slug: record.slug, searchId: record.id, fixtures: true },
      { repository: repository(repo), env: canaryEnv },
    );
    assert.equal(result.executionControl?.generation, 1);
    assert.equal(
      result.executionControl?.runId,
      record.executionControl?.runId,
    );
    assert.equal(repo.creates.length, 0);
    assert.deepEqual(repo.scopedLookups[0], {
      tenantKey: "hospital-capilar",
      operation: "partnerships.discovery",
      mode: "canary",
      runId: record.executionControl?.runId,
    });
  }
});

test("completed repairs stale JSON and never creates a retry generation", async () => {
  const record = store.saveSearch(search("ds-linked-completed"));
  const repo = new RetryRepository(linkedRun(record, "completed"));
  const result = await worker.requestDiscoverySearchRun(
    { slug: record.slug, searchId: record.id, fixtures: true },
    { repository: repository(repo), env: canaryEnv },
  );
  assert.equal(result.runner.status, "done");
  assert.equal(result.runner.stats?.inserted, 1);
  assert.equal(result.executionControl?.generation, 1);
  assert.equal(repo.creates.length, 0);
});

test("failed and partial are the only statuses that open a new generation", async () => {
  for (const status of ["failed", "partial"] as const) {
    const record = store.saveSearch(search(`ds-linked-${status}`));
    const repo = new RetryRepository(linkedRun(record, status));
    const result = await worker.requestDiscoverySearchRun(
      { slug: record.slug, searchId: record.id, fixtures: true },
      { repository: repository(repo), env: canaryEnv },
    );
    assert.equal(result.executionControl?.generation, 2);
    assert.equal(result.executionControl?.runId, "xrun-retry-1");
    assert.ok(result.executionControl?.commandFingerprint);
    assert.equal(result.runner.status, "queued");
    assert.equal(result.runner.attempts, 2);
    assert.equal(repo.idempotencyWinners.size, 1);
  }
});

test("cancelled, missing, cross-scope and fingerprint mismatch fail with 409 domain state", async () => {
  const cancelled = store.saveSearch(search("ds-linked-cancelled"));
  const cancelledRepo = new RetryRepository(linkedRun(cancelled, "cancelled"));
  await assert.rejects(
    () =>
      worker.requestDiscoverySearchRun(
        { slug: cancelled.slug, searchId: cancelled.id },
        { repository: repository(cancelledRepo), env: canaryEnv },
      ),
    (error: unknown) =>
      error instanceof worker.DiscoveryRetryConflictError &&
      error.status === 409 &&
      error.code === "DISCOVERY_DURABLE_CANCELLED",
  );

  for (const kind of ["missing", "scope", "fingerprint"] as const) {
    const record = store.saveSearch(search(`ds-linked-${kind}`));
    const run = linkedRun(record, "failed");
    if (kind === "scope") run.tenantKey = "other-tenant";
    if (kind === "fingerprint") run.commandFingerprint = "other-fingerprint";
    const repo = new RetryRepository(run);
    if (kind === "missing") repo.runs.clear();
    await assert.rejects(
      () =>
        worker.requestDiscoverySearchRun(
          { slug: record.slug, searchId: record.id },
          { repository: repository(repo), env: canaryEnv },
        ),
      (error: unknown) =>
        error instanceof worker.DiscoveryRetryConflictError &&
        error.status === 409 &&
        error.code === "DISCOVERY_DURABLE_RETRY_CONFLICT",
    );
    assert.equal(repo.creates.length, 0);
  }
});

test("two concurrent retries reserve one generation and one durable run", async () => {
  const record = store.saveSearch(search("ds-linked-concurrent"));
  const repo = new RetryRepository(linkedRun(record, "failed"));
  const [left, right] = await Promise.all([
    worker.requestDiscoverySearchRun(
      { slug: record.slug, searchId: record.id, fixtures: true },
      { repository: repository(repo), env: canaryEnv },
    ),
    worker.requestDiscoverySearchRun(
      { slug: record.slug, searchId: record.id, fixtures: true },
      { repository: repository(repo), env: canaryEnv },
    ),
  ]);
  assert.equal(left.executionControl?.generation, 2);
  assert.equal(right.executionControl?.generation, 2);
  assert.equal(left.executionControl?.runId, right.executionControl?.runId);
  assert.equal(
    left.executionControl?.commandFingerprint,
    right.executionControl?.commandFingerprint,
  );
  assert.equal(repo.idempotencyWinners.size, 1);
  assert.equal(
    new Set(repo.creates.map((create) => create.idempotencyKey)).size,
    1,
  );
});

test("core idempotency fingerprint conflicts map to stable domain 409", async () => {
  const record = store.saveSearch(search("ds-linked-core-conflict"));
  const repo = new RetryRepository(linkedRun(record, "failed"));
  repo.forceCommandConflict = true;
  await assert.rejects(
    () =>
      worker.requestDiscoverySearchRun(
        { slug: record.slug, searchId: record.id, fixtures: true },
        { repository: repository(repo), env: canaryEnv },
      ),
    (error: unknown) =>
      error instanceof worker.DiscoveryRetryConflictError &&
      error.status === 409 &&
      error.code === "DISCOVERY_DURABLE_RETRY_CONFLICT" &&
      !error.message.includes("fingerprint"),
  );
});
