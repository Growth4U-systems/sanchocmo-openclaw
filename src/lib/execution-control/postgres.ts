import crypto from "node:crypto";
import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  gt,
  inArray,
  isNull,
  lt,
  or,
  sql as drizzleSql,
  type SQL,
} from "drizzle-orm";
import { db, type Db } from "@/db/drizzle";
import {
  executionEffects as effectsTable,
  executionEvents as eventsTable,
  executionOrigins as originsTable,
  executionRunOrigins as runOriginsTable,
  executionRuns as runsTable,
  executionSteps as stepsTable,
  executionTerminalProjections as projectionsTable,
} from "@/db/schema";
import {
  createTraceContext,
  getTraceId,
  normalizeTraceId,
} from "@/lib/trace-context";
import {
  ExecutionCancellationConflictError,
  ExecutionCommandConflictError,
  ExecutionEffectConflictError,
  ExecutionOriginCancelledError,
  ExecutionOriginCommandConflictError,
} from "./types";
import type {
  AcknowledgeExecutionRunCancellationInput,
  AppendExecutionEventInput,
  BlockExecutionRunInput,
  BlockedExecutionRunScopePage,
  BlockedExecutionProjectionScopePage,
  CheckpointExecutionRunInput,
  ClaimExecutionTerminalProjectionInput,
  ClaimExecutionRunInput,
  ClaimNextExecutionTerminalProjectionInput,
  ClaimNextExecutionRunInput,
  ClaimExecutionOriginCommandInput,
  CreateExecutionRunInput,
  CreateExecutionRunReceipt,
  CreateExecutionRunWithTrustedOriginInput,
  CompleteExecutionEffectInput,
  ExecutionAggregateRef,
  ExecutionCancellationControlRepository,
  ExecutionCancellationReceipt,
  ExecutionCancellationReasonCode,
  ExecutionCancellationScope,
  ExecutionControlRepository,
  ExecutionControlReadRepository,
  ExecutionOriginControlRepository,
  ExecutionOriginCommandClaimRepository,
  ExecutionOriginCommandClaimReceipt,
  ExecutionOriginCancellationReceipt,
  ExecutionRunsByOriginPage,
  ExecutionEffect,
  ExecutionEffectControlRepository,
  ExecutionEvent,
  ExecutionEventPage,
  ExecutionLeaseReceipt,
  ExecutionLeaseScope,
  ExecutionRun,
  ExecutionRunBlockControlRepository,
  ExecutionRunBlockReasonCode,
  ExecutionRunMode,
  ExecutionRunPage,
  ExecutionRunStatus,
  ExecutionScopedAggregateRef,
  ExecutionScopedRunRef,
  ExecutionStep,
  ExecutionStepPage,
  ExecutionTerminalProjection,
  ExecutionTerminalProjectionControlRepository,
  ExecutionTerminalProjectionRepairRepository,
  ExecutionTerminalProjectionLeaseReceipt,
  ExecutionTerminalProjectionLeaseMutationInput,
  BlockExecutionTerminalProjectionInput,
  PrepareExecutionEffectDisposition,
  PrepareExecutionEffectInput,
  RecordExecutionEffectFailureInput,
  RecordExecutionEffectReconcileInput,
  RequestExecutionRunCancellationInput,
  RequestExecutionOriginCancellationInput,
  ListExecutionEventsPageInput,
  ListExecutionRunsByOriginInput,
  ListExecutionRunsByOriginPageInput,
  ListExecutionRunsInput,
  ListExecutionStepsPageInput,
  ListBlockedExecutionProjectionScopesPageInput,
  ListBlockedExecutionRunScopesPageInput,
  ListRunnableExecutionScopesPageInput,
  ListRunnableExecutionTenantKeysInput,
  RunnableExecutionScopePage,
  RequeueExecutionRunInput,
  RequeueExecutionTerminalProjectionInput,
  RenewExecutionTerminalProjectionLeaseInput,
  RenewExecutionRunLeaseInput,
  ResumeBlockedExecutionRunInput,
  ResumeBlockedExecutionTerminalProjectionInput,
  FinishExecutionRunInput,
  TransitionExecutionRunInput,
  TrustedExecutionOrigin,
  TrustedExecutionOriginRegistration,
} from "./types";

type RunRow = typeof runsTable.$inferSelect;
type StepRow = typeof stepsTable.$inferSelect;
type EventRow = typeof eventsTable.$inferSelect;
type EffectRow = typeof effectsTable.$inferSelect;
type ProjectionRow = typeof projectionsTable.$inferSelect;

interface NormalizedExecutionCommand {
  tenantKey: string;
  aggregateType: string;
  aggregateId: string;
  operation: string;
  mode: ExecutionRunMode;
  input: unknown;
  metadata: Record<string, unknown>;
}

interface ExecutionIdempotencyCommand extends NormalizedExecutionCommand {
  idempotencyKey: string;
  commandFingerprint: string;
  /** Preserves SQL NULL versus JSON null for conditional legacy adoption. */
  inputForStorage: unknown;
}

const TERMINAL_STATUSES = new Set<ExecutionRunStatus>([
  "completed",
  "partial",
  "failed",
  "cancelled",
]);
const EXECUTION_RUN_STATUSES = new Set<ExecutionRunStatus>([
  "queued",
  "running",
  "waiting_approval",
  "blocked",
  ...TERMINAL_STATUSES,
]);

function executionRunStatusFilter(
  value: readonly ExecutionRunStatus[] | undefined,
): ExecutionRunStatus[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length < 1 || value.length > 8) {
    throw new Error("execution_control: invalid run status filter");
  }
  const statuses = [...new Set(value)];
  if (!statuses.every((status) => EXECUTION_RUN_STATUSES.has(status))) {
    throw new Error("execution_control: invalid run status filter");
  }
  return statuses;
}

function id(prefix: "xrun" | "xevt" | "xeff"): string {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
}

function dateIso(value: Date | string | null): string | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString();
  const normalized = value.trim().replace(" ", "T");
  const zoned = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(normalized)
    ? normalized
    : `${normalized}Z`;
  return new Date(zoned).toISOString();
}

function jsonValue(value: unknown): SQL {
  return value === undefined
    ? drizzleSql`NULL::jsonb`
    : drizzleSql`${JSON.stringify(value)}::jsonb`;
}

// Ledger timestamps are `timestamp without time zone` for compatibility with
// the existing schema, but their stored wall-clock value is always UTC. Make
// both sides of that convention explicit so neither the database session nor
// the Node process timezone can shift scheduling decisions.
function timestampValue(value: Date): SQL {
  return drizzleSql`${value.toISOString()}::timestamptz AT TIME ZONE 'UTC'`;
}

function databaseUtcClock(): SQL {
  return drizzleSql`clock_timestamp() AT TIME ZONE 'UTC'`;
}

function requiredText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`execution_control: ${field} is required`);
  return normalized;
}

function normalizedOperation(value: string): string {
  return requiredText(value, "operation").toLowerCase();
}

function normalizedRunMode(value: unknown): ExecutionRunMode {
  const normalized =
    value === undefined ? "shadow" : String(value).trim().toLowerCase();
  if (
    normalized !== "shadow" &&
    normalized !== "canary" &&
    normalized !== "active"
  ) {
    throw new Error("execution_control: mode must be shadow, canary or active");
  }
  return normalized;
}

function normalizedJsonValue(value: unknown, field: string): unknown {
  if (value === undefined) return null;
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new Error(`execution_control: ${field} must be JSON serializable`);
  }
  if (serialized === undefined) return null;
  return JSON.parse(serialized) as unknown;
}

function normalizedMetadata(
  value: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const normalized = normalizedJsonValue(value ?? {}, "metadata");
  if (
    !normalized ||
    typeof normalized !== "object" ||
    Array.isArray(normalized)
  ) {
    throw new Error("execution_control: metadata must be a JSON object");
  }
  return normalized as Record<string, unknown>;
}

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  throw new Error("execution_control: canonical command contains invalid JSON");
}

function normalizedExecutionCommand(input: {
  tenantKey: string;
  aggregateType: string;
  aggregateId: string;
  operation: string;
  mode?: ExecutionRunMode;
  input?: unknown;
  metadata?: Record<string, unknown>;
}): NormalizedExecutionCommand {
  return {
    tenantKey: requiredText(input.tenantKey, "tenantKey").toLowerCase(),
    aggregateType: requiredText(input.aggregateType, "aggregateType"),
    aggregateId: requiredText(input.aggregateId, "aggregateId"),
    operation: normalizedOperation(input.operation),
    mode: normalizedRunMode(input.mode),
    input: normalizedJsonValue(input.input, "input"),
    metadata: normalizedMetadata(input.metadata),
  };
}

function fingerprintNormalizedExecutionCommand(
  command: NormalizedExecutionCommand,
): string {
  return crypto
    .createHash("sha256")
    .update(canonicalJson(command), "utf8")
    .digest("hex");
}

/**
 * Stable immutable-command fingerprint. Idempotency key, traceId and now are
 * deliberately excluded; no canonical command payload is persisted.
 */
export function executionCommandFingerprint(input: {
  tenantKey: string;
  aggregateType: string;
  aggregateId: string;
  operation: string;
  mode?: ExecutionRunMode;
  input?: unknown;
  metadata?: Record<string, unknown>;
}): string {
  return fingerprintNormalizedExecutionCommand(
    normalizedExecutionCommand(input),
  );
}

function normalizedSlugFromJson(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const slug = (value as Record<string, unknown>).slug;
  if (typeof slug !== "string") return undefined;
  return slug.trim().toLowerCase() || undefined;
}

function inferredLegacyTenantKey(row: RunRow): string {
  const payloadTenant =
    normalizedSlugFromJson(row.input) ?? normalizedSlugFromJson(row.metadata);
  if (payloadTenant) return payloadTenant;
  if (row.aggregateType === "partnerships.search") {
    const separator = row.aggregateId.indexOf(":");
    if (separator > 0) {
      return row.aggregateId.slice(0, separator).trim().toLowerCase();
    }
  }
  return "system";
}

function fingerprintPersistedCommand(
  row: RunRow,
  tenantKeyOverride?: string,
): string {
  return executionCommandFingerprint({
    tenantKey: tenantKeyOverride ?? row.tenantKey ?? "",
    aggregateType: row.aggregateType,
    aggregateId: row.aggregateId,
    operation: row.operation,
    mode: row.mode as ExecutionRunMode,
    input: row.input,
    metadata: row.metadata,
  });
}

function optionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function leaseDuration(value: number): number {
  if (!Number.isSafeInteger(value) || value < 100 || value > 3_600_000) {
    throw new Error(
      "execution_control: leaseMs must be an integer from 100 to 3600000",
    );
  }
  return value;
}

const EFFECT_STEP_PATTERN = /^[a-z][a-z0-9._-]{0,63}$/;
const EFFECT_CAPABILITY_PATTERN = /^[a-z][a-z0-9._-]{0,127}$/;
const EFFECT_FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/;
const EFFECT_ERROR_CODE_PATTERN = /^[a-z][a-z0-9._-]{0,127}$/;
const PROJECTION_WORKER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/;
const ORIGIN_PARENT_RUN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/+~-]{0,159}$/;
const ORIGIN_COMMAND_OPERATION_PATTERN = /^[a-z][a-z0-9._-]{0,127}$/;
const CANCELLATION_ID_PATTERN =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|cancel_[a-f0-9]{32,64})$/;
const CANCELLATION_ACTOR_REFERENCE_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/;
const CANCELLATION_SAFE_POINT_PATTERN = /^[a-z][a-z0-9._-]{0,63}$/;
const CANCELLATION_REASON_CODES = new Set<ExecutionCancellationReasonCode>([
  "user_requested",
  "superseded",
  "invalid_command",
  "policy_blocked",
  "operator_intervention",
  "system_shutdown",
]);
const EXECUTION_RUN_BLOCK_REASON_CODES = new Set<ExecutionRunBlockReasonCode>([
  "handler_version_invalid",
  "handler_contract_unsupported",
  "handler_contract_mismatch",
  "execution_policy_mismatch",
  "command_contract_mismatch",
  "runtime_authority_unavailable",
]);

function effectStepKey(value: string): string {
  const step = requiredText(value, "effect stepKey");
  if (!EFFECT_STEP_PATTERN.test(step)) {
    throw new Error("execution_control: invalid effect stepKey");
  }
  return step;
}

function effectKey(value: string): string {
  const key = requiredText(value, "effectKey");
  if (Buffer.byteLength(key, "utf8") > 512 || /\s/u.test(key)) {
    throw new Error("execution_control: invalid effectKey");
  }
  return key;
}

function effectCapability(value: string): string {
  const capability = requiredText(value, "effect capability");
  if (!EFFECT_CAPABILITY_PATTERN.test(capability)) {
    throw new Error("execution_control: invalid effect capability");
  }
  return capability;
}

function effectFingerprint(value: string, field: string): string {
  const fingerprint = requiredText(value, field);
  if (!EFFECT_FINGERPRINT_PATTERN.test(fingerprint)) {
    throw new Error(`execution_control: ${field} must be a SHA-256 hex digest`);
  }
  return fingerprint;
}

function effectVersion(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`execution_control: ${field} must be a positive integer`);
  }
  return value;
}

function effectDeadline(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1_000 || value > 300_000) {
    throw new Error(
      "execution_control: effect deadlineMs must be an integer from 1000 to 300000",
    );
  }
  return value;
}

function effectMaxAttempts(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 10) {
    throw new Error(
      "execution_control: effect maxAttempts must be an integer from 1 to 10",
    );
  }
  return value;
}

function effectErrorCode(value: string): string {
  const code = requiredText(value, "effect errorCode");
  if (!EFFECT_ERROR_CODE_PATTERN.test(code)) {
    throw new Error("execution_control: invalid effect errorCode");
  }
  return code;
}

function projectionWorkerId(value: string): string {
  const workerId = requiredText(value, "projection workerId");
  if (!PROJECTION_WORKER_PATTERN.test(workerId)) {
    throw new Error("execution_control: invalid projection workerId");
  }
  return workerId;
}

function projectionDelay(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1_000 || value > 3_600_000) {
    throw new Error(
      "execution_control: projection delayMs must be an integer from 1000 to 3600000",
    );
  }
  return value;
}

function projectionErrorCode(value: string): string {
  const code = requiredText(value, "projection errorCode");
  if (!EFFECT_ERROR_CODE_PATTERN.test(code)) {
    throw new Error("execution_control: invalid projection errorCode");
  }
  return code;
}

function cancellationIdentifier(value: string): string {
  const identifier = requiredText(value, "cancellationId");
  if (!CANCELLATION_ID_PATTERN.test(identifier)) {
    throw new Error("execution_control: invalid cancellationId");
  }
  return identifier;
}

function cancellationActorReference(value: string): string {
  const reference = requiredText(value, "cancellation actor id");
  if (!CANCELLATION_ACTOR_REFERENCE_PATTERN.test(reference)) {
    throw new Error("execution_control: invalid cancellation actor id");
  }
  return reference;
}

function cancellationSafePoint(value: string): string {
  const safePoint = requiredText(value, "cancellation safePoint");
  if (!CANCELLATION_SAFE_POINT_PATTERN.test(safePoint)) {
    throw new Error("execution_control: invalid cancellation safePoint");
  }
  return safePoint;
}

function cancellationReason(
  value: ExecutionCancellationReasonCode,
): ExecutionCancellationReasonCode {
  if (!CANCELLATION_REASON_CODES.has(value)) {
    throw new Error("execution_control: invalid cancellation reasonCode");
  }
  return value;
}

function executionRunBlockReason(
  value: ExecutionRunBlockReasonCode,
): ExecutionRunBlockReasonCode {
  if (!EXECUTION_RUN_BLOCK_REASON_CODES.has(value)) {
    throw new Error("execution_control: invalid run block reasonCode");
  }
  return value;
}

function cancellationActor(
  input: Pick<RequestExecutionRunCancellationInput, "actor">,
): {
  type: "user" | "service" | "system";
  id: string;
} {
  if (
    input.actor.type !== "user" &&
    input.actor.type !== "service" &&
    input.actor.type !== "system"
  ) {
    throw new Error("execution_control: invalid cancellation actor type");
  }
  return {
    type: input.actor.type,
    id: cancellationActorReference(input.actor.id),
  };
}

function trustedExecutionOrigin(value: unknown): TrustedExecutionOrigin {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("execution_control: invalid trusted execution origin");
  }
  const raw = value as Record<string, unknown>;
  if (
    Object.keys(raw).length !== 3 ||
    raw.schemaVersion !== 1 ||
    raw.kind !== "mc_chat_parent_run" ||
    typeof raw.parentAgentRunId !== "string" ||
    !ORIGIN_PARENT_RUN_PATTERN.test(raw.parentAgentRunId)
  ) {
    throw new Error("execution_control: invalid trusted execution origin");
  }
  return {
    schemaVersion: 1,
    kind: "mc_chat_parent_run",
    parentAgentRunId: raw.parentAgentRunId,
  };
}

function executionOriginScope(input: { tenantKey: string; origin: unknown }): {
  tenantKey: string;
  origin: TrustedExecutionOrigin;
} {
  return {
    tenantKey: requiredText(input.tenantKey, "tenantKey").toLowerCase(),
    origin: trustedExecutionOrigin(input.origin),
  };
}

function originCommandOperation(value: string): string {
  const operation = normalizedOperation(value);
  if (!ORIGIN_COMMAND_OPERATION_PATTERN.test(operation)) {
    throw new Error("execution_control: invalid origin command operation");
  }
  return operation;
}

function originCommandFingerprint(value: string): string {
  const fingerprint = requiredText(value, "origin commandFingerprint");
  if (!EFFECT_FINGERPRINT_PATTERN.test(fingerprint)) {
    throw new Error(
      "execution_control: origin commandFingerprint must be a SHA-256 hex digest",
    );
  }
  return fingerprint;
}

function validEffectDate(
  value: Date | undefined,
  field: string,
): Date | undefined {
  if (value !== undefined && Number.isNaN(value.getTime())) {
    throw new Error(`execution_control: ${field} must be a valid date`);
  }
  return value;
}

function assertStrictJson(
  value: unknown,
  path: string,
  ancestors: Set<object>,
): void {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`execution_control: ${path} must contain finite JSON`);
    }
    return;
  }
  if (typeof value !== "object") {
    throw new Error(`execution_control: ${path} must contain strict JSON`);
  }
  if (ancestors.has(value)) {
    throw new Error(`execution_control: ${path} must not contain cycles`);
  }
  if (!Array.isArray(value)) {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error(`execution_control: ${path} must contain plain JSON`);
    }
  }
  ancestors.add(value);
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      assertStrictJson(entry, `${path}[${index}]`, ancestors),
    );
  } else {
    for (const [key, entry] of Object.entries(value)) {
      assertStrictJson(entry, `${path}.${key}`, ancestors);
    }
  }
  ancestors.delete(value);
}

function boundedEffectReceipt(
  value: Record<string, unknown>,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("execution_control: effect receipt must be a JSON object");
  }
  assertStrictJson(value, "effect receipt", new Set());
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized, "utf8") > 16_384) {
    throw new Error("execution_control: effect receipt exceeds 16384 bytes");
  }
  return JSON.parse(serialized) as Record<string, unknown>;
}

