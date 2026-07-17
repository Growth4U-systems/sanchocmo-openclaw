import { createHash } from "node:crypto";
import { getDb } from "@/db/drizzle";
import {
  PostgresExecutionControlRepository,
  type ExecutionCancellationControlRepository,
  type ExecutionCancellationReceipt,
  type ExecutionControlRepository,
  type ExecutionEffectControlRepository,
  type ExecutionLeaseScope,
  type ExecutionRun,
  type ExecutionTerminalProjectionControlRepository,
} from "@/lib/execution-control";
import {
  ExecutionCancellationConflictError,
  ExecutionCommandConflictError,
} from "@/lib/execution-control/types";
import {
  DurableExecutionAdmissionError,
  DurableExecutionEngine,
  DurableExecutionRegistry,
  DurableExecutionRuntime,
  DurableExecutionScopeSupervisor,
  DurableJsonValidationError,
  admitDurableExecutionV2,
  parseDurableJsonContractValue,
  type CapabilityCredentialProvider,
  type DurableCapabilityPolicy,
  type DurableExecutionScheduler,
  type DurableExecutionScopeSupervisorReadiness,
  type DurableExecutionScopeSupervisorScheduler,
  type DurableExecutionTerminalProjectionContext,
  type DurableExecutionWorkerCapacityLimiter,
  type DurableExecutionOrigin,
} from "@/lib/durable-execution";
import { isDurableWorkerBootEnabled } from "@/lib/runtime/durable-worker-boot-plan";
import { isValidTenantSlug } from "@/lib/thread-id";
import {
  createLeadsApolloCredentialProvider,
  createLeadsApolloPeopleSearchEffect,
  type LeadsApolloApiKeyResolver,
} from "./search-apollo-binding";
import {
  LEADS_APOLLO_CAPABILITY,
  LEADS_SEARCH_AGGREGATE_TYPE,
  LEADS_SEARCH_HANDLER_VERSION,
  LEADS_SEARCH_MAX_RESULTS,
  LEADS_SEARCH_OPERATION,
  createLeadsSearchHandlerV2,
  leadsSearchCommandContractV2,
  leadsSearchResultContractV2,
  type LeadsApolloPeopleSearchEffect,
  type LeadsSearchCommandV2,
  type LeadsSearchCriteriaV2,
  type LeadsSearchResultV2,
  type LeadsSearchTerminalProjector,
} from "./search-contract-v2";
import { PostgresLeadsSearchProjectionRepository } from "./search-projection-postgres";
import {
  normalizeLeadsSearchProjectedResultV2,
  type LeadsSearchProjectedResultV2,
  type LeadsSearchProjectionRepository,
  type LeadsSearchProjectionTerminalStatus,
} from "./search-projection";
import {
  deliverLeadsSearchChatCompletion,
  type LeadsSearchChatCompletionDeliverer,
} from "./search-chat-completion";

const DEFAULT_LEASE_MS = 60_000;
const DEFAULT_POLL_MS = 5_000;
const DEFAULT_SCOPE_RESCAN_MS = 30_000;
const MAX_RAW_REQUEST_ID_BYTES = 256;
const MAX_ACTOR_ID_BYTES = 128;

export interface LeadsSearchEnvironment {
  /** Exact `1` is the independent authority to run the default Search worker. */
  LEADS_SEARCH_DURABLE_WORKER_BOOT_ENABLED?: string;
  /** Off by default. Only the exact value `canary` permits new admission. */
  LEADS_SEARCH_EXECUTION_V2?: string;
  /** Exact comma-separated tenant slugs. Wildcards are never accepted. */
  LEADS_SEARCH_V2_SLUGS?: string;
  LEADS_SEARCH_WORKER_LEASE_MS?: string;
  LEADS_SEARCH_WORKER_POLL_MS?: string;
  LEADS_SEARCH_SCOPE_RESCAN_MS?: string;
  /** Resolved only at effect invocation and never persisted in the Ledger. */
  APOLLO_API_KEY?: string;
}

export interface LeadsSearchRolloutPolicy {
  mode: "off" | "canary";
  enabled: boolean;
  reason:
    | "disabled"
    | "invalid_mode"
    | "invalid_allowlist"
    | "invalid_tenant"
    | "slug_not_allowlisted"
    | "enabled";
}

export class LeadsSearchError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "LeadsSearchError";
  }
}

export class LeadsSearchWorkerConfigurationError extends Error {
  readonly code = "leads_search_worker_repository_required" as const;

  constructor() {
    super("Leads search worker overrides require an explicit repository");
    this.name = "LeadsSearchWorkerConfigurationError";
  }
}

function isLeadsSearchDefaultRuntimeEnabled(
  env: LeadsSearchEnvironment,
): boolean {
  return isDurableWorkerBootEnabled(
    env.LEADS_SEARCH_DURABLE_WORKER_BOOT_ENABLED,
  );
}

function runtimeDisabledError(): LeadsSearchError {
  return new LeadsSearchError(
    "leads_search_runtime_disabled",
    "Native Leads search runtime is disabled",
    503,
  );
}

interface LeadsSearchAdmissionBase {
  slug: string;
  criteria: LeadsSearchCriteriaV2 | Record<string, unknown>;
  limit: number;
  traceId?: string;
}

export type AdmitLeadsSearchInput = LeadsSearchAdmissionBase &
  (
    | { requestId: string; idempotencyKey?: never }
    | { idempotencyKey: string; requestId?: never }
  );

export interface LeadsSearchAdmissionReceipt {
  ok: true;
  operation: typeof LEADS_SEARCH_OPERATION;
  runId: string;
  status: ExecutionRun["status"];
  created: boolean;
  replayed: boolean;
  completionBoundary: "ledger_admitted" | "search_completed";
  statusUrl: string;
  result?: LeadsSearchResultV2;
}

export interface LeadsSearchStatusInput {
  slug: string;
  runId: string;
}

export interface LeadsSearchStatusReceipt {
  ok: true;
  operation: typeof LEADS_SEARCH_OPERATION;
  runId: string;
  status: ExecutionRun["status"];
  completionBoundary: "ledger_admitted" | "search_completed";
  statusUrl: string;
  result?: LeadsSearchResultV2;
}

export interface LeadsSearchCancellationInput {
  slug: string;
  runId: string;
  requestId: string;
  actorId: string;
}

