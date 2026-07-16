import assert from "node:assert/strict";
import test from "node:test";
import type {
  AppendExecutionEventInput,
  CreateExecutionRunInput,
  ExecutionControlRepository,
  ExecutionEvent,
  ExecutionRun,
  TransitionExecutionRunInput,
} from "@/lib/execution-control";
import {
  observeDiscoveryExecutionCreated,
  observeDiscoveryExecutionDispatch,
  observeDiscoveryExecutionTransition,
} from "../discovery-execution-observer";
import type { DiscoverySearchRecord } from "../discovery-types";

function search(): DiscoverySearchRecord {
  return {
    id: "ds-1",
    slug: "hospital-capilar",
    title: "Creators capilares ES",
    plan: {
      title: "Creators capilares ES",
      sectors: ["salud capilar"],
      networks: ["instagram", "tiktok"],
      tiers: ["micro"],
      targetVolume: 20,
    },
    campaignId: "campaign-1",
    projectId: null,
    taskId: "task-1",
    threadId: "private-chat-thread",
    runner: {
      status: "queued",
      mode: null,
      queuedAt: "2026-07-15T10:00:00.000Z",
      startedAt: null,
      finishedAt: null,
      error: null,
      stats: null,
    },
    createdAt: "2026-07-15T10:00:00.000Z",
    updatedAt: "2026-07-15T10:00:00.000Z",
  };
}

class FakeRepository implements ExecutionControlRepository {
  creates: CreateExecutionRunInput[] = [];
  events: AppendExecutionEventInput[] = [];
  transitions: Array<{
    runId: string;
    input: TransitionExecutionRunInput;
    type: string;
  }> = [];
  run: ExecutionRun = {
    id: "xrun-1",
    tenantKey: "hospital-capilar",
    idempotencyKey: "key",
    aggregateType: "partnerships.search",
    aggregateId: "hospital-capilar:ds-1",
    operation: "partnerships.discovery",
    mode: "shadow",
    status: "queued",
    metadata: {},
    availableAt: "2026-07-15T10:00:00.000Z",
    claimCount: 0,
    handlerAttempt: 0,
    createdAt: "2026-07-15T10:00:00.000Z",
    updatedAt: "2026-07-15T10:00:00.000Z",
  };

  async createRun(input: CreateExecutionRunInput) {
    this.creates.push(input);
    return { run: this.run, created: this.creates.length === 1 };
  }
  async appendEvent(input: AppendExecutionEventInput): Promise<ExecutionEvent> {
    this.events.push(input);
    return {
      sequence: this.events.length,
      id: `evt-${this.events.length}`,
      runId: input.runId,
      aggregateType: this.run.aggregateType,
      aggregateId: this.run.aggregateId,
      type: input.type,
      ts: "2026-07-15T10:00:00.000Z",
      ...(input.data !== undefined ? { data: input.data } : {}),
    };
  }
  async transitionRun(
    runId: string,
    input: TransitionExecutionRunInput,
    type: string,
  ): Promise<ExecutionRun> {
    this.transitions.push({ runId, input, type });
    this.run = { ...this.run, status: input.status };
    return this.run;
  }
  async getRunById(): Promise<ExecutionRun | null> {
    return this.run;
  }
  async getRunByIdForScope(input: {
    tenantKey: string;
    operation: string;
    mode: "canary" | "active";
    runId: string;
  }): Promise<ExecutionRun | null> {
    return this.run.id === input.runId &&
      this.run.tenantKey === input.tenantKey &&
      this.run.operation === input.operation &&
      this.run.mode === input.mode
      ? this.run
      : null;
  }
  async getRunByAggregate(): Promise<ExecutionRun | null> {
    return this.run;
  }
  async getRunByAggregateForScope(input: {
    tenantKey: string;
    operation: string;
    mode: "canary" | "active";
    aggregateType: string;
    aggregateId: string;
  }): Promise<ExecutionRun | null> {
    return this.run.tenantKey === input.tenantKey &&
      this.run.operation === input.operation &&
      this.run.mode === input.mode &&
      this.run.aggregateType === input.aggregateType &&
      this.run.aggregateId === input.aggregateId
      ? this.run
      : null;
  }
  async listEvents(): Promise<ExecutionEvent[]> {
    return [];
  }
  async claimRun() {
    return null;
  }
  async claimNextRun() {
    return null;
  }
  async renewRunLease() {
    return null;
  }
  async checkpointRun() {
    return null;
  }
  async requeueRun() {
    return null;
  }
  async finishRun() {
    return null;
  }
}

