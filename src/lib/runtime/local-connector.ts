import crypto from "crypto";
import fs from "fs";
import path from "path";
import { BASE } from "@/lib/data/paths";
import {
  cliBridgeProvider,
  gatewayPortOrDefault,
  normalizeBaseUrl,
  type CliBridgeProviderId,
} from "@/lib/cli-runtime-bridge";
import { RUNTIME_TOOL_CAPABILITY_MAX_AGE_MS } from "@/lib/runtime/runtime-tool-capability";
import { RUNTIME_TERMINAL_CALLBACK_GRANT_TTL_MS } from "@/lib/runtime/runtime-terminal-callback-grant";
import type { InboundMessage } from "@/lib/runtime/types";

export type LocalConnectorProviderId = Extract<CliBridgeProviderId, "claude-code" | "codex">;
export type LocalConnectorSessionStatus = "pending" | "connected" | "expired" | "revoked";
export type LocalConnectorJobStatus = "pending" | "claimed" | "dispatched" | "failed";
export type LocalConnectorRecoveryReason =
  | "orphaned_before_claim"
  | "orphaned_after_claim"
  | "connector_failed"
  | "callback_timeout";

interface LocalConnectorAgentRunRecovery {
  reason: LocalConnectorRecoveryReason;
  dueAt: string;
  status: "pending" | "claimed" | "delivered";
  attempts: number;
  claimId?: string;
  claimedAt?: string;
  deliveredAt?: string;
}

export interface LocalConnectorRuntimeStatus {
  ok: boolean;
  command?: string;
  version?: string;
  path?: string;
  error?: string;
}

export interface LocalConnectorSession {
  id: string;
  provider: LocalConnectorProviderId;
  pairingCode: string;
  /** Short-lived bootstrap credential. Removed as soon as registration succeeds. */
  pairingTokenHash?: string;
  /** Hash of the durable connector credential issued during registration. */
  sessionTokenHash?: string;
  runtimeSecret: string;
  status: LocalConnectorSessionStatus;
  createdAt: string;
  /** Pairing expiry. It never controls an already-connected session. */
  expiresAt: string;
  /** Renewable lease for the registered session credential. */
  leaseExpiresAt?: string;
  connectedAt?: string;
  lastSeenAt?: string;
  activatedAt?: string;
  deviceName?: string;
  runtime?: LocalConnectorRuntimeStatus;
}

export interface LocalConnectorPublicSession {
  id: string;
  provider: LocalConnectorProviderId;
  pairingCode: string;
  status: LocalConnectorSessionStatus;
  createdAt: string;
  expiresAt: string;
  leaseExpiresAt?: string;
  connectedAt?: string;
  lastSeenAt?: string;
  activatedAt?: string;
  deviceName?: string;
  runtime?: LocalConnectorRuntimeStatus;
  online: boolean;
}

export interface LocalConnectorJob {
  id: string;
  provider: LocalConnectorProviderId;
  status: LocalConnectorJobStatus;
  createdAt: string;
  updatedAt: string;
  claimedAt?: string;
  completedAt?: string;
  connectorSessionId?: string;
  assignmentGeneration?: number;
  /** Server-issued terminal authority deadline retained without the bearer. */
  terminalCallbackGrantExpiresAt?: string;
  error?: string;
  /** Present only while the connector still needs to dispatch the job. */
  message?: InboundMessage;
  /** Non-sensitive correlation retained after the terminal payload is redacted. */
  messageSummary?: {
    slug: string;
    threadId: string;
    missionControlRunId?: string;
  };
  /** Durable, idempotent handoff that prevents the AgentRun from remaining
   * active when a local delivery can no longer produce a valid callback. */
  agentRunRecovery?: LocalConnectorAgentRunRecovery;
}

export interface ClaimedLocalConnectorAgentRunRecovery {
  jobId: string;
  claimId: string;
  provider: LocalConnectorProviderId;
  connectorSessionId?: string;
  missionControlRunId: string;
  threadId: string;
  reason: LocalConnectorRecoveryReason;
  error: string;
}

interface LocalConnectorStore {
  sessions: Record<string, LocalConnectorSession>;
  jobs: Record<string, LocalConnectorJob>;
}

export interface CreatedLocalConnectorSession {
  session: LocalConnectorPublicSession;
  pairingToken: string;
  runtimeSecret: string;
}

export interface RegisteredLocalConnectorSession {
  session: LocalConnectorPublicSession;
  runtimeSecret: string;
  /** Returned once for a pairing token; callers must replace the pairing token. */
  sessionCredential: string;
}

const PAIRING_TTL_MS = 15 * 60 * 1000;
const SESSION_LEASE_MS = 24 * 60 * 60 * 1000;
const ONLINE_FRESHNESS_MS = 45_000;
const TERMINAL_JOB_RETENTION_MS = 24 * 60 * 60 * 1000;
const PENDING_ORPHAN_MS = 2 * 60 * 1000;
const FAILED_CALLBACK_GRACE_MS = 30_000;
const RECOVERY_CLAIM_STALE_MS = 30_000;
const RECOVERY_RETRY_MS = 5_000;
const CAPABILITY_EXPIRY_SAFETY_MS = 1_000;
const TERMINAL_CALLBACK_RECOVERY_SAFETY_MS = 60_000;
const STORE_LOCK_TIMEOUT_MS = 2_000;
const STORE_LOCK_STALE_MS = 10_000;
const STORE_LOCK_RETRY_MS = 10;
const STORE_VERSION = 2;

export function isLocalConnectorProviderId(value: unknown): value is LocalConnectorProviderId {
  return value === "claude-code" || value === "codex";
}