function leasableScope(input: ExecutionLeaseScope): {
  tenantKey: string;
  operation: string;
  mode: "canary" | "active";
} {
  const tenantKey = requiredText(input.tenantKey, "tenantKey").toLowerCase();
  const operation = requiredText(input.operation, "operation");
  if (input.mode !== "canary" && input.mode !== "active") {
    throw new Error("execution_control: worker mode must be canary or active");
  }
  return { tenantKey, operation, mode: input.mode };
}

function cancellationScope(input: ExecutionCancellationScope): {
  tenantKey: string;
  operation: string;
  mode: ExecutionRunMode;
} {
  return {
    tenantKey: requiredText(input.tenantKey, "tenantKey").toLowerCase(),
    operation: normalizedOperation(input.operation),
    mode: normalizedRunMode(input.mode),
  };
}

export function hashExecutionLeaseToken(token: string): string {
  return crypto
    .createHash("sha256")
    .update(requiredText(token, "lease token"), "utf8")
    .digest("hex");
}

function newExecutionLeaseToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function assertLeaseTokenNotPersisted(
  value: unknown,
  token: string,
  field: string,
): void {
  if (value === undefined || value === null) return;
  let serialized: string | undefined;
  try {
    serialized = typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    throw new Error(`execution_control: ${field} must be JSON serializable`);
  }
  if (serialized?.includes(token)) {
    throw new Error(
      `execution_control: ${field} must not contain the bearer lease token`,
    );
  }
}

type StatementRow = Record<string, unknown>;

/** Normalize Drizzle's neon-http (`rows`) and postgres-js (array) results. */
function statementRows(result: unknown): StatementRow[] {
  if (Array.isArray(result)) return result as StatementRow[];
  if (
    result &&
    typeof result === "object" &&
    Array.isArray((result as { rows?: unknown }).rows)
  ) {
    return (result as { rows: StatementRow[] }).rows;
  }
  return [];
}

function resultText(row: StatementRow, camel: string, snake: string): string {
  const value = row[camel] ?? row[snake];
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  throw new Error(`execution_control: statement did not return ${snake}`);
}

function resultBoolean(
  row: StatementRow,
  camel: string,
  snake: string,
): boolean {
  const value = row[camel] ?? row[snake];
  return value === true || value === "true" || value === 1;
}

function resultTimestamp(
  row: StatementRow,
  camel: string,
  snake: string,
): string {
  const value = row[camel] ?? row[snake];
  if (value instanceof Date) {
    // postgres-js parses raw `timestamp without time zone` results in the
    // process timezone before Drizzle's column decoder can run. Reconstruct
    // the returned wall-clock fields as UTC. ORM table selects do pass through
    // Drizzle and are normalized separately by the timestamp column mapper.
    return new Date(
      Date.UTC(
        value.getFullYear(),
        value.getMonth(),
        value.getDate(),
        value.getHours(),
        value.getMinutes(),
        value.getSeconds(),
        value.getMilliseconds(),
      ),
    ).toISOString();
  }
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`execution_control: statement did not return ${snake}`);
  }
  // The Ledger stores UTC-by-convention `timestamp` columns. postgres-js raw
  // CTE results return those values without a zone; make that convention
  // explicit before parsing so the host timezone cannot skew lease receipts.
  const normalized = value.trim().replace(" ", "T");
  const zoned = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(normalized)
    ? normalized
    : `${normalized}Z`;
  const date = new Date(zoned);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`execution_control: invalid ${snake} returned by database`);
  }
  return date.toISOString();
}

function boundedReadLimit(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    throw new Error(
      "execution_control: read limit must be an integer from 1 to 100",
    );
  }
  return value;
}

function cursorTimestamp(value: string): string {
  const normalized = value.trim();
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\.(\d{3,6})Z$/.exec(
    normalized,
  );
  if (!match) {
    throw new Error("execution_control: invalid run cursor timestamp");
  }
  const millisecondIso = `${match[1]}.${match[2].slice(0, 3)}Z`;
  if (new Date(millisecondIso).toISOString() !== millisecondIso) {
    throw new Error("execution_control: invalid run cursor timestamp");
  }
  return `${match[1]}.${match[2].padEnd(6, "0")}Z`;
}

function cursorTimestampValue(value: string): SQL {
  return drizzleSql`${value}::timestamptz AT TIME ZONE 'UTC'`;
}

function runTraceId(value: unknown): string {
  return (
    normalizeTraceId(value) ?? getTraceId() ?? createTraceContext().traceId
  );
}

function eventTraceId(value: unknown): string | undefined {
  return normalizeTraceId(value) ?? getTraceId();
}

function hasManagedTerminalProjectionAuthority(
  run: Pick<ExecutionRun, "mode" | "metadata">,
): run is Pick<ExecutionRun, "metadata"> & {
  mode: "canary" | "active";
} {
  return (
    run.mode !== "shadow" && run.metadata.authority === "execution_ledger_v2"
  );
}

/** Exported for contract tests and explicit migration/backfill tooling. */
export function executionRunFromDatabaseRow(row: RunRow): ExecutionRun {
  const tenantKey = row.tenantKey?.trim();
  if (!tenantKey) {
    throw new Error(`execution_control: run ${row.id} has no tenant scope`);
  }
  return {
    id: row.id,
    tenantKey,
    idempotencyKey: row.idempotencyKey,
    aggregateType: row.aggregateType,
    aggregateId: row.aggregateId,
    operation: row.operation,
    mode: row.mode as ExecutionRun["mode"],
    status: row.status as ExecutionRunStatus,
    ...(row.currentStep ? { currentStep: row.currentStep } : {}),
    ...(row.traceId ? { traceId: row.traceId } : {}),
    ...(row.input !== null ? { input: row.input } : {}),
    ...(row.output !== null ? { output: row.output } : {}),
    ...(row.error ? { error: row.error } : {}),
    metadata: row.metadata,
    ...(row.commandFingerprint
      ? { commandFingerprint: row.commandFingerprint }
      : {}),
    availableAt: dateIso(row.availableAt) as string,
    ...(row.leaseOwner ? { leaseOwner: row.leaseOwner } : {}),
    ...(row.leaseExpiresAt
      ? { leaseExpiresAt: dateIso(row.leaseExpiresAt) }
      : {}),
    claimCount: row.claimCount,
    handlerAttempt: row.handlerAttempt,
    ...(row.blockedReasonCode
      ? {
          blockedReasonCode:
            row.blockedReasonCode as ExecutionRunBlockReasonCode,
        }
      : {}),
    ...(row.blockedAt ? { blockedAt: dateIso(row.blockedAt) } : {}),
    ...(row.cancelRequestId ? { cancelRequestId: row.cancelRequestId } : {}),
    ...(row.cancelRequestedAt
      ? { cancelRequestedAt: dateIso(row.cancelRequestedAt) }
      : {}),
    ...(row.cancelActorType && row.cancelActorId
      ? {
          cancelRequestedBy: {
            type: row.cancelActorType as "user" | "service" | "system",
            id: row.cancelActorId,
          },
        }
      : {}),
    ...(row.cancelReasonCode
      ? {
          cancelReasonCode:
            row.cancelReasonCode as ExecutionCancellationReasonCode,
        }
      : {}),
    ...(row.cancelAcknowledgedAt
      ? { cancelAcknowledgedAt: dateIso(row.cancelAcknowledgedAt) }
      : {}),
    createdAt: dateIso(row.createdAt) as string,
    ...(row.startedAt ? { startedAt: dateIso(row.startedAt) } : {}),
    ...(row.finishedAt ? { finishedAt: dateIso(row.finishedAt) } : {}),
    updatedAt: dateIso(row.updatedAt) as string,
  };
}

/** Exported even though shadow mode does not mutate steps yet. */
export function executionStepFromDatabaseRow(row: StepRow): ExecutionStep {
  return {
    id: row.id,
    runId: row.runId,
    stepKey: row.stepKey,
    status: row.status as ExecutionStep["status"],
    attempt: row.attempt,
    ...(row.input !== null ? { input: row.input } : {}),
    ...(row.output !== null ? { output: row.output } : {}),
    ...(row.error ? { error: row.error } : {}),
    createdAt: dateIso(row.createdAt) as string,
    ...(row.startedAt ? { startedAt: dateIso(row.startedAt) } : {}),
    ...(row.finishedAt ? { finishedAt: dateIso(row.finishedAt) } : {}),
    updatedAt: dateIso(row.updatedAt) as string,
  };
}

/** Exported for effect-ledger contract tests and bounded inspectors. */
export function executionEffectFromDatabaseRow(
  row: EffectRow,
): ExecutionEffect {
  return {
    id: row.id,
    runId: row.runId,
    stepKey: row.stepKey,
    effectKey: row.effectKey,
    handlerVersion: row.handlerVersion,
    definitionVersion: row.definitionVersion,
    capability: row.capability,
    safety: row.safety as ExecutionEffect["safety"],
    payloadSchemaVersion: row.payloadSchemaVersion,
    payloadFingerprint: row.payloadFingerprint,
    policyFingerprint: row.policyFingerprint,
    receiptSchemaVersion: row.receiptSchemaVersion,
    status: row.status as ExecutionEffect["status"],
    attemptCount: row.attemptCount,
    reconcileCount: row.reconcileCount,
    ...(row.receipt !== null ? { receipt: row.receipt } : {}),
    ...(row.receiptFingerprint
      ? { receiptFingerprint: row.receiptFingerprint }
      : {}),
    ...(row.lastErrorCode ? { lastErrorCode: row.lastErrorCode } : {}),
    availableAt: dateIso(row.availableAt) as string,
    ...(row.lastAttemptAt ? { lastAttemptAt: dateIso(row.lastAttemptAt) } : {}),
    ...(row.lastDeadlineAt
      ? { lastDeadlineAt: dateIso(row.lastDeadlineAt) }
      : {}),
    ...(row.finishedAt ? { finishedAt: dateIso(row.finishedAt) } : {}),
    createdAt: dateIso(row.createdAt) as string,
    updatedAt: dateIso(row.updatedAt) as string,
  };
}

/** Exported for outbox contract tests and bounded operational inspection. */
export function executionTerminalProjectionFromDatabaseRow(
  row: ProjectionRow,
): ExecutionTerminalProjection {
  return {
    runId: row.runId,
    tenantKey: row.tenantKey,
    operation: row.operation,
    mode: row.mode as ExecutionTerminalProjection["mode"],
    terminalStatus:
      row.terminalStatus as ExecutionTerminalProjection["terminalStatus"],
    state: row.state as ExecutionTerminalProjection["state"],
    availableAt: dateIso(row.availableAt) as string,
    claimCount: row.claimCount,
    ...(row.leaseOwner ? { leaseOwner: row.leaseOwner } : {}),
    ...(row.leaseExpiresAt
      ? { leaseExpiresAt: dateIso(row.leaseExpiresAt) }
      : {}),
    ...(row.lastAttemptAt ? { lastAttemptAt: dateIso(row.lastAttemptAt) } : {}),
    ...(row.lastErrorCode ? { lastErrorCode: row.lastErrorCode } : {}),
    ...(row.projectedAt ? { projectedAt: dateIso(row.projectedAt) } : {}),
    createdAt: dateIso(row.createdAt) as string,
    updatedAt: dateIso(row.updatedAt) as string,
  };
}

/** Exported for contract tests and explicit migration/backfill tooling. */
export function executionEventFromDatabaseRow(row: EventRow): ExecutionEvent {
  return {
    sequence: row.sequence,
    id: row.id,
    runId: row.runId,
    aggregateType: row.aggregateType,
    aggregateId: row.aggregateId,
    ...(row.traceId ? { traceId: row.traceId } : {}),
    type: row.type,
    ts: dateIso(row.ts) as string,
    ...(row.data !== null ? { data: row.data } : {}),
  };
}

/**
 * Monotonic lifecycle guard. Approval may resume to running, but active runs
 * never return to queued and terminal runs are immutable.
 */
export function canTransitionExecutionRun(
  from: ExecutionRunStatus,
  to: ExecutionRunStatus,
): boolean {
  if (TERMINAL_STATUSES.has(from)) return false;
  if (from === "blocked" || to === "blocked") return false;
  if (to === "queued") return from === "queued";
  return true;
}

/**
 * Postgres source of truth for generic product executions.
 *
 * Mutations intentionally use one CTE statement rather than interactive
 * transactions: neon-http cannot hold an interactive transaction, while both
 * supported drivers execute a statement atomically.
 */