export interface LeadsSearchCancellationReceipt {
  ok: true;
  operation: typeof LEADS_SEARCH_OPERATION;
  runId: string;
  status: ExecutionRun["status"];
  disposition: ExecutionCancellationReceipt["disposition"];
  replayed: boolean;
  statusUrl: string;
}

export interface LeadsSearchAdmissionDependencies {
  repository?: ExecutionControlRepository;
  env?: LeadsSearchEnvironment;
  wake?: (slug: string) => void;
  capabilityPolicy?: DurableCapabilityPolicy;
  apolloPeopleSearchEffect?: LeadsApolloPeopleSearchEffect;
  projectTerminal?: LeadsSearchTerminalProjector;
  productProjectionRepository?: LeadsSearchProjectionRepository;
  deliverChat?: LeadsSearchChatCompletionDeliverer;
  /** Server-attested asynchronous result destination; never public input. */
  trustedOrigin?: DurableExecutionOrigin;
  /**
   * Server-owned one-command-per-parent gate. It runs only after rollout and
   * readiness checks, immediately before the first Ledger admission.
   */
  beforeLedgerAdmission?: () => Promise<void>;
}

export interface LeadsSearchReadDependencies {
  repository?: ExecutionControlRepository;
}

export interface LeadsSearchWorkerDependencies extends LeadsSearchAdmissionDependencies {
  effectRepository?: ExecutionEffectControlRepository;
  cancellationRepository?: ExecutionCancellationControlRepository;
  projectionRepository?: ExecutionTerminalProjectionControlRepository;
  credentialProvider?: CapabilityCredentialProvider;
  resolveApolloApiKey?: LeadsApolloApiKeyResolver;
  workerId?: string;
  runtimeScheduler?: DurableExecutionScheduler;
  scopeScheduler?: DurableExecutionScopeSupervisorScheduler;
  capacityLimiter?: DurableExecutionWorkerCapacityLimiter;
  logError?: (message: string) => void;
  now?: () => Date;
}

interface LeadsSearchRuntimeBundle {
  repository: ExecutionControlRepository;
  registry: DurableExecutionRegistry;
  runtime: DurableExecutionRuntime;
  supervisor: DurableExecutionScopeSupervisor;
}

export interface LeadsSearchStartupEvidence {
  state: "not_started" | "starting" | "ready" | "failed" | "stopped";
  lastAttemptAt?: string;
  lastSuccessAt?: string;
  lastError?: { code: string; at: string };
}

export interface LeadsSearchOperationalReadiness {
  acceptsNewAdmissions: boolean;
  rolloutReady: boolean;
  enabledTenantCount: number;
  credentialBindingReady: boolean;
  startup: LeadsSearchStartupEvidence;
  supervisor?: DurableExecutionScopeSupervisorReadiness;
}

type LeadsSearchRuntimeGlobal = typeof globalThis & {
  __sanchoLeadsSearchDurableRuntime?: LeadsSearchRuntimeBundle;
  __sanchoLeadsSearchStartupEvidence?: LeadsSearchStartupEvidence;
};

const runtimeGlobal = globalThis as LeadsSearchRuntimeGlobal;
const defaultRepository = new PostgresExecutionControlRepository();
let defaultProductProjectionRepository:
  LeadsSearchProjectionRepository | undefined;
const injectedRuntimeBundles = new WeakMap<
  ExecutionControlRepository,
  LeadsSearchRuntimeBundle
>();
const injectedStartupEvidence = new WeakMap<
  ExecutionControlRepository,
  LeadsSearchStartupEvidence
>();
const runtimeBundleLifecycle = new WeakMap<
  ExecutionControlRepository,
  Promise<void>
