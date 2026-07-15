#!/usr/bin/env node
import http from "node:http";
import { spawn } from "node:child_process";
import { randomUUID, timingSafeEqual } from "node:crypto";
import {
  buildMcChatContextBlock,
  groundingSkillForTurn,
  resolveTurnSkillPolicy,
} from "../../../src/lib/runtime/agent-contract/mc-chat-context.mjs";

const DEFAULT_HOST = "127.0.0.1";
// OpenClaw reserves 18791 for browser control inside the Sancho container.
const DEFAULT_PORT = 18795;
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
const DEFAULT_CONTEXT_PACK_TIMEOUT_MS = 5000;
const activeRuns = new Map();

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function secret() {
  return (
    process.env.HERMES_BRIDGE_SECRET ||
    process.env.HERMES_CHAT_SECRET ||
    process.env.HERMES_SHARED_SECRET ||
    process.env.MC_CHAT_SECRET ||
    ""
  );
}

function sanchoSharedSecret() {
  return (
    process.env.HERMES_SANCHO_SECRET ||
    process.env.HERMES_CHAT_SECRET ||
    process.env.HERMES_SHARED_SECRET ||
    process.env.MC_CHAT_SECRET ||
    process.env.HERMES_BRIDGE_SECRET ||
    ""
  );
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function verifySecret(req) {
  const expected = secret();
  if (!expected) return process.env.HERMES_BRIDGE_ALLOW_INSECURE === "1";
  return safeEqual(req.headers["x-mc-secret"], expected);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });
}

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function normalizeArray(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim());
}

function uniqueStrings(values) {
  return Array.from(new Set(values.filter((value) => typeof value === "string" && value.trim())));
}

function runtimeSkill(value) {
  if (typeof value !== "string") return null;
  const skill = value.trim();
  if (!skill) return null;
  const lower = skill.toLowerCase();
  if (["general", "default", "none", "null"].includes(lower)) return null;
  return skill;
}

function hermesSkills(message) {
  if (resolveTurnSkillPolicy(message) !== "pinned") return [];
  return uniqueStrings([runtimeSkill(message.skill), ...normalizeArray(message.skills).map(runtimeSkill)]);
}

function stripAnsi(value) {
  return String(value || "").replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
}

function webhookUrl() {
  if (process.env.SANCHO_WEBHOOK_URL) return process.env.SANCHO_WEBHOOK_URL;
  const base =
    process.env.SANCHO_BASE_URL ||
    process.env.MC_SERVER_URL ||
    process.env.BASE_URL ||
    process.env.NEXTAUTH_URL ||
    "http://localhost:3000";
  return `${trimTrailingSlash(base)}/api/chat/webhook`;
}

async function postWebhook(payload) {
  const headers = { "Content-Type": "application/json" };
  const shared = sanchoSharedSecret();
  if (shared) headers["X-MC-Secret"] = shared;
  const res = await fetch(webhookUrl(), {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    throw new Error(`Sancho webhook rejected ${res.status}${raw ? `: ${raw}` : ""}`);
  }
}

function callbackIdentity(message) {
  return typeof message?.missionControlRunId === "string" && message.missionControlRunId
    ? { missionControlRunId: message.missionControlRunId }
    : {};
}

function postTerminalOnce(message, payload, label) {
  const entry = activeRuns.get(message.threadId);
  if (!entry || entry.terminalPosted) return false;
  entry.terminalPosted = true;
  if (activeRuns.get(message.threadId) === entry) activeRuns.delete(message.threadId);
  postWebhook({ ...payload, ...callbackIdentity(message) })
    .catch((e) => console.error(`[hermes bridge] ${label} webhook failed:`, e.message));
  return true;
}

function contextPackUrl() {
  if (process.env.SANCHO_CONTEXT_PACK_URL) return process.env.SANCHO_CONTEXT_PACK_URL;
  const base =
    process.env.SANCHO_BASE_URL ||
    process.env.MC_SERVER_URL ||
    process.env.BASE_URL ||
    process.env.NEXTAUTH_URL ||
    "http://localhost:3000";
  return `${trimTrailingSlash(base)}/api/chat/context-pack`;
}

function contextPackTimeoutMs() {
  const parsed = Number(process.env.HERMES_CONTEXT_PACK_TIMEOUT_MS || "");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CONTEXT_PACK_TIMEOUT_MS;
}

export async function fetchContextPack(message) {
  if (process.env.HERMES_CONTEXT_PACK_ENABLED === "0") return null;
  if (!message?.slug) return null;
  const groundingSkill = groundingSkillForTurn(message);

  const headers = { "Content-Type": "application/json" };
  const shared = sanchoSharedSecret();
  if (shared) headers["X-MC-Secret"] = shared;

  const res = await fetch(contextPackUrl(), {
    method: "POST",
    headers,
    body: JSON.stringify({
      slug: message.slug,
      skill: groundingSkill,
    }),
    signal: AbortSignal.timeout(contextPackTimeoutMs()),
  });
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`context-pack ${res.status}${raw ? `: ${raw.slice(0, 500)}` : ""}`);
  }
  if (!raw) return null;
  return JSON.parse(raw);
}

