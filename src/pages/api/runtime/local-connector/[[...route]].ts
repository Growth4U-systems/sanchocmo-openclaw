import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { withErrorHandler } from "@/lib/api-middleware";
import {
  buildCliBridgeEnv,
  cliBridgeProvider,
  gatewayListenHost,
  isCliBridgeProviderId,
  normalizeBaseUrl,
} from "@/lib/cli-runtime-bridge";
import {
  authenticateLocalConnectorToken,
  bridgePortForLocalConnector,
  claimLocalConnectorJob,
  enqueueLocalConnectorJob,
  finishLocalConnectorJob,
  heartbeatLocalConnector,
  isLocalConnectorProviderId,
  localConnectorHealth,
  registerLocalConnector,
  type LocalConnectorProviderId,
} from "@/lib/runtime/local-connector";
import type { InboundMessage } from "@/lib/runtime";

function routeName(req: NextApiRequest): string {
  const route = req.query.route;
  if (Array.isArray(route)) return route.join("/");
  return typeof route === "string" ? route : "";
}

function bearerToken(req: NextApiRequest): string {
  const auth = req.headers.authorization;
  if (typeof auth === "string") {
    const match = auth.match(/^Bearer\s+(.+)$/i);
    if (match) return match[1];
  }
  return typeof req.query.token === "string" ? req.query.token : "";
}

function runtimeSecretFromEnv(): string {
  return process.env.SANCHO_EXTERNAL_SECRET || process.env.SANCHO_EXTERNAL_RUNTIME_SECRET || "";
}

function configuredProvider(): LocalConnectorProviderId | null {
  const value = process.env.SANCHO_EXTERNAL_RUNTIME_KIND;
  return isLocalConnectorProviderId(value) ? value : null;
}

function verifyRuntimeSecret(req: NextApiRequest): boolean {
  const expected = runtimeSecretFromEnv();
  if (!expected) return false;
  return req.headers["x-mc-secret"] === expected || req.headers.authorization === `Bearer ${expected}`;
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

function text(res: NextApiResponse, status: number, body: string, contentType = "text/plain; charset=utf-8") {
  res.status(status);
  res.setHeader("Content-Type", contentType);
  res.send(body);
}

function installScript(baseUrl: string, token: string): string {
  const safeBase = JSON.stringify(normalizeBaseUrl(baseUrl));
  const safeToken = JSON.stringify(token);
  return `#!/usr/bin/env bash
set -euo pipefail

SANCHO_BASE_URL=${safeBase}
SANCHO_CONNECTOR_TOKEN=${safeToken}
SANCHO_CONNECTOR_DIR="\${SANCHO_CONNECTOR_DIR:-$HOME/.sancho/runtime-connector}"

if ! command -v node >/dev/null 2>&1; then
  echo "Sancho Connector necesita Node.js 18 o superior. Instala Node y vuelve a ejecutar este comando." >&2
  exit 1
fi

mkdir -p "$SANCHO_CONNECTOR_DIR"
curl -fsSL "$SANCHO_BASE_URL/api/runtime/local-connector/script?token=$SANCHO_CONNECTOR_TOKEN" -o "$SANCHO_CONNECTOR_DIR/connector.mjs"
curl -fsSL "$SANCHO_BASE_URL/api/runtime/local-connector/bridge?token=$SANCHO_CONNECTOR_TOKEN" -o "$SANCHO_CONNECTOR_DIR/bridge.mjs"
chmod +x "$SANCHO_CONNECTOR_DIR/connector.mjs" "$SANCHO_CONNECTOR_DIR/bridge.mjs"

SANCHO_BASE_URL="$SANCHO_BASE_URL" \\
SANCHO_CONNECTOR_TOKEN="$SANCHO_CONNECTOR_TOKEN" \\
SANCHO_CONNECTOR_BRIDGE_PATH="$SANCHO_CONNECTOR_DIR/bridge.mjs" \\
node "$SANCHO_CONNECTOR_DIR/connector.mjs"
`;
}

function localScriptPath(): string {
  return path.join(process.cwd(), "scripts", "sancho-local-connector.mjs");
}

function bridgeScriptPath(provider: LocalConnectorProviderId): string {
  return path.join(process.cwd(), cliBridgeProvider(provider).scriptPath);
}

async function readBody(req: NextApiRequest): Promise<unknown> {
  if (req.body && typeof req.body === "object") return req.body;
  return req.body || {};
}

async function handleRegister(req: NextApiRequest, res: NextApiResponse, token: string) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const body = (await readBody(req)) as {
    deviceName?: unknown;
    runtime?: unknown;
  };
  const registered = registerLocalConnector(token, {
    deviceName: typeof body.deviceName === "string" ? body.deviceName : undefined,
    runtime: body.runtime && typeof body.runtime === "object" ? (body.runtime as never) : undefined,
  });
  if (!registered) return res.status(401).json({ error: "Pairing inválido o caducado" });

  const provider = registered.session.provider;
  const port = bridgePortForLocalConnector(provider);
  const bridgeEnv = buildCliBridgeEnv(provider, {
    sanchoBaseUrl: inferBaseUrl(req),
    secret: registered.runtimeSecret,
    host: gatewayListenHost(`http://127.0.0.1:${port}`),
    port,
  });
  return res.status(200).json({
    ok: true,
    session: registered.session,
    runtimeSecret: registered.runtimeSecret,
    bridge: {
      provider,
      port,
      healthUrl: `http://127.0.0.1:${port}/healthz`,
      inboundUrl: `http://127.0.0.1:${port}/sancho/inbound`,
      env: bridgeEnv,
    },
  });
}