>();

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function utf8Bytes(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function safeStartupErrorCode(error: unknown): string {
  const explicit =
    error && typeof error === "object" && "code" in error
      ? text((error as { code?: unknown }).code).toLowerCase()
      : "";
  return /^[a-z][a-z0-9._-]{0,95}$/.test(explicit)
    ? explicit
    : "leads_search_startup_failed";
}

function startupEvidenceFor(
  repository: ExecutionControlRepository,
  useDefaultBundle: boolean,
): LeadsSearchStartupEvidence {
  if (useDefaultBundle) {
    return (
      runtimeGlobal.__sanchoLeadsSearchStartupEvidence ?? {
        state: "not_started",
      }
    );
  }
  return injectedStartupEvidence.get(repository) ?? { state: "not_started" };
}

function setStartupEvidence(
  repository: ExecutionControlRepository,
  useDefaultBundle: boolean,
  evidence: LeadsSearchStartupEvidence,
): void {
  const frozen = Object.freeze({
    ...evidence,
    ...(evidence.lastError
      ? { lastError: Object.freeze({ ...evidence.lastError }) }
      : {}),
  });
  if (useDefaultBundle) {
    runtimeGlobal.__sanchoLeadsSearchStartupEvidence = frozen;
  } else {
    injectedStartupEvidence.set(repository, frozen);
  }
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

function canonicalTenant(value: unknown): string {
  const slug = text(value).toLowerCase();
  if (!isValidTenantSlug(slug) || !/^[a-z0-9][a-z0-9-]{0,119}$/.test(slug)) {
    throw new LeadsSearchError(
      "invalid_tenant",
      "Leads search requires an exact tenant slug",
      400,
    );
  }
  return slug;
}

function canonicalRunId(value: unknown): string {
  const runId = text(value);
  if (
    !runId ||
    utf8Bytes(runId) > 200 ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/.test(runId)
  ) {
    throw new LeadsSearchError(
      "invalid_run_id",
      "A bounded Leads search run id is required",
      400,
    );
  }
  return runId;
}

function canonicalRawRequestId(value: unknown): string {
  const requestId = text(value);
  if (
    !requestId ||
    utf8Bytes(requestId) > MAX_RAW_REQUEST_ID_BYTES ||
    !/^[A-Za-z0-9][A-Za-z0-9:._@/+~-]*$/.test(requestId)
  ) {
    throw new LeadsSearchError(
      "invalid_idempotency_key",
      "A bounded request id is required for Leads search",
      400,
    );
  }
  return requestId;
}

function requestIdFrom(input: AdmitLeadsSearchInput): string {
  const requestId = text(input.requestId);
  const idempotencyKey = text(input.idempotencyKey);
  if (Boolean(requestId) === Boolean(idempotencyKey)) {
    throw new LeadsSearchError(
      "invalid_idempotency_key",
      "Provide exactly one requestId or idempotencyKey",
      400,
    );
  }
  return canonicalRawRequestId(requestId || idempotencyKey);
}

function canonicalActorId(value: unknown): string {
  const actorId = text(value);
  if (
    !actorId ||
    utf8Bytes(actorId) > MAX_ACTOR_ID_BYTES ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@-]*$/.test(actorId)
  ) {
    throw new LeadsSearchError(
      "invalid_actor_id",
      "A bounded opaque actor id is required",
      400,
    );
  }
  return actorId;
}

function hashIdentity(...parts: string[]): string {
  return createHash("sha256")
    .update([LEADS_SEARCH_OPERATION, ...parts].join("\u0000"), "utf8")
    .digest("hex");
}

function requestAggregateId(slug: string, rawRequestId: string): string {
  return hashIdentity(slug, rawRequestId);
}

function cancellationId(
  slug: string,
  runId: string,
  rawRequestId: string,
): string {
  return `cancel_${hashIdentity("cancel", slug, runId, rawRequestId)}`;
}

function searchScope(slug: string): ExecutionLeaseScope {
  return {
    tenantKey: slug,
    operation: LEADS_SEARCH_OPERATION,
    mode: "canary",
  };
}

function allowlistedSlugs(raw: string | undefined): {
  slugs: Set<string>;
  invalid: boolean;
} {
  const slugs = new Set<string>();
  let invalid = false;
  for (const entry of (raw ?? "").split(",")) {
    const candidate = entry.trim().toLowerCase();
    if (!candidate) continue;
    if (
      !isValidTenantSlug(candidate) ||
      !/^[a-z0-9][a-z0-9-]{0,119}$/.test(candidate)
    ) {
      invalid = true;
      continue;
    }
    slugs.add(candidate);
  }
  return { slugs, invalid };
}

export function resolveLeadsSearchPolicy(
  slug: string,
  env: LeadsSearchEnvironment = process.env as LeadsSearchEnvironment,
): LeadsSearchRolloutPolicy {
  const rawMode = env.LEADS_SEARCH_EXECUTION_V2?.trim().toLowerCase();
  if (!rawMode || rawMode === "off") {
    return { mode: "off", enabled: false, reason: "disabled" };
  }
  if (rawMode !== "canary") {
    return { mode: "off", enabled: false, reason: "invalid_mode" };
  }
  const tenantKey = slug.trim().toLowerCase();
  if (
    !isValidTenantSlug(tenantKey) ||
    !/^[a-z0-9][a-z0-9-]{0,119}$/.test(tenantKey)
  ) {
    return { mode: "canary", enabled: false, reason: "invalid_tenant" };
  }
  const allowlist = allowlistedSlugs(env.LEADS_SEARCH_V2_SLUGS);
  if (allowlist.invalid) {
    return {
      mode: "canary",
      enabled: false,
      reason: "invalid_allowlist",
    };
  }
  if (!allowlist.slugs.has(tenantKey)) {
    return {
      mode: "canary",
      enabled: false,
      reason: "slug_not_allowlisted",
    };
  }
  return { mode: "canary", enabled: true, reason: "enabled" };
}

export function configuredLeadsSearchSlugs(
  env: LeadsSearchEnvironment = process.env as LeadsSearchEnvironment,
): string[] {
  const allowlist = allowlistedSlugs(env.LEADS_SEARCH_V2_SLUGS);
  if (allowlist.invalid) return [];
  return [...allowlist.slugs]
    .filter((slug) => resolveLeadsSearchPolicy(slug, env).enabled)
    .sort();
}

function isLeadsSearchCapability(input: {
  scope: ExecutionLeaseScope;
  handlerVersion: number;
  capability: string;
}): boolean {
  return (
    input.scope.operation === LEADS_SEARCH_OPERATION &&
    input.scope.mode === "canary" &&
    isValidTenantSlug(input.scope.tenantKey) &&
    /^[a-z0-9][a-z0-9-]{0,119}$/.test(input.scope.tenantKey) &&
    input.handlerVersion === LEADS_SEARCH_HANDLER_VERSION &&
    input.capability === LEADS_APOLLO_CAPABILITY
  );
}

/** Rollout flags gate only new admission; persisted exact scopes always drain. */
export const leadsSearchCapabilityPolicy: DurableCapabilityPolicy =
  Object.freeze({
    mayAdmit: isLeadsSearchCapability,
    mayDrain: (input: {
      scope: ExecutionLeaseScope;
      handlerVersion: number;
      capability: string;
    }) => (isLeadsSearchCapability(input) ? "allow" : "temporarily_suspended"),
  });

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

function projectionRepositoryFrom(
  repository: ExecutionControlRepository,
): ExecutionTerminalProjectionControlRepository | null {
  return typeof repository.claimTerminalProjection === "function" &&
    typeof repository.claimNextTerminalProjection === "function" &&
    typeof repository.renewTerminalProjectionLease === "function" &&
    typeof repository.acknowledgeTerminalProjection === "function" &&
    typeof repository.requeueTerminalProjection === "function" &&
    typeof repository.blockTerminalProjection === "function" &&
    typeof repository.getTerminalProjectionForScope === "function" &&
    typeof repository.getBlockedTerminalProjectionForScope === "function"
    ? (repository as ExecutionControlRepository &
        ExecutionTerminalProjectionControlRepository)
    : null;
}

function defaultProjectionSink(): LeadsSearchProjectionRepository {
  if (!defaultProductProjectionRepository) {
    // `getDb()` and the driver connection are both lazy. Admission never opens
    // a product database connection.
    defaultProductProjectionRepository =
      new PostgresLeadsSearchProjectionRepository(getDb());
  }
  return defaultProductProjectionRepository;
}

function projectedTerminalStatus(
  run: ExecutionRun,
): LeadsSearchProjectionTerminalStatus {
  if (
    run.status === "completed" ||
    run.status === "partial" ||
    run.status === "failed" ||
    run.status === "cancelled"
  ) {
    return run.status;
  }
  throw new LeadsSearchError(
    "invalid_terminal_projection",
    "Leads search projection requires a terminal run",
    500,
  );
}

function projectionResult(
  run: ExecutionRun,
): LeadsSearchProjectedResultV2 | null {
  if (run.status !== "completed") return null;
  let output: LeadsSearchResultV2;
  try {
    output = parseDurableJsonContractValue(
      leadsSearchResultContractV2,
      run.output,
      "checkpoint",
    ).value;
  } catch {
    throw new LeadsSearchError(
      "invalid_terminal_projection",
      "Completed Leads search output is invalid",
      500,
    );
  }
  const { completionBoundary: _completionBoundary, ...compactProductResult } =
    output;
  return normalizeLeadsSearchProjectedResultV2(compactProductResult);
}

export function createLeadsSearchTerminalProjector(
  repository?: LeadsSearchProjectionRepository,
  deliverChat: LeadsSearchChatCompletionDeliverer = deliverLeadsSearchChatCompletion,
): LeadsSearchTerminalProjector {
  return async (
    run: ExecutionRun,
    _command: LeadsSearchCommandV2,
    context: DurableExecutionTerminalProjectionContext,
  ) => {
    const terminalStatus = projectedTerminalStatus(run);
    const result = projectionResult(run);
    await context.assertLease();
    await (repository ?? defaultProjectionSink()).upsert({
      tenantKey: run.tenantKey,
      runId: run.id,
      terminalStatus,
      result,
      projectedAt: context.now(),
    });
    // Product projection and chat delivery share the existing terminal outbox
    // obligation. A failure below requeues the obligation; the product upsert
    // and immutable delivery key make that retry safe.
    await context.assertLease();
    await deliverChat({ run, terminalStatus, result });
  };
}

function registryFor(
  dependencies: Pick<
    LeadsSearchAdmissionDependencies,
    | "apolloPeopleSearchEffect"
    | "projectTerminal"
    | "productProjectionRepository"
    | "deliverChat"
  > = {},
): DurableExecutionRegistry {
  const projector =
    dependencies.projectTerminal ??
    createLeadsSearchTerminalProjector(
      dependencies.productProjectionRepository,
      dependencies.deliverChat,
    );
  return new DurableExecutionRegistry().register(
    createLeadsSearchHandlerV2(
      dependencies.apolloPeopleSearchEffect ??
        createLeadsApolloPeopleSearchEffect(),
      { projectTerminal: projector },
    ),
  );
}

function canonicalCommand(input: {
  slug: string;
  criteria: LeadsSearchCriteriaV2 | Record<string, unknown>;
  limit: number;
}): LeadsSearchCommandV2 {
  if (
    !Number.isSafeInteger(input.limit) ||
    input.limit < 1 ||
    input.limit > LEADS_SEARCH_MAX_RESULTS
  ) {
    throw new LeadsSearchError(
      "invalid_limit",
      `Leads search limit must be an integer from 1 to ${LEADS_SEARCH_MAX_RESULTS}`,
      400,
    );
  }
  try {
    return parseDurableJsonContractValue(
      leadsSearchCommandContractV2,
      {
        schemaVersion: LEADS_SEARCH_HANDLER_VERSION,
        slug: input.slug,
        credentialRef: `apollo://tenant/${input.slug}`,
        criteria: input.criteria,
        limit: input.limit,
      },
      "command",
    ).value;
  } catch (error) {
    if (error instanceof DurableJsonValidationError) {
      throw new LeadsSearchError(
        "invalid_search_command",
        "Leads search criteria do not match the bounded contract",
        400,
      );
    }
    throw error;
  }
}

function completedResult(run: ExecutionRun): LeadsSearchResultV2 | undefined {
  if (run.status !== "completed") return undefined;
  try {
    return parseDurableJsonContractValue(
      leadsSearchResultContractV2,
      run.output,
      "checkpoint",
    ).value;
  } catch {
    throw new LeadsSearchError(
      "invalid_search_result",
      "The durable Leads search result is invalid",
      500,
    );
  }
}

function storedCommandMatches(
  run: ExecutionRun,
  command: LeadsSearchCommandV2,
): boolean {
  try {
    const stored = parseDurableJsonContractValue(
      leadsSearchCommandContractV2,
      run.input,
      "command",
    ).value;
    // Parsing both values through the closed contract gives them the same
    // stable property order. This check preserves 409 semantics without a
    // createRun attempt while worker authority is deliberately disabled.
    return JSON.stringify(stored) === JSON.stringify(command);
  } catch {
    return false;
  }
}

function assertStoredCommandMatches(
  run: ExecutionRun,
  command: LeadsSearchCommandV2,
): void {
  if (storedCommandMatches(run, command)) return;
  throw new LeadsSearchError(
    "execution_command_conflict",
    "This request id is already bound to another Leads search",
    409,
  );
}

function statusUrl(slug: string, runId: string): string {
  return `/api/leads/searches/${encodeURIComponent(runId)}?slug=${encodeURIComponent(slug)}`;
}

function hasErrorCode(error: unknown, code: string): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === code,
  );
}

