import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  BlockedExecutionProjectionScopePage,
  BlockedExecutionRunScopePage,
  ExecutionControlRepository,
  ExecutionLeaseScope,
  LeasableExecutionRunMode,
  ListRunnableExecutionScopesPageInput,
  ListBlockedExecutionProjectionScopesPageInput,
  ListBlockedExecutionRunScopesPageInput,
  RunnableExecutionScopePage,
} from "@/lib/execution-control";
import {
  DurableExecutionScopeSupervisor,
  DurableExecutionScopeSupervisorShutdownError,
  discoverRunnableExecutionScopes,
  type DurableExecutionScopeRuntime,
  type DurableExecutionScopeSupervisorScheduler,
} from "@/lib/durable-execution/scope-discovery";
import {
  DurableExecutionWorkerCapacityError,
  DurableExecutionWorkerCapacityLimiter,
  type DurableExecutionWorkerCapacityReport,
} from "@/lib/durable-execution/worker-capacity";
import { DurableExecutionRegistry } from "@/lib/durable-execution/registry";
import {
  DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION,
  DurableExecutionRuntime,
  type DurableExecutionWorker,
  type DurableExecutionHandler,
  type DurableExecutionScheduler,
} from "@/lib/durable-execution/runtime";

function scopeKey(scope: ExecutionLeaseScope): string {
  return `${scope.operation}\u0000${scope.mode}\u0000${scope.tenantKey}`;
}

function compareScope(
  left: ExecutionLeaseScope,
  right: ExecutionLeaseScope,
): number {
  return scopeKey(left).localeCompare(scopeKey(right));
}

function registeredHandler(operation: string): DurableExecutionHandler {
  return {
    contractVersion: DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION,
    operation,
    version: 1,
    decode: () => ({}),
    execute: async () => ({ status: "completed" }),
    classifyError: () => ({
      code: "test_failure",
      retryable: false,
      message: "test failure",
    }),
    projectTerminal: () => {},
  };
}