export function buildHermesPrompt(message, contextPack = null) {
  const skills = uniqueStrings([message.skill, ...normalizeArray(message.skills)]);
  const requestedAgent = message.agent || message.agentId || "sancho";
  const skillMode = resolveTurnSkillPolicy(message);
  const mcChatContext = buildMcChatContextBlock({
    ...message,
    requestedAgent,
    skillMode,
    // Final replies are posted back to Next, whose runtime-neutral control
    // plane consumes task/intervention markers.
    canDelegate: message.temporaryAgent !== true && message.controlDepth !== 1,
    temporaryAgent: message.temporaryAgent,
    taskRouteProposal: message.taskRouteProposal,
  });
  const runtimeContext = {
    slug: message.slug,
    threadId: message.threadId,
    threadName: message.threadName,
    agent: requestedAgent,
    skill: message.skill,
    skills,
    scope: message.scope,
    skillMode,
    linkedTo: message.linkedTo,
    docPath: message.docPath,
    docKind: message.docKind,
    senderRole: message.senderRole,
    source: message._source,
    attachments: Array.isArray(message.attachments) ? message.attachments.length : 0,
  };

  const base = [
    "You are replying inside Sancho Mission Control.",
    "Return only the final answer that should appear in the Sancho chat.",
    "This is a headless turn: never call clarify or any interactive question tool. Put every user question directly in the final answer and end the turn.",
    "Use the runtime context as routing and grounding metadata. Do not mention transport details unless the user asks.",
    "",
    mcChatContext,
    "",
    "Runtime context:",
    JSON.stringify(runtimeContext, null, 2),
    "",
    "User message:",
    String(message.text || ""),
  ].join("\n");

  if (!contextPack) return base;

  return [
    base,
    "",
    "Sancho context pack:",
    JSON.stringify(contextPack, null, 2),
  ].join("\n");
}

export function buildHermesArgs(message, prompt) {
  const args = ["chat", "-Q"];
  const skills = hermesSkills(message);
  if (skills.length > 0) args.push("-s", skills.join(","));
  if (process.env.HERMES_CLI_PROVIDER) args.push("--provider", process.env.HERMES_CLI_PROVIDER);
  if (process.env.HERMES_CLI_MODEL) args.push("--model", process.env.HERMES_CLI_MODEL);
  if (process.env.HERMES_CLI_TOOLSETS) args.push("--toolsets", process.env.HERMES_CLI_TOOLSETS);
  args.push("-q", prompt);
  return args;
}

function bridgeWorkdir() {
  return process.env.HERMES_WORKDIR || process.env.SANCHO_HOME || process.cwd();
}

function runTimeoutMs() {
  const parsed = Number(process.env.HERMES_RUN_TIMEOUT_MS || "");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

export function cleanHermesStdout(value) {
  return stripAnsi(value)
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      if (/^session_id:\s*/i.test(trimmed)) return false;
      if (/tirith security scanner enabled but not available/i.test(trimmed)) return false;
      return true;
    })
    .join("\n")
    .trim();
}