function statusReceipt(run: ExecutionRun): LeadsSearchStatusReceipt {
  const result = completedResult(run);
  return {
    ok: true,
    operation: LEADS_SEARCH_OPERATION,
    runId: run.id,
    status: run.status,
    completionBoundary: result ? "search_completed" : "ledger_admitted",
    statusUrl: statusUrl(run.tenantKey, run.id),
    ...(result ? { result } : {}),
  };
}

function admissionReceipt(
  run: ExecutionRun,
  created: boolean,
): LeadsSearchAdmissionReceipt {
  return {
    ...statusReceipt(run),
    created,
    replayed: !created,
  };
}

function rolloutError(policy: LeadsSearchRolloutPolicy): LeadsSearchError {
  if (
    policy.reason === "invalid_mode" ||
    policy.reason === "invalid_allowlist" ||
    policy.reason === "invalid_tenant"
  ) {
    return new LeadsSearchError(
      "invalid_leads_search_rollout",
      "Leads search rollout configuration is invalid",
      503,
    );
  }
  return new LeadsSearchError(
    "leads_search_not_enabled",
    "Native Leads search is not enabled for this tenant",
    403,
  );
}

async function ensureDefaultAdmissionReadiness(
  env: LeadsSearchEnvironment,
): Promise<void> {
  if (
    !isLeadsSearchDefaultRuntimeEnabled(process.env as LeadsSearchEnvironment)
  ) {
    throw runtimeDisabledError();
  }
  if (!defaultApolloCredentialReady(env)) {
    throw new LeadsSearchError(
      "leads_search_credential_unavailable",
      "Native Leads search credential binding is unavailable",
      503,
    );
  }
  try {
    await startLeadsSearchWorkers();
  } catch {
    throw new LeadsSearchError(
      "leads_search_runtime_unavailable",
      "Native Leads search runtime is unavailable",
      503,
    );
  }
  // Default admission and the authenticated readiness surface share one
  // fail-closed decision. A later degraded or failed authoritative scan
  // invalidates an earlier success until the supervisor returns to ready.
  const readiness = getLeadsSearchOperationalReadiness(undefined, env);
  if (
    !readiness.acceptsNewAdmissions ||
    readiness.supervisor?.state !== "ready"
  ) {
    throw new LeadsSearchError(
      "leads_search_runtime_unavailable",
      "Native Leads search runtime is unavailable",
      503,
    );
  }
}