export class PostgresExecutionControlRepository
  implements
    ExecutionControlRepository,
    ExecutionControlReadRepository,
    ExecutionEffectControlRepository,
    ExecutionCancellationControlRepository,
    ExecutionOriginControlRepository,
    ExecutionOriginCommandClaimRepository,
    ExecutionRunBlockControlRepository,
    ExecutionTerminalProjectionControlRepository,
    ExecutionTerminalProjectionRepairRepository
{
  constructor(private readonly database: Db = db) {}

  async createRun(
    input: CreateExecutionRunInput,
  ): Promise<CreateExecutionRunReceipt> {
    return this.createRunInternal(input);
  }

  async claimExecutionOriginCommand(
    input: ClaimExecutionOriginCommandInput,
  ): Promise<ExecutionOriginCommandClaimReceipt> {
    const { tenantKey, origin } = executionOriginScope(input);
    const operation = originCommandOperation(input.operation);
    const commandFingerprint = originCommandFingerprint(
      input.commandFingerprint,
    );

    const result = await this.database.execute(drizzleSql`
      WITH origin_clock AS (
        SELECT ${databaseUtcClock()} AS "now"
      )
      INSERT INTO "execution_origins" (
        "tenant_key", "kind", "parent_agent_run_id", "command_operation",
        "command_fingerprint", "command_claimed_at", "created_at",
        "updated_at"
      ) SELECT
        ${tenantKey}, ${origin.kind}, ${origin.parentAgentRunId}, ${operation},
        ${commandFingerprint}, origin_clock."now", origin_clock."now",
        origin_clock."now"
      FROM origin_clock
      ON CONFLICT ("tenant_key", "kind", "parent_agent_run_id")
      DO UPDATE SET
        "command_operation" = COALESCE(
          "execution_origins"."command_operation",
          EXCLUDED."command_operation"
        ),
        "command_fingerprint" = COALESCE(
          "execution_origins"."command_fingerprint",
          EXCLUDED."command_fingerprint"
        ),
        "command_claimed_at" = COALESCE(
          "execution_origins"."command_claimed_at",
          EXCLUDED."command_claimed_at"
        ),
        "updated_at" = CASE
          WHEN "execution_origins"."command_operation" IS NULL
            THEN EXCLUDED."updated_at"
          ELSE "execution_origins"."updated_at"
        END
      WHERE "execution_origins"."cancel_request_id" IS NULL
        AND (
          "execution_origins"."command_operation" IS NULL OR (
            "execution_origins"."command_operation" =
              EXCLUDED."command_operation" AND
            "execution_origins"."command_fingerprint" =
              EXCLUDED."command_fingerprint"
          )
        )
        AND (
          "execution_origins"."command_operation" IS NOT NULL OR
          NOT EXISTS (
            SELECT 1
            FROM "execution_run_origins"
            WHERE "execution_run_origins"."tenant_key" =
                "execution_origins"."tenant_key"
              AND "execution_run_origins"."kind" =
                "execution_origins"."kind"
              AND "execution_run_origins"."parent_agent_run_id" =
                "execution_origins"."parent_agent_run_id"
          )
        )
      RETURNING "command_claimed_at"
    `);
    const claimed = statementRows(result)[0];
    if (claimed) {
      return {
        tenantKey,
        origin,
        operation,
        claimedAt: resultTimestamp(
          claimed,
          "commandClaimedAt",
          "command_claimed_at",
        ),
      };
    }

    const [existing] = await this.database
      .select({
        cancelRequestId: originsTable.cancelRequestId,
        commandOperation: originsTable.commandOperation,
        commandFingerprint: originsTable.commandFingerprint,
      })
      .from(originsTable)
      .where(
        and(
          eq(originsTable.tenantKey, tenantKey),
          eq(originsTable.kind, origin.kind),
          eq(originsTable.parentAgentRunId, origin.parentAgentRunId),
        ),
      )
      .limit(1);
    if (existing?.cancelRequestId) {
      throw new ExecutionOriginCancelledError();
    }
    if (existing) {
      throw new ExecutionOriginCommandConflictError();
    }
    throw new Error(
      "execution_control: origin command claim did not persist or resolve",
    );
  }

  async createRunWithTrustedOrigin(
    input: CreateExecutionRunWithTrustedOriginInput,
  ): Promise<CreateExecutionRunReceipt> {
    const originScope = executionOriginScope({
      tenantKey: input.command.tenantKey,
      origin: input.origin,
    });
    return this.createRunInternal(input.command, originScope.origin);
  }

  private async createRunInternal(
    input: CreateExecutionRunInput,
    trustedOrigin?: TrustedExecutionOrigin,
  ): Promise<CreateExecutionRunReceipt> {
    const command = normalizedExecutionCommand(
      trustedOrigin
        ? {
            ...input,
            metadata: {
              ...(input.metadata ?? {}),
              // Diagnostic mirror only. The immutable registration table is
              // the authority used by cancellation and delivery.
              executionOrigin: trustedOrigin,
            },
          }
        : input,
    );
    const { aggregateType, aggregateId, operation, tenantKey, mode, metadata } =
      command;
    const idempotencyKey = requiredText(input.idempotencyKey, "idempotencyKey");
    const commandFingerprint = fingerprintNormalizedExecutionCommand(command);
    const inputForStorage =
      input.input === undefined ? undefined : command.input;
    const now = input.now ?? new Date();
    const runId = id("xrun");
    const eventId = id("xevt");
    const traceId = runTraceId(input.traceId);

    const persistenceStatement = trustedOrigin
      ? drizzleSql`
          WITH origin_gate AS MATERIALIZED (
            INSERT INTO "execution_origins" (
              "tenant_key", "kind", "parent_agent_run_id",
              "created_at", "updated_at"
            ) VALUES (
              ${tenantKey}, ${trustedOrigin.kind},
              ${trustedOrigin.parentAgentRunId}, ${timestampValue(now)},
              ${timestampValue(now)}
            )
            ON CONFLICT ("tenant_key", "kind", "parent_agent_run_id")
            DO UPDATE SET
              -- Deliberate row-locking no-op. Never clear or rewrite Stop.
              "updated_at" = "execution_origins"."updated_at"
            RETURNING "tenant_key", "kind", "parent_agent_run_id",
                      "cancel_request_id"
          ), inserted_run AS (
            INSERT INTO "execution_runs" (
              "id", "tenant_key", "idempotency_key", "aggregate_type",
              "aggregate_id", "operation", "mode", "status", "trace_id",
              "input", "metadata", "command_fingerprint", "created_at",
              "updated_at"
            )
            SELECT ${runId}, ${tenantKey}, ${idempotencyKey}, ${aggregateType},
                   ${aggregateId}, ${operation}, ${mode}, 'queued', ${traceId},
                   ${jsonValue(inputForStorage)}, ${jsonValue(metadata)},
                   ${commandFingerprint}, ${timestampValue(now)},
                   ${timestampValue(now)}
            FROM origin_gate
            WHERE "cancel_request_id" IS NULL
            -- Targetless conflict handling is deliberate during expand/contract.
            ON CONFLICT DO NOTHING
            RETURNING "id", "tenant_key", "aggregate_type", "aggregate_id",
                      "trace_id"
          ), inserted_registration AS (
            INSERT INTO "execution_run_origins" (
              "run_id", "tenant_key", "kind", "parent_agent_run_id",
              "created_at"
            )
            SELECT inserted_run."id", inserted_run."tenant_key",
                   origin_gate."kind", origin_gate."parent_agent_run_id",
                   ${timestampValue(now)}
            FROM inserted_run CROSS JOIN origin_gate
            RETURNING "run_id"
          )
          INSERT INTO "execution_events" (
            "id", "run_id", "aggregate_type", "aggregate_id", "trace_id",
            "type", "ts", "data"
          )
          SELECT ${eventId}, inserted_run."id", "aggregate_type",
                 "aggregate_id", "trace_id", 'run.created',
                 ${timestampValue(now)}, ${jsonValue({ operation, mode })}
          FROM inserted_run
          JOIN inserted_registration
            ON inserted_registration."run_id" = inserted_run."id"
        `
      : drizzleSql`
          WITH inserted_run AS (
            INSERT INTO "execution_runs" (
              "id", "tenant_key", "idempotency_key", "aggregate_type",
              "aggregate_id", "operation", "mode", "status", "trace_id",
              "input", "metadata", "command_fingerprint", "created_at",
              "updated_at"
            ) VALUES (
              ${runId}, ${tenantKey}, ${idempotencyKey}, ${aggregateType},
              ${aggregateId}, ${operation}, ${mode}, 'queued', ${traceId},
              ${jsonValue(inputForStorage)}, ${jsonValue(metadata)},
              ${commandFingerprint}, ${timestampValue(now)},
              ${timestampValue(now)}
            )
            -- Targetless conflict handling is deliberate during expand/contract:
            -- both the legacy and tenant-aware unique indexes coexist.
            ON CONFLICT DO NOTHING
            RETURNING "id", "aggregate_type", "aggregate_id", "trace_id"
          )
          INSERT INTO "execution_events" (
            "id", "run_id", "aggregate_type", "aggregate_id", "trace_id",
            "type", "ts", "data"
          )
          SELECT ${eventId}, "id", "aggregate_type", "aggregate_id",
                 "trace_id", 'run.created', ${timestampValue(now)},
                 ${jsonValue({ operation, mode })}
          FROM inserted_run
        `;

    await this.database.execute(persistenceStatement);

    const created = await this.getRunById(runId);
    if (created) {
      if (trustedOrigin) {
        await this.assertRunTrustedOrigin(created, trustedOrigin);
      }
      return { run: created, created: true };
    }

    const idempotencyRef = {
      tenantKey,
      aggregateType,
      aggregateId,
      operation,
      idempotencyKey,
      mode,
      input: command.input,
      inputForStorage,
      metadata,
      commandFingerprint,
    };
    let winner = await this.getIdempotencyWinner(idempotencyRef);
    if (winner) {
      if (trustedOrigin) {
        await this.assertRunTrustedOrigin(winner, trustedOrigin);
      }
      return { run: winner, created: false };
    }

    if (trustedOrigin) {
      if (
        await this.isOriginCancelled({
          tenantKey,
          origin: trustedOrigin,
        })
      ) {
        throw new ExecutionOriginCancelledError();
      }
      // A trusted child may never adopt a legacy or metadata-only winner: the
      // registration and run must have committed atomically.
      throw new Error(
        "execution_control: trusted-origin create did not persist or resolve an idempotent run",
      );
    }

    // During the expand/contract deploy, the previous container can still
    // insert a row after migration 0020's backfill. Adopt only a NULL-scoped
    // row whose legacy data independently resolves to this tenant; this keeps
    // retries idempotent without allowing one tenant to claim another's run.
    await this.claimLegacyIdempotencyWinner(idempotencyRef);
    winner = await this.getIdempotencyWinner(idempotencyRef);
    if (winner) return { run: winner, created: false };

    // Never fabricate an in-memory run or silently downgrade to another store.
    throw new Error(
      "execution_control: create did not persist or resolve an idempotent run",
    );
  }

  async appendEvent(input: AppendExecutionEventInput): Promise<ExecutionEvent> {
    const runId = requiredText(input.runId, "runId");
    const type = requiredText(input.type, "event type");
    const eventId = id("xevt");
    const now = input.now ?? new Date();
    const traceId = eventTraceId(input.traceId);

    await this.database.execute(drizzleSql`
      INSERT INTO "execution_events" (
        "id", "run_id", "aggregate_type", "aggregate_id", "trace_id",
        "type", "ts", "data"
      )
      SELECT ${eventId}, "id", "aggregate_type", "aggregate_id",
             COALESCE("trace_id", ${traceId ?? null}), ${type},
             ${timestampValue(now)}, ${jsonValue(input.data)}
      FROM "execution_runs"
      WHERE "id" = ${runId}
    `);

    const event = await this.getEventById(eventId);
    if (!event)
      throw new Error(`execution_control: run ${runId} was not found`);
    return event;
  }

  async transitionRun(
    runIdValue: string,
    input: TransitionExecutionRunInput,
    eventTypeValue: string,
    eventData?: unknown,
  ): Promise<ExecutionRun> {
    const runId = requiredText(runIdValue, "runId");
    const eventType = requiredText(eventTypeValue, "event type");
    if (input.status === "blocked") {
      throw new Error(
        "execution_control: blocked status requires a fenced blockRun mutation",
      );
    }
    const now = input.now ?? new Date();
    const eventId = id("xevt");
    const hasCurrentStep = Object.prototype.hasOwnProperty.call(
      input,
      "currentStep",
    );
    const hasOutput = Object.prototype.hasOwnProperty.call(input, "output");
    const hasError = Object.prototype.hasOwnProperty.call(input, "error");
    const terminal = TERMINAL_STATUSES.has(input.status);

    await this.database.execute(drizzleSql`
      WITH transition_clock AS (
        SELECT ${databaseUtcClock()} AS "now"
      ), transitioned_run AS (
        UPDATE "execution_runs"
        SET
          "status" = ${input.status},
          "current_step" = CASE WHEN ${hasCurrentStep}
            THEN ${input.currentStep ?? null} ELSE "current_step" END,
          "output" = CASE WHEN ${hasOutput}
            THEN ${jsonValue(input.output)} ELSE "output" END,
          "error" = CASE WHEN ${hasError}
            THEN ${input.error ?? null} ELSE "error" END,
          "started_at" = CASE WHEN ${input.status === "running"}
            THEN COALESCE("started_at", ${timestampValue(now)}) ELSE "started_at" END,
          -- An administrative approval/resume cannot mint a bearer lease.
          -- Represent the handoff as an already-expired running lease so an
          -- exact-scope worker can atomically claim it using the DB clock.
          "lease_owner" = CASE WHEN ${input.status === "running"}
            THEN NULL ELSE "lease_owner" END,
          "lease_token_hash" = CASE WHEN ${input.status === "running"}
            THEN NULL ELSE "lease_token_hash" END,
          "lease_expires_at" = CASE WHEN ${input.status === "running"}
            THEN transition_clock."now" ELSE "lease_expires_at" END,
          "finished_at" = CASE WHEN ${terminal}
            THEN COALESCE("finished_at", transition_clock."now") ELSE "finished_at" END,
          "updated_at" = CASE WHEN ${terminal}
            THEN transition_clock."now" ELSE ${timestampValue(now)} END
        FROM transition_clock
        WHERE "id" = ${runId}
          -- Leased runs may only be mutated through token-fenced methods.
          AND "lease_token_hash" IS NULL
          AND "cancel_requested_at" IS NULL
          AND (${input.expectedStatus === undefined}
            OR "status" = ${input.expectedStatus ?? null})
          AND (
            (${input.status === "queued"} AND "status" = 'queued')
            OR (${input.status !== "queued"} AND "status" IN (
              'queued', 'running', 'waiting_approval'
            ))
          )
        RETURNING "id", "tenant_key", "operation", "mode", "status",
                  "metadata", "aggregate_type", "aggregate_id", "trace_id"
      ), inserted_projection AS (
        INSERT INTO "execution_terminal_projections" (
          "run_id", "tenant_key", "operation", "mode", "terminal_status",
          "state", "available_at", "claim_count", "created_at", "updated_at"
        )
        SELECT "id", "tenant_key", "operation", "mode", "status", 'pending',
               transition_clock."now", 0, transition_clock."now",
               transition_clock."now"
        FROM transitioned_run CROSS JOIN transition_clock
        WHERE ${terminal}
          AND "mode" IN ('canary', 'active')
          AND "metadata"->>'authority' = 'execution_ledger_v2'
        ON CONFLICT ("run_id") DO NOTHING
        RETURNING "run_id"
      ), inserted_event AS (
        INSERT INTO "execution_events" (
        "id", "run_id", "aggregate_type", "aggregate_id", "trace_id",
        "type", "ts", "data"
        )
        SELECT ${eventId}, "id", "aggregate_type", "aggregate_id", "trace_id",
               ${eventType},
               CASE WHEN ${terminal} THEN transition_clock."now"
                    ELSE ${timestampValue(now)} END,
               ${jsonValue(eventData)}
        FROM transitioned_run CROSS JOIN transition_clock
        RETURNING "id"
      )
      SELECT "id" AS "run_id",
             EXISTS (SELECT 1 FROM inserted_projection) AS "projection_written",
             EXISTS (SELECT 1 FROM inserted_event) AS "event_written"
      FROM transitioned_run
    `);

    const event = await this.getEventById(eventId);
    if (!event) {
      const current = await this.getRunById(runId);
      if (!current)
        throw new Error(`execution_control: run ${runId} was not found`);
      throw new Error(
        `execution_control: invalid or stale transition ${current.status} -> ${input.status} for run ${runId}`,
      );
    }

    const run = await this.getRunById(runId);
    if (!run)
      throw new Error(
        `execution_control: transitioned run ${runId} was not found`,
      );
    if (terminal && hasManagedTerminalProjectionAuthority(run)) {
      const projection = await this.getTerminalProjectionForScope({
        tenantKey: run.tenantKey,
        operation: run.operation,
        mode: run.mode,
        runId: run.id,
      });
      if (!projection) {
        throw new Error(
          "execution_control: terminal transition projection was not found",
        );
      }
      return { ...run, terminalProjection: projection };
    }
    return run;
  }

  async requestRunCancellation(
    input: RequestExecutionRunCancellationInput,
  ): Promise<ExecutionCancellationReceipt | null> {
    const runId = requiredText(input.runId, "runId");
    const { tenantKey, operation, mode } = cancellationScope(input);
    const cancellationId = cancellationIdentifier(input.cancellationId);
    const actor = cancellationActor(input);
    const reasonCode = cancellationReason(input.reasonCode);
    const eventId = id("xevt");

    const result = await this.database.execute(drizzleSql`
      WITH cancellation_clock AS (
        SELECT ${databaseUtcClock()} AS "now"
      ), scoped_run AS MATERIALIZED (
        SELECT r.*
        FROM "execution_runs" AS r
        WHERE r."id" = ${runId}
          AND r."tenant_key" = ${tenantKey}
          AND r."operation" = ${operation}
          AND r."mode" = ${mode}
        FOR UPDATE OF r
      ), mutated_run AS (
        UPDATE "execution_runs" AS r
        SET
          "status" = CASE
            WHEN r."status" IN ('queued', 'waiting_approval', 'blocked')
              THEN 'cancelled'
            ELSE r."status"
          END,
          "cancel_request_id" = ${cancellationId},
          "cancel_requested_at" = cancellation_clock."now",
          "cancel_actor_type" = ${actor.type},
          "cancel_actor_id" = ${actor.id},
          "cancel_reason_code" = ${reasonCode},
          "cancel_acknowledged_at" = CASE
            WHEN r."status" IN ('queued', 'waiting_approval', 'blocked')
              THEN cancellation_clock."now"
            ELSE NULL
          END,
          "lease_owner" = CASE
            WHEN r."status" IN ('queued', 'waiting_approval', 'blocked')
              THEN NULL
            ELSE r."lease_owner"
          END,
          "lease_token_hash" = CASE
            WHEN r."status" IN ('queued', 'waiting_approval', 'blocked')
              THEN NULL
            ELSE r."lease_token_hash"
          END,
          "lease_expires_at" = CASE
            WHEN r."status" IN ('queued', 'waiting_approval', 'blocked')
              THEN NULL
            ELSE r."lease_expires_at"
          END,
          "blocked_reason_code" = NULL,
          "blocked_at" = NULL,
          "finished_at" = CASE
            WHEN r."status" IN ('queued', 'waiting_approval', 'blocked')
              THEN cancellation_clock."now"
            ELSE r."finished_at"
          END,
          "updated_at" = cancellation_clock."now"
        FROM scoped_run, cancellation_clock
        WHERE r."id" = scoped_run."id"
          AND scoped_run."status" IN (
            'queued', 'running', 'waiting_approval', 'blocked'
          )
          AND scoped_run."cancel_request_id" IS NULL
        RETURNING r.*
      ), inserted_projection AS (
        INSERT INTO "execution_terminal_projections" (
          "run_id", "tenant_key", "operation", "mode", "terminal_status",
          "state", "available_at", "claim_count", "created_at", "updated_at"
        )
        SELECT changed."id", changed."tenant_key", changed."operation",
               changed."mode", changed."status", 'pending',
               cancellation_clock."now", 0, cancellation_clock."now",
               cancellation_clock."now"
        FROM mutated_run AS changed CROSS JOIN cancellation_clock
        WHERE changed."status" = 'cancelled'
          AND changed."mode" IN ('canary', 'active')
          AND changed."metadata"->>'authority' = 'execution_ledger_v2'
        ON CONFLICT ("run_id") DO NOTHING
        RETURNING "run_id"
      ), inserted_event AS (
        INSERT INTO "execution_events" (
          "id", "run_id", "aggregate_type", "aggregate_id", "trace_id",
          "type", "ts", "data"
        )
        SELECT ${eventId}, changed."id", changed."aggregate_type",
               changed."aggregate_id", changed."trace_id",
               CASE WHEN changed."status" = 'cancelled'
                 THEN 'run.cancelled' ELSE 'run.cancellation_requested' END,
               cancellation_clock."now",
               jsonb_build_object(
                 'cancellationId', changed."cancel_request_id",
                 'actor', jsonb_build_object(
                   'type', changed."cancel_actor_type",
                   'id', changed."cancel_actor_id"
                 ),
                 'reasonCode', changed."cancel_reason_code",
                 'cooperative', TRUE
               )
        FROM mutated_run AS changed CROSS JOIN cancellation_clock
        RETURNING "id"
      ), decision AS (
        SELECT
          CASE WHEN changed."status" = 'cancelled'
            THEN 'cancelled'::text ELSE 'requested'::text END AS "disposition",
          FALSE AS "replayed"
        FROM mutated_run AS changed
        UNION ALL
        SELECT
          CASE
            WHEN existing."cancel_request_id" = ${cancellationId}
              AND existing."cancel_actor_type" = ${actor.type}
              AND existing."cancel_actor_id" = ${actor.id}
              AND existing."cancel_reason_code" = ${reasonCode}
              AND existing."status" = 'running'
              AND existing."cancel_acknowledged_at" IS NULL
              THEN 'requested'
            WHEN existing."cancel_request_id" = ${cancellationId}
              AND existing."cancel_actor_type" = ${actor.type}
              AND existing."cancel_actor_id" = ${actor.id}
              AND existing."cancel_reason_code" = ${reasonCode}
              AND existing."status" = 'cancelled'
              AND existing."cancel_acknowledged_at" IS NOT NULL
              THEN 'cancelled'
            ELSE 'conflict'
          END AS "disposition",
          TRUE AS "replayed"
        FROM scoped_run AS existing
        WHERE NOT EXISTS (SELECT 1 FROM mutated_run)
      )
      SELECT "disposition", "replayed",
             EXISTS (SELECT 1 FROM inserted_event) AS "event_written"
      FROM decision
      LIMIT 1
    `);

    const marker = statementRows(result)[0];
    if (!marker) return null;
    const disposition = resultText(marker, "disposition", "disposition");
    if (disposition === "conflict") {
      throw new ExecutionCancellationConflictError();
    }
    if (disposition !== "requested" && disposition !== "cancelled") {
      throw new Error("execution_control: invalid cancellation disposition");
    }
    const run = await this.getRunById(runId);
    if (!run) {
      throw new Error(
        "execution_control: cancellation-authorized run was not found",
      );
    }
    const terminalProjection =
      run.status === "cancelled" && hasManagedTerminalProjectionAuthority(run)
        ? await this.getTerminalProjectionForScope({
            tenantKey: run.tenantKey,
            operation: run.operation,
            mode: run.mode,
            runId: run.id,
          })
        : null;
    if (
      run.status === "cancelled" &&
      hasManagedTerminalProjectionAuthority(run) &&
      !terminalProjection
    ) {
      throw new Error(
        "execution_control: cancelled run projection was not found",
      );
    }
    return {
      run,
      cancellationId,
      disposition,
      replayed: resultBoolean(marker, "replayed", "replayed"),
      ...(terminalProjection ? { terminalProjection } : {}),
    };
  }

  async acknowledgeRunCancellation(
    input: AcknowledgeExecutionRunCancellationInput,
  ): Promise<ExecutionCancellationReceipt | null> {
    const runId = requiredText(input.runId, "runId");
    const { tenantKey, operation, mode } = leasableScope(input);
    const tokenHash = hashExecutionLeaseToken(input.token);
    const cancellationId = cancellationIdentifier(input.cancellationId);
    const safePoint = cancellationSafePoint(input.safePoint);
    assertLeaseTokenNotPersisted(cancellationId, input.token, "cancellationId");
    assertLeaseTokenNotPersisted(
      safePoint,
      input.token,
      "cancellation safePoint",
    );
    const eventId = id("xevt");

    const result = await this.database.execute(drizzleSql`
      WITH cancellation_clock AS (
        SELECT ${databaseUtcClock()} AS "now"
      ), leased_run AS (
        SELECT r.*
        FROM "execution_runs" AS r CROSS JOIN cancellation_clock
        WHERE r."id" = ${runId}
          AND r."tenant_key" = ${tenantKey}
          AND r."operation" = ${operation}
          AND r."mode" = ${mode}
          AND r."status" = 'running'
          AND r."cancel_request_id" = ${cancellationId}
          AND r."cancel_requested_at" IS NOT NULL
          AND r."cancel_acknowledged_at" IS NULL
          AND r."lease_token_hash" = ${tokenHash}
          AND r."lease_expires_at" > cancellation_clock."now"
        FOR UPDATE OF r
      ), cancelled_run AS (
        UPDATE "execution_runs" AS r
        SET
          "status" = 'cancelled',
          "lease_owner" = NULL,
          "lease_token_hash" = NULL,
          "lease_expires_at" = NULL,
          "cancel_acknowledged_at" = cancellation_clock."now",
          "finished_at" = cancellation_clock."now",
          "updated_at" = cancellation_clock."now"
        FROM leased_run, cancellation_clock
        WHERE r."id" = leased_run."id"
        RETURNING r.*
      ), inserted_projection AS (
        INSERT INTO "execution_terminal_projections" (
          "run_id", "tenant_key", "operation", "mode", "terminal_status",
          "state", "available_at", "claim_count", "created_at", "updated_at"
        )
        SELECT cancelled."id", cancelled."tenant_key",
               cancelled."operation", cancelled."mode", cancelled."status",
               'pending', cancellation_clock."now", 0,
               cancellation_clock."now", cancellation_clock."now"
        FROM cancelled_run AS cancelled CROSS JOIN cancellation_clock
        WHERE cancelled."mode" IN ('canary', 'active')
          AND cancelled."metadata"->>'authority' = 'execution_ledger_v2'
        ON CONFLICT ("run_id") DO NOTHING
        RETURNING "run_id"
      ), inserted_event AS (
        INSERT INTO "execution_events" (
          "id", "run_id", "aggregate_type", "aggregate_id", "trace_id",
          "type", "ts", "data"
        )
        SELECT ${eventId}, cancelled."id", cancelled."aggregate_type",
               cancelled."aggregate_id", cancelled."trace_id",
               'run.cancelled', cancellation_clock."now",
               jsonb_build_object(
                 'cancellationId', cancelled."cancel_request_id",
                 'actor', jsonb_build_object(
                   'type', cancelled."cancel_actor_type",
                   'id', cancelled."cancel_actor_id"
                 ),
                 'reasonCode', cancelled."cancel_reason_code",
                 'safePoint', ${safePoint}::text,
                 'cooperative', TRUE
               )
        FROM cancelled_run AS cancelled CROSS JOIN cancellation_clock
        RETURNING "id"
      )
      SELECT 'cancelled'::text AS "disposition", FALSE AS "replayed",
             EXISTS (SELECT 1 FROM inserted_event) AS "event_written"
      FROM cancelled_run
      LIMIT 1
    `);

    const marker = statementRows(result)[0];
    if (!marker) return null;
    const run = await this.getRunById(runId);
    if (!run) {
      throw new Error(
        "execution_control: cancellation-acknowledged run was not found",
      );
    }
    const terminalProjection = hasManagedTerminalProjectionAuthority(run)
      ? await this.getTerminalProjectionForScope({
          tenantKey: run.tenantKey,
          operation: run.operation,
          mode: run.mode,
          runId: run.id,
        })
      : null;
    if (hasManagedTerminalProjectionAuthority(run) && !terminalProjection) {
      throw new Error(
        "execution_control: cancellation projection was not found",
      );
    }
    return {
      run,
      cancellationId,
      disposition: "cancelled",
      replayed: false,
      ...(terminalProjection ? { terminalProjection } : {}),
    };
  }

  async claimRun(
    input: ClaimExecutionRunInput,
  ): Promise<ExecutionLeaseReceipt | null> {
    const runId = requiredText(input.runId, "runId");
    return this.claimEligibleRun(input, drizzleSql`AND r."id" = ${runId}`);
  }

  async claimNextRun(
    input: ClaimNextExecutionRunInput,
  ): Promise<ExecutionLeaseReceipt | null> {
    return this.claimEligibleRun(input, drizzleSql``);
  }

  async listRunnableTenantKeys(
    input: ListRunnableExecutionTenantKeysInput,
  ): Promise<string[]> {
    const operation = normalizedOperation(input.operation);
    if (input.mode !== "canary" && input.mode !== "active") {
      throw new Error(
        "execution_control: runnable tenant mode must be canary or active",
      );
    }
    const limit = boundedReadLimit(input.limit);
    const afterTenantKey = input.afterTenantKey?.trim().toLowerCase();
    const cursor = afterTenantKey
      ? drizzleSql`AND runnable."tenant_key" > ${afterTenantKey}`
      : drizzleSql``;
    const result = await this.database.execute(drizzleSql`
      WITH runnable AS (
        SELECT r."tenant_key"
        FROM "execution_runs" AS r
        WHERE r."operation" = ${operation}
          AND r."mode" = ${input.mode}
          AND r."status" IN ('queued', 'running')
        UNION
        SELECT p."tenant_key"
        FROM "execution_terminal_projections" AS p
        WHERE p."operation" = ${operation}
          AND p."mode" = ${input.mode}
          AND p."state" IN ('pending', 'retry_wait', 'running')
      )
      SELECT runnable."tenant_key"
      FROM runnable
      WHERE btrim(runnable."tenant_key") <> ''
        ${cursor}
      ORDER BY runnable."tenant_key" ASC
      LIMIT ${limit}
    `);
    return statementRows(result)
      .map((row) =>
        String(row.tenantKey ?? row.tenant_key ?? "")
          .trim()
          .toLowerCase(),
      )
      .filter(Boolean);
  }

  async listRunnableScopesPage(
    input: ListRunnableExecutionScopesPageInput,
  ): Promise<RunnableExecutionScopePage> {
    const operations = [
      ...new Set(input.operations.map(normalizedOperation)),
    ].sort();
    if (operations.length < 1 || operations.length > 100) {
      throw new Error(
        "execution_control: runnable scope operations must contain 1 to 100 values",
      );
    }
    const modes = [...new Set(input.modes)];
    if (
      modes.length < 1 ||
      modes.length > 2 ||
      modes.some((mode) => mode !== "canary" && mode !== "active")
    ) {
      throw new Error(
        "execution_control: runnable scope modes must contain canary and/or active",
      );
    }
    modes.sort();
    const limit = boundedReadLimit(input.limit);
    const after = input.after
      ? {
          operation: normalizedOperation(input.after.operation),
          mode: input.after.mode,
          tenantKey: requiredText(
            input.after.tenantKey,
            "after.tenantKey",
          ).toLowerCase(),
        }
      : undefined;
    if (
      after &&
      (!operations.includes(after.operation) || !modes.includes(after.mode))
    ) {
      throw new Error(
        "execution_control: runnable scope cursor is outside the requested capability",
      );
    }

    const operationValues = drizzleSql.join(
      operations.map((operation) => drizzleSql`${operation}`),
      drizzleSql`, `,
    );
    const modeValues = drizzleSql.join(
      modes.map((mode) => drizzleSql`${mode}`),
      drizzleSql`, `,
    );
    const cursor = after
      ? drizzleSql`AND (runnable."operation", runnable."mode", runnable."tenant_key") >
          (${after.operation}, ${after.mode}, ${after.tenantKey})`
      : drizzleSql``;
    // Fetch one extra row so callers never need to guess whether a full page
    // was terminal. The exclusive cursor always names the final returned row.
    const result = await this.database.execute(drizzleSql`
      WITH runnable AS (
        SELECT r."operation", r."mode", r."tenant_key"
        FROM "execution_runs" AS r
        WHERE r."status" IN ('queued', 'running')
        UNION
        SELECT p."operation", p."mode", p."tenant_key"
        FROM "execution_terminal_projections" AS p
        WHERE p."state" IN ('pending', 'retry_wait', 'running')
      )
      SELECT runnable."operation", runnable."mode", runnable."tenant_key"
      FROM runnable
      WHERE runnable."operation" IN (${operationValues})
        AND runnable."mode" IN (${modeValues})
        AND btrim(runnable."tenant_key") <> ''
        ${cursor}
      ORDER BY runnable."operation" ASC, runnable."mode" ASC,
               runnable."tenant_key" ASC
      LIMIT ${limit + 1}
    `);
    const discovered = statementRows(result).map((row) => {
      const operation = resultText(row, "operation", "operation")
        .trim()
        .toLowerCase();
      const tenantKey = resultText(row, "tenantKey", "tenant_key")
        .trim()
        .toLowerCase();
      const mode = resultText(row, "mode", "mode");
      if (mode !== "canary" && mode !== "active") {
        throw new Error(
          "execution_control: runnable scope query returned a non-executable mode",
        );
      }
      return {
        operation,
        mode: mode as "canary" | "active",
        tenantKey,
      };
    });
    const scopes = discovered.slice(0, limit);
    return {
      scopes,
      ...(discovered.length > limit && scopes.length > 0
        ? { nextAfter: { ...scopes[scopes.length - 1] } }
        : {}),
    };
  }

  async listBlockedRunScopesPage(
    input: ListBlockedExecutionRunScopesPageInput,
  ): Promise<BlockedExecutionRunScopePage> {
    const operations = [
      ...new Set(input.operations.map(normalizedOperation)),
    ].sort();
    if (operations.length < 1 || operations.length > 100) {
      throw new Error(
        "execution_control: blocked run operations must contain 1 to 100 values",
      );
    }
    const modes = [...new Set(input.modes)];
    if (
      modes.length < 1 ||
      modes.length > 2 ||
      modes.some((mode) => mode !== "canary" && mode !== "active")
    ) {
      throw new Error(
        "execution_control: blocked run modes must contain canary and/or active",
      );
    }
    modes.sort();
    const limit = boundedReadLimit(input.limit);
    const after = input.after
      ? {
          operation: normalizedOperation(input.after.operation),
          mode: input.after.mode,
          tenantKey: requiredText(
            input.after.tenantKey,
            "after.tenantKey",
          ).toLowerCase(),
        }
      : undefined;
    if (
      after &&
      (!operations.includes(after.operation) || !modes.includes(after.mode))
    ) {
      throw new Error(
        "execution_control: blocked run cursor is outside the requested capability",
      );
    }
    const operationValues = drizzleSql.join(
      operations.map((operation) => drizzleSql`${operation}`),
      drizzleSql`, `,
    );
    const modeValues = drizzleSql.join(
      modes.map((mode) => drizzleSql`${mode}`),
      drizzleSql`, `,
    );
    const cursor = after
      ? drizzleSql`AND (blocked."operation", blocked."mode", blocked."tenant_key") >
          (${after.operation}, ${after.mode}, ${after.tenantKey})`
      : drizzleSql``;
    const result = await this.database.execute(drizzleSql`
      WITH blocked AS (
        SELECT DISTINCT r."operation", r."mode", r."tenant_key"
        FROM "execution_runs" AS r
        WHERE r."status" = 'blocked'
      )
      SELECT blocked."operation", blocked."mode", blocked."tenant_key"
      FROM blocked
      WHERE blocked."operation" IN (${operationValues})
        AND blocked."mode" IN (${modeValues})
        AND btrim(blocked."tenant_key") <> ''
        ${cursor}
      ORDER BY blocked."operation" ASC, blocked."mode" ASC,
               blocked."tenant_key" ASC
      LIMIT ${limit + 1}
    `);
    const discovered = statementRows(result).map((row) => {
      const operation = resultText(row, "operation", "operation")
        .trim()
        .toLowerCase();
      const tenantKey = resultText(row, "tenantKey", "tenant_key")
        .trim()
        .toLowerCase();
      const mode = resultText(row, "mode", "mode");
      if (mode !== "canary" && mode !== "active") {
        throw new Error(
          "execution_control: blocked run query returned a non-executable mode",
        );
      }
      return { operation, mode: mode as "canary" | "active", tenantKey };
    });
    const scopes = discovered.slice(0, limit);
    return {
      scopes,
      ...(discovered.length > limit && scopes.length > 0
        ? { nextAfter: { ...scopes[scopes.length - 1] } }
        : {}),
    };
  }

  async listBlockedProjectionScopesPage(
    input: ListBlockedExecutionProjectionScopesPageInput,
  ): Promise<BlockedExecutionProjectionScopePage> {
    const operations = [
      ...new Set(input.operations.map(normalizedOperation)),
    ].sort();
    if (operations.length < 1 || operations.length > 100) {
      throw new Error(
        "execution_control: blocked projection operations must contain 1 to 100 values",
      );
    }
    const modes = [...new Set(input.modes)];
    if (
      modes.length < 1 ||
      modes.length > 2 ||
      modes.some((mode) => mode !== "canary" && mode !== "active")
    ) {
      throw new Error(
        "execution_control: blocked projection modes must contain canary and/or active",
      );
    }
    modes.sort();
    const limit = boundedReadLimit(input.limit);
    const after = input.after
      ? {
          operation: normalizedOperation(input.after.operation),
          mode: input.after.mode,
          tenantKey: requiredText(
            input.after.tenantKey,
            "after.tenantKey",
          ).toLowerCase(),
        }
      : undefined;
    if (
      after &&
      (!operations.includes(after.operation) || !modes.includes(after.mode))
    ) {
      throw new Error(
        "execution_control: blocked projection cursor is outside the requested capability",
      );
    }
    const operationValues = drizzleSql.join(
      operations.map((operation) => drizzleSql`${operation}`),
      drizzleSql`, `,
    );
    const modeValues = drizzleSql.join(
      modes.map((mode) => drizzleSql`${mode}`),
      drizzleSql`, `,
    );
    const cursor = after
      ? drizzleSql`AND (blocked."operation", blocked."mode", blocked."tenant_key") >
          (${after.operation}, ${after.mode}, ${after.tenantKey})`
      : drizzleSql``;
    const result = await this.database.execute(drizzleSql`
      WITH blocked AS (
        SELECT DISTINCT p."operation", p."mode", p."tenant_key"
        FROM "execution_terminal_projections" AS p
        WHERE p."state" = 'blocked'
      )
      SELECT blocked."operation", blocked."mode", blocked."tenant_key"
      FROM blocked
      WHERE blocked."operation" IN (${operationValues})
        AND blocked."mode" IN (${modeValues})
        AND btrim(blocked."tenant_key") <> ''
        ${cursor}
      ORDER BY blocked."operation" ASC, blocked."mode" ASC,
               blocked."tenant_key" ASC
      LIMIT ${limit + 1}
    `);
    const discovered = statementRows(result).map((row) => {
      const operation = resultText(row, "operation", "operation")
        .trim()
        .toLowerCase();
      const tenantKey = resultText(row, "tenantKey", "tenant_key")
        .trim()
        .toLowerCase();
      const mode = resultText(row, "mode", "mode");
      if (mode !== "canary" && mode !== "active") {
        throw new Error(
          "execution_control: blocked projection query returned a non-executable mode",
        );
      }
      return { operation, mode: mode as "canary" | "active", tenantKey };
    });
    const scopes = discovered.slice(0, limit);
    return {
      scopes,
      ...(discovered.length > limit && scopes.length > 0
        ? { nextAfter: scopes[scopes.length - 1] }
        : {}),
    };
  }

  async prepareEffect(
    input: PrepareExecutionEffectInput,
  ): Promise<PrepareExecutionEffectDisposition | null> {
    const runId = requiredText(input.runId, "runId");
    const { tenantKey, operation, mode } = leasableScope(input);
    const tokenHash = hashExecutionLeaseToken(input.token);
    const stepKey = effectStepKey(input.stepKey);
    const durableEffectKey = effectKey(input.effectKey);
    const capability = effectCapability(input.capability);
    const handlerVersion = effectVersion(
      input.handlerVersion,
      "effect handlerVersion",
    );
    const definitionVersion = effectVersion(
      input.definitionVersion,
      "effect definitionVersion",
    );
    const payloadSchemaVersion = effectVersion(
      input.payloadSchemaVersion,
      "effect payloadSchemaVersion",
    );
    const receiptSchemaVersion = effectVersion(
      input.receiptSchemaVersion,
      "effect receiptSchemaVersion",
    );
    const payloadFingerprint = effectFingerprint(
      input.payloadFingerprint,
      "effect payloadFingerprint",
    );
    const policyFingerprint = effectFingerprint(
      input.policyFingerprint,
      "effect policyFingerprint",
    );
    if (
      input.safety !== "read_only" &&
      input.safety !== "target_idempotency" &&
      input.safety !== "reconcile_before_replay"
    ) {
      throw new Error("execution_control: invalid effect safety");
    }
    const deadlineMs = effectDeadline(input.deadlineMs);
    const maxAttempts = effectMaxAttempts(input.maxAttempts);
    assertLeaseTokenNotPersisted(durableEffectKey, input.token, "effectKey");
    assertLeaseTokenNotPersisted(capability, input.token, "effect capability");
    const effectId = id("xeff");
    const eventId = id("xevt");

    const statement = drizzleSql`
      WITH lease_clock AS (
        SELECT ${databaseUtcClock()} AS "now"
      ), leased_run AS (
        SELECT r."id", r."aggregate_type", r."aggregate_id", r."trace_id"
        FROM "execution_runs" AS r CROSS JOIN lease_clock
        WHERE r."id" = ${runId}
          AND r."tenant_key" = ${tenantKey}
          AND r."operation" = ${operation}
          AND r."mode" = ${mode}
          AND r."status" = 'running'
          AND r."cancel_requested_at" IS NULL
          AND r."lease_token_hash" = ${tokenHash}
          AND r."lease_expires_at" > lease_clock."now"
        FOR UPDATE OF r
      ), observed_effect AS MATERIALIZED (
        SELECT e.*,
               (e."run_id" = ${runId} AND e."step_key" = ${stepKey})
                 AS "same_slot"
        FROM "execution_effects" AS e CROSS JOIN leased_run
        WHERE (e."run_id" = ${runId} AND e."step_key" = ${stepKey})
           OR e."effect_key" = ${durableEffectKey}
        ORDER BY "same_slot" DESC
        LIMIT 1
        FOR UPDATE OF e
      ), inserted_effect AS (
        INSERT INTO "execution_effects" (
          "id", "run_id", "step_key", "effect_key", "handler_version",
          "definition_version", "capability", "safety",
          "payload_schema_version", "payload_fingerprint",
          "policy_fingerprint", "receipt_schema_version", "status",
          "attempt_count", "reconcile_count", "available_at",
          "last_attempt_at", "last_deadline_at", "created_at", "updated_at"
        )
        SELECT
          ${effectId}, "id", ${stepKey}, ${durableEffectKey}, ${handlerVersion},
          ${definitionVersion}, ${capability}, ${input.safety},
          ${payloadSchemaVersion}, ${payloadFingerprint},
          ${policyFingerprint}, ${receiptSchemaVersion}, 'prepared',
          1, 0, lease_clock."now", lease_clock."now",
          lease_clock."now" + (${deadlineMs} * interval '1 millisecond'),
          lease_clock."now", lease_clock."now"
        FROM leased_run CROSS JOIN lease_clock
        WHERE NOT EXISTS (SELECT 1 FROM observed_effect)
        ON CONFLICT DO NOTHING
        RETURNING *, TRUE AS "inserted"
      ), immutable_effect AS (
        SELECT e.*
        FROM observed_effect AS e
        WHERE e."same_slot"
          AND e."effect_key" = ${durableEffectKey}
          AND e."handler_version" = ${handlerVersion}
          AND e."definition_version" = ${definitionVersion}
          AND e."capability" = ${capability}
          AND e."safety" = ${input.safety}
          AND e."payload_schema_version" = ${payloadSchemaVersion}
          AND e."payload_fingerprint" = ${payloadFingerprint}
          AND e."policy_fingerprint" = ${policyFingerprint}
          AND e."receipt_schema_version" = ${receiptSchemaVersion}
      ), authorized_effect AS (
        UPDATE "execution_effects" AS e
        SET
          "status" = 'prepared',
          "attempt_count" = e."attempt_count" + 1,
          "last_error_code" = NULL,
          "available_at" = lease_clock."now",
          "last_attempt_at" = lease_clock."now",
          "last_deadline_at" = lease_clock."now"
            + (${deadlineMs} * interval '1 millisecond'),
          "finished_at" = NULL,
          "updated_at" = lease_clock."now"
        FROM immutable_effect, lease_clock
        WHERE e."id" = immutable_effect."id"
          AND e."status" IN ('prepared', 'retry_wait', 'uncertain')
          AND e."available_at" <= lease_clock."now"
          AND e."attempt_count" < ${maxAttempts}
          AND (
            e."status" = 'retry_wait'
            OR e."last_error_code" = 'effect_reconcile_not_found'
            OR (
              e."status" IN ('prepared', 'uncertain')
              AND e."last_deadline_at" IS NOT NULL
              AND e."last_deadline_at" <= lease_clock."now"
            )
          )
          AND NOT (
            e."safety" = 'reconcile_before_replay'
            AND e."status" IN ('prepared', 'uncertain')
            AND e."last_error_code" IS DISTINCT FROM
              'effect_reconcile_not_found'
          )
        RETURNING e.*, FALSE AS "inserted"
      ), invoked_effect AS (
        SELECT * FROM inserted_effect
        UNION ALL
        SELECT * FROM authorized_effect
      ), inserted_event AS (
        INSERT INTO "execution_events" (
          "id", "run_id", "aggregate_type", "aggregate_id", "trace_id",
          "type", "ts", "data"
        )
        SELECT ${eventId}, invoked."run_id", run."aggregate_type",
               run."aggregate_id", run."trace_id", 'effect.prepared',
               lease_clock."now",
               jsonb_build_object(
                 'step', invoked."step_key",
                 'capability', invoked."capability",
                 'attempt', invoked."attempt_count"
               )
        FROM invoked_effect AS invoked
        JOIN leased_run AS run ON run."id" = invoked."run_id"
        CROSS JOIN lease_clock
        RETURNING "id"
      ), decision AS (
        SELECT 'invoke'::text AS "disposition" FROM invoked_effect
        UNION ALL
        SELECT CASE
          WHEN NOT EXISTS (
            SELECT 1 FROM immutable_effect
            WHERE immutable_effect."id" = observed."id"
          ) THEN 'conflict'
          WHEN observed."status" = 'succeeded' THEN 'return_receipt'
          WHEN observed."safety" = 'reconcile_before_replay'
            AND observed."status" IN ('prepared', 'uncertain')
            AND observed."last_error_code" IS DISTINCT FROM
              'effect_reconcile_not_found'
            AND observed."available_at" <= lease_clock."now"
            AND observed."last_deadline_at" IS NOT NULL
            AND observed."last_deadline_at" <= lease_clock."now"
            THEN 'reconcile'
          ELSE 'retry_wait'
        END AS "disposition"
        FROM observed_effect AS observed CROSS JOIN lease_clock
        WHERE NOT EXISTS (
          SELECT 1 FROM authorized_effect
          WHERE authorized_effect."id" = observed."id"
        )
      )
      SELECT "disposition",
             EXISTS (SELECT 1 FROM inserted_event) AS "event_written"
      FROM decision
      LIMIT 1
    `;

    let result = await this.database.execute(statement);
    let marker = statementRows(result)[0];
    if (!marker) {
      // A concurrent first prepare may win the unique slot after this
      // READ COMMITTED statement took its snapshot. Retry once with a fresh
      // database snapshot; invalid/cancelled/stale leases still return null.
      result = await this.database.execute(statement);
      marker = statementRows(result)[0];
    }

    if (!marker) return null;
    const disposition = resultText(marker, "disposition", "disposition");
    if (disposition === "conflict") {
      throw new ExecutionEffectConflictError();
    }
    const effect = await this.getEffectForScope({
      tenantKey,
      operation,
      mode,
      runId,
      stepKey,
    });
    if (!effect) {
      throw new Error("execution_control: prepared effect was not found");
    }
    if (
      disposition !== "invoke" &&
      disposition !== "reconcile" &&
      disposition !== "return_receipt" &&
      disposition !== "retry_wait"
    ) {
      throw new Error("execution_control: invalid effect disposition");
    }
    return { kind: disposition, effect };
  }

  async completeEffect(
    input: CompleteExecutionEffectInput,
  ): Promise<ExecutionEffect | null> {
    const runId = requiredText(input.runId, "runId");
    const { tenantKey, operation, mode } = leasableScope(input);
    const tokenHash = hashExecutionLeaseToken(input.token);
    const stepKey = effectStepKey(input.stepKey);
    const payloadFingerprint = effectFingerprint(
      input.payloadFingerprint,
      "effect payloadFingerprint",
    );
    const policyFingerprint = effectFingerprint(
      input.policyFingerprint,
      "effect policyFingerprint",
    );
    const receiptFingerprint = effectFingerprint(
      input.receiptFingerprint,
      "effect receiptFingerprint",
    );
    const receipt = boundedEffectReceipt(input.receipt);
    assertLeaseTokenNotPersisted(receipt, input.token, "effect receipt");
    const eventId = id("xevt");

    const result = await this.database.execute(drizzleSql`
      WITH lease_clock AS (
        SELECT ${databaseUtcClock()} AS "now"
      ), leased_run AS (
        SELECT r."id", r."aggregate_type", r."aggregate_id", r."trace_id"
        FROM "execution_runs" AS r CROSS JOIN lease_clock
        WHERE r."id" = ${runId}
          AND r."tenant_key" = ${tenantKey}
          AND r."operation" = ${operation}
          AND r."mode" = ${mode}
          AND r."status" = 'running'
          AND r."lease_token_hash" = ${tokenHash}
          AND r."lease_expires_at" > lease_clock."now"
        FOR UPDATE OF r
      ), observed_effect AS MATERIALIZED (
        SELECT e.*
        FROM "execution_effects" AS e JOIN leased_run AS run
          ON run."id" = e."run_id"
        WHERE e."step_key" = ${stepKey}
        FOR UPDATE OF e
      ), completed_effect AS (
        UPDATE "execution_effects" AS e
        SET
          "status" = 'succeeded',
          "receipt" = ${jsonValue(receipt)},
          "receipt_fingerprint" = ${receiptFingerprint},
          "last_error_code" = NULL,
          "finished_at" = lease_clock."now",
          "updated_at" = lease_clock."now"
        FROM observed_effect, lease_clock
        WHERE e."id" = observed_effect."id"
          AND observed_effect."payload_fingerprint" = ${payloadFingerprint}
          AND observed_effect."policy_fingerprint" = ${policyFingerprint}
          AND observed_effect."status" IN (
            'prepared', 'retry_wait', 'uncertain'
          )
        RETURNING e.*
      ), inserted_event AS (
        INSERT INTO "execution_events" (
          "id", "run_id", "aggregate_type", "aggregate_id", "trace_id",
          "type", "ts", "data"
        )
        SELECT ${eventId}, completed."run_id", run."aggregate_type",
               run."aggregate_id", run."trace_id", 'effect.succeeded',
               lease_clock."now",
               jsonb_build_object(
                 'step', completed."step_key",
                 'receiptSchemaVersion', completed."receipt_schema_version"
               )
        FROM completed_effect AS completed
        JOIN leased_run AS run ON run."id" = completed."run_id"
        CROSS JOIN lease_clock
        RETURNING "id"
      ), decision AS (
        SELECT 'completed'::text AS "disposition" FROM completed_effect
        UNION ALL
        SELECT CASE
          WHEN observed."payload_fingerprint" <> ${payloadFingerprint}
            OR observed."policy_fingerprint" <> ${policyFingerprint}
            THEN 'conflict'
          WHEN observed."status" = 'succeeded'
            AND (
              observed."receipt_fingerprint" <> ${receiptFingerprint}
              OR observed."receipt" IS DISTINCT FROM ${jsonValue(receipt)}
            ) THEN 'conflict'
          WHEN observed."status" = 'succeeded' THEN 'existing'
          ELSE 'blocked'
        END AS "disposition"
        FROM observed_effect AS observed
        WHERE NOT EXISTS (
          SELECT 1 FROM completed_effect
          WHERE completed_effect."id" = observed."id"
        )
      )
      SELECT "disposition",
             EXISTS (SELECT 1 FROM inserted_event) AS "event_written"
      FROM decision
      LIMIT 1
    `);

    const marker = statementRows(result)[0];
    if (!marker) return null;
    const disposition = resultText(marker, "disposition", "disposition");
    if (disposition === "conflict") {
      throw new ExecutionEffectConflictError();
    }
    if (disposition === "blocked") return null;
    if (disposition !== "completed" && disposition !== "existing") {
      throw new Error("execution_control: invalid effect completion result");
    }
    return this.getEffectForScope({
      tenantKey,
      operation,
      mode,
      runId,
      stepKey,
    });
  }

  async recordEffectFailure(
    input: RecordExecutionEffectFailureInput,
  ): Promise<ExecutionEffect | null> {
    const runId = requiredText(input.runId, "runId");
    const { tenantKey, operation, mode } = leasableScope(input);
    const tokenHash = hashExecutionLeaseToken(input.token);
    const stepKey = effectStepKey(input.stepKey);
    const errorCode = effectErrorCode(input.errorCode);
    const availableAt = validEffectDate(input.availableAt, "availableAt");
    if (
      input.classification !== "definitive_rejection" &&
      input.classification !== "outcome_unknown"
    ) {
      throw new Error(
        "execution_control: invalid effect failure classification",
      );
    }
    assertLeaseTokenNotPersisted(errorCode, input.token, "effect errorCode");
    const terminal = input.terminal === true;
    const nextStatus = terminal
      ? "failed"
      : input.classification === "outcome_unknown"
        ? "uncertain"
        : "retry_wait";
    const eventType = terminal
      ? "effect.failed"
      : input.classification === "outcome_unknown"
        ? "effect.uncertain"
        : "effect.retry_scheduled";
    const availableAtValue = availableAt
      ? timestampValue(availableAt)
      : drizzleSql`NULL::timestamp`;
    const eventId = id("xevt");

    const result = await this.database.execute(drizzleSql`
      WITH lease_clock AS (
        SELECT ${databaseUtcClock()} AS "now"
      ), leased_run AS (
        SELECT r."id", r."aggregate_type", r."aggregate_id", r."trace_id"
        FROM "execution_runs" AS r CROSS JOIN lease_clock
        WHERE r."id" = ${runId}
          AND r."tenant_key" = ${tenantKey}
          AND r."operation" = ${operation}
          AND r."mode" = ${mode}
          AND r."status" = 'running'
          AND r."lease_token_hash" = ${tokenHash}
          AND r."lease_expires_at" > lease_clock."now"
        FOR UPDATE OF r
      ), failed_effect AS (
        UPDATE "execution_effects" AS e
        SET
          "status" = ${nextStatus},
          "last_error_code" = ${errorCode},
          "available_at" = COALESCE(${availableAtValue}, lease_clock."now"),
          "finished_at" = CASE WHEN ${terminal}
            THEN lease_clock."now" ELSE NULL END,
          "updated_at" = lease_clock."now"
        FROM leased_run AS run, lease_clock
        WHERE e."run_id" = run."id"
          AND e."step_key" = ${stepKey}
          AND e."status" IN ('prepared', 'retry_wait', 'uncertain')
        RETURNING e.*
      ), inserted_event AS (
        INSERT INTO "execution_events" (
          "id", "run_id", "aggregate_type", "aggregate_id", "trace_id",
          "type", "ts", "data"
        )
        SELECT ${eventId}, effect."run_id", run."aggregate_type",
               run."aggregate_id", run."trace_id", ${eventType},
               lease_clock."now",
               CASE WHEN ${eventType === "effect.retry_scheduled"}
                 THEN jsonb_build_object(
                   'step', effect."step_key",
                   'errorCode', effect."last_error_code",
                   'delayMs', GREATEST(
                     0,
                     floor(extract(epoch FROM (
                       effect."available_at" - lease_clock."now"
                     )) * 1000)::bigint
                   )
                 )
                 ELSE jsonb_build_object(
                   'step', effect."step_key",
                   'errorCode', effect."last_error_code"
                 )
               END
        FROM failed_effect AS effect
        JOIN leased_run AS run ON run."id" = effect."run_id"
        CROSS JOIN lease_clock
        RETURNING "id"
      )
      SELECT effect."id" AS "effect_id",
             EXISTS (SELECT 1 FROM inserted_event) AS "event_written"
      FROM failed_effect AS effect
    `);

    if (statementRows(result).length === 0) return null;
    return this.getEffectForScope({
      tenantKey,
      operation,
      mode,
      runId,
      stepKey,
    });
  }

  async recordEffectReconcile(
    input: RecordExecutionEffectReconcileInput,
  ): Promise<ExecutionEffect | null> {
    const runId = requiredText(input.runId, "runId");
    const { tenantKey, operation, mode } = leasableScope(input);
    const tokenHash = hashExecutionLeaseToken(input.token);
    const stepKey = effectStepKey(input.stepKey);
    if (
      input.outcome !== "found" &&
      input.outcome !== "not_found" &&
      input.outcome !== "unknown" &&
      input.outcome !== "conflict"
    ) {
      throw new Error("execution_control: invalid effect reconcile outcome");
    }
    const availableAt = validEffectDate(input.availableAt, "availableAt");
    const reconcileErrorCode =
      input.outcome === "conflict" && input.errorCode
        ? effectErrorCode(input.errorCode)
        : undefined;
    if (input.outcome === "conflict" && !reconcileErrorCode) {
      throw new Error(
        "execution_control: reconcile conflict requires errorCode",
      );
    }
    if (input.outcome !== "conflict" && input.errorCode !== undefined) {
      throw new Error(
        "execution_control: reconcile errorCode is only valid for conflict",
      );
    }
    if (input.outcome !== "unknown" && availableAt) {
      throw new Error(
        "execution_control: reconcile availableAt is only valid for unknown",
      );
    }
    const receipt =
      input.outcome === "found" && input.receipt
        ? boundedEffectReceipt(input.receipt)
        : undefined;
    const receiptFingerprint =
      input.outcome === "found" && input.receiptFingerprint
        ? effectFingerprint(
            input.receiptFingerprint,
            "effect receiptFingerprint",
          )
        : undefined;
    if (input.outcome === "found" && (!receipt || !receiptFingerprint)) {
      throw new Error(
        "execution_control: reconcile found requires receipt and fingerprint",
      );
    }
    if (
      input.outcome !== "found" &&
      (input.receipt !== undefined || input.receiptFingerprint !== undefined)
    ) {
      throw new Error(
        "execution_control: reconcile receipt is only valid for found",
      );
    }
    assertLeaseTokenNotPersisted(receipt, input.token, "effect receipt");
    assertLeaseTokenNotPersisted(
      reconcileErrorCode,
      input.token,
      "effect reconcile errorCode",
    );
    const nextStatus =
      input.outcome === "found"
        ? "succeeded"
        : input.outcome === "conflict"
          ? "failed"
          : input.outcome === "unknown"
            ? "uncertain"
            : "prepared";
    const availableAtValue = availableAt
      ? timestampValue(availableAt)
      : drizzleSql`NULL::timestamp`;
    const eventId = id("xevt");

    const result = await this.database.execute(drizzleSql`
      WITH lease_clock AS (
        SELECT ${databaseUtcClock()} AS "now"
      ), leased_run AS (
        SELECT r."id", r."aggregate_type", r."aggregate_id", r."trace_id"
        FROM "execution_runs" AS r CROSS JOIN lease_clock
        WHERE r."id" = ${runId}
          AND r."tenant_key" = ${tenantKey}
          AND r."operation" = ${operation}
          AND r."mode" = ${mode}
          AND r."status" = 'running'
          AND r."lease_token_hash" = ${tokenHash}
          AND r."lease_expires_at" > lease_clock."now"
        FOR UPDATE OF r
      ), reconciled_effect AS (
        UPDATE "execution_effects" AS e
        SET
          "status" = ${nextStatus},
          "reconcile_count" = e."reconcile_count" + 1,
          "receipt" = CASE WHEN ${input.outcome === "found"}
            THEN ${jsonValue(receipt)} ELSE NULL END,
          "receipt_fingerprint" = CASE WHEN ${input.outcome === "found"}
            THEN ${receiptFingerprint ?? null} ELSE NULL END,
          "last_error_code" = CASE
            WHEN ${input.outcome === "unknown"}
              THEN 'effect_reconcile_unknown'
            WHEN ${input.outcome === "not_found"}
              THEN 'effect_reconcile_not_found'
            WHEN ${input.outcome === "conflict"}
              THEN ${reconcileErrorCode ?? null}
            ELSE NULL
          END,
          "available_at" = CASE WHEN ${input.outcome === "unknown"}
            THEN COALESCE(${availableAtValue}, lease_clock."now")
            ELSE lease_clock."now" END,
          "finished_at" = CASE WHEN ${
            input.outcome === "found" || input.outcome === "conflict"
          }
            THEN lease_clock."now" ELSE NULL END,
          "updated_at" = lease_clock."now"
        FROM leased_run AS run, lease_clock
        WHERE e."run_id" = run."id"
          AND e."step_key" = ${stepKey}
          AND e."status" IN ('prepared', 'uncertain')
        RETURNING e.*
      ), inserted_event AS (
        INSERT INTO "execution_events" (
          "id", "run_id", "aggregate_type", "aggregate_id", "trace_id",
          "type", "ts", "data"
        )
        SELECT ${eventId}, effect."run_id", run."aggregate_type",
               run."aggregate_id", run."trace_id", 'effect.reconciled',
               lease_clock."now",
               jsonb_build_object(
                 'step', effect."step_key",
                 'outcome', ${input.outcome}::text,
                 'errorCode', ${reconcileErrorCode ?? null}::text
               )
        FROM reconciled_effect AS effect
        JOIN leased_run AS run ON run."id" = effect."run_id"
        CROSS JOIN lease_clock
        RETURNING "id"
      )
      SELECT effect."id" AS "effect_id",
             EXISTS (SELECT 1 FROM inserted_event) AS "event_written"
      FROM reconciled_effect AS effect
    `);

    if (statementRows(result).length === 0) return null;
    return this.getEffectForScope({
      tenantKey,
      operation,
      mode,
      runId,
      stepKey,
    });
  }

  async renewRunLease(
    input: RenewExecutionRunLeaseInput,
  ): Promise<ExecutionLeaseReceipt | null> {
    const runId = requiredText(input.runId, "runId");
    const { tenantKey, operation, mode } = leasableScope(input);
    const tokenHash = hashExecutionLeaseToken(input.token);
    const leaseMs = leaseDuration(input.leaseMs);

    const result = await this.database.execute(drizzleSql`
      WITH lease_clock AS (
        SELECT ${databaseUtcClock()} AS "now"
      ), renewed_run AS (
        UPDATE "execution_runs" AS r
        SET
          "lease_expires_at" = lease_clock."now"
            + (${leaseMs} * interval '1 millisecond'),
          "updated_at" = lease_clock."now"
        FROM lease_clock
        WHERE r."id" = ${runId}
          AND r."tenant_key" = ${tenantKey}
          AND r."operation" = ${operation}
          AND r."mode" = ${mode}
          AND r."status" = 'running'
          AND r."lease_token_hash" = ${tokenHash}
          AND r."lease_expires_at" > lease_clock."now"
        RETURNING r."id", r."lease_expires_at"
      )
      SELECT "id" AS "run_id", "lease_expires_at"
      FROM renewed_run
    `);

    const marker = statementRows(result)[0];
    if (!marker) return null;
    const run = await this.getRunById(runId);
    if (!run) {
      throw new Error(`execution_control: renewed run ${runId} was not found`);
    }
    return {
      run,
      token: input.token,
      expiresAt: resultTimestamp(marker, "leaseExpiresAt", "lease_expires_at"),
      recovered: false,
    };
  }

  async checkpointRun(
    input: CheckpointExecutionRunInput,
  ): Promise<ExecutionRun | null> {
    const runId = requiredText(input.runId, "runId");
    const currentStep = requiredText(input.currentStep, "currentStep");
    const eventType = requiredText(input.eventType, "event type");
    const { tenantKey, operation, mode } = leasableScope(input);
    const tokenHash = hashExecutionLeaseToken(input.token);
    const eventId = id("xevt");
    const hasOutput = Object.prototype.hasOwnProperty.call(input, "output");
    const incrementHandlerAttempt = input.incrementHandlerAttempt === true;
    assertLeaseTokenNotPersisted(eventType, input.token, "event type");
    assertLeaseTokenNotPersisted(
      input.output,
      input.token,
      "checkpoint output",
    );
    assertLeaseTokenNotPersisted(
      input.eventData,
      input.token,
      "checkpoint eventData",
    );
    const eventData = input.eventData ?? { currentStep };

    const result = await this.database.execute(drizzleSql`
      WITH lease_clock AS (
        SELECT ${databaseUtcClock()} AS "now"
      ), checkpointed_run AS (
        UPDATE "execution_runs" AS r
        SET
          "current_step" = ${currentStep},
          "output" = CASE WHEN ${hasOutput}
            THEN ${jsonValue(input.output)} ELSE r."output" END,
          "handler_attempt" = r."handler_attempt"
            + CASE WHEN ${incrementHandlerAttempt} THEN 1 ELSE 0 END,
          "updated_at" = lease_clock."now"
        FROM lease_clock
        WHERE r."id" = ${runId}
          AND r."tenant_key" = ${tenantKey}
          AND r."operation" = ${operation}
          AND r."mode" = ${mode}
          AND r."status" = 'running'
          AND r."lease_token_hash" = ${tokenHash}
          AND r."lease_expires_at" > lease_clock."now"
        RETURNING r."id", r."aggregate_type", r."aggregate_id", r."trace_id"
      ), inserted_event AS (
        INSERT INTO "execution_events" (
          "id", "run_id", "aggregate_type", "aggregate_id", "trace_id",
          "type", "ts", "data"
        )
        SELECT ${eventId}, "id", "aggregate_type", "aggregate_id", "trace_id",
               ${eventType}, lease_clock."now", ${jsonValue(eventData)}
        FROM checkpointed_run CROSS JOIN lease_clock
        RETURNING "id"
      )
      SELECT "id" AS "run_id",
             EXISTS (SELECT 1 FROM inserted_event) AS "event_written"
      FROM checkpointed_run
    `);

    if (statementRows(result).length === 0) return null;
    return this.getRunById(runId);
  }

  async requeueRun(
    input: RequeueExecutionRunInput,
  ): Promise<ExecutionRun | null> {
    const runId = requiredText(input.runId, "runId");
    const { tenantKey, operation, mode } = leasableScope(input);
    const tokenHash = hashExecutionLeaseToken(input.token);
    const eventId = id("xevt");
    const hasCurrentStep = Object.prototype.hasOwnProperty.call(
      input,
      "currentStep",
    );
    const currentStep =
      typeof input.currentStep === "string"
        ? requiredText(input.currentStep, "currentStep")
        : null;
    const retryError = requiredText(input.error, "error");
    assertLeaseTokenNotPersisted(currentStep, input.token, "currentStep");
    assertLeaseTokenNotPersisted(retryError, input.token, "retry error");
    assertLeaseTokenNotPersisted(
      input.eventData,
      input.token,
      "retry eventData",
    );
    if (Number.isNaN(input.availableAt.getTime())) {
      throw new Error("execution_control: availableAt must be a valid date");
    }
    const retryEventData =
      input.eventData === undefined
        ? drizzleSql`jsonb_build_object(
            'availableAt', to_char(
              "available_at", 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
            ),
            'currentStep', "current_step",
            'error', "error"
          )`
        : jsonValue(input.eventData);

    const result = await this.database.execute(drizzleSql`
      WITH lease_clock AS (
        SELECT ${databaseUtcClock()} AS "now"
      ), requeued_run AS (
        UPDATE "execution_runs" AS r
        SET
          "status" = 'queued',
          "available_at" = ${timestampValue(input.availableAt)},
          "lease_owner" = NULL,
          "lease_token_hash" = NULL,
          "lease_expires_at" = NULL,
          "current_step" = CASE WHEN ${hasCurrentStep}
            THEN ${currentStep} ELSE r."current_step" END,
          "error" = ${retryError},
          "updated_at" = lease_clock."now"
        FROM lease_clock
        WHERE r."id" = ${runId}
          AND r."tenant_key" = ${tenantKey}
          AND r."operation" = ${operation}
          AND r."mode" = ${mode}
          AND r."status" = 'running'
          AND r."cancel_requested_at" IS NULL
          AND r."lease_token_hash" = ${tokenHash}
          AND r."lease_expires_at" > lease_clock."now"
        RETURNING r."id", r."aggregate_type", r."aggregate_id", r."trace_id",
                  r."available_at", r."current_step", r."error"
      ), inserted_event AS (
        INSERT INTO "execution_events" (
          "id", "run_id", "aggregate_type", "aggregate_id", "trace_id",
          "type", "ts", "data"
        )
        SELECT ${eventId}, "id", "aggregate_type", "aggregate_id", "trace_id",
               'run.retry_scheduled', lease_clock."now",
               ${retryEventData}
        FROM requeued_run CROSS JOIN lease_clock
        RETURNING "id"
      )
      SELECT "id" AS "run_id",
             EXISTS (SELECT 1 FROM inserted_event) AS "event_written"
      FROM requeued_run
    `);

    if (statementRows(result).length === 0) return null;
    return this.getRunById(runId);
  }

  async blockRun(input: BlockExecutionRunInput): Promise<ExecutionRun | null> {
    const runId = requiredText(input.runId, "runId");
    const { tenantKey, operation, mode } = leasableScope(input);
    const tokenHash = hashExecutionLeaseToken(input.token);
    const reasonCode = executionRunBlockReason(input.reasonCode);
    const eventId = id("xevt");
    assertLeaseTokenNotPersisted(reasonCode, input.token, "block reasonCode");

    const result = await this.database.execute(drizzleSql`
      WITH block_clock AS (
        SELECT ${databaseUtcClock()} AS "now"
      ), blocked_or_cancelled_run AS (
        UPDATE "execution_runs" AS r
        SET
          "status" = CASE
            WHEN r."cancel_requested_at" IS NOT NULL THEN 'cancelled'
            ELSE 'blocked'
          END,
          "blocked_reason_code" = CASE
            WHEN r."cancel_requested_at" IS NOT NULL THEN NULL
            ELSE ${reasonCode}
          END,
          "blocked_at" = CASE
            WHEN r."cancel_requested_at" IS NOT NULL THEN NULL
            ELSE block_clock."now"
          END,
          "lease_owner" = NULL,
          "lease_token_hash" = NULL,
          "lease_expires_at" = NULL,
          "cancel_acknowledged_at" = CASE
            WHEN r."cancel_requested_at" IS NOT NULL THEN block_clock."now"
            ELSE r."cancel_acknowledged_at"
          END,
          "error" = CASE
            WHEN r."cancel_requested_at" IS NOT NULL THEN r."error"
            ELSE ${`Durable execution blocked (${reasonCode})`}
          END,
          "finished_at" = CASE
            WHEN r."cancel_requested_at" IS NOT NULL THEN block_clock."now"
            ELSE NULL
          END,
          "updated_at" = block_clock."now"
        FROM block_clock
        WHERE r."id" = ${runId}
          AND r."tenant_key" = ${tenantKey}
          AND r."operation" = ${operation}
          AND r."mode" = ${mode}
          AND r."status" = 'running'
          AND r."cancel_acknowledged_at" IS NULL
          AND r."lease_token_hash" = ${tokenHash}
          AND r."lease_expires_at" > block_clock."now"
        RETURNING r.*
      ), inserted_projection AS (
        INSERT INTO "execution_terminal_projections" (
          "run_id", "tenant_key", "operation", "mode", "terminal_status",
          "state", "available_at", "claim_count", "created_at", "updated_at"
        )
        SELECT changed."id", changed."tenant_key", changed."operation",
               changed."mode", changed."status", 'pending',
               block_clock."now", 0, block_clock."now", block_clock."now"
        FROM blocked_or_cancelled_run AS changed CROSS JOIN block_clock
        WHERE changed."status" = 'cancelled'
          AND changed."mode" IN ('canary', 'active')
          AND changed."metadata"->>'authority' = 'execution_ledger_v2'
        ON CONFLICT ("run_id") DO NOTHING
        RETURNING "run_id"
      ), inserted_event AS (
        INSERT INTO "execution_events" (
          "id", "run_id", "aggregate_type", "aggregate_id", "trace_id",
          "type", "ts", "data"
        )
        SELECT ${eventId}, changed."id", changed."aggregate_type",
               changed."aggregate_id", changed."trace_id",
               CASE WHEN changed."status" = 'cancelled'
                 THEN 'run.cancelled' ELSE 'run.blocked' END,
               block_clock."now",
               CASE WHEN changed."status" = 'cancelled'
                 THEN jsonb_build_object(
                   'cancellationId', changed."cancel_request_id",
                   'actor', jsonb_build_object(
                     'type', changed."cancel_actor_type",
                     'id', changed."cancel_actor_id"
                   ),
                   'reasonCode', changed."cancel_reason_code",
                   'safePoint', 'before_block',
                   'cooperative', TRUE,
                   'blockedReasonCode', ${reasonCode}::text,
                   'remoteEffectsReverted', FALSE
                 )
                 ELSE jsonb_build_object('reasonCode', ${reasonCode}::text)
               END
        FROM blocked_or_cancelled_run AS changed CROSS JOIN block_clock
        RETURNING "id"
      )
      SELECT "id" AS "run_id",
             EXISTS (SELECT 1 FROM inserted_event) AS "event_written"
      FROM blocked_or_cancelled_run
    `);

    if (statementRows(result).length === 0) return null;
    return this.getRunById(runId);
  }

  async resumeBlockedRun(
    input: ResumeBlockedExecutionRunInput,
  ): Promise<ExecutionRun | null> {
    const runId = requiredText(input.runId, "runId");
    const { tenantKey, operation, mode } = leasableScope(input);
    const expectedReasonCode = executionRunBlockReason(
      input.expectedReasonCode,
    );
    const eventId = id("xevt");

    const result = await this.database.execute(drizzleSql`
      WITH resume_clock AS (
        SELECT ${databaseUtcClock()} AS "now"
      ), resumed_run AS (
        UPDATE "execution_runs" AS r
        SET
          "status" = 'queued',
          "available_at" = resume_clock."now",
          "blocked_reason_code" = NULL,
          "blocked_at" = NULL,
          "lease_owner" = NULL,
          "lease_token_hash" = NULL,
          "lease_expires_at" = NULL,
          "error" = NULL,
          "finished_at" = NULL,
          "updated_at" = resume_clock."now"
        FROM resume_clock
        WHERE r."id" = ${runId}
          AND r."tenant_key" = ${tenantKey}
          AND r."operation" = ${operation}
          AND r."mode" = ${mode}
          AND r."status" = 'blocked'
          AND r."blocked_reason_code" = ${expectedReasonCode}
          AND r."cancel_requested_at" IS NULL
        RETURNING r."id", r."aggregate_type", r."aggregate_id", r."trace_id"
      ), inserted_event AS (
        INSERT INTO "execution_events" (
          "id", "run_id", "aggregate_type", "aggregate_id", "trace_id",
          "type", "ts", "data"
        )
        SELECT ${eventId}, "id", "aggregate_type", "aggregate_id", "trace_id",
               'run.resumed', resume_clock."now",
               jsonb_build_object('reasonCode', ${expectedReasonCode}::text)
        FROM resumed_run CROSS JOIN resume_clock
        RETURNING "id"
      )
      SELECT "id" AS "run_id",
             EXISTS (SELECT 1 FROM inserted_event) AS "event_written"
      FROM resumed_run
    `);

    if (statementRows(result).length === 0) return null;
    return this.getRunById(runId);
  }

  async finishRun(
    input: FinishExecutionRunInput,
  ): Promise<ExecutionRun | null> {
    const runId = requiredText(input.runId, "runId");
    const { tenantKey, operation, mode } = leasableScope(input);
    const tokenHash = hashExecutionLeaseToken(input.token);
    if (
      input.status !== "completed" &&
      input.status !== "partial" &&
      input.status !== "failed"
    ) {
      throw new Error(
        "execution_control: finish status must be completed, partial or failed",
      );
    }
    const eventId = id("xevt");
    const eventType = requiredText(input.eventType, "event type");
    const hasCurrentStep = Object.prototype.hasOwnProperty.call(
      input,
      "currentStep",
    );
    const currentStep =
      typeof input.currentStep === "string"
        ? requiredText(input.currentStep, "currentStep")
        : null;
    const hasOutput = Object.prototype.hasOwnProperty.call(input, "output");
    const hasError = Object.prototype.hasOwnProperty.call(input, "error");
    assertLeaseTokenNotPersisted(eventType, input.token, "event type");
    assertLeaseTokenNotPersisted(currentStep, input.token, "currentStep");
    assertLeaseTokenNotPersisted(input.output, input.token, "finish output");
    assertLeaseTokenNotPersisted(input.error, input.token, "finish error");
    assertLeaseTokenNotPersisted(
      input.eventData,
      input.token,
      "finish eventData",
    );
    const terminalEventData =
      input.eventData === undefined
        ? drizzleSql`jsonb_build_object(
            'status', "status",
            'currentStep', "current_step"
          )`
        : jsonValue(input.eventData);

    const result = await this.database.execute(drizzleSql`
      WITH lease_clock AS (
        SELECT ${databaseUtcClock()} AS "now"
      ), finished_run AS (
        UPDATE "execution_runs" AS r
        SET
          "status" = ${input.status},
          "lease_owner" = NULL,
          "lease_token_hash" = NULL,
          "lease_expires_at" = NULL,
          "current_step" = CASE WHEN ${hasCurrentStep}
            THEN ${currentStep} ELSE r."current_step" END,
          "output" = CASE WHEN ${hasOutput}
            THEN ${jsonValue(input.output)} ELSE r."output" END,
          "error" = CASE WHEN ${hasError}
            THEN ${input.error ?? null} ELSE r."error" END,
          "finished_at" = lease_clock."now",
          "updated_at" = lease_clock."now"
        FROM lease_clock
        WHERE r."id" = ${runId}
          AND r."tenant_key" = ${tenantKey}
          AND r."operation" = ${operation}
          AND r."mode" = ${mode}
          AND r."status" = 'running'
          AND r."cancel_requested_at" IS NULL
          AND r."lease_token_hash" = ${tokenHash}
          AND r."lease_expires_at" > lease_clock."now"
        RETURNING r."id", r."tenant_key", r."operation", r."mode",
                  r."metadata",
                  r."aggregate_type", r."aggregate_id", r."trace_id",
                  r."status", r."current_step"
      ), inserted_projection AS (
        INSERT INTO "execution_terminal_projections" (
          "run_id", "tenant_key", "operation", "mode", "terminal_status",
          "state", "available_at", "claim_count", "created_at", "updated_at"
        )
        SELECT "id", "tenant_key", "operation", "mode", "status", 'pending',
               lease_clock."now", 0, lease_clock."now", lease_clock."now"
        FROM finished_run CROSS JOIN lease_clock
        WHERE "metadata"->>'authority' = 'execution_ledger_v2'
        ON CONFLICT ("run_id") DO NOTHING
        RETURNING "run_id"
      ), inserted_event AS (
        INSERT INTO "execution_events" (
          "id", "run_id", "aggregate_type", "aggregate_id", "trace_id",
          "type", "ts", "data"
        )
        SELECT ${eventId}, "id", "aggregate_type", "aggregate_id", "trace_id",
               ${eventType}, lease_clock."now",
               ${terminalEventData}
        FROM finished_run CROSS JOIN lease_clock
        RETURNING "id"
      )
      SELECT "id" AS "run_id",
             EXISTS (SELECT 1 FROM inserted_event) AS "event_written"
      FROM finished_run
    `);

    if (statementRows(result).length === 0) return null;
    const run = await this.getRunById(runId);
    if (!run) {
      throw new Error("execution_control: finished run was not found");
    }
    const terminalProjection = hasManagedTerminalProjectionAuthority(run)
      ? await this.getTerminalProjectionForScope({
          tenantKey: run.tenantKey,
          operation: run.operation,
          mode: run.mode,
          runId: run.id,
        })
      : null;
    if (hasManagedTerminalProjectionAuthority(run) && !terminalProjection) {
      throw new Error(
        "execution_control: finished run projection was not found",
      );
    }
    return terminalProjection ? { ...run, terminalProjection } : run;
  }

  async claimTerminalProjection(
    input: ClaimExecutionTerminalProjectionInput,
  ): Promise<ExecutionTerminalProjectionLeaseReceipt | null> {
    const runId = requiredText(input.runId, "projection runId");
    return this.claimEligibleTerminalProjection(
      input,
      drizzleSql`AND p."run_id" = ${runId}`,
    );
  }

  async claimNextTerminalProjection(
    input: ClaimNextExecutionTerminalProjectionInput,
  ): Promise<ExecutionTerminalProjectionLeaseReceipt | null> {
    return this.claimEligibleTerminalProjection(input, drizzleSql``);
  }

  async renewTerminalProjectionLease(
    input: RenewExecutionTerminalProjectionLeaseInput,
  ): Promise<ExecutionTerminalProjectionLeaseReceipt | null> {
    const { tenantKey, operation, mode } = leasableScope(input);
    const runId = requiredText(input.runId, "projection runId");
    const tokenHash = hashExecutionLeaseToken(input.token);
    const leaseMs = leaseDuration(input.leaseMs);
    const result = await this.database.execute(drizzleSql`
      WITH projection_clock AS (
        SELECT ${databaseUtcClock()} AS "now"
      ), renewed_projection AS (
        UPDATE "execution_terminal_projections" AS p
        SET "lease_expires_at" = projection_clock."now"
              + (${leaseMs} * interval '1 millisecond'),
            "updated_at" = projection_clock."now"
        FROM projection_clock
        WHERE p."run_id" = ${runId}
          AND p."tenant_key" = ${tenantKey}
          AND p."operation" = ${operation}
          AND p."mode" = ${mode}
          AND p."state" = 'running'
          AND p."lease_token_hash" = ${tokenHash}
          AND p."lease_expires_at" > projection_clock."now"
        RETURNING p."lease_expires_at"
      )
      SELECT "lease_expires_at" FROM renewed_projection
    `);
    const marker = statementRows(result)[0];
    if (!marker) return null;
    const projection = await this.getTerminalProjectionForScope({
      tenantKey,
      operation,
      mode,
      runId,
    });
    const run = await this.getRunById(runId);
    if (!projection || !run) {
      throw new Error(
        "execution_control: renewed terminal projection was not found",
      );
    }
    return {
      projection,
      run,
      token: input.token,
      expiresAt: resultTimestamp(marker, "leaseExpiresAt", "lease_expires_at"),
      recovered: false,
    };
  }

  async acknowledgeTerminalProjection(
    input: ExecutionTerminalProjectionLeaseMutationInput,
  ): Promise<ExecutionTerminalProjection | null> {
    const { tenantKey, operation, mode } = leasableScope(input);
    const runId = requiredText(input.runId, "projection runId");
    const tokenHash = hashExecutionLeaseToken(input.token);
    const eventId = id("xevt");
    const result = await this.database.execute(drizzleSql`
      WITH projection_clock AS (
        SELECT ${databaseUtcClock()} AS "now"
      ), acknowledged_projection AS (
        UPDATE "execution_terminal_projections" AS p
        SET "state" = 'succeeded',
            "lease_owner" = NULL,
            "lease_token_hash" = NULL,
            "lease_expires_at" = NULL,
            "last_error_code" = NULL,
            "projected_at" = projection_clock."now",
            "updated_at" = projection_clock."now"
        FROM projection_clock
        WHERE p."run_id" = ${runId}
          AND p."tenant_key" = ${tenantKey}
          AND p."operation" = ${operation}
          AND p."mode" = ${mode}
          AND p."state" = 'running'
          AND p."lease_token_hash" = ${tokenHash}
          AND p."lease_expires_at" > projection_clock."now"
        RETURNING p."run_id", p."claim_count"
      ), inserted_event AS (
        INSERT INTO "execution_events" (
          "id", "run_id", "aggregate_type", "aggregate_id", "trace_id",
          "type", "ts", "data"
        )
        SELECT ${eventId}, projected."run_id", r."aggregate_type",
               r."aggregate_id", r."trace_id", 'run.projection_succeeded',
               projection_clock."now",
               jsonb_build_object('claimCount', projected."claim_count")
        FROM acknowledged_projection AS projected
        JOIN "execution_runs" AS r ON r."id" = projected."run_id"
        CROSS JOIN projection_clock
        RETURNING "id"
      )
      SELECT "run_id",
             EXISTS (SELECT 1 FROM inserted_event) AS "event_written"
      FROM acknowledged_projection
    `);
    if (statementRows(result).length === 0) return null;
    return this.getTerminalProjectionForScope({
      tenantKey,
      operation,
      mode,
      runId,
    });
  }

  async requeueTerminalProjection(
    input: RequeueExecutionTerminalProjectionInput,
  ): Promise<ExecutionTerminalProjection | null> {
    const { tenantKey, operation, mode } = leasableScope(input);
    const runId = requiredText(input.runId, "projection runId");
    const tokenHash = hashExecutionLeaseToken(input.token);
    const delayMs = projectionDelay(input.delayMs);
    const errorCode = projectionErrorCode(input.errorCode);
    const eventId = id("xevt");
    assertLeaseTokenNotPersisted(
      errorCode,
      input.token,
      "projection errorCode",
    );
    const result = await this.database.execute(drizzleSql`
      WITH projection_clock AS (
        SELECT ${databaseUtcClock()} AS "now"
      ), requeued_projection AS (
        UPDATE "execution_terminal_projections" AS p
        SET "state" = 'retry_wait',
            "available_at" = projection_clock."now"
              + (${delayMs} * interval '1 millisecond'),
            "lease_owner" = NULL,
            "lease_token_hash" = NULL,
            "lease_expires_at" = NULL,
            "last_error_code" = ${errorCode},
            "projected_at" = NULL,
            "updated_at" = projection_clock."now"
        FROM projection_clock
        WHERE p."run_id" = ${runId}
          AND p."tenant_key" = ${tenantKey}
          AND p."operation" = ${operation}
          AND p."mode" = ${mode}
          AND p."state" = 'running'
          AND p."lease_token_hash" = ${tokenHash}
          AND p."lease_expires_at" > projection_clock."now"
        RETURNING p."run_id", p."claim_count"
      ), inserted_event AS (
        INSERT INTO "execution_events" (
          "id", "run_id", "aggregate_type", "aggregate_id", "trace_id",
          "type", "ts", "data"
        )
        SELECT ${eventId}, projected."run_id", r."aggregate_type",
               r."aggregate_id", r."trace_id",
               'run.projection_retry_scheduled', projection_clock."now",
               jsonb_build_object(
                 'errorCode', ${errorCode}::text,
                 'delayMs', ${delayMs}::integer,
                 'claimCount', projected."claim_count"
               )
        FROM requeued_projection AS projected
        JOIN "execution_runs" AS r ON r."id" = projected."run_id"
        CROSS JOIN projection_clock
        RETURNING "id"
      )
      SELECT "run_id",
             EXISTS (SELECT 1 FROM inserted_event) AS "event_written"
      FROM requeued_projection
    `);
    if (statementRows(result).length === 0) return null;
    return this.getTerminalProjectionForScope({
      tenantKey,
      operation,
      mode,
      runId,
    });
  }

  async blockTerminalProjection(
    input: BlockExecutionTerminalProjectionInput,
  ): Promise<ExecutionTerminalProjection | null> {
    const { tenantKey, operation, mode } = leasableScope(input);
    const runId = requiredText(input.runId, "projection runId");
    const tokenHash = hashExecutionLeaseToken(input.token);
    const errorCode = projectionErrorCode(input.errorCode);
    const eventId = id("xevt");
    assertLeaseTokenNotPersisted(
      errorCode,
      input.token,
      "projection errorCode",
    );
    const result = await this.database.execute(drizzleSql`
      WITH projection_clock AS (
        SELECT ${databaseUtcClock()} AS "now"
      ), blocked_projection AS (
        UPDATE "execution_terminal_projections" AS p
        SET "state" = 'blocked',
            "lease_owner" = NULL,
            "lease_token_hash" = NULL,
            "lease_expires_at" = NULL,
            "last_error_code" = ${errorCode},
            "projected_at" = NULL,
            "updated_at" = projection_clock."now"
        FROM projection_clock
        WHERE p."run_id" = ${runId}
          AND p."tenant_key" = ${tenantKey}
          AND p."operation" = ${operation}
          AND p."mode" = ${mode}
          AND p."state" = 'running'
          AND p."lease_token_hash" = ${tokenHash}
          AND p."lease_expires_at" > projection_clock."now"
        RETURNING p."run_id", p."claim_count"
      ), inserted_event AS (
        INSERT INTO "execution_events" (
          "id", "run_id", "aggregate_type", "aggregate_id", "trace_id",
          "type", "ts", "data"
        )
        SELECT ${eventId}, projected."run_id", r."aggregate_type",
               r."aggregate_id", r."trace_id", 'run.projection_blocked',
               projection_clock."now",
               jsonb_build_object(
                 'errorCode', ${errorCode}::text,
                 'claimCount', projected."claim_count"
               )
        FROM blocked_projection AS projected
        JOIN "execution_runs" AS r ON r."id" = projected."run_id"
        CROSS JOIN projection_clock
        RETURNING "id"
      )
      SELECT "run_id",
             EXISTS (SELECT 1 FROM inserted_event) AS "event_written"
      FROM blocked_projection
    `);
    if (statementRows(result).length === 0) return null;
    return this.getTerminalProjectionForScope({
      tenantKey,
      operation,
      mode,
      runId,
    });
  }

  async resumeBlockedTerminalProjection(
    input: ResumeBlockedExecutionTerminalProjectionInput,
  ): Promise<ExecutionTerminalProjection | null> {
    const { tenantKey, operation, mode } = leasableScope(input);
    const runId = requiredText(input.runId, "projection runId");
    const expectedErrorCode = projectionErrorCode(input.expectedErrorCode);
    const eventId = id("xevt");
    const result = await this.database.execute(drizzleSql`
      WITH resume_clock AS (
        SELECT ${databaseUtcClock()} AS "now"
      ), resumed_projection AS (
        UPDATE "execution_terminal_projections" AS p
        SET "state" = 'pending',
            "available_at" = resume_clock."now",
            "lease_owner" = NULL,
            "lease_token_hash" = NULL,
            "lease_expires_at" = NULL,
            "last_error_code" = NULL,
            "projected_at" = NULL,
            "updated_at" = resume_clock."now"
        FROM resume_clock
        WHERE p."run_id" = ${runId}
          AND p."tenant_key" = ${tenantKey}
          AND p."operation" = ${operation}
          AND p."mode" = ${mode}
          AND p."state" = 'blocked'
          AND p."last_error_code" = ${expectedErrorCode}
        RETURNING p."run_id", p."claim_count"
      ), inserted_event AS (
        INSERT INTO "execution_events" (
          "id", "run_id", "aggregate_type", "aggregate_id", "trace_id",
          "type", "ts", "data"
        )
        SELECT ${eventId}, resumed."run_id", r."aggregate_type",
               r."aggregate_id", r."trace_id", 'run.projection_resumed',
               resume_clock."now",
               jsonb_build_object(
                 'errorCode', ${expectedErrorCode}::text,
                 'claimCount', resumed."claim_count"
               )
        FROM resumed_projection AS resumed
        JOIN "execution_runs" AS r ON r."id" = resumed."run_id"
        CROSS JOIN resume_clock
        RETURNING "id"
      )
      SELECT "run_id",
             EXISTS (SELECT 1 FROM inserted_event) AS "event_written"
      FROM resumed_projection
    `);
    if (statementRows(result).length === 0) return null;
    return this.getTerminalProjectionForScope({
      tenantKey,
      operation,
      mode,
      runId,
    });
  }

  async getTerminalProjectionForScope(
    input: ExecutionScopedRunRef,
  ): Promise<ExecutionTerminalProjection | null> {
    const { tenantKey, operation, mode } = leasableScope(input);
    const runId = requiredText(input.runId, "projection runId");
    const [row] = await this.database
      .select()
      .from(projectionsTable)
      .where(
        and(
          eq(projectionsTable.runId, runId),
          eq(projectionsTable.tenantKey, tenantKey),
          eq(projectionsTable.operation, operation),
          eq(projectionsTable.mode, mode),
        ),
      )
      .limit(1);
    return row ? executionTerminalProjectionFromDatabaseRow(row) : null;
  }

  async getBlockedTerminalProjectionForScope(
    input: ExecutionLeaseScope,
  ): Promise<ExecutionTerminalProjection | null> {
    const { tenantKey, operation, mode } = leasableScope(input);
    const [row] = await this.database
      .select()
      .from(projectionsTable)
      .where(
        and(
          eq(projectionsTable.tenantKey, tenantKey),
          eq(projectionsTable.operation, operation),
          eq(projectionsTable.mode, mode),
          eq(projectionsTable.state, "blocked"),
        ),
      )
      .orderBy(asc(projectionsTable.updatedAt), asc(projectionsTable.runId))
      .limit(1);
    return row ? executionTerminalProjectionFromDatabaseRow(row) : null;
  }

  async getEffectForScope(
    input: ExecutionScopedRunRef & { stepKey: string },
  ): Promise<ExecutionEffect | null> {
    const { tenantKey, operation, mode } = leasableScope(input);
    const runId = requiredText(input.runId, "runId");
    const stepKey = effectStepKey(input.stepKey);
    const [row] = await this.database
      .select({ effect: effectsTable })
      .from(effectsTable)
      .innerJoin(runsTable, eq(runsTable.id, effectsTable.runId))
      .where(
        and(
          eq(effectsTable.runId, runId),
          eq(effectsTable.stepKey, stepKey),
          eq(runsTable.tenantKey, tenantKey),
          eq(runsTable.operation, operation),
          eq(runsTable.mode, mode),
        ),
      )
      .limit(1);
    return row ? executionEffectFromDatabaseRow(row.effect) : null;
  }

  async getRunById(runIdValue: string): Promise<ExecutionRun | null> {
    const runId = runIdValue.trim();
    if (!runId) return null;
    const [row] = await this.database
      .select()
      .from(runsTable)
      .where(eq(runsTable.id, runId))
      .limit(1);
    return row ? executionRunFromDatabaseRow(row) : null;
  }

  async getRunByIdForScope(
    input: ExecutionScopedRunRef,
  ): Promise<ExecutionRun | null> {
    const { tenantKey, operation, mode } = leasableScope(input);
    const runId = requiredText(input.runId, "runId");
    const [row] = await this.database
      .select()
      .from(runsTable)
      .where(
        and(
          eq(runsTable.id, runId),
          eq(runsTable.tenantKey, tenantKey),
          eq(runsTable.operation, operation),
          eq(runsTable.mode, mode),
        ),
      )
      .limit(1);
    return row ? executionRunFromDatabaseRow(row) : null;
  }

  async getRunByAggregate(
    input: ExecutionAggregateRef,
  ): Promise<ExecutionRun | null> {
    const tenantKey = input.tenantKey.trim().toLowerCase();
    const aggregateType = input.aggregateType.trim();
    const aggregateId = input.aggregateId.trim();
    if (!tenantKey || !aggregateType || !aggregateId) return null;
    const operation = input.operation?.trim();
    const [row] = await this.database
      .select()
      .from(runsTable)
      .where(
        and(
          eq(runsTable.tenantKey, tenantKey),
          eq(runsTable.aggregateType, aggregateType),
          eq(runsTable.aggregateId, aggregateId),
          operation ? eq(runsTable.operation, operation) : undefined,
        ),
      )
      .orderBy(desc(runsTable.createdAt), desc(runsTable.id))
      .limit(1);
    return row ? executionRunFromDatabaseRow(row) : null;
  }

  async getRunByAggregateForScope(
    input: ExecutionScopedAggregateRef,
  ): Promise<ExecutionRun | null> {
    const { tenantKey, operation, mode } = leasableScope(input);
    const aggregateType = requiredText(input.aggregateType, "aggregateType");
    const aggregateId = requiredText(input.aggregateId, "aggregateId");
    const [row] = await this.database
      .select()
      .from(runsTable)
      .where(
        and(
          eq(runsTable.tenantKey, tenantKey),
          eq(runsTable.operation, operation),
          eq(runsTable.mode, mode),
          eq(runsTable.aggregateType, aggregateType),
          eq(runsTable.aggregateId, aggregateId),
        ),
      )
      .orderBy(desc(runsTable.createdAt), desc(runsTable.id))
      .limit(1);
    return row ? executionRunFromDatabaseRow(row) : null;
  }

  async listEvents(runIdValue: string): Promise<ExecutionEvent[]> {
    const runId = runIdValue.trim();
    if (!runId) return [];
    const rows = await this.database
      .select()
      .from(eventsTable)
      .where(eq(eventsTable.runId, runId))
      .orderBy(asc(eventsTable.sequence));
    return rows.map(executionEventFromDatabaseRow);
  }

  async listRuns(input: ListExecutionRunsInput): Promise<ExecutionRunPage> {
    const tenantKey = requiredText(input.tenantKey, "tenantKey").toLowerCase();
    const aggregateType = optionalText(input.aggregateType);
    const operation = optionalText(input.operation);
    const limit = boundedReadLimit(input.limit);
    const beforeTimestamp = input.before
      ? cursorTimestamp(input.before.createdAt)
      : undefined;
    const beforeId = input.before
      ? requiredText(input.before.id, "cursor id")
      : undefined;

    const rows = await this.database
      .select({
        ...getTableColumns(runsTable),
        cursorCreatedAt: drizzleSql<string>`to_char(
          ${runsTable.createdAt}, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
        )`,
      })
      .from(runsTable)
      .where(
        and(
          eq(runsTable.tenantKey, tenantKey),
          aggregateType
            ? eq(runsTable.aggregateType, aggregateType)
            : undefined,
          operation ? eq(runsTable.operation, operation) : undefined,
          input.status ? eq(runsTable.status, input.status) : undefined,
          input.mode ? eq(runsTable.mode, input.mode) : undefined,
          beforeTimestamp && beforeId
            ? or(
                drizzleSql`${runsTable.createdAt} < ${cursorTimestampValue(beforeTimestamp)}`,
                and(
                  drizzleSql`${runsTable.createdAt} = ${cursorTimestampValue(beforeTimestamp)}`,
                  lt(runsTable.id, beforeId),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(desc(runsTable.createdAt), desc(runsTable.id))
      .limit(limit + 1);

    const pageRows = rows.slice(0, limit);
    const runs = pageRows.map(executionRunFromDatabaseRow);
    const last = pageRows[pageRows.length - 1];
    return {
      runs,
      ...(rows.length > limit && last
        ? {
            nextBefore: {
              createdAt: last.cursorCreatedAt,
              id: last.id,
            },
          }
        : {}),
    };
  }

  async getRunByIdForTenant(
    tenantKeyValue: string,
    runIdValue: string,
  ): Promise<ExecutionRun | null> {
    const tenantKey = requiredText(tenantKeyValue, "tenantKey").toLowerCase();
    const runId = runIdValue.trim();
    if (!runId) return null;
    const [row] = await this.database
      .select()
      .from(runsTable)
      .where(and(eq(runsTable.tenantKey, tenantKey), eq(runsTable.id, runId)))
      .limit(1);
    return row ? executionRunFromDatabaseRow(row) : null;
  }

  async requestOriginCancellation(
    input: RequestExecutionOriginCancellationInput,
  ): Promise<ExecutionOriginCancellationReceipt> {
    const { tenantKey, origin } = executionOriginScope(input);
    const cancellationId = cancellationIdentifier(input.cancellationId);
    const actor = cancellationActor(input);
    const reasonCode = cancellationReason(input.reasonCode);
    const result = await this.database.execute(drizzleSql`
      WITH origin_clock AS (
        SELECT ${databaseUtcClock()} AS "now"
      )
      INSERT INTO "execution_origins" (
        "tenant_key", "kind", "parent_agent_run_id", "cancel_request_id",
        "cancel_requested_at", "cancel_actor_type", "cancel_actor_id",
        "cancel_reason_code", "created_at", "updated_at"
      )
      SELECT ${tenantKey}, ${origin.kind}, ${origin.parentAgentRunId},
             ${cancellationId}, origin_clock."now", ${actor.type}, ${actor.id},
             ${reasonCode}, origin_clock."now", origin_clock."now"
      FROM origin_clock
      ON CONFLICT ("tenant_key", "kind", "parent_agent_run_id")
      DO UPDATE SET
        "cancel_request_id" = EXCLUDED."cancel_request_id",
        "cancel_requested_at" = EXCLUDED."cancel_requested_at",
        "cancel_actor_type" = EXCLUDED."cancel_actor_type",
        "cancel_actor_id" = EXCLUDED."cancel_actor_id",
        "cancel_reason_code" = EXCLUDED."cancel_reason_code",
        "updated_at" = EXCLUDED."updated_at"
      -- First writer wins forever; later Stop requests only read its receipt.
      WHERE "execution_origins"."cancel_request_id" IS NULL
      RETURNING "cancel_request_id", "cancel_requested_at",
                "cancel_actor_type", "cancel_actor_id", "cancel_reason_code"
    `);
    const written = statementRows(result)[0];
    if (written) {
      return {
        tenantKey,
        origin,
        cancellationId: resultText(
          written,
          "cancelRequestId",
          "cancel_request_id",
        ),
        requestedAt: resultTimestamp(
          written,
          "cancelRequestedAt",
          "cancel_requested_at",
        ),
        actor,
        reasonCode,
        replayed: false,
      };
    }

    const [existing] = await this.database
      .select({
        cancelRequestId: originsTable.cancelRequestId,
        cancelRequestedAt: originsTable.cancelRequestedAt,
        cancelActorType: originsTable.cancelActorType,
        cancelActorId: originsTable.cancelActorId,
        cancelReasonCode: originsTable.cancelReasonCode,
      })
      .from(originsTable)
      .where(
        and(
          eq(originsTable.tenantKey, tenantKey),
          eq(originsTable.kind, origin.kind),
          eq(originsTable.parentAgentRunId, origin.parentAgentRunId),
        ),
      )
      .limit(1);
    if (
      !existing?.cancelRequestId ||
      !existing.cancelRequestedAt ||
      !existing.cancelActorType ||
      !existing.cancelActorId ||
      !existing.cancelReasonCode
    ) {
      throw new Error(
        "execution_control: origin cancellation receipt was not found",
      );
    }
    return {
      tenantKey,
      origin,
      cancellationId: existing.cancelRequestId,
      requestedAt: dateIso(existing.cancelRequestedAt) as string,
      actor: {
        type: existing.cancelActorType as "user" | "service" | "system",
        id: existing.cancelActorId,
      },
      reasonCode: existing.cancelReasonCode as ExecutionCancellationReasonCode,
      replayed: true,
    };
  }

  async getRunTrustedExecutionOrigin(input: {
    tenantKey: string;
    runId: string;
  }): Promise<TrustedExecutionOriginRegistration | null> {
    const tenantKey = requiredText(input.tenantKey, "tenantKey").toLowerCase();
    const runId = requiredText(input.runId, "runId");
    const [row] = await this.database
      .select({
        runId: runOriginsTable.runId,
        tenantKey: runOriginsTable.tenantKey,
        kind: runOriginsTable.kind,
        parentAgentRunId: runOriginsTable.parentAgentRunId,
        cancelRequestId: originsTable.cancelRequestId,
        cancelRequestedAt: originsTable.cancelRequestedAt,
        cancelActorType: originsTable.cancelActorType,
        cancelActorId: originsTable.cancelActorId,
        cancelReasonCode: originsTable.cancelReasonCode,
      })
      .from(runOriginsTable)
      .innerJoin(
        originsTable,
        and(
          eq(originsTable.tenantKey, runOriginsTable.tenantKey),
          eq(originsTable.kind, runOriginsTable.kind),
          eq(originsTable.parentAgentRunId, runOriginsTable.parentAgentRunId),
        ),
      )
      .where(
        and(
          eq(runOriginsTable.tenantKey, tenantKey),
          eq(runOriginsTable.runId, runId),
        ),
      )
      .limit(1);
    if (!row) return null;
    const origin = trustedExecutionOrigin({
      schemaVersion: 1,
      kind: row.kind,
      parentAgentRunId: row.parentAgentRunId,
    });
    const cancellation = row.cancelRequestId
      ? {
          cancellationId: row.cancelRequestId,
          requestedAt: dateIso(row.cancelRequestedAt) as string,
          actor: {
            type: row.cancelActorType as "user" | "service" | "system",
            id: row.cancelActorId as string,
          },
          reasonCode: row.cancelReasonCode as ExecutionCancellationReasonCode,
        }
      : undefined;
    return {
      runId: row.runId,
      tenantKey: row.tenantKey,
      origin,
      ...(cancellation ? { cancellation } : {}),
    };
  }

  async listRunsByExecutionOriginPage(
    input: ListExecutionRunsByOriginPageInput,
  ): Promise<ExecutionRunsByOriginPage> {
    const tenantKey = requiredText(input.tenantKey, "tenantKey").toLowerCase();
    const parentAgentRunId = requiredText(
      input.parentAgentRunId,
      "parentAgentRunId",
    );
    if (!ORIGIN_PARENT_RUN_PATTERN.test(parentAgentRunId)) {
      throw new Error("execution_control: invalid parentAgentRunId");
    }
    const afterRunId = optionalText(input.afterRunId);
    if (afterRunId && !ORIGIN_PARENT_RUN_PATTERN.test(afterRunId)) {
      throw new Error("execution_control: invalid origin run cursor");
    }
    const statuses = executionRunStatusFilter(input.statuses);
    const limit = boundedReadLimit(input.limit);
    const rows = await this.database
      .select(getTableColumns(runsTable))
      .from(runOriginsTable)
      .innerJoin(
        runsTable,
        and(
          eq(runsTable.id, runOriginsTable.runId),
          eq(runsTable.tenantKey, runOriginsTable.tenantKey),
        ),
      )
      .where(
        and(
          eq(runOriginsTable.tenantKey, tenantKey),
          eq(runOriginsTable.kind, "mc_chat_parent_run"),
          eq(runOriginsTable.parentAgentRunId, parentAgentRunId),
          statuses ? inArray(runsTable.status, statuses) : undefined,
          afterRunId ? gt(runOriginsTable.runId, afterRunId) : undefined,
        ),
      )
      .orderBy(asc(runOriginsTable.runId))
      .limit(limit + 1);
    const pageRows = rows.slice(0, limit);
    const runs = pageRows.map(executionRunFromDatabaseRow);
    const last = pageRows[pageRows.length - 1];
    return {
      runs,
      ...(rows.length > limit && last ? { nextAfterRunId: last.id } : {}),
    };
  }

  async listRunsByExecutionOrigin(
    input: ListExecutionRunsByOriginInput,
  ): Promise<ExecutionRun[]> {
    const page = await this.listRunsByExecutionOriginPage(input);
    if (page.nextAfterRunId) {
      throw new Error(
        "execution_control: execution origin fanout requires pagination",
      );
    }
    return page.runs;
  }

  private async isOriginCancelled(input: {
    tenantKey: string;
    origin: TrustedExecutionOrigin;
  }): Promise<boolean> {
    const [row] = await this.database
      .select({ cancelRequestId: originsTable.cancelRequestId })
      .from(originsTable)
      .where(
        and(
          eq(originsTable.tenantKey, input.tenantKey),
          eq(originsTable.kind, input.origin.kind),
          eq(originsTable.parentAgentRunId, input.origin.parentAgentRunId),
        ),
      )
      .limit(1);
    return Boolean(row?.cancelRequestId);
  }

  private async assertRunTrustedOrigin(
    run: ExecutionRun,
    expected: TrustedExecutionOrigin,
  ): Promise<void> {
    const registration = await this.getRunTrustedExecutionOrigin({
      tenantKey: run.tenantKey,
      runId: run.id,
    });
    if (
      !registration ||
      registration.origin.kind !== expected.kind ||
      registration.origin.parentAgentRunId !== expected.parentAgentRunId
    ) {
      throw new Error(
        "execution_control: idempotent winner lacks the trusted execution origin",
      );
    }
  }

  async listStepsPage(
    input: ListExecutionStepsPageInput,
  ): Promise<ExecutionStepPage> {
    const run = await this.getRunByIdForTenant(input.tenantKey, input.runId);
    if (!run) return { steps: [], truncated: false };
    const limit = boundedReadLimit(input.limit);
    const rows = await this.database
      .select()
      .from(stepsTable)
      .where(eq(stepsTable.runId, run.id))
      .orderBy(asc(stepsTable.createdAt), asc(stepsTable.id))
      .limit(limit + 1);
    return {
      steps: rows.slice(0, limit).map(executionStepFromDatabaseRow),
      truncated: rows.length > limit,
    };
  }

  async listEventsPage(
    input: ListExecutionEventsPageInput,
  ): Promise<ExecutionEventPage> {
    const run = await this.getRunByIdForTenant(input.tenantKey, input.runId);
    if (!run) return { events: [] };
    const limit = boundedReadLimit(input.limit);
    const afterSequence = input.afterSequence ?? 0;
    if (!Number.isSafeInteger(afterSequence) || afterSequence < 0) {
      throw new Error(
        "execution_control: event cursor must be a non-negative integer",
      );
    }
    const rows = await this.database
      .select()
      .from(eventsTable)
      .where(
        and(
          eq(eventsTable.runId, run.id),
          gt(eventsTable.sequence, afterSequence),
        ),
      )
      .orderBy(asc(eventsTable.sequence))
      .limit(limit + 1);
    const events = rows.slice(0, limit).map(executionEventFromDatabaseRow);
    const last = events[events.length - 1];
    return {
      events,
      ...(rows.length > limit && last
        ? { nextAfterSequence: last.sequence }
        : {}),
    };
  }

  private async claimEligibleTerminalProjection(
    input:
      | ClaimExecutionTerminalProjectionInput
      | ClaimNextExecutionTerminalProjectionInput,
    explicitProjectionPredicate: SQL,
  ): Promise<ExecutionTerminalProjectionLeaseReceipt | null> {
    const { tenantKey, operation, mode } = leasableScope(input);
    const workerId = projectionWorkerId(input.workerId);
    const leaseMs = leaseDuration(input.leaseMs);
    const token = newExecutionLeaseToken();
    const tokenHash = hashExecutionLeaseToken(token);
    const result = await this.database.execute(drizzleSql`
      WITH projection_clock AS (
        SELECT ${databaseUtcClock()} AS "now"
      ), candidate AS (
        SELECT p."run_id", (p."state" = 'running') AS "recovered"
        FROM "execution_terminal_projections" AS p CROSS JOIN projection_clock
        WHERE p."tenant_key" = ${tenantKey}
          AND p."operation" = ${operation}
          AND p."mode" = ${mode}
          ${explicitProjectionPredicate}
          AND p."claim_count" < 1000000
          AND (
            (
              p."state" IN ('pending', 'retry_wait')
              AND p."available_at" <= projection_clock."now"
            ) OR (
              p."state" = 'running'
              AND p."lease_expires_at" IS NOT NULL
              AND p."lease_expires_at" <= projection_clock."now"
            )
          )
        ORDER BY
          CASE WHEN p."state" = 'running' THEN 0 ELSE 1 END,
          COALESCE(p."lease_expires_at", p."available_at"),
          p."created_at",
          p."run_id"
        FOR UPDATE OF p SKIP LOCKED
        LIMIT 1
      ), claimed_projection AS (
        UPDATE "execution_terminal_projections" AS p
        SET "state" = 'running',
            "lease_owner" = ${workerId},
            "lease_token_hash" = ${tokenHash},
            "lease_expires_at" = projection_clock."now"
              + (${leaseMs} * interval '1 millisecond'),
            "claim_count" = p."claim_count" + 1,
            "last_attempt_at" = projection_clock."now",
            "updated_at" = projection_clock."now"
        FROM candidate, projection_clock
        WHERE p."run_id" = candidate."run_id"
        RETURNING p."run_id", p."lease_expires_at", candidate."recovered"
      )
      SELECT "run_id", "lease_expires_at", "recovered"
      FROM claimed_projection
    `);
    const marker = statementRows(result)[0];
    if (!marker) return null;
    const runId = resultText(marker, "runId", "run_id");
    const projection = await this.getTerminalProjectionForScope({
      tenantKey,
      operation,
      mode,
      runId,
    });
    const run = await this.getRunById(runId);
    if (!projection || !run) {
      throw new Error(
        "execution_control: claimed terminal projection was not found",
      );
    }
    return {
      projection,
      run,
      token,
      expiresAt: resultTimestamp(marker, "leaseExpiresAt", "lease_expires_at"),
      recovered: resultBoolean(marker, "recovered", "recovered"),
    };
  }

  private async claimEligibleRun(
    input: ClaimExecutionRunInput | ClaimNextExecutionRunInput,
    explicitRunPredicate: SQL,
  ): Promise<ExecutionLeaseReceipt | null> {
    const { tenantKey, operation, mode } = leasableScope(input);
    const workerId = requiredText(input.workerId, "workerId");
    const leaseMs = leaseDuration(input.leaseMs);
    const token = newExecutionLeaseToken();
    const tokenHash = hashExecutionLeaseToken(token);
    const eventId = id("xevt");

    const result = await this.database.execute(drizzleSql`
      WITH lease_clock AS (
        SELECT ${databaseUtcClock()} AS "now"
      ), candidate AS (
        SELECT r."id", (r."status" = 'running') AS "recovered"
        FROM "execution_runs" AS r CROSS JOIN lease_clock
        WHERE r."tenant_key" = ${tenantKey}
          AND r."operation" = ${operation}
          AND r."mode" = ${mode}
          AND r."mode" IN ('canary', 'active')
          ${explicitRunPredicate}
          AND (
            (
              r."status" = 'queued'
              AND r."available_at" <= lease_clock."now"
            )
            OR (
              r."status" = 'running'
              AND r."lease_expires_at" IS NOT NULL
              AND r."lease_expires_at" <= lease_clock."now"
            )
          )
        ORDER BY
          CASE WHEN r."status" = 'running' THEN 0 ELSE 1 END,
          COALESCE(r."lease_expires_at", r."available_at"),
          r."created_at",
          r."id"
        FOR UPDATE OF r SKIP LOCKED
        LIMIT 1
      ), claimed_run AS (
        UPDATE "execution_runs" AS r
        SET
          "status" = 'running',
          "lease_owner" = ${workerId},
          "lease_token_hash" = ${tokenHash},
          "lease_expires_at" = lease_clock."now"
            + (${leaseMs} * interval '1 millisecond'),
          "claim_count" = r."claim_count" + 1,
          "started_at" = COALESCE(r."started_at", lease_clock."now"),
          "finished_at" = NULL,
          "updated_at" = lease_clock."now"
        FROM candidate, lease_clock
        WHERE r."id" = candidate."id"
        RETURNING r."id", r."aggregate_type", r."aggregate_id", r."trace_id",
                  r."lease_expires_at", r."claim_count",
                  candidate."recovered"
      ), inserted_event AS (
        INSERT INTO "execution_events" (
          "id", "run_id", "aggregate_type", "aggregate_id", "trace_id",
          "type", "ts", "data"
        )
        SELECT ${eventId}, "id", "aggregate_type", "aggregate_id", "trace_id",
               CASE WHEN "recovered"
                 THEN 'run.lease_recovered' ELSE 'run.claimed' END,
               lease_clock."now",
               jsonb_build_object(
                 'workerId', ${workerId}::text,
                 'claimCount', "claim_count",
                 'leaseExpiresAt', to_char(
                   "lease_expires_at", 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
                 ),
                 'recovered', "recovered"
               )
        FROM claimed_run CROSS JOIN lease_clock
        RETURNING "id"
      )
      SELECT "id" AS "run_id", "lease_expires_at", "recovered",
             EXISTS (SELECT 1 FROM inserted_event) AS "event_written"
      FROM claimed_run
    `);

    const marker = statementRows(result)[0];
    if (!marker) return null;
    const runId = resultText(marker, "runId", "run_id");
    const expiresAt = resultTimestamp(
      marker,
      "leaseExpiresAt",
      "lease_expires_at",
    );
    const run = await this.getRunById(runId);
    if (!run) {
      throw new Error(`execution_control: claimed run ${runId} was not found`);
    }
    return {
      run,
      token,
      expiresAt,
      recovered: resultBoolean(marker, "recovered", "recovered"),
    };
  }

  private async getEventById(eventId: string): Promise<ExecutionEvent | null> {
    const [row] = await this.database
      .select()
      .from(eventsTable)
      .where(eq(eventsTable.id, eventId))
      .limit(1);
    return row ? executionEventFromDatabaseRow(row) : null;
  }

  private async getIdempotencyWinner(
    input: ExecutionIdempotencyCommand,
  ): Promise<ExecutionRun | null> {
    const [row] = await this.database
      .select()
      .from(runsTable)
      .where(
        and(
          eq(runsTable.tenantKey, input.tenantKey),
          eq(runsTable.aggregateType, input.aggregateType),
          eq(runsTable.aggregateId, input.aggregateId),
          eq(runsTable.operation, input.operation),
          eq(runsTable.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);
    if (!row) return null;
    return this.resolveIdempotencyWinner(row, input);
  }

  private async resolveIdempotencyWinner(
    row: RunRow,
    input: ExecutionIdempotencyCommand,
  ): Promise<ExecutionRun> {
    if (row.commandFingerprint) {
      if (row.commandFingerprint !== input.commandFingerprint) {
        throw new ExecutionCommandConflictError();
      }
      return executionRunFromDatabaseRow(row);
    }

    if (fingerprintPersistedCommand(row) !== input.commandFingerprint) {
      throw new ExecutionCommandConflictError();
    }

    await this.database.execute(drizzleSql`
      UPDATE "execution_runs"
      SET "command_fingerprint" = ${input.commandFingerprint}
      WHERE "id" = ${row.id}
        AND "command_fingerprint" IS NULL
        AND "tenant_key" = ${input.tenantKey}
        AND "aggregate_type" = ${input.aggregateType}
        AND "aggregate_id" = ${input.aggregateId}
        AND "operation" = ${input.operation}
        AND "idempotency_key" = ${input.idempotencyKey}
        AND "mode" = ${input.mode}
        AND "input" IS NOT DISTINCT FROM ${jsonValue(input.inputForStorage)}
        AND "metadata" = ${jsonValue(input.metadata)}
    `);

    const [resolved] = await this.database
      .select()
      .from(runsTable)
      .where(eq(runsTable.id, row.id))
      .limit(1);
    if (resolved?.commandFingerprint !== input.commandFingerprint) {
      throw new ExecutionCommandConflictError();
    }
    return executionRunFromDatabaseRow(resolved);
  }

  private async claimLegacyIdempotencyWinner(
    input: ExecutionIdempotencyCommand,
  ): Promise<void> {
    const [legacy] = await this.database
      .select()
      .from(runsTable)
      .where(
        and(
          or(
            isNull(runsTable.tenantKey),
            drizzleSql`btrim(${runsTable.tenantKey}) = ''`,
          ),
          eq(runsTable.aggregateType, input.aggregateType),
          eq(runsTable.aggregateId, input.aggregateId),
          eq(runsTable.operation, input.operation),
          eq(runsTable.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);
    if (!legacy || inferredLegacyTenantKey(legacy) !== input.tenantKey) {
      return;
    }
    if (
      (legacy.commandFingerprint &&
        legacy.commandFingerprint !== input.commandFingerprint) ||
      fingerprintPersistedCommand(legacy, input.tenantKey) !==
        input.commandFingerprint
    ) {
      throw new ExecutionCommandConflictError();
    }

    const result = await this.database.execute(drizzleSql`
      UPDATE "execution_runs"
      SET
        "tenant_key" = ${input.tenantKey},
        "command_fingerprint" = ${input.commandFingerprint}
      WHERE ("tenant_key" IS NULL OR btrim("tenant_key") = '')
        AND "aggregate_type" = ${input.aggregateType}
        AND "aggregate_id" = ${input.aggregateId}
        AND "operation" = ${input.operation}
        AND "idempotency_key" = ${input.idempotencyKey}
        AND "mode" = ${input.mode}
        AND ("command_fingerprint" IS NULL
          OR "command_fingerprint" = ${input.commandFingerprint})
        AND "input" IS NOT DISTINCT FROM ${jsonValue(input.inputForStorage)}
        AND "metadata" = ${jsonValue(input.metadata)}
        AND COALESCE(
          NULLIF(lower(btrim("input"->>'slug')), ''),
          NULLIF(lower(btrim("metadata"->>'slug')), ''),
          CASE
            WHEN "aggregate_type" = 'partnerships.search'
              AND strpos("aggregate_id", ':') > 1
              THEN lower(split_part("aggregate_id", ':', 1))
            ELSE 'system'
          END
        ) = ${input.tenantKey}
      RETURNING "id"
    `);
    if (statementRows(result).length > 0) return;

    // A concurrent identical adoption is safe; every other race is a stable
    // command conflict rather than an ambiguous create failure.
    const winner = await this.getIdempotencyWinner(input);
    if (!winner) throw new ExecutionCommandConflictError();
  }
}
