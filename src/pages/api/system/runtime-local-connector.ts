import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { compose, withAuth, withErrorHandler } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";
import { upsertEnvContent } from "@/lib/env-file";
import { cliBridgeProvider, isCliBridgeProviderId, normalizeBaseUrl } from "@/lib/cli-runtime-bridge";
import {
  activateLocalConnectorSession,
  createLocalConnectorSession,
  getLocalConnectorSession,
  getLocalConnectorSessionInternal,
  isLocalConnectorProviderId,
  listLocalConnectorSessions,
  localConnectorInstallCommand,
  localConnectorRuntimeVars,
  revokeLocalConnectorSession,
  type LocalConnectorProviderId,
} from "@/lib/runtime/local-connector";
import { resetRuntimeCache, writeRuntimeSelection } from "@/lib/runtime";

const ENV_FILE = path.join(BASE, "..", ".env");

function readEnvFile(): string {
  try {
    return fs.readFileSync(ENV_FILE, "utf-8");
  } catch {
    return "";
  }
}

function setEnvVars(updates: Record<string, string>): void {
  fs.writeFileSync(ENV_FILE, upsertEnvContent(readEnvFile(), updates), "utf-8");
  for (const [key, value] of Object.entries(updates)) {
    process.env[key] = value;
  }
}

function inferBaseUrl(req: NextApiRequest): string {
  const configured =
    process.env.SANCHO_PUBLIC_BASE_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.BASE_URL ||
    process.env.MC_SERVER_URL;
  if (configured) return normalizeBaseUrl(configured);

  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const proto = forwardedProto || (process.env.NODE_ENV === "production" ? "https" : "http");
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "127.0.0.1:3000")
    .split(",")[0]
    .trim();
  return `${proto}://${host}`;
}

function providerFromBody(body: unknown): LocalConnectorProviderId | null {
  if (!body || typeof body !== "object") return null;
  const provider = (body as { provider?: unknown }).provider;
  return isLocalConnectorProviderId(provider) ? provider : null;
}

function sessionIdFromBody(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const sessionId = (body as { sessionId?: unknown }).sessionId;
  return typeof sessionId === "string" && sessionId.trim() ? sessionId.trim() : null;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!req.ctx?.isAdmin) {
    return res.status(403).json({ error: "Admin only" });
  }

  if (req.method === "GET") {
    const provider = isLocalConnectorProviderId(req.query.provider) ? req.query.provider : undefined;
    const sessionId = typeof req.query.session === "string" ? req.query.session : "";
    return res.status(200).json({
      ok: true,
      session: sessionId ? getLocalConnectorSession(sessionId) : null,
      sessions: listLocalConnectorSessions(provider),
    });
  }

  const action = typeof req.body?.action === "string" ? req.body.action : "";

  if (action === "create") {
    const provider = providerFromBody(req.body);
    if (!provider) return res.status(400).json({ error: "Runtime local desconocido" });
    if (!isCliBridgeProviderId(provider) || cliBridgeProvider(provider).runtimeLocation !== "user-device") {
      return res.status(400).json({ error: "Este runtime no usa pairing local" });
    }

    const created = createLocalConnectorSession(provider);
    const baseUrl = inferBaseUrl(req);
    return res.status(200).json({
      ok: true,
      session: created.session,
      command: localConnectorInstallCommand(baseUrl, created.pairingToken),
      expiresAt: created.session.expiresAt,
      provider,
      label: cliBridgeProvider(provider).label,
    });
  }

  if (action === "activate") {
    const sessionId = sessionIdFromBody(req.body);
    if (!sessionId) return res.status(400).json({ error: "Falta sessionId" });

    const internal = getLocalConnectorSessionInternal(sessionId);
    const activated = activateLocalConnectorSession(sessionId);
    if (!internal || !activated) {
      return res.status(400).json({
        error: "El conector todavía no está activo en este ordenador.",
        session: sessionId ? getLocalConnectorSession(sessionId) : null,
      });
    }

    const baseUrl = inferBaseUrl(req);
    const vars = localConnectorRuntimeVars(internal.provider, baseUrl, internal.runtimeSecret);
    setEnvVars(vars);
    writeRuntimeSelection("external-http", "admin");
    resetRuntimeCache();
    return res.status(200).json({
      ok: true,
      activated: true,
      active: "external-http",
      configuredKind: internal.provider,
      saved: Object.keys(vars),
      session: activated,
    });
  }

  if (action === "revoke") {
    const sessionId = sessionIdFromBody(req.body);
    if (!sessionId) return res.status(400).json({ error: "Falta sessionId" });
    return res.status(200).json({
      ok: true,
      session: revokeLocalConnectorSession(sessionId),
    });
  }

  return res.status(400).json({ error: "Unknown action" });
}

export default compose(withErrorHandler, withAuth)(handler);
