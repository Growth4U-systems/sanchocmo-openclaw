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
import type { InboundMessage } from "@/lib/runtime/types";

export type LocalConnectorProviderId = Extract<CliBridgeProviderId, "claude-code" | "codex">;
export type LocalConnectorSessionStatus = "pending" | "connected" | "expired" | "revoked";
export type LocalConnectorJobStatus = "pending" | "claimed" | "dispatched" | "failed";

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
  pairingTokenHash: string;
  runtimeSecret: string;
  status: LocalConnectorSessionStatus;
  createdAt: string;
  expiresAt: string;
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
  error?: string;
  message: InboundMessage;
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

const PAIRING_TTL_MS = 15 * 60 * 1000;
const ONLINE_FRESHNESS_MS = 45_000;
const CLAIM_STALE_MS = 2 * 60 * 1000;
const STORE_VERSION = 1;

export function isLocalConnectorProviderId(value: unknown): value is LocalConnectorProviderId {
  return value === "claude-code" || value === "codex";
}

export function localConnectorStoreFile(): string {
  return process.env.SANCHO_LOCAL_CONNECTOR_STORE_FILE || path.join(BASE, "_system", "runtime-local-connectors.json");
}

function emptyStore(): LocalConnectorStore {
  return { sessions: {}, jobs: {} };
}

