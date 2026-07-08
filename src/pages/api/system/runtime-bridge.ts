import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { compose, withAuth, withErrorHandler } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";
import { parseEnvContent, upsertEnvContent } from "@/lib/env-file";
import {
  CLI_BRIDGE_PROVIDERS,
  buildCliBridgeCommand,
  cliBridgeProvider,
  defaultGatewayUrl,
  externalRuntimeVarsForCliBridge,
  gatewayListenHost,
  gatewayPortOrDefault,
  isCliBridgeProviderId,
  normalizeBaseUrl,
  type CliBridgeProviderId,
} from "@/lib/cli-runtime-bridge";
import {
  createRuntimeAdapter,
  readRuntimeSelection,
  resetRuntimeCache,
  writeRuntimeSelection,
} from "@/lib/runtime";

const ENV_FILE = path.join(BASE, "..", ".env");
const HEALTH_TIMEOUT_MS = 5000;

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

function runtimeKindFromEnv(): CliBridgeProviderId | null {
  const kind = parseEnvContent(readEnvFile()).SANCHO_EXTERNAL_RUNTIME_KIND || process.env.SANCHO_EXTERNAL_RUNTIME_KIND;
  return isCliBridgeProviderId(kind) ? kind : null;
}

async function externalRuntimeHealth() {
  const adapter = createRuntimeAdapter("external-http");
  return Promise.race([
    adapter.lifecycle.healthcheck().catch((err: unknown) => ({
      ok: false,
      details: { error: err instanceof Error ? err.message : String(err) },
    })),
    new Promise<{ ok: boolean; details?: Record<string, unknown> }>((resolve) => {
      setTimeout(
        () => resolve({ ok: false, details: { error: `healthcheck timeout after ${HEALTH_TIMEOUT_MS}ms` } }),
        HEALTH_TIMEOUT_MS,
      );
    }),
  ]);
}

function providerFromBody(body: unknown): CliBridgeProviderId | null {
  if (!body || typeof body !== "object") return null;
  const provider = (body as { provider?: unknown }).provider;
  return isCliBridgeProviderId(provider) ? provider : null;
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
    const selection = readRuntimeSelection();
    return res.status(200).json({
      ok: true,
      active: selection.runtime,
      configuredKind: runtimeKindFromEnv(),
      providers: CLI_BRIDGE_PROVIDERS.map((provider) => ({
        id: provider.id,
        label: provider.label,
        defaultPort: provider.defaultPort,
        defaultGatewayUrl: defaultGatewayUrl(provider.id),
      })),
    });
  }

  const action = typeof req.body?.action === "string" ? req.body.action : "";

  if (action === "prepare") {
    const providerId = providerFromBody(req.body);
    if (!providerId) return res.status(400).json({ error: "Unknown CLI runtime" });

    const provider = cliBridgeProvider(providerId);
    const gatewayUrl =
      typeof req.body.gatewayUrl === "string" && req.body.gatewayUrl.trim()
        ? req.body.gatewayUrl.trim()
        : defaultGatewayUrl(providerId);
    const secret = crypto.randomBytes(24).toString("base64url");
    const vars = externalRuntimeVarsForCliBridge(providerId, gatewayUrl, secret);
    setEnvVars(vars);
    resetRuntimeCache();

    return res.status(200).json({
      ok: true,
      provider: providerId,
      label: provider.label,
      gatewayUrl: vars.SANCHO_EXTERNAL_GATEWAY_URL,
      command: buildCliBridgeCommand(providerId, {
        sanchoBaseUrl: inferBaseUrl(req),
        secret,
        host: gatewayListenHost(vars.SANCHO_EXTERNAL_GATEWAY_URL),
        port: gatewayPortOrDefault(providerId, vars.SANCHO_EXTERNAL_GATEWAY_URL),
      }),
      saved: Object.keys(vars),
      active: readRuntimeSelection().runtime,
    });
  }

  if (action === "verify") {
    const providerId = providerFromBody(req.body);
    if (!providerId) return res.status(400).json({ error: "Unknown CLI runtime" });

    const configuredKind = runtimeKindFromEnv();
    if (configuredKind !== providerId) {
      return res.status(400).json({
        ok: false,
        error: "Primero prepara este runtime para guardar su URL y secret.",
        active: readRuntimeSelection().runtime,
        configuredKind,
      });
    }

    const health = await externalRuntimeHealth();
    if (!health.ok) {
      return res.status(400).json({
        ok: false,
        error: "El bridge todavía no responde.",
        health,
        active: readRuntimeSelection().runtime,
      });
    }

    const activate = req.body?.activate !== false;
    if (activate) {
      writeRuntimeSelection("external-http", "admin");
      resetRuntimeCache();
    }

    return res.status(200).json({
      ok: true,
      activated: activate,
      health,
      active: readRuntimeSelection().runtime,
      configuredKind,
    });
  }

  return res.status(400).json({ error: "Unknown action" });
}

export default compose(withErrorHandler, withAuth)(handler);
