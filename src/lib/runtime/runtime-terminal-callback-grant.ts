import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { AgentRun } from "@/lib/data/agent-runs";
import { canonicalThreadId, parseThreadId } from "@/lib/thread-id";

const PURPOSE = "sancho.runtime-terminal-callback" as const;
const AUDIENCE = "api/chat/webhook" as const;
const VERSION = 1 as const;
const SIGNATURE_DOMAIN = "sancho-terminal-callback-v1\0";
export const RUNTIME_TERMINAL_CALLBACK_GRANT_TTL_MS =
  // The private outbox retains a callback for 24 h from model completion. The
  // grant is minted before model execution, so reserve one additional hour for
  // the run itself, startup/replay jitter and clock skew.
  25 * 60 * 60 * 1_000;
const MAX_TTL_SECONDS = RUNTIME_TERMINAL_CALLBACK_GRANT_TTL_MS / 1_000;
const CLOCK_SKEW_SECONDS = 60;
const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/+~-]{0,159}$/;
const RUNTIME_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{1,3072}\.[A-Za-z0-9_-]{43}$/;

interface RuntimeTerminalCallbackGrantClaims {
  version: typeof VERSION;
  purpose: typeof PURPOSE;
  audience: typeof AUDIENCE;
  parentAgentRunId: string;
  dispatchRunId: string | null;
  runtimeId: string;
  capabilitySha256: string;
  transportSecretSha256: string;
  issuedAt: number;
  expiresAt: number;
}

interface GrantDependencies {
  secret?: string;
  now?: () => Date;
  ttlMs?: number;
}

export interface RuntimeTerminalCallbackAuthority {
  run: AgentRun;
  input: Record<string, unknown>;
  slug: string;
  threadId: string;
}

function signingSecret(explicit?: string): string {
  const secret =
    explicit ??
    process.env.SANCHO_RUNTIME_TERMINAL_GRANT_SECRET ??
    process.env.NEXTAUTH_SECRET;
  if (typeof secret !== "string" || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("runtime_terminal_callback_grant_secret_unavailable");
  }
  return secret;
}

export function runtimeTerminalCallbackGrantConfigured(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const secret =
    env.SANCHO_RUNTIME_TERMINAL_GRANT_SECRET ?? env.NEXTAUTH_SECRET;
  return (
    typeof secret === "string" && Buffer.byteLength(secret, "utf8") >= 32
  );
}

function capabilityDigest(capability: string): string {
  return createHash("sha256").update(capability, "utf8").digest("hex");
}

function signature(encodedClaims: string, secret: string): Buffer {
  return createHmac("sha256", secret)
    .update(SIGNATURE_DOMAIN, "utf8")
    .update(encodedClaims, "utf8")
    .digest();
}

function plainRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null
    ? (value as Record<string, unknown>)
    : null;
}

function canonicalClaims(value: unknown): RuntimeTerminalCallbackGrantClaims | null {
  const claims = plainRecord(value);
  if (!claims) return null;
  const expectedKeys = [
    "version",
    "purpose",
    "audience",
    "parentAgentRunId",
    "dispatchRunId",
    "runtimeId",
    "capabilitySha256",
    "transportSecretSha256",
    "issuedAt",
    "expiresAt",
  ];
  if (
    Object.keys(claims).length !== expectedKeys.length ||
    expectedKeys.some((key) => !Object.hasOwn(claims, key)) ||
    claims.version !== VERSION ||
    claims.purpose !== PURPOSE ||
    claims.audience !== AUDIENCE ||
    typeof claims.parentAgentRunId !== "string" ||
    !RUN_ID_PATTERN.test(claims.parentAgentRunId) ||
    (claims.dispatchRunId !== null &&
      (typeof claims.dispatchRunId !== "string" ||
        !RUN_ID_PATTERN.test(claims.dispatchRunId))) ||
    typeof claims.runtimeId !== "string" ||
    !RUNTIME_ID_PATTERN.test(claims.runtimeId) ||
    typeof claims.capabilitySha256 !== "string" ||
    !SHA256_PATTERN.test(claims.capabilitySha256) ||
    typeof claims.transportSecretSha256 !== "string" ||
    !SHA256_PATTERN.test(claims.transportSecretSha256) ||
    !Number.isSafeInteger(claims.issuedAt) ||
    !Number.isSafeInteger(claims.expiresAt)
  ) {
    return null;
  }
  return claims as unknown as RuntimeTerminalCallbackGrantClaims;
}

