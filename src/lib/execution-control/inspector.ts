import crypto from "node:crypto";
import type { ParsedUrlQuery } from "node:querystring";
import type {
  ExecutionEvent,
  ExecutionEventPage,
  ExecutionRun,
  ExecutionRunCursor,
  ExecutionRunMode,
  ExecutionRunPage,
  ExecutionRunStatus,
  ExecutionStep,
  ExecutionStepPage,
  ListExecutionRunsInput,
} from "./types";
import {
  SUPPORT_REDACTION_POLICY_VERSION,
  sanitizeSupportBundle,
  type SupportSafeValue,
} from "@/lib/support/redaction";

const DEFAULT_PAGE_LIMIT = 50;
export const EXECUTION_INSPECTOR_MAX_PAGE_LIMIT = 100;
const CURSOR_VERSION = 1;
const IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const TENANT_KEY_RE = /^[a-z0-9][a-z0-9-]{0,119}$/;
const RUN_STATUSES = new Set<ExecutionRunStatus>([
  "queued",
  "running",
  "waiting_approval",
  "blocked",
  "completed",
  "partial",
  "failed",
  "cancelled",
]);
const RUN_MODES = new Set<ExecutionRunMode>(["shadow", "canary", "active"]);

/**
 * Payload bounds are deliberately tighter than the support-export defaults.
 * A detail response may contain up to 100 events and must stay useful even if
 * one provider persisted an unexpectedly large response body.
 */
const INSPECTOR_VALUE_LIMITS = Object.freeze({
  maxDepth: 6,
  maxArrayLength: 40,
  maxObjectKeys: 80,
  maxStringLength: 4_096,
  maxTotalBytes: 16_384,
});

export class ExecutionInspectorRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExecutionInspectorRequestError";
  }
}

export class ExecutionInspectorSanitizationError extends Error {
  constructor() {
    super("Execution data could not be sanitized safely");
    this.name = "ExecutionInspectorSanitizationError";
  }
}

export interface ExecutionInspectorListQuery {
  repositoryInput: ListExecutionRunsInput;
  filters: {
    tenantKey: string;
    aggregateType?: string;
    operation?: string;
    status?: ExecutionRunStatus;
    mode?: ExecutionRunMode;
  };
  limit: number;
}

export interface ExecutionInspectorDetailQuery {
  tenantKey: string;
  runId: string;
  stepsLimit: number;
  eventsLimit: number;
  afterSequence?: number;
}

export interface ExecutionRunSummaryView {
  id: string;
  tenantKey: string;
  aggregateType: string;
  aggregateId: string;
  operation: string;
  mode: ExecutionRunMode;
  status: ExecutionRunStatus;
  currentStep?: string;
  traceId?: string;
  hasError: boolean;
  blockedReasonCode?: NonNullable<ExecutionRun["blockedReasonCode"]>;
  blockedAt?: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  updatedAt: string;
}

export interface ExecutionRunDetailView extends ExecutionRunSummaryView {
  idempotencyKey: string;
  input?: SupportSafeValue;
  output?: SupportSafeValue;
  error?: SupportSafeValue;
  metadata: SupportSafeValue;
}

export interface ExecutionStepDetailView {
  id: string;
  runId: string;
  stepKey: string;
  status: ExecutionStep["status"];
  attempt: number;
  input?: SupportSafeValue;
  output?: SupportSafeValue;
  error?: SupportSafeValue;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  updatedAt: string;
}

export interface ExecutionEventDetailView {
  sequence: number;
  id: string;
  runId: string;
  aggregateType: string;
  aggregateId: string;
  traceId?: string;
  type: string;
  ts: string;
  data?: SupportSafeValue;
}

interface CursorPayload {
  version: typeof CURSOR_VERSION;
  tenantKey: string;
  filtersDigest: string;
  before: ExecutionRunCursor;
}

function one(
  value: string | string[] | undefined,
  field: string,
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new ExecutionInspectorRequestError(`${field} must be a single value`);
  }
  return value;
}

function requiredTenantKey(value: string | undefined): string {
  if (!value) {
    throw new ExecutionInspectorRequestError("tenantKey is required");
  }
  // Never trim or lowercase tenant keys: authorization and SQL reads must use
  // the exact tenant boundary the admin selected.
  if (!TENANT_KEY_RE.test(value)) {
    throw new ExecutionInspectorRequestError("tenantKey is invalid");
  }
  return value;
}