const enabledEnv = {
  PARTNERSHIPS_DISCOVERY_EXECUTION_V2: "shadow",
  PARTNERSHIPS_DISCOVERY_V2_SLUGS: "hospital-capilar",
};
const canaryEnv = {
  PARTNERSHIPS_DISCOVERY_EXECUTION_V2: "canary",
  PARTNERSHIPS_DISCOVERY_V2_SLUGS: "hospital-capilar",
  PARTNERSHIPS_DISCOVERY_ARTIFACT_STORE: "local-persistent-single-host",
};

test("disabled shadow performs no database work", async () => {
  const repository = new FakeRepository();
  const result = await observeDiscoveryExecutionCreated(search(), {
    repository,
    env: {},
  });
  assert.deepEqual(result, { enabled: false, recorded: false });
  assert.equal(repository.creates.length, 0);
});

test("shadow create is idempotent and persists a sanitized frozen command", async () => {
  const repository = new FakeRepository();
  const first = await observeDiscoveryExecutionCreated(search(), {
    repository,
    env: enabledEnv,
  });
  const second = await observeDiscoveryExecutionCreated(search(), {
    repository,
    env: enabledEnv,
  });
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(
    repository.creates[0].idempotencyKey,
    "partnerships.discovery:hospital-capilar:ds-1:attempt:1:v2",
  );
  assert.equal(repository.creates[0].tenantKey, "hospital-capilar");
  assert.doesNotMatch(
    JSON.stringify(repository.creates[0].input),
    /private-chat-thread/,
  );
});

test("canary create is fail-closed and uses a receipt distinct from shadow", async () => {
  const repository = new FakeRepository();
  repository.run = { ...repository.run, mode: "canary" };

  const result = await observeDiscoveryExecutionCreated(search(), {
    repository,
    env: canaryEnv,
  });

  assert.equal(result.recorded, true);
  assert.equal(repository.creates[0].mode, "canary");
  assert.equal(
    repository.creates[0].idempotencyKey,
    "partnerships.discovery:hospital-capilar:ds-1:attempt:1:canary:v2",
  );
  assert.equal(repository.creates[0].metadata?.authority, "execution_ledger");

  repository.createRun = async () => {
    throw new Error("ledger unavailable");
  };
  await assert.rejects(
    () =>
      observeDiscoveryExecutionCreated(search(), {
        repository,
        env: canaryEnv,
      }),
    /ledger unavailable/,
  );
});

test("canary parks an explicit run:none command outside the claim queue", async () => {
  const repository = new FakeRepository();
  repository.run = { ...repository.run, mode: "canary" };
  const deferred = search();
  deferred.executionIntent = "none";

  await observeDiscoveryExecutionCreated(deferred, {
    repository,
    env: canaryEnv,
  });

  assert.deepEqual(repository.transitions[0], {
    runId: "xrun-1",
    input: {
      status: "waiting_approval",
      expectedStatus: "queued",
      currentStep: "deferred",
    },
    type: "execution.deferred",
  });
});

test("canary replay reuses the exact linked run after mutable runner state changes", async () => {
  const repository = new FakeRepository();
  const current = search();
  current.executionControl = {
    mode: "canary",
    admittedAt: current.createdAt,
    generation: 1,
    runId: "xrun-1",
    commandFingerprint: "fingerprint-1",
  };
  current.runner = {
    ...current.runner,
    status: "done",
    mode: "live",
    jobId: "mutable-job",
    finishedAt: "2026-07-15T10:10:00.000Z",
  };
  repository.run = {
    ...repository.run,
    mode: "canary",
    status: "completed",
    commandFingerprint: "fingerprint-1",
    input: {
      schemaVersion: 2,
      slug: current.slug,
      searchId: current.id,
      executionGeneration: 1,
    },
  };

  const result = await observeDiscoveryExecutionCreated(current, {
    repository,
    env: canaryEnv,
  });

  assert.equal(result.runId, "xrun-1");
  assert.equal(result.created, false);
  assert.equal(repository.creates.length, 0);
});

test("canary linked-run replay fails closed when exact scope lookup misses", async () => {
  const repository = new FakeRepository();
  const current = search();
  current.executionControl = {
    mode: "canary",
    admittedAt: current.createdAt,
    generation: 1,
    runId: "xrun-missing",
    commandFingerprint: "fingerprint-1",
  };
  repository.run = { ...repository.run, mode: "canary" };
  repository.getRunByIdForScope = async () => null;

  await assert.rejects(
    observeDiscoveryExecutionCreated(current, {
      repository,
      env: canaryEnv,
    }),
    /missing from its exact scope/,
  );
  assert.equal(repository.creates.length, 0);
});

