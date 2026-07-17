import {
  STAGING_CANARY_ORIGIN,
  StagingCanaryPreflightError,
  validateCanonicalStagingOrigin,
  type StagingCanaryPreflightCode,
} from "./staging-canary-preflight-contract";
import {
  STAGING_CANARY_READINESS_SCHEMA,
  type StagingCanaryReadinessSurface,
} from "./staging-canary-readiness-contract";

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordValue)
    : null;
}

function cacheDirectives(response: Response): Set<string> {
  return new Set(
    (response.headers.get("cache-control") ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

function validateSurface(
  surface: StagingCanaryReadinessSurface,
): StagingCanaryReadinessSurface {
  if (surface !== "leads" && surface !== "partnerships") {
    throw new StagingCanaryPreflightError("invalid_arguments");
  }
  return surface;
}

export function validateLiveCanaryReadiness(
  payload: unknown,
  requestedSurface: StagingCanaryReadinessSurface,
) {
  const surface = validateSurface(requestedSurface);
  const root = record(payload);
  if (
    root?.schemaVersion !== STAGING_CANARY_READINESS_SCHEMA ||
    root.surface !== surface ||
    typeof root.ready !== "boolean"
  ) {
    throw new StagingCanaryPreflightError("readiness_unavailable");
  }
  if (root.ready !== true) {
    throw new StagingCanaryPreflightError("readiness_not_ready");
  }
  return { surface, ready: true } as const;
}

const STAGING_CANARY_READINESS_MAX_BYTES = 64 * 1024;

async function readBoundedResponseBody(
  response: Response,
  maxBytes: number,
  errorCode: StagingCanaryPreflightCode,
): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new StagingCanaryPreflightError(errorCode);
  }
  const reader = response.body?.getReader();
  if (!reader) {
    const body = await response.text();
    if (Buffer.byteLength(body, "utf8") > maxBytes) {
      throw new StagingCanaryPreflightError(errorCode);
    }
    return body;
  }
  const decoder = new TextDecoder();
  let bytes = 0;
  let body = "";
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    bytes += chunk.value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new StagingCanaryPreflightError(errorCode);
    }
    body += decoder.decode(chunk.value, { stream: true });
  }
  return body + decoder.decode();
}

export async function fetchLiveCanaryReadiness(input: {
  origin: typeof STAGING_CANARY_ORIGIN;
  token: string;
  surface: StagingCanaryReadinessSurface;
  fetchImpl?: typeof fetch;
}) {
  try {
    const origin = validateCanonicalStagingOrigin(input.origin);
    const surface = validateSurface(input.surface);
    if (typeof input.token !== "string" || input.token.trim().length === 0) {
      throw new StagingCanaryPreflightError("invalid_arguments");
    }
    const response = await (input.fetchImpl ?? fetch)(
      `${origin}/api/internal/staging-canary-readiness/${surface}`,
      {
        method: "GET",
        redirect: "error",
        signal: AbortSignal.timeout(5_000),
        headers: { Authorization: `Bearer ${input.token}` },
      },
    );
    const caching = cacheDirectives(response);
    if (!response.ok || !caching.has("private") || !caching.has("no-store")) {
      throw new StagingCanaryPreflightError("readiness_unavailable");
    }
    const body = await readBoundedResponseBody(
      response,
      STAGING_CANARY_READINESS_MAX_BYTES,
      "readiness_unavailable",
    );
    return validateLiveCanaryReadiness(JSON.parse(body), surface);
  } catch (error) {
    if (error instanceof StagingCanaryPreflightError) throw error;
    throw new StagingCanaryPreflightError("readiness_unavailable");
  }
}
