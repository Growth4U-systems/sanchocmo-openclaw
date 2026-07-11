#!/usr/bin/env node
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID, timingSafeEqual } from "node:crypto";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 18793;
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
const activeRuns = new Map();

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function envValue(keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(process.env, key)) return process.env[key];
  }
  return undefined;
}

function firstEnv(keys) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

function flagDisabled(keys) {
  const raw = envValue(keys);
  return raw !== undefined && ["0", "false", "no", "off"].includes(String(raw).toLowerCase());
}

function secret() {
  return firstEnv([
    "CODEX_BRIDGE_SECRET",
    "CODEX_RUNTIME_SECRET",
    "SANCHO_EXTERNAL_SECRET",
    "MC_CHAT_SECRET",
  ]);
}

function sanchoSharedSecret() {
  return firstEnv([
    "CODEX_SANCHO_SECRET",
    "CODEX_BRIDGE_SECRET",
    "SANCHO_EXTERNAL_SECRET",
    "MC_CHAT_SECRET",
  ]);
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function bearerToken(req) {
  const raw = req.headers.authorization;
  if (typeof raw !== "string") return "";
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : "";
}

function verifySecret(req) {
  const expected = secret();
  if (!expected) return process.env.CODEX_BRIDGE_ALLOW_INSECURE === "1";
  return safeEqual(req.headers["x-mc-secret"], expected) || safeEqual(bearerToken(req), expected);
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

function normalizeArray(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim());
}

function contextPackUrl() {
  if (process.env.CODEX_CONTEXT_PACK_URL || process.env.SANCHO_CONTEXT_PACK_URL) {
    return process.env.CODEX_CONTEXT_PACK_URL || process.env.SANCHO_CONTEXT_PACK_URL;
  }
  const base =
    process.env.SANCHO_BASE_URL ||
    process.env.MC_SERVER_URL ||
    process.env.BASE_URL ||
    process.env.NEXTAUTH_URL ||
    "http://localhost:3000";
  return `${trimTrailingSlash(base)}/api/chat/context-pack`;
}

function contextPackTimeoutMs() {
  const parsed = Number(firstEnv(["CODEX_CONTEXT_PACK_TIMEOUT_MS", "SANCHO_CONTEXT_PACK_TIMEOUT_MS"]) || "");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5000;
}

export async function fetchContextPack(message) {
  if (flagDisabled(["CODEX_CONTEXT_PACK_ENABLED", "SANCHO_CONTEXT_PACK_ENABLED"])) return null;
  if (!message?.slug) return null;

  const headers = { "Content-Type": "application/json" };
  const shared = sanchoSharedSecret();
  if (shared) headers["X-MC-Secret"] = shared;

  const res = await fetch(contextPackUrl(), {
    method: "POST",
    headers,
    body: JSON.stringify({
      slug: message.slug,
      skill: typeof message.skill === "string" && message.skill.trim() ? message.skill.trim() : null,
    }),
    signal: AbortSignal.timeout(contextPackTimeoutMs()),
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`context-pack ${res.status}${raw ? `: ${raw.slice(0, 500)}` : ""}`);
  if (!raw) return null;
  return JSON.parse(raw);
}

export function buildCodexPrompt(message, contextPack = null) {
  const runtimeContext = {
    slug: message.slug,
    threadId: message.threadId,
    threadName: message.threadName,
    agent: message.agent || message.agentId || "sancho",
    skill: message.skill,
    skills: normalizeArray(message.skills),
    scope: message.scope,
    linkedTo: message.linkedTo,
    docPath: message.docPath,
    docKind: message.docKind,
    senderRole: message.senderRole,
    source: message._source,
    attachments: Array.isArray(message.attachments) ? message.attachments.length : 0,
  };

  const prompt = [
    "You are the Codex CLI runtime for Sancho Mission Control.",
    "You are running headlessly behind Sancho's external-http RuntimeAdapter.",
    "Use the provided Sancho runtime context and context pack as your primary grounding.",
    "When runtime context names a skill, read and follow skills/<skill>/SKILL.md from the current workspace before acting when that file exists.",
    "Return only the final answer that should appear in the Sancho chat.",
    "Do not modify files unless the user explicitly asks for file changes.",
    "Do not mention the external-http transport or bridge internals unless the user asks.",
    "",
    "Runtime context:",
    JSON.stringify(runtimeContext, null, 2),
    "",
    "User message:",
    String(message.text || ""),
  ];

  if (contextPack) {
    prompt.push("", "Sancho context pack:", JSON.stringify(contextPack, null, 2));
  }

  return prompt.join("\n");
}

function runTimeoutMs() {
  const parsed = Number(firstEnv(["CODEX_RUNTIME_TIMEOUT_MS"]) || "");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

function bridgeWorkdir() {
  return firstEnv(["CODEX_RUNTIME_WORKDIR", "SANCHO_HOME"]) || process.cwd();
}

function outputDir() {
  return firstEnv(["CODEX_RUNTIME_OUTPUT_DIR"]) || path.join(os.tmpdir(), "sancho-codex-runtime");
}

function runOutputFile(runId) {
  fs.mkdirSync(outputDir(), { recursive: true });
  return path.join(outputDir(), `${runId}.txt`);
}

function appendOptionalArg(args, flag, keys) {
  const value = firstEnv(keys);
  if (value) args.push(flag, value);
}

export function buildCodexArgs(message, prompt, outputFile = "") {
  const args = ["exec"];
  appendOptionalArg(args, "-m", ["CODEX_RUNTIME_MODEL"]);
  appendOptionalArg(args, "-p", ["CODEX_RUNTIME_PROFILE"]);
  appendOptionalArg(args, "--local-provider", ["CODEX_RUNTIME_LOCAL_PROVIDER"]);

  if (process.env.CODEX_RUNTIME_OSS === "1") args.push("--oss");
  args.push("-s", firstEnv(["CODEX_RUNTIME_SANDBOX"]) || "read-only");
  args.push("-C", bridgeWorkdir());
  args.push("--skip-git-repo-check", "--ephemeral", "--color", "never");

  if (!flagDisabled(["CODEX_RUNTIME_IGNORE_USER_CONFIG"])) args.push("--ignore-user-config");
  if (process.env.CODEX_RUNTIME_JSON_EVENTS === "1") args.push("--json");
  if (outputFile) args.push("-o", outputFile);

  args.push(prompt);
  return args;
}

function stripAnsi(value) {
  return String(value || "").replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
}

export function cleanCodexOutput(value) {
  return stripAnsi(value)
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      if (/^OpenAI Codex/i.test(trimmed)) return false;
      if (/^codex-cli\s/i.test(trimmed)) return false;
      return true;
    })
    .join("\n")
    .trim();
}

async function postProgress(message, runId, label, detail) {
  await postWebhook({
    slug: message.slug,
    threadId: message.threadId,
    role: "progress",
    agent: message.agent || message.agentId || "codex",
    event: {
      kind: "thinking",
      label,
      detail,
      target: runId,
    },
  });
}

async function startCodexRun(message, runId) {
  let contextPack = null;
  try {
    contextPack = await fetchContextPack(message);
  } catch (e) {
    contextPack = {
      verdict: "unavailable",
      error: e instanceof Error ? e.message : String(e),
    };
  }

  const prompt = buildCodexPrompt(message, contextPack);
  const outputFile = runOutputFile(runId);
  const args = buildCodexArgs(message, prompt, outputFile);
  const command = firstEnv(["CODEX_CLI"]) || "codex";
  const existing = activeRuns.get(message.threadId);
  if (existing?.killed) {
    activeRuns.delete(message.threadId);
    return;
  }

  const child = spawn(command, args, {
    cwd: bridgeWorkdir(),
    env: { ...process.env, SANCHO_RUNTIME_RUN_ID: runId },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const entry = existing || { runId, child: null, killed: false, pending: false };
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
    postWebhook({
      slug: message.slug,
      threadId: message.threadId,
      text: "Codex did not finish the runtime turn before the timeout.",
      agent: message.agent || message.agentId || "codex",
      errorDetail: {
        category: "watchdog_abort",
        raw: `Codex runtime timed out after ${runTimeoutMs()}ms`,
        provider: "codex",
        classifiedAt: Date.now(),
      },
    }).catch((e) => console.error("[codex bridge] timeout webhook failed:", e.message));
  }, runTimeoutMs());

  postProgress(
    message,
    runId,
    "Codex received the turn",
    `context-pack=${contextPack?.verdict || (contextPack ? "ok" : "disabled")}; executing ${command} exec`,
  ).catch((e) => console.error("[codex bridge] progress webhook failed:", e.message));

  child.on("error", (e) => {
    clearTimeout(timeout);
    activeRuns.delete(message.threadId);
    postWebhook({
      slug: message.slug,
      threadId: message.threadId,
      text: `Could not start Codex: ${e.message}`,
      agent: message.agent || message.agentId || "codex",
      errorDetail: {
        category: "model_unavailable",
        raw: e.stack || e.message,
        provider: "codex",
        classifiedAt: Date.now(),
      },
    }).catch((err) => console.error("[codex bridge] error webhook failed:", err.message));
  });

  child.on("close", (code, signal) => {
    clearTimeout(timeout);
    activeRuns.delete(message.threadId);
    if (entry.killed) return;

    const fileOutput = fs.existsSync(outputFile) ? fs.readFileSync(outputFile, "utf8") : "";
    const cleanOutput = cleanCodexOutput(fileOutput || stdout);
    const cleanStderr = stripAnsi(stderr).trim();
    if (code === 0) {
      postWebhook({
        slug: message.slug,
        threadId: message.threadId,
        text: cleanOutput || "(Codex finished without text output.)",
        agent: message.agent || message.agentId || "codex",
      }).catch((e) => console.error("[codex bridge] final webhook failed:", e.message));
      return;
    }

    const raw = [cleanStderr, cleanOutput].filter(Boolean).join("\n\n").slice(0, 4096);
    postWebhook({
      slug: message.slug,
      threadId: message.threadId,
      text: `Codex failed while executing this runtime turn${signal ? ` (${signal})` : ""}.`,
      agent: message.agent || message.agentId || "codex",
      errorDetail: {
        category: "network",
        raw: raw || `Codex exited with code ${code}`,
        provider: "codex",
        classifiedAt: Date.now(),
      },
    }).catch((e) => console.error("[codex bridge] failure webhook failed:", e.message));
  });
}

function cancelThread(threadId) {
  const entry = activeRuns.get(threadId);
  if (!entry) return false;
  entry.killed = true;
  if (!entry.child) return true;
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
    return json(res, 409, { error: `Thread ${message.threadId} already has an active Codex run` });
  }

  const runId = `codex_${randomUUID()}`;
  activeRuns.set(message.threadId, { runId, child: null, killed: false, pending: true });
  startCodexRun(message, runId).catch((e) => {
    activeRuns.delete(message.threadId);
    postWebhook({
      slug: message.slug,
      threadId: message.threadId,
      text: `Could not start Codex: ${e.message}`,
      agent: message.agent || message.agentId || "codex",
      errorDetail: {
        category: "model_unavailable",
        raw: e.stack || e.message,
        provider: "codex",
        classifiedAt: Date.now(),
      },
    }).catch((err) => console.error("[codex bridge] start webhook failed:", err.message));
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
      return json(res, 200, { ok: true, runtime: "codex", activeRuns: activeRuns.size });
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
  const host = process.env.CODEX_BRIDGE_HOST || DEFAULT_HOST;
  const port = Number(process.env.CODEX_BRIDGE_PORT || DEFAULT_PORT);
  createServer().listen(port, host, () => {
    console.log(`[codex bridge] listening on http://${host}:${port}`);
  });
}
