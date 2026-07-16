import { randomUUID } from "node:crypto";
import type {
  BlockedExecutionRunScopePage,
  BlockedExecutionProjectionScopePage,
  ExecutionControlRepository,
  ExecutionLeaseScope,
  LeasableExecutionRunMode,
  ListBlockedExecutionProjectionScopesPageInput,
  ListBlockedExecutionRunScopesPageInput,
  RunnableExecutionScopeCursor,
  RunnableExecutionScopePage,
} from "@/lib/execution-control";
import { DurableExecutionRegistry } from "./registry";
import {
  isDuplicateDurableExecutionWorkerError,
  type DurableExecutionWorker,
  type DurableExecutionWorkerReadiness,
} from "./runtime";
import {
  isDurableExecutionWorkerCapacityError,
  type DurableExecutionWorkerCapacityReport,
} from "./worker-capacity";

const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_RESCAN_INTERVAL_MS = 30_000;
const MAX_REGISTRY_OPERATIONS = 100;
const RETIRE_AFTER_ABSENT_FULL_SCANS = 2;
const MAX_CAPACITY_DEFERRED_SCOPE_EVIDENCE = 100;
const MAX_READINESS_COUNTER = Number.MAX_SAFE_INTEGER;

function boundedCounterAdd(current: number, delta: number): number {
  return Math.min(MAX_READINESS_COUNTER, current + Math.max(0, delta));
}

export interface DurableExecutionScopeRuntime {
  startWorker(
    scope: ExecutionLeaseScope,
    demandOwnerId?: string,
  ): DurableExecutionWorker;
  getWorker(scope: ExecutionLeaseScope): DurableExecutionWorker | undefined;
  /** Returns false only when the exact scope has no process-local worker. */
  wake(scope: ExecutionLeaseScope): boolean;
  /** Owner-fenced: a stale supervisor cannot stop a replacement worker. */
  stopWorker(
    scope: ExecutionLeaseScope,
    expectedWorkerId: string,
  ): Promise<boolean>;
  /** Owner-fenced cooperative drain used for absence, not shutdown. */
  retireWorker(
    scope: ExecutionLeaseScope,
    expectedWorkerId: string,
  ): Promise<boolean>;
  /** Returns true only for the single globally claimed FIFO handoff. */
  yieldWorker(
    scope: ExecutionLeaseScope,
    expectedWorkerId: string,
  ): Promise<boolean>;
  cancelWorkerDemand(
    scope: ExecutionLeaseScope,
    demandOwnerId?: string,
  ): boolean;
  capacity(): DurableExecutionWorkerCapacityReport;
  readiness(): DurableExecutionWorkerReadiness[];
}

export interface DurableExecutionScopeSupervisorScheduler {
  setInterval(callback: () => void, delayMs: number): unknown;
  clearInterval(handle: unknown): void;
}

const defaultScheduler: DurableExecutionScopeSupervisorScheduler = {
  setInterval: (callback, delayMs) => {
    const timer = setInterval(callback, delayMs);
    timer.unref?.();
    return timer;
  },
  clearInterval: (handle) =>
    clearInterval(handle as ReturnType<typeof setInterval>),
};

export interface DurableExecutionScopeAllowance {
  allowed: boolean;
  /** Stable, non-sensitive policy code. It is sanitized before telemetry. */
  code?: string;
}

export type DurableExecutionScopePolicy = (
  scope: Readonly<ExecutionLeaseScope>,
) =>
  | boolean
  | DurableExecutionScopeAllowance
  | Promise<boolean | DurableExecutionScopeAllowance>;

export interface DurableExecutionScopeDiscoveryOptions {
  registry: DurableExecutionRegistry;
  modes: readonly LeasableExecutionRunMode[];
  pageSize?: number;
  /** Product capability/rollout gate. Missing, invalid or throwing decisions deny. */
  allowScope: DurableExecutionScopePolicy;
  /** Optional stricter tenant-shape policy; the generic safe shape still applies. */
  isValidTenantKey?: (
    tenantKey: string,
    scope: Readonly<ExecutionLeaseScope>,
  ) => boolean;
  onProgress?: (progress: DurableExecutionScopeDiscoveryProgress) => void;
}

export interface DurableExecutionScopeDiscoveryProgress {
  pages: number;
  scopesSeen: number;
  scopesAllowed: number;
  scopesRejected: number;
  rejectionCodes: Record<string, number>;
}

export interface DurableExecutionScopeDiscoveryResult extends DurableExecutionScopeDiscoveryProgress {
  scopes: ExecutionLeaseScope[];
}

export interface DurableExecutionScopeSupervisorError {
  code: string;
  at: string;
}

export interface DurableExecutionScopeSupervisorCounters {
  scansStarted: number;
  scansSucceeded: number;
  scansFailed: number;
  pages: number;
  scopesSeen: number;
  scopesAllowed: number;
  scopesRejected: number;
  workersStarted: number;
  workersWoken: number;
  workersRetired: number;
  workersFairnessYielded: number;
  workerRetireOwnershipLost: number;
  capacityDeferredScopes: number;
  blockedProjectionPages: number;
  blockedProjectionScopes: number;
  blockedRunPages: number;
  blockedRunScopes: number;
}

