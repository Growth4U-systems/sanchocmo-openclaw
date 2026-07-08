import type { NextApiRequest, NextApiResponse } from "next";
import { spawn, type ChildProcess } from "child_process";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { compose, withAuth, withErrorHandler } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";
import { parseEnvContent, upsertEnvContent } from "@/lib/env-file";
import {
  CLI_BRIDGE_PROVIDERS,
  buildCliBridgeCommand,
  buildCliBridgeEnv,
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
const STARTUP_TIMEOUT_MS = 8000;
const STARTUP_POLL_MS = 300;

interface ManagedBridgeProcess {
  providerId: CliBridgeProviderId;
  gatewayUrl: string;
  secret: string;
  pid?: number;
  child: ChildProcess;
  startedAt: string;
}

type RuntimeBridgeGlobal = typeof globalThis & {
  __sanchoRuntimeBridges?: Map<CliBridgeProviderId, ManagedBridgeProcess>;
};

function managedBridges(): Map<CliBridgeProviderId, ManagedBridgeProcess> {
  const runtimeGlobal = globalThis as RuntimeBridgeGlobal;
  if (!runtimeGlobal.__sanchoRuntimeBridges) {
    runtimeGlobal.__sanchoRuntimeBridges = new Map();
  }
  return runtimeGlobal.__sanchoRuntimeBridges;
}

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

function existingExternalSecret(parsedEnv: Record<string, string>, providerId: CliBridgeProviderId): string | null {
  const kind = parsedEnv.SANCHO_EXTERNAL_RUNTIME_KIND || process.env.SANCHO_EXTERNAL_RUNTIME_KIND;
  const secret = parsedEnv.SANCHO_EXTERNAL_SECRET || process.env.SANCHO_EXTERNAL_SECRET;
  return kind === providerId && secret ? secret : null;
}

function bridgeHealthUrl(gatewayUrl: string): string {
  const url = new URL(normalizeBaseUrl(gatewayUrl));
  url.pathname = "/healthz";
  url.search = "";
  url.hash = "";
  return url.toString();
}

async function pingBridge(gatewayUrl: string) {
  try {
    const res = await fetch(bridgeHealthUrl(gatewayUrl), {
      signal: AbortSignal.timeout(1000),
    });
    const raw = await res.text().catch(() => "");
    return {
      ok: res.ok,
      details: {
        status: res.status,
        gatewayUrl,
        body: raw.slice(0, 500),
      },
    };
  } catch (err) {
    return {
      ok: false,
      details: {
        gatewayUrl,
        error: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

async function waitForBridge(gatewayUrl: string) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  let last = await pingBridge(gatewayUrl);
  while (!last.ok && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, STARTUP_POLL_MS));
    last = await pingBridge(gatewayUrl);
  }
  return last;
}

function startManagedBridge(
  providerId: CliBridgeProviderId,
  options: {
    sanchoBaseUrl: string;
    secret: string;
    gatewayUrl: string;
  },
): { started: boolean; pid?: number; reused: boolean } {
  const registry = managedBridges();
  const existing = registry.get(providerId);
  if (existing && existing.gatewayUrl === options.gatewayUrl && existing.secret === options.secret && !existing.child.killed) {
    return { started: false, pid: existing.pid, reused: true };
  }
  if (existing && !existing.child.killed) {
    existing.child.kill("SIGTERM");
    registry.delete(providerId);
  }

  const provider = cliBridgeProvider(providerId);
  if (!provider.serverStartSupported) {
    throw new Error(`${provider.label} no se puede arrancar desde el host de Sancho.`);
  }
  const host = gatewayListenHost(options.gatewayUrl);
  const port = gatewayPortOrDefault(providerId, options.gatewayUrl);
  const scriptPath = path.join(process.cwd(), provider.scriptPath);
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`No encontré el bridge local: ${provider.scriptPath}`);
  }

  const child = spawn(process.execPath, [scriptPath], {
    cwd: process.cwd(),
    detached: true,
    env: {
      ...process.env,
      ...buildCliBridgeEnv(providerId, {
        sanchoBaseUrl: options.sanchoBaseUrl,
        secret: options.secret,
        host,
        port,
      }),
    },
    stdio: "ignore",
  });
  child.unref();

  const managed: ManagedBridgeProcess = {
    providerId,
    gatewayUrl: options.gatewayUrl,
    secret: options.secret,
    pid: child.pid,
    child,
    startedAt: new Date().toISOString(),
  };
  registry.set(providerId, managed);
  child.once("exit", () => {
    if (registry.get(providerId)?.pid === child.pid) {
      registry.delete(providerId);
    }
  });

  return { started: true, pid: child.pid, reused: false };
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
        runtimeLocation: provider.runtimeLocation,
        serverStartSupported: provider.serverStartSupported,
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
    if (!provider.serverStartSupported) {
      return res.status(400).json({
        ok: false,
        error: `${provider.label} corre en el ordenador del usuario. Sancho necesita un conector local; no puede prepararlo como bridge gestionado en el VPS.`,
        provider: providerId,
        label: provider.label,
        runtimeLocation: provider.runtimeLocation,
        active: readRuntimeSelection().runtime,
      });
    }

    const parsedEnv = parseEnvContent(readEnvFile());
    const gatewayUrl =
      typeof req.body.gatewayUrl === "string" && req.body.gatewayUrl.trim()
        ? req.body.gatewayUrl.trim()
        : defaultGatewayUrl(providerId);
    const secret = existingExternalSecret(parsedEnv, providerId) || crypto.randomBytes(24).toString("base64url");
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

  if (action === "start") {
    const providerId = providerFromBody(req.body);
    if (!providerId) return res.status(400).json({ error: "Unknown CLI runtime" });

    const provider = cliBridgeProvider(providerId);
    if (!provider.serverStartSupported) {
      return res.status(400).json({
        ok: false,
        error: `${provider.label} corre en el ordenador del usuario. Sancho necesita un conector local; no puede arrancarlo dentro del VPS.`,
        provider: providerId,
        label: provider.label,
        runtimeLocation: provider.runtimeLocation,
        active: readRuntimeSelection().runtime,
      });
    }

    const parsedEnv = parseEnvContent(readEnvFile());
    const gatewayUrl =
      typeof req.body.gatewayUrl === "string" && req.body.gatewayUrl.trim()
        ? req.body.gatewayUrl.trim()
        : defaultGatewayUrl(providerId);
    const secret = existingExternalSecret(parsedEnv, providerId) || crypto.randomBytes(24).toString("base64url");
    const vars = externalRuntimeVarsForCliBridge(providerId, gatewayUrl, secret);
    setEnvVars(vars);
    resetRuntimeCache();

    const processResult = startManagedBridge(providerId, {
      sanchoBaseUrl: inferBaseUrl(req),
      secret,
      gatewayUrl: vars.SANCHO_EXTERNAL_GATEWAY_URL,
    });
    const health = await waitForBridge(vars.SANCHO_EXTERNAL_GATEWAY_URL);
    if (!health.ok) {
      return res.status(500).json({
        ok: false,
        error: `${provider.label} no arrancó desde Sancho. Revisa que el CLI esté instalado y autenticado en el servidor, o usa el modo manual avanzado.`,
        health,
        provider: providerId,
        label: provider.label,
        gatewayUrl: vars.SANCHO_EXTERNAL_GATEWAY_URL,
        command: buildCliBridgeCommand(providerId, {
          sanchoBaseUrl: inferBaseUrl(req),
          secret,
          host: gatewayListenHost(vars.SANCHO_EXTERNAL_GATEWAY_URL),
          port: gatewayPortOrDefault(providerId, vars.SANCHO_EXTERNAL_GATEWAY_URL),
        }),
        started: processResult.started,
        reused: processResult.reused,
        pid: processResult.pid,
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
      provider: providerId,
      label: provider.label,
      gatewayUrl: vars.SANCHO_EXTERNAL_GATEWAY_URL,
      health,
      started: processResult.started,
      reused: processResult.reused,
      pid: processResult.pid,
      active: readRuntimeSelection().runtime,
      configuredKind: runtimeKindFromEnv(),
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