test("setup child-before-bind replay recovers the frozen child without create", async () => {
  const repository = new FakeRepository();
  const current = search();
  current.executionControl = {
    mode: "canary",
    admittedAt: current.createdAt,
    generation: 1,
    setupRunId: "xrun-setup",
    preparedFingerprint: "prepared-1",
  };
  current.runner = { ...current.runner, status: "running", mode: "live" };
  repository.run = {
    ...repository.run,
    mode: "canary",
    status: "running",
    commandFingerprint: "fingerprint-child",
    input: {
      schemaVersion: 2,
      slug: current.slug,
      searchId: current.id,
      executionGeneration: 1,
      setupRunId: "xrun-setup",
      preparedFingerprint: "prepared-1",
    },
  };

  const result = await observeDiscoveryExecutionCreated(current, {
    repository,
    env: canaryEnv,
  });

  assert.equal(result.runId, "xrun-1");
  assert.equal(result.created, false);
  assert.equal(repository.creates.length, 0);
});

test("shadow database failure never fails the legacy search", async () => {
  const repository = new FakeRepository();
  repository.createRun = async () => {
    throw new Error("database unavailable");
  };
  const logs: string[] = [];
  const result = await observeDiscoveryExecutionCreated(search(), {
    repository,
    env: enabledEnv,
    logError: (message) => logs.push(message),
  });
  assert.deepEqual(result, {
    enabled: true,
    recorded: false,
    degraded: "ledger_unavailable",
  });
  assert.equal(logs.length, 1);
  assert.doesNotMatch(logs[0], /database unavailable/);
});

test("shadow mirrors a running transition without executing product work", async () => {
  const repository = new FakeRepository();
  const result = await observeDiscoveryExecutionTransition(
    search(),
    "execution.started",
    { status: "running", currentStep: "discover" },
    { runnerMode: "agent" },
    { repository, env: enabledEnv },
  );
  assert.equal(result.recorded, true);
  assert.deepEqual(repository.transitions, [
    {
      runId: "xrun-1",
      input: {
        status: "running",
        currentStep: "discover",
        expectedStatus: "queued",
      },
      type: "execution.started",
    },
  ]);
});

test("same-status transition still updates the current step", async () => {
  const repository = new FakeRepository();
  repository.run = {
    ...repository.run,
    status: "running",
    currentStep: "discover",
  };
  await observeDiscoveryExecutionTransition(
    search(),
    "execution.step_changed",
    { status: "running", currentStep: "ingest" },
    undefined,
    { repository, env: enabledEnv },
  );

  assert.deepEqual(repository.transitions[0].input, {
    status: "running",
    currentStep: "ingest",
    expectedStatus: "running",
  });
});

test("each retry attempt gets a distinct idempotency key", async () => {
  const repository = new FakeRepository();
  const retried = search();
  retried.runner.attempts = 2;

  await observeDiscoveryExecutionCreated(retried, {
    repository,
    env: enabledEnv,
  });

  assert.equal(
    repository.creates[0].idempotencyKey,
    "partnerships.discovery:hospital-capilar:ds-1:attempt:2:v2",
  );
  assert.equal((repository.creates[0].input as { attempt: number }).attempt, 2);
});

test("a slow ledger is bounded and cannot hang the legacy path", async () => {
  const repository = new FakeRepository();
  repository.createRun = async () => new Promise(() => {});
  const startedAt = Date.now();
  const result = await observeDiscoveryExecutionCreated(search(), {
    repository,
    env: enabledEnv,
    timeoutMs: 10,
    logError: () => {},
  });

  assert.equal(result.degraded, "ledger_unavailable");
  assert.ok(Date.now() - startedAt < 250);
});

test("repeated ledger failures open a per-tenant circuit", async () => {
  const repository = new FakeRepository();
  let calls = 0;
  repository.createRun = async () => {
    calls += 1;
    throw new Error("database unavailable");
  };
  const dependencies = {
    repository,
    env: enabledEnv,
    logError: () => {},
  };

  await observeDiscoveryExecutionCreated(search(), dependencies);
  await observeDiscoveryExecutionCreated(search(), dependencies);
  const third = await observeDiscoveryExecutionCreated(search(), dependencies);

  assert.equal(calls, 2);
  assert.equal(third.degraded, "ledger_unavailable");
});

test("dispatch failure terminates the attempt and redacts secrets", async () => {
  const repository = new FakeRepository();
  await observeDiscoveryExecutionDispatch(
    search(),
    {
      route: "test",
      forwarded: false,
      error: "Authorization: Bearer sk-secret-value-123456789",
    },
    { repository, env: enabledEnv },
  );

  assert.equal(repository.transitions.length, 1);
  assert.equal(repository.transitions[0].input.status, "failed");
  assert.match(String(repository.transitions[0].input.error), /REDACTED/);
  assert.doesNotMatch(
    String(repository.transitions[0].input.error),
    /sk-secret-value/,
  );
});
