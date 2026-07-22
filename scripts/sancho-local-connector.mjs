#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { callbackAuthorityHeaders } from "../docker/runtimes/callback-authority.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const sessionFile =
  process.env.SANCHO_CONNECTOR_SESSION_FILE ||
  path.resolve(scriptDir, "..", "session-credential.json");
const connectorStateDir = path.dirname(sessionFile);
const storedSession = readStoredSession();
const requestedBaseUrl = trimTrailingSlash(process.env.SANCHO_BASE_URL || "");
const requestedProvider = process.env.SANCHO_CONNECTOR_PROVIDER || "";
const storedSessionMatchesRequest =
  Boolean(storedSession) &&
  (!requestedBaseUrl || requestedBaseUrl === trimTrailingSlash(storedSession.baseUrl)) &&
  (!requestedProvider || requestedProvider === storedSession.provider);
const baseUrl = requestedBaseUrl || storedSession?.baseUrl || "";
const configuredProvider = requestedProvider || storedSession?.provider || "";
let token =
  process.env.SANCHO_CONNECTOR_TOKEN ||
  (storedSessionMatchesRequest ? storedSession?.credential : "") ||
  "";
const bridgePath =
  process.env.SANCHO_CONNECTOR_BRIDGE_PATH ||
  path.resolve(scriptDir, "..", "docker", "runtimes", configuredProvider, "bridge.mjs");

let bridge = null;
let bridgeInfo = null;
let runtimeSecret = "";
let shuttingDown = false;

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function readStoredSession() {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(sessionFile, "utf8"));
  } catch {
    return null;
  }
  if (
    parsed?.version !== 1 ||
    typeof parsed.baseUrl !== "string" ||
    (parsed.provider !== "claude-code" && parsed.provider !== "codex") ||
    typeof parsed.credential !== "string" ||
    !parsed.credential
  ) {
    return null;
  }
  try {
    fs.chmodSync(sessionFile, 0o600);
  } catch {
    // A read-only mount may prevent repairing the mode; the credential is
    // still valid and a later successful persistence will replace it safely.
  }
  return parsed;
}

