import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import type {
  ClaimNextExecutionRunInput,
  ExecutionControlRepository,
  ExecutionLeaseScope,
  ListRunnableExecutionScopesPageInput,
  RunnableExecutionScopePage,
} from "@/lib/execution-control";
import type { DurableExecutionScheduler } from "@/lib/durable-execution/runtime";
import type { DurableExecutionScopeSupervisorScheduler } from "@/lib/durable-execution/scope-discovery";
import { DurableExecutionWorkerCapacityLimiter } from "@/lib/durable-execution/worker-capacity";

const workspace = fs.mkdtempSync(
  path.join(os.tmpdir(), "sancho-discovery-scope-supervisor-"),
);
process.env.MC_WORKSPACE = workspace;
process.env.MC_TASKS_BACKEND = "json";

type WorkerModule = typeof import("../discovery-durable-worker");
let worker: WorkerModule;

function scopeKey(scope: ExecutionLeaseScope): string {
  return `${scope.operation}\u0000${scope.mode}\u0000${scope.tenantKey}`;
}

function compareScope(
  left: ExecutionLeaseScope,
  right: ExecutionLeaseScope,
): number {
  if (left.operation !== right.operation) {
    return left.operation < right.operation ? -1 : 1;
  }
  if (left.mode !== right.mode) return left.mode < right.mode ? -1 : 1;
  if (left.tenantKey === right.tenantKey) return 0;
  return left.tenantKey < right.tenantKey ? -1 : 1;
}

class ScopeRepository {
  scopes: ExecutionLeaseScope[] = [];
  pageCalls: ListRunnableExecutionScopesPageInput[] = [];
  claims: ClaimNextExecutionRunInput[] = [];
  private readonly scanGates: Array<{
    entered(): void;
    wait: Promise<void>;
  }> = [];

  asRepository(): ExecutionControlRepository {
    return this as unknown as ExecutionControlRepository;
  }

  async listRunnableScopesPage(
    input: ListRunnableExecutionScopesPageInput,
  ): Promise<RunnableExecutionScopePage> {
    const gate = this.scanGates.shift();
    if (gate) {
      gate.entered();
      await gate.wait;
    }
    this.pageCalls.push({
      ...input,
      operations: [...input.operations],
      modes: [...input.modes],
      ...(input.after ? { after: { ...input.after } } : {}),
    });
    const operations = new Set(input.operations);
    const modes = new Set(input.modes);
    const candidates = this.scopes
      .filter(
        (scope) => operations.has(scope.operation) && modes.has(scope.mode),
      )
      .sort(compareScope)
      .filter((scope) => !input.after || compareScope(scope, input.after) > 0);
    const scopes = candidates.slice(0, input.limit).map((scope) => ({
      ...scope,
    }));
    return {
      scopes,
      ...(candidates.length > input.limit && scopes.length > 0
        ? { nextAfter: { ...scopes[scopes.length - 1] } }
        : {}),
    };
  }

  async claimNextRun(input: ClaimNextExecutionRunInput): Promise<null> {
    this.claims.push({ ...input });
    return null;
  }

  blockNextScan(): DeferredScan {
    let markEntered!: () => void;
    let release!: () => void;
    const entered = new Promise<void>((resolve) => {
      markEntered = resolve;
    });
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.scanGates.push({ entered: markEntered, wait });
    return { entered, release };
  }
}

interface DeferredScan {
  entered: Promise<void>;
  release(): void;
}

class ManualScheduler
  implements DurableExecutionScheduler, DurableExecutionScopeSupervisorScheduler
{
  callbacks: Array<() => void> = [];
  cleared = 0;
  private readonly activeHandles = new Set<{ callback: () => void }>();

  setInterval(callback: () => void): unknown {
    this.callbacks.push(callback);
    const handle = { callback };
    this.activeHandles.add(handle);
    return handle;
  }

  clearInterval(handle: unknown): void {
    if (this.activeHandles.delete(handle as { callback: () => void })) {
      this.cleared += 1;
    }
  }

  queueMicrotask(callback: () => void): void {
    queueMicrotask(callback);
  }

  get activeCount(): number {
    return this.activeHandles.size;
  }

  tick(): void {
    for (const handle of [...this.activeHandles]) handle.callback();
  }
}

