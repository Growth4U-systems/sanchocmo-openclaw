import { createHash } from "node:crypto";
import {
  DurableJsonValidationError,
  type DurableJsonBounds,
  type DurableJsonObject,
  findDurableSecret,
  validateDurableJson,
} from "@/lib/durable-execution/json-contract";

export const LEADS_SEARCH_PROJECTION_SCHEMA_VERSION = 1 as const;
export const LEADS_SEARCH_PROJECTION_MAX_CANDIDATES = 10 as const;
export const LEADS_SEARCH_PROJECTION_DEFAULT_PAGE_SIZE = 20 as const;
export const LEADS_SEARCH_PROJECTION_MAX_PAGE_SIZE = 100 as const;

export const LEADS_SEARCH_PROJECTION_CONFLICT_CODE =
  "leads_search_projection_conflict" as const;
export const LEADS_SEARCH_PROJECTION_TENANT_CONFLICT_CODE =
  "leads_search_projection_tenant_conflict" as const;
export const LEADS_SEARCH_PROJECTION_INVALID_CODE =
  "leads_search_projection_invalid" as const;
export const LEADS_SEARCH_PROJECTION_CORRUPT_CODE =
  "leads_search_projection_corrupt" as const;

const DURABLE_OPAQUE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/+~-]*$/;
const DURABLE_TENANT_PATTERN = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;
const FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/;
const DOMAIN_PATTERN =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

const RESULT_KEYS = new Set([
  "provider",
  "candidates",
  "totalAvailable",
  "returned",
  "page",
  "nextPage",
  "hasMore",
]);
const CANDIDATE_KEYS = new Set([
  "providerId",
  "name",
  "title",
  "linkedinUrl",
  "organizationName",
  "organizationDomain",
]);

/**
 * Product projection ceiling. The provider receipt remains in the effect
 * ledger; this table stores only the compact rows required by the product UI.
 */
export const LEADS_SEARCH_PROJECTION_RESULT_BOUNDS: Readonly<DurableJsonBounds> =
  Object.freeze({
    maxBytes: 16 * 1024,
    maxDepth: 6,
    maxNodes: 128,
    maxStringBytes: 2 * 1024,
    maxArrayItems: LEADS_SEARCH_PROJECTION_MAX_CANDIDATES,
    maxObjectKeys: 10,
  });

export type LeadsSearchProjectionTerminalStatus =
  "completed" | "partial" | "failed" | "cancelled";

export interface LeadsSearchCandidateV2 {
  providerId: string;
  name: string;
  title?: string;
  linkedinUrl?: string;
  organizationName?: string;
  organizationDomain?: string;
}

export interface LeadsSearchProjectedResultV2 {
  provider: "apollo";
  candidates: LeadsSearchCandidateV2[];
  totalAvailable: number | null;
  returned: number;
  page: 1;
  nextPage: number | null;
  hasMore: boolean;
}

export interface LeadsSearchProjection {
  tenantKey: string;
  runId: string;
  terminalStatus: LeadsSearchProjectionTerminalStatus;
  candidateCount: number;
  result: LeadsSearchProjectedResultV2 | null;
  projectionFingerprint: string;
  projectedAt: string;
}

export interface UpsertLeadsSearchProjectionInput {
  tenantKey: string;
  runId: string;
  terminalStatus: LeadsSearchProjectionTerminalStatus;
  /** Only completed runs carry product rows; every other terminal is null. */
  result?: LeadsSearchProjectedResultV2 | null;
  projectedAt?: Date;
}

export interface LeadsSearchProjectionRef {
  tenantKey: string;
  runId: string;
}

export interface LeadsSearchProjectionCursor {
  projectedAt: string;
  runId: string;
}

export interface ListLeadsSearchProjectionsInput {
  tenantKey: string;
  limit?: number;
  before?: LeadsSearchProjectionCursor;
}

export interface LeadsSearchProjectionPage {
  items: LeadsSearchProjection[];
  nextCursor?: LeadsSearchProjectionCursor;
}

