export type ExecutionRunMode = "shadow" | "canary" | "active";

export const EXECUTION_COMMAND_CONFLICT_CODE =
  "execution_command_conflict" as const;

export const EXECUTION_EFFECT_CONFLICT_CODE =
  "execution_effect_conflict" as const;

export const EXECUTION_CANCELLATION_CONFLICT_CODE =
  "execution_cancellation_conflict" as const;

export const EXECUTION_ORIGIN_CANCELLED_CODE =
  "execution_origin_cancelled" as const;

export const EXECUTION_ORIGIN_COMMAND_CONFLICT_CODE =
  "execution_origin_command_conflict" as const;

/** Stable idempotency error; never includes command payloads or fingerprints. */
export class ExecutionCommandConflictError extends Error {
  readonly code = EXECUTION_COMMAND_CONFLICT_CODE;

  constructor() {
    super(
      "execution_control: idempotency key is already bound to a different command",
    );
    this.name = "ExecutionCommandConflictError";
  }
}

/** Stable immutable-effect drift error; never exposes keys or fingerprints. */
export class ExecutionEffectConflictError extends Error {
  readonly code = EXECUTION_EFFECT_CONFLICT_CODE;

  constructor() {
    super("execution_control: effect step is bound to a different contract");
    this.name = "ExecutionEffectConflictError";
  }
}

/** Stable cancellation CAS conflict; never exposes scope, actor or request IDs. */
export class ExecutionCancellationConflictError extends Error {
  readonly code = EXECUTION_CANCELLATION_CONFLICT_CODE;

  constructor() {
    super(
      "execution_control: cancellation conflicts with the current run state",
    );
    this.name = "ExecutionCancellationConflictError";
  }
}

/**
 * Stable admission error raised when Stop won the origin serialization race.
 * It deliberately carries no tenant, parent or command identifiers.
 */
export class ExecutionOriginCancelledError extends Error {
  readonly code = EXECUTION_ORIGIN_CANCELLED_CODE;

  constructor() {
    super("execution_control: trusted execution origin is cancelled");
    this.name = "ExecutionOriginCancelledError";
  }
}

/**
 * Stable one-command-per-origin conflict. The error deliberately exposes
 * neither the winning operation nor either command fingerprint.
 */
export class ExecutionOriginCommandConflictError extends Error {
  readonly code = EXECUTION_ORIGIN_COMMAND_CONFLICT_CODE;

  constructor() {
    super(
      "execution_control: trusted execution origin is bound to another command",
    );
    this.name = "ExecutionOriginCommandConflictError";
  }
}

export type ExecutionRunStatus =
  | "queued"
  | "running"
  | "waiting_approval"
  | "blocked"
  | "completed"
  | "partial"
  | "failed"
  | "cancelled";

/** Closed, non-sensitive causes that require an explicit operator resume. */
export type ExecutionRunBlockReasonCode =
  | "handler_version_invalid"
  | "handler_contract_unsupported"
  | "handler_contract_mismatch"
  | "execution_policy_mismatch"
  | "command_contract_mismatch"
  | "runtime_authority_unavailable";

export type ExecutionCancellationActorType = "user" | "service" | "system";

/** Closed audit vocabulary. Details belong in a separately authorized system. */
export type ExecutionCancellationReasonCode =
  | "user_requested"
  | "superseded"
  | "invalid_command"
  | "policy_blocked"
  | "operator_intervention"
  | "system_shutdown";

export interface ExecutionCancellationActor {
  type: ExecutionCancellationActorType;
  /** Bounded opaque subject reference, never a display name or free-form note. */
  id: string;
}

export type ExecutionOriginKind = "mc_chat_parent_run";

/**
 * Server-attested root of an execution tree. This value is accepted only by
 * the explicit trusted-origin repository API; metadata JSON is never an
 * authorization source.
 */
export interface TrustedExecutionOrigin {
  schemaVersion: 1;
  kind: ExecutionOriginKind;
  parentAgentRunId: string;
}

export interface ExecutionOriginScope {
  tenantKey: string;
  origin: TrustedExecutionOrigin;
}

export interface CreateExecutionRunWithTrustedOriginInput {
  command: CreateExecutionRunInput;
  origin: TrustedExecutionOrigin;
}