function decodeVerifiedClaims(
  token: unknown,
  dependencies: Pick<GrantDependencies, "secret">,
): RuntimeTerminalCallbackGrantClaims | null {
  if (typeof token !== "string" || !TOKEN_PATTERN.test(token)) return null;
  try {
    const [encodedClaims, encodedSignature] = token.split(".");
    if (!encodedClaims || !encodedSignature) return null;
    const supplied = Buffer.from(encodedSignature, "base64url");
    const authoritative = signature(
      encodedClaims,
      signingSecret(dependencies.secret),
    );
    if (
      supplied.length !== authoritative.length ||
      !timingSafeEqual(supplied, authoritative)
    ) {
      return null;
    }
    const decoded = Buffer.from(encodedClaims, "base64url");
    if (decoded.toString("base64url") !== encodedClaims || decoded.length > 3_072) {
      return null;
    }
    return canonicalClaims(JSON.parse(decoded.toString("utf8")));
  } catch {
    return null;
  }
}

/**
 * Mint a terminal-only callback credential using a server-only signing key.
 * The runtime can replay this bearer to the webhook, but cannot mint another
 * run, dispatch or transport binding and cannot use it at any tool endpoint.
 */
export function issueRuntimeTerminalCallbackGrant(
  input: {
    parentAgentRunId: string;
    dispatchRunId?: string;
    runtimeId: string;
    runtimeToolCapability: string;
    transportSecretSha256: string;
  },
  dependencies: GrantDependencies = {},
): { token: string; expiresAt: string } {
  if (
    !RUN_ID_PATTERN.test(input.parentAgentRunId) ||
    (input.dispatchRunId !== undefined &&
      !RUN_ID_PATTERN.test(input.dispatchRunId)) ||
    !RUNTIME_ID_PATTERN.test(input.runtimeId) ||
    !SHA256_PATTERN.test(input.runtimeToolCapability) ||
    !SHA256_PATTERN.test(input.transportSecretSha256)
  ) {
    throw new Error("runtime_terminal_callback_grant_scope_invalid");
  }
  const ttlMs = dependencies.ttlMs ?? RUNTIME_TERMINAL_CALLBACK_GRANT_TTL_MS;
  if (
    !Number.isSafeInteger(ttlMs) ||
    ttlMs <= 0 ||
    ttlMs > RUNTIME_TERMINAL_CALLBACK_GRANT_TTL_MS
  ) {
    throw new Error("runtime_terminal_callback_grant_ttl_invalid");
  }
  const issuedAt = Math.floor(
    (dependencies.now?.() ?? new Date()).getTime() / 1_000,
  );
  const expiresAt = issuedAt + Math.ceil(ttlMs / 1_000);
  const claims: RuntimeTerminalCallbackGrantClaims = {
    version: VERSION,
    purpose: PURPOSE,
    audience: AUDIENCE,
    parentAgentRunId: input.parentAgentRunId,
    dispatchRunId: input.dispatchRunId ?? null,
    runtimeId: input.runtimeId,
    capabilitySha256: capabilityDigest(input.runtimeToolCapability),
    transportSecretSha256: input.transportSecretSha256,
    issuedAt,
    expiresAt,
  };
  const encodedClaims = Buffer.from(JSON.stringify(claims), "utf8").toString(
    "base64url",
  );
  const token = `${encodedClaims}.${signature(
    encodedClaims,
    signingSecret(dependencies.secret),
  ).toString("base64url")}`;
  return { token, expiresAt: new Date(expiresAt * 1_000).toISOString() };
}