function persistSessionCredential(sessionCredential, sessionId, provider) {
  const directory = path.dirname(sessionFile);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const tmp = `${sessionFile}.${process.pid}.${Date.now()}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  const body = `${JSON.stringify({
    version: 1,
    baseUrl,
    provider,
    sessionId,
    credential: sessionCredential,
  })}\n`;
  let fd = null;
  try {
    fd = fs.openSync(tmp, "wx", 0o600);
    fs.writeFileSync(fd, body, "utf8");
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    fs.renameSync(tmp, sessionFile);
    fs.chmodSync(sessionFile, 0o600);
  } finally {
    if (fd !== null) fs.closeSync(fd);
    try {
      fs.unlinkSync(tmp);
    } catch {
      // Successful rename already removed the temporary pathname.
    }
  }
}

function redactRuntimeCapability(message, value) {
  const text = String(value || "");
  return message?.runtimeToolCapability
    ? text.split(message.runtimeToolCapability).join("[redacted]")
    : text;
}

function connectorUrl(route) {
  return `${baseUrl}/api/runtime/local-connector/${route}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requestHeaders(extra = {}) {
  return {
    ...extra,
    Authorization: `Bearer ${token}`,
  };
}

async function readJson(res) {
  const raw = await res.text();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

async function postJson(route, body) {
  const res = await fetch(connectorUrl(route), {
    method: "POST",
    headers: requestHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  const payload = await readJson(res);
  if (!res.ok) {
    throw new Error(payload.error || payload.raw || `${route} failed with ${res.status}`);
  }
  return payload;
}

async function getJson(route) {
  const res = await fetch(connectorUrl(route), {
    headers: requestHeaders(),
  });
  if (res.status === 204) return null;
  const payload = await readJson(res);
  if (!res.ok) {
    throw new Error(payload.error || payload.raw || `${route} failed with ${res.status}`);
  }
  return payload;
}

function providerCommand(provider) {
  if (provider === "codex") return process.env.CODEX_CLI || "codex";
  return process.env.CLAUDE_CODE_CLI || process.env.CLAUDE_CLI || "claude";
}

function detectRuntime(provider) {
  const command = providerCommand(provider);
  const result = spawnSync(command, ["--version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) {
    return {
      ok: false,
      command,
      error: result.error.message,
    };
  }
  const version = `${result.stdout || result.stderr || ""}`.trim().split(/\r?\n/)[0]?.trim();
  return {
    ok: result.status === 0,
    command,
    version: version || undefined,
    error: result.status === 0 ? undefined : `exit ${result.status}`,
  };
}

function deviceName() {
  return process.env.SANCHO_CONNECTOR_DEVICE || `${os.hostname()} (${process.platform})`;
}

async function waitForBridgeHealth() {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(bridgeInfo.healthUrl, {
        headers: runtimeSecret ? { "X-MC-Secret": runtimeSecret } : undefined,
      });
      if (res.ok) return true;
    } catch {
      // Keep polling until the bridge has finished binding its local port.
    }
    await sleep(250);
  }
  return false;
}

export function localBridgeSpawnOptions(
  env,
  parentEnv = process.env,
  stateDir = connectorStateDir,
) {
  const {
    SANCHO_CONNECTOR_TOKEN: _pairingOrSessionToken,
    ...bridgeParentEnv
  } = parentEnv;
  const stableStateDir = path.resolve(stateDir);
  return {
    cwd: stableStateDir,
    env: {
      ...bridgeParentEnv,
      ...env,
      // Keep terminal callback replay anchored to connector state, regardless
      // of the shell directory used to launch or relaunch the connector.
      SANCHO_CALLBACK_OUTBOX_DIR:
        env.SANCHO_CALLBACK_OUTBOX_DIR ||
        bridgeParentEnv.SANCHO_CALLBACK_OUTBOX_DIR ||
        path.join(stableStateDir, "callback-outbox"),
    },
    stdio: ["ignore", "inherit", "inherit"],
  };
}

function startBridge(env) {
  if (bridge && !bridge.killed) return;
  const options = localBridgeSpawnOptions(env);
  fs.mkdirSync(options.cwd, { recursive: true, mode: 0o700 });
  bridge = spawn(process.execPath, [bridgePath], options);
  bridge.once("exit", (code, signal) => {
    if (!shuttingDown) {
      console.error(`[sancho connector] local bridge exited (${signal || code}).`);
    }
  });
}

export async function postFailureWebhook(message, provider, error, options = {}) {
  const targetBaseUrl = trimTrailingSlash(options.baseUrl ?? baseUrl);
  const targetRuntimeSecret = options.runtimeSecret ?? runtimeSecret;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (!targetBaseUrl || !targetRuntimeSecret || typeof fetchImpl !== "function") return false;
  const rawError = error instanceof Error ? error.stack || error.message : String(error);
  const safeError = redactRuntimeCapability(message, rawError);
  try {
    const res = await fetchImpl(`${targetBaseUrl}/api/chat/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-MC-Secret": targetRuntimeSecret,
        ...callbackAuthorityHeaders(message),
      },
      body: JSON.stringify({
        slug: message.slug,
        threadId: message.threadId,
        missionControlRunId: message.missionControlRunId,
        text: `${provider === "claude-code" ? "Claude Code" : "Codex"} no pudo ejecutar este turno en el ordenador local.`,
        agent: message.agent || message.agentId || provider,
        errorDetail: {
          category: "model_unavailable",
          raw: safeError,
          provider,
          classifiedAt: Date.now(),
        },
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function dispatchJob(job) {
  try {
    const res = await fetch(bridgeInfo.inboundUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-MC-Secret": runtimeSecret,
      },
      body: JSON.stringify(job.message),
    });
    const raw = await res.text().catch(() => "");
    if (!res.ok) throw new Error(raw || `local bridge rejected ${res.status}`);
    await postJson("jobs", { jobId: job.id, status: "dispatched" });
    console.log(`[sancho connector] job ${job.id} dispatched to local bridge.`);
  } catch (error) {
    const errorMessage = redactRuntimeCapability(
      job.message,
      error instanceof Error ? error.message : error,
    );
    await postJson("jobs", {
      jobId: job.id,
      status: "failed",
      error: errorMessage,
    }).catch(() => null);
    await postFailureWebhook(job.message, job.provider, error);
    console.error(`[sancho connector] job ${job.id} failed:`, errorMessage);
  }
}

async function heartbeat(runtime) {
  await postJson("heartbeat", { runtime }).catch((error) => {
    console.error("[sancho connector] heartbeat failed:", error.message);
  });
}

async function main() {
  if (!baseUrl || !token || (configuredProvider !== "claude-code" && configuredProvider !== "codex")) {
    console.error("Uso: SANCHO_BASE_URL=https://... SANCHO_CONNECTOR_TOKEN=... node connector.mjs");
    process.exit(1);
  }
  if (!globalThis.fetch) {
    console.error("Sancho Connector necesita Node.js 18 o superior.");
    process.exit(1);
  }

  const runtime = detectRuntime(configuredProvider);
  const registered = await postJson("register", {
    deviceName: deviceName(),
    runtime,
  });
  bridgeInfo = registered.bridge;
  runtimeSecret = registered.runtimeSecret;
  if (!registered.sessionCredential) {
    throw new Error("Sancho no devolvió la credencial durable del conector.");
  }
  token = registered.sessionCredential;
  process.env.SANCHO_CONNECTOR_TOKEN = token;
  persistSessionCredential(token, registered.session?.id, bridgeInfo.provider);

  if (!runtime.ok) {
    console.error(
      `[sancho connector] No encontré ${bridgeInfo.provider === "claude-code" ? "Claude Code" : "Codex"} (${runtime.error}).`,
    );
    console.error("[sancho connector] Déjalo instalado/autenticado y vuelve a ejecutar el comando de Sancho.");
    process.exit(1);
  }

  startBridge(bridgeInfo.env);
  if (!(await waitForBridgeHealth())) {
    throw new Error("El bridge local no respondió a tiempo.");
  }

  console.log(`[sancho connector] conectado a ${baseUrl}`);
  console.log(`[sancho connector] runtime: ${bridgeInfo.provider}${runtime.version ? ` (${runtime.version})` : ""}`);
  console.log("[sancho connector] deja esta terminal abierta mientras Sancho use este runtime.");

  setInterval(() => heartbeat(runtime), 15_000).unref();
  await heartbeat(runtime);

  while (!shuttingDown) {
    try {
      const payload = await getJson("jobs");
      if (payload?.job) await dispatchJob(payload.job);
      else await sleep(1500);
    } catch (error) {
      console.error("[sancho connector] polling failed:", error instanceof Error ? error.message : error);
      await sleep(3000);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => {
      shuttingDown = true;
      if (bridge && !bridge.killed) bridge.kill("SIGTERM");
      process.exit(0);
    });
  }

  main().catch((error) => {
    console.error("[sancho connector]", error instanceof Error ? error.stack || error.message : error);
    if (bridge && !bridge.killed) bridge.kill("SIGTERM");
    process.exit(1);
  });
}
