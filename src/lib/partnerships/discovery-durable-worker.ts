import {
  PostgresExecutionControlRepository,
  type ExecutionCancellationControlRepository,
  type ExecutionControlRepository,
  type ExecutionEffectControlRepository,
  type ExecutionLeaseScope,
  type ListRunnableExecutionScopesPageInput,
  type RunnableExecutionScopePage,
  type ExecutionRun,
} from "@/lib/execution-control";
import { ExecutionCommandConflictError } from "@/lib/execution-control/types";
import {
  DurableExecutionEngine,
  DurableExecutionRegistry,
  DurableExecutionRuntime,
  DurableExecutionScopeSupervisor,
  DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION,
  durableExecutionEffectKey,
  type CapabilityCredentialProvider,
  type DurableCapabilityPolicy,
  type DurableExecutionContext,
  type DurableExecutionDrainPolicy,
  type DurableExecutionErrorDecision,
  type DurableExecutionOutcome,
  type DurableExecutionHandler,
  type DurableExecutionReconciliationContext,
  type DurableExecutionScheduler,
  type DurableExecutionScopeSupervisorReadiness,
  type DurableExecutionScopeSupervisorScheduler,
  type DurableExecutionWorkerCapacityLimiter,
  type DurableExecutionWorkerReadiness,
} from "@/lib/durable-execution";
import { sanitizeSupportBundle } from "@/lib/support/redaction";
import { isValidTenantSlug } from "@/lib/thread-id";
import {
  DEFAULT_CREATOR_MODEL_CONFIG,
  type CreatorModelConfig,
} from "@/lib/calc-creator-core";
import {
  cleanupExpiredDiscoveryAssignmentArtifacts,
  deleteDiscoveryAssignmentArtifact,
  DiscoveryExecutionArtifactError,
} from "./discovery-execution-artifact";
import { observeDiscoveryExecutionCreated } from "./discovery-execution-observer";
import {
  configuredDiscoveryExecutionSlugs,
  DISCOVERY_EXECUTION_AGGREGATE,
  DISCOVERY_EXECUTION_OPERATION,
  DISCOVERY_EXECUTION_SNAPSHOT_VERSION,
  DISCOVERY_SETUP_OPERATION,
  discoveryExecutionAggregateId,
  DiscoveryDurableAuthorityError,
  isDiscoveryLedgerAuthoritative,
  isPartnershipsDurableWorkerBootEnabled,
  isDiscoverySingleHostStoreAcknowledged,
  resolveDiscoveryExecutionPolicy,
  type DiscoveryExecutionEnvironment,
  type DiscoveryExecutionSnapshot,
} from "./discovery-execution-policy";
import {
  createDiscoverySetupHandler,
  type DiscoverySetupWorkerDependencies,
} from "./discovery-setup-worker";
import { discoveryJobId, normalizeDiscoveryJobError } from "./discovery-jobs";
import {
  runDiscoverySearch,
  type RunDiscoveryResult,
} from "./discovery-runner";
import {
  advanceSearchExecutionGeneration,
  bindSearchExecutionRun,
  getSearch,
  listSearchIds,
  saveSearch,
  searchExecutionGeneration,
  updateRunnerStateForExecution,
  updateSearchForExecution,
} from "./discovery-store";
import { getEffectiveModelConfig } from "./model-config";
import { supportsLiveDiscovery } from "./scrapecreators-live";
import {
  assertPartnershipsDiscoveryV2StaticGate,
  partnershipsDiscoveryCapabilityPolicyV2,
  partnershipsDiscoveryEffectsV2Requested,
  type PartnershipsDiscoveryV2Environment,
} from "./discovery-admission-v2";
import {
  createPartnershipsCredentialProvider,
  createPartnershipsPrepareAssignmentEffectV2,
  createPartnershipsPrepareAssignmentEffectV2LegacyV3,
  createPartnershipsYalcAssignEffectV2,
  createPartnershipsYalcAssignEffectV2LegacyV3,
  type PartnershipsPrepareEffectDependencies,
  type PartnershipsYalcAssignEffectDependencies,
} from "./discovery-effects-v2";
import {
  PARTNERSHIPS_DISCOVERY_HANDLER_VERSION_V2,
  PARTNERSHIPS_DISCOVERY_HANDLER_VERSION_V2_LEGACY_V3,
  PARTNERSHIPS_PREPARE_EFFECT_STEP,
  PARTNERSHIPS_YALC_ASSIGN_EFFECT_STEP,
  createPartnershipsDiscoveryHandlerV2,
  createPartnershipsDiscoveryHandlerV2LegacyV3,
  isPartnershipsDiscoveryHandlerV2Version,
  partnershipsDiscoveryEffectPolicyV2LegacyV3,
  partnershipsCommandSnapshot,
  type PartnershipsDiscoveryCommandV2,
  type PartnershipsPrepareAssignmentEffectV2,
  type PartnershipsYalcAssignEffectV2,
  type PartnershipsDiscoveryHandlerVersionV2,
} from "./discovery-handler-v2";
import { resolvePartnershipsDiscoveryRuntimeContract } from "./discovery-runtime-contract";
import { deliverPartnershipsDiscoveryChatCompletion } from "./discovery-chat-completion";
import type {
  DiscoveryRunnerErrorCode,
  DiscoveryRunnerMode,
  DiscoveryRunnerStats,
  DiscoverySearchRecord,
} from "./discovery-types";

const DEFAULT_LEASE_MS = 60_000;
const DEFAULT_POLL_MS = 5_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_MAX_CLAIMS_PER_DRAIN = 10;
const DISCOVERY_YALC_EFFECT_STEP = "yalc.campaign";

export interface DiscoveryDurableWorkerEnvironment
  extends DiscoveryExecutionEnvironment, PartnershipsDiscoveryV2Environment {
  PARTNERSHIPS_DISCOVERY_WORKER_LEASE_MS?: string;
  PARTNERSHIPS_DISCOVERY_WORKER_POLL_MS?: string;
  PARTNERSHIPS_DISCOVERY_WORKER_MAX_ATTEMPTS?: string;
  PARTNERSHIPS_DISCOVERY_SCOPE_RESCAN_MS?: string;
}

interface DiscoveryWorkerDependencies {
  repository?: ExecutionControlRepository;
  env?: DiscoveryDurableWorkerEnvironment;
  workerId?: string;
  runSearch?: typeof runDiscoverySearch;
  now?: () => Date;
  logError?: (message: string) => void;
  runtimeScheduler?: DurableExecutionScheduler;
  scopeScheduler?: DurableExecutionScopeSupervisorScheduler;
  capacityLimiter?: DurableExecutionWorkerCapacityLimiter;
  effectRepository?: ExecutionEffectControlRepository;
  cancellationRepository?: ExecutionCancellationControlRepository;
  capabilityPolicy?: DurableCapabilityPolicy;
  credentialProvider?: CapabilityCredentialProvider;
  prepareEffect?: PartnershipsPrepareAssignmentEffectV2;
  yalcAssignEffect?: PartnershipsYalcAssignEffectV2;
  prepareEffectDependencies?: PartnershipsPrepareEffectDependencies;
  yalcAssignEffectDependencies?: PartnershipsYalcAssignEffectDependencies;
  deliverV2ChatCompletion?: typeof deliverPartnershipsDiscoveryChatCompletion;
  setup?: Omit<
    DiscoverySetupWorkerDependencies,
    "repository" | "env" | "workerId" | "inlineTimeoutMs"
  >;
}

function hasInjectedDiscoveryExecutor(
  dependencies: Pick<
    DiscoveryWorkerDependencies,
    "repository" | "runSearch" | "setup"
  >,
): boolean {
  return Boolean(
    dependencies.repository ||
    dependencies.runSearch ||
    dependencies.setup?.createCampaign,
  );
}

function defaultDiscoveryRuntimeMayExecute(
  dependencies: Pick<
    DiscoveryWorkerDependencies,
    "repository" | "runSearch" | "setup"
  >,
): boolean {
  return (
    hasInjectedDiscoveryExecutor(dependencies) ||
    isPartnershipsDurableWorkerBootEnabled(
      process.env as DiscoveryDurableWorkerEnvironment,
    )
  );
}

/**
 * Hot, process-owned boot authority for the default Partnerships runtime.
 * Injected repositories/adapters deliberately do not receive this policy.
 */
export function createPartnershipsDefaultRuntimeDrainPolicy(
  env: DiscoveryDurableWorkerEnvironment = process.env as DiscoveryDurableWorkerEnvironment,
): DurableExecutionDrainPolicy {
  return Object.freeze({
    mayDrain: (scope: Readonly<ExecutionLeaseScope>) =>
      scope.mode === "canary" &&
      (scope.operation === DISCOVERY_SETUP_OPERATION ||
        scope.operation === DISCOVERY_EXECUTION_OPERATION) &&
      isPartnershipsDurableWorkerBootEnabled(env),
  });
}