function readStore(): LocalConnectorStore {
  const file = localConnectorStoreFile();
  if (!fs.existsSync(file)) return emptyStore();
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

function writeStore(store: LocalConnectorStore): void {
  const file = localConnectorStoreFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify({ version: STORE_VERSION, ...store }, null, 2)}\n`, "utf-8");
  fs.renameSync(tmp, file);
}

function nowIso(): string {
  return new Date().toISOString();
}

function tokenHash(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function randomId(prefix: string, bytes = 12): string {
  return `${prefix}_${crypto.randomBytes(bytes).toString("base64url")}`;
}

function randomCode(): string {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

function sessionExpired(session: LocalConnectorSession, nowMs = Date.now()): boolean {
  return new Date(session.expiresAt).getTime() <= nowMs;
}

export function localConnectorSessionOnline(
  session: Pick<LocalConnectorSession, "status" | "lastSeenAt" | "runtime">,
  nowMs = Date.now(),
): boolean {
  if (session.status !== "connected" || !session.lastSeenAt) return false;
  if (session.runtime?.ok === false) return false;
  return nowMs - new Date(session.lastSeenAt).getTime() <= ONLINE_FRESHNESS_MS;
}

function publicSession(session: LocalConnectorSession, nowMs = Date.now()): LocalConnectorPublicSession {
  const status = session.status === "pending" && sessionExpired(session, nowMs) ? "expired" : session.status;
  return {
    id: session.id,
    provider: session.provider,
    pairingCode: session.pairingCode,
    status,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    connectedAt: session.connectedAt,
    lastSeenAt: session.lastSeenAt,
    activatedAt: session.activatedAt,
    deviceName: session.deviceName,
    runtime: session.runtime,
    online: localConnectorSessionOnline({ ...session, status }, nowMs),
  };
}

function findSessionByToken(store: LocalConnectorStore, token: string): LocalConnectorSession | null {
  const hash = tokenHash(token);
  return Object.values(store.sessions).find((session) => session.pairingTokenHash === hash) || null;
}

function refreshExpiredSessions(store: LocalConnectorStore, nowMs = Date.now()): boolean {
  let changed = false;
  for (const session of Object.values(store.sessions)) {
    if (session.status === "pending" && sessionExpired(session, nowMs)) {
      session.status = "expired";
      changed = true;
    }
  }
  return changed;
}

export function listLocalConnectorSessions(provider?: LocalConnectorProviderId): LocalConnectorPublicSession[] {
  const store = readStore();
  const changed = refreshExpiredSessions(store);
  if (changed) writeStore(store);
  return Object.values(store.sessions)
    .filter((session) => !provider || session.provider === provider)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 20)
    .map((session) => publicSession(session));
}

export function getLocalConnectorSession(sessionId: string): LocalConnectorPublicSession | null {
  const store = readStore();
  const changed = refreshExpiredSessions(store);
  if (changed) writeStore(store);
  const session = store.sessions[sessionId];
  return session ? publicSession(session) : null;
}

export function getLocalConnectorSessionInternal(sessionId: string): LocalConnectorSession | null {
  const store = readStore();
  const changed = refreshExpiredSessions(store);
  if (changed) writeStore(store);
  return store.sessions[sessionId] || null;
}

export function createLocalConnectorSession(provider: LocalConnectorProviderId): CreatedLocalConnectorSession {
  const store = readStore();
  refreshExpiredSessions(store);
  const createdAt = nowIso();
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
    expiresAt: new Date(Date.now() + PAIRING_TTL_MS).toISOString(),
  };
  store.sessions[session.id] = session;
  writeStore(store);
  return {
    session: publicSession(session),
    pairingToken,
    runtimeSecret,
  };
}

export function authenticateLocalConnectorToken(token: string): LocalConnectorSession | null {
  if (!token) return null;
  const store = readStore();
  const changed = refreshExpiredSessions(store);
  const session = findSessionByToken(store, token);
  if (changed) writeStore(store);
  if (!session || session.status === "revoked" || session.status === "expired" || sessionExpired(session)) {
    return null;
  }
  return session;
}

export function registerLocalConnector(
  token: string,
  input: {
    deviceName?: string;
    runtime?: LocalConnectorRuntimeStatus;
  },
): { session: LocalConnectorPublicSession; runtimeSecret: string } | null {
  const store = readStore();
  refreshExpiredSessions(store);
  const session = findSessionByToken(store, token);
  if (!session || session.status === "revoked" || session.status === "expired" || sessionExpired(session)) {
    writeStore(store);
    return null;
  }

  const timestamp = nowIso();
  session.status = "connected";
  session.connectedAt = session.connectedAt || timestamp;
  session.lastSeenAt = timestamp;
  session.deviceName = input.deviceName?.slice(0, 120) || session.deviceName || "Este ordenador";
  session.runtime = input.runtime;
  writeStore(store);
  return {
    session: publicSession(session),
    runtimeSecret: session.runtimeSecret,
  };
}

export function heartbeatLocalConnector(
  token: string,
  input: {
    runtime?: LocalConnectorRuntimeStatus;
  } = {},
): LocalConnectorPublicSession | null {
  const store = readStore();
  refreshExpiredSessions(store);
  const session = findSessionByToken(store, token);
  if (!session || session.status !== "connected" || sessionExpired(session)) {
    writeStore(store);
    return null;
  }
  session.lastSeenAt = nowIso();
  if (input.runtime) session.runtime = input.runtime;
  writeStore(store);
  return publicSession(session);
}

export function activateLocalConnectorSession(sessionId: string): LocalConnectorPublicSession | null {
  const store = readStore();
  refreshExpiredSessions(store);
  const session = store.sessions[sessionId];
  if (!session || !localConnectorSessionOnline(session)) {
    writeStore(store);
    return null;
  }
  session.activatedAt = nowIso();
  writeStore(store);
  return publicSession(session);
}

export function revokeLocalConnectorSession(sessionId: string): LocalConnectorPublicSession | null {
  const store = readStore();
  const session = store.sessions[sessionId];
  if (!session) return null;
  session.status = "revoked";
  session.lastSeenAt = undefined;
  writeStore(store);
  return publicSession(session);
}

export function latestOnlineLocalConnector(
  provider: LocalConnectorProviderId,
  nowMs = Date.now(),
): LocalConnectorPublicSession | null {
  return listLocalConnectorSessions(provider).find((session) => localConnectorSessionOnline(session, nowMs)) || null;
}

export function enqueueLocalConnectorJob(
  provider: LocalConnectorProviderId,
  message: InboundMessage,
): LocalConnectorJob | null {
  const store = readStore();
  refreshExpiredSessions(store);
  const onlineSession = Object.values(store.sessions)
    .filter((session) => session.provider === provider && localConnectorSessionOnline(session))
    .sort((a, b) => (b.lastSeenAt || "").localeCompare(a.lastSeenAt || ""))[0];
  if (!onlineSession) {
    writeStore(store);
    return null;
  }

  const timestamp = nowIso();
  const job: LocalConnectorJob = {
    id: randomId("lcjob"),
    provider,
    status: "pending",
    createdAt: timestamp,
    updatedAt: timestamp,
    message,
  };
  store.jobs[job.id] = job;
  writeStore(store);
  return job;
}

export function claimLocalConnectorJob(token: string): LocalConnectorJob | null {
  const store = readStore();
  refreshExpiredSessions(store);
  const session = findSessionByToken(store, token);
  if (!session || session.status !== "connected" || sessionExpired(session)) {
    writeStore(store);
    return null;
  }

  const nowMs = Date.now();
  for (const job of Object.values(store.jobs)) {
    if (
      job.status === "claimed" &&
      job.claimedAt &&
      nowMs - new Date(job.claimedAt).getTime() > CLAIM_STALE_MS
    ) {
      job.status = "pending";
      job.connectorSessionId = undefined;
      job.claimedAt = undefined;
      job.updatedAt = nowIso();
    }
  }

  const job = Object.values(store.jobs)
    .filter((item) => item.provider === session.provider && item.status === "pending")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  session.lastSeenAt = nowIso();
  if (!job) {
    writeStore(store);
    return null;
  }
  job.status = "claimed";
  job.claimedAt = nowIso();
  job.updatedAt = job.claimedAt;
  job.connectorSessionId = session.id;
  writeStore(store);
  return job;
}

export function finishLocalConnectorJob(
  token: string,
  jobId: string,
  status: Extract<LocalConnectorJobStatus, "dispatched" | "failed">,
  error?: string,
): LocalConnectorJob | null {
  const store = readStore();
  const session = findSessionByToken(store, token);
  const job = store.jobs[jobId];
  if (!session || !job || job.connectorSessionId !== session.id) return null;

  const timestamp = nowIso();
  session.lastSeenAt = timestamp;
  job.status = status;
  job.updatedAt = timestamp;
  job.completedAt = timestamp;
  if (error) job.error = error.slice(0, 2000);
  writeStore(store);
  return job;
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

export function localConnectorInstallCommand(sanchoBaseUrl: string, pairingToken: string): string {
  const url = new URL(`${normalizeBaseUrl(sanchoBaseUrl)}/api/runtime/local-connector/install`);
  url.searchParams.set("token", pairingToken);
  return [
    'SANCHO_CONNECTOR_INSTALLER="$(mktemp "${TMPDIR:-/tmp}/sancho-connector.XXXXXX")"',
    `curl -fsSL '${url.toString()}' -o "$SANCHO_CONNECTOR_INSTALLER"`,
    'bash "$SANCHO_CONNECTOR_INSTALLER"',
  ].join(" && ");
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
