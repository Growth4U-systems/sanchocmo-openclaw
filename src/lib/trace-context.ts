import crypto from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

const TRACE_ID_MAX_LENGTH = 128;
const SAFE_CORRELATION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const W3C_TRACE_ID = /^[0-9a-f]{32}$/;
const W3C_PARENT_ID = /^[0-9a-f]{16}$/;
const W3C_TRACEPARENT = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;

export type TraceHeaderValue = string | string[] | undefined;

export interface TraceHeadersLike {
  [name: string]: TraceHeaderValue;
  "x-request-id"?: TraceHeaderValue;
  "x-correlation-id"?: TraceHeaderValue;
  traceparent?: TraceHeaderValue;
}

/**
 * Correlation context shared by HTTP requests, agent runs and downstream tools.
 *
 * `traceId` is the user-facing/request correlation id and deliberately accepts
 * existing non-W3C ids. `w3cTraceId` is always a 32-character hexadecimal id so
 * the same context can also be forwarded through `traceparent`.
 */
export interface TraceContext {
  traceId: string;
  w3cTraceId: string;
  spanId: string;
  sampled: boolean;
  traceparent: string;
}

const traceStorage = new AsyncLocalStorage<TraceContext>();

function firstHeader(value: TraceHeaderValue): string | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  return typeof candidate === "string" ? candidate : undefined;
}

/** Reject control characters and unbounded request ids before logging them. */
export function normalizeTraceId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (
    !normalized
    || normalized.length > TRACE_ID_MAX_LENGTH
    || !SAFE_CORRELATION_ID.test(normalized)
  ) {
    return undefined;
  }
  return normalized;
}

export function parseTraceparent(value: unknown): Pick<TraceContext, "w3cTraceId" | "spanId" | "sampled"> | null {
  if (typeof value !== "string") return null;
  const match = W3C_TRACEPARENT.exec(value.trim().toLowerCase());
  if (!match) return null;
  const [, w3cTraceId, spanId, flags] = match;
  if (
    !W3C_TRACE_ID.test(w3cTraceId)
    || !W3C_PARENT_ID.test(spanId)
    || /^0+$/.test(w3cTraceId)
    || /^0+$/.test(spanId)
  ) {
    return null;
  }
  return {
    w3cTraceId,
    spanId,
    sampled: (Number.parseInt(flags, 16) & 0x01) === 0x01,
  };
}

function randomHex(bytes: number): string {
  let value = crypto.randomBytes(bytes).toString("hex");
  // W3C forbids the all-zero trace/span ids. This is astronomically unlikely,
  // but keeping the invariant explicit makes deterministic test stubs safe.
  if (/^0+$/.test(value)) value = `${"0".repeat(value.length - 1)}1`;
  return value;
}

function w3cIdForCorrelationId(traceId: string): string {
  const lowered = traceId.toLowerCase();
  if (W3C_TRACE_ID.test(lowered) && !/^0+$/.test(lowered)) return lowered;
  return crypto.createHash("sha256").update(traceId).digest("hex").slice(0, 32);
}

function formatTraceparent(w3cTraceId: string, spanId: string, sampled: boolean): string {
  return `00-${w3cTraceId}-${spanId}-${sampled ? "01" : "00"}`;
}

export function createTraceContext(input: {
  traceId?: unknown;
  traceparent?: unknown;
  sampled?: boolean;
} = {}): TraceContext {
  const parent = parseTraceparent(input.traceparent);
  const traceId = normalizeTraceId(input.traceId)
    ?? parent?.w3cTraceId
    ?? randomHex(16);
  const w3cTraceId = parent?.w3cTraceId ?? w3cIdForCorrelationId(traceId);
  const spanId = randomHex(8);
  const sampled = input.sampled ?? parent?.sampled ?? true;
  return {
    traceId,
    w3cTraceId,
    spanId,
    sampled,
    traceparent: formatTraceparent(w3cTraceId, spanId, sampled),
  };
}

export function traceContextFromHeaders(headers: TraceHeadersLike = {}): TraceContext {
  return createTraceContext({
    traceId: firstHeader(headers["x-request-id"])
      ?? firstHeader(headers["x-correlation-id"]),
    traceparent: firstHeader(headers.traceparent),
  });
}

/** Start a child span while retaining the request-facing correlation id. */
export function childTraceContext(parent: TraceContext): TraceContext {
  const spanId = randomHex(8);
  return {
    ...parent,
    spanId,
    traceparent: formatTraceparent(parent.w3cTraceId, spanId, parent.sampled),
  };
}

export function tracePropagationHeaders(context: TraceContext): Record<string, string> {
  return {
    "X-Request-Id": context.traceId,
    "X-Correlation-Id": context.traceId,
    traceparent: context.traceparent,
  };
}

export function withTraceContext<T>(
  context: TraceContext,
  operation: () => T,
): T {
  return traceStorage.run(context, operation);
}

export function getTraceContext(): TraceContext | undefined {
  return traceStorage.getStore();
}

export function getTraceId(): string | undefined {
  return getTraceContext()?.traceId;
}
