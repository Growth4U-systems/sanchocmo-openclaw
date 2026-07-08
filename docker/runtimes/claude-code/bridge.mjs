#!/usr/bin/env node
import http from "node:http";
import { spawn } from "node:child_process";
import { randomUUID, timingSafeEqual } from "node:crypto";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 18792;
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
const activeRuns = new Map();

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function envValue(keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(process.env, key)) {
      return process.env[key];
    }
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
    "CLAUDE_CODE_BRIDGE_SECRET",
    "CLAUDE_CODE_RUNTIME_SECRET",
    "CLAUDE_RUNTIME_SECRET",
    "SANCHO_EXTERNAL_SECRET",
    "MC_CHAT_SECRET",
  ]);
}

function sanchoSharedSecret() {
  return firstEnv([
    "CLAUDE_CODE_SANCHO_SECRET",
    "CLAUDE_CODE_BRIDGE_SECRET",
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
  if (!expected) return process.env.CLAUDE_CODE_BRIDGE_ALLOW_INSECURE === "1";
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

function sanchoMcpServerName() {
  return firstEnv(["CLAUDE_CODE_SANCHO_MCP_SERVER", "SANCHO_MCP_SERVER_NAME"]) || "sancho";
}

function explicitSanchoMcpUrl() {
  return firstEnv(["CLAUDE_CODE_SANCHO_MCP_URL", "SANCHO_MCP_URL"]);
}

function sanchoMcpUrl() {
  const configured = explicitSanchoMcpUrl();
  if (configured) return configured;
  const base = firstEnv(["SANCHO_BASE_URL", "MC_SERVER_URL", "BASE_URL", "NEXTAUTH_URL"]);
  return base ? `${trimTrailingSlash(base)}/api/mcp/sancho` : "";
}

function sanchoMcpToken() {
  return firstEnv(["CLAUDE_CODE_SANCHO_MCP_TOKEN", "SANCHO_MCP_TOKEN"]);
}

export function buildMcpConfig() {
  const mcpFlag = envValue(["CLAUDE_CODE_SANCHO_MCP_ENABLED", "SANCHO_MCP_ENABLED"]);
  if (mcpFlag !== undefined && ["0", "false", "no", "off"].includes(String(mcpFlag).toLowerCase())) {
    return null;
  }
  const enabled = ["1", "true", "yes", "on"].includes(String(mcpFlag || "").toLowerCase());
  if (!enabled && !explicitSanchoMcpUrl()) return null;

  const url = sanchoMcpUrl();
  if (!url) return null;
  const server = {
    type: "http",
    url,
  };
  const token = sanchoMcpToken();
  if (token) {
    server.headers = {
      Authorization: `Bearer ${token}`,
    };
  }
  return {
    mcpServers: {
      [sanchoMcpServerName()]: server,
    },
  };
}

function normalizeArray(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim());
}

function contextPackUrl() {
  if (process.env.CLAUDE_CODE_CONTEXT_PACK_URL || process.env.SANCHO_CONTEXT_PACK_URL) {
    return process.env.CLAUDE_CODE_CONTEXT_PACK_URL || process.env.SANCHO_CONTEXT_PACK_URL;
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
  const parsed = Number(firstEnv(["CLAUDE_CODE_CONTEXT_PACK_TIMEOUT_MS", "SANCHO_CONTEXT_PACK_TIMEOUT_MS"]) || "");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5000;
}

export async function fetchContextPack(message) {
  if (flagDisabled(["CLAUDE_CODE_CONTEXT_PACK_ENABLED", "SANCHO_CONTEXT_PACK_ENABLED"])) return null;
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
  if (!res.ok) {
    throw new Error(`context-pack ${res.status}${raw ? `: ${raw.slice(0, 500)}` : ""}`);
  }
  if (!raw) return null;
  return JSON.parse(raw);
}

export function buildClaudePrompt(message, contextPack = null) {
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
    "You are the Claude Code runtime for Sancho Mission Control.",
    "You are running headlessly behind Sancho's external-http RuntimeAdapter.",
    "Use the provided Sancho runtime context and context pack as your primary grounding.",
    "If Sancho MCP tools are configured, use them only when the turn requires live Sancho operations beyond the provided context.",
    "Return only the final answer that should appear in the Sancho chat.",
    "Do not mention the external-http transport, MCP setup, or bridge internals unless the user asks.",
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
  const parsed = Number(firstEnv(["CLAUDE_CODE_RUNTIME_TIMEOUT_MS", "CLAUDE_RUNTIME_TIMEOUT_MS"]) || "");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

function bridgeWorkdir() {
  return firstEnv(["CLAUDE_CODE_RUNTIME_WORKDIR", "CLAUDE_RUNTIME_WORKDIR", "SANCHO_HOME"]) || process.cwd();
}

function appendOptionalArg(args, flag, keys) {
  const value = firstEnv(keys);
  if (value) args.push(flag, value);
}

export function buildClaudeArgs(message, prompt, mcpConfig = buildMcpConfig()) {
  const args = [];

  args.push("-p", prompt, "--output-format", "json");

  appendOptionalArg(args, "--model", ["CLAUDE_CODE_RUNTIME_MODEL", "CLAUDE_RUNTIME_MODEL"]);
  appendOptionalArg(args, "--permission-mode", [
    "CLAUDE_CODE_RUNTIME_PERMISSION_MODE",
    "CLAUDE_RUNTIME_PERMISSION_MODE",
  ]);
  appendOptionalArg(args, "--settings", ["CLAUDE_CODE_RUNTIME_SETTINGS", "CLAUDE_RUNTIME_SETTINGS"]);
  appendOptionalArg(args, "--append-system-prompt", [
    "CLAUDE_CODE_RUNTIME_SYSTEM_PROMPT",
    "CLAUDE_RUNTIME_SYSTEM_PROMPT",
  ]);

  args.push("--setting-sources", firstEnv([
    "CLAUDE_CODE_RUNTIME_SETTING_SOURCES",
    "CLAUDE_RUNTIME_SETTING_SOURCES",
  ]) || "local");

  if (!flagDisabled(["CLAUDE_CODE_RUNTIME_DISABLE_SLASH_COMMANDS", "CLAUDE_RUNTIME_DISABLE_SLASH_COMMANDS"])) {
    args.push("--disable-slash-commands");
  }

  if (!flagDisabled(["CLAUDE_CODE_RUNTIME_NO_SESSION_PERSISTENCE", "CLAUDE_RUNTIME_NO_SESSION_PERSISTENCE"])) {
    args.push("--no-session-persistence");
  }

  appendOptionalArg(args, "--max-budget-usd", [
    "CLAUDE_CODE_RUNTIME_MAX_BUDGET_USD",
    "CLAUDE_RUNTIME_MAX_BUDGET_USD",
  ]);

  const builtinTools = envValue(["CLAUDE_CODE_RUNTIME_TOOLS", "CLAUDE_RUNTIME_TOOLS"]);
  args.push("--tools", builtinTools === undefined ? "" : builtinTools);

  if (mcpConfig) {
    args.push("--mcp-config", JSON.stringify(mcpConfig));
    if (!flagDisabled(["CLAUDE_CODE_RUNTIME_STRICT_MCP", "CLAUDE_RUNTIME_STRICT_MCP"])) {
      args.push("--strict-mcp-config");
    }
  }

  const allowedTools =
    envValue(["CLAUDE_CODE_RUNTIME_ALLOWED_TOOLS", "CLAUDE_RUNTIME_ALLOWED_TOOLS"]) ||
    (mcpConfig ? `mcp__${sanchoMcpServerName()}__*` : undefined);
  if (allowedTools) args.push("--allowedTools", allowedTools);

  return args;
}

function stripAnsi(value) {
  return String(value || "").replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
}

export function cleanClaudeStdout(value) {
  const clean = stripAnsi(value).trim();
  if (!clean) return "";

  try {
    const parsed = JSON.parse(clean);
    if (typeof parsed.result === "string") return parsed.result.trim();
    if (typeof parsed.structured_output === "string") return parsed.structured_output.trim();
  } catch {
    // Fall through to line-by-line parsing.
  }

  const lines = clean.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      const parsed = JSON.parse(lines[i]);
      if (typeof parsed.result === "string") return parsed.result.trim();
    } catch {
      // Ignore non-JSON log lines.
    }
  }

  return clean;
}

async function postProgress(message, runId, label, detail) {
  await postWebhook({
    slug: message.slug,
    threadId: message.threadId,
    role: "progress",
    agent: message.agent || message.agentId || "claude-code",
    event: {
      kind: "thinking",
      label,
      detail,
      target: runId,
    },
  });
}

function buildClaudeEnv(runId) {
  const env = { ...process.env, SANCHO_RUNTIME_RUN_ID: runId };
  if (!env.CLAUDE_CODE_OAUTH_TOKEN && env.ANTHROPIC_OAUTH_TOKEN) {
    env.CLAUDE_CODE_OAUTH_TOKEN = env.ANTHROPIC_OAUTH_TOKEN;
  }
  return env;
}

async function startClaudeRun(message, runId) {
  let contextPack = null;
  try {
    contextPack = await fetchContextPack(message);
  } catch (e) {
    contextPack = {
      verdict: "unavailable",
      error: e instanceof Error ? e.message : String(e),
    };
  }

  const prompt = buildClaudePrompt(message, contextPack);
  const mcpConfig = buildMcpConfig();
  const args = buildClaudeArgs(message, prompt, mcpConfig);
  const command = firstEnv(["CLAUDE_CODE_CLI", "CLAUDE_CLI"]) || "claude";
  const existing = activeRuns.get(message.threadId);
  if (existing?.killed) {
    activeRuns.delete(message.threadId);
    return;
  }

  const child = spawn(command, args, {
    cwd: bridgeWorkdir(),
    env: buildClaudeEnv(runId),
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
      text: "Claude Code did not finish the runtime turn before the timeout.",
      agent: message.agent || message.agentId || "claude-code",
      errorDetail: {
        category: "watchdog_abort",
        raw: `Claude Code runtime timed out after ${runTimeoutMs()}ms`,
        provider: "claude-code",
        classifiedAt: Date.now(),
      },
    }).catch((e) => console.error("[claude-code bridge] timeout webhook failed:", e.message));
  }, runTimeoutMs());

  postProgress(
    message,
    runId,
    "Claude Code received the turn",
    `context-pack=${contextPack?.verdict || (contextPack ? "ok" : "disabled")}; mcp=${mcpConfig ? "configured" : "disabled"}; executing ${command} -p`,
  ).catch((e) => console.error("[claude-code bridge] progress webhook failed:", e.message));

  child.on("error", (e) => {
    clearTimeout(timeout);
    activeRuns.delete(message.threadId);
    postWebhook({
      slug: message.slug,
      threadId: message.threadId,
      text: `Could not start Claude Code: ${e.message}`,
      agent: message.agent || message.agentId || "claude-code",
      errorDetail: {
        category: "model_unavailable",
        raw: e.stack || e.message,
        provider: "claude-code",
        classifiedAt: Date.now(),
      },
    }).catch((err) => console.error("[claude-code bridge] error webhook failed:", err.message));
  });

  child.on("close", (code, signal) => {
    clearTimeout(timeout);
    activeRuns.delete(message.threadId);
    if (entry.killed) return;

    const cleanStdout = cleanClaudeStdout(stdout);
    const cleanStderr = stripAnsi(stderr).trim();
    if (code === 0) {
      postWebhook({
        slug: message.slug,
        threadId: message.threadId,
        text: cleanStdout || "(Claude Code finished without text output.)",
        agent: message.agent || message.agentId || "claude-code",
      }).catch((e) => console.error("[claude-code bridge] final webhook failed:", e.message));
      return;
    }

    const raw = [cleanStderr, cleanStdout].filter(Boolean).join("\n\n").slice(0, 4096);
    postWebhook({
      slug: message.slug,
      threadId: message.threadId,
      text: `Claude Code failed while executing this runtime turn${signal ? ` (${signal})` : ""}.`,
      agent: message.agent || message.agentId || "claude-code",
      errorDetail: {
        category: "network",
        raw: raw || `Claude Code exited with code ${code}`,
        provider: "claude-code",
        classifiedAt: Date.now(),
      },
    }).catch((e) => console.error("[claude-code bridge] failure webhook failed:", e.message));
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
    return json(res, 409, { error: `Thread ${message.threadId} already has an active Claude Code run` });
  }

  const runId = `claude_code_${randomUUID()}`;
  activeRuns.set(message.threadId, { runId, child: null, killed: false, pending: true });
  startClaudeRun(message, runId).catch((e) => {
    activeRuns.delete(message.threadId);
    postWebhook({
      slug: message.slug,
      threadId: message.threadId,
      text: `Could not start Claude Code: ${e.message}`,
      agent: message.agent || message.agentId || "claude-code",
      errorDetail: {
        category: "model_unavailable",
        raw: e.stack || e.message,
        provider: "claude-code",
        classifiedAt: Date.now(),
      },
    }).catch((err) => console.error("[claude-code bridge] start webhook failed:", err.message));
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
      return json(res, 200, { ok: true, runtime: "claude-code", activeRuns: activeRuns.size });
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
  const host = process.env.CLAUDE_CODE_BRIDGE_HOST || process.env.CLAUDE_RUNTIME_HOST || DEFAULT_HOST;
  const port = Number(process.env.CLAUDE_CODE_BRIDGE_PORT || process.env.CLAUDE_RUNTIME_PORT || DEFAULT_PORT);
  createServer().listen(port, host, () => {
    console.log(`[claude-code bridge] listening on http://${host}:${port}`);
  });
}
