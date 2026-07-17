import { createHash } from "node:crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import {
  traceContextFromHeaders,
  type TraceContext,
} from "@/lib/trace-context";
import {
  LeadsSearchProjectionValidationError,
  normalizeLeadsSearchProjectionRunId,
  normalizeLeadsSearchProjectionTenantKey,
} from "./search-projection";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/+~-]*$/;
const SAFE_ERROR_CODE_PATTERN = /^[a-z][a-z0-9_]{1,95}$/;

export class LeadsSearchApiRequestError extends Error {
  constructor(
    readonly code: string,
    readonly status = 400,
  ) {
    super(code);
    this.name = "LeadsSearchApiRequestError";
  }
}

export interface LeadsSearchApiFailure {
  status: number;
  code: string;
}

export function prepareLeadsSearchApiResponse(
  req: NextApiRequest,
  res: NextApiResponse,
): TraceContext {
  const traceContext = req.traceContext ?? traceContextFromHeaders(req.headers);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Request-Id", traceContext.traceId);
  res.setHeader("traceparent", traceContext.traceparent);
  return traceContext;
}

export function leadsSearchApiSlug(req: NextApiRequest): string {
  const body = plainRecord(req.body);
  const candidate = req.query.slug ?? body?.slug ?? req.ctx?.clientSlug;
  if (Array.isArray(candidate) || typeof candidate !== "string") {
    throw new LeadsSearchApiRequestError("leads_search_slug_required");
  }
  try {
    return normalizeLeadsSearchProjectionTenantKey(candidate);
  } catch (error) {
    if (error instanceof LeadsSearchProjectionValidationError) {
      throw new LeadsSearchApiRequestError("leads_search_slug_invalid");
    }
    throw error;
  }
}

export function leadsSearchApiRunId(req: NextApiRequest): string {
  const candidate = req.query.id;
  if (Array.isArray(candidate) || typeof candidate !== "string") {
    throw new LeadsSearchApiRequestError("leads_search_run_id_required");
  }
  try {
    return normalizeLeadsSearchProjectionRunId(candidate);
  } catch (error) {
    if (error instanceof LeadsSearchProjectionValidationError) {
      throw new LeadsSearchApiRequestError("leads_search_run_id_invalid");
    }
    throw error;
  }
}

export function plainRecord(value: unknown): Record<string, unknown> | null {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  ) {
    return null;
  }
  return value as Record<string, unknown>;
}

function normalizedRequestId(value: unknown): string | null {
  if (value === undefined) return null;
  if (typeof value !== "string") {
    throw new LeadsSearchApiRequestError("leads_search_request_id_invalid");
  }
  const normalized = value.trim();
  if (
    !normalized ||
    normalized.length > 160 ||
    !REQUEST_ID_PATTERN.test(normalized)
  ) {
    throw new LeadsSearchApiRequestError("leads_search_request_id_invalid");
  }
  return normalized;
}

export type LeadsSearchIdempotency =
  { requestId: string } | { idempotencyKey: string };

/** Exactly one caller-controlled idempotency source is accepted. */
export function leadsSearchIdempotency(
  req: NextApiRequest,
  body: Record<string, unknown>,
): LeadsSearchIdempotency {
  const rawHeader = req.headers["idempotency-key"];
  if (Array.isArray(rawHeader)) {
    throw new LeadsSearchApiRequestError("leads_search_request_id_invalid");
  }
  const header = normalizedRequestId(rawHeader);
  const requestId = normalizedRequestId(body.requestId);
  if ((header === null) === (requestId === null)) {
    throw new LeadsSearchApiRequestError(
      header === null
        ? "leads_search_request_id_required"
        : "leads_search_request_id_ambiguous",
    );
  }
  return requestId !== null
    ? { requestId }
    : { idempotencyKey: header as string };
}

export function leadsSearchActorId(req: NextApiRequest, slug: string): string {
  const identity =
    req.ctx?.clientSlug ??
    (req.ctx?.isAdmin ? "admin" : "authenticated");
  const digest = createHash("sha256")
    .update(`${slug}\0${identity}`)
    .digest("hex")
    .slice(0, 40);
  return `user_${digest}`;
}

export function leadsSearchApiFailure(error: unknown): LeadsSearchApiFailure {
  if (error instanceof LeadsSearchApiRequestError) {
    return { status: error.status, code: error.code };
  }
  if (error instanceof LeadsSearchProjectionValidationError) {
    return { status: 400, code: "leads_search_request_invalid" };
  }
  if (error && typeof error === "object") {
    const candidate = error as {
      name?: unknown;
      status?: unknown;
      code?: unknown;
    };
    if (
      candidate.name === "LeadsSearchError" &&
      typeof candidate.status === "number" &&
      [400, 403, 404, 409, 429, 503].includes(candidate.status) &&
      typeof candidate.code === "string" &&
      SAFE_ERROR_CODE_PATTERN.test(candidate.code)
    ) {
      return { status: candidate.status, code: candidate.code };
    }
  }
  return { status: 503, code: "leads_search_unavailable" };
}

export function safeLeadsSearchApiLog(
  logger: ((message: string) => void) | undefined,
  operation: string,
  traceId: string,
): void {
  try {
    (logger ?? console.error)(
      `[leads-search-api] ${operation} failed traceId=${traceId}`,
    );
  } catch {
    // A logger failure must never replace the stable API response.
  }
}