export function buildHermesChildEnv(message, runId) {
  return {
    ...process.env,
    HERMES_SANCHO_RUN_ID: runId,
    SANCHO_CHAT_SLUG: message.slug || "",
    SANCHO_CHAT_THREAD_ID: message.threadId || "",
    SANCHO_CHAT_AGENT: message.agent || message.agentId || "hermes",
    SANCHO_CHAT_REQUEST: message.text || "",
  };
}

async function postProgress(message, runId, label, detail) {
  await postWebhook({
    slug: message.slug,
    threadId: message.threadId,
    ...callbackIdentity(message),
    role: "progress",
    agent: message.agent || message.agentId || "hermes",
    event: {
      kind: "thinking",
      label,
      detail,
      target: runId,
    },
  });
}

async function startHermesRun(message, runId) {
  let contextPack = null;
  try {
    contextPack = await fetchContextPack(message);
  } catch (e) {
    contextPack = {
      verdict: "unavailable",
      error: e instanceof Error ? e.message : String(e),
    };
  }

  const prompt = buildHermesPrompt(message, contextPack);
  const args = buildHermesArgs(message, prompt);
  const command = process.env.HERMES_CLI || "hermes";
  const existing = activeRuns.get(message.threadId);
  if (existing?.killed) {
    activeRuns.delete(message.threadId);
    return;
  }
  const child = spawn(command, args, {
    cwd: bridgeWorkdir(),
    env: buildHermesChildEnv(message, runId),
    stdio: ["ignore", "pipe", "pipe"],
  });
  const entry = existing || { runId, child: null, killed: false, terminalPosted: false };
  entry.child = child;
  entry.pending = false;
  activeRuns.set(message.threadId, entry);

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString("utf8");
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });

  const timeout = setTimeout(() => {
    entry.killed = true;
    child.kill("SIGTERM");
    setTimeout(() => child.kill("SIGKILL"), 1000).unref();
    postTerminalOnce(message, {
      slug: message.slug,
      threadId: message.threadId,
      text: "Hermes no terminó la ejecución dentro del tiempo esperado.",
      agent: message.agent || message.agentId || "hermes",
      errorDetail: {
        category: "watchdog_abort",
        raw: `Hermes run timed out after ${runTimeoutMs()}ms`,
        provider: "hermes",
        classifiedAt: Date.now(),
      },
    }, "timeout");
  }, runTimeoutMs());

  const contextDetail =
    contextPack && contextPack.verdict
      ? `context-pack=${contextPack.verdict}`
      : contextPack
        ? "context-pack=ok"
        : "context-pack=disabled";
  postProgress(
    message,
    runId,
    "Hermes recibió el turno",
    `${contextDetail}. Ejecutando ${command} ${args.slice(0, -1).join(" ")}`,
  )
    .catch((e) => console.error("[hermes bridge] progress webhook failed:", e.message));

  child.on("error", (e) => {
    clearTimeout(timeout);
    entry.killed = true;
    postTerminalOnce(message, {
      slug: message.slug,
      threadId: message.threadId,
      text: `No he podido arrancar Hermes: ${e.message}`,
      agent: message.agent || message.agentId || "hermes",
      errorDetail: {
        category: "model_unavailable",
        raw: e.stack || e.message,
        provider: "hermes",
        classifiedAt: Date.now(),
      },
    }, "error");
  });

  child.on("close", (code, signal) => {
    clearTimeout(timeout);
    if (entry.killed || entry.terminalPosted) return;

    const cleanStdout = cleanHermesStdout(stdout);
    const cleanStderr = stripAnsi(stderr).trim();
    if (code === 0) {
      postTerminalOnce(message, {
        slug: message.slug,
        threadId: message.threadId,
        text: cleanStdout || "(Hermes terminó sin texto de salida.)",
        agent: message.agent || message.agentId || "hermes",
      }, "final");
      return;
    }

    const raw = [cleanStderr, cleanStdout].filter(Boolean).join("\n\n").slice(0, 4096);
    postTerminalOnce(message, {
      slug: message.slug,
      threadId: message.threadId,
      text: `Hermes falló ejecutando este turno${signal ? ` (${signal})` : ""}.`,
      agent: message.agent || message.agentId || "hermes",
      errorDetail: {
        category: "network",
        raw: raw || `Hermes exited with code ${code}`,
        provider: "hermes",
        classifiedAt: Date.now(),
      },
    }, "failure");
  });
}