async function admitCanonicalSearch(
  input: {
    slug: string;
    aggregateId: string;
    command: LeadsSearchCommandV2;
    traceId?: string;
  },
  dependencies: LeadsSearchAdmissionDependencies,
): Promise<LeadsSearchAdmissionReceipt> {
  const repository = dependencies.repository ?? defaultRepository;
  try {
    const receipt = await admitDurableExecutionV2({
      repository,
      registry: registryFor(dependencies),
      capabilityPolicy:
        dependencies.capabilityPolicy ?? leadsSearchCapabilityPolicy,
      scope: searchScope(input.slug),
      handlerVersion: LEADS_SEARCH_HANDLER_VERSION,
      aggregateType: LEADS_SEARCH_AGGREGATE_TYPE,
      aggregateId: input.aggregateId,
      idempotencyKey: `${LEADS_SEARCH_OPERATION}:${input.aggregateId}:canary:v${LEADS_SEARCH_HANDLER_VERSION}`,
      command: input.command,
      ...(input.traceId ? { traceId: input.traceId } : {}),
      metadata: { source: "leads.search.api" },
      ...(dependencies.trustedOrigin
        ? { trustedOrigin: dependencies.trustedOrigin }
        : {}),
    });
    return admissionReceipt(receipt.run, receipt.created);
  } catch (error) {
    if (
      error instanceof ExecutionCommandConflictError ||
      hasErrorCode(error, "execution_command_conflict")
    ) {
      throw new LeadsSearchError(
        "execution_command_conflict",
        "This request id is already bound to another Leads search",
        409,
      );
    }
    if (error instanceof DurableExecutionAdmissionError) {
      const status =
        error.code === "durable_capability_policy_unavailable"
          ? 503
          : error.code === "durable_identity_invalid" ||
              error.code === "durable_metadata_invalid"
            ? 400
            : 403;
      throw new LeadsSearchError(
        error.code,
        status === 503
          ? "Leads search capability policy is unavailable"
          : status === 400
            ? "Leads search admission identity is invalid"
            : "Leads search capability is not authorized",
        status,
      );
    }
    throw error;
  }
}

/**
 * API admission boundary. The caller key is used only to derive a tenant- and
 * operation-bound digest; the raw key is never sent to the repository.
 */
export async function admitLeadsSearch(
  input: AdmitLeadsSearchInput,
  dependencies: LeadsSearchAdmissionDependencies = {},
): Promise<LeadsSearchAdmissionReceipt> {
  const slug = canonicalTenant(input.slug);
  const rawRequestId = requestIdFrom(input);
  const aggregateId = requestAggregateId(slug, rawRequestId);
  const command = canonicalCommand({
    slug,
    criteria: input.criteria,
    limit: input.limit,
  });
  const env = dependencies.env ?? (process.env as LeadsSearchEnvironment);
  const useDefaultRuntime = !dependencies.repository;
  const repository = dependencies.repository ?? defaultRepository;
  if (typeof repository.getRunByAggregateForScope !== "function") {
    throw new LeadsSearchError(
      "scoped_admission_unavailable",
      "Tenant-scoped Leads search admission is unavailable",
      503,
    );
  }

  // Sticky authority is resolved before rollout flags. Once a receipt exists,
  // disabling the canary cannot reroute or strand the command.
  const existing = await repository.getRunByAggregateForScope({
    ...searchScope(slug),
    aggregateType: LEADS_SEARCH_AGGREGATE_TYPE,
    aggregateId,
  });
  if (existing) {
    assertStoredCommandMatches(existing, command);
    await dependencies.beforeLedgerAdmission?.();
    if (
      useDefaultRuntime &&
      !isLeadsSearchDefaultRuntimeEnabled(process.env as LeadsSearchEnvironment)
    ) {
      return admissionReceipt(existing, false);
    }
    const receipt = await admitCanonicalSearch(
      {
        slug,
        aggregateId,
        command,
        ...(input.traceId ? { traceId: input.traceId } : {}),
      },
      dependencies,
    );
    (dependencies.wake ?? wakeLeadsSearchWorker)(slug);
    return receipt;
  }

  const policy = resolveLeadsSearchPolicy(slug, env);
  if (!policy.enabled) throw rolloutError(policy);
  // Production admission is fail-closed: the default credential and one
  // successful authoritative supervisor scan must exist before the Ledger is
  // mutated. Injected repositories remain explicitly controlled test/adaptor
  // boundaries and supply their own readiness contract.
  if (useDefaultRuntime) {
    await ensureDefaultAdmissionReadiness(env);
  }
  await dependencies.beforeLedgerAdmission?.();
  const receipt = await admitCanonicalSearch(
    {
      slug,
      aggregateId,
      command,
      ...(input.traceId ? { traceId: input.traceId } : {}),
    },
    dependencies,
  );
  (dependencies.wake ?? wakeLeadsSearchWorker)(slug);
  return receipt;
}