export interface DurableExecutionScopeScanReadiness extends DurableExecutionScopeDiscoveryProgress {
  startedAt: string;
  finishedAt?: string;
  workersStarted: number;
  workersWoken: number;
  workersRetired: number;
  workersFairnessYielded: number;
  workerRetireOwnershipLost: number;
  capacityDeferredScopes: number;
  blockedProjectionPages: number;
  blockedProjectionScopes: number;
  blockedRunPages: number;
  blockedRunScopes: number;
}

export interface DurableExecutionScopeSupervisorReadiness {
  state: "stopped" | "starting" | "ready" | "degraded" | "stopping";
  started: boolean;
  scanInFlight: boolean;
  operations: string[];
  modes: LeasableExecutionRunMode[];
  startedAt?: string;
  lastFullSuccessAt?: string;
  lastError?: DurableExecutionScopeSupervisorError;
  lastScan?: DurableExecutionScopeScanReadiness;
  counters: DurableExecutionScopeSupervisorCounters;
  workers: DurableExecutionWorkerReadiness[];
  capacity: DurableExecutionWorkerCapacityReport;
  managedWorkerCount: number;
  /**
   * Current runnable scopes without a process slot. Evidence is bounded. FIFO
   * fairness cooperatively yields at most one runnable worker per handoff.
   */
  capacityDeferredScopes: ExecutionLeaseScope[];
  capacityDeferredScopeCount: number;
  capacityDeferredScopesTruncated: boolean;
  /** Bounded incident evidence; never passed to runtime start/wake. */
  blockedProjectionScopes: ExecutionLeaseScope[];
  blockedProjectionScopeCount: number;
  blockedProjectionScopesTruncated: boolean;
  blockedProjectionVisibility: "available" | "unavailable";
  blockedRunScopes: ExecutionLeaseScope[];
  blockedRunScopeCount: number;
  blockedRunScopesTruncated: boolean;
  blockedRunVisibility: "available" | "unavailable";
}

export interface DurableExecutionScopeSupervisorOptions extends DurableExecutionScopeDiscoveryOptions {
  repository: ExecutionControlRepository;
  runtime: DurableExecutionScopeRuntime;
  intervalMs?: number;
  scheduler?: DurableExecutionScopeSupervisorScheduler;
  now?: () => Date;
  /** Receives only a sanitized code/timestamp, never repository error text. */
  onError?: (error: DurableExecutionScopeSupervisorError) => void;
}

type ListRunnableScopesPage = (
  input: Parameters<
    NonNullable<ExecutionControlRepository["listRunnableScopesPage"]>
  >[0],
) => Promise<RunnableExecutionScopePage>;

type ListBlockedProjectionScopesPage = (
  input: ListBlockedExecutionProjectionScopesPageInput,
) => Promise<BlockedExecutionProjectionScopePage>;

type ListBlockedRunScopesPage = (
  input: ListBlockedExecutionRunScopesPageInput,
) => Promise<BlockedExecutionRunScopePage>;

const MAX_BLOCKED_PROJECTION_SCOPE_EVIDENCE = 100;
const MAX_BLOCKED_RUN_SCOPE_EVIDENCE = 100;

function normalizeOperation(operation: string): string {
  const value = operation.trim().toLowerCase();
  if (!value) throw new Error("Durable scope operation cannot be empty");
  return value;
}

function registryOperations(registry: DurableExecutionRegistry): string[] {
  const operations = [
    ...new Set(
      registry
        .descriptors()
        .map(({ operation }) => normalizeOperation(operation)),
    ),
  ].sort();
  if (operations.length < 1 || operations.length > MAX_REGISTRY_OPERATIONS) {
    throw new Error(
      `Durable scope registry must contain 1 to ${MAX_REGISTRY_OPERATIONS} operations`,
    );
  }
  return operations;
}

function normalizeModes(
  values: readonly LeasableExecutionRunMode[],
): LeasableExecutionRunMode[] {
  const modes = [...new Set(values)];
  if (
    modes.length < 1 ||
    modes.length > 2 ||
    modes.some((mode) => mode !== "canary" && mode !== "active")
  ) {
    throw new Error("Durable scope modes must contain canary and/or active");
  }
  return modes.sort();
}

function normalizePageSize(value: number | undefined): number {
  const pageSize = value ?? DEFAULT_PAGE_SIZE;
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new Error("Durable scope pageSize must be an integer from 1 to 100");
  }
  return pageSize;
}

function normalizeIntervalMs(value: number | undefined): number {
  const intervalMs = value ?? DEFAULT_RESCAN_INTERVAL_MS;
  if (
    !Number.isSafeInteger(intervalMs) ||
    intervalMs < 1_000 ||
    intervalMs > 3_600_000
  ) {
    throw new Error(
      "Durable scope intervalMs must be an integer from 1000 to 3600000",
    );
  }
  return intervalMs;
}