const stickyEnvironment = {
  PARTNERSHIPS_DISCOVERY_EXECUTION_V2: "off",
  PARTNERSHIPS_DISCOVERY_V2_SLUGS: "",
  PARTNERSHIPS_DISCOVERY_ARTIFACT_STORE: "local-persistent-single-host",
  PARTNERSHIPS_DISCOVERY_WORKER_POLL_MS: "60000",
  PARTNERSHIPS_DISCOVERY_SCOPE_RESCAN_MS: "1000",
};

async function waitFor(
  predicate: () => boolean,
  message: string | (() => string),
): Promise<void> {
  for (let index = 0; index < 100; index += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail(typeof message === "function" ? message() : message);
}

before(async () => {
  worker = await import("../discovery-durable-worker");
  await worker.stopCanaryDiscoveryWorkers();
});

after(async () => {
  await worker.stopCanaryDiscoveryWorkers();
  fs.rmSync(workspace, { recursive: true, force: true });
});

test("sticky flag-off scopes stay exact and a periodic scan finds a new tenant", async (t) => {
  const repository = new ScopeRepository();
  t.after(() => worker.stopCanaryDiscoveryWorkers(repository.asRepository()));
  const scheduler = new ManualScheduler();
  const errors: string[] = [];
  repository.scopes = [
    {
      tenantKey: "tenant-setup",
      operation: "partnerships.discovery.setup",
      mode: "canary",
    },
  ];

  const started = await worker.startCanaryDiscoveryWorkers({
    repository: repository.asRepository(),
    env: stickyEnvironment,
    scopeScheduler: scheduler,
    capacityLimiter: new DurableExecutionWorkerCapacityLimiter(),
    logError: (message) => errors.push(message),
  });
  assert.deepEqual(started, ["tenant-setup"]);
  await waitFor(
    () =>
      repository.claims.some(
        (claim) =>
          claim.tenantKey === "tenant-setup" &&
          claim.operation === "partnerships.discovery.setup",
      ),
    "setup scope was not started",
  );

  // An injected runtime must not occupy or mutate the process-global bundle.
  await worker.stopCanaryDiscoveryWorkers();
  repository.scopes.push({
    tenantKey: "tenant-search",
    operation: "partnerships.discovery",
    mode: "canary",
  });
  scheduler.tick();
  await waitFor(
    () => repository.pageCalls.length >= 2,
    "periodic callback did not perform another scope scan",
  );
  await waitFor(
    () =>
      repository.claims.some(
        (claim) =>
          claim.tenantKey === "tenant-search" &&
          claim.operation === "partnerships.discovery",
      ),
    () =>
      `periodic scan did not start the newly inserted exact scope: ${JSON.stringify({ claims: repository.claims, pages: repository.pageCalls, errors })}`,
  );

  const claimedScopes = new Set(
    repository.claims.map((claim) =>
      scopeKey({
        tenantKey: claim.tenantKey,
        operation: claim.operation,
        mode: claim.mode,
      }),
    ),
  );
  assert.deepEqual([...claimedScopes].sort(), [
    "partnerships.discovery\u0000canary\u0000tenant-search",
    "partnerships.discovery.setup\u0000canary\u0000tenant-setup",
  ]);
  assert.equal(
    claimedScopes.has("partnerships.discovery\u0000canary\u0000tenant-setup"),
    false,
  );
  assert.equal(
    claimedScopes.has(
      "partnerships.discovery.setup\u0000canary\u0000tenant-search",
    ),
    false,
  );
});

test("missing single-host acknowledgement denies discovered receipts", async (t) => {
  const repository = new ScopeRepository();
  t.after(() => worker.stopCanaryDiscoveryWorkers(repository.asRepository()));
  const scheduler = new ManualScheduler();
  repository.scopes = [
    {
      tenantKey: "tenant-denied",
      operation: "partnerships.discovery",
      mode: "canary",
    },
  ];

  const started = await worker.startCanaryDiscoveryWorkers({
    repository: repository.asRepository(),
    env: {
      ...stickyEnvironment,
      PARTNERSHIPS_DISCOVERY_ARTIFACT_STORE: "",
    },
    scopeScheduler: scheduler,
    capacityLimiter: new DurableExecutionWorkerCapacityLimiter(),
    logError: () => undefined,
  });
  assert.deepEqual(started, []);
  scheduler.tick();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(repository.pageCalls.length >= 2, true);
  assert.deepEqual(repository.claims, []);
});

test("a configured tenant reconciles without prestarting every registered operation", async (t) => {
  const repository = new ScopeRepository();
  t.after(() => worker.stopCanaryDiscoveryWorkers(repository.asRepository()));
  const scheduler = new ManualScheduler();
  const started = await worker.startCanaryDiscoveryWorkers({
    repository: repository.asRepository(),
    env: {
      ...stickyEnvironment,
      PARTNERSHIPS_DISCOVERY_EXECUTION_V2: "canary",
      PARTNERSHIPS_DISCOVERY_V2_SLUGS: "tenant-configured",
    },
    scopeScheduler: scheduler,
    capacityLimiter: new DurableExecutionWorkerCapacityLimiter(),
    logError: () => undefined,
  });

  assert.deepEqual(started, ["tenant-configured"]);
  await waitFor(
    () => repository.pageCalls.length >= 2,
    "configured-tenant reconciliation did not request its follow-up scan",
  );
  assert.deepEqual(repository.claims, []);
});

test("adapter readiness reports only the selected started repository", async () => {
  const repository = new ScopeRepository();
  const scheduler = new ManualScheduler();
  const secret = "yalc-secret-readiness-value";
  const previousSecret = process.env.YALC_API_KEY;
  process.env.YALC_API_KEY = secret;
  try {
    assert.equal(worker.getCanaryDiscoveryRuntimeReadiness(), undefined);
    assert.equal(
      worker.getCanaryDiscoveryRuntimeReadiness(repository.asRepository()),
      undefined,
    );
    await worker.startCanaryDiscoveryWorkers({
      repository: repository.asRepository(),
      env: stickyEnvironment,
      runtimeScheduler: scheduler,
      scopeScheduler: scheduler,
      capacityLimiter: new DurableExecutionWorkerCapacityLimiter(),
      logError: () => undefined,
    });
    const readiness = worker.getCanaryDiscoveryRuntimeReadiness(
      repository.asRepository(),
    );
    assert.equal(readiness?.state, "ready");
    assert.deepEqual(readiness.workers, []);
    assert.doesNotMatch(JSON.stringify(readiness), new RegExp(secret));
    assert.deepEqual(
      worker.getCanaryDiscoveryWorkerReadiness(repository.asRepository()),
      [],
    );
  } finally {
    if (previousSecret === undefined) delete process.env.YALC_API_KEY;
    else process.env.YALC_API_KEY = previousSecret;
    await worker.stopCanaryDiscoveryWorkers(repository.asRepository());
  }
  assert.equal(
    worker.getCanaryDiscoveryRuntimeReadiness(repository.asRepository()),
    undefined,
  );
  assert.equal(scheduler.activeCount, 0);
});

test("Partnerships rejects overrides without a repository before allocating resources", async () => {
  await worker.stopCanaryDiscoveryWorkers();
  const scheduler = new ManualScheduler();
  const capacityLimiter = new DurableExecutionWorkerCapacityLimiter();

  await assert.rejects(
    worker.startCanaryDiscoveryWorkers({
      env: stickyEnvironment,
      runtimeScheduler: scheduler,
      scopeScheduler: scheduler,
      capacityLimiter,
      logError: () => undefined,
    }),
    (error: unknown) =>
      error instanceof worker.DiscoveryDurableWorkerConfigurationError &&
      error.code === "partnerships_discovery_worker_repository_required" &&
      /explicit repository/.test(error.message),
  );

  assert.equal(scheduler.activeCount, 0);
  assert.equal(capacityLimiter.report().occupiedWorkers, 0);
  assert.equal(worker.getCanaryDiscoveryRuntimeReadiness(), undefined);
  await worker.stopCanaryDiscoveryWorkers();
  assert.equal(scheduler.activeCount, 0);
});

test("Partnerships serializes bundle start/start, stop/start and start/stop per repository", async () => {
  const repository = new ScopeRepository();
  repository.scopes = [
    {
      tenantKey: "tenant-lifecycle",
      operation: "partnerships.discovery",
      mode: "canary",
    },
  ];
  const schedulerA = new ManualScheduler();
  const schedulerB = new ManualScheduler();
  const schedulerC = new ManualScheduler();
  const schedulerD = new ManualScheduler();
  const gates: DeferredScan[] = [];
  const dependencies = (scheduler: ManualScheduler) => ({
    repository: repository.asRepository(),
    env: stickyEnvironment,
    runtimeScheduler: scheduler,
    scopeScheduler: scheduler,
    capacityLimiter: new DurableExecutionWorkerCapacityLimiter(),
    logError: () => undefined,
  });

  try {
    assert.equal(
      worker.getCanaryDiscoveryRuntimeReadiness(repository.asRepository()),
      undefined,
    );

    const firstGate = repository.blockNextScan();
    gates.push(firstGate);
    const firstStart = worker.startCanaryDiscoveryWorkers(
      dependencies(schedulerA),
    );
    await firstGate.entered;
    const replacementStart = worker.startCanaryDiscoveryWorkers(
      dependencies(schedulerB),
    );
    await Promise.resolve();
    assert.equal(schedulerA.activeCount, 1);
    assert.equal(schedulerB.activeCount, 0);

    firstGate.release();
    await Promise.all([firstStart, replacementStart]);
    assert.equal(schedulerA.activeCount, 0);
    assert.equal(schedulerB.activeCount, 2);
    assert.equal(
      worker.getCanaryDiscoveryRuntimeReadiness(repository.asRepository())
        ?.workers.length,
      1,
    );

    const stopGate = repository.blockNextScan();
    gates.push(stopGate);
    schedulerB.tick();
    await stopGate.entered;
    const stopping = worker.stopCanaryDiscoveryWorkers(
      repository.asRepository(),
    );
    const startAfterStop = worker.startCanaryDiscoveryWorkers(
      dependencies(schedulerC),
    );
    await Promise.resolve();
    assert.equal(schedulerC.activeCount, 0);

    stopGate.release();
    await stopping;
    await startAfterStop;
    assert.equal(schedulerB.activeCount, 0);
    assert.equal(schedulerC.activeCount, 2);
    assert.equal(
      worker.getCanaryDiscoveryRuntimeReadiness(repository.asRepository())
        ?.workers.length,
      1,
    );

    const startGate = repository.blockNextScan();
    gates.push(startGate);
    const finalStart = worker.startCanaryDiscoveryWorkers(
      dependencies(schedulerD),
    );
    await startGate.entered;
    const finalStop = worker.stopCanaryDiscoveryWorkers(
      repository.asRepository(),
    );
    assert.equal(schedulerC.activeCount, 0);
    assert.equal(schedulerD.activeCount, 1);

    startGate.release();
    await finalStart;
    await finalStop;
    assert.equal(schedulerD.activeCount, 0);
    assert.equal(
      worker.getCanaryDiscoveryRuntimeReadiness(repository.asRepository()),
      undefined,
    );
  } finally {
    for (const gate of gates) gate.release();
    await worker.stopCanaryDiscoveryWorkers(repository.asRepository());
  }
});
