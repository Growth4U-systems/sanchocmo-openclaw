#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { terminalCallbackAuthorityHeaders } from "../docker/runtimes/callback-authority.mjs";
import { createCallbackOutbox } from "../docker/runtimes/callback-outbox.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const connectorInstallDir = path.resolve(scriptDir, "..");
const configuredSessionFile = process.env.SANCHO_CONNECTOR_SESSION_FILE?.trim();
const sessionFile = configuredSessionFile
  ? path.resolve(connectorInstallDir, configuredSessionFile)
  : path.join(connectorInstallDir, "session-credential.json");
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
let failureCallbackOutbox = null;

const FAILURE_CALLBACK_RUNTIME_ID = "local-connector";

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

function localConnectorCallbackOutboxDirectory(
  stateDir = connectorStateDir,
  env = process.env,
) {
  const stableStateDir = path.resolve(connectorInstallDir, stateDir);
  const configuredRoot = env.SANCHO_CALLBACK_OUTBOX_DIR?.trim();
  const root = configuredRoot
    ? path.resolve(stableStateDir, configuredRoot)
    : path.join(stableStateDir, "callback-outbox");
  return path.join(root, FAILURE_CALLBACK_RUNTIME_ID);
}

export function createLocalConnectorFailureOutbox(options = {}) {
  const {
    stateDir = connectorStateDir,
    directory = localConnectorCallbackOutboxDirectory(stateDir, options.env),
    logger,
    ...outboxOptions
  } = options;
  return createCallbackOutbox({
    ...outboxOptions,
    runtimeId: FAILURE_CALLBACK_RUNTIME_ID,
    directory,
    logger:
      typeof logger === "function"
        ? logger
        : (event) => {
            if (
              event.event !== "retry_scheduled" &&
              event.event !== "expired" &&
              event.event !== "pruned_invalid"
            ) {
              return;
            }
            const status = event.status ? ` status=${event.status}` : "";
            console.warn(
              `[sancho connector] failure callback ${event.event}` +
                ` id=${String(event.callbackId || "unknown").slice(0, 12)}` +
                ` attempts=${event.attempts || 0}${status}`,
            );
          },
  });
}