/** Conservative generic tenant boundary. Product validators may narrow it. */
export function isSafeDurableExecutionTenantKey(tenantKey: string): boolean {
  return (
    tenantKey.length >= 1 &&
    tenantKey.length <= 128 &&
    /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/.test(tenantKey)
  );
}

function normalizeScope(scope: ExecutionLeaseScope): ExecutionLeaseScope {
  const tenantKey = scope.tenantKey.trim().toLowerCase();
  const operation = normalizeOperation(scope.operation);
  if (scope.mode !== "canary" && scope.mode !== "active") {
    throw new Error("Durable scope page returned a non-executable mode");
  }
  return { tenantKey, operation, mode: scope.mode };
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

function scopeKey(scope: ExecutionLeaseScope): string {
  return `${scope.operation}\u0000${scope.mode}\u0000${scope.tenantKey}`;
}

function sanitizeCode(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const code = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return code || fallback;
}

function rejection(
  progress: DurableExecutionScopeDiscoveryProgress,
  codeValue: unknown,
): void {
  const code = sanitizeCode(codeValue, "scope_rejected");
  progress.scopesRejected += 1;
  progress.rejectionCodes[code] = (progress.rejectionCodes[code] ?? 0) + 1;
}

function copyProgress(
  progress: DurableExecutionScopeDiscoveryProgress,
): DurableExecutionScopeDiscoveryProgress {
  return {
    ...progress,
    rejectionCodes: { ...progress.rejectionCodes },
  };
}

function assertPageCursor(
  page: RunnableExecutionScopePage,
  normalizedPage: ExecutionLeaseScope[],
  previousCursor: RunnableExecutionScopeCursor | undefined,
): RunnableExecutionScopeCursor | undefined {
  if (!page.nextAfter) return undefined;
  if (normalizedPage.length === 0) {
    throw new Error("Durable scope page returned a cursor without scopes");
  }
  const cursor = normalizeScope(page.nextAfter);
  const finalScope = normalizedPage[normalizedPage.length - 1];
  if (compareScope(cursor, finalScope) !== 0) {
    throw new Error("Durable scope page cursor does not match its final scope");
  }
  if (previousCursor && compareScope(cursor, previousCursor) <= 0) {
    throw new Error("Durable scope page cursor did not advance");
  }
  return cursor;
}

async function allowedByPolicy(
  policy: DurableExecutionScopePolicy,
  scope: ExecutionLeaseScope,
): Promise<DurableExecutionScopeAllowance> {
  try {
    const decision = await policy({ ...scope });
    if (typeof decision === "boolean") return { allowed: decision };
    if (
      decision &&
      typeof decision === "object" &&
      typeof decision.allowed === "boolean"
    ) {
      return {
        allowed: decision.allowed,
        ...(decision.code ? { code: decision.code } : {}),
      };
    }
    return { allowed: false, code: "invalid_scope_policy_decision" };
  } catch {
    return { allowed: false, code: "scope_policy_error" };
  }
}

/**
 * Discover every exact runnable scope for registered operations. The global
 * keyset is consumed to exhaustion; no page-size ceiling becomes truncation.
 */
export async function discoverRunnableExecutionScopes(
  repository: ExecutionControlRepository,
  options: DurableExecutionScopeDiscoveryOptions,
): Promise<DurableExecutionScopeDiscoveryResult> {
  const listPage = repository.listRunnableScopesPage;
  if (typeof listPage !== "function") {
    throw new Error(
      "Durable scope discovery requires listRunnableScopesPage capability",
    );
  }
  return discoverRunnableExecutionScopesWith(
    listPage.bind(repository),
    options,
  );
}

/**
 * Read blocked projection scopes through a separate page contract. Reusing the
 * strict scope validator is intentional; only the consumer differs, and this
 * result must never be treated as runnable work.
 */
export async function discoverBlockedExecutionProjectionScopes(
  repository: ExecutionControlRepository,
  options: DurableExecutionScopeDiscoveryOptions,
): Promise<DurableExecutionScopeDiscoveryResult> {
  const listPage = repository.listBlockedProjectionScopesPage;
  if (typeof listPage !== "function") {
    throw new Error(
      "Durable blocked projection discovery requires listBlockedProjectionScopesPage capability",
    );
  }
  return discoverRunnableExecutionScopesWith(
    listPage.bind(repository) as ListRunnableScopesPage,
    options,
  );
}

/** Read blocked commands as incident evidence, never as runnable scopes. */
export async function discoverBlockedExecutionRunScopes(
  repository: ExecutionControlRepository,
  options: DurableExecutionScopeDiscoveryOptions,
): Promise<DurableExecutionScopeDiscoveryResult> {
  const listPage = repository.listBlockedRunScopesPage;
  if (typeof listPage !== "function") {
    throw new Error(
      "Durable blocked run discovery requires listBlockedRunScopesPage capability",
    );
  }
  return discoverRunnableExecutionScopesWith(
    listPage.bind(repository) as ListRunnableScopesPage,
    options,
  );
}

async function discoverRunnableExecutionScopesWith(
  listPage: ListRunnableScopesPage,
  options: DurableExecutionScopeDiscoveryOptions,
): Promise<DurableExecutionScopeDiscoveryResult> {
  const operations = registryOperations(options.registry);
  const operationSet = new Set(operations);
  const modes = normalizeModes(options.modes);
  const modeSet = new Set(modes);
  const pageSize = normalizePageSize(options.pageSize);
  if (typeof options.allowScope !== "function") {
    throw new Error("Durable scope discovery requires an allowScope policy");
  }

  const progress: DurableExecutionScopeDiscoveryProgress = {
    pages: 0,
    scopesSeen: 0,
    scopesAllowed: 0,
    scopesRejected: 0,
    rejectionCodes: {},
  };
  const scopes: ExecutionLeaseScope[] = [];
  const seenScopeKeys = new Set<string>();
  const seenCursors = new Set<string>();
  let after: RunnableExecutionScopeCursor | undefined;

  while (true) {
    const page = await listPage({
      operations,
      modes,
      limit: pageSize,
      ...(after ? { after } : {}),
    });
    if (!page || !Array.isArray(page.scopes)) {
      throw new Error("Durable scope repository returned an invalid page");
    }
    if (page.scopes.length > pageSize) {
      throw new Error(
        "Durable scope repository exceeded the requested page size",
      );
    }
    progress.pages += 1;
    const normalizedPage: ExecutionLeaseScope[] = [];
    let previous = after;
    for (const rawScope of page.scopes) {
      const scope = normalizeScope(rawScope);
      if (!operationSet.has(scope.operation) || !modeSet.has(scope.mode)) {
        throw new Error(
          "Durable scope repository returned a scope outside the requested capability",
        );
      }
      if (previous && compareScope(scope, previous) <= 0) {
        throw new Error(
          "Durable scope repository returned non-advancing scopes",
        );
      }
      const key = scopeKey(scope);
      if (seenScopeKeys.has(key)) {
        throw new Error("Durable scope repository returned a duplicate scope");
      }
      seenScopeKeys.add(key);
      previous = scope;
      normalizedPage.push(scope);
      progress.scopesSeen += 1;

      let tenantValid = isSafeDurableExecutionTenantKey(scope.tenantKey);
      if (tenantValid && options.isValidTenantKey) {
        try {
          tenantValid =
            options.isValidTenantKey(scope.tenantKey, { ...scope }) === true;
        } catch {
          tenantValid = false;
        }
      }
      if (!tenantValid) {
        rejection(progress, "invalid_tenant_key");
        continue;
      }

      const allowance = await allowedByPolicy(options.allowScope, scope);
      if (!allowance.allowed) {
        rejection(progress, allowance.code ?? "scope_not_allowed");
        continue;
      }
      scopes.push(scope);
      progress.scopesAllowed += 1;
    }

    const nextAfter = assertPageCursor(page, normalizedPage, after);
    options.onProgress?.(copyProgress(progress));
    if (!nextAfter) break;
    const nextCursorKey = scopeKey(nextAfter);
    if (seenCursors.has(nextCursorKey)) {
      throw new Error("Durable scope repository repeated a keyset cursor");
    }
    seenCursors.add(nextCursorKey);
    after = nextAfter;
  }

  return { ...copyProgress(progress), scopes };
}

function supervisorErrorCode(error: unknown): string {
  const explicit =
    error && typeof error === "object" && "code" in error
      ? (error as { code?: unknown }).code
      : undefined;
  return sanitizeCode(explicit, "durable_scope_scan_failed");
}

interface ManagedDurableExecutionWorker {
  scope: ExecutionLeaseScope;
  workerId: string;
  absentFullScans: number;
}

export class DurableExecutionScopeSupervisorShutdownError extends Error {
  readonly code = "durable_execution_scope_supervisor_shutdown" as const;

  constructor() {
    super("Durable scope supervisor cannot start after shutdown");
    this.name = "DurableExecutionScopeSupervisorShutdownError";
  }
}

/**
 * Process-local lifecycle for all exact scopes. PostgreSQL discovery and lease
 * fencing remain authoritative across processes; this class only starts and
 * wakes the matching runtime workers.
 */
export class DurableExecutionScopeSupervisor {
  private readonly listPage: ListRunnableScopesPage;
  private readonly listBlockedPage?: ListBlockedProjectionScopesPage;
  private readonly listBlockedRunPage?: ListBlockedRunScopesPage;
  private readonly modes: LeasableExecutionRunMode[];
  private readonly pageSize: number;
  private readonly intervalMs: number;
  private readonly scheduler: DurableExecutionScopeSupervisorScheduler;
  private readonly now: () => Date;
  private readonly demandOwnerId = randomUUID();
  private timer: unknown;
  private scanInFlight: Promise<DurableExecutionScopeDiscoveryResult> | null =
    null;
  private startInFlight: Promise<this> | null = null;
  private shutdownInFlight: Promise<void> | null = null;
  private started = false;
  private stopping = false;
  private permanentlyStopped = false;
  private startedAt?: string;
  private lastFullSuccessAt?: string;
  private lastError?: DurableExecutionScopeSupervisorError;
  private lastScan?: DurableExecutionScopeScanReadiness;
  private blockedProjectionScopes: ExecutionLeaseScope[] = [];
  private blockedProjectionScopeCount = 0;
  private blockedRunScopes: ExecutionLeaseScope[] = [];
  private blockedRunScopeCount = 0;
  private readonly managedWorkers = new Map<
    string,
    ManagedDurableExecutionWorker
  >();
  private readonly demandedScopes = new Map<string, ExecutionLeaseScope>();
  private capacityDeferredScopes: ExecutionLeaseScope[] = [];
  private capacityDeferredScopeCount = 0;
  private counters: DurableExecutionScopeSupervisorCounters = {
    scansStarted: 0,
    scansSucceeded: 0,
    scansFailed: 0,
    pages: 0,
    scopesSeen: 0,
    scopesAllowed: 0,
    scopesRejected: 0,
    workersStarted: 0,
    workersWoken: 0,
    workersRetired: 0,
    workersFairnessYielded: 0,
    workerRetireOwnershipLost: 0,
    capacityDeferredScopes: 0,
    blockedProjectionPages: 0,
    blockedProjectionScopes: 0,
    blockedRunPages: 0,
    blockedRunScopes: 0,
  };

  constructor(
    private readonly options: DurableExecutionScopeSupervisorOptions,
  ) {
    const listPage = options.repository.listRunnableScopesPage;
    if (typeof listPage !== "function") {
      throw new Error(
        "Durable scope supervisor requires listRunnableScopesPage capability",
      );
    }
    if (typeof options.allowScope !== "function") {
      throw new Error("Durable scope supervisor requires an allowScope policy");
    }
    registryOperations(options.registry);
    this.listPage = listPage.bind(options.repository);
    this.listBlockedPage =
      options.repository.listBlockedProjectionScopesPage?.bind(
        options.repository,
      );
    this.listBlockedRunPage = options.repository.listBlockedRunScopesPage?.bind(
      options.repository,
    );
    this.modes = normalizeModes(options.modes);
    this.pageSize = normalizePageSize(options.pageSize);
    this.intervalMs = normalizeIntervalMs(options.intervalMs);
    this.scheduler = options.scheduler ?? defaultScheduler;
    this.now = options.now ?? (() => new Date());
  }

  start(): Promise<this> {
    if (this.startInFlight) return this.startInFlight;
    if (this.permanentlyStopped || this.stopping) {
      return Promise.reject(new DurableExecutionScopeSupervisorShutdownError());
    }
    if (this.started) return Promise.resolve(this);
    const start = this.performStart().finally(() => {
      if (this.startInFlight === start) this.startInFlight = null;
    });
    this.startInFlight = start;
    return start;
  }

  private async performStart(): Promise<this> {
    this.started = true;
    this.startedAt = this.now().toISOString();
    this.timer = this.scheduler.setInterval(() => {
      if (!this.started || this.stopping) return;
      void this.scan().catch(() => {
        // Failure is already reflected in readiness and retried next interval.
      });
    }, this.intervalMs);
    // A transient startup scan must not disable the periodic recovery loop.
    await this.scan().catch(() => undefined);
    // shutdown() can begin while the startup scan is awaiting PostgreSQL. A
    // start that lost that race must never report a stopped supervisor ready.
    if (!this.started || this.stopping || this.permanentlyStopped) {
      throw new DurableExecutionScopeSupervisorShutdownError();
    }
    return this;
  }

  /** Concurrent callers share the exact same full-scan promise. */
  scan(): Promise<DurableExecutionScopeDiscoveryResult> {
    if (!this.started || this.stopping) {
      return Promise.reject(
        new Error("Durable scope supervisor is not accepting scans"),
      );
    }
    if (this.scanInFlight) return this.scanInFlight;
    const scan = this.performScan().finally(() => {
      if (this.scanInFlight === scan) this.scanInFlight = null;
    });
    this.scanInFlight = scan;
    return scan;
  }

  /**
   * Latency hint only. Existing workers are woken immediately; missing scopes
   * are started only after the authoritative, coalesced full discovery scan.
   */
  wakeOrScan(scope: ExecutionLeaseScope): boolean {
    if (this.stopping || this.permanentlyStopped) return false;
    if (this.options.runtime.wake(scope)) return true;
    if (!this.started) {
      void this.start().catch(() => {
        // Startup/scan failure is already reflected in readiness.
      });
    } else {
      void this.scan().catch(() => {
        // Scan failure is already reflected in readiness.
      });
    }
    return false;
  }

  readiness(): DurableExecutionScopeSupervisorReadiness {
    return {
      state: this.stopping
        ? "stopping"
        : !this.started
          ? "stopped"
          : this.lastError ||
              (this.lastScan?.scopesRejected ?? 0) > 0 ||
              this.capacityDeferredScopeCount > 0 ||
              this.blockedProjectionScopeCount > 0 ||
              this.blockedRunScopeCount > 0
            ? "degraded"
            : this.lastFullSuccessAt
              ? "ready"
              : "starting",
      started: this.started,
      scanInFlight: this.scanInFlight !== null,
      operations: registryOperations(this.options.registry),
      modes: [...this.modes],
      ...(this.startedAt ? { startedAt: this.startedAt } : {}),
      ...(this.lastFullSuccessAt
        ? { lastFullSuccessAt: this.lastFullSuccessAt }
        : {}),
      ...(this.lastError ? { lastError: { ...this.lastError } } : {}),
      ...(this.lastScan
        ? {
            lastScan: {
              ...this.lastScan,
              rejectionCodes: { ...this.lastScan.rejectionCodes },
            },
          }
        : {}),
      counters: { ...this.counters },
      workers: this.options.runtime.readiness(),
      capacity: { ...this.options.runtime.capacity() },
      managedWorkerCount: this.managedWorkers.size,
      capacityDeferredScopes: this.capacityDeferredScopes.map((scope) => ({
        ...scope,
      })),
      capacityDeferredScopeCount: this.capacityDeferredScopeCount,
      capacityDeferredScopesTruncated:
        this.capacityDeferredScopeCount > this.capacityDeferredScopes.length,
      blockedProjectionScopes: this.blockedProjectionScopes.map((scope) => ({
        ...scope,
      })),
      blockedProjectionScopeCount: this.blockedProjectionScopeCount,
      blockedProjectionScopesTruncated:
        this.blockedProjectionScopeCount > this.blockedProjectionScopes.length,
      blockedProjectionVisibility: this.listBlockedPage
        ? "available"
        : "unavailable",
      blockedRunScopes: this.blockedRunScopes.map((scope) => ({ ...scope })),
      blockedRunScopeCount: this.blockedRunScopeCount,
      blockedRunScopesTruncated:
        this.blockedRunScopeCount > this.blockedRunScopes.length,
      blockedRunVisibility: this.listBlockedRunPage
        ? "available"
        : "unavailable",
    };
  }

  shutdown(): Promise<void> {
    if (this.shutdownInFlight) return this.shutdownInFlight;
    const shutdown = this.performShutdown().finally(() => {
      if (this.shutdownInFlight === shutdown) this.shutdownInFlight = null;
    });
    this.shutdownInFlight = shutdown;
    return shutdown;
  }

  private async performScan(): Promise<DurableExecutionScopeDiscoveryResult> {
    const startedAt = this.now().toISOString();
    this.counters.scansStarted += 1;
    this.lastScan = {
      startedAt,
      pages: 0,
      scopesSeen: 0,
      scopesAllowed: 0,
      scopesRejected: 0,
      rejectionCodes: {},
      workersStarted: 0,
      workersWoken: 0,
      workersRetired: 0,
      workersFairnessYielded: 0,
      workerRetireOwnershipLost: 0,
      capacityDeferredScopes: 0,
      blockedProjectionPages: 0,
      blockedProjectionScopes: 0,
      blockedRunPages: 0,
      blockedRunScopes: 0,
    };
    try {
      const result = await discoverRunnableExecutionScopesWith(this.listPage, {
        registry: this.options.registry,
        modes: this.modes,
        pageSize: this.pageSize,
        allowScope: this.options.allowScope,
        isValidTenantKey: this.options.isValidTenantKey,
        onProgress: (progress) => {
          if (!this.lastScan || this.lastScan.startedAt !== startedAt) return;
          Object.assign(this.lastScan, copyProgress(progress));
        },
      });
      const blocked = this.listBlockedPage
        ? await discoverRunnableExecutionScopesWith(
            this.listBlockedPage as ListRunnableScopesPage,
            {
              registry: this.options.registry,
              modes: this.modes,
              pageSize: this.pageSize,
              allowScope: this.options.allowScope,
              isValidTenantKey: this.options.isValidTenantKey,
            },
          )
        : undefined;
      const blockedRuns = this.listBlockedRunPage
        ? await discoverRunnableExecutionScopesWith(
            this.listBlockedRunPage as ListRunnableScopesPage,
            {
              registry: this.options.registry,
              modes: this.modes,
              pageSize: this.pageSize,
              allowScope: this.options.allowScope,
              isValidTenantKey: this.options.isValidTenantKey,
            },
          )
        : undefined;
      this.blockedProjectionScopeCount = blocked?.scopes.length ?? 0;
      this.blockedProjectionScopes = (blocked?.scopes ?? [])
        .slice(0, MAX_BLOCKED_PROJECTION_SCOPE_EVIDENCE)
        .map((scope) => ({ ...scope }));
      this.blockedRunScopeCount = blockedRuns?.scopes.length ?? 0;
      this.blockedRunScopes = (blockedRuns?.scopes ?? [])
        .slice(0, MAX_BLOCKED_RUN_SCOPE_EVIDENCE)
        .map((scope) => ({ ...scope }));

      let workersStarted = 0;
      let workersWoken = 0;
      let workersRetired = 0;
      let workersFairnessYielded = 0;
      let workerRetireOwnershipLost = 0;
      let capacityDeferredScopeCount = 0;
      const capacityDeferredScopes: ExecutionLeaseScope[] = [];
      const capacityDeferredScopeKeys = new Set<string>();
      const runnableScopeKeys = new Set(result.scopes.map(scopeKey));
      const yieldedScopeKeys = new Set<string>();
      const recordDeferred = (scope: ExecutionLeaseScope) => {
        const key = scopeKey(scope);
        if (capacityDeferredScopeKeys.has(key)) return;
        capacityDeferredScopeKeys.add(key);
        capacityDeferredScopeCount += 1;
        if (
          capacityDeferredScopes.length < MAX_CAPACITY_DEFERRED_SCOPE_EVIDENCE
        ) {
          capacityDeferredScopes.push({ ...scope });
        }
      };

      // A successful full scan is the authority for removing stale FIFO
      // demand. Failed discovery deliberately preserves pending demand.
      for (const [key, demandedScope] of this.demandedScopes) {
        if (runnableScopeKeys.has(key)) continue;
        this.options.runtime.cancelWorkerDemand(
          demandedScope,
          this.demandOwnerId,
        );
        this.demandedScopes.delete(key);
      }

      // A slot is reclaimed before new starts only after two consecutive,
      // fully successful scans prove this supervisor-managed scope absent.
      if (this.started && !this.stopping) {
        const managed = [...this.managedWorkers.entries()].sort(
          ([left], [right]) => left.localeCompare(right),
        );
        for (const [key, entry] of managed) {
          if (runnableScopeKeys.has(key)) {
            entry.absentFullScans = 0;
            continue;
          }
          entry.absentFullScans += 1;
          if (entry.absentFullScans < RETIRE_AFTER_ABSENT_FULL_SCANS) {
            continue;
          }
          const stopped = await this.options.runtime.retireWorker(
            entry.scope,
            entry.workerId,
          );
          this.managedWorkers.delete(key);
          if (stopped) workersRetired += 1;
          else workerRetireOwnershipLost += 1;
          if (!this.started || this.stopping) break;
        }
      }

      // A shared FIFO demand causes one globally fenced cooperative yield.
      // The yielded runnable scope joins the FIFO tail and is intentionally
      // skipped below so it cannot restart during this same full scan.
      if (
        this.started &&
        !this.stopping &&
        (this.options.runtime.capacity().pendingDemands ?? 0) > 0
      ) {
        const managed = [...this.managedWorkers.entries()].sort(
          ([left], [right]) => left.localeCompare(right),
        );
        for (const [key, entry] of managed) {
          if (!runnableScopeKeys.has(key)) continue;
          const yielded = await this.options.runtime.yieldWorker(
            entry.scope,
            entry.workerId,
          );
          if (!yielded) continue;
          this.managedWorkers.delete(key);
          this.demandedScopes.set(key, { ...entry.scope });
          yieldedScopeKeys.add(key);
          recordDeferred(entry.scope);
          workersFairnessYielded += 1;
          break;
        }
      }

      // Shutdown requested during discovery/retirement suppresses every new
      // start or wake. Capacity is an expected deferred state, not scan loss.
      if (this.started && !this.stopping) {
        for (const scope of result.scopes) {
          const key = scopeKey(scope);
          if (yieldedScopeKeys.has(key)) continue;
          if (this.options.runtime.wake(scope)) {
            this.options.runtime.cancelWorkerDemand(scope, this.demandOwnerId);
            this.demandedScopes.delete(key);
            const managed = this.managedWorkers.get(key);
            const current = this.options.runtime.getWorker(scope);
            if (managed && current?.workerId !== managed.workerId) {
              this.managedWorkers.delete(key);
            }
            workersWoken += 1;
          } else {
            this.managedWorkers.delete(key);
            try {
              const worker = this.options.runtime.startWorker(
                scope,
                this.demandOwnerId,
              );
              this.demandedScopes.delete(key);
              this.managedWorkers.set(key, {
                scope: { ...scope },
                workerId: worker.workerId,
                absentFullScans: 0,
              });
              workersStarted += 1;
            } catch (error) {
              if (isDurableExecutionWorkerCapacityError(error)) {
                this.demandedScopes.set(key, { ...scope });
                recordDeferred(scope);
                continue;
              }
              // Another runtime already polling the exact scope is safe and
              // must not consume a second slot or fail the authoritative scan.
              if (isDuplicateDurableExecutionWorkerError(error)) {
                this.options.runtime.cancelWorkerDemand(
                  scope,
                  this.demandOwnerId,
                );
                this.demandedScopes.delete(key);
                recordDeferred(scope);
                continue;
              }
              throw error;
            }
          }
        }
      }
      this.capacityDeferredScopeCount = capacityDeferredScopeCount;
      this.capacityDeferredScopes = capacityDeferredScopes;
      const finishedAt = this.now().toISOString();
      this.lastScan = {
        ...copyProgress(result),
        startedAt,
        finishedAt,
        workersStarted,
        workersWoken,
        workersRetired,
        workersFairnessYielded,
        workerRetireOwnershipLost,
        capacityDeferredScopes: capacityDeferredScopeCount,
        blockedProjectionPages: blocked?.pages ?? 0,
        blockedProjectionScopes: blocked?.scopes.length ?? 0,
        blockedRunPages: blockedRuns?.pages ?? 0,
        blockedRunScopes: blockedRuns?.scopes.length ?? 0,
      };
      this.counters.scansSucceeded += 1;
      this.counters.pages += result.pages;
      this.counters.scopesSeen += result.scopesSeen;
      this.counters.scopesAllowed += result.scopesAllowed;
      this.counters.scopesRejected += result.scopesRejected;
      this.counters.workersStarted += workersStarted;
      this.counters.workersWoken += workersWoken;
      this.counters.workersRetired += workersRetired;
      this.counters.workersFairnessYielded = boundedCounterAdd(
        this.counters.workersFairnessYielded,
        workersFairnessYielded,
      );
      this.counters.workerRetireOwnershipLost += workerRetireOwnershipLost;
      this.counters.capacityDeferredScopes = boundedCounterAdd(
        this.counters.capacityDeferredScopes,
        capacityDeferredScopeCount,
      );
      this.counters.blockedProjectionPages += blocked?.pages ?? 0;
      this.counters.blockedProjectionScopes += blocked?.scopes.length ?? 0;
      this.counters.blockedRunPages += blockedRuns?.pages ?? 0;
      this.counters.blockedRunScopes += blockedRuns?.scopes.length ?? 0;
      this.lastFullSuccessAt = finishedAt;
      this.lastError = undefined;
      return result;
    } catch (error) {
      const at = this.now().toISOString();
      const safeError = { code: supervisorErrorCode(error), at };
      this.counters.scansFailed += 1;
      this.lastError = safeError;
      // This supervisor no longer has a complete authoritative runnable set.
      // Releasing all of its FIFO tickets prevents a dead/stuck head from
      // blocking live demand owned by other product supervisors.
      this.cancelAllDemands();
      for (const managed of this.managedWorkers.values()) {
        managed.absentFullScans = 0;
      }
      if (this.lastScan?.startedAt === startedAt) {
        this.lastScan.finishedAt = at;
      }
      try {
        this.options.onError?.({ ...safeError });
      } catch {
        // Observability hooks cannot change recovery behavior.
      }
      throw error;
    }
  }

  private async performShutdown(): Promise<void> {
    if (this.permanentlyStopped) return;
    this.stopping = true;
    this.started = false;
    let timerError: unknown;
    if (this.timer !== undefined) {
      try {
        this.scheduler.clearInterval(this.timer);
      } catch (error) {
        timerError = error;
      }
    }
    this.timer = undefined;
    let cleanupError: unknown;
    try {
      // Escalate immediately: a scan may currently await cooperative
      // retirement, and shutdown must abort that handler instead of waiting
      // for its normal deadline. stopWorker is idempotent and owner-fenced.
      const initialManaged = [...this.managedWorkers.entries()];
      for (const [, worker] of initialManaged) {
        this.options.runtime.cancelWorkerDemand(
          worker.scope,
          this.demandOwnerId,
        );
      }
      this.cancelAllDemands();
      const initialStops = Promise.allSettled(
        initialManaged.map(([, worker]) =>
          this.options.runtime.stopWorker(worker.scope, worker.workerId),
        ),
      );
      await this.scanInFlight?.catch(() => undefined);
      const initialSettled = await initialStops;
      const managed = [...this.managedWorkers.entries()];
      const stopped = await Promise.allSettled(
        managed.map(async ([key, worker]) => {
          try {
            await this.options.runtime.stopWorker(
              worker.scope,
              worker.workerId,
            );
          } finally {
            this.managedWorkers.delete(key);
          }
        }),
      );
      this.cancelAllDemands();
      const rejected = [...initialSettled, ...stopped].find(
        (result): result is PromiseRejectedResult =>
          result.status === "rejected",
      );
      if (rejected) throw rejected.reason;
    } catch (error) {
      cleanupError = error;
    } finally {
      this.stopping = false;
      this.permanentlyStopped = true;
    }
    if (timerError && cleanupError) {
      throw new AggregateError(
        [timerError, cleanupError],
        "Durable scope supervisor shutdown cleanup failed",
      );
    }
    if (timerError) throw timerError;
    if (cleanupError) throw cleanupError;
  }

  private cancelAllDemands(): void {
    for (const demanded of this.demandedScopes.values()) {
      this.options.runtime.cancelWorkerDemand(demanded, this.demandOwnerId);
    }
    this.demandedScopes.clear();
    this.capacityDeferredScopeCount = 0;
    this.capacityDeferredScopes = [];
  }
}