function cancelThread(threadId) {
  const entry = activeRuns.get(threadId);
  if (!entry) return false;
  entry.killed = true;
  if (!entry.child) {
    return true;
  }
  entry.child.kill("SIGTERM");
  setTimeout(() => entry.child.kill("SIGKILL"), 1000).unref();
  activeRuns.delete(threadId);
  return true;
}

async function handleInbound(req, res) {
  if (!verifySecret(req)) return json(res, 403, { error: "Forbidden" });
  let message;
  try {
    message = JSON.parse(await readBody(req));
  } catch (e) {
    return json(res, 400, { error: e instanceof Error ? e.message : String(e) });
  }

  if (!message || typeof message !== "object") return json(res, 400, { error: "Invalid payload" });
  if (typeof message.slug !== "string" || !message.slug.trim()) return json(res, 400, { error: "Missing slug" });
  if (typeof message.text !== "string") return json(res, 400, { error: "Missing text" });
  message.threadId =
    typeof message.threadId === "string" && message.threadId.trim()
      ? message.threadId.trim()
      : `${message.slug}:general`;

  if (message.text.trim() === "/stop") {
    const cancelled = cancelThread(message.threadId);
    return json(res, 200, { ok: true, cancelled });
  }

  if (activeRuns.has(message.threadId)) {
    return json(res, 409, { error: `Thread ${message.threadId} already has an active Hermes run` });
  }

  const runId = `hermes_${randomUUID()}`;
  activeRuns.set(message.threadId, { runId, child: null, killed: false, pending: true, terminalPosted: false });
  startHermesRun(message, runId).catch((e) => {
    postTerminalOnce(message, {
      slug: message.slug,
      threadId: message.threadId,
      text: `No he podido arrancar Hermes: ${e.message}`,
      agent: message.agent || message.agentId || "hermes",
      errorDetail: {
        category: "model_unavailable",
        raw: e.stack || e.message,
        provider: "hermes",
        classifiedAt: Date.now(),
      },
    }, "start");
  });
  return json(res, 202, { ok: true, runId, chatId: runId, threadId: message.threadId });
}

async function handleCancel(req, res) {
  if (!verifySecret(req)) return json(res, 403, { error: "Forbidden" });
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch (e) {
    return json(res, 400, { error: e instanceof Error ? e.message : String(e) });
  }
  const threadId = typeof body?.threadId === "string" ? body.threadId.trim() : "";
  if (!threadId) return json(res, 400, { error: "Missing threadId" });
  return json(res, 200, { ok: true, cancelled: cancelThread(threadId) });
}

export function createServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (req.method === "GET" && url.pathname === "/healthz") {
      return json(res, 200, { ok: true, activeRuns: activeRuns.size });
    }
    if (req.method === "POST" && url.pathname === "/sancho/inbound") {
      handleInbound(req, res).catch((e) => json(res, 500, { error: e.message || String(e) }));
      return;
    }
    if (req.method === "POST" && url.pathname === "/sancho/cancel") {
      handleCancel(req, res).catch((e) => json(res, 500, { error: e.message || String(e) }));
      return;
    }
    json(res, 404, { error: "Not found" });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const host = process.env.HERMES_BRIDGE_HOST || DEFAULT_HOST;
  const port = Number(process.env.HERMES_BRIDGE_PORT || DEFAULT_PORT);
  createServer().listen(port, host, () => {
    console.log(`[hermes bridge] listening on http://${host}:${port}`);
  });
}