export async function getLeadsSearchStatus(
  input: LeadsSearchStatusInput,
  dependencies: LeadsSearchReadDependencies = {},
): Promise<LeadsSearchStatusReceipt | null> {
  const slug = canonicalTenant(input.slug);
  const runId = canonicalRunId(input.runId);
  const repository = dependencies.repository ?? defaultRepository;
  if (typeof repository.getRunByIdForScope !== "function") {
    throw new LeadsSearchError(
      "scoped_status_unavailable",
      "Tenant-scoped Leads search status is unavailable",
      503,
    );
  }
  const run = await repository.getRunByIdForScope({
    ...searchScope(slug),
    runId,
  });
  return run ? statusReceipt(run) : null;
}

/** Compatibility-friendly exact-scope status helper for non-HTTP callers. */
export function getLeadsSearchAdmissionStatus(
  slug: string,
  runId: string,
  repository: ExecutionControlRepository = defaultRepository,
): Promise<LeadsSearchStatusReceipt | null> {
  return getLeadsSearchStatus({ slug, runId }, { repository });
}

export async function cancelLeadsSearch(
  input: LeadsSearchCancellationInput,
  dependencies?: LeadsSearchReadDependencies,
): Promise<LeadsSearchCancellationReceipt | null>;
export async function cancelLeadsSearch(
  slug: string,
  runId: string,
  input: Pick<LeadsSearchCancellationInput, "requestId" | "actorId">,
  dependencies?: LeadsSearchReadDependencies,
): Promise<LeadsSearchCancellationReceipt | null>;
export async function cancelLeadsSearch(
  inputOrSlug: LeadsSearchCancellationInput | string,
  dependenciesOrRunId: LeadsSearchReadDependencies | string = {},
  legacyInput?: Pick<LeadsSearchCancellationInput, "requestId" | "actorId">,
  legacyDependencies: LeadsSearchReadDependencies = {},
): Promise<LeadsSearchCancellationReceipt | null> {
  const objectInput =
    typeof inputOrSlug === "string"
      ? {
          slug: inputOrSlug,
          runId: String(dependenciesOrRunId),
          requestId: legacyInput?.requestId ?? "",
          actorId: legacyInput?.actorId ?? "",
        }
      : inputOrSlug;
  const dependencies =
    typeof inputOrSlug === "string"
      ? legacyDependencies
      : (dependenciesOrRunId as LeadsSearchReadDependencies);
  const slug = canonicalTenant(objectInput.slug);
  const runId = canonicalRunId(objectInput.runId);
  const rawRequestId = canonicalRawRequestId(objectInput.requestId);
  const actorId = canonicalActorId(objectInput.actorId);
  const repository = dependencies.repository ?? defaultRepository;
  if (
    typeof repository.getRunByIdForScope !== "function" ||
    typeof repository.requestRunCancellation !== "function"
  ) {
    throw new LeadsSearchError(
      "scoped_cancellation_unavailable",
      "Tenant-scoped Leads search cancellation is unavailable",
      503,
    );
  }
  const scope = searchScope(slug);
  const existing = await repository.getRunByIdForScope({ ...scope, runId });
  if (!existing) return null;
  try {
    const receipt = await repository.requestRunCancellation({
      ...scope,
      runId,
      cancellationId: cancellationId(slug, runId, rawRequestId),
      actor: { type: "user", id: actorId },
      reasonCode: "user_requested",
    });
    if (!receipt) {
      throw new LeadsSearchError(
        "execution_cancellation_conflict",
        "Leads search cancellation conflicts with the current run",
        409,
      );
    }
    return {
      ok: true,
      operation: LEADS_SEARCH_OPERATION,
      runId: receipt.run.id,
      status: receipt.run.status,
      disposition: receipt.disposition,
      replayed: receipt.replayed,
      statusUrl: statusUrl(slug, receipt.run.id),
    };
  } catch (error) {
    if (
      error instanceof ExecutionCancellationConflictError ||
      hasErrorCode(error, "execution_cancellation_conflict")
    ) {
      throw new LeadsSearchError(
        "execution_cancellation_conflict",
        "Leads search cancellation conflicts with the current run",
        409,
      );
    }
    throw error;
  }
}

function workerLeaseMs(env: LeadsSearchEnvironment): number {
  return boundedPositiveInt(
    env.LEADS_SEARCH_WORKER_LEASE_MS,
    DEFAULT_LEASE_MS,
    5_000,
    10 * 60_000,
  );
}

function workerPollMs(env: LeadsSearchEnvironment): number {
  return boundedPositiveInt(
    env.LEADS_SEARCH_WORKER_POLL_MS,
    DEFAULT_POLL_MS,
    500,
    60_000,
  );
}

function scopeRescanMs(env: LeadsSearchEnvironment): number {
  return boundedPositiveInt(
    env.LEADS_SEARCH_SCOPE_RESCAN_MS,
    DEFAULT_SCOPE_RESCAN_MS,
    1_000,
    60 * 60_000,
  );
}

function defaultApiKeyResolver(
  env: LeadsSearchEnvironment,
): LeadsApolloApiKeyResolver {
  return () => env.APOLLO_API_KEY ?? "";
}

function defaultApolloCredentialReady(env: LeadsSearchEnvironment): boolean {
  const apiKey = env.APOLLO_API_KEY?.trim() ?? "";
  return apiKey.length > 0 && utf8Bytes(apiKey) <= 16 * 1024;
}

export function createLeadsSearchRuntimeCapabilityPolicy(
  env: LeadsSearchEnvironment,
  dependencies: LeadsSearchWorkerDependencies,
): DurableCapabilityPolicy {
  if (dependencies.capabilityPolicy) return dependencies.capabilityPolicy;
  const usesInjectedRepository = Boolean(dependencies.repository);
  const hasInjectedCredentialBinding = Boolean(
    dependencies.credentialProvider || dependencies.resolveApolloApiKey,
  );
  return Object.freeze({
    mayAdmit: (input: Parameters<DurableCapabilityPolicy["mayAdmit"]>[0]) =>
      leadsSearchCapabilityPolicy.mayAdmit(input),
    mayDrain: (input: Parameters<DurableCapabilityPolicy["mayDrain"]>[0]) =>
      (usesInjectedRepository || isLeadsSearchDefaultRuntimeEnabled(env)) &&
      (hasInjectedCredentialBinding || defaultApolloCredentialReady(env))
        ? leadsSearchCapabilityPolicy.mayDrain(input)
        : "temporarily_suspended",
  });
}