export interface LeadsSearchProjectionRepository {
  upsert(
    input: UpsertLeadsSearchProjectionInput,
  ): Promise<LeadsSearchProjection>;
  get(input: LeadsSearchProjectionRef): Promise<LeadsSearchProjection | null>;
  list(
    input: ListLeadsSearchProjectionsInput,
  ): Promise<LeadsSearchProjectionPage>;
}

export class LeadsSearchProjectionValidationError extends Error {
  readonly code = LEADS_SEARCH_PROJECTION_INVALID_CODE;

  constructor(
    message = "leads.search projection is invalid",
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "LeadsSearchProjectionValidationError";
  }
}

/** Stable immutable-row error; the payload and fingerprint never escape. */
export class LeadsSearchProjectionConflictError extends Error {
  readonly code = LEADS_SEARCH_PROJECTION_CONFLICT_CODE;

  constructor() {
    super("leads.search run is already bound to a different projection");
    this.name = "LeadsSearchProjectionConflictError";
  }
}

/** A globally immutable run id can never be adopted by another tenant. */
export class LeadsSearchProjectionTenantConflictError extends Error {
  readonly code = LEADS_SEARCH_PROJECTION_TENANT_CONFLICT_CODE;

  constructor() {
    super("leads.search run is already bound to another tenant");
    this.name = "LeadsSearchProjectionTenantConflictError";
  }
}

/** Stable read-path failure for malformed or tampered persisted rows. */
export class LeadsSearchProjectionCorruptError extends Error {
  readonly code = LEADS_SEARCH_PROJECTION_CORRUPT_CODE;

  constructor() {
    super("leads.search projection storage contains an invalid row");
    this.name = "LeadsSearchProjectionCorruptError";
  }
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  ) {
    throw new LeadsSearchProjectionValidationError(
      `${field} must be an object`,
    );
  }
  return value as Record<string, unknown>;
}

function onlyKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  field: string,
): void {
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new LeadsSearchProjectionValidationError(
      `${field} contains an unsupported field`,
    );
  }
}

function text(value: unknown, field: string, maximumLength: number): string {
  if (typeof value !== "string") {
    throw new LeadsSearchProjectionValidationError(`${field} must be text`);
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maximumLength) {
    throw new LeadsSearchProjectionValidationError(
      `${field} is outside its length limit`,
    );
  }
  return normalized;
}

function optionalText(
  value: unknown,
  field: string,
  maximumLength: number,
): string | undefined {
  return value === undefined ? undefined : text(value, field, maximumLength);
}

export function normalizeLeadsSearchProjectionTenantKey(value: string): string {
  const normalized = text(value, "tenantKey", 128).toLowerCase();
  if (
    !DURABLE_TENANT_PATTERN.test(normalized) ||
    findDurableSecret(normalized)
  ) {
    throw new LeadsSearchProjectionValidationError("tenantKey is invalid");
  }
  return normalized;
}

export function normalizeLeadsSearchProjectionRunId(value: string): string {
  const normalized = text(value, "runId", 200);
  if (
    !DURABLE_OPAQUE_ID_PATTERN.test(normalized) ||
    findDurableSecret(normalized)
  ) {
    throw new LeadsSearchProjectionValidationError("runId is invalid");
  }
  return normalized;
}

function nonNegativeInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new LeadsSearchProjectionValidationError(
      `${field} must be a non-negative integer`,
    );
  }
  return value as number;
}

function nullableNonNegativeInteger(
  value: unknown,
  field: string,
): number | null {
  return value === null ? null : nonNegativeInteger(value, field);
}

function linkedinUrl(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  const normalized = text(value, "candidate.linkedinUrl", 2_048);
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new LeadsSearchProjectionValidationError(
      "candidate.linkedinUrl is invalid",
    );
  }
  const hostname = parsed.hostname.toLowerCase();
  if (
    parsed.protocol !== "https:" ||
    (hostname !== "linkedin.com" && !hostname.endsWith(".linkedin.com"))
  ) {
    throw new LeadsSearchProjectionValidationError(
      "candidate.linkedinUrl is invalid",
    );
  }
  return normalized;
}

function organizationDomain(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  const normalized = text(value, "candidate.organizationDomain", 253)
    .toLowerCase()
    .replace(/\.$/, "");
  if (!DOMAIN_PATTERN.test(normalized)) {
    throw new LeadsSearchProjectionValidationError(
      "candidate.organizationDomain is invalid",
    );
  }
  return normalized;
}