export function localConnectorStoreFile(): string {
  return process.env.SANCHO_LOCAL_CONNECTOR_STORE_FILE || path.join(BASE, "_system", "runtime-local-connectors.json");
}

function emptyStore(): LocalConnectorStore {
  return { sessions: {}, jobs: {} };
}

interface LocalConnectorStoreLock {
  file: string;
  fd: number;
  dev: number;
  ino: number;
}

const STORE_LOCK_WAIT_ARRAY = new Int32Array(new SharedArrayBuffer(4));

function positiveEnvMs(name: string, fallback: number): number {
  const configured = Number(process.env[name] || fallback);
  return Number.isFinite(configured) && configured > 0 ? configured : fallback;
}

function acquireStoreLock(): LocalConnectorStoreLock {
  const storeFile = localConnectorStoreFile();
  const lockFile = `${storeFile}.lock`;
  fs.mkdirSync(path.dirname(storeFile), { recursive: true });
  const timeoutMs = positiveEnvMs("SANCHO_LOCAL_CONNECTOR_LOCK_TIMEOUT_MS", STORE_LOCK_TIMEOUT_MS);
  const staleMs = Math.max(
    timeoutMs * 2,
    positiveEnvMs("SANCHO_LOCAL_CONNECTOR_LOCK_STALE_MS", STORE_LOCK_STALE_MS),
  );
  const deadline = Date.now() + timeoutMs;

  while (true) {
    let fd: number | null = null;
    try {
      fd = fs.openSync(lockFile, "wx", 0o600);
      fs.writeFileSync(
        fd,
        `${JSON.stringify({ pid: process.pid, createdAt: Date.now(), nonce: randomId("lock", 6) })}\n`,
        "utf8",
      );
      fs.fsyncSync(fd);
      const stat = fs.fstatSync(fd);
      return { file: lockFile, fd, dev: stat.dev, ino: stat.ino };
    } catch (error) {
      if (fd !== null) {
        try {
          fs.closeSync(fd);
        } catch {
          // Ignore cleanup failure and preserve the acquisition error.
        }
        try {
          fs.unlinkSync(lockFile);
        } catch {
          // Another contender may already have replaced the failed lock.
        }
      }
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") throw error;

      try {
        const stat = fs.lstatSync(lockFile);
        if (stat.isFile() && !stat.isSymbolicLink() && Date.now() - stat.mtimeMs > staleMs) {
          fs.unlinkSync(lockFile);
          continue;
        }
      } catch (inspectionError) {
        if ((inspectionError as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw inspectionError;
      }

      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        throw new Error("Local connector store is busy; retry the request");
      }
      Atomics.wait(
        STORE_LOCK_WAIT_ARRAY,
        0,
        0,
        Math.min(STORE_LOCK_RETRY_MS, remainingMs),
      );
    }
  }
}

function releaseStoreLock(lock: LocalConnectorStoreLock): void {
  try {
    try {
      const current = fs.lstatSync(lock.file);
      if (
        current.isFile() &&
        !current.isSymbolicLink() &&
        current.dev === lock.dev &&
        current.ino === lock.ino
      ) {
        fs.unlinkSync(lock.file);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  } finally {
    fs.closeSync(lock.fd);
  }
}

function withStoreLock<T>(operation: () => T): T {
  const lock = acquireStoreLock();
  try {
    return operation();
  } finally {
    releaseStoreLock(lock);
  }
}

function readStoreUnlocked(): LocalConnectorStore {
  const file = localConnectorStoreFile();
  if (!fs.existsSync(file)) return emptyStore();
  // Older versions created/replaced this file with the process umask (usually
  // 0644) even though it contains connector secrets. Repair it on first use;
  // inability to chmod must not make a valid store look empty.
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    // The subsequent write path will retry with a mode-0600 atomic replacement.
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8")) as Partial<LocalConnectorStore> & {
      version?: unknown;
    };
    if (!parsed || typeof parsed !== "object") return emptyStore();
    return {
      sessions: parsed.sessions && typeof parsed.sessions === "object" ? parsed.sessions : {},
      jobs: parsed.jobs && typeof parsed.jobs === "object" ? parsed.jobs : {},
    };
  } catch {
    return emptyStore();
  }
}

function writeStoreUnlocked(store: LocalConnectorStore): void {
  const file = localConnectorStoreFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  let fd: number | null = null;
  try {
    fd = fs.openSync(tmp, "wx", 0o600);
    fs.writeFileSync(fd, `${JSON.stringify({ version: STORE_VERSION, ...store }, null, 2)}\n`, "utf-8");
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    fs.renameSync(tmp, file);
    fs.chmodSync(file, 0o600);
  } finally {
    if (fd !== null) fs.closeSync(fd);
    try {
      fs.unlinkSync(tmp);
    } catch {
      // The successful rename already removed the temporary pathname.
    }
  }
}

function withStoreTransaction<T>(
  nowMs: number,
  operation: (store: LocalConnectorStore, markChanged: () => void) => T,
): T {
  return withStoreLock(() => {
    const store = readStoreUnlocked();
    let changed = maintainStore(store, nowMs);
    const result = operation(store, () => {
      changed = true;
    });
    if (changed) writeStoreUnlocked(store);
    return result;
  });
}

function nowIso(nowMs = Date.now()): string {
  return new Date(nowMs).toISOString();
}

function tokenHash(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function safeHashEqual(left: string | undefined, right: string): boolean {
  if (!left || left.length !== right.length) return false;
  return crypto.timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

function randomId(prefix: string, bytes = 12): string {
  return `${prefix}_${crypto.randomBytes(bytes).toString("base64url")}`;
}

function randomCode(): string {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

function pairingExpired(session: LocalConnectorSession, nowMs = Date.now()): boolean {
  return new Date(session.expiresAt).getTime() <= nowMs;
}

function leaseExpired(session: LocalConnectorSession, nowMs = Date.now()): boolean {
  if (!session.leaseExpiresAt) return true;
  return new Date(session.leaseExpiresAt).getTime() <= nowMs;
}

function sessionLeaseMs(): number {
  const configured = Number(process.env.SANCHO_LOCAL_CONNECTOR_SESSION_LEASE_MS || SESSION_LEASE_MS);
  return Number.isFinite(configured) && configured > ONLINE_FRESHNESS_MS
    ? configured
    : SESSION_LEASE_MS;
}

function sessionLeaseExpiry(nowMs: number): string {
  return nowIso(nowMs + sessionLeaseMs());
}

function terminalJobRetentionMs(): number {
  const configured = Number(process.env.SANCHO_LOCAL_CONNECTOR_JOB_RETENTION_MS || TERMINAL_JOB_RETENTION_MS);
  return Number.isFinite(configured) && configured >= 0 ? configured : TERMINAL_JOB_RETENTION_MS;
}

function pendingOrphanMs(): number {
  const configured = Number(process.env.SANCHO_LOCAL_CONNECTOR_PENDING_ORPHAN_MS || PENDING_ORPHAN_MS);
  return Number.isFinite(configured) && configured >= ONLINE_FRESHNESS_MS
    ? configured
    : PENDING_ORPHAN_MS;
}

function callbackAuthorityExpiryMs(): number {
  return RUNTIME_TOOL_CAPABILITY_MAX_AGE_MS + CAPABILITY_EXPIRY_SAFETY_MS;
}

function terminalCallbackGrantExpiry(
  message: InboundMessage,
  createdAtMs: number,
): string | undefined {
  const grant = message.runtimeTerminalCallbackGrant;
  const expiresAt = Date.parse(
    message.runtimeTerminalCallbackGrantExpiresAt || "",
  );
  if (
    typeof grant !== "string" ||
    grant.length === 0 ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= createdAtMs ||
    expiresAt - createdAtMs >
      RUNTIME_TERMINAL_CALLBACK_GRANT_TTL_MS +
        TERMINAL_CALLBACK_RECOVERY_SAFETY_MS
  ) {
    return undefined;
  }
  return nowIso(expiresAt);
}

/**
 * The short-lived runtime capability limits tools/progress; it does not own a
 * terminal result. New jobs retain the grant deadline (never its bearer) so a
 * valid callback/outbox cannot be preempted by the old ~36-minute watchdog.
 * Persisted legacy jobs without that field retain their previous deadline.
 */
function terminalCallbackRecoveryAt(job: LocalConnectorJob): number {
  const grantExpiresAt = Date.parse(job.terminalCallbackGrantExpiresAt || "");
  if (Number.isFinite(grantExpiresAt)) {
    return grantExpiresAt + TERMINAL_CALLBACK_RECOVERY_SAFETY_MS;
  }
  return Date.parse(job.createdAt) + callbackAuthorityExpiryMs();
}

function failedCallbackGraceMs(): number {
  const configured = Number(
    process.env.SANCHO_LOCAL_CONNECTOR_FAILED_CALLBACK_GRACE_MS || FAILED_CALLBACK_GRACE_MS,
  );
  return Number.isFinite(configured) && configured >= 0
    ? configured
    : FAILED_CALLBACK_GRACE_MS;
}

export function localConnectorSessionOnline(
  session: Pick<LocalConnectorSession, "status" | "lastSeenAt" | "runtime" | "leaseExpiresAt">,
  nowMs = Date.now(),
): boolean {
  if (session.status !== "connected" || !session.lastSeenAt) return false;
  if (!session.leaseExpiresAt || new Date(session.leaseExpiresAt).getTime() <= nowMs) return false;
  if (session.runtime?.ok === false) return false;
  return nowMs - new Date(session.lastSeenAt).getTime() <= ONLINE_FRESHNESS_MS;
}

function publicSession(session: LocalConnectorSession, nowMs = Date.now()): LocalConnectorPublicSession {
  const status =
    (session.status === "pending" && pairingExpired(session, nowMs)) ||
    (session.status === "connected" && leaseExpired(session, nowMs))
      ? "expired"
      : session.status;
  return {
    id: session.id,
    provider: session.provider,
    pairingCode: session.pairingCode,
    status,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    leaseExpiresAt: session.leaseExpiresAt,
    connectedAt: session.connectedAt,
    lastSeenAt: session.lastSeenAt,
    activatedAt: session.activatedAt,
    deviceName: session.deviceName,
    runtime: session.runtime,
    online: localConnectorSessionOnline({ ...session, status }, nowMs),
  };
}

function findSessionByPairingToken(store: LocalConnectorStore, token: string): LocalConnectorSession | null {
  const hash = tokenHash(token);
  return Object.values(store.sessions).find((session) => safeHashEqual(session.pairingTokenHash, hash)) || null;
}

function findSessionByCredential(store: LocalConnectorStore, token: string): LocalConnectorSession | null {
  const hash = tokenHash(token);
  return Object.values(store.sessions).find((session) => safeHashEqual(session.sessionTokenHash, hash)) || null;
}

function preferredOnlineSession(
  store: LocalConnectorStore,
  provider: LocalConnectorProviderId,
  nowMs: number,
  excludedSessionId?: string,
): LocalConnectorSession | null {
  return Object.values(store.sessions)
    .filter(
      (session) =>
        session.provider === provider &&
        session.id !== excludedSessionId &&
        localConnectorSessionOnline(session, nowMs),
    )
    .sort((a, b) => {
      const activation = (b.activatedAt || "").localeCompare(a.activatedAt || "");
      if (activation !== 0) return activation;
      const seen = (b.lastSeenAt || "").localeCompare(a.lastSeenAt || "");
      return seen !== 0 ? seen : b.createdAt.localeCompare(a.createdAt);
    })[0] || null;
}

function recoveryError(reason: LocalConnectorRecoveryReason): string {
  switch (reason) {
    case "orphaned_before_claim":
      return "El conector local se desconectó antes de recoger la ejecución.";
    case "orphaned_after_claim":
      return "El conector local perdió una ejecución reclamada y su autoridad caducó.";
    case "connector_failed":
      return "El conector local no pudo entregar la ejecución al runtime.";
    case "callback_timeout":
      return "El runtime local no confirmó el resultado antes de caducar su autoridad.";
  }
}

function scheduleAgentRunRecovery(
  job: LocalConnectorJob,
  reason: LocalConnectorRecoveryReason,
  dueAtMs: number,
): boolean {
  if (!job.messageSummary?.missionControlRunId || job.agentRunRecovery) return false;
  job.agentRunRecovery = {
    reason,
    dueAt: nowIso(dueAtMs),
    status: "pending",
    attempts: 0,
  };
  return true;
}

function failOrphanedJob(
  job: LocalConnectorJob,
  reason: Extract<LocalConnectorRecoveryReason, "orphaned_before_claim" | "orphaned_after_claim">,
  nowMs: number,
): void {
  job.status = "failed";
  job.updatedAt = nowIso(nowMs);
  job.completedAt = job.updatedAt;
  job.error = recoveryError(reason);
  redactTerminalJob(job);
  scheduleAgentRunRecovery(job, reason, nowMs);
}

function redactTerminalJob(job: LocalConnectorJob): boolean {
  if (job.status !== "dispatched" && job.status !== "failed") return false;
  if (!job.message) return false;
  const capability = job.message.runtimeToolCapability;
  job.messageSummary = {
    slug: job.message.slug,
    threadId: job.message.threadId,
    ...(job.message.missionControlRunId
      ? { missionControlRunId: job.message.missionControlRunId }
      : {}),
  };
  if (capability && job.error) job.error = job.error.split(capability).join("[redacted]");
  delete job.message;
  return true;
}

function maintainStore(store: LocalConnectorStore, nowMs = Date.now()): boolean {
  let changed = false;
  for (const session of Object.values(store.sessions)) {
    // Version-1 compatibility: the connector used its pairing token forever.
    // Promote that hash to a renewable session credential without resurrecting
    // an old/offline connector indefinitely.
    if (session.status === "connected" && !session.sessionTokenHash && session.pairingTokenHash) {
      session.sessionTokenHash = session.pairingTokenHash;
      delete session.pairingTokenHash;
      const lastActivity = Date.parse(session.lastSeenAt || session.connectedAt || session.createdAt);
      session.leaseExpiresAt = sessionLeaseExpiry(Number.isFinite(lastActivity) ? lastActivity : nowMs);
      changed = true;
    }
    if (session.status === "pending" && pairingExpired(session, nowMs)) {
      session.status = "expired";
      delete session.pairingTokenHash;
      changed = true;
    } else if (session.status === "connected" && leaseExpired(session, nowMs)) {
      session.status = "expired";
      session.lastSeenAt = undefined;
      delete session.sessionTokenHash;
      changed = true;
    }
  }

  const retentionMs = terminalJobRetentionMs();
  for (const [jobId, job] of Object.entries(store.jobs)) {
    if (job.status === "pending") {
      const owner = job.connectorSessionId
        ? store.sessions[job.connectorSessionId]
        : undefined;
      const ownerOnline = Boolean(owner && localConnectorSessionOnline(owner, nowMs));
      const authorityExpired = nowMs - Date.parse(job.createdAt) >= callbackAuthorityExpiryMs();
      if (!ownerOnline) {
        const replacement = preferredOnlineSession(
          store,
          job.provider,
          nowMs,
          job.connectorSessionId,
        );
        if (replacement) {
          job.connectorSessionId = replacement.id;
          job.assignmentGeneration = (job.assignmentGeneration || 1) + 1;
          job.updatedAt = nowIso(nowMs);
          changed = true;
        } else {
          const unassignedSince = Date.parse(job.updatedAt || job.createdAt);
          if (
            authorityExpired ||
            (Number.isFinite(unassignedSince) && nowMs - unassignedSince >= pendingOrphanMs())
          ) {
            failOrphanedJob(job, "orphaned_before_claim", nowMs);
            changed = true;
          }
        }
      } else if (authorityExpired) {
        // A still-online connector that never claims a job cannot legitimately
        // complete it once the one-run callback authority has expired.
        failOrphanedJob(job, "orphaned_before_claim", nowMs);
        changed = true;
      }
    } else if (job.status === "claimed") {
      const recoveryAt = terminalCallbackRecoveryAt(job);
      if (Number.isFinite(recoveryAt) && nowMs >= recoveryAt) {
        // Never reassign a claimed job: the original bridge may already have
        // accepted it. Wait until terminal callback authority expires, then
        // fail closed.
        failOrphanedJob(job, "orphaned_after_claim", nowMs);
        changed = true;
      }
    }

    if (redactTerminalJob(job)) changed = true;
    if (job.status !== "dispatched" && job.status !== "failed") continue;
    const terminalAt = Date.parse(job.completedAt || job.updatedAt);
    if (!job.agentRunRecovery) {
      const reason: LocalConnectorRecoveryReason =
        job.status === "failed" ? "connector_failed" : "callback_timeout";
      const dueAt =
        job.status === "failed"
          ? job.terminalCallbackGrantExpiresAt
            ? terminalCallbackRecoveryAt(job)
            : terminalAt + failedCallbackGraceMs()
          : terminalCallbackRecoveryAt(job);
      if (Number.isFinite(dueAt) && scheduleAgentRunRecovery(job, reason, dueAt)) {
        changed = true;
      }
    }
    const recovery = job.agentRunRecovery;
    if (
      recovery?.status === "claimed" &&
      recovery.claimedAt &&
      nowMs - Date.parse(recovery.claimedAt) >= RECOVERY_CLAIM_STALE_MS
    ) {
      recovery.status = "pending";
      recovery.claimId = undefined;
      recovery.claimedAt = undefined;
      changed = true;
    }
    const recoverySettled = !recovery || recovery.status === "delivered";
    if (
      recoverySettled &&
      Number.isFinite(terminalAt) &&
      nowMs - terminalAt >= retentionMs
    ) {
      delete store.jobs[jobId];
      changed = true;
    }
  }
  return changed;
}

export function listLocalConnectorSessions(
  provider?: LocalConnectorProviderId,
  nowMs = Date.now(),
): LocalConnectorPublicSession[] {
  return withStoreTransaction(nowMs, (store) =>
    Object.values(store.sessions)
      .filter((session) => !provider || session.provider === provider)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 20)
      .map((session) => publicSession(session, nowMs)),
  );
}

export function getLocalConnectorSession(
  sessionId: string,
  nowMs = Date.now(),
): LocalConnectorPublicSession | null {
  return withStoreTransaction(nowMs, (store) => {
    const session = store.sessions[sessionId];
    return session ? publicSession(session, nowMs) : null;
  });
}

export function getLocalConnectorSessionInternal(
  sessionId: string,
  nowMs = Date.now(),
): LocalConnectorSession | null {
  return withStoreTransaction(nowMs, (store) => store.sessions[sessionId] || null);
}

export function createLocalConnectorSession(
  provider: LocalConnectorProviderId,
  nowMs = Date.now(),
): CreatedLocalConnectorSession {
  return withStoreTransaction(nowMs, (store, markChanged) => {
    const createdAt = nowIso(nowMs);
    const pairingToken = crypto.randomBytes(32).toString("base64url");
    const runtimeSecret = crypto.randomBytes(32).toString("base64url");
    const session: LocalConnectorSession = {
      id: randomId("lc"),
      provider,
      pairingCode: randomCode(),
      pairingTokenHash: tokenHash(pairingToken),
      runtimeSecret,
      status: "pending",
      createdAt,
      expiresAt: nowIso(nowMs + PAIRING_TTL_MS),
    };
    store.sessions[session.id] = session;
    markChanged();
    return {
      session: publicSession(session, nowMs),
      pairingToken,
      runtimeSecret,
    };
  });
}

/** Authenticate a bootstrap asset request with a pending pairing token or a
 * registered session credential. Mutating connector endpoints must use
 * authenticateLocalConnectorSessionCredential instead. */
export function authenticateLocalConnectorToken(
  token: string,
  nowMs = Date.now(),
): LocalConnectorSession | null {
  if (!token) return null;
  return withStoreTransaction(nowMs, (store) => {
    const pairingSession = findSessionByPairingToken(store, token);
    const sessionSession = findSessionByCredential(store, token);
    if (
      pairingSession &&
      pairingSession.status === "pending" &&
      !pairingExpired(pairingSession, nowMs)
    ) {
      return pairingSession;
    }
    if (
      sessionSession &&
      sessionSession.status === "connected" &&
      !leaseExpired(sessionSession, nowMs)
    ) {
      return sessionSession;
    }
    return null;
  });
}

export function authenticateLocalConnectorSessionCredential(
  token: string,
  nowMs = Date.now(),
): LocalConnectorSession | null {
  if (!token) return null;
  return withStoreTransaction(nowMs, (store) => {
    const session = findSessionByCredential(store, token);
    if (!session || session.status !== "connected" || leaseExpired(session, nowMs)) return null;
    return session;
  });
}

export function registerLocalConnector(
  token: string,
  input: {
    deviceName?: string;
    runtime?: LocalConnectorRuntimeStatus;
  },
  nowMs = Date.now(),
): RegisteredLocalConnectorSession | null {
  return withStoreTransaction(nowMs, (store, markChanged) => {
    const pairingSession = findSessionByPairingToken(store, token);
    const existingSession = findSessionByCredential(store, token);
    const session = pairingSession || existingSession;
    const registeringPairing = Boolean(pairingSession);
    if (
      !session ||
      session.status === "revoked" ||
      session.status === "expired" ||
      (registeringPairing && (session.status !== "pending" || pairingExpired(session, nowMs))) ||
      (!registeringPairing && (session.status !== "connected" || leaseExpired(session, nowMs)))
    ) {
      return null;
    }

    const timestamp = nowIso(nowMs);
    const sessionCredential = registeringPairing
      ? crypto.randomBytes(32).toString("base64url")
      : token;
    session.status = "connected";
    session.connectedAt = session.connectedAt || timestamp;
    session.lastSeenAt = timestamp;
    session.leaseExpiresAt = sessionLeaseExpiry(nowMs);
    session.sessionTokenHash = tokenHash(sessionCredential);
    delete session.pairingTokenHash;
    session.deviceName = input.deviceName?.slice(0, 120) || session.deviceName || "Este ordenador";
    session.runtime = input.runtime;
    markChanged();
    return {
      session: publicSession(session, nowMs),
      runtimeSecret: session.runtimeSecret,
      sessionCredential,
    };
  });
}

export function heartbeatLocalConnector(
  token: string,
  input: {
    runtime?: LocalConnectorRuntimeStatus;
  } = {},
  nowMs = Date.now(),
): LocalConnectorPublicSession | null {
  return withStoreTransaction(nowMs, (store, markChanged) => {
    const session = findSessionByCredential(store, token);
    if (!session || session.status !== "connected" || leaseExpired(session, nowMs)) {
      return null;
    }
    session.lastSeenAt = nowIso(nowMs);
    session.leaseExpiresAt = sessionLeaseExpiry(nowMs);
    if (input.runtime) session.runtime = input.runtime;
    markChanged();
    return publicSession(session, nowMs);
  });
}

export function activateLocalConnectorSession(
  sessionId: string,
  nowMs = Date.now(),
): LocalConnectorPublicSession | null {
  return withStoreTransaction(nowMs, (store, markChanged) => {
    const session = store.sessions[sessionId];
    if (!session || !localConnectorSessionOnline(session, nowMs)) return null;
    session.activatedAt = nowIso(nowMs);
    markChanged();
    return publicSession(session, nowMs);
  });
}

export function revokeLocalConnectorSession(sessionId: string): LocalConnectorPublicSession | null {
  const nowMs = Date.now();
  return withStoreTransaction(nowMs, (store, markChanged) => {
    const session = store.sessions[sessionId];
    if (!session) return null;
    session.status = "revoked";
    session.lastSeenAt = undefined;
    session.leaseExpiresAt = undefined;
    delete session.pairingTokenHash;
    delete session.sessionTokenHash;
    markChanged();
    return publicSession(session, nowMs);
  });
}

export function latestOnlineLocalConnector(
  provider: LocalConnectorProviderId,
  nowMs = Date.now(),
): LocalConnectorPublicSession | null {
  return listLocalConnectorSessions(provider, nowMs).find((session) => localConnectorSessionOnline(session, nowMs)) || null;
}

export function enqueueLocalConnectorJob(
  provider: LocalConnectorProviderId,
  message: InboundMessage,
  nowMs = Date.now(),
): LocalConnectorJob | null {
  return withStoreTransaction(nowMs, (store, markChanged) => {
    const onlineSession = preferredOnlineSession(store, provider, nowMs);
    if (!onlineSession) return null;

    const timestamp = nowIso(nowMs);
    const terminalGrantExpiresAt = terminalCallbackGrantExpiry(message, nowMs);
    const job: LocalConnectorJob = {
      id: randomId("lcjob"),
      provider,
      status: "pending",
      createdAt: timestamp,
      updatedAt: timestamp,
      connectorSessionId: onlineSession.id,
      assignmentGeneration: 1,
      ...(terminalGrantExpiresAt
        ? {
            terminalCallbackGrantExpiresAt: terminalGrantExpiresAt,
          }
        : {}),
      message,
    };
    store.jobs[job.id] = job;
    markChanged();
    return job;
  });
}

export function claimLocalConnectorJob(
  token: string,
  nowMs = Date.now(),
): LocalConnectorJob | null {
  return withStoreTransaction(nowMs, (store, markChanged) => {
    const session = findSessionByCredential(store, token);
    if (!session || session.status !== "connected" || leaseExpired(session, nowMs)) {
      return null;
    }

    // `claimed` is an execution ownership fence, not a polling lease. The
    // bridge may have accepted the turn even when its completion ACK was lost;
    // only the terminal-grant watchdog may recover it. Re-queueing here would
    // execute the same model/tools twice.
    const job = Object.values(store.jobs)
      .filter(
        (item) =>
          item.provider === session.provider &&
          item.connectorSessionId === session.id &&
          item.status === "pending" &&
          Boolean(item.message),
      )
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
    session.lastSeenAt = nowIso(nowMs);
    markChanged();
    if (!job) return null;
    job.status = "claimed";
    job.claimedAt = nowIso(nowMs);
    job.updatedAt = job.claimedAt;
    return job;
  });
}

export function finishLocalConnectorJob(
  token: string,
  jobId: string,
  status: Extract<LocalConnectorJobStatus, "dispatched" | "failed">,
  error?: string,
  nowMs = Date.now(),
): LocalConnectorJob | null {
  return withStoreTransaction(nowMs, (store, markChanged) => {
    const session = findSessionByCredential(store, token);
    const job = store.jobs[jobId];
    if (
      !session ||
      session.status !== "connected" ||
      leaseExpired(session, nowMs) ||
      !job ||
      job.provider !== session.provider ||
      job.connectorSessionId !== session.id
    ) {
      return null;
    }

    // A connector may retry the completion after losing the HTTP response. Make
    // same-status replay idempotent while rejecting a conflicting terminal write.
    if (job.status === "dispatched" || job.status === "failed") {
      return job.status === status ? job : null;
    }
    if (job.status !== "claimed") return null;

    const timestamp = nowIso(nowMs);
    session.lastSeenAt = timestamp;
    job.status = status;
    job.updatedAt = timestamp;
    job.completedAt = timestamp;
    if (error) {
      const capability = job.message?.runtimeToolCapability;
      const safeError = capability ? error.split(capability).join("[redacted]") : error;
      job.error = safeError.slice(0, 2000);
    }
    redactTerminalJob(job);
    markChanged();
    return job;
  });
}

export function claimLocalConnectorAgentRunRecovery(
  nowMs = Date.now(),
): ClaimedLocalConnectorAgentRunRecovery | null {
  return withStoreTransaction(nowMs, (store, markChanged) => {
    const job = Object.values(store.jobs)
      .filter((candidate) => {
        const recovery = candidate.agentRunRecovery;
        return Boolean(
          recovery?.status === "pending" &&
          Date.parse(recovery.dueAt) <= nowMs &&
          candidate.messageSummary?.missionControlRunId,
        );
      })
      .sort((a, b) =>
        (a.agentRunRecovery?.dueAt || "").localeCompare(b.agentRunRecovery?.dueAt || ""),
      )[0];
    const recovery = job?.agentRunRecovery;
    const missionControlRunId = job?.messageSummary?.missionControlRunId;
    if (!job || !recovery || !missionControlRunId || !job.messageSummary) return null;

    const claimId = randomId("lcrecovery");
    recovery.status = "claimed";
    recovery.claimId = claimId;
    recovery.claimedAt = nowIso(nowMs);
    recovery.attempts += 1;
    markChanged();
    return {
      jobId: job.id,
      claimId,
      provider: job.provider,
      connectorSessionId: job.connectorSessionId,
      missionControlRunId,
      threadId: job.messageSummary.threadId,
      reason: recovery.reason,
      error: job.error || recoveryError(recovery.reason),
    };
  });
}

export function finishLocalConnectorAgentRunRecovery(
  jobId: string,
  claimId: string,
  delivered: boolean,
  nowMs = Date.now(),
): boolean {
  return withStoreTransaction(nowMs, (store, markChanged) => {
    const recovery = store.jobs[jobId]?.agentRunRecovery;
    if (
      !recovery ||
      recovery.status !== "claimed" ||
      recovery.claimId !== claimId
    ) {
      return false;
    }
    if (delivered) {
      recovery.status = "delivered";
      recovery.deliveredAt = nowIso(nowMs);
    } else {
      recovery.status = "pending";
      recovery.dueAt = nowIso(nowMs + RECOVERY_RETRY_MS);
    }
    recovery.claimId = undefined;
    recovery.claimedAt = undefined;
    markChanged();
    return true;
  });
}

/** Earliest wall-clock time when the API should revisit job recovery. The
 * caller uses this to run a best-effort in-process watchdog; durable state in
 * the JSON store still makes the next request resume after a process restart. */
export function nextLocalConnectorRecoveryAt(nowMs = Date.now()): number | null {
  return withStoreTransaction(nowMs, (store) => {
    let nextAt = Number.POSITIVE_INFINITY;
    for (const job of Object.values(store.jobs)) {
      const recovery = job.agentRunRecovery;
      if (recovery?.status === "pending") {
        nextAt = Math.min(nextAt, Date.parse(recovery.dueAt));
        continue;
      }
      if (recovery?.status === "claimed" && recovery.claimedAt) {
        nextAt = Math.min(
          nextAt,
          Date.parse(recovery.claimedAt) + RECOVERY_CLAIM_STALE_MS,
        );
        continue;
      }
      if (recovery?.status === "delivered") continue;

      if (job.status === "pending") {
        const authorityDeadline = Date.parse(job.createdAt) + callbackAuthorityExpiryMs();
        const owner = job.connectorSessionId
          ? store.sessions[job.connectorSessionId]
          : undefined;
        const ownerOfflineAt = owner?.lastSeenAt
          ? Date.parse(owner.lastSeenAt) + ONLINE_FRESHNESS_MS + 1
          : nowMs;
        const unassignedDeadline = Date.parse(job.updatedAt) + pendingOrphanMs();
        const ownerOnline = Boolean(owner && localConnectorSessionOnline(owner, nowMs));
        nextAt = Math.min(
          nextAt,
          authorityDeadline,
          ownerOnline ? ownerOfflineAt : unassignedDeadline,
        );
      } else if (job.status === "claimed") {
        nextAt = Math.min(
          nextAt,
          terminalCallbackRecoveryAt(job),
        );
      }
    }
    return Number.isFinite(nextAt) ? Math.max(nowMs, nextAt) : null;
  });
}

export function localConnectorRuntimeVars(
  provider: LocalConnectorProviderId,
  sanchoBaseUrl: string,
  runtimeSecret: string,
): Record<string, string> {
  const baseUrl = normalizeBaseUrl(sanchoBaseUrl);
  return {
    SANCHO_EXTERNAL_RUNTIME_KIND: provider,
    SANCHO_EXTERNAL_PROTOCOL: "sancho",
    SANCHO_EXTERNAL_GATEWAY_URL: baseUrl,
    SANCHO_EXTERNAL_SECRET: runtimeSecret,
    SANCHO_EXTERNAL_INBOUND_PATH: "/api/runtime/local-connector/inbound",
    SANCHO_EXTERNAL_HEALTH_PATH: "/api/runtime/local-connector/health",
  };
}

function shellSingleQuote(value: string): string {
  return `'${String(value).replaceAll("'", `'"'"'`)}'`;
}

export function localConnectorInstallCommand(sanchoBaseUrl: string, pairingToken: string): string {
  const url = new URL(`${normalizeBaseUrl(sanchoBaseUrl)}/api/runtime/local-connector/install`);
  return [
    'SANCHO_CONNECTOR_INSTALLER="$(mktemp "${TMPDIR:-/tmp}/sancho-connector.XXXXXX")"',
    'trap \'rm -f "$SANCHO_CONNECTOR_INSTALLER"\' EXIT',
    `curl -fsSL -H ${shellSingleQuote(`Authorization: Bearer ${pairingToken}`)} ${shellSingleQuote(url.toString())} -o "$SANCHO_CONNECTOR_INSTALLER"`,
    'bash "$SANCHO_CONNECTOR_INSTALLER"',
  ].join(" && ");
}

export function localConnectorInstallerScript(
  sanchoBaseUrl: string,
  pairingToken: string,
  provider: LocalConnectorProviderId,
): string {
  const safeBase = shellSingleQuote(normalizeBaseUrl(sanchoBaseUrl));
  const safeToken = shellSingleQuote(pairingToken);
  const safeProvider = shellSingleQuote(provider);
  return `#!/usr/bin/env bash
set -euo pipefail

SANCHO_BASE_URL=${safeBase}
SANCHO_CONNECTOR_TOKEN=${safeToken}
SANCHO_CONNECTOR_PROVIDER=${safeProvider}
SANCHO_CONNECTOR_DIR="\${SANCHO_CONNECTOR_DIR:-$HOME/.sancho/runtime-connector}"
SANCHO_CONNECTOR_SCRIPT_DIR="$SANCHO_CONNECTOR_DIR/scripts"
SANCHO_CONNECTOR_RUNTIMES_DIR="$SANCHO_CONNECTOR_DIR/docker/runtimes"
SANCHO_CONNECTOR_BRIDGE_DIR="$SANCHO_CONNECTOR_RUNTIMES_DIR/$SANCHO_CONNECTOR_PROVIDER"
SANCHO_CONNECTOR_CONTRACT_DIR="$SANCHO_CONNECTOR_DIR/src/lib/runtime/agent-contract"
SANCHO_CONNECTOR_SESSION_FILE="$SANCHO_CONNECTOR_DIR/session-credential.json"

if ! command -v node >/dev/null 2>&1; then
  echo "Sancho Connector necesita Node.js 18 o superior. Instala Node y vuelve a ejecutar este comando." >&2
  exit 1
fi

mkdir -p "$SANCHO_CONNECTOR_SCRIPT_DIR" "$SANCHO_CONNECTOR_BRIDGE_DIR" "$SANCHO_CONNECTOR_CONTRACT_DIR"
chmod 700 "$SANCHO_CONNECTOR_DIR"
connector_curl() { curl -fsSL -H "Authorization: Bearer $SANCHO_CONNECTOR_TOKEN" "$1" -o "$2"; }
connector_curl "$SANCHO_BASE_URL/api/runtime/local-connector/script" "$SANCHO_CONNECTOR_SCRIPT_DIR/sancho-local-connector.mjs"
connector_curl "$SANCHO_BASE_URL/api/runtime/local-connector/bridge" "$SANCHO_CONNECTOR_BRIDGE_DIR/bridge.mjs"
connector_curl "$SANCHO_BASE_URL/api/runtime/local-connector/bridge/callback-authority" "$SANCHO_CONNECTOR_RUNTIMES_DIR/callback-authority.mjs"
connector_curl "$SANCHO_BASE_URL/api/runtime/local-connector/bridge/callback-outbox" "$SANCHO_CONNECTOR_RUNTIMES_DIR/callback-outbox.mjs"
connector_curl "$SANCHO_BASE_URL/api/runtime/local-connector/contract" "$SANCHO_CONNECTOR_CONTRACT_DIR/mc-chat-context.mjs"
connector_curl "$SANCHO_BASE_URL/api/runtime/local-connector/contract/error-rewriter" "$SANCHO_CONNECTOR_CONTRACT_DIR/error-rewriter.mjs"
connector_curl "$SANCHO_BASE_URL/api/runtime/local-connector/contract/runtime-cli-failure" "$SANCHO_CONNECTOR_CONTRACT_DIR/runtime-cli-failure.mjs"
chmod +x "$SANCHO_CONNECTOR_SCRIPT_DIR/sancho-local-connector.mjs" "$SANCHO_CONNECTOR_BRIDGE_DIR/bridge.mjs"

SANCHO_BASE_URL="$SANCHO_BASE_URL" \\
SANCHO_CONNECTOR_TOKEN="$SANCHO_CONNECTOR_TOKEN" \\
SANCHO_CONNECTOR_PROVIDER="$SANCHO_CONNECTOR_PROVIDER" \\
SANCHO_CONNECTOR_SESSION_FILE="$SANCHO_CONNECTOR_SESSION_FILE" \\
SANCHO_CONNECTOR_BRIDGE_PATH="$SANCHO_CONNECTOR_BRIDGE_DIR/bridge.mjs" \\
node "$SANCHO_CONNECTOR_SCRIPT_DIR/sancho-local-connector.mjs"
`;
}

export function localConnectorHealth(provider?: LocalConnectorProviderId): {
  ok: boolean;
  provider?: LocalConnectorProviderId;
  session?: LocalConnectorPublicSession;
  details?: Record<string, unknown>;
} {
  const providers: LocalConnectorProviderId[] = provider ? [provider] : ["claude-code", "codex"];
  for (const item of providers) {
    const session = latestOnlineLocalConnector(item);
    if (session) {
      return {
        ok: true,
        provider: item,
        session,
        details: {
          deviceName: session.deviceName,
          runtime: session.runtime,
          lastSeenAt: session.lastSeenAt,
        },
      };
    }
  }
  return {
    ok: false,
    provider,
    details: {
      error: provider ? `${cliBridgeProvider(provider).label} no tiene conector local activo` : "No hay conectores locales activos",
    },
  };
}

export function bridgePortForLocalConnector(provider: LocalConnectorProviderId): number {
  return gatewayPortOrDefault(provider, `http://127.0.0.1:${cliBridgeProvider(provider).defaultPort}`);
}