function runtimeRegistry(
  dependencies: LeadsSearchWorkerDependencies,
): DurableExecutionRegistry {
  return registryFor({
    apolloPeopleSearchEffect: dependencies.apolloPeopleSearchEffect,
    projectTerminal: dependencies.projectTerminal,
    productProjectionRepository: dependencies.productProjectionRepository,
    deliverChat: dependencies.deliverChat,
  });
}

function createRuntimeBundle(
  repository: ExecutionControlRepository,
  env: LeadsSearchEnvironment,
  dependencies: LeadsSearchWorkerDependencies = {},
): LeadsSearchRuntimeBundle {
  const registry = runtimeRegistry(dependencies);
  const effectRepository =
    dependencies.effectRepository ?? effectRepositoryFrom(repository);
  const cancellationRepository =
    dependencies.cancellationRepository ??
    cancellationRepositoryFrom(repository);
  const projectionRepository =
    dependencies.projectionRepository ?? projectionRepositoryFrom(repository);
  const runtime = new DurableExecutionRuntime({
    repository,
    ...(effectRepository ? { effectRepository } : {}),
    ...(cancellationRepository ? { cancellationRepository } : {}),
    ...(projectionRepository ? { projectionRepository } : {}),
    registry,
    capabilityPolicy: createLeadsSearchRuntimeCapabilityPolicy(
      env,
      dependencies,
    ),
    credentialProvider:
      dependencies.credentialProvider ??
      createLeadsApolloCredentialProvider(
        dependencies.resolveApolloApiKey ?? defaultApiKeyResolver(env),
      ),
    leaseMs: workerLeaseMs(env),
    pollMs: workerPollMs(env),
    maxAttempts: 3,
    maxClaimsPerDrain: 10,
    maxProjectionClaimsPerDrain: 10,
    scheduler: dependencies.runtimeScheduler,
    now: dependencies.now,
    workerIdPrefix: "sancho-leads-search",
    logError: dependencies.logError,
    capacityLimiter: dependencies.capacityLimiter,
  });
  const supervisor = new DurableExecutionScopeSupervisor({
    repository,
    registry,
    runtime,
    modes: ["canary"],
    intervalMs: scopeRescanMs(env),
    scheduler: dependencies.scopeScheduler,
    now: dependencies.now,
    isValidTenantKey: isValidTenantSlug,
    allowScope: (scope) => {
      if (scope.mode !== "canary") {
        return { allowed: false, code: "unsupported_execution_mode" };
      }
      if (scope.operation !== LEADS_SEARCH_OPERATION) {
        return { allowed: false, code: "unsupported_operation" };
      }
      if (
        !isValidTenantSlug(scope.tenantKey) ||
        !/^[a-z0-9][a-z0-9-]{0,119}$/.test(scope.tenantKey)
      ) {
        return { allowed: false, code: "invalid_tenant_key" };
      }
      // Persisted receipts remain authoritative after flag/allowlist removal.
      // Missing credentials suspend the effect policy without hiding the
      // scope, so projection-only recovery can still drain.
      return { allowed: true };
    },
    onError: ({ code }) => {
      try {
        (dependencies.logError ?? console.error)(
          `[leads.search] durable scope scan failed (${code})`,
        );
      } catch {
        // Readiness remains authoritative if logging fails.
      }
    },
  });
  return { repository, registry, runtime, supervisor };
}

function getOrCreateDefaultRuntimeBundle(): LeadsSearchRuntimeBundle {
  if (!runtimeGlobal.__sanchoLeadsSearchDurableRuntime) {
    runtimeGlobal.__sanchoLeadsSearchDurableRuntime = createRuntimeBundle(
      defaultRepository,
      process.env as LeadsSearchEnvironment,
    );
  }
  return runtimeGlobal.__sanchoLeadsSearchDurableRuntime;
}

async function shutdownRuntimeBundle(
  bundle: LeadsSearchRuntimeBundle,
): Promise<void> {
  try {
    await bundle.supervisor.shutdown();
  } finally {
    await bundle.runtime.shutdown();
  }
}

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

/** Latency hint only; PostgreSQL scope discovery is the source of truth. */
export function wakeLeadsSearchWorker(slug: string): void {
  const tenantKey = slug.trim().toLowerCase();
  if (!isValidTenantSlug(tenantKey)) return;
  if (
    !isLeadsSearchDefaultRuntimeEnabled(process.env as LeadsSearchEnvironment)
  ) {
    return;
  }
  const scope = searchScope(tenantKey);
  const bundle = runtimeGlobal.__sanchoLeadsSearchDurableRuntime;
  if (bundle) {
    bundle.supervisor.wakeOrScan(scope);
    return;
  }
  void startLeadsSearchWorkers()
    .then(() => {
      runtimeGlobal.__sanchoLeadsSearchDurableRuntime?.supervisor.wakeOrScan(
        scope,
      );
    })
    .catch(() => {
      // Durable scope discovery will retry; readiness reports startup failure.
    });
}

/** Claim and execute at most one exact-scope Leads search command. */
export async function processNextLeadsSearchRun(
  slug: string,
  dependencies: LeadsSearchWorkerDependencies = {},
): Promise<boolean> {
  const tenantKey = canonicalTenant(slug);
  const env = dependencies.env ?? (process.env as LeadsSearchEnvironment);
  if (
    !dependencies.repository &&
    !isLeadsSearchDefaultRuntimeEnabled(process.env as LeadsSearchEnvironment)
  ) {
    throw runtimeDisabledError();
  }
  const repository = dependencies.repository ?? defaultRepository;
  const effectRepository =
    dependencies.effectRepository ?? effectRepositoryFrom(repository);
  const cancellationRepository =
    dependencies.cancellationRepository ??
    cancellationRepositoryFrom(repository);
  const projectionRepository =
    dependencies.projectionRepository ?? projectionRepositoryFrom(repository);
  const engine = new DurableExecutionEngine({
    repository,
    ...(effectRepository ? { effectRepository } : {}),
    ...(cancellationRepository ? { cancellationRepository } : {}),
    ...(projectionRepository ? { projectionRepository } : {}),
    registry: runtimeRegistry(dependencies),
    capabilityPolicy: createLeadsSearchRuntimeCapabilityPolicy(
      env,
      dependencies,
    ),
    credentialProvider:
      dependencies.credentialProvider ??
      createLeadsApolloCredentialProvider(
        dependencies.resolveApolloApiKey ?? defaultApiKeyResolver(env),
      ),
    scope: searchScope(tenantKey),
    workerId:
      dependencies.workerId ?? `sancho-leads-search-test-${process.pid}`,
    leaseMs: workerLeaseMs(env),
    maxAttempts: 3,
    heartbeatScheduler: dependencies.runtimeScheduler,
    now: dependencies.now,
  });
  const outcome = await engine.processNext();
  return outcome.kind !== "idle";
}

