import { createHash, randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { BASE } from "@/lib/data/paths";

export const RUNTIME_ROUTE_DISPATCH_GRANT_TTL_MS = 60_000;

const MAX_GRANTS = 2_000;
const FILE_LOCK_RETRIES = 100;
const FILE_LOCK_WAIT_MS = 10;
const FILE_LOCK_STALE_MS = 30_000;
const LOCK_SLEEP = new Int32Array(new SharedArrayBuffer(4));
const TOKEN_PATTERN = /^[a-f0-9]{64}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const AGENT_PATTERN = /^[a-z0-9][a-z0-9_-]{0,127}$/;

export interface RuntimeRouteDispatchGrantClaims {
  parentRunId: string;
  clientSlug: string;
  sourceThreadId: string;
  targetThreadId: string;
  agent: string;
  briefSha256: string;
  idempotencyKey: string;
}

interface StoredRuntimeRouteDispatchGrant
  extends RuntimeRouteDispatchGrantClaims {
  /** The raw bearer is returned once and is never persisted. */
  tokenSha256: string;
  createdAt: number;
  expiresAt: number;
  consumedAt?: number;
}

interface RuntimeRouteDispatchGrantStore {
  grants: StoredRuntimeRouteDispatchGrant[];
}

export interface IssuedRuntimeRouteDispatchGrant {
  token: string;
  expiresAt: number;
}

export type RuntimeRouteDispatchGrantClaimResult =
  | "claimed"
  | "already_consumed"
  | "invalid";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function runtimeRouteBriefSha256(brief: string): string {
  return sha256(brief.trim());
}

export function normalizeRuntimeRouteAgent(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  return AGENT_PATTERN.test(normalized) ? normalized : undefined;
}

export function runtimeRouteDispatchIdempotencyKey(input: {
  parentRunId: string;
  clientSlug: string;
  sourceThreadId: string;
  targetThreadId: string;
  agent: string;
  briefSha256: string;
}): string {
  const digest = sha256(JSON.stringify({
    schemaVersion: 1,
    parentRunId: input.parentRunId,
    clientSlug: input.clientSlug,
    sourceThreadId: input.sourceThreadId,
    targetThreadId: input.targetThreadId,
    agent: input.agent,
    briefSha256: input.briefSha256,
  })).slice(0, 24);
  return `mc-control:${input.parentRunId}:task-dispatch:${digest}`;
}

export function runtimeRouteDispatchGrantsFile(): string {
  return path.join(BASE, "_system", "runtime-route-dispatch-grants.json");
}

function readStore(): RuntimeRouteDispatchGrantStore {
  try {
    const parsed = JSON.parse(
      fs.readFileSync(runtimeRouteDispatchGrantsFile(), "utf8"),
    ) as RuntimeRouteDispatchGrantStore;
    return { grants: Array.isArray(parsed.grants) ? parsed.grants : [] };
  } catch {
    return { grants: [] };
  }
}

function writeStore(store: RuntimeRouteDispatchGrantStore): void {
  const file = runtimeRouteDispatchGrantsFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  fs.writeFileSync(
    temp,
    JSON.stringify({ grants: store.grants.slice(-MAX_GRANTS) }, null, 2),
    { mode: 0o600 },
  );
  fs.renameSync(temp, file);
}

function withFileLock<T>(operation: () => T): T {
  const file = runtimeRouteDispatchGrantsFile();
  const lock = `${file}.lock`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let descriptor: number | undefined;
  for (let attempt = 0; attempt < FILE_LOCK_RETRIES; attempt += 1) {
    try {
      descriptor = fs.openSync(lock, "wx", 0o600);
      break;
    } catch (error) {
      const code = error instanceof Error && "code" in error
        ? String((error as NodeJS.ErrnoException).code)
        : "";
      if (code !== "EEXIST") throw error;
      try {
        if (Date.now() - fs.statSync(lock).mtimeMs > FILE_LOCK_STALE_MS) {
          fs.unlinkSync(lock);
          continue;
        }
      } catch {
        continue;
      }
      Atomics.wait(LOCK_SLEEP, 0, 0, FILE_LOCK_WAIT_MS);
    }
  }
  if (descriptor === undefined) {
    throw new Error("Timed out acquiring runtime route grant lock");
  }
  try {
    return operation();
  } finally {
    fs.closeSync(descriptor);
    try {
      fs.unlinkSync(lock);
    } catch {
      // A stale-lock cleanup may already have removed it.
    }
  }
}

function prune(store: RuntimeRouteDispatchGrantStore, now: number): void {
  store.grants = store.grants.filter((grant) => grant.expiresAt > now);
}

function validClaims(
  claims: RuntimeRouteDispatchGrantClaims,
): RuntimeRouteDispatchGrantClaims | null {
  if (
    !claims.parentRunId ||
    !claims.clientSlug ||
    !claims.sourceThreadId ||
    !claims.targetThreadId ||
    !AGENT_PATTERN.test(claims.agent) ||
    !SHA256_PATTERN.test(claims.briefSha256) ||
    !claims.idempotencyKey ||
    claims.idempotencyKey.length > 240 ||
    /[\r\n\0]/.test(claims.idempotencyKey)
  ) {
    return null;
  }
  return { ...claims };
}

export async function issueRuntimeRouteDispatchGrant(
  input: RuntimeRouteDispatchGrantClaims,
  now = Date.now(),
): Promise<IssuedRuntimeRouteDispatchGrant> {
  const claims = validClaims(input);
  if (!claims) throw new Error("Invalid runtime route dispatch grant claims");
  const token = randomBytes(32).toString("hex");
  const stored: StoredRuntimeRouteDispatchGrant = {
    ...claims,
    tokenSha256: sha256(token),
    createdAt: now,
    expiresAt: now + RUNTIME_ROUTE_DISPATCH_GRANT_TTL_MS,
  };
  withFileLock(() => {
    const store = readStore();
    prune(store, now);
    // A resolver retry replaces an unclaimed bearer for the same immutable
    // dispatch. Keep consumed digests through their short TTL so an exact HTTP
    // retry can prove it is the same request without making the bearer reusable
    // for a second child run.
    store.grants = store.grants.filter((grant) => !(
      grant.parentRunId === stored.parentRunId &&
      grant.idempotencyKey === stored.idempotencyKey &&
      grant.consumedAt === undefined
    ));
    store.grants.push(stored);
    writeStore(store);
  });
  return { token, expiresAt: stored.expiresAt };
}

function claimsMatch(
  stored: StoredRuntimeRouteDispatchGrant,
  expected: RuntimeRouteDispatchGrantClaims,
): boolean {
  return stored.parentRunId === expected.parentRunId &&
    stored.clientSlug === expected.clientSlug &&
    stored.sourceThreadId === expected.sourceThreadId &&
    stored.targetThreadId === expected.targetThreadId &&
    stored.agent === expected.agent &&
    stored.briefSha256 === expected.briefSha256 &&
    stored.idempotencyKey === expected.idempotencyKey;
}

/** Atomically claims one exact bearer while retaining its replay tombstone. */
export async function consumeRuntimeRouteDispatchGrant(
  token: unknown,
  expectedInput: RuntimeRouteDispatchGrantClaims,
  now = Date.now(),
): Promise<RuntimeRouteDispatchGrantClaimResult> {
  if (typeof token !== "string" || !TOKEN_PATTERN.test(token)) return "invalid";
  const expected = validClaims(expectedInput);
  if (!expected) return "invalid";
  const tokenSha256 = sha256(token);
  return withFileLock(() => {
    const store = readStore();
    prune(store, now);
    const index = store.grants.findIndex((grant) =>
      grant.tokenSha256 === tokenSha256 && claimsMatch(grant, expected),
    );
    if (index < 0) {
      writeStore(store);
      return "invalid";
    }
    if (store.grants[index].consumedAt !== undefined) {
      writeStore(store);
      return "already_consumed";
    }
    store.grants[index].consumedAt = now;
    writeStore(store);
    return "claimed";
  });
}

export function resetRuntimeRouteDispatchGrantsForTests(): void {
  for (const file of [
    runtimeRouteDispatchGrantsFile(),
    `${runtimeRouteDispatchGrantsFile()}.lock`,
  ]) {
    try {
      fs.unlinkSync(file);
    } catch {
      // Already empty.
    }
  }
}