function terminalFailureCallbackOutbox() {
  if (!failureCallbackOutbox) {
    failureCallbackOutbox = createLocalConnectorFailureOutbox();
  }
  failureCallbackOutbox.start();
  return failureCallbackOutbox;
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

const pendingJobHandoffAcks = new Set();

/**
 * Confirm only the server-side handoff state. This operation is idempotent and
 * intentionally separate from bridge dispatch: losing this HTTP response must
 * never execute the model a second time.
 */
export async function acknowledgeJobHandoff(jobId, options = {}) {
  const normalizedJobId = typeof jobId === "string" ? jobId.trim() : "";
  if (!normalizedJobId) return false;
  const finishJob = options.finishJob ?? ((body) => postJson("jobs", body));
  try {
    await finishJob({ jobId: normalizedJobId, status: "dispatched" });
    pendingJobHandoffAcks.delete(normalizedJobId);
    return true;
  } catch {
    pendingJobHandoffAcks.add(normalizedJobId);
    return false;
  }
}

export async function retryPendingJobHandoffs(options = {}) {
  const jobIds = [...pendingJobHandoffAcks];
  let acknowledged = 0;
  for (const jobId of jobIds) {
    if (await acknowledgeJobHandoff(jobId, options)) acknowledged += 1;
  }
  return {
    attempted: jobIds.length,
    acknowledged,
    pending: pendingJobHandoffAcks.size,
  };
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
  // Resolve every connector-owned relative path from the installation root,
  // never from the shell directory that happened to launch the connector.
  const stableStateDir = path.resolve(connectorInstallDir, stateDir);
  const configuredOutboxDir = (
    env.SANCHO_CALLBACK_OUTBOX_DIR ||
    bridgeParentEnv.SANCHO_CALLBACK_OUTBOX_DIR ||
    ""
  ).trim();
  return {
    cwd: stableStateDir,
    env: {
      ...bridgeParentEnv,
      ...env,
      // Keep terminal callback replay anchored to connector state, regardless
      // of the shell directory used to launch or relaunch the connector.
      SANCHO_CALLBACK_OUTBOX_DIR: configuredOutboxDir
        ? path.resolve(stableStateDir, configuredOutboxDir)
        : path.join(stableStateDir, "callback-outbox"),
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
  const deliveryId = options.deliveryId || message?.missionControlRunId;
  if (!targetBaseUrl || !targetRuntimeSecret || !deliveryId) return false;
  const authorityHeaders = terminalCallbackAuthorityHeaders(message);
  if (Object.keys(authorityHeaders).length === 0) return false;
  const rawError = error instanceof Error ? error.stack || error.message : String(error);
  const safeError = redactRuntimeCapability(message, rawError);
  try {
    const outbox = options.outbox || terminalFailureCallbackOutbox();
    outbox.start();
    outbox.enqueueTerminal({
      deliveryId,
      url: `${targetBaseUrl}/api/chat/webhook`,
      headers: {
        "Content-Type": "application/json",
        "X-MC-Secret": targetRuntimeSecret,
        ...authorityHeaders,
      },
      payload: {
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
      },
    });
    return true;
  } catch {
    return false;
  }
}

export async function dispatchJob(job, options = {}) {
  const inboundUrl = options.inboundUrl ?? bridgeInfo?.inboundUrl;
  const targetRuntimeSecret = options.runtimeSecret ?? runtimeSecret;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const persistFailure =
    options.persistFailure ??
    ((message, provider, error, failureOptions) =>
      postFailureWebhook(message, provider, error, failureOptions));
  let dispatchError = null;
  try {
    if (!inboundUrl || typeof fetchImpl !== "function") {
      throw new Error("local bridge dispatch is unavailable");
    }
    const res = await fetchImpl(inboundUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-MC-Secret": targetRuntimeSecret,
      },
      body: JSON.stringify(job.message),
    });
    const raw = await res.text().catch(() => "");
    if (!res.ok) throw new Error(raw || `local bridge rejected ${res.status}`);
  } catch (error) {
    dispatchError = error;
  }

  if (!dispatchError) {
    const serverAcknowledged = await acknowledgeJobHandoff(job.id, {
      ...(options.finishJob ? { finishJob: options.finishJob } : {}),
    });
    if (serverAcknowledged) {
      console.log(`[sancho connector] job ${job.id} dispatched to local bridge.`);
    } else {
      console.error(
        `[sancho connector] job ${job.id} was accepted by the bridge; server handoff acknowledgement will be retried without redispatch.`,
      );
    }
    return {
      accepted: true,
      terminalHandoffPersisted: true,
      serverAcknowledged,
    };
  }

  {
    const error = dispatchError;
    const errorMessage = redactRuntimeCapability(
      job.message,
      error instanceof Error ? error.message : error,
    );
    const failurePersisted = await persistFailure(
      job.message,
      job.provider,
      error,
      { deliveryId: job.message.missionControlRunId || job.id },
    );
    if (!failurePersisted) {
      // Do not terminally consume the claimed job when its user-visible failure
      // could not be made durable. The server will make the claim stale and
      // retry/recover it instead of silently losing the terminal result.
      console.error(
        `[sancho connector] job ${job.id} failure callback could not be persisted; leaving the job claimed for recovery.`,
      );
      return {
        accepted: false,
        terminalHandoffPersisted: false,
        serverAcknowledged: false,
      };
    }
    // The bridge rejected the job, but the exact terminal failure is now in a
    // durable callback outbox. From the server queue's perspective ownership
    // has been handed off just like a successful bridge dispatch. Marking the
    // job `failed` here used to start a 30-second generic recovery that could
    // irreversibly preempt this valid callback.
    const serverAcknowledged = await acknowledgeJobHandoff(job.id, {
      ...(options.finishJob ? { finishJob: options.finishJob } : {}),
    });
    if (serverAcknowledged) {
      console.error(
        `[sancho connector] job ${job.id} bridge dispatch failed; terminal callback queued:`,
        errorMessage,
      );
    } else {
      console.error(
        `[sancho connector] job ${job.id} terminal callback is queued; server handoff acknowledgement will be retried without redispatch:`,
        errorMessage,
      );
    }
    return {
      accepted: false,
      terminalHandoffPersisted: true,
      serverAcknowledged,
    };
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

  // Replay connector-owned dispatch failures even when no new job arrives.
  // Records include the exact callback authority captured at failure time.
  terminalFailureCallbackOutbox();

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
      await retryPendingJobHandoffs();
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
      failureCallbackOutbox?.stop();
      if (bridge && !bridge.killed) bridge.kill("SIGTERM");
      process.exit(0);
    });
  }

  main().catch((error) => {
    console.error("[sancho connector]", error instanceof Error ? error.stack || error.message : error);
    failureCallbackOutbox?.stop();
    if (bridge && !bridge.killed) bridge.kill("SIGTERM");
    process.exit(1);
  });
}