function optionalIdentifier(
  value: string | undefined,
  field: string,
): string | undefined {
  if (value === undefined) return undefined;
  if (!IDENTIFIER_RE.test(value)) {
    throw new ExecutionInspectorRequestError(`${field} is invalid`);
  }
  return value;
}

function requiredRunId(value: string | undefined): string {
  const runId = optionalIdentifier(value, "run id");
  if (!runId) throw new ExecutionInspectorRequestError("run id is required");
  return runId;
}

function pageLimit(value: string | undefined, field = "limit"): number {
  if (value === undefined) return DEFAULT_PAGE_LIMIT;
  if (!/^[1-9][0-9]*$/.test(value)) {
    throw new ExecutionInspectorRequestError(
      `${field} must be an integer between 1 and ${EXECUTION_INSPECTOR_MAX_PAGE_LIMIT}`,
    );
  }
  const parsed = Number(value);
  if (parsed > EXECUTION_INSPECTOR_MAX_PAGE_LIMIT) {
    throw new ExecutionInspectorRequestError(
      `${field} must be an integer between 1 and ${EXECUTION_INSPECTOR_MAX_PAGE_LIMIT}`,
    );
  }
  return parsed;
}

function afterSequence(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new ExecutionInspectorRequestError(
      "afterSequence must be a non-negative safe integer",
    );
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new ExecutionInspectorRequestError(
      "afterSequence must be a non-negative safe integer",
    );
  }
  return parsed;
}

function canonicalIsoTimestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\.(\d{3,6})Z$/.exec(
    value,
  );
  if (!match) return null;
  const millisecondIso = `${match[1]}.${match[2].slice(0, 3)}Z`;
  return new Date(millisecondIso).toISOString() === millisecondIso
    ? value
    : null;
}

function cursorSecret(secret: string): string {
  if (!secret)
    throw new Error("Execution inspector cursor secret is not configured");
  return secret;
}

function filterDigest(filters: ExecutionInspectorListQuery["filters"]): string {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify([
        filters.tenantKey,
        filters.aggregateType ?? null,
        filters.operation ?? null,
        filters.status ?? null,
        filters.mode ?? null,
      ]),
    )
    .digest("base64url");
}

function signCursor(encodedPayload: string, secret: string): string {
  return crypto
    .createHmac("sha256", cursorSecret(secret))
    .update(encodedPayload)
    .digest("base64url");
}

function safeSignatureEqual(left: string, right: string): boolean {
  try {
    const leftBytes = Buffer.from(left, "base64url");
    const rightBytes = Buffer.from(right, "base64url");
    return (
      leftBytes.length === rightBytes.length &&
      crypto.timingSafeEqual(leftBytes, rightBytes)
    );
  } catch {
    return false;
  }
}