async function handleHeartbeat(req: NextApiRequest, res: NextApiResponse, token: string) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const body = (await readBody(req)) as { runtime?: unknown };
  const session = heartbeatLocalConnector(token, {
    runtime: body.runtime && typeof body.runtime === "object" ? (body.runtime as never) : undefined,
  });
  if (!session) return res.status(401).json({ error: "Conector no registrado" });
  return res.status(200).json({ ok: true, session });
}

async function handleJobs(req: NextApiRequest, res: NextApiResponse, token: string) {
  if (req.method === "GET") {
    const job = claimLocalConnectorJob(token);
    if (!job) return res.status(204).end();
    return res.status(200).json({
      ok: true,
      job: {
        id: job.id,
        provider: job.provider,
        message: job.message,
      },
    });
  }

  if (req.method === "POST") {
    const body = (await readBody(req)) as { jobId?: unknown; status?: unknown; error?: unknown };
    const jobId = typeof body.jobId === "string" ? body.jobId : "";
    const status = body.status === "failed" ? "failed" : body.status === "dispatched" ? "dispatched" : null;
    if (!jobId || !status) return res.status(400).json({ error: "jobId/status inválidos" });
    const job = finishLocalConnectorJob(
      token,
      jobId,
      status,
      typeof body.error === "string" ? body.error : undefined,
    );
    if (!job) return res.status(404).json({ error: "Job no encontrado" });
    return res.status(200).json({ ok: true, job: { id: job.id, status: job.status } });
  }

  return res.status(405).json({ error: "Method not allowed" });
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const route = routeName(req);

  if (route === "install") {
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
    const token = bearerToken(req);
    const session = authenticateLocalConnectorToken(token);
    if (!session) return res.status(401).json({ error: "Pairing inválido o caducado" });
    return text(res, 200, installScript(inferBaseUrl(req), token), "text/x-shellscript; charset=utf-8");
  }

  if (route === "script") {
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
    const session = authenticateLocalConnectorToken(bearerToken(req));
    if (!session) return res.status(401).json({ error: "Pairing inválido o caducado" });
    return text(res, 200, fs.readFileSync(localScriptPath(), "utf-8"), "text/javascript; charset=utf-8");
  }

  if (route === "bridge") {
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
    const session = authenticateLocalConnectorToken(bearerToken(req));
    if (!session || !isCliBridgeProviderId(session.provider)) {
      return res.status(401).json({ error: "Pairing inválido o caducado" });
    }
    return text(res, 200, fs.readFileSync(bridgeScriptPath(session.provider), "utf-8"), "text/javascript; charset=utf-8");
  }

  if (route === "health") {
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
    if (!verifyRuntimeSecret(req)) return res.status(403).json({ error: "Forbidden" });
    const provider = configuredProvider();
    const health = localConnectorHealth(provider || undefined);
    return res.status(health.ok ? 200 : 503).json(health);
  }

  if (route === "inbound") {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    if (!verifyRuntimeSecret(req)) return res.status(403).json({ error: "Forbidden" });
    const provider = configuredProvider();
    if (!provider) return res.status(400).json({ error: "No hay runtime local configurado" });
    const message = (await readBody(req)) as InboundMessage;
    const job = enqueueLocalConnectorJob(provider, message);
    if (!job) {
      return res.status(503).json({
        error: `${cliBridgeProvider(provider).label} no tiene conector local activo en este momento.`,
      });
    }
    return res.status(202).json({ ok: true, runId: job.id, chatId: job.id });
  }

  const token = bearerToken(req);
  const session = authenticateLocalConnectorToken(token);
  if (!session) return res.status(401).json({ error: "Pairing inválido o caducado" });

  if (route === "register") return handleRegister(req, res, token);
  if (route === "heartbeat") return handleHeartbeat(req, res, token);
  if (route === "jobs") return handleJobs(req, res, token);

  return res.status(404).json({ error: "Not found" });
}

export default withErrorHandler(async (req, res) => {
  await handler(req, res);
});