function normalizeCandidate(value: unknown): LeadsSearchCandidateV2 {
  const candidate = record(value, "candidate");
  onlyKeys(candidate, CANDIDATE_KEYS, "candidate");
  const title = optionalText(candidate.title, "candidate.title", 512);
  const profileUrl = linkedinUrl(candidate.linkedinUrl);
  const companyName = optionalText(
    candidate.organizationName,
    "candidate.organizationName",
    512,
  );
  const companyDomain = organizationDomain(candidate.organizationDomain);
  return {
    providerId: text(candidate.providerId, "candidate.providerId", 256),
    name: text(candidate.name, "candidate.name", 256),
    ...(title ? { title } : {}),
    ...(profileUrl ? { linkedinUrl: profileUrl } : {}),
    ...(companyName ? { organizationName: companyName } : {}),
    ...(companyDomain ? { organizationDomain: companyDomain } : {}),
  };
}

export function normalizeLeadsSearchProjectedResultV2(
  value: unknown,
): LeadsSearchProjectedResultV2 {
  const input = record(value, "result");
  onlyKeys(input, RESULT_KEYS, "result");
  if (input.provider !== "apollo") {
    throw new LeadsSearchProjectionValidationError(
      "result.provider is invalid",
    );
  }
  if (
    !Array.isArray(input.candidates) ||
    input.candidates.length > LEADS_SEARCH_PROJECTION_MAX_CANDIDATES
  ) {
    throw new LeadsSearchProjectionValidationError(
      "result.candidates is outside its item limit",
    );
  }
  const candidates = input.candidates.map(normalizeCandidate);
  if (
    new Set(candidates.map((candidate) => candidate.providerId)).size !==
    candidates.length
  ) {
    throw new LeadsSearchProjectionValidationError(
      "result.candidates contains duplicate provider ids",
    );
  }
  const returned = nonNegativeInteger(input.returned, "result.returned");
  if (returned !== candidates.length) {
    throw new LeadsSearchProjectionValidationError(
      "result.returned does not match its candidates",
    );
  }
  const totalAvailable = nullableNonNegativeInteger(
    input.totalAvailable,
    "result.totalAvailable",
  );
  if (totalAvailable !== null && totalAvailable < returned) {
    throw new LeadsSearchProjectionValidationError(
      "result.totalAvailable is smaller than result.returned",
    );
  }
  if (input.page !== 1) {
    throw new LeadsSearchProjectionValidationError("result.page must be one");
  }
  const nextPage = nullableNonNegativeInteger(
    input.nextPage,
    "result.nextPage",
  );
  if (nextPage !== null && nextPage < 2) {
    throw new LeadsSearchProjectionValidationError(
      "result.nextPage must follow the current page",
    );
  }
  if (
    typeof input.hasMore !== "boolean" ||
    input.hasMore !== (nextPage !== null)
  ) {
    throw new LeadsSearchProjectionValidationError(
      "result.hasMore does not match result.nextPage",
    );
  }

  const normalized: LeadsSearchProjectedResultV2 = {
    provider: "apollo",
    candidates,
    totalAvailable,
    returned,
    page: 1,
    nextPage,
    hasMore: input.hasMore,
  };
  try {
    return validateDurableJson<DurableJsonObject>(normalized, {
      bounds: LEADS_SEARCH_PROJECTION_RESULT_BOUNDS,
      secrets: { mode: "reject" },
    }).value as unknown as LeadsSearchProjectedResultV2;
  } catch (error) {
    if (error instanceof DurableJsonValidationError) {
      throw new LeadsSearchProjectionValidationError(
        "result violates its bounded JSON contract",
        { cause: error },
      );
    }
    throw error;
  }
}

function terminalStatus(value: unknown): LeadsSearchProjectionTerminalStatus {
  if (
    value !== "completed" &&
    value !== "partial" &&
    value !== "failed" &&
    value !== "cancelled"
  ) {
    throw new LeadsSearchProjectionValidationError("terminalStatus is invalid");
  }
  return value;
}