function effectRepositoryFrom(
  repository: ExecutionControlRepository,
): ExecutionEffectControlRepository | null {
  return typeof repository.prepareEffect === "function" &&
    typeof repository.completeEffect === "function" &&
    typeof repository.recordEffectFailure === "function" &&
    typeof repository.recordEffectReconcile === "function" &&
    typeof repository.getEffectForScope === "function"
    ? (repository as ExecutionControlRepository &
        ExecutionEffectControlRepository)
    : null;
}

function cancellationRepositoryFrom(
  repository: ExecutionControlRepository,
): ExecutionCancellationControlRepository | null {
  return typeof repository.requestRunCancellation === "function" &&
    typeof repository.acknowledgeRunCancellation === "function"
    ? (repository as ExecutionControlRepository &
        ExecutionCancellationControlRepository)
    : null;
}

function runtimeCapabilityPolicy(
  env: DiscoveryDurableWorkerEnvironment,
  override?: DurableCapabilityPolicy,
): DurableCapabilityPolicy {
  const policy = override ?? partnershipsDiscoveryCapabilityPolicyV2;
  return Object.freeze({
    mayAdmit: (input: Parameters<DurableCapabilityPolicy["mayAdmit"]>[0]) =>
      policy.mayAdmit(input),
    mayDrain: (input: Parameters<DurableCapabilityPolicy["mayDrain"]>[0]) => {
      if (isPartnershipsDiscoveryHandlerV2Version(input.handlerVersion)) {
        try {
          assertPartnershipsDiscoveryV2StaticGate(env);
        } catch {
          return "temporarily_suspended";
        }
      }
      return policy.mayDrain(input);
    },
  });
}

export class DiscoveryDurableWorkerConfigurationError extends Error {
  readonly code = "partnerships_discovery_worker_repository_required" as const;

  constructor() {
    super(
      "Partnerships discovery worker overrides require an explicit repository",
    );
    this.name = "DiscoveryDurableWorkerConfigurationError";
  }
}

interface DiscoveryHandlerDependencies {
  runSearch: typeof runDiscoverySearch;
}

interface RuntimeBundle {
  repository: ExecutionControlRepository;
  env: DiscoveryDurableWorkerEnvironment;
  registry: DurableExecutionRegistry;
  runtime: DurableExecutionRuntime;
  supervisor: DurableExecutionScopeSupervisor;
}

type RuntimeGlobal = typeof globalThis & {
  __sanchoPartnershipsDiscoveryDurableRuntime?: RuntimeBundle;
};

const runtimeGlobal = globalThis as RuntimeGlobal;
const defaultRepository = new PostgresExecutionControlRepository();
const injectedRuntimeBundles = new WeakMap<
  ExecutionControlRepository,
  RuntimeBundle
>();
const runtimeBundleLifecycle = new WeakMap<
  ExecutionControlRepository,
  Promise<void>
>();

/** Serializes replacement and shutdown for one repository identity. */
function serializeRuntimeBundleLifecycle<Result>(
  repository: ExecutionControlRepository,
  operation: () => Promise<Result>,
): Promise<Result> {
  const previous = runtimeBundleLifecycle.get(repository) ?? Promise.resolve();
  const current = previous.then(operation);
  const tail = current.then(
    () => undefined,
    () => undefined,
  );
  runtimeBundleLifecycle.set(repository, tail);
  return current.finally(() => {
    if (runtimeBundleLifecycle.get(repository) === tail) {
      runtimeBundleLifecycle.delete(repository);
    }
  });
}

class DiscoveryCommandError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "DiscoveryCommandError";
  }
}

export class DiscoveryRetryConflictError extends Error {
  readonly status = 409;

  constructor(
    readonly code:
      "DISCOVERY_DURABLE_RETRY_CONFLICT" | "DISCOVERY_DURABLE_CANCELLED",
    message: string,
  ) {
    super(message);
    this.name = "DiscoveryRetryConflictError";
  }
}

interface DurableDiscoverySnapshot extends Omit<
  DiscoveryExecutionSnapshot,
  "schemaVersion" | "executionGeneration" | "modelConfig"
> {
  schemaVersion: 1 | typeof DISCOVERY_EXECUTION_SNAPSHOT_VERSION;
  executionGeneration: number;
  modelConfig: CreatorModelConfig;
}

function boundedPositiveInt(
  raw: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(Math.floor(parsed), maximum));
}

function workerLeaseMs(env: DiscoveryDurableWorkerEnvironment): number {
  return boundedPositiveInt(
    env.PARTNERSHIPS_DISCOVERY_WORKER_LEASE_MS,
    DEFAULT_LEASE_MS,
    5_000,
    10 * 60_000,
  );
}

function workerPollMs(env: DiscoveryDurableWorkerEnvironment): number {
  return boundedPositiveInt(
    env.PARTNERSHIPS_DISCOVERY_WORKER_POLL_MS,
    DEFAULT_POLL_MS,
    500,
    60_000,
  );
}

function workerMaxAttempts(env: DiscoveryDurableWorkerEnvironment): number {
  return boundedPositiveInt(
    env.PARTNERSHIPS_DISCOVERY_WORKER_MAX_ATTEMPTS,
    DEFAULT_MAX_ATTEMPTS,
    1,
    10,
  );
}

function scopeRescanMs(env: DiscoveryDurableWorkerEnvironment): number {
  return boundedPositiveInt(
    env.PARTNERSHIPS_DISCOVERY_SCOPE_RESCAN_MS,
    30_000,
    1_000,
    60 * 60_000,
  );
}