export async function startLeadsSearchWorkers(
  dependencies: LeadsSearchWorkerDependencies = {},
): Promise<string[]> {
  const hasOverrideWithoutRepository = Object.entries(dependencies).some(
    ([key, value]) => key !== "repository" && value !== undefined,
  );
  if (!dependencies.repository && hasOverrideWithoutRepository) {
    throw new LeadsSearchWorkerConfigurationError();
  }
  const env = dependencies.env ?? (process.env as LeadsSearchEnvironment);
  const useDefaultBundle = !dependencies.repository;
  if (
    useDefaultBundle &&
    !isLeadsSearchDefaultRuntimeEnabled(process.env as LeadsSearchEnvironment)
  ) {
    throw runtimeDisabledError();
  }
  const repository = dependencies.repository ?? defaultRepository;
  return serializeRuntimeBundleLifecycle(repository, async () => {
    const at = (dependencies.now ?? (() => new Date()))().toISOString();
    const previousEvidence = startupEvidenceFor(repository, useDefaultBundle);
    setStartupEvidence(repository, useDefaultBundle, {
      ...previousEvidence,
      state: "starting",
      lastAttemptAt: at,
      lastError: undefined,
    });
    try {
      let bundle: LeadsSearchRuntimeBundle;
      if (useDefaultBundle) {
        bundle = getOrCreateDefaultRuntimeBundle();
      } else {
        const previous = injectedRuntimeBundles.get(repository);
        if (previous) {
          try {
            await shutdownRuntimeBundle(previous);
          } finally {
            if (injectedRuntimeBundles.get(repository) === previous) {
              injectedRuntimeBundles.delete(repository);
            }
          }
        }
        bundle = createRuntimeBundle(repository, env, dependencies);
        injectedRuntimeBundles.set(repository, bundle);
      }
      try {
        await bundle.supervisor.start();
      } catch (error) {
        try {
          await shutdownRuntimeBundle(bundle);
        } finally {
          if (useDefaultBundle) {
            if (runtimeGlobal.__sanchoLeadsSearchDurableRuntime === bundle) {
              delete runtimeGlobal.__sanchoLeadsSearchDurableRuntime;
            }
          } else if (injectedRuntimeBundles.get(repository) === bundle) {
            injectedRuntimeBundles.delete(repository);
          }
        }
        throw error;
      }
      const readyAt = (dependencies.now ?? (() => new Date()))().toISOString();
      setStartupEvidence(repository, useDefaultBundle, {
        state: "ready",
        lastAttemptAt: at,
        lastSuccessAt: readyAt,
      });
      return configuredLeadsSearchSlugs(env);
    } catch (error) {
      const failedAt = (dependencies.now ?? (() => new Date()))().toISOString();
      setStartupEvidence(repository, useDefaultBundle, {
        ...startupEvidenceFor(repository, useDefaultBundle),
        state: "failed",
        lastAttemptAt: at,
        lastError: {
          code: safeStartupErrorCode(error),
          at: failedAt,
        },
      });
      throw error;
    }
  });
}

export function getLeadsSearchRuntimeReadiness(
  repository?: ExecutionControlRepository,
): DurableExecutionScopeSupervisorReadiness | undefined {
  const bundle = repository
    ? injectedRuntimeBundles.get(repository)
    : runtimeGlobal.__sanchoLeadsSearchDurableRuntime;
  return bundle?.supervisor.readiness();
}

/** Redacted process-local evidence for an authenticated health adapter. */
export function getLeadsSearchOperationalReadiness(
  repository?: ExecutionControlRepository,
  env: LeadsSearchEnvironment = process.env as LeadsSearchEnvironment,
): LeadsSearchOperationalReadiness {
  const useDefaultBundle = !repository;
  const selectedRepository = repository ?? defaultRepository;
  const supervisor = getLeadsSearchRuntimeReadiness(repository);
  const workerBootReady =
    !useDefaultBundle ||
    isLeadsSearchDefaultRuntimeEnabled(process.env as LeadsSearchEnvironment);
  const credentialBindingReady = useDefaultBundle
    ? defaultApolloCredentialReady(env)
    : true;
  const startup = startupEvidenceFor(selectedRepository, useDefaultBundle);
  const enabledTenantCount = configuredLeadsSearchSlugs(env).length;
  const rolloutReady = enabledTenantCount > 0;
  return {
    acceptsNewAdmissions: Boolean(
      rolloutReady &&
      workerBootReady &&
      credentialBindingReady &&
      startup.state === "ready" &&
      supervisor?.state === "ready" &&
      supervisor?.started &&
      supervisor.lastFullSuccessAt &&
      !supervisor.lastError,
    ),
    rolloutReady,
    enabledTenantCount,
    credentialBindingReady,
    startup: {
      ...startup,
      ...(startup.lastError ? { lastError: { ...startup.lastError } } : {}),
    },
    ...(supervisor ? { supervisor } : {}),
  };
}

export async function stopLeadsSearchWorkers(
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
        setStartupEvidence(repository, false, {
          ...startupEvidenceFor(repository, false),
          state: "stopped",
        });
      }
    });
  }
  return serializeRuntimeBundleLifecycle(defaultRepository, async () => {
    const bundle = runtimeGlobal.__sanchoLeadsSearchDurableRuntime;
    if (!bundle) return;
    try {
      await shutdownRuntimeBundle(bundle);
    } finally {
      if (runtimeGlobal.__sanchoLeadsSearchDurableRuntime === bundle) {
        delete runtimeGlobal.__sanchoLeadsSearchDurableRuntime;
      }
      setStartupEvidence(defaultRepository, true, {
        ...startupEvidenceFor(defaultRepository, true),
        state: "stopped",
      });
    }
  });
}