function isoTimestamp(value: Date | string, field: string): string {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new LeadsSearchProjectionValidationError(`${field} is invalid`);
  }
  return parsed.toISOString();
}

function fingerprint(input: {
  terminalStatus: LeadsSearchProjectionTerminalStatus;
  candidateCount: number;
  result: LeadsSearchProjectedResultV2 | null;
}): string {
  const canonical = validateDurableJson<DurableJsonObject>(
    {
      schemaVersion: LEADS_SEARCH_PROJECTION_SCHEMA_VERSION,
      terminalStatus: input.terminalStatus,
      candidateCount: input.candidateCount,
      result: input.result as unknown as DurableJsonObject | null,
    },
    {
      bounds: LEADS_SEARCH_PROJECTION_RESULT_BOUNDS,
      secrets: { mode: "reject" },
    },
  ).canonicalJson;
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function normalizeUpsertLeadsSearchProjectionInput(
  input: UpsertLeadsSearchProjectionInput,
): LeadsSearchProjection {
  const status = terminalStatus(input.terminalStatus);
  const rawResult = input.result ?? null;
  if (status === "completed" && rawResult === null) {
    throw new LeadsSearchProjectionValidationError(
      "completed projection requires a result",
    );
  }
  if (status !== "completed" && rawResult !== null) {
    throw new LeadsSearchProjectionValidationError(
      "non-completed projection cannot contain a result",
    );
  }
  const result =
    rawResult === null
      ? null
      : normalizeLeadsSearchProjectedResultV2(rawResult);
  const candidateCount = result?.returned ?? 0;
  return {
    tenantKey: normalizeLeadsSearchProjectionTenantKey(input.tenantKey),
    runId: normalizeLeadsSearchProjectionRunId(input.runId),
    terminalStatus: status,
    candidateCount,
    result,
    projectionFingerprint: fingerprint({
      terminalStatus: status,
      candidateCount,
      result,
    }),
    projectedAt: isoTimestamp(input.projectedAt ?? new Date(), "projectedAt"),
  };
}

export function normalizeLeadsSearchProjectionCursor(
  input: LeadsSearchProjectionCursor,
): LeadsSearchProjectionCursor {
  return {
    projectedAt: isoTimestamp(input.projectedAt, "cursor.projectedAt"),
    runId: normalizeLeadsSearchProjectionRunId(input.runId),
  };
}

export function normalizeLeadsSearchProjectionListLimit(
  value?: number,
): number {
  const limit = value ?? LEADS_SEARCH_PROJECTION_DEFAULT_PAGE_SIZE;
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > LEADS_SEARCH_PROJECTION_MAX_PAGE_SIZE
  ) {
    throw new LeadsSearchProjectionValidationError("list limit is invalid");
  }
  return limit;
}

/** Validate a database row and detect corruption without exposing its payload. */
export function leadsSearchProjectionFromRow(
  value: Record<string, unknown>,
): LeadsSearchProjection {
  try {
    const resultValue = value.result ?? null;
    const normalized = normalizeUpsertLeadsSearchProjectionInput({
      tenantKey: String(value.tenantKey ?? value.tenant_key ?? ""),
      runId: String(value.runId ?? value.run_id ?? ""),
      terminalStatus: terminalStatus(
        value.terminalStatus ?? value.terminal_status,
      ),
      result:
        resultValue === null
          ? null
          : normalizeLeadsSearchProjectedResultV2(resultValue),
      projectedAt: new Date(
        String(value.projectedAt ?? value.projected_at ?? ""),
      ),
    });
    const storedCount = Number(value.candidateCount ?? value.candidate_count);
    const storedFingerprint = String(
      value.projectionFingerprint ?? value.projection_fingerprint ?? "",
    );
    if (
      !FINGERPRINT_PATTERN.test(storedFingerprint) ||
      storedCount !== normalized.candidateCount ||
      storedFingerprint !== normalized.projectionFingerprint
    ) {
      throw new LeadsSearchProjectionCorruptError();
    }
    return normalized;
  } catch (error) {
    if (error instanceof LeadsSearchProjectionCorruptError) throw error;
    throw new LeadsSearchProjectionCorruptError();
  }
}