export interface ClaimExecutionOriginCommandInput extends ExecutionOriginScope {
  /** Closed external operation name, for example `leads.search`. */
  operation: string;
  /** SHA-256 of the server-canonicalized tool command. */
  commandFingerprint: string;
}

export interface ExecutionOriginCommandClaimReceipt extends ExecutionOriginScope {
  operation: string;
  claimedAt: string;
}

export interface RequestExecutionOriginCancellationInput extends ExecutionOriginScope {
  cancellationId: string;
  actor: ExecutionCancellationActor;
  reasonCode: ExecutionCancellationReasonCode;
}

export interface ExecutionOriginCancellationRecord {
  cancellationId: string;
  requestedAt: string;
  actor: ExecutionCancellationActor;
  reasonCode: ExecutionCancellationReasonCode;
}

export interface ExecutionOriginCancellationReceipt
  extends ExecutionOriginScope, ExecutionOriginCancellationRecord {
  /** True when the durable first-writer receipt already existed. */
  replayed: boolean;
}

export interface TrustedExecutionOriginRegistration extends ExecutionOriginScope {
  runId: string;
  cancellation?: ExecutionOriginCancellationRecord;
}

export type ExecutionStepStatus =
  | "pending"
  | "running"
  | "waiting_approval"
  | "completed"
  | "failed"
  | "cancelled"
  | "skipped";

/**
 * Administrative latest-run lookup. It may intentionally read across modes;
 * durable workers must use ExecutionScopedAggregateRef instead.
 */
export interface ExecutionAggregateRef {
  tenantKey: string;
  aggregateType: string;
  aggregateId: string;
  operation?: string;
}

export interface ExecutionRun {
  id: string;
  /** Explicit product tenant boundary. Use `system` for global executions. */
  tenantKey: string;
  idempotencyKey: string;
  aggregateType: string;
  aggregateId: string;
  operation: string;
  mode: ExecutionRunMode;
  status: ExecutionRunStatus;
  currentStep?: string;
  traceId?: string;
  input?: unknown;
  output?: unknown;
  error?: string;
  metadata: Record<string, unknown>;
  /** SHA-256 of the normalized immutable command; absent on unclaimed legacy rows. */
  commandFingerprint?: string;
  /** Earliest database time at which a queued run may be claimed. */
  availableAt: string;
  /** Diagnostic worker identity. The bearer lease token is never exposed here. */
  leaseOwner?: string;
  leaseExpiresAt?: string;
  /** Monotonic count of successful claims, including stale-lease recovery. */
  claimCount: number;
  /** Effect-bearing handler starts; unknown/decode-only claims do not increment. */
  handlerAttempt: number;
  /** Present only while this non-terminal run is explicitly blocked. */
  blockedReasonCode?: ExecutionRunBlockReasonCode;
  blockedAt?: string;
  /**
   * Stable generated/hashed idempotency identity for a cooperative request.
   * Workers observe this marker only through an exact-scope run lookup.
   */
  cancelRequestId?: string;
  cancelRequestedAt?: string;
  cancelRequestedBy?: ExecutionCancellationActor;
  cancelReasonCode?: ExecutionCancellationReasonCode;
  cancelAcknowledgedAt?: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  updatedAt: string;
  /**
   * Ephemeral receipt field returned by managed terminal mutations. The
   * obligation lives in `execution_terminal_projections`, never in the run
   * row itself.
   */
  terminalProjection?: ExecutionTerminalProjection;
}

export interface ExecutionStep {
  id: string;
  runId: string;
  stepKey: string;
  status: ExecutionStepStatus;
  attempt: number;
  input?: unknown;
  output?: unknown;
  error?: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  updatedAt: string;
}

export type ExecutionEffectStatus =
  | "prepared"
  | "retry_wait"
  | "uncertain"
  | "succeeded"
  | "failed"
  | "cancelled";

/** Persisted safety name; the richer retry policy remains in the registry. */
export type ExecutionEffectSafetyKind =
  "read_only" | "target_idempotency" | "reconcile_before_replay";