function compareExecutionScope(
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

/**
 * Temporary compatibility for injected/legacy repositories. Production
 * Postgres implements the global scope page directly. This adapter still
 * exhausts every per-operation keyset and preserves exact operation pairs.
 */
function scopeDiscoveryRepository(
  repository: ExecutionControlRepository,
): ExecutionControlRepository {
  if (repository.listRunnableScopesPage) return repository;
  const listTenantKeys = repository.listRunnableTenantKeys;
  if (!listTenantKeys) return repository;

  return {
    listRunnableScopesPage: async (
      input: ListRunnableExecutionScopesPageInput,
    ): Promise<RunnableExecutionScopePage> => {
      const exactScopes: ExecutionLeaseScope[] = [];
      const operations = [...new Set(input.operations)].sort();
      const modes = [...new Set(input.modes)].sort();
      for (const operation of operations) {
        for (const mode of modes) {
          let afterTenantKey: string | undefined;
          while (true) {
            const tenants = await listTenantKeys.call(repository, {
              operation,
              mode,
              limit: 100,
              ...(afterTenantKey ? { afterTenantKey } : {}),
            });
            let lastTenant = afterTenantKey;
            for (const tenant of tenants) {
              const tenantKey = tenant.trim().toLowerCase();
              if (!tenantKey) continue;
              if (lastTenant && tenantKey <= lastTenant) {
                throw new Error(
                  "Legacy runnable tenant keyset did not advance",
                );
              }
              lastTenant = tenantKey;
              exactScopes.push({ tenantKey, operation, mode });
            }
            if (tenants.length < 100) break;
            if (!lastTenant || lastTenant === afterTenantKey) {
              throw new Error("Legacy runnable tenant cursor did not advance");
            }
            afterTenantKey = lastTenant;
          }
        }
      }

      const scopes = exactScopes
        .sort(compareExecutionScope)
        .filter(
          (scope) =>
            !input.after || compareExecutionScope(scope, input.after) > 0,
        );
      const page = scopes.slice(0, input.limit);
      return {
        scopes: page,
        ...(scopes.length > input.limit && page.length > 0
          ? { nextAfter: { ...page[page.length - 1] } }
          : {}),
      };
    },
  } as ExecutionControlRepository;
}

function partnershipsScopeAllowance(
  scope: Readonly<ExecutionLeaseScope>,
  env: DiscoveryDurableWorkerEnvironment,
): { allowed: boolean; code?: string } {
  if (scope.mode !== "canary") {
    return { allowed: false, code: "unsupported_execution_mode" };
  }
  if (
    scope.operation !== DISCOVERY_SETUP_OPERATION &&
    scope.operation !== DISCOVERY_EXECUTION_OPERATION
  ) {
    return { allowed: false, code: "unsupported_operation" };
  }
  if (!isValidTenantSlug(scope.tenantKey)) {
    return { allowed: false, code: "invalid_tenant_key" };
  }
  if (!isDiscoverySingleHostStoreAcknowledged(env)) {
    return { allowed: false, code: "artifact_store_not_acknowledged" };
  }
  // Rollout flags govern new admission only. A persisted receipt remains
  // sticky and must be drained after the flag or allowlist is removed.
  return { allowed: true };
}

function canaryScope(slug: string): ExecutionLeaseScope {
  return {
    tenantKey: slug.trim().toLowerCase(),
    operation: DISCOVERY_EXECUTION_OPERATION,
    mode: "canary",
  };
}

function canarySetupScope(slug: string): ExecutionLeaseScope {
  return {
    tenantKey: slug.trim().toLowerCase(),
    operation: DISCOVERY_SETUP_OPERATION,
    mode: "canary",
  };
}

function decodeRunSnapshot(run: ExecutionRun): DurableDiscoverySnapshot {
  if (!run.input || typeof run.input !== "object") {
    throw new DiscoveryCommandError(
      "invalid_command_snapshot",
      "Discovery command snapshot is missing",
    );
  }
  const value = run.input as Partial<
    Omit<DiscoveryExecutionSnapshot, "schemaVersion">
  > & {
    schemaVersion?: unknown;
    executionGeneration?: unknown;
    modelConfig?: unknown;
  };
  if (
    (value.schemaVersion !== 1 &&
      value.schemaVersion !== DISCOVERY_EXECUTION_SNAPSHOT_VERSION) ||
    typeof value.slug !== "string" ||
    typeof value.searchId !== "string" ||
    typeof value.campaignId !== "string" ||
    typeof value.executionIntent !== "string" ||
    !value.plan ||
    typeof value.plan !== "object" ||
    value.slug.trim().toLowerCase() !== run.tenantKey.trim().toLowerCase() ||
    run.operation !== DISCOVERY_EXECUTION_OPERATION
  ) {
    throw new DiscoveryCommandError(
      "invalid_command_snapshot",
      "Invalid or cross-tenant discovery command snapshot",
    );
  }
  if (value.schemaVersion === DISCOVERY_EXECUTION_SNAPSHOT_VERSION) {
    if (
      typeof value.executionGeneration !== "number" ||
      !Number.isSafeInteger(value.executionGeneration) ||
      value.executionGeneration < 1 ||
      !value.modelConfig ||
      typeof value.modelConfig !== "object"
    ) {
      throw new DiscoveryCommandError(
        "invalid_command_snapshot",
        "Durable discovery command is missing frozen execution inputs",
      );
    }
    return value as DurableDiscoverySnapshot;
  }
  // Compatibility for pre-canary v1 receipts: fixed code defaults are stable
  // across reclaim, unlike a new mutable Yalc model-config lookup.
  return {
    ...(value as Omit<
      DurableDiscoverySnapshot,
      "executionGeneration" | "modelConfig"
    >),
    executionGeneration: 1,
    modelConfig: JSON.parse(
      JSON.stringify(DEFAULT_CREATOR_MODEL_CONFIG),
    ) as CreatorModelConfig,
  };
}

function modeForSnapshot(
  snapshot: DurableDiscoverySnapshot,
): DiscoveryRunnerMode {
  return snapshot.executionIntent === "fixtures" ? "fixtures" : "live";
}

function statsFromRun(run: ExecutionRun): DiscoveryRunnerStats | null {
  if (!run.output || typeof run.output !== "object") return null;
  const stats = (run.output as { stats?: unknown }).stats;
  return stats && typeof stats === "object"
    ? (stats as DiscoveryRunnerStats)
    : null;
}

const DISCOVERY_RUNNER_ERROR_CODES = new Set<DiscoveryRunnerErrorCode>([
  "provider_timeout",
  "provider_no_credits",
  "provider_auth_failed",
  "provider_unavailable",
  "provider_missing_credentials",
  "unsupported_network",
  "no_candidates",
  "yalc_unavailable",
  "artifact_corrupt",
  "artifact_conflict",
  "job_interrupted",
  "runner_failed",
]);

function errorCodeFromRun(run: ExecutionRun): DiscoveryRunnerErrorCode {
  if (!run.output || typeof run.output !== "object") return "runner_failed";
  const errorCode = (run.output as { errorCode?: unknown }).errorCode;
  return typeof errorCode === "string" &&
    DISCOVERY_RUNNER_ERROR_CODES.has(errorCode as DiscoveryRunnerErrorCode)
    ? (errorCode as DiscoveryRunnerErrorCode)
    : "runner_failed";
}

function stableExternalIdempotencyKey(
  runId: string,
  handlerVersion = DISCOVERY_EXECUTION_SNAPSHOT_VERSION,
): string {
  return durableExecutionEffectKey({
    operation: DISCOVERY_EXECUTION_OPERATION,
    runId,
    handlerVersion,
    step: DISCOVERY_YALC_EFFECT_STEP,
  });
}

function executionHandlerVersion(
  run: ExecutionRun,
  snapshot: DurableDiscoverySnapshot,
): number {
  const candidate = run.metadata.executionHandlerVersion;
  return typeof candidate === "number" &&
    Number.isSafeInteger(candidate) &&
    candidate > 0
    ? candidate
    : snapshot.schemaVersion;
}

function assignmentEffectKeyForRun(
  run: ExecutionRun,
  snapshot: DurableDiscoverySnapshot,
): string {
  const handlerVersion = executionHandlerVersion(run, snapshot);
  return durableExecutionEffectKey({
    operation: DISCOVERY_EXECUTION_OPERATION,
    runId: run.id,
    handlerVersion,
    step: isPartnershipsDiscoveryHandlerV2Version(handlerVersion)
      ? PARTNERSHIPS_YALC_ASSIGN_EFFECT_STEP
      : DISCOVERY_YALC_EFFECT_STEP,
  });
}

function reconstructSearchProjection(
  run: ExecutionRun,
  snapshot: DurableDiscoverySnapshot,
): DiscoverySearchRecord {
  const terminal =
    run.status === "completed" ||
    run.status === "partial" ||
    run.status === "failed" ||
    run.status === "cancelled";
  return {
    id: snapshot.searchId,
    slug: snapshot.slug,
    executionIntent: snapshot.executionIntent,
    executionControl: {
      mode: "canary",
      admittedAt: run.createdAt,
      generation: snapshot.executionGeneration,
      runId: run.id,
      ...(run.commandFingerprint
        ? { commandFingerprint: run.commandFingerprint }
        : {}),
    },
    executionModelConfig: snapshot.modelConfig,
    title: snapshot.title,
    plan: snapshot.plan,
    campaignId: snapshot.campaignId,
    projectId: snapshot.projectId,
    taskId: snapshot.taskId,
    runner: {
      status:
        run.status === "completed"
          ? "done"
          : run.status === "failed" ||
              run.status === "partial" ||
              run.status === "cancelled"
            ? "error"
            : run.status === "running"
              ? "running"
              : "queued",
      mode: modeForSnapshot(snapshot),
      jobId: assignmentEffectKeyForRun(run, snapshot),
      attempts: Math.max(1, snapshot.attempt),
      queuedAt: run.createdAt,
      startedAt: run.startedAt ?? null,
      finishedAt: terminal ? (run.finishedAt ?? run.updatedAt) : null,
      retryable: false,
      errorCode:
        terminal && run.status !== "completed" ? errorCodeFromRun(run) : null,
      error: run.error ? safeExecutionError(run.error) : null,
      stats: statsFromRun(run),
    },
    createdAt: snapshot.createdAt,
    updatedAt: run.updatedAt,
  };
}

function projectTerminalRun(
  search: DiscoverySearchRecord,
  run: ExecutionRun,
): boolean {
  let snapshot: DurableDiscoverySnapshot;
  try {
    snapshot = decodeRunSnapshot(run);
  } catch {
    return false;
  }
  if (snapshot.searchId !== search.id) return false;
  const mode = modeForSnapshot(snapshot);
  const jobId = assignmentEffectKeyForRun(run, snapshot);
  const expected = {
    runId: run.id,
    generation: snapshot.executionGeneration,
  };
  try {
    if (run.status === "completed") {
      const stats = statsFromRun(run);
      return updateSearchForExecution(
        search.slug,
        search.id,
        expected,
        (current) => {
          if (
            current.runner.status === "done" &&
            current.runner.jobId === jobId &&
            JSON.stringify(current.runner.stats) === JSON.stringify(stats)
          ) {
            return current;
          }
          return {
            ...current,
            runner: {
              ...current.runner,
              status: "done",
              mode,
              jobId,
              attempts: Math.max(1, snapshot.attempt),
              finishedAt: run.finishedAt ?? run.updatedAt,
              retryable: false,
              errorCode: null,
              error: null,
              stats,
            },
          };
        },
      ).applied;
    }
    if (run.status === "failed" || run.status === "partial") {
      const error = safeExecutionError(
        run.error ?? "Discovery execution failed",
      );
      const errorCode = errorCodeFromRun(run);
      return updateSearchForExecution(
        search.slug,
        search.id,
        expected,
        (current) => {
          if (
            current.runner.status === "error" &&
            current.runner.jobId === jobId &&
            current.runner.error === error &&
            current.runner.errorCode === errorCode
          ) {
            return current;
          }
          return {
            ...current,
            runner: {
              ...current.runner,
              status: "error",
              mode,
              jobId,
              attempts: Math.max(1, snapshot.attempt),
              finishedAt: run.finishedAt ?? run.updatedAt,
              retryable: false,
              errorCode,
              error,
              stats: statsFromRun(run),
            },
          };
        },
      ).applied;
    }
    if (run.status === "cancelled") {
      const error = "Discovery execution cancelled";
      return updateSearchForExecution(
        search.slug,
        search.id,
        expected,
        (current) => {
          if (
            current.runner.status === "error" &&
            current.runner.jobId === jobId &&
            current.runner.error === error &&
            current.runner.errorCode === "job_interrupted"
          ) {
            return current;
          }
          return {
            ...current,
            runner: {
              ...current.runner,
              status: "error",
              mode,
              jobId,
              attempts: Math.max(1, snapshot.attempt),
              finishedAt: run.finishedAt ?? run.updatedAt,
              retryable: false,
              errorCode: "job_interrupted",
              error,
              stats: null,
            },
          };
        },
      ).applied;
    }
    return false;
  } finally {
    if (
      run.status === "completed" ||
      run.status === "partial" ||
      run.status === "failed" ||
      run.status === "cancelled"
    ) {
      deleteDiscoveryAssignmentArtifact({
        slug: snapshot.slug,
        runId: run.id,
        effectKey: jobId,
        searchId: snapshot.searchId,
        campaignId: snapshot.campaignId,
      });
    }
  }
}

function safeErrorName(error: unknown): string {
  return error instanceof Error && error.name ? error.name : "UnknownError";
}

function safeExecutionError(message: string): string {
  return String(
    sanitizeSupportBundle(message, { destination: "internal" }).value,
  );
}

function syncSearchFromSnapshot(
  run: ExecutionRun,
  snapshot: DurableDiscoverySnapshot,
): DiscoverySearchRecord {
  let search = getSearch(snapshot.slug, snapshot.searchId);
  if (!search) {
    search = saveSearch(reconstructSearchProjection(run, snapshot));
  }
  if (
    (!search.executionControl?.runId ||
      (run.commandFingerprint &&
        search.executionControl.commandFingerprint !==
          run.commandFingerprint)) &&
    searchExecutionGeneration(search) === snapshot.executionGeneration
  ) {
    search = bindSearchExecutionRun(snapshot.slug, snapshot.searchId, {
      generation: snapshot.executionGeneration,
      runId: run.id,
      commandFingerprint: run.commandFingerprint,
    }).search;
  }
  if (
    search.executionControl?.runId !== run.id ||
    searchExecutionGeneration(search) !== snapshot.executionGeneration
  ) {
    throw new DiscoveryCommandError(
      "execution_superseded",
      "Discovery execution was superseded by a newer generation",
    );
  }
  if (search.archivedAt) {
    throw new DiscoveryCommandError(
      "archived_search",
      "Discovery search is archived",
    );
  }
  if (
    search.campaignId !== snapshot.campaignId ||
    search.title !== snapshot.title ||
    JSON.stringify(search.plan) !== JSON.stringify(snapshot.plan) ||
    JSON.stringify(search.executionModelConfig) !==
      JSON.stringify(snapshot.modelConfig)
  ) {
    const updated = updateSearchForExecution(
      snapshot.slug,
      snapshot.searchId,
      { runId: run.id, generation: snapshot.executionGeneration },
      (current) => ({
        ...current,
        title: snapshot.title,
        plan: snapshot.plan,
        campaignId: snapshot.campaignId,
        projectId: snapshot.projectId,
        taskId: snapshot.taskId,
        executionModelConfig: snapshot.modelConfig,
      }),
    );
    if (!updated.applied) {
      throw new DiscoveryCommandError(
        "execution_superseded",
        "Discovery execution lost its product projection generation",
      );
    }
    search = updated.search;
  }
  return search;
}

async function executeDiscovery(
  snapshot: DurableDiscoverySnapshot,
  context: DurableExecutionContext,
  runSearch: typeof runDiscoverySearch,
): Promise<RunDiscoveryResult> {
  const search = syncSearchFromSnapshot(context.run, snapshot);
  const intent = snapshot.executionIntent ?? "auto";
  const fixtures = intent === "fixtures";
  if (
    intent === "none" ||
    intent === "agent" ||
    (!fixtures && !supportsLiveDiscovery(search.plan))
  ) {
    throw new DiscoveryCommandError(
      "unsupported_network",
      intent === "none"
        ? "Deferred discovery command was unexpectedly claimed"
        : "The durable discovery canary currently supports server-side Instagram searches only",
    );
  }

  const effectKey = context.effectKey(DISCOVERY_YALC_EFFECT_STEP);
  const runningProjection = updateRunnerStateForExecution(
    snapshot.slug,
    snapshot.searchId,
    { runId: context.run.id, generation: snapshot.executionGeneration },
    {
      status: "running",
      mode: fixtures ? "fixtures" : "live",
      jobId: effectKey,
      attempts: Math.max(1, snapshot.attempt),
      startedAt: context.now().toISOString(),
      finishedAt: null,
      error: null,
      errorCode: null,
      retryable: false,
      stats: null,
    },
  );
  if (!runningProjection.applied) {
    throw new DiscoveryCommandError(
      "execution_superseded",
      "Discovery execution lost its product projection generation",
    );
  }

  return runSearch({
    slug: snapshot.slug,
    searchId: snapshot.searchId,
    fixtures,
    execution: {
      leaseAuthority: "canary",
      manageRunnerState: false,
      signal: context.signal,
      yalcIdempotencyKey: effectKey,
      modelConfig: snapshot.modelConfig,
      assignmentArtifact: {
        runId: context.run.id,
        effectKey,
      },
      commandSnapshot: {
        title: snapshot.title,
        plan: snapshot.plan,
        campaignId: snapshot.campaignId,
        projectId: snapshot.projectId,
        taskId: snapshot.taskId,
      },
      beforeStep: async (step) => {
        await context.checkpoint(step, {
          eventType: "discovery.step_started",
          output: { searchId: snapshot.searchId },
          eventData: { searchId: snapshot.searchId },
        });
      },
    },
  });
}

function classifyDiscoveryError(error: unknown): DurableExecutionErrorDecision {
  if (error instanceof DiscoveryExecutionArtifactError) {
    return {
      code: error.code,
      retryable: false,
      message: error.message,
      eventData: { errorCode: error.code },
    };
  }
  if (error instanceof DiscoveryCommandError) {
    return {
      code: error.code,
      retryable: false,
      message: error.message,
      eventData: { errorCode: error.code },
    };
  }
  const normalized = normalizeDiscoveryJobError(error);
  return {
    code: normalized.code,
    retryable: normalized.retryable,
    message: normalized.message,
    eventData: { errorCode: normalized.code },
  };
}

function createDiscoveryHandler(
  dependencies: DiscoveryHandlerDependencies,
  version: 1 | typeof DISCOVERY_EXECUTION_SNAPSHOT_VERSION,
): DurableExecutionHandler<
  DurableDiscoverySnapshot,
  { stats: DiscoveryRunnerStats }
> {
  return {
    contractVersion: DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION,
    operation: DISCOVERY_EXECUTION_OPERATION,
    version,
    decode: (run) => {
      const snapshot = decodeRunSnapshot(run);
      if (snapshot.schemaVersion !== version) {
        throw new DiscoveryCommandError(
          "invalid_command_snapshot",
          "Discovery command handler version does not match its snapshot",
        );
      }
      return snapshot;
    },
    execute: async (snapshot, context) => {
      const result = await executeDiscovery(
        snapshot,
        context,
        dependencies.runSearch,
      );
      return {
        status: "completed",
        currentStep: "verify",
        output: { stats: result.stats },
        eventType: "discovery.completed",
        eventData: { stats: result.stats },
      };
    },
    classifyError: classifyDiscoveryError,
    projectTerminal: (run, snapshot) => {
      const search =
        getSearch(snapshot.slug, snapshot.searchId) ??
        saveSearch(reconstructSearchProjection(run, snapshot));
      projectTerminalRun(search, run);
    },
    reconcileTerminal: (scope, context) =>
      reconcileTerminalDiscoverySearches(scope.tenantKey, context),
  };
}

export function createPartnershipsDiscoveryWorkerHandlerV2(
  prepare: PartnershipsPrepareAssignmentEffectV2,
  assign: PartnershipsYalcAssignEffectV2,
  dependencies: Pick<
    DiscoveryWorkerDependencies,
    "deliverV2ChatCompletion"
  > = {},
  handlerVersion: PartnershipsDiscoveryHandlerVersionV2 = PARTNERSHIPS_DISCOVERY_HANDLER_VERSION_V2,
) {
  const createHandler =
    handlerVersion === PARTNERSHIPS_DISCOVERY_HANDLER_VERSION_V2_LEGACY_V3
      ? createPartnershipsDiscoveryHandlerV2LegacyV3
      : createPartnershipsDiscoveryHandlerV2;
  return createHandler(
    { prepare, assign },
    {
      projectTerminal: async (
        run: ExecutionRun,
        command: PartnershipsDiscoveryCommandV2,
      ) => {
        const snapshot = partnershipsCommandSnapshot(command);
        const search =
          getSearch(snapshot.slug, snapshot.searchId) ??
          saveSearch(reconstructSearchProjection(run, snapshot));
        projectTerminalRun(search, run);
        const current = getSearch(snapshot.slug, snapshot.searchId);
        if (
          !current ||
          current.executionControl?.runId !== run.id ||
          searchExecutionGeneration(current) !== snapshot.executionGeneration
        ) {
          return;
        }
        // The chat append is an independent, insert-only terminal receipt.
        // Always retry it for the still-current run, even when the product
        // projection was already persisted before a process crash.
        await (
          dependencies.deliverV2ChatCompletion ??
          deliverPartnershipsDiscoveryChatCompletion
        )(run);
      },
    },
  );
}

function registryFor(
  runSearch: typeof runDiscoverySearch,
  repository: ExecutionControlRepository,
  setup: DiscoveryWorkerDependencies["setup"] = {},
  v2: Pick<
    DiscoveryWorkerDependencies,
    | "prepareEffect"
    | "yalcAssignEffect"
    | "prepareEffectDependencies"
    | "yalcAssignEffectDependencies"
    | "deliverV2ChatCompletion"
  > = {},
  registerV2 = false,
): DurableExecutionRegistry {
  const prepare =
    v2.prepareEffect ??
    createPartnershipsPrepareAssignmentEffectV2(v2.prepareEffectDependencies);
  const assign =
    v2.yalcAssignEffect ??
    createPartnershipsYalcAssignEffectV2(v2.yalcAssignEffectDependencies);
  const legacyPrepare = createPartnershipsPrepareAssignmentEffectV2LegacyV3(
    v2.prepareEffectDependencies,
  );
  const legacyAssign = createPartnershipsYalcAssignEffectV2LegacyV3(
    v2.yalcAssignEffectDependencies,
  );
  const registry = new DurableExecutionRegistry()
    .register(
      createDiscoverySetupHandler(repository, {
        ...setup,
        repository,
      }),
    )
    .register(createDiscoveryHandler({ runSearch }, 1))
    .register(
      createDiscoveryHandler(
        { runSearch },
        DISCOVERY_EXECUTION_SNAPSHOT_VERSION,
      ),
    );
  return registerV2
    ? registry
        .register(
          createPartnershipsDiscoveryWorkerHandlerV2(
            legacyPrepare,
            legacyAssign,
            v2,
            PARTNERSHIPS_DISCOVERY_HANDLER_VERSION_V2_LEGACY_V3,
          ),
        )
        .register(
          createPartnershipsDiscoveryWorkerHandlerV2(prepare, assign, v2),
        )
    : registry;
}

function shouldRegisterDiscoveryV2(
  repository: ExecutionControlRepository,
  env: DiscoveryDurableWorkerEnvironment,
  dependencies: DiscoveryWorkerDependencies,
): boolean {
  return (
    typeof repository.blockRun === "function" ||
    partnershipsDiscoveryEffectsV2Requested(env) ||
    Boolean(dependencies.prepareEffect || dependencies.yalcAssignEffect)
  );
}

/** Claim and execute at most one command through the generic engine. */
export async function processNextCanaryDiscoveryRun(
  slug: string,
  dependencies: DiscoveryWorkerDependencies = {},
): Promise<boolean> {
  const env =
    dependencies.env ?? (process.env as DiscoveryDurableWorkerEnvironment);
  if (!defaultDiscoveryRuntimeMayExecute(dependencies)) return false;
  if (!isDiscoverySingleHostStoreAcknowledged(env)) return false;
  const repository = dependencies.repository ?? defaultRepository;
  const effectRepository =
    dependencies.effectRepository ?? effectRepositoryFrom(repository);
  const cancellationRepository =
    dependencies.cancellationRepository ??
    cancellationRepositoryFrom(repository);
  const enforceBootAuthority = !hasInjectedDiscoveryExecutor(dependencies);
  const engine = new DurableExecutionEngine({
    repository,
    ...(effectRepository ? { effectRepository } : {}),
    ...(cancellationRepository ? { cancellationRepository } : {}),
    capabilityPolicy: runtimeCapabilityPolicy(
      env,
      dependencies.capabilityPolicy,
    ),
    credentialProvider:
      dependencies.credentialProvider ?? createPartnershipsCredentialProvider(),
    registry: registryFor(
      dependencies.runSearch ?? runDiscoverySearch,
      repository,
      dependencies.setup,
      dependencies,
      shouldRegisterDiscoveryV2(repository, env, dependencies),
    ),
    scope: canaryScope(slug),
    workerId:
      dependencies.workerId ?? `sancho-partnerships-test-${process.pid}`,
    leaseMs: workerLeaseMs(env),
    maxAttempts: workerMaxAttempts(env),
    handlerTimeoutMs:
      resolvePartnershipsDiscoveryRuntimeContract(env).handlerTimeoutMs,
    ...(enforceBootAuthority
      ? {
          drainPolicy: createPartnershipsDefaultRuntimeDrainPolicy(
            process.env as DiscoveryDurableWorkerEnvironment,
          ),
        }
      : {}),
    now: dependencies.now,
  });
  const outcome = await engine.processNext();
  return outcome.kind !== "idle";
}

export interface PartnershipsDiscoveryCancellationDrainDependencies {
  repository?: ExecutionControlRepository;
  env?: DiscoveryDurableWorkerEnvironment;
  workerId?: string;
  now?: () => Date;
  deliverV2ChatCompletion?: typeof deliverPartnershipsDiscoveryChatCompletion;
}

export class PartnershipsDiscoveryCancellationDrainError extends Error {
  readonly code = "partnerships_discovery_cancellation_drain_refused" as const;

  constructor(readonly reason: string) {
    super(`Partnerships cancellation drain refused (${reason})`);
    this.name = "PartnershipsDiscoveryCancellationDrainError";
  }
}

/**
 * Claims one exact legacy run only after an audited cancellation marker exists.
 * Policy-only effects are intentionally unbound: even a boundary regression
 * cannot turn this operator recovery path into a provider invocation.
 */
export async function drainPartnershipsDiscoveryCancellation(
  slug: string,
  runId: string,
  dependencies: PartnershipsDiscoveryCancellationDrainDependencies = {},
): Promise<DurableExecutionOutcome> {
  const tenantKey = slug.trim().toLowerCase();
  const normalizedRunId = runId.trim();
  if (!isValidTenantSlug(tenantKey) || !normalizedRunId) {
    throw new PartnershipsDiscoveryCancellationDrainError("invalid_scope");
  }
  const repository = dependencies.repository ?? defaultRepository;
  if (
    typeof repository.getRunByIdForScope !== "function" ||
    !effectRepositoryFrom(repository) ||
    !cancellationRepositoryFrom(repository)
  ) {
    throw new PartnershipsDiscoveryCancellationDrainError(
      "repository_capability_missing",
    );
  }
  const scope = canaryScope(tenantKey);
  const run = await repository.getRunByIdForScope({
    ...scope,
    runId: normalizedRunId,
  });
  if (!run) return { kind: "idle", runId: normalizedRunId };
  if (run.status === "cancelled") {
    return { kind: "cancelled", runId: normalizedRunId };
  }
  if (
    run.status !== "running" ||
    !run.cancelRequestId ||
    !run.cancelRequestedAt ||
    run.cancelAcknowledgedAt ||
    run.metadata.authority !== "execution_ledger_v2" ||
    run.metadata.executionContractVersion !== 2 ||
    run.metadata.executionHandlerVersion !==
      PARTNERSHIPS_DISCOVERY_HANDLER_VERSION_V2_LEGACY_V3
  ) {
    throw new PartnershipsDiscoveryCancellationDrainError(
      "legacy_cancel_marker_required",
    );
  }

  const registry = new DurableExecutionRegistry().register(
    createPartnershipsDiscoveryWorkerHandlerV2(
      partnershipsDiscoveryEffectPolicyV2LegacyV3[
        PARTNERSHIPS_PREPARE_EFFECT_STEP
      ],
      partnershipsDiscoveryEffectPolicyV2LegacyV3[
        PARTNERSHIPS_YALC_ASSIGN_EFFECT_STEP
      ],
      {
        deliverV2ChatCompletion: dependencies.deliverV2ChatCompletion,
      },
      PARTNERSHIPS_DISCOVERY_HANDLER_VERSION_V2_LEGACY_V3,
    ),
  );
  const env =
    dependencies.env ?? (process.env as DiscoveryDurableWorkerEnvironment);
  const engine = new DurableExecutionEngine({
    repository,
    effectRepository: effectRepositoryFrom(repository)!,
    cancellationRepository: cancellationRepositoryFrom(repository)!,
    capabilityPolicy: partnershipsDiscoveryCapabilityPolicyV2,
    credentialProvider: {
      async resolve() {
        throw new PartnershipsDiscoveryCancellationDrainError(
          "external_capability_unbound",
        );
      },
    },
    registry,
    scope,
    workerId:
      dependencies.workerId ??
      `sancho-partnerships-cancel-${process.pid}-${normalizedRunId.slice(-8)}`,
    leaseMs: workerLeaseMs(env),
    maxAttempts: 1,
    handlerTimeoutMs:
      resolvePartnershipsDiscoveryRuntimeContract(env).handlerTimeoutMs,
    now: dependencies.now,
  });
  return engine.processRun(normalizedRunId);
}

/** Claim and execute at most one durable pre-effect setup command. */
export async function processNextCanaryDiscoverySetupRun(
  slug: string,
  dependencies: DiscoveryWorkerDependencies = {},
): Promise<boolean> {
  const env =
    dependencies.env ?? (process.env as DiscoveryDurableWorkerEnvironment);
  if (!defaultDiscoveryRuntimeMayExecute(dependencies)) return false;
  if (!isDiscoverySingleHostStoreAcknowledged(env)) return false;
  const repository = dependencies.repository ?? defaultRepository;
  const effectRepository =
    dependencies.effectRepository ?? effectRepositoryFrom(repository);
  const cancellationRepository =
    dependencies.cancellationRepository ??
    cancellationRepositoryFrom(repository);
  const enforceBootAuthority = !hasInjectedDiscoveryExecutor(dependencies);
  const engine = new DurableExecutionEngine({
    repository,
    ...(effectRepository ? { effectRepository } : {}),
    ...(cancellationRepository ? { cancellationRepository } : {}),
    capabilityPolicy: runtimeCapabilityPolicy(
      env,
      dependencies.capabilityPolicy,
    ),
    credentialProvider:
      dependencies.credentialProvider ?? createPartnershipsCredentialProvider(),
    registry: registryFor(
      dependencies.runSearch ?? runDiscoverySearch,
      repository,
      dependencies.setup,
      dependencies,
      shouldRegisterDiscoveryV2(repository, env, dependencies),
    ),
    scope: canarySetupScope(slug),
    workerId:
      dependencies.workerId ?? `sancho-partnerships-setup-test-${process.pid}`,
    leaseMs: workerLeaseMs(env),
    maxAttempts: workerMaxAttempts(env),
    ...(enforceBootAuthority
      ? {
          drainPolicy: createPartnershipsDefaultRuntimeDrainPolicy(
            process.env as DiscoveryDurableWorkerEnvironment,
          ),
        }
      : {}),
    now: dependencies.now,
  });
  const outcome = await engine.processNext();
  return outcome.kind !== "idle";
}

async function reconcileTerminalDiscoverySearches(
  slug: string,
  context: DurableExecutionReconciliationContext,
): Promise<number> {
  let repaired = cleanupExpiredDiscoveryAssignmentArtifacts(
    slug,
    context.now(),
  );
  for (const searchId of listSearchIds(slug)) {
    let search = getSearch(slug, searchId);
    let run: ExecutionRun | null = null;
    if (!search) {
      run = await context.getRunByAggregate({
        aggregateType: DISCOVERY_EXECUTION_AGGREGATE,
        aggregateId: discoveryExecutionAggregateId(slug, searchId),
      });
      if (!run || run.mode !== "canary") continue;
      let snapshot: DurableDiscoverySnapshot;
      try {
        snapshot = decodeRunSnapshot(run);
      } catch {
        continue;
      }
      search = saveSearch(reconstructSearchProjection(run, snapshot));
      repaired += 1;
    }
    const executionControl = search.executionControl;
    if (search.archivedAt || executionControl?.mode !== "canary") {
      continue;
    }
    run ??= executionControl.runId
      ? await context.getRunById(executionControl.runId)
      : await context.getRunByAggregate({
          aggregateType: DISCOVERY_EXECUTION_AGGREGATE,
          aggregateId: discoveryExecutionAggregateId(slug, search.id),
        });
    if (run && projectTerminalRun(search, run)) repaired += 1;
  }
  return repaired;
}

/**
 * Repair producer admission and product projection after a process crash.
 * Runtime handlers only receive read-only Ledger reconciliation capabilities;
 * the producer repair remains explicitly outside the handler boundary.
 */
export async function reconcileCanaryDiscoverySearches(
  slug: string,
  dependencies: Pick<DiscoveryWorkerDependencies, "repository" | "env"> = {},
): Promise<string[]> {
  const env =
    dependencies.env ?? (process.env as DiscoveryDurableWorkerEnvironment);
  if (
    !dependencies.repository &&
    !isPartnershipsDurableWorkerBootEnabled(
      process.env as DiscoveryDurableWorkerEnvironment,
    )
  ) {
    return [];
  }
  const policy = resolveDiscoveryExecutionPolicy(slug, env);
  if (!policy.enabled || policy.mode !== "canary") return [];
  const repository = dependencies.repository ?? defaultRepository;
  const repaired = new Set<string>();
  for (const searchId of listSearchIds(slug)) {
    let search = getSearch(slug, searchId);
    if (!search) {
      const run = await repository.getRunByAggregate({
        tenantKey: slug,
        aggregateType: DISCOVERY_EXECUTION_AGGREGATE,
        aggregateId: discoveryExecutionAggregateId(slug, searchId),
        operation: DISCOVERY_EXECUTION_OPERATION,
      });
      if (!run || run.mode !== "canary") continue;
      let snapshot: DurableDiscoverySnapshot;
      try {
        snapshot = decodeRunSnapshot(run);
      } catch {
        continue;
      }
      search = saveSearch(reconstructSearchProjection(run, snapshot));
      repaired.add(searchId);
    }
    const executionControl = search.executionControl;
    if (search.archivedAt || executionControl?.mode !== "canary") {
      continue;
    }
    if (!search.executionModelConfig) {
      const effective = await getEffectiveModelConfig(slug);
      search = saveSearch({
        ...search,
        executionModelConfig: JSON.parse(JSON.stringify(effective.config)),
      });
      repaired.add(search.id);
    }
    if (!executionControl.generation) {
      search = saveSearch({
        ...search,
        executionControl: {
          ...executionControl,
          generation: searchExecutionGeneration(search),
        },
      });
      repaired.add(search.id);
    }
    const result = await observeDiscoveryExecutionCreated(search, {
      repository,
      env,
    });
    if (!result.recorded || !result.runId) continue;
    if (
      search.executionControl?.runId !== result.runId ||
      (result.commandFingerprint &&
        search.executionControl?.commandFingerprint !==
          result.commandFingerprint)
    ) {
      const bound = bindSearchExecutionRun(slug, search.id, {
        generation: searchExecutionGeneration(search),
        runId: result.runId,
        commandFingerprint: result.commandFingerprint,
      });
      search = bound.search;
      if (bound.applied) repaired.add(search.id);
    }
    const run = await repository.getRunById(result.runId);
    if (run && run.mode === "canary" && projectTerminalRun(search, run)) {
      repaired.add(search.id);
    }
  }
  return [...repaired];
}

interface DiscoveryRunRequestDependencies {
  repository?: ExecutionControlRepository;
  env?: DiscoveryDurableWorkerEnvironment;
}

function durableRetryConflict(message: string): DiscoveryRetryConflictError {
  return new DiscoveryRetryConflictError(
    "DISCOVERY_DURABLE_RETRY_CONFLICT",
    message,
  );
}

async function exactLinkedDiscoveryRun(
  search: DiscoverySearchRecord,
  repository: ExecutionControlRepository,
): Promise<{ run: ExecutionRun; snapshot: DurableDiscoverySnapshot }> {
  const control = search.executionControl;
  if (
    control?.mode !== "canary" ||
    !control.runId ||
    !control.commandFingerprint
  ) {
    throw durableRetryConflict(
      "The durable discovery receipt is incomplete and requires repair",
    );
  }
  if (!repository.getRunByIdForScope) {
    throw durableRetryConflict("Scoped durable retry lookup is unavailable");
  }
  const run = await repository.getRunByIdForScope({
    ...canaryScope(search.slug),
    runId: control.runId,
  });
  if (!run) {
    throw durableRetryConflict(
      "The linked durable discovery run was not found in its exact scope",
    );
  }
  if (
    run.tenantKey.trim().toLowerCase() !== search.slug.trim().toLowerCase() ||
    run.operation !== DISCOVERY_EXECUTION_OPERATION ||
    run.mode !== "canary" ||
    run.aggregateType !== DISCOVERY_EXECUTION_AGGREGATE ||
    run.aggregateId !== discoveryExecutionAggregateId(search.slug, search.id) ||
    !run.commandFingerprint ||
    run.commandFingerprint !== control.commandFingerprint
  ) {
    throw durableRetryConflict(
      "The linked durable discovery run does not match this command",
    );
  }
  let snapshot: DurableDiscoverySnapshot;
  try {
    snapshot = decodeRunSnapshot(run);
  } catch {
    throw durableRetryConflict(
      "The linked durable discovery command snapshot is invalid",
    );
  }
  if (
    snapshot.searchId !== search.id ||
    snapshot.executionGeneration !== searchExecutionGeneration(search)
  ) {
    throw durableRetryConflict(
      "The durable discovery generation does not match its linked run",
    );
  }
  return { run, snapshot };
}

function repairedCompletedSearch(
  current: DiscoverySearchRecord,
  run: ExecutionRun,
): DiscoverySearchRecord {
  projectTerminalRun(current, run);
  const repaired = getSearch(current.slug, current.id);
  if (
    repaired?.executionControl?.runId !== run.id ||
    searchExecutionGeneration(repaired) !==
      searchExecutionGeneration(current) ||
    repaired.runner.status !== "done"
  ) {
    throw durableRetryConflict(
      "The completed durable run could not repair its product receipt",
    );
  }
  return repaired;
}

/** Durable retry/enqueue boundary used by APIs and MCP in canary mode. */
export async function requestDiscoverySearchRun(
  options: {
    slug: string;
    searchId: string;
    fixtures?: boolean;
  },
  dependencies: DiscoveryRunRequestDependencies = {},
): Promise<DiscoverySearchRecord> {
  const current = getSearch(options.slug, options.searchId);
  if (!current) {
    throw new Error(
      `Discovery search not found: ${options.searchId} (${options.slug})`,
    );
  }
  const env =
    dependencies.env ?? (process.env as DiscoveryDurableWorkerEnvironment);
  const policy = resolveDiscoveryExecutionPolicy(options.slug, env);
  const defaultBootEnabled =
    Boolean(dependencies.repository) ||
    isPartnershipsDurableWorkerBootEnabled(
      process.env as DiscoveryDurableWorkerEnvironment,
    );
  if (
    policy.enabled &&
    policy.mode === "canary" &&
    !defaultBootEnabled &&
    !isDiscoveryLedgerAuthoritative(current)
  ) {
    throw new DiscoveryDurableAuthorityError(
      "Durable Partnerships discovery admission requires its worker boot flag",
    );
  }
  if (!policy.enabled || policy.mode !== "canary") {
    if (isDiscoveryLedgerAuthoritative(current)) {
      throw new DiscoveryDurableAuthorityError();
    }
    const { enqueueDiscoverySearchRun } = await import("./discovery-jobs");
    return enqueueDiscoverySearchRun(options);
  }

  if (current.archivedAt) {
    throw new Error(`Discovery search is archived: ${options.searchId}`);
  }
  const repository = dependencies.repository ?? defaultRepository;
  let durableRetry:
    { run: ExecutionRun; snapshot: DurableDiscoverySnapshot } | undefined;
  if (isDiscoveryLedgerAuthoritative(current)) {
    durableRetry = await exactLinkedDiscoveryRun(current, repository);
    switch (durableRetry.run.status) {
      case "queued":
      case "running":
      case "waiting_approval":
        return current;
      case "completed":
        return repairedCompletedSearch(current, durableRetry.run);
      case "cancelled":
        throw new DiscoveryRetryConflictError(
          "DISCOVERY_DURABLE_CANCELLED",
          "A cancelled discovery requires an explicit new product action",
        );
      case "failed":
      case "partial":
        if (!defaultBootEnabled) {
          throw new DiscoveryDurableAuthorityError(
            "Durable Partnerships discovery retry is paused while its worker boot flag is disabled",
          );
        }
        break;
    }
  } else if (current.runner.status === "done") {
    return current;
  }
  if (current.executionIntent === "none") {
    throw new Error("Deferred discovery commands cannot be started by retry");
  }

  // A new generation freezes a fresh effective model config. The filesystem
  // CAS makes one concurrent retry the generation owner; all losers reuse the
  // exact winner projection and idempotency key.
  const effective = await getEffectiveModelConfig(options.slug);
  const frozenConfig = JSON.parse(
    JSON.stringify(effective.config),
  ) as CreatorModelConfig;
  let generation: number;
  let queued: DiscoverySearchRecord;
  if (durableRetry) {
    const expectedGeneration = durableRetry.snapshot.executionGeneration;
    const attempts = Math.max(1, durableRetry.snapshot.attempt) + 1;
    const advanced = advanceSearchExecutionGeneration(
      options.slug,
      options.searchId,
      {
        runId: durableRetry.run.id,
        generation: expectedGeneration,
        commandFingerprint: durableRetry.run.commandFingerprint!,
      },
      (search) => ({
        ...search,
        executionModelConfig: frozenConfig,
        executionControl: {
          mode: "canary",
          admittedAt: new Date().toISOString(),
          generation: expectedGeneration + 1,
        },
        runner: {
          ...search.runner,
          status: "queued",
          mode: options.fixtures ? "fixtures" : "live",
          jobId: discoveryJobId(options.searchId),
          attempts,
          queuedAt: new Date().toISOString(),
          startedAt: null,
          finishedAt: null,
          error: null,
          errorCode: null,
          retryable: false,
          stats: null,
        },
      }),
    );
    generation = expectedGeneration + 1;
    queued = advanced.search;
    if (searchExecutionGeneration(queued) !== generation) {
      throw durableRetryConflict(
        "A different durable discovery generation won the retry race",
      );
    }
    // A concurrent request may already have attached the winner. Validate and
    // return it instead of trying to create or replace another generation.
    if (queued.executionControl?.runId) {
      await exactLinkedDiscoveryRun(queued, repository);
      return queued;
    }
  } else {
    generation = 1;
    const attempts =
      current.runner.status === "error"
        ? Math.max(0, current.runner.attempts ?? 0) + 1
        : Math.max(1, current.runner.attempts ?? 1);
    queued = saveSearch({
      ...current,
      executionModelConfig: frozenConfig,
      executionControl: {
        mode: "canary",
        admittedAt: new Date().toISOString(),
        generation,
      },
      runner: {
        ...current.runner,
        status: "queued",
        mode: options.fixtures ? "fixtures" : "live",
        jobId: discoveryJobId(options.searchId),
        attempts,
        queuedAt: new Date().toISOString(),
        startedAt: null,
        finishedAt: null,
        error: null,
        errorCode: null,
        retryable: false,
        stats: null,
      },
    });
  }

  let observation;
  try {
    observation = await observeDiscoveryExecutionCreated(queued, {
      repository,
      env,
    });
  } catch (error) {
    if (
      error instanceof ExecutionCommandConflictError ||
      (error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "execution_command_conflict")
    ) {
      throw durableRetryConflict(
        "The durable retry idempotency key belongs to another command",
      );
    }
    throw error;
  }
  if (
    !observation.recorded ||
    !observation.runId ||
    !observation.commandFingerprint
  ) {
    throw new DiscoveryDurableAuthorityError(
      "The durable Ledger did not return a complete execution receipt",
    );
  }
  const bound = bindSearchExecutionRun(options.slug, options.searchId, {
    generation,
    runId: observation.runId,
    commandFingerprint: observation.commandFingerprint,
  });
  queued = bound.search;
  if (
    queued.executionControl?.runId !== observation.runId ||
    queued.executionControl.commandFingerprint !==
      observation.commandFingerprint
  ) {
    throw durableRetryConflict(
      "A different durable discovery command won the binding race",
    );
  }
  queued = updateRunnerStateForExecution(
    options.slug,
    options.searchId,
    { generation, runId: observation.runId },
    {
      jobId: stableExternalIdempotencyKey(observation.runId),
    },
  ).search;
  if (!dependencies.repository && !dependencies.env) {
    wakeCanaryDiscoveryWorker(options.slug);
  }
  return queued;
}

function createRuntimeBundle(
  repository: ExecutionControlRepository,
  env: DiscoveryDurableWorkerEnvironment,
  dependencies: DiscoveryWorkerDependencies = {},
): RuntimeBundle {
  const enforceBootAuthority = repository === defaultRepository;
  const supervisorRef: { current?: DurableExecutionScopeSupervisor } = {};
  const configuredWakeDiscovery = dependencies.setup?.wakeDiscovery;
  const registry = registryFor(
    dependencies.runSearch ?? runDiscoverySearch,
    repository,
    {
      ...dependencies.setup,
      wakeDiscovery: async (slug) => {
        try {
          await configuredWakeDiscovery?.(slug);
        } finally {
          const scope = canaryScope(slug);
          const currentSupervisor = supervisorRef.current;
          if (
            currentSupervisor &&
            partnershipsScopeAllowance(scope, env).allowed
          ) {
            currentSupervisor.wakeOrScan(scope);
          }
        }
      },
    },
    dependencies,
    shouldRegisterDiscoveryV2(repository, env, dependencies),
  );
  const effectRepository =
    dependencies.effectRepository ?? effectRepositoryFrom(repository);
  const cancellationRepository =
    dependencies.cancellationRepository ??
    cancellationRepositoryFrom(repository);
  const runtime = new DurableExecutionRuntime({
    repository,
    ...(effectRepository ? { effectRepository } : {}),
    ...(cancellationRepository ? { cancellationRepository } : {}),
    capabilityPolicy: runtimeCapabilityPolicy(
      env,
      dependencies.capabilityPolicy,
    ),
    credentialProvider:
      dependencies.credentialProvider ?? createPartnershipsCredentialProvider(),
    registry,
    leaseMs: workerLeaseMs(env),
    pollMs: workerPollMs(env),
    maxAttempts: workerMaxAttempts(env),
    maxClaimsPerDrain: DEFAULT_MAX_CLAIMS_PER_DRAIN,
    ...(enforceBootAuthority
      ? {
          drainPolicy: createPartnershipsDefaultRuntimeDrainPolicy(env),
        }
      : {}),
    workerIdPrefix: "sancho-partnerships",
    logError: dependencies.logError,
    scheduler: dependencies.runtimeScheduler,
    now: dependencies.now,
    capacityLimiter: dependencies.capacityLimiter,
  });
  const supervisor = new DurableExecutionScopeSupervisor({
    repository: scopeDiscoveryRepository(repository),
    registry,
    runtime,
    modes: ["canary"],
    intervalMs: scopeRescanMs(env),
    scheduler: dependencies.scopeScheduler,
    now: dependencies.now,
    isValidTenantKey: (tenantKey) => isValidTenantSlug(tenantKey),
    allowScope: (scope) => partnershipsScopeAllowance(scope, env),
    onError: ({ code }) => {
      try {
        (dependencies.logError ?? console.error)(
          `[partnerships] durable scope scan failed (${code})`,
        );
      } catch {
        // Readiness remains authoritative if the logging sink fails.
      }
    },
  });
  supervisorRef.current = supervisor;
  return { repository, env, registry, runtime, supervisor };
}

function getOrCreateDefaultRuntimeBundle(): RuntimeBundle {
  if (!runtimeGlobal.__sanchoPartnershipsDiscoveryDurableRuntime) {
    const env = process.env as DiscoveryDurableWorkerEnvironment;
    runtimeGlobal.__sanchoPartnershipsDiscoveryDurableRuntime =
      createRuntimeBundle(defaultRepository, env);
  }
  return runtimeGlobal.__sanchoPartnershipsDiscoveryDurableRuntime;
}

async function shutdownRuntimeBundle(bundle: RuntimeBundle): Promise<void> {
  try {
    await bundle.supervisor.shutdown();
  } finally {
    await bundle.runtime.shutdown();
  }
}

function ensureRuntimeScope(scope: ExecutionLeaseScope): boolean {
  const bundle = runtimeGlobal.__sanchoPartnershipsDiscoveryDurableRuntime;
  const env = bundle?.env ?? (process.env as DiscoveryDurableWorkerEnvironment);
  if (
    !isPartnershipsDurableWorkerBootEnabled(
      process.env as DiscoveryDurableWorkerEnvironment,
    )
  ) {
    // Boot authority is a hot suspension gate, not an abort signal. An
    // already-started effect may finish; the runtime policy prevents its
    // worker from claiming the next receipt.
    return false;
  }
  if (!partnershipsScopeAllowance(scope, env).allowed) return false;
  if (bundle) return bundle.supervisor.wakeOrScan(scope);
  void startCanaryDiscoveryWorkers()
    .then(() => {
      runtimeGlobal.__sanchoPartnershipsDiscoveryDurableRuntime?.supervisor.wakeOrScan(
        scope,
      );
    })
    .catch(() => {
      // Startup/scan failure is reflected in supervisor readiness once a
      // bundle exists; the durable receipt remains discoverable in Postgres.
    });
  return false;
}

/** Called after a durable receipt exists. This is only a latency hint. */
export function wakeCanaryDiscoveryWorker(slug: string): void {
  ensureRuntimeScope(canaryScope(slug));
}

/** Wake the setup worker after its durable command exists. */
export function wakeCanaryDiscoverySetupWorker(slug: string): void {
  ensureRuntimeScope(canarySetupScope(slug));
}

async function reconcileConfiguredDiscoveryTenants(
  bundle: RuntimeBundle,
  tenants: readonly string[],
  logError?: (message: string) => void,
): Promise<void> {
  for (const slug of tenants) {
    try {
      await reconcileCanaryDiscoverySearches(slug, {
        repository: bundle.repository,
        env: bundle.env,
      });
    } catch (error) {
      try {
        (logError ?? console.error)(
          `[partnerships] durable discovery admission repair failed (${safeErrorName(error)})`,
        );
      } catch {
        // Reconciliation remains best-effort; durable polling continues.
      }
    }
  }
  try {
    await bundle.supervisor.scan();
  } catch {
    // Supervisor readiness already contains the sanitized scan failure.
  }
}

/**
 * Start exact-scope generic workers from Next's Node instrumentation hook.
 * Injected dependencies create an isolated bundle; tests should inject the
 * manual scope scheduler so no process-global runtime or live timer is used.
 */
export async function startCanaryDiscoveryWorkers(
  dependencies: DiscoveryWorkerDependencies = {},
): Promise<string[]> {
  const hasOverrideWithoutRepository = Object.entries(dependencies).some(
    ([key, value]) => key !== "repository" && value !== undefined,
  );
  if (!dependencies.repository && hasOverrideWithoutRepository) {
    throw new DiscoveryDurableWorkerConfigurationError();
  }
  const env =
    dependencies.env ?? (process.env as DiscoveryDurableWorkerEnvironment);
  const useDefaultBundle = !dependencies.repository;
  const runtimeRepository = dependencies.repository ?? defaultRepository;
  return serializeRuntimeBundleLifecycle(runtimeRepository, async () => {
    if (useDefaultBundle && !isPartnershipsDurableWorkerBootEnabled(env)) {
      // Keep an existing bundle alive but quiescent. `stop()` is abortive and
      // could misrepresent an already-started provider effect as interrupted.
      return [];
    }
    let bundle: RuntimeBundle;
    if (useDefaultBundle) {
      bundle = getOrCreateDefaultRuntimeBundle();
    } else {
      const previous = injectedRuntimeBundles.get(runtimeRepository);
      if (previous) {
        try {
          await shutdownRuntimeBundle(previous);
        } finally {
          if (injectedRuntimeBundles.get(runtimeRepository) === previous) {
            injectedRuntimeBundles.delete(runtimeRepository);
          }
        }
      }
      bundle = createRuntimeBundle(runtimeRepository, env, dependencies);
      injectedRuntimeBundles.set(runtimeRepository, bundle);
    }
    try {
      await bundle.supervisor.start();
    } catch (error) {
      try {
        await shutdownRuntimeBundle(bundle);
      } finally {
        if (useDefaultBundle) {
          if (
            runtimeGlobal.__sanchoPartnershipsDiscoveryDurableRuntime === bundle
          ) {
            delete runtimeGlobal.__sanchoPartnershipsDiscoveryDurableRuntime;
          }
        } else if (injectedRuntimeBundles.get(runtimeRepository) === bundle) {
          injectedRuntimeBundles.delete(runtimeRepository);
        }
      }
      throw error;
    }

    const configuredTenants =
      configuredDiscoveryExecutionSlugs(env).filter(isValidTenantSlug);
    // Product reconciliation may create a missing exact receipt. A follow-up
    // supervisor scan starts only that receipt's operation, never a tenant ×
    // operation cross-product.
    if (configuredTenants.length > 0) {
      void reconcileConfiguredDiscoveryTenants(
        bundle,
        configuredTenants,
        dependencies.logError,
      );
    }

    // Preserve the historical return contract (configured/recovered tenants),
    // while worker creation itself remains exact-scope only.
    const tenants = new Set(configuredTenants);
    for (const worker of bundle.runtime.readiness()) {
      tenants.add(worker.scope.tenantKey);
    }
    return [...tenants].sort();
  });
}

/** Redacted in-memory worker readiness for an admin/health adapter. */
export function getCanaryDiscoveryWorkerReadiness(
  repository?: ExecutionControlRepository,
): DurableExecutionWorkerReadiness[] {
  return getCanaryDiscoveryRuntimeReadiness(repository)?.workers ?? [];
}

/** Generic supervisor + exact-worker readiness; contains no command payloads. */
export function getCanaryDiscoveryRuntimeReadiness(
  repository?: ExecutionControlRepository,
): DurableExecutionScopeSupervisorReadiness | undefined {
  const bundle = repository
    ? injectedRuntimeBundles.get(repository)
    : runtimeGlobal.__sanchoPartnershipsDiscoveryDurableRuntime;
  return bundle?.supervisor.readiness();
}

/** Test/shutdown hook; optionally targets one isolated injected repository. */
export async function stopCanaryDiscoveryWorkers(
  repository?: ExecutionControlRepository,
): Promise<void> {
  if (repository) {
    return serializeRuntimeBundleLifecycle(repository, async () => {
      const injected = injectedRuntimeBundles.get(repository);
      if (!injected) return;
      try {
        await shutdownRuntimeBundle(injected);
      } finally {
        if (injectedRuntimeBundles.get(repository) === injected) {
          injectedRuntimeBundles.delete(repository);
        }
      }
    });
  }
  return serializeRuntimeBundleLifecycle(defaultRepository, async () => {
    const bundle = runtimeGlobal.__sanchoPartnershipsDiscoveryDurableRuntime;
    if (!bundle) return;
    try {
      await shutdownRuntimeBundle(bundle);
    } finally {
      if (
        runtimeGlobal.__sanchoPartnershipsDiscoveryDurableRuntime === bundle
      ) {
        delete runtimeGlobal.__sanchoPartnershipsDiscoveryDurableRuntime;
      }
    }
  });
}