export function verifyRuntimeTerminalCallbackGrant(
  token: unknown,
  expected: {
    parentAgentRunId: string;
    dispatchRunId?: string;
    runtimeId: string;
    runtimeToolCapability: string;
    transportSecretSha256: string;
    parentCreatedAt: string;
  },
  dependencies: Pick<GrantDependencies, "secret" | "now"> = {},
): boolean {
  if (
    !RUN_ID_PATTERN.test(expected.parentAgentRunId) ||
    (expected.dispatchRunId !== undefined &&
      !RUN_ID_PATTERN.test(expected.dispatchRunId)) ||
    !RUNTIME_ID_PATTERN.test(expected.runtimeId) ||
    !SHA256_PATTERN.test(expected.runtimeToolCapability) ||
    !SHA256_PATTERN.test(expected.transportSecretSha256)
  ) {
    return false;
  }
  const claims = decodeVerifiedClaims(token, dependencies);
  if (!claims) return false;
  const now = Math.floor(
    (dependencies.now?.() ?? new Date()).getTime() / 1_000,
  );
  const parentCreatedAt = Math.floor(Date.parse(expected.parentCreatedAt) / 1_000);
  return Boolean(
    Number.isFinite(parentCreatedAt) &&
      claims.parentAgentRunId === expected.parentAgentRunId &&
      claims.dispatchRunId === (expected.dispatchRunId ?? null) &&
      claims.runtimeId === expected.runtimeId &&
      claims.capabilitySha256 ===
        capabilityDigest(expected.runtimeToolCapability) &&
      claims.transportSecretSha256 === expected.transportSecretSha256 &&
      claims.issuedAt + CLOCK_SKEW_SECONDS >= parentCreatedAt &&
      claims.issuedAt <= now + CLOCK_SKEW_SECONDS &&
      claims.expiresAt >= now &&
      claims.expiresAt > claims.issuedAt &&
      claims.expiresAt - claims.issuedAt <= MAX_TTL_SECONDS
  );
}

/** Dedicated webhook-only authority. Do not reuse this from control/tool APIs. */
export async function authorizeRuntimeTerminalCallbackRequest(
  input: {
    parentAgentRunId: unknown;
    dispatchRunId?: unknown;
    runtimeToolCapability: unknown;
    terminalGrant: unknown;
  },
  dependencies: {
    resolveParentRun(runId: string): Promise<AgentRun | null>;
    secret?: string;
    now?: () => Date;
  },
): Promise<RuntimeTerminalCallbackAuthority | null> {
  if (
    typeof input.parentAgentRunId !== "string" ||
    !RUN_ID_PATTERN.test(input.parentAgentRunId) ||
    (input.dispatchRunId !== undefined &&
      (typeof input.dispatchRunId !== "string" ||
        !RUN_ID_PATTERN.test(input.dispatchRunId))) ||
    typeof input.runtimeToolCapability !== "string" ||
    !SHA256_PATTERN.test(input.runtimeToolCapability)
  ) {
    return null;
  }
  try {
    const run = await dependencies.resolveParentRun(input.parentAgentRunId);
    const persisted = plainRecord(run?.input);
    const parsed = parseThreadId(run?.threadId);
    const transportSecretSha256 = persisted?.runtimeTransportSecretSha256;
    if (
      !run ||
      run.id !== input.parentAgentRunId ||
      !["queued", "running", "completed", "failed", "cancelled"].includes(
        run.status,
      ) ||
      !persisted ||
      !parsed ||
      parsed.slug !== parsed.slug.toLowerCase() ||
      canonicalThreadId(run.threadId) !== run.threadId ||
      persisted.slug !== parsed.slug ||
      persisted.threadId !== run.threadId ||
      typeof transportSecretSha256 !== "string" ||
      !SHA256_PATTERN.test(transportSecretSha256) ||
      (input.dispatchRunId !== undefined &&
        persisted.runtimeDispatchMode !== "ledger-v1") ||
      !verifyRuntimeTerminalCallbackGrant(
        input.terminalGrant,
        {
          parentAgentRunId: run.id,
          ...(typeof input.dispatchRunId === "string"
            ? { dispatchRunId: input.dispatchRunId }
            : {}),
          runtimeId: run.runtime,
          runtimeToolCapability: input.runtimeToolCapability,
          transportSecretSha256,
          parentCreatedAt: run.createdAt,
        },
        {
          ...(dependencies.secret ? { secret: dependencies.secret } : {}),
          ...(dependencies.now ? { now: dependencies.now } : {}),
        },
      )
    ) {
      return null;
    }
    return {
      run,
      input: persisted,
      slug: parsed.slug,
      threadId: run.threadId,
    };
  } catch {
    return null;
  }
}