function registry(...operations: string[]): DurableExecutionRegistry {
  const result = new DurableExecutionRegistry();
  for (const operation of operations) {
    result.register(registeredHandler(operation));
  }
  return result;
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

class ScopePageRepository {
  scopes: ExecutionLeaseScope[] = [];
  blockedScopes: ExecutionLeaseScope[] = [];
  blockedRunScopes: ExecutionLeaseScope[] = [];
  calls: ListRunnableExecutionScopesPageInput[] = [];
  blockedRunCalls: ListBlockedExecutionRunScopesPageInput[] = [];
  failNext = 0;
  blockNext?: Deferred<void>;

  asExecutionRepository(): ExecutionControlRepository {
    return this as unknown as ExecutionControlRepository;
  }

  async listRunnableScopesPage(
    input: ListRunnableExecutionScopesPageInput,
  ): Promise<RunnableExecutionScopePage> {
    this.calls.push({
      ...input,
      operations: [...input.operations],
      modes: [...input.modes],
      ...(input.after ? { after: { ...input.after } } : {}),
    });
    if (this.failNext > 0) {
      this.failNext -= 1;
      throw Object.assign(new Error("postgres password must stay private"), {
        code: "database_temporarily_unavailable",
      });
    }
    if (this.blockNext) {
      const blocker = this.blockNext;
      this.blockNext = undefined;
      await blocker.promise;
    }

    const operationSet = new Set(input.operations);
    const modeSet = new Set(input.modes);
    const candidates = this.scopes
      .filter(
        (scope) => operationSet.has(scope.operation) && modeSet.has(scope.mode),
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

  async listBlockedProjectionScopesPage(
    input: ListBlockedExecutionProjectionScopesPageInput,
  ): Promise<BlockedExecutionProjectionScopePage> {
    const operationSet = new Set(input.operations);
    const modeSet = new Set(input.modes);
    const candidates = this.blockedScopes
      .filter(
        (scope) => operationSet.has(scope.operation) && modeSet.has(scope.mode),
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

  async listBlockedRunScopesPage(
    input: ListBlockedExecutionRunScopesPageInput,
  ): Promise<BlockedExecutionRunScopePage> {
    this.blockedRunCalls.push({
      ...input,
      operations: [...input.operations],
      modes: [...input.modes],
      ...(input.after ? { after: { ...input.after } } : {}),
    });
    const operationSet = new Set(input.operations);
    const modeSet = new Set(input.modes);
    const candidates = this.blockedRunScopes
      .filter(
        (scope) => operationSet.has(scope.operation) && modeSet.has(scope.mode),
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
}

class FakeScheduler implements DurableExecutionScopeSupervisorScheduler {
  callbacks: Array<() => void> = [];
  cleared = 0;

  setInterval(callback: () => void): unknown {
    this.callbacks.push(callback);
    return callback;
  }

  clearInterval(): void {
    this.cleared += 1;
  }

  tick(): void {
    for (const callback of this.callbacks) callback();
  }
}

class ThrowingClearScheduler extends FakeScheduler {
  override clearInterval(): void {
    super.clearInterval();
    throw new Error("scheduler clear exploded");
  }
}

class PassiveWorkerScheduler implements DurableExecutionScheduler {
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
    // Fairness tests exercise lifecycle only; no fake Ledger claim is run.
    this.microtasks.push(callback);
  }
}

class FakeRuntime implements DurableExecutionScopeRuntime {
  readonly workers = new Map<
    string,
    { scope: ExecutionLeaseScope; workerId: string; external: boolean }
  >();
  readonly starts: ExecutionLeaseScope[] = [];
  readonly wakes: ExecutionLeaseScope[] = [];
  readonly stops: Array<{ scope: ExecutionLeaseScope; workerId: string }> = [];
  readonly demandCancellations: Array<{
    scope: ExecutionLeaseScope;
    demandOwnerId?: string;
  }> = [];
  private sequence = 0;

  constructor(readonly maxWorkers = 32) {}

  startWorker(
    scope: ExecutionLeaseScope,
    _demandOwnerId?: string,
  ): DurableExecutionWorker {
    const key = scopeKey(scope);
    if (this.workers.has(key)) throw new Error(`duplicate worker ${key}`);
    if (this.workers.size >= this.maxWorkers) {
      throw new DurableExecutionWorkerCapacityError(this.capacity());
    }
    const worker = {
      scope: { ...scope },
      workerId: `fake-worker-${++this.sequence}`,
      external: false,
    };
    this.workers.set(key, worker);
    this.starts.push({ ...scope });
    return worker as unknown as DurableExecutionWorker;
  }

  seedExternal(scope: ExecutionLeaseScope): string {
    const key = scopeKey(scope);
    const workerId = `external-worker-${++this.sequence}`;
    this.workers.set(key, {
      scope: { ...scope },
      workerId,
      external: true,
    });
    return workerId;
  }

  getWorker(scope: ExecutionLeaseScope): DurableExecutionWorker | undefined {
    return this.workers.get(scopeKey(scope)) as unknown as
      DurableExecutionWorker | undefined;
  }

  wake(scope: ExecutionLeaseScope): boolean {
    if (!this.workers.has(scopeKey(scope))) return false;
    this.wakes.push({ ...scope });
    return true;
  }

  async stopWorker(
    scope: ExecutionLeaseScope,
    expectedWorkerId: string,
  ): Promise<boolean> {
    const key = scopeKey(scope);
    const worker = this.workers.get(key);
    if (!worker || worker.workerId !== expectedWorkerId) return false;
    this.workers.delete(key);
    this.stops.push({ scope: { ...scope }, workerId: expectedWorkerId });
    return true;
  }

  async retireWorker(
    scope: ExecutionLeaseScope,
    expectedWorkerId: string,
  ): Promise<boolean> {
    return this.stopWorker(scope, expectedWorkerId);
  }

  async yieldWorker(): Promise<boolean> {
    return false;
  }

  cancelWorkerDemand(
    scope: ExecutionLeaseScope,
    demandOwnerId?: string,
  ): boolean {
    this.demandCancellations.push({
      scope: { ...scope },
      ...(demandOwnerId ? { demandOwnerId } : {}),
    });
    return true;
  }

  capacity(): DurableExecutionWorkerCapacityReport {
    return {
      maxWorkers: this.maxWorkers,
      activeWorkers: this.workers.size,
      stoppingWorkers: 0,
      occupiedWorkers: this.workers.size,
      availableSlots: Math.max(0, this.maxWorkers - this.workers.size),
      pendingDemands: 0,
      fairnessYieldInProgress: false,
    };
  }

  readiness(): [] {
    return [];
  }
}

function supervisor(input: {
  repository: ScopePageRepository;
  operations: string[];
  modes?: LeasableExecutionRunMode[];
  runtime?: FakeRuntime;
  scheduler?: FakeScheduler;
  pageSize?: number;
  allowScope?: ConstructorParameters<
    typeof DurableExecutionScopeSupervisor
  >[0]["allowScope"];
  isValidTenantKey?: ConstructorParameters<
    typeof DurableExecutionScopeSupervisor
  >[0]["isValidTenantKey"];
  onError?: ConstructorParameters<
    typeof DurableExecutionScopeSupervisor
  >[0]["onError"];
  maxWorkers?: number;
}) {
  const runtime = input.runtime ?? new FakeRuntime(input.maxWorkers);
  const scheduler = input.scheduler ?? new FakeScheduler();
  return {
    runtime,
    scheduler,
    value: new DurableExecutionScopeSupervisor({
      repository: input.repository.asExecutionRepository(),
      registry: registry(...input.operations),
      runtime,
      scheduler,
      modes: input.modes ?? ["canary"],
      pageSize: input.pageSize,
      intervalMs: 1_000,
      allowScope: input.allowScope ?? (() => true),
      isValidTenantKey: input.isValidTenantKey,
      onError: input.onError,
    }),
  };
}

test("scope discovery consumes every keyset page and derives operations from the registry", async () => {
  const repository = new ScopePageRepository();
  repository.scopes = [
    { operation: "alpha.sync", mode: "active", tenantKey: "tenant-a" },
    { operation: "alpha.sync", mode: "canary", tenantKey: "tenant-b" },
    { operation: "alpha.sync", mode: "canary", tenantKey: "tenant-c" },
    { operation: "beta.sync", mode: "canary", tenantKey: "tenant-d" },
    { operation: "beta.sync", mode: "active", tenantKey: "tenant-e" },
    // Registered operation and mode filters must exclude these rows.
    { operation: "other.sync", mode: "canary", tenantKey: "tenant-f" },
  ];

  const result = await discoverRunnableExecutionScopes(
    repository.asExecutionRepository(),
    {
      registry: registry("beta.sync", "alpha.sync"),
      modes: ["canary", "active"],
      pageSize: 2,
      allowScope: () => true,
    },
  );

  assert.equal(result.pages, 3);
  assert.equal(result.scopesSeen, 5);
  assert.equal(result.scopesAllowed, 5);
  assert.deepEqual(
    result.scopes.map(scopeKey),
    repository.scopes
      .filter((scope) => scope.operation !== "other.sync")
      .sort(compareScope)
      .map(scopeKey),
  );
  assert.equal(repository.calls.length, 3);
  for (const call of repository.calls) {
    assert.deepEqual(call.operations, ["alpha.sync", "beta.sync"]);
    assert.deepEqual(call.modes, ["active", "canary"]);
    assert.equal(call.limit, 2);
  }
  assert.deepEqual(repository.calls[1]?.after, result.scopes[1]);
  assert.deepEqual(repository.calls[2]?.after, result.scopes[3]);
});

test("a fresh supervisor exposes blocked-only scopes without starting or waking workers", async () => {
  const repository = new ScopePageRepository();
  repository.blockedScopes = [
    { operation: "alpha.sync", mode: "canary", tenantKey: "tenant-a" },
    { operation: "alpha.sync", mode: "canary", tenantKey: "tenant-b" },
  ];
  const { value, runtime } = supervisor({
    repository,
    operations: ["alpha.sync"],
    pageSize: 1,
  });

  await value.start();

  const readiness = value.readiness();
  assert.equal(readiness.state, "degraded");
  assert.equal(readiness.blockedProjectionVisibility, "available");
  assert.equal(readiness.blockedProjectionScopeCount, 2);
  assert.equal(readiness.blockedProjectionScopesTruncated, false);
  assert.deepEqual(readiness.blockedProjectionScopes, repository.blockedScopes);
  assert.equal(readiness.lastScan?.blockedProjectionPages, 2);
  assert.equal(readiness.lastScan?.blockedProjectionScopes, 2);
  assert.deepEqual(runtime.starts, []);
  assert.deepEqual(runtime.wakes, []);

  await value.shutdown();
});

test("restart discovers every blocked-run page as incident evidence without making it runnable", async () => {
  const repository = new ScopePageRepository();
  repository.blockedRunScopes = [
    { operation: "alpha.sync", mode: "canary", tenantKey: "tenant-a" },
    { operation: "alpha.sync", mode: "canary", tenantKey: "tenant-b" },
    { operation: "alpha.sync", mode: "canary", tenantKey: "tenant-c" },
  ];
  const { value, runtime } = supervisor({
    repository,
    operations: ["alpha.sync"],
    pageSize: 1,
  });

  await value.start();

  const readiness = value.readiness();
  assert.equal(readiness.state, "degraded");
  assert.equal(readiness.blockedRunVisibility, "available");
  assert.equal(readiness.blockedRunScopeCount, 3);
  assert.equal(readiness.blockedRunScopesTruncated, false);
  assert.deepEqual(readiness.blockedRunScopes, repository.blockedRunScopes);
  assert.equal(readiness.lastScan?.blockedRunPages, 3);
  assert.equal(readiness.lastScan?.blockedRunScopes, 3);
  assert.equal(repository.blockedRunCalls.length, 3);
  assert.deepEqual(runtime.starts, []);
  assert.deepEqual(runtime.wakes, []);

  await value.shutdown();
});

test("supervisor starts and periodically discovers exact scopes without a tenant-operation cross-product", async () => {
  const repository = new ScopePageRepository();
  repository.scopes = [
    { operation: "alpha.sync", mode: "canary", tenantKey: "tenant-a" },
  ];
  const { value, runtime, scheduler } = supervisor({
    repository,
    operations: ["alpha.sync", "beta.sync"],
    modes: ["canary", "active"],
  });

  await value.start();
  assert.deepEqual(runtime.starts, [repository.scopes[0]]);
  repository.scopes.push({
    operation: "beta.sync",
    mode: "active",
    tenantKey: "tenant-b",
  });

  scheduler.tick();
  await value.scan();
  assert.deepEqual(runtime.starts.map(scopeKey).sort(), [
    "alpha.sync\u0000canary\u0000tenant-a",
    "beta.sync\u0000active\u0000tenant-b",
  ]);
  assert.equal(
    runtime.workers.has("alpha.sync\u0000canary\u0000tenant-b"),
    false,
  );
  assert.equal(
    runtime.workers.has("beta.sync\u0000active\u0000tenant-a"),
    false,
  );
  assert.deepEqual(runtime.wakes, [repository.scopes[0]]);
  assert.equal(value.readiness().state, "ready");
  await value.shutdown();
});

test("capacity exhaustion is a successful but degraded scan with bounded deferred evidence", async () => {
  const repository = new ScopePageRepository();
  repository.scopes = Array.from({ length: 102 }, (_, index) => ({
    operation: "alpha.sync",
    mode: "canary" as const,
    tenantKey: `tenant-${String(index).padStart(3, "0")}`,
  }));
  const { value, runtime } = supervisor({
    repository,
    operations: ["alpha.sync"],
    maxWorkers: 1,
  });

  await value.start();
  const readiness = value.readiness();
  assert.equal(readiness.state, "degraded");
  assert.equal(readiness.counters.scansSucceeded, 1);
  assert.equal(readiness.counters.scansFailed, 0);
  assert.equal(readiness.lastError, undefined);
  assert.equal(readiness.lastScan?.capacityDeferredScopes, 101);
  assert.equal(readiness.counters.capacityDeferredScopes, 101);
  assert.equal(readiness.capacityDeferredScopeCount, 101);
  assert.equal(readiness.capacityDeferredScopes.length, 100);
  assert.equal(readiness.capacityDeferredScopesTruncated, true);
  assert.equal(readiness.capacity.maxWorkers, 1);
  assert.equal(readiness.capacity.activeWorkers, 1);
  assert.equal(readiness.managedWorkerCount, 1);
  assert.equal(runtime.starts.length, 1);

  await value.shutdown();
});

test("every runnable pilot scope starts without starvation when scope count is within capacity", async () => {
  const repository = new ScopePageRepository();
  repository.scopes = [
    { operation: "alpha.sync", mode: "canary", tenantKey: "tenant-c" },
    { operation: "alpha.sync", mode: "canary", tenantKey: "tenant-a" },
    { operation: "alpha.sync", mode: "canary", tenantKey: "tenant-b" },
  ];
  const { value, runtime } = supervisor({
    repository,
    operations: ["alpha.sync"],
    maxWorkers: 3,
  });

  await value.start();
  assert.deepEqual(
    runtime.starts.map(({ tenantKey }) => tenantKey),
    ["tenant-a", "tenant-b", "tenant-c"],
  );
  assert.equal(value.readiness().capacityDeferredScopeCount, 0);
  assert.equal(value.readiness().state, "ready");
  await value.shutdown();
});

test("FIFO fairness rotates cap-plus-one runnable scopes across full scans", async () => {
  const repository = new ScopePageRepository();
  const scopeA: ExecutionLeaseScope = {
    operation: "alpha.sync",
    mode: "canary",
    tenantKey: "tenant-a",
  };
  const scopeB: ExecutionLeaseScope = {
    ...scopeA,
    tenantKey: "tenant-b",
  };
  repository.scopes = [scopeA, scopeB];
  const limiter = new DurableExecutionWorkerCapacityLimiter(1);
  const workerScheduler = new PassiveWorkerScheduler();
  const registered = registry("alpha.sync");
  const runtime = new DurableExecutionRuntime({
    repository: repository.asExecutionRepository(),
    registry: registered,
    capacityLimiter: limiter,
    scheduler: workerScheduler,
  });
  const value = new DurableExecutionScopeSupervisor({
    repository: repository.asExecutionRepository(),
    registry: registered,
    runtime,
    scheduler: new FakeScheduler(),
    modes: ["canary"],
    intervalMs: 1_000,
    allowScope: () => true,
  });

  await value.start();
  assert.equal(runtime.readiness()[0]?.scope.tenantKey, "tenant-a");
  assert.equal(limiter.report().pendingDemands, 1);

  await value.scan();
  assert.equal(runtime.readiness()[0]?.scope.tenantKey, "tenant-b");
  assert.equal(value.readiness().lastScan?.workersFairnessYielded, 1);
  assert.deepEqual(
    value.readiness().capacityDeferredScopes.map((scope) => scope.tenantKey),
    ["tenant-a"],
  );
  assert.equal(limiter.report().pendingDemands, 1);
  // The yielded A worker was not restarted during the scan that yielded it.
  assert.equal(workerScheduler.intervals.length, 2);

  await value.scan();
  assert.equal(runtime.readiness()[0]?.scope.tenantKey, "tenant-a");
  assert.equal(value.readiness().counters.workersFairnessYielded, 2);
  assert.equal(value.readiness().capacityDeferredScopes.length, 1);

  await value.shutdown();
  await runtime.shutdown();
  assert.equal(limiter.report().occupiedWorkers, 0);
  assert.equal(limiter.report().pendingDemands, 0);
});

test("global FIFO lets a second product supervisor obtain a slot held by the first", async () => {
  const repositoryA = new ScopePageRepository();
  const repositoryB = new ScopePageRepository();
  const scopeA: ExecutionLeaseScope = {
    operation: "alpha.sync",
    mode: "canary",
    tenantKey: "tenant-a",
  };
  const scopeB: ExecutionLeaseScope = {
    operation: "beta.sync",
    mode: "canary",
    tenantKey: "tenant-b",
  };
  repositoryA.scopes = [scopeA];
  repositoryB.scopes = [scopeB];
  const limiter = new DurableExecutionWorkerCapacityLimiter(1);
  const registryA = registry("alpha.sync");
  const registryB = registry("beta.sync");
  const runtimeA = new DurableExecutionRuntime({
    repository: repositoryA.asExecutionRepository(),
    registry: registryA,
    capacityLimiter: limiter,
    scheduler: new PassiveWorkerScheduler(),
    workerIdPrefix: "product-a",
  });
  const runtimeB = new DurableExecutionRuntime({
    repository: repositoryB.asExecutionRepository(),
    registry: registryB,
    capacityLimiter: limiter,
    scheduler: new PassiveWorkerScheduler(),
    workerIdPrefix: "product-b",
  });
  const supervisorA = new DurableExecutionScopeSupervisor({
    repository: repositoryA.asExecutionRepository(),
    registry: registryA,
    runtime: runtimeA,
    scheduler: new FakeScheduler(),
    modes: ["canary"],
    intervalMs: 1_000,
    allowScope: () => true,
  });
  const supervisorB = new DurableExecutionScopeSupervisor({
    repository: repositoryB.asExecutionRepository(),
    registry: registryB,
    runtime: runtimeB,
    scheduler: new FakeScheduler(),
    modes: ["canary"],
    intervalMs: 1_000,
    allowScope: () => true,
  });

  await supervisorA.start();
  await supervisorB.start();
  assert.equal(runtimeA.readiness().length, 1);
  assert.equal(runtimeB.readiness().length, 0);
  assert.equal(limiter.report().pendingDemands, 1);

  await supervisorA.scan();
  assert.equal(runtimeA.readiness().length, 0);
  assert.equal(limiter.report().availableSlots, 1);
  await supervisorB.scan();
  assert.equal(runtimeB.readiness()[0]?.scope.operation, "beta.sync");
  assert.equal(limiter.report().occupiedWorkers, 1);
  assert.equal(limiter.report().pendingDemands, 1);

  await Promise.all([supervisorA.shutdown(), supervisorB.shutdown()]);
  await Promise.all([runtimeA.shutdown(), runtimeB.shutdown()]);
  assert.equal(limiter.report().occupiedWorkers, 0);
  assert.equal(limiter.report().pendingDemands, 0);
});

test("failed discovery cancels a zombie FIFO head so the next live supervisor progresses", async () => {
  const limiter = new DurableExecutionWorkerCapacityLimiter(1);
  const product = (operation: string, tenantKey: string) => {
    const repository = new ScopePageRepository();
    const scope: ExecutionLeaseScope = {
      operation,
      mode: "canary",
      tenantKey,
    };
    repository.scopes = [scope];
    const registered = registry(operation);
    const runtime = new DurableExecutionRuntime({
      repository: repository.asExecutionRepository(),
      registry: registered,
      capacityLimiter: limiter,
      scheduler: new PassiveWorkerScheduler(),
      workerIdPrefix: operation,
    });
    const supervisor = new DurableExecutionScopeSupervisor({
      repository: repository.asExecutionRepository(),
      registry: registered,
      runtime,
      scheduler: new FakeScheduler(),
      modes: ["canary"],
      intervalMs: 1_000,
      allowScope: () => true,
    });
    return { repository, runtime, scope, supervisor };
  };
  const holder = product("alpha.sync", "tenant-a");
  const zombieHead = product("beta.sync", "tenant-b");
  const liveNext = product("gamma.sync", "tenant-c");

  await holder.supervisor.start();
  await zombieHead.supervisor.start();
  await liveNext.supervisor.start();
  assert.equal(holder.runtime.readiness().length, 1);
  assert.equal(zombieHead.runtime.readiness().length, 0);
  assert.equal(liveNext.runtime.readiness().length, 0);
  assert.equal(limiter.report().pendingDemands, 2);

  zombieHead.repository.failNext = 1;
  await assert.rejects(
    zombieHead.supervisor.scan(),
    /postgres password must stay private/,
  );
  assert.equal(limiter.report().pendingDemands, 1);
  assert.equal(zombieHead.supervisor.readiness().capacityDeferredScopeCount, 0);

  // C remains the oldest live demand. A yields behind it, then C—not A—gets
  // the released slot on its next authoritative scan.
  await holder.supervisor.scan();
  assert.equal(holder.runtime.readiness().length, 0);
  assert.equal(limiter.report().pendingDemands, 2);
  await liveNext.supervisor.scan();
  assert.equal(liveNext.runtime.readiness()[0]?.scope.operation, "gamma.sync");
  assert.equal(holder.runtime.readiness().length, 0);
  assert.equal(limiter.report().pendingDemands, 1);

  await Promise.all([
    holder.supervisor.shutdown(),
    zombieHead.supervisor.shutdown(),
    liveNext.supervisor.shutdown(),
  ]);
  await Promise.all([
    holder.runtime.shutdown(),
    zombieHead.runtime.shutdown(),
    liveNext.runtime.shutdown(),
  ]);
  assert.equal(limiter.report().occupiedWorkers, 0);
  assert.equal(limiter.report().pendingDemands, 0);
});

test("a managed worker retires after two absent full scans before its slot starts deferred work", async () => {
  const repository = new ScopePageRepository();
  const oldScope: ExecutionLeaseScope = {
    operation: "alpha.sync",
    mode: "canary",
    tenantKey: "tenant-old",
  };
  const nextScope: ExecutionLeaseScope = {
    operation: "alpha.sync",
    mode: "canary",
    tenantKey: "tenant-next",
  };
  repository.scopes = [oldScope];
  const { value, runtime } = supervisor({
    repository,
    operations: ["alpha.sync"],
    maxWorkers: 1,
  });
  await value.start();

  repository.scopes = [nextScope];
  await value.scan();
  assert.equal(runtime.stops.length, 0);
  assert.equal(value.readiness().capacityDeferredScopeCount, 1);
  assert.deepEqual(runtime.starts, [oldScope]);

  await value.scan();
  assert.equal(runtime.stops.length, 1);
  assert.deepEqual(runtime.stops[0]?.scope, oldScope);
  assert.deepEqual(runtime.starts, [oldScope, nextScope]);
  assert.equal(value.readiness().lastScan?.workersRetired, 1);
  assert.equal(value.readiness().lastScan?.capacityDeferredScopes, 0);
  assert.equal(value.readiness().capacityDeferredScopeCount, 0);
  assert.equal(value.readiness().state, "ready");
  await value.shutdown();
});

test("a failed full scan breaks absence evidence and requires two new successful scans", async () => {
  const repository = new ScopePageRepository();
  const managedScope: ExecutionLeaseScope = {
    operation: "alpha.sync",
    mode: "canary",
    tenantKey: "tenant-managed",
  };
  repository.scopes = [managedScope];
  const { value, runtime } = supervisor({
    repository,
    operations: ["alpha.sync"],
  });
  await value.start();

  repository.scopes = [];
  await value.scan();
  repository.failNext = 1;
  await assert.rejects(value.scan());
  await value.scan();
  assert.equal(runtime.stops.length, 0);
  await value.scan();
  assert.equal(runtime.stops.length, 1);
  await value.shutdown();
});

test("a runnable reappearance resets managed-worker absence evidence", async () => {
  const repository = new ScopePageRepository();
  const managedScope: ExecutionLeaseScope = {
    operation: "alpha.sync",
    mode: "canary",
    tenantKey: "tenant-managed",
  };
  repository.scopes = [managedScope];
  const { value, runtime } = supervisor({
    repository,
    operations: ["alpha.sync"],
  });
  await value.start();

  repository.scopes = [];
  await value.scan();
  repository.scopes = [managedScope];
  await value.scan();
  repository.scopes = [];
  await value.scan();
  assert.equal(runtime.stops.length, 0);
  await value.scan();
  assert.equal(runtime.stops.length, 1);
  await value.shutdown();
});

test("external workers are woken but never adopted, retired or stopped by supervisor shutdown", async () => {
  const repository = new ScopePageRepository();
  const externalScope: ExecutionLeaseScope = {
    operation: "alpha.sync",
    mode: "canary",
    tenantKey: "tenant-external",
  };
  repository.scopes = [externalScope];
  const runtime = new FakeRuntime();
  const externalWorkerId = runtime.seedExternal(externalScope);
  const { value } = supervisor({
    repository,
    operations: ["alpha.sync"],
    runtime,
  });

  await value.start();
  assert.equal(value.readiness().managedWorkerCount, 0);
  assert.deepEqual(runtime.wakes, [externalScope]);
  repository.scopes = [];
  await value.scan();
  await value.scan();
  await value.shutdown();
  assert.equal(runtime.stops.length, 0);
  assert.equal(
    runtime.workers.get(scopeKey(externalScope))?.workerId,
    externalWorkerId,
  );
});

test("owner-fenced retirement cannot stop an external replacement", async () => {
  const repository = new ScopePageRepository();
  const managedScope: ExecutionLeaseScope = {
    operation: "alpha.sync",
    mode: "canary",
    tenantKey: "tenant-replaced",
  };
  repository.scopes = [managedScope];
  const { value, runtime } = supervisor({
    repository,
    operations: ["alpha.sync"],
  });
  await value.start();
  const originalWorkerId = runtime.workers.get(
    scopeKey(managedScope),
  )?.workerId;
  const replacementWorkerId = runtime.seedExternal(managedScope);
  assert.notEqual(replacementWorkerId, originalWorkerId);

  repository.scopes = [];
  await value.scan();
  await value.scan();
  assert.equal(runtime.stops.length, 0);
  assert.equal(
    runtime.workers.get(scopeKey(managedScope))?.workerId,
    replacementWorkerId,
  );
  assert.equal(value.readiness().managedWorkerCount, 0);
  assert.equal(value.readiness().counters.workerRetireOwnershipLost, 1);
  await value.shutdown();
  assert.equal(
    runtime.workers.get(scopeKey(managedScope))?.workerId,
    replacementWorkerId,
  );
});

test("wakeOrScan coalesces authoritative discovery and never starts after shutdown", async () => {
  const repository = new ScopePageRepository();
  const discoveredScope: ExecutionLeaseScope = {
    operation: "alpha.sync",
    mode: "canary",
    tenantKey: "tenant-hint",
  };
  const { value, runtime } = supervisor({
    repository,
    operations: ["alpha.sync"],
  });
  await value.start();
  repository.scopes = [discoveredScope];

  assert.equal(value.wakeOrScan(discoveredScope), false);
  await value.scan();
  assert.deepEqual(runtime.starts, [discoveredScope]);
  assert.equal(value.wakeOrScan(discoveredScope), true);
  assert.deepEqual(runtime.wakes, [discoveredScope]);
  await value.shutdown();
  assert.equal(value.wakeOrScan(discoveredScope), false);
  assert.deepEqual(runtime.starts, [discoveredScope]);
});

test("transient scan failure is sanitized, retained in readiness and retried", async () => {
  const repository = new ScopePageRepository();
  repository.scopes = [
    { operation: "alpha.sync", mode: "canary", tenantKey: "tenant-a" },
  ];
  repository.failNext = 1;
  const errors: Array<{ code: string; at: string }> = [];
  const { value, runtime, scheduler } = supervisor({
    repository,
    operations: ["alpha.sync"],
    onError: (error) => errors.push(error),
  });

  await value.start();
  let readiness = value.readiness();
  assert.equal(readiness.state, "degraded");
  assert.equal(readiness.lastError?.code, "database_temporarily_unavailable");
  assert.doesNotMatch(JSON.stringify(readiness), /postgres password/i);
  assert.equal(runtime.starts.length, 0);
  assert.equal(errors.length, 1);

  scheduler.tick();
  await value.scan();
  readiness = value.readiness();
  assert.equal(readiness.state, "ready");
  assert.equal(readiness.lastError, undefined);
  assert.equal(readiness.counters.scansFailed, 1);
  assert.equal(readiness.counters.scansSucceeded, 1);
  assert.equal(runtime.starts.length, 1);
  await value.shutdown();
});

test("tenant validation and capability policy fail closed per exact scope", async () => {
  const repository = new ScopePageRepository();
  repository.scopes = [
    { operation: "alpha.sync", mode: "canary", tenantKey: "../escape" },
    { operation: "alpha.sync", mode: "canary", tenantKey: "tenant-allowed" },
    { operation: "alpha.sync", mode: "canary", tenantKey: "tenant-denied" },
    { operation: "alpha.sync", mode: "canary", tenantKey: "tenant-error" },
    { operation: "alpha.sync", mode: "canary", tenantKey: "tenant-invalid" },
  ];
  const { value, runtime } = supervisor({
    repository,
    operations: ["alpha.sync"],
    isValidTenantKey: (tenant) => {
      if (tenant === "tenant-invalid") throw new Error("validation secret");
      return true;
    },
    allowScope: ({ tenantKey }) => {
      if (tenantKey === "tenant-denied") {
        return { allowed: false, code: "rollout_disabled" };
      }
      if (tenantKey === "tenant-error") throw new Error("policy secret");
      return true;
    },
  });

  await value.start();
  const readiness = value.readiness();
  assert.deepEqual(runtime.starts, [
    { operation: "alpha.sync", mode: "canary", tenantKey: "tenant-allowed" },
  ]);
  assert.equal(readiness.lastScan?.scopesSeen, 5);
  assert.equal(readiness.lastScan?.scopesAllowed, 1);
  assert.equal(readiness.lastScan?.scopesRejected, 4);
  assert.deepEqual(readiness.lastScan?.rejectionCodes, {
    invalid_tenant_key: 2,
    rollout_disabled: 1,
    scope_policy_error: 1,
  });
  assert.equal(
    readiness.state,
    "degraded",
    "a successful scan must not report ready while runnable scopes are blocked",
  );
  assert.doesNotMatch(JSON.stringify(readiness), /secret/);
  await value.shutdown();
});

test("concurrent scans coalesce into one repository traversal", async () => {
  const repository = new ScopePageRepository();
  const { value } = supervisor({
    repository,
    operations: ["alpha.sync"],
  });
  await value.start();
  const callsAfterStartup = repository.calls.length;
  const blocker = deferred<void>();
  repository.blockNext = blocker;

  const first = value.scan();
  const second = value.scan();
  assert.strictEqual(first, second);
  assert.equal(value.readiness().scanInFlight, true);
  blocker.resolve(undefined);
  await first;
  assert.equal(repository.calls.length, callsAfterStartup + 1);
  assert.equal(value.readiness().scanInFlight, false);
  await value.shutdown();
});

test("shutdown clears the timer, suppresses post-stop worker starts and drains the scan", async () => {
  const repository = new ScopePageRepository();
  repository.scopes = [
    { operation: "alpha.sync", mode: "canary", tenantKey: "tenant-a" },
  ];
  const { value, runtime, scheduler } = supervisor({
    repository,
    operations: ["alpha.sync"],
  });
  await value.start();
  const blocker = deferred<void>();
  repository.blockNext = blocker;
  repository.scopes.push({
    operation: "alpha.sync",
    mode: "canary",
    tenantKey: "tenant-b",
  });

  const scan = value.scan();
  const shutdown = value.shutdown();
  assert.equal(value.readiness().state, "stopping");
  blocker.resolve(undefined);
  await Promise.all([scan, shutdown]);

  assert.deepEqual(
    runtime.starts.map(({ tenantKey }) => tenantKey),
    ["tenant-a"],
  );
  assert.equal(runtime.stops.length, 1);
  assert.equal(runtime.workers.size, 0);
  assert.equal(scheduler.cleared, 1);
  assert.equal(value.readiness().state, "stopped");
  await assert.rejects(value.scan(), /not accepting scans/);
  await assert.rejects(value.start(), /cannot start after shutdown/);
});

test("startup rejects when concurrent shutdown wins the discovery race", async () => {
  const repository = new ScopePageRepository();
  repository.scopes = [
    { operation: "alpha.sync", mode: "canary", tenantKey: "tenant-a" },
  ];
  const blocker = deferred<void>();
  repository.blockNext = blocker;
  const { value, runtime } = supervisor({
    repository,
    operations: ["alpha.sync"],
  });

  const starting = value.start();
  const alsoStarting = value.start();
  assert.strictEqual(alsoStarting, starting);
  const shutdown = value.shutdown();
  assert.equal(value.readiness().state, "stopping");
  blocker.resolve(undefined);

  const starts = await Promise.allSettled([starting, alsoStarting]);
  assert.equal(starts[0]?.status, "rejected");
  assert.equal(starts[1]?.status, "rejected");
  if (starts[0]?.status === "rejected" && starts[1]?.status === "rejected") {
    assert.ok(
      starts[0].reason instanceof DurableExecutionScopeSupervisorShutdownError,
    );
    assert.strictEqual(starts[1].reason, starts[0].reason);
  }
  await shutdown;
  assert.equal(value.readiness().state, "stopped");
  assert.equal(runtime.workers.size, 0);
});

test("concurrent successful startup callers share one promise and result", async () => {
  const repository = new ScopePageRepository();
  repository.scopes = [
    { operation: "alpha.sync", mode: "canary", tenantKey: "tenant-a" },
  ];
  const blocker = deferred<void>();
  repository.blockNext = blocker;
  const { value } = supervisor({
    repository,
    operations: ["alpha.sync"],
  });

  const first = value.start();
  const second = value.start();
  assert.strictEqual(second, first);
  blocker.resolve(undefined);
  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.strictEqual(firstResult, value);
  assert.strictEqual(secondResult, value);
  assert.equal(repository.calls.length, 1);
  await value.shutdown();
});

test("shutdown finishes demand cancellation and worker stop when clearInterval throws", async () => {
  const repository = new ScopePageRepository();
  const scopeA: ExecutionLeaseScope = {
    operation: "alpha.sync",
    mode: "canary",
    tenantKey: "tenant-a",
  };
  const scopeB: ExecutionLeaseScope = {
    ...scopeA,
    tenantKey: "tenant-b",
  };
  repository.scopes = [scopeA, scopeB];
  const scheduler = new ThrowingClearScheduler();
  const runtime = new FakeRuntime(1);
  const { value } = supervisor({
    repository,
    operations: ["alpha.sync"],
    runtime,
    scheduler,
  });
  await value.start();
  assert.equal(value.readiness().capacityDeferredScopeCount, 1);
  const startsBeforeShutdown = runtime.starts.length;

  await assert.rejects(value.shutdown(), /scheduler clear exploded/);

  assert.equal(scheduler.cleared, 1);
  assert.equal(runtime.stops.length, 1);
  assert.equal(runtime.workers.size, 0);
  assert.ok(
    runtime.demandCancellations.some(
      ({ scope }) => scopeKey(scope) === scopeKey(scopeB),
    ),
  );
  assert.equal(value.readiness().state, "stopped");
  assert.equal(value.readiness().capacityDeferredScopeCount, 0);
  scheduler.tick();
  await Promise.resolve();
  assert.equal(runtime.starts.length, startsBeforeShutdown);

  // Cleanup completed despite the scheduler error: repeated shutdown is a
  // stable no-op and restart remains permanently forbidden.
  await value.shutdown();
  await assert.rejects(
    value.start(),
    DurableExecutionScopeSupervisorShutdownError,
  );
});

test("supervisor rejects repositories without exact-scope discovery", () => {
  assert.throws(
    () =>
      new DurableExecutionScopeSupervisor({
        repository: {} as ExecutionControlRepository,
        registry: registry("alpha.sync"),
        runtime: new FakeRuntime(),
        modes: ["canary"],
        allowScope: () => true,
      }),
    /requires listRunnableScopesPage capability/,
  );
});