export interface ExecutionEffect {
  id: string;
  runId: string;
  stepKey: string;
  effectKey: string;
  handlerVersion: number;
  definitionVersion: number;
  capability: string;
  safety: ExecutionEffectSafetyKind;
  payloadSchemaVersion: number;
  payloadFingerprint: string;
  policyFingerprint: string;
  receiptSchemaVersion: number;
  status: ExecutionEffectStatus;
  /** Number of provider invocations authorized before I/O. */
  attemptCount: number;
  /** Reconciliation calls are counted independently from provider attempts. */
  reconcileCount: number;
  /** Closed, bounded receipt projection; never a raw provider response. */
  receipt?: Record<string, unknown>;
  receiptFingerprint?: string;
  lastErrorCode?: string;
  availableAt: string;
  lastAttemptAt?: string;
  lastDeadlineAt?: string;
  finishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type ExecutionTerminalProjectionState =
  "pending" | "running" | "retry_wait" | "succeeded" | "blocked";

export type ExecutionTerminalStatus = Extract<
  ExecutionRunStatus,
  "completed" | "partial" | "failed" | "cancelled"
>;

/**
 * Durable 1:1 obligation to project one terminal run. It intentionally
 * contains no command, output, receipt, metadata or error text.
 */
export interface ExecutionTerminalProjection {
  runId: string;
  tenantKey: string;
  operation: string;
  mode: LeasableExecutionRunMode;
  terminalStatus: ExecutionTerminalStatus;
  state: ExecutionTerminalProjectionState;
  availableAt: string;
  claimCount: number;
  leaseOwner?: string;
  leaseExpiresAt?: string;
  lastAttemptAt?: string;
  lastErrorCode?: string;
  projectedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExecutionEvent {
  sequence: number;
  id: string;
  runId: string;
  aggregateType: string;
  aggregateId: string;
  traceId?: string;
  /** Open event namespace, for example `run.created` or `search.persisted`. */
  type: string;
  ts: string;
  data?: unknown;
}

export interface CreateExecutionRunInput {
  /** Explicit product tenant boundary. Never infer authorization from payloads. */
  tenantKey: string;
  /**
   * Stable within aggregate + operation. Callers should include tenant slug and
   * aggregate id, and must never embed credentials or other secrets.
   */
  idempotencyKey: string;
  aggregateType: string;
  aggregateId: string;
  operation: string;
  mode?: ExecutionRunMode;
  traceId?: string;
  /** Immutable, sanitized command snapshot. Never persist credentials here. */
  input?: unknown;
  /** Non-sensitive correlation tags only. */
  metadata?: Record<string, unknown>;
  now?: Date;
}

export interface CreateExecutionRunReceipt {
  run: ExecutionRun;
  /** False when the same aggregate + operation + idempotency key already won. */
  created: boolean;
}

export interface AppendExecutionEventInput {
  runId: string;
  type: string;
  traceId?: string;
  data?: unknown;
  now?: Date;
}

export interface TransitionExecutionRunInput {
  status: ExecutionRunStatus;
  /** Optional compare-and-set guard for callers that read before mutating. */
  expectedStatus?: ExecutionRunStatus;
  currentStep?: string | null;
  output?: unknown;
  error?: string | null;
  now?: Date;
}

/** Only executable modes may be leased. Shadow evidence is observation-only. */
export type LeasableExecutionRunMode = Exclude<ExecutionRunMode, "shadow">;

export interface ExecutionLeaseScope {
  /** Required authorization boundary; normalized to lowercase by the repository. */
  tenantKey: string;
  /** Required worker capability boundary. */
  operation: string;
  /** Shadow runs are deliberately excluded from worker claims. */
  mode: LeasableExecutionRunMode;
}

/** Exact aggregate lookup boundary used by one durable worker scope. */
export interface ExecutionScopedAggregateRef extends ExecutionLeaseScope {
  aggregateType: string;
  aggregateId: string;
}

/** Exact run-id lookup boundary used by one durable worker scope. */
export interface ExecutionScopedRunRef extends ExecutionLeaseScope {
  runId: string;
}

/** Exact authorization scope for cancellation; shadow evidence is also scoped. */
export interface ExecutionCancellationScope {
  tenantKey: string;
  operation: string;
  mode: ExecutionRunMode;
  runId: string;
}

/** Deprecated bounded compatibility lookup. New callers iterate origin pages. */
export interface ListExecutionRunsByOriginInput {
  tenantKey: string;
  parentAgentRunId: string;
  /** Hard safety bound. The repository fails closed instead of truncating. */
  limit: number;
}

export interface ListExecutionRunsByOriginPageInput {
  tenantKey: string;
  parentAgentRunId: string;
  /** Optional closed server-side filter; omitted cancellation fan-out reads all. */
  statuses?: readonly ExecutionRunStatus[];
  /** Exclusive, stable keyset cursor. */
  afterRunId?: string;
  limit: number;
}

export interface ExecutionRunsByOriginPage {
  runs: ExecutionRun[];
  nextAfterRunId?: string;
}

export interface RequestExecutionRunCancellationInput extends ExecutionCancellationScope {
  /** Canonical UUID or `cancel_` plus 32–64 lowercase hex chars. */
  cancellationId: string;
  actor: ExecutionCancellationActor;
  reasonCode: ExecutionCancellationReasonCode;
}

export interface AcknowledgeExecutionRunCancellationInput extends ExecutionLeaseMutationInput {
  cancellationId: string;
  /** Closed identifier for the durable boundary at which acknowledgement occurs. */
  safePoint: string;
}

export type ExecutionCancellationDisposition = "requested" | "cancelled";

export interface ExecutionCancellationReceipt {
  run: ExecutionRun;
  cancellationId: string;
  disposition: ExecutionCancellationDisposition;
  /** True when no mutation or audit event was added for this call. */
  replayed: boolean;
  /** Present whenever this call observes a managed terminal cancellation. */
  terminalProjection?: ExecutionTerminalProjection;
}

export interface ClaimExecutionRunInput extends ExecutionLeaseScope {
  runId: string;
  workerId: string;
  leaseMs: number;
}

export interface ClaimNextExecutionRunInput extends ExecutionLeaseScope {
  workerId: string;
  leaseMs: number;
}

export interface ListRunnableExecutionTenantKeysInput {
  operation: string;
  mode: LeasableExecutionRunMode;
  /** Exclusive keyset cursor for deterministic restart scans. */
  afterTenantKey?: string;
  /** Bounded page size; callers iterate until a short page. */
  limit: number;
}

/** Exclusive keyset cursor for the global runnable-scope ordering. */
export type RunnableExecutionScopeCursor = ExecutionLeaseScope;

export interface ListRunnableExecutionScopesPageInput {
  /** Explicit capability boundary, normally derived from the handler registry. */
  operations: readonly string[];
  /** Explicit rollout boundary. Shadow is never executable. */
  modes: readonly LeasableExecutionRunMode[];
  /** Exclusive `(operation, mode, tenantKey)` keyset cursor. */
  after?: RunnableExecutionScopeCursor;
  /** Bounded page size. The repository reports whether another page exists. */
  limit: number;
}

export interface RunnableExecutionScopePage {
  scopes: ExecutionLeaseScope[];
  nextAfter?: RunnableExecutionScopeCursor;
}

/**
 * Separate read-only page for terminal projection incidents. These scopes are
 * operational evidence and must never be fed to worker start/wake paths.
 */
export type ListBlockedExecutionProjectionScopesPageInput =
  ListRunnableExecutionScopesPageInput;

export interface BlockedExecutionProjectionScopePage {
  scopes: ExecutionLeaseScope[];
  nextAfter?: RunnableExecutionScopeCursor;
}

/** Separate incident discovery; blocked runs are never runnable work. */
export type ListBlockedExecutionRunScopesPageInput =
  ListRunnableExecutionScopesPageInput;

export interface BlockedExecutionRunScopePage {
  scopes: ExecutionLeaseScope[];
  nextAfter?: RunnableExecutionScopeCursor;
}

export interface ExecutionLeaseReceipt {
  run: ExecutionRun;
  /** Opaque bearer token. Only its SHA-256 digest is persisted. */
  token: string;
  /** Database-clock expiry captured by the atomic claim statement. */
  expiresAt: string;
  /** True when this claim recovered a stale running lease. */
  recovered: boolean;
}

export interface ExecutionLeaseMutationInput extends ExecutionLeaseScope {
  runId: string;
  token: string;
}

export interface ClaimExecutionTerminalProjectionInput extends ExecutionLeaseScope {
  runId: string;
  workerId: string;
  leaseMs: number;
}

export interface ClaimNextExecutionTerminalProjectionInput extends ExecutionLeaseScope {
  workerId: string;
  leaseMs: number;
}

export interface ExecutionTerminalProjectionLeaseReceipt {
  projection: ExecutionTerminalProjection;
  run: ExecutionRun;
  /** Opaque bearer token. Only its SHA-256 digest is persisted. */
  token: string;
  expiresAt: string;
  recovered: boolean;
}

export interface ExecutionTerminalProjectionLeaseMutationInput extends ExecutionLeaseScope {
  runId: string;
  token: string;
}

export interface RenewExecutionTerminalProjectionLeaseInput extends ExecutionTerminalProjectionLeaseMutationInput {
  leaseMs: number;
}

export interface RequeueExecutionTerminalProjectionInput extends ExecutionTerminalProjectionLeaseMutationInput {
  /** Database-clock delay, bounded to 1 second through 1 hour. */
  delayMs: number;
  errorCode: string;
}

export interface BlockExecutionTerminalProjectionInput extends ExecutionTerminalProjectionLeaseMutationInput {
  errorCode: string;
}

export interface ResumeBlockedExecutionTerminalProjectionInput extends ExecutionScopedRunRef {
  /** CAS guard: a stale repair cannot resume a different projection incident. */
  expectedErrorCode: string;
}

export interface PrepareExecutionEffectInput extends ExecutionLeaseMutationInput {
  stepKey: string;
  effectKey: string;
  handlerVersion: number;
  definitionVersion: number;
  capability: string;
  safety: ExecutionEffectSafetyKind;
  payloadSchemaVersion: number;
  payloadFingerprint: string;
  policyFingerprint: string;
  receiptSchemaVersion: number;
  /** Per-invocation provider deadline, 1 second through 5 minutes. */
  deadlineMs: number;
  /** Bounded provider calls for this logical effect, 1 through 10. */
  maxAttempts: number;
}

export type PrepareExecutionEffectDisposition =
  | { kind: "invoke"; effect: ExecutionEffect }
  | { kind: "reconcile"; effect: ExecutionEffect }
  | { kind: "return_receipt"; effect: ExecutionEffect }
  | { kind: "retry_wait"; effect: ExecutionEffect };

export interface CompleteExecutionEffectInput extends ExecutionLeaseMutationInput {
  stepKey: string;
  payloadFingerprint: string;
  policyFingerprint: string;
  receipt: Record<string, unknown>;
  receiptFingerprint: string;
}

export interface RecordExecutionEffectFailureInput extends ExecutionLeaseMutationInput {
  stepKey: string;
  classification: "definitive_rejection" | "outcome_unknown";
  errorCode: string;
  availableAt?: Date;
  terminal: boolean;
}

export interface RecordExecutionEffectReconcileInput extends ExecutionLeaseMutationInput {
  stepKey: string;
  outcome: "found" | "not_found" | "unknown" | "conflict";
  /** Required only when outcome is conflict; becomes the terminal effect code. */
  errorCode?: string;
  receipt?: Record<string, unknown>;
  receiptFingerprint?: string;
  availableAt?: Date;
}

export interface RenewExecutionRunLeaseInput extends ExecutionLeaseMutationInput {
  leaseMs: number;
}

export interface CheckpointExecutionRunInput extends ExecutionLeaseMutationInput {
  currentStep: string;
  /** Durable checkpoint projection; callers should keep it bounded/sanitized. */
  output?: unknown;
  eventType: string;
  /** Sanitized evidence recorded on the append-only checkpoint event. */
  eventData?: unknown;
  /** Internal runtime marker; atomically increments the effect attempt once. */
  incrementHandlerAttempt?: boolean;
}

export interface RequeueExecutionRunInput extends ExecutionLeaseMutationInput {
  availableAt: Date;
  currentStep?: string | null;
  error: string;
  eventData?: unknown;
}

export interface BlockExecutionRunInput extends ExecutionLeaseMutationInput {
  reasonCode: ExecutionRunBlockReasonCode;
}

export interface ResumeBlockedExecutionRunInput extends ExecutionScopedRunRef {
  /** CAS guard: stale operator actions cannot resume a different incident. */
  expectedReasonCode: ExecutionRunBlockReasonCode;
}

export interface FinishExecutionRunInput extends ExecutionLeaseMutationInput {
  status: Extract<ExecutionRunStatus, "completed" | "partial" | "failed">;
  currentStep?: string | null;
  output?: unknown;
  error?: string | null;
  eventType: string;
  eventData?: unknown;
}

export interface ExecutionRunCursor {
  createdAt: string;
  id: string;
}

export interface ListExecutionRunsInput {
  /** Required authorization and query boundary. */
  tenantKey: string;
  aggregateType?: string;
  operation?: string;
  status?: ExecutionRunStatus;
  mode?: ExecutionRunMode;
  before?: ExecutionRunCursor;
  limit: number;
}

export interface ExecutionRunPage {
  runs: ExecutionRun[];
  nextBefore?: ExecutionRunCursor;
}

export interface ListExecutionStepsPageInput {
  tenantKey: string;
  runId: string;
  limit: number;
}

export interface ExecutionStepPage {
  steps: ExecutionStep[];
  truncated: boolean;
}

export interface ListExecutionEventsPageInput {
  tenantKey: string;
  runId: string;
  afterSequence?: number;
  limit: number;
}

export interface ExecutionEventPage {
  events: ExecutionEvent[];
  nextAfterSequence?: number;
}

export interface ExecutionControlRepository {
  createRun(input: CreateExecutionRunInput): Promise<CreateExecutionRunReceipt>;
  appendEvent(input: AppendExecutionEventInput): Promise<ExecutionEvent>;
  transitionRun(
    runId: string,
    input: TransitionExecutionRunInput,
    eventType: string,
    eventData?: unknown,
  ): Promise<ExecutionRun>;
  getRunById(runId: string): Promise<ExecutionRun | null>;
  /**
   * Exact durable-worker lookup. Optional only for compatibility with legacy
   * command adapters; reconciliation fails closed when it is unavailable.
   */
  getRunByIdForScope?(
    input: ExecutionScopedRunRef,
  ): Promise<ExecutionRun | null>;
  /** Administrative lookup whose result may be from any execution mode. */
  getRunByAggregate(input: ExecutionAggregateRef): Promise<ExecutionRun | null>;
  /**
   * Exact durable-worker lookup. Optional only for compatibility with legacy
   * command adapters; reconciliation fails closed when it is unavailable.
   */
  getRunByAggregateForScope?(
    input: ExecutionScopedAggregateRef,
  ): Promise<ExecutionRun | null>;
  listEvents(runId: string): Promise<ExecutionEvent[]>;
  /** Atomically claim one explicit eligible run, or return null. */
  claimRun(
    input: ClaimExecutionRunInput,
  ): Promise<ExecutionLeaseReceipt | null>;
  /** Atomically claim the next eligible run within an exact worker scope. */
  claimNextRun(
    input: ClaimNextExecutionRunInput,
  ): Promise<ExecutionLeaseReceipt | null>;
  /**
   * Startup recovery capability. Optional for legacy/test repositories; a
   * production runtime fails closed to configured scopes when unavailable.
   */
  listRunnableTenantKeys?(
    input: ListRunnableExecutionTenantKeysInput,
  ): Promise<string[]>;
  /**
   * Generic startup/recovery discovery. Optional only so legacy repositories
   * continue to typecheck; the durable scope supervisor requires it and fails
   * closed when the capability is absent.
   */
  listRunnableScopesPage?(
    input: ListRunnableExecutionScopesPageInput,
  ): Promise<RunnableExecutionScopePage>;
  /** Paginated incident visibility; blocked projection rows are not runnable. */
  listBlockedProjectionScopesPage?(
    input: ListBlockedExecutionProjectionScopesPageInput,
  ): Promise<BlockedExecutionProjectionScopePage>;
  /** Paginated incident visibility; blocked runs are never runnable. */
  listBlockedRunScopesPage?(
    input: ListBlockedExecutionRunScopesPageInput,
  ): Promise<BlockedExecutionRunScopePage>;
  renewRunLease(
    input: RenewExecutionRunLeaseInput,
  ): Promise<ExecutionLeaseReceipt | null>;
  checkpointRun(
    input: CheckpointExecutionRunInput,
  ): Promise<ExecutionRun | null>;
  requeueRun(input: RequeueExecutionRunInput): Promise<ExecutionRun | null>;
  blockRun?: ExecutionRunBlockControlRepository["blockRun"];
  resumeBlockedRun?: ExecutionRunBlockControlRepository["resumeBlockedRun"];
  finishRun(input: FinishExecutionRunInput): Promise<ExecutionRun | null>;
  /**
   * Expand-phase effect capabilities. V1 in-memory repositories may omit
   * these; a contract-v2 runtime must require ExecutionEffectControlRepository
   * and fail closed when the capability is unavailable.
   */
  prepareEffect?: ExecutionEffectControlRepository["prepareEffect"];
  completeEffect?: ExecutionEffectControlRepository["completeEffect"];
  recordEffectFailure?: ExecutionEffectControlRepository["recordEffectFailure"];
  recordEffectReconcile?: ExecutionEffectControlRepository["recordEffectReconcile"];
  getEffectForScope?: ExecutionEffectControlRepository["getEffectForScope"];
  /**
   * Expand-phase cooperative cancellation capabilities. Runtime consumers must
   * require ExecutionCancellationControlRepository and fail closed if absent.
   */
  requestRunCancellation?: ExecutionCancellationControlRepository["requestRunCancellation"];
  acknowledgeRunCancellation?: ExecutionCancellationControlRepository["acknowledgeRunCancellation"];
  /** Durable terminal projection outbox. Legacy repositories may omit it. */
  claimTerminalProjection?: ExecutionTerminalProjectionControlRepository["claimTerminalProjection"];
  claimNextTerminalProjection?: ExecutionTerminalProjectionControlRepository["claimNextTerminalProjection"];
  renewTerminalProjectionLease?: ExecutionTerminalProjectionControlRepository["renewTerminalProjectionLease"];
  acknowledgeTerminalProjection?: ExecutionTerminalProjectionControlRepository["acknowledgeTerminalProjection"];
  requeueTerminalProjection?: ExecutionTerminalProjectionControlRepository["requeueTerminalProjection"];
  blockTerminalProjection?: ExecutionTerminalProjectionControlRepository["blockTerminalProjection"];
  resumeBlockedTerminalProjection?: ExecutionTerminalProjectionRepairRepository["resumeBlockedTerminalProjection"];
  getTerminalProjectionForScope?: ExecutionTerminalProjectionControlRepository["getTerminalProjectionForScope"];
  getBlockedTerminalProjectionForScope?: ExecutionTerminalProjectionControlRepository["getBlockedTerminalProjectionForScope"];
}

/** Fenced block plus separately authorized exact-scope operational resume. */
export interface ExecutionRunBlockControlRepository {
  blockRun(input: BlockExecutionRunInput): Promise<ExecutionRun | null>;
  resumeBlockedRun(
    input: ResumeBlockedExecutionRunInput,
  ): Promise<ExecutionRun | null>;
}

/** Required repository surface for exact-scope cooperative cancellation. */
export interface ExecutionCancellationControlRepository {
  requestRunCancellation(
    input: RequestExecutionRunCancellationInput,
  ): Promise<ExecutionCancellationReceipt | null>;
  acknowledgeRunCancellation(
    input: AcknowledgeExecutionRunCancellationInput,
  ): Promise<ExecutionCancellationReceipt | null>;
}

/** Durable first-writer authority for one external command per root turn. */
export interface ExecutionOriginCommandClaimRepository {
  /**
   * First external command wins for the complete trusted origin. Exact
   * operation/fingerprint replays succeed; drift and cross-tool calls fail.
   */
  claimExecutionOriginCommand(
    input: ClaimExecutionOriginCommandInput,
  ): Promise<ExecutionOriginCommandClaimReceipt>;
}

/**
 * Trusted parent/child authority. Implementations must serialize origin
 * registration with child creation and must fail closed after a tombstone.
 */
export interface ExecutionOriginControlRepository {
  createRunWithTrustedOrigin(
    input: CreateExecutionRunWithTrustedOriginInput,
  ): Promise<CreateExecutionRunReceipt>;
  requestOriginCancellation(
    input: RequestExecutionOriginCancellationInput,
  ): Promise<ExecutionOriginCancellationReceipt>;
  getRunTrustedExecutionOrigin(input: {
    tenantKey: string;
    runId: string;
  }): Promise<TrustedExecutionOriginRegistration | null>;
  listRunsByExecutionOriginPage(
    input: ListExecutionRunsByOriginPageInput,
  ): Promise<ExecutionRunsByOriginPage>;
  /** @deprecated Use listRunsByExecutionOriginPage and exhaust the cursor. */
  listRunsByExecutionOrigin(
    input: ListExecutionRunsByOriginInput,
  ): Promise<ExecutionRun[]>;
}

/** Required repository surface for contract-v2 external effects. */
export interface ExecutionEffectControlRepository {
  prepareEffect(
    input: PrepareExecutionEffectInput,
  ): Promise<PrepareExecutionEffectDisposition | null>;
  completeEffect(
    input: CompleteExecutionEffectInput,
  ): Promise<ExecutionEffect | null>;
  recordEffectFailure(
    input: RecordExecutionEffectFailureInput,
  ): Promise<ExecutionEffect | null>;
  recordEffectReconcile(
    input: RecordExecutionEffectReconcileInput,
  ): Promise<ExecutionEffect | null>;
  getEffectForScope(
    input: ExecutionScopedRunRef & { stepKey: string },
  ): Promise<ExecutionEffect | null>;
}

/** Required repository surface for recoverable terminal projection delivery. */
export interface ExecutionTerminalProjectionControlRepository {
  claimTerminalProjection(
    input: ClaimExecutionTerminalProjectionInput,
  ): Promise<ExecutionTerminalProjectionLeaseReceipt | null>;
  claimNextTerminalProjection(
    input: ClaimNextExecutionTerminalProjectionInput,
  ): Promise<ExecutionTerminalProjectionLeaseReceipt | null>;
  renewTerminalProjectionLease(
    input: RenewExecutionTerminalProjectionLeaseInput,
  ): Promise<ExecutionTerminalProjectionLeaseReceipt | null>;
  acknowledgeTerminalProjection(
    input: ExecutionTerminalProjectionLeaseMutationInput,
  ): Promise<ExecutionTerminalProjection | null>;
  requeueTerminalProjection(
    input: RequeueExecutionTerminalProjectionInput,
  ): Promise<ExecutionTerminalProjection | null>;
  blockTerminalProjection(
    input: BlockExecutionTerminalProjectionInput,
  ): Promise<ExecutionTerminalProjection | null>;
  getTerminalProjectionForScope(
    input: ExecutionScopedRunRef,
  ): Promise<ExecutionTerminalProjection | null>;
  /** Stable blocked evidence for readiness; blocked rows are never claimable. */
  getBlockedTerminalProjectionForScope(
    input: ExecutionLeaseScope,
  ): Promise<ExecutionTerminalProjection | null>;
}

/** Separately authorized, manual repair for a stable blocked projection. */
export interface ExecutionTerminalProjectionRepairRepository {
  resumeBlockedTerminalProjection(
    input: ResumeBlockedExecutionTerminalProjectionInput,
  ): Promise<ExecutionTerminalProjection | null>;
}

/**
 * Bounded, tenant-scoped reads for inspectors and future machine evidence APIs.
 * Kept separate so command-path adapters only depend on mutation primitives.
 */
export interface ExecutionControlReadRepository {
  listRuns(input: ListExecutionRunsInput): Promise<ExecutionRunPage>;
  getRunByIdForTenant(
    tenantKey: string,
    runId: string,
  ): Promise<ExecutionRun | null>;
  listStepsPage(input: ListExecutionStepsPageInput): Promise<ExecutionStepPage>;
  listEventsPage(
    input: ListExecutionEventsPageInput,
  ): Promise<ExecutionEventPage>;
}
