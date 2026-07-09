#!/usr/bin/env node
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const baseUrl = trimTrailingSlash(process.env.SANCHO_BASE_URL || "");
const token = process.env.SANCHO_CONNECTOR_TOKEN || "";
const bridgePath =
  process.env.SANCHO_CONNECTOR_BRIDGE_PATH ||
  path.join(path.dirname(fileURLToPath(import.meta.url)), "bridge.mjs");

let bridge = null;
let bridgeInfo = null;
let runtimeSecret = "";
let shuttingDown = false;

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
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

function startBridge(env) {
  if (bridge && !bridge.killed) return;
  bridge = spawn(process.execPath, [bridgePath], {
    env: {
      ...process.env,
      ...env,
    },
    stdio: ["ignore", "inherit", "inherit"],
  });
  bridge.once("exit", (code, signal) => {
    if (!shuttingDown) {
      console.error(`[sancho connector] local bridge exited (${signal || code}).`);
    }
  });
}

async function postFailureWebhook(message, provider, error) {
  if (!runtimeSecret) return;
  await fetch(`${baseUrl}/api/chat/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-MC-Secret": runtimeSecret,
    },
    body: JSON.stringify({
      slug: message.slug,
      threadId: message.threadId,
      text: `${provider === "claude-code" ? "Claude Code" : "Codex"} no pudo ejecutar este turno en el ordenador local.`,
      agent: message.agent || message.agentId || provider,
      errorDetail: {
        category: "model_unavailable",
        raw: error instanceof Error ? error.stack || error.message : String(error),
        provider,
        classifiedAt: Date.now(),
      },
    }),
  }).catch(() => null);
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
    await postJson("jobs", {
      jobId: job.id,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    }).catch(() => null);
    await postFailureWebhook(job.message, job.provider, error);
    console.error(`[sancho connector] job ${job.id} failed:`, error instanceof Error ? error.message : error);
  }
}

async function heartbeat(runtime) {
  await postJson("heartbeat", { runtime }).catch((error) => {
    console.error("[sancho connector] heartbeat failed:", error.message);
  });
}

async function main() {
  if (!baseUrl || !token) {
    console.error("Uso: SANCHO_BASE_URL=https://... SANCHO_CONNECTOR_TOKEN=... node connector.mjs");
    process.exit(1);
  }
  if (!globalThis.fetch) {
    console.error("Sancho Connector necesita Node.js 18 o superior.");
    process.exit(1);
  }

  const firstRegistration = await postJson("register", {
    deviceName: deviceName(),
    runtime: { ok: true, command: "detecting" },
  });
  bridgeInfo = firstRegistration.bridge;
  runtimeSecret = firstRegistration.runtimeSecret;
  const runtime = detectRuntime(bridgeInfo.provider);

  const registered = await postJson("register", {
    deviceName: deviceName(),
    runtime,
  });
  bridgeInfo = registered.bridge;
  runtimeSecret = registered.runtimeSecret;

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