export function encodeExecutionInspectorCursor(input: {
  before: ExecutionRunCursor;
  filters: ExecutionInspectorListQuery["filters"];
  secret: string;
}): string {
  const payload: CursorPayload = {
    version: CURSOR_VERSION,
    tenantKey: input.filters.tenantKey,
    filtersDigest: filterDigest(input.filters),
    before: input.before,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  return `${encoded}.${signCursor(encoded, input.secret)}`;
}

export function decodeExecutionInspectorCursor(input: {
  value: string;
  filters: ExecutionInspectorListQuery["filters"];
  secret: string;
}): ExecutionRunCursor {
  try {
    const parts = input.value.split(".");
    if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error();
    const [encoded, suppliedSignature] = parts;
    const expectedSignature = signCursor(encoded, input.secret);
    if (!safeSignatureEqual(suppliedSignature, expectedSignature)) {
      throw new Error();
    }
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as Partial<CursorPayload>;
    const createdAt = canonicalIsoTimestamp(payload.before?.createdAt);
    const id = payload.before?.id;
    if (
      payload.version !== CURSOR_VERSION ||
      payload.tenantKey !== input.filters.tenantKey ||
      payload.filtersDigest !== filterDigest(input.filters) ||
      !createdAt ||
      typeof id !== "string" ||
      !IDENTIFIER_RE.test(id)
    ) {
      throw new Error();
    }
    return { createdAt, id };
  } catch {
    throw new ExecutionInspectorRequestError(
      "before must be a valid cursor for the current tenant and filters",
    );
  }
}

export function resolveExecutionInspectorListQuery(
  query: ParsedUrlQuery,
  secret: string,
): ExecutionInspectorListQuery {
  const tenantKey = requiredTenantKey(one(query.tenantKey, "tenantKey"));
  const aggregateType = optionalIdentifier(
    one(query.aggregateType, "aggregateType"),
    "aggregateType",
  );
  const operation = optionalIdentifier(
    one(query.operation, "operation"),
    "operation",
  );
  const rawStatus = one(query.status, "status");
  const rawMode = one(query.mode, "mode");
  if (
    rawStatus !== undefined &&
    !RUN_STATUSES.has(rawStatus as ExecutionRunStatus)
  ) {
    throw new ExecutionInspectorRequestError("status is invalid");
  }
  if (rawMode !== undefined && !RUN_MODES.has(rawMode as ExecutionRunMode)) {
    throw new ExecutionInspectorRequestError("mode is invalid");
  }
  const status = rawStatus as ExecutionRunStatus | undefined;
  const mode = rawMode as ExecutionRunMode | undefined;
  const filters: ExecutionInspectorListQuery["filters"] = {
    tenantKey,
    ...(aggregateType ? { aggregateType } : {}),
    ...(operation ? { operation } : {}),
    ...(status ? { status } : {}),
    ...(mode ? { mode } : {}),
  };
  const limit = pageLimit(one(query.limit, "limit"));
  const rawBefore = one(query.before, "before");
  const before = rawBefore
    ? decodeExecutionInspectorCursor({
        value: rawBefore,
        filters,
        secret,
      })
    : undefined;
  return {
    filters,
    limit,
    repositoryInput: {
      tenantKey,
      ...(aggregateType ? { aggregateType } : {}),
      ...(operation ? { operation } : {}),
      ...(status ? { status } : {}),
      ...(mode ? { mode } : {}),
      ...(before ? { before } : {}),
      limit,
    },
  };
}

export function resolveExecutionInspectorDetailQuery(
  query: ParsedUrlQuery,
): ExecutionInspectorDetailQuery {
  const tenantKey = requiredTenantKey(one(query.tenantKey, "tenantKey"));
  const runId = requiredRunId(one(query.id, "run id"));
  const stepsLimit = pageLimit(
    one(query.stepsLimit, "stepsLimit"),
    "stepsLimit",
  );
  const eventsLimit = pageLimit(
    one(query.eventsLimit, "eventsLimit"),
    "eventsLimit",
  );
  const parsedAfterSequence = afterSequence(
    one(query.afterSequence, "afterSequence"),
  );
  return {
    tenantKey,
    runId,
    stepsLimit,
    eventsLimit,
    ...(parsedAfterSequence !== undefined
      ? { afterSequence: parsedAfterSequence }
      : {}),
  };
}

export function executionRunSummaryView(
  run: ExecutionRun,
): ExecutionRunSummaryView {
  return {
    id: run.id,
    tenantKey: run.tenantKey,
    aggregateType: sanitizeInspectorString(run.aggregateType),
    aggregateId: sanitizeInspectorString(run.aggregateId),
    operation: sanitizeInspectorString(run.operation),
    mode: run.mode,
    status: run.status,
    ...(run.currentStep
      ? { currentStep: sanitizeInspectorString(run.currentStep) }
      : {}),
    ...(run.traceId ? { traceId: sanitizeInspectorString(run.traceId) } : {}),
    hasError: Boolean(run.error),
    ...(run.blockedReasonCode
      ? { blockedReasonCode: run.blockedReasonCode }
      : {}),
    ...(run.blockedAt ? { blockedAt: run.blockedAt } : {}),
    createdAt: run.createdAt,
    ...(run.startedAt ? { startedAt: run.startedAt } : {}),
    ...(run.finishedAt ? { finishedAt: run.finishedAt } : {}),
    updatedAt: run.updatedAt,
  };
}

function sanitizeInspectorValue(value: unknown): SupportSafeValue {
  try {
    return sanitizeSupportBundle(value, {
      destination: "model",
      ...INSPECTOR_VALUE_LIMITS,
    }).value;
  } catch {
    // Never return raw data, partial data, or sanitizer failure details.
    throw new ExecutionInspectorSanitizationError();
  }
}

function sanitizeInspectorString(value: string): string {
  const sanitized = sanitizeInspectorValue(value);
  if (typeof sanitized !== "string") {
    throw new ExecutionInspectorSanitizationError();
  }
  return sanitized;
}

function optionalSanitizedValue(value: unknown): SupportSafeValue | undefined {
  return value === undefined ? undefined : sanitizeInspectorValue(value);
}

export function executionRunDetailView(
  run: ExecutionRun,
): ExecutionRunDetailView {
  return {
    ...executionRunSummaryView(run),
    idempotencyKey: sanitizeInspectorString(run.idempotencyKey),
    ...(run.input !== undefined
      ? { input: optionalSanitizedValue(run.input) }
      : {}),
    ...(run.output !== undefined
      ? { output: optionalSanitizedValue(run.output) }
      : {}),
    ...(run.error !== undefined
      ? { error: optionalSanitizedValue(run.error) }
      : {}),
    metadata: sanitizeInspectorValue(run.metadata),
  };
}

export function executionStepDetailView(
  step: ExecutionStep,
): ExecutionStepDetailView {
  return {
    id: step.id,
    runId: step.runId,
    stepKey: sanitizeInspectorString(step.stepKey),
    status: step.status,
    attempt: step.attempt,
    ...(step.input !== undefined
      ? { input: optionalSanitizedValue(step.input) }
      : {}),
    ...(step.output !== undefined
      ? { output: optionalSanitizedValue(step.output) }
      : {}),
    ...(step.error !== undefined
      ? { error: optionalSanitizedValue(step.error) }
      : {}),
    createdAt: step.createdAt,
    ...(step.startedAt ? { startedAt: step.startedAt } : {}),
    ...(step.finishedAt ? { finishedAt: step.finishedAt } : {}),
    updatedAt: step.updatedAt,
  };
}

export function executionEventDetailView(
  event: ExecutionEvent,
): ExecutionEventDetailView {
  return {
    sequence: event.sequence,
    id: event.id,
    runId: event.runId,
    aggregateType: sanitizeInspectorString(event.aggregateType),
    aggregateId: sanitizeInspectorString(event.aggregateId),
    ...(event.traceId
      ? { traceId: sanitizeInspectorString(event.traceId) }
      : {}),
    type: sanitizeInspectorString(event.type),
    ts: event.ts,
    ...(event.data !== undefined
      ? { data: optionalSanitizedValue(event.data) }
      : {}),
  };
}

export function buildExecutionInspectorListResponse(input: {
  query: ExecutionInspectorListQuery;
  page: ExecutionRunPage;
  cursorSecret: string;
}) {
  if (
    input.page.runs.some(
      (run) => run.tenantKey !== input.query.filters.tenantKey,
    )
  ) {
    // Treat repository boundary drift as a server failure. Never filter and
    // continue: silently hiding a cross-tenant row would mask a critical bug.
    throw new Error("Execution inspector tenant boundary violation");
  }
  const nextCursor = input.page.nextBefore
    ? encodeExecutionInspectorCursor({
        before: input.page.nextBefore,
        filters: input.query.filters,
        secret: input.cursorSecret,
      })
    : null;
  return {
    ok: true as const,
    tenantKey: input.query.filters.tenantKey,
    runs: input.page.runs.map(executionRunSummaryView),
    page: {
      limit: input.query.limit,
      nextCursor,
      hasMore: Boolean(nextCursor),
    },
  };
}

export function buildExecutionInspectorDetailResponse(input: {
  query: ExecutionInspectorDetailQuery;
  run: ExecutionRun;
  steps: ExecutionStepPage;
  events: ExecutionEventPage;
}) {
  return {
    ok: true as const,
    tenantKey: input.query.tenantKey,
    run: executionRunDetailView(input.run),
    steps: input.steps.steps.map(executionStepDetailView),
    events: input.events.events.map(executionEventDetailView),
    page: {
      steps: {
        limit: input.query.stepsLimit,
        truncated: input.steps.truncated,
      },
      events: {
        limit: input.query.eventsLimit,
        nextAfterSequence: input.events.nextAfterSequence ?? null,
        hasMore: input.events.nextAfterSequence !== undefined,
      },
    },
    redaction: {
      destination: "model" as const,
      policyVersion: SUPPORT_REDACTION_POLICY_VERSION,
      bounded: true as const,
    },
  };
}
