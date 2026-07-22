#!/usr/bin/env node
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { chmod, lstat, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import {
  buildMcChatContextBlock,
  resolveTurnSkillPolicy,
} from "../../../src/lib/runtime/agent-contract/mc-chat-context.mjs";
import { classifyRuntimeCliFailure } from "../../../src/lib/runtime/agent-contract/runtime-cli-failure.mjs";
import {
  callbackAuthorityHeaders,
  terminalCallbackAuthorityHeaders,
} from "../callback-authority.mjs";
import {
  createCallbackOutbox,
  resolveCallbackOutboxDir,
} from "../callback-outbox.mjs";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 18793;
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
const CODEX_PROCESS_TMP_ROOT = path.resolve(
  os.tmpdir(),
  `sancho-codex-${process.pid}-${randomUUID()}`,
);
const CODEX_AUTH_FILES = Object.freeze(["auth.json"]);
const CODEX_AUTH_FILE_MAX_BYTES = 2 * 1024 * 1024;
const CODEX_CHILD_OS_ENV_KEYS = Object.freeze([
  "PATH",
  "SHELL",
  "LANG",
  "LANGUAGE",
  "LC_ALL",
  "LC_CTYPE",
  "TZ",
  "TERM",
  "SYSTEMROOT",
  "WINDIR",
  "COMSPEC",
  "PATHEXT",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "NO_PROXY",
  "http_proxy",
  "https_proxy",
  "all_proxy",
  "no_proxy",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
  "REQUESTS_CA_BUNDLE",
  "CURL_CA_BUNDLE",
  "NODE_EXTRA_CA_CERTS",
]);
const CODEX_PROVIDER_ENV_KEYS = Object.freeze([
  "OPENAI_API_KEY",
  "CODEX_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_API_BASE",
  "OPENAI_ORG_ID",
  "OPENAI_ORGANIZATION",
  "OPENAI_PROJECT_ID",
  "AZURE_OPENAI_API_KEY",
  "AZURE_OPENAI_ENDPOINT",
  "OPENAI_API_VERSION",
  "OLLAMA_HOST",
  "LMSTUDIO_BASE_URL",
  "LM_STUDIO_BASE_URL",
]);
const activeRuns = new Map();
const callbackOutboxes = new Map();

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
  return secret();
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

function callbackHeaders(message, { terminal = false } = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(terminal
      ? terminalCallbackAuthorityHeaders(message)
      : callbackAuthorityHeaders(message)),
  };
  const shared = sanchoSharedSecret();
  if (shared) headers["X-MC-Secret"] = shared;
  return headers;
}

function terminalCallbackOutbox() {
  const directory = resolveCallbackOutboxDir("codex");
  let outbox = callbackOutboxes.get(directory);
  if (!outbox) {
    outbox = createCallbackOutbox({
      runtimeId: "codex",
      directory,
      logger(event) {
        if (event.event !== "retry_scheduled" && event.event !== "expired") return;
        const status = event.status ? ` status=${event.status}` : "";
        console.warn(
          `[codex bridge] terminal callback ${event.event}` +
          ` id=${String(event.callbackId || "unknown").slice(0, 12)}` +
          ` attempts=${event.attempts || 0}${status}`,
        );
      },
    });
    callbackOutboxes.set(directory, outbox);
  }
  outbox.start();
  return outbox;
}

async function postWebhook(payload, message) {
  await terminalCallbackOutbox().postBestEffort({
    url: webhookUrl(),
    headers: callbackHeaders(message),
    payload,
  });
}

function callbackIdentity(message) {
  return typeof message?.missionControlRunId === "string" && message.missionControlRunId
    ? { missionControlRunId: message.missionControlRunId }
    : {};
}

function postTerminalOnce(message, payload, label) {
  const entry = activeRuns.get(message.threadId);
  if (!entry || entry.terminalPosted) return false;
  try {
    terminalCallbackOutbox().enqueueTerminal({
      deliveryId: message.missionControlRunId || entry.runId,
      url: webhookUrl(),
      headers: callbackHeaders(message, { terminal: true }),
      payload: { ...payload, ...callbackIdentity(message) },
    });
  } catch (error) {
    console.error(
      `[codex bridge] ${label} terminal callback could not be persisted:`,
      error instanceof Error ? error.message : "unknown outbox error",
    );
    return false;
  }
  entry.terminalPosted = true;
  if (activeRuns.get(message.threadId) === entry) activeRuns.delete(message.threadId);
  return true;
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

  const headers = {
    "Content-Type": "application/json",
    ...callbackAuthorityHeaders(message),
  };
  const shared = sanchoSharedSecret();
  if (shared) headers["X-MC-Secret"] = shared;

  const res = await fetch(contextPackUrl(), {
    method: "POST",
    headers,
    // Tenant and skill are derived from the authorized persisted run.
    body: JSON.stringify({}),
    signal: AbortSignal.timeout(contextPackTimeoutMs()),
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`context-pack ${res.status}${raw ? `: ${raw.slice(0, 500)}` : ""}`);
  if (!raw) return null;
  return JSON.parse(raw);
}

export function buildCodexPrompt(message, contextPack = null) {
  const requestedAgent = message.agent || message.agentId || "sancho";
  const skillMode = resolveTurnSkillPolicy(message);
  const mcChatContext = buildMcChatContextBlock({
    ...message,
    requestedAgent,
    runtimeId: "codex",
    skillMode,
    canDelegate: message.temporaryAgent !== true && message.controlDepth !== 1,
    temporaryAgent: message.temporaryAgent,
    taskRouteProposal: message.taskRouteProposal,
  });
  const runtimeContext = {
    slug: message.slug,
    threadId: message.threadId,
    threadName: message.threadName,
    agent: message.agent || message.agentId || "sancho",
    skill: message.skill,
    skills: normalizeArray(message.skills),
    scope: message.scope,
    skillMode,
    temporaryAgent: message.temporaryAgent === true,
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
    mcChatContext,
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

function opaquePathSegment(label, value) {
  const digest = createHash("sha256")
    .update(String(value || "unknown"), "utf8")
    .digest("hex")
    .slice(0, 24);
  return `${label}-${digest}`;
}

export function buildCodexWorkdir(
  message,
  runId,
  tempRoot = CODEX_PROCESS_TMP_ROOT,
) {
  if (typeof runId !== "string" || !runId.trim()) {
    throw new Error("Codex workdir requires a unique run id");
  }
  const root = path.resolve(tempRoot);
  const tenant = opaquePathSegment("tenant", message?.slug);
  const thread = opaquePathSegment("thread", message?.threadId);
  const run = opaquePathSegment("run", runId);
  const workdir = path.resolve(root, tenant, thread, run);
  if (!workdir.startsWith(`${root}${path.sep}`)) {
    throw new Error("Refusing Codex workdir outside the isolated temp root");
  }
  return workdir;
}

export async function cleanupCodexWorkdir(
  workdir,
  tempRoot = CODEX_PROCESS_TMP_ROOT,
) {
  const root = path.resolve(tempRoot);
  const target = path.resolve(workdir);
  const relativeTarget = path.relative(root, target);
  const segments = relativeTarget.split(path.sep);
  const isExactRunDirectory =
    relativeTarget &&
    !relativeTarget.startsWith(`..${path.sep}`) &&
    !relativeTarget.includes(`${path.sep}..${path.sep}`) &&
    segments.length === 3 &&
    /^tenant-[a-f0-9]{24}$/.test(segments[0]) &&
    /^thread-[a-f0-9]{24}$/.test(segments[1]) &&
    /^run-[a-f0-9]{24}$/.test(segments[2]);
  if (!isExactRunDirectory) {
    throw new Error("Refusing to remove a non-isolated Codex workdir");
  }
  await rm(target, { recursive: true, force: true, maxRetries: 2 });
  return true;
}

function codexAuthSourceDir(baseEnv = process.env) {
  const explicit = String(baseEnv.CODEX_AUTH_SOURCE_DIR || "").trim();
  if (explicit) return path.resolve(explicit);
  const configuredCodexHome = String(baseEnv.CODEX_HOME || "").trim();
  if (configuredCodexHome) return path.resolve(configuredCodexHome);
  const userHome = String(baseEnv.HOME || "").trim() || os.homedir();
  return path.resolve(userHome, ".codex");
}

export async function stageCodexAuthFiles(
  workdir,
  baseEnv = process.env,
  { signal } = {},
) {
  signal?.throwIfAborted();
  const sourceDir = codexAuthSourceDir(baseEnv);
  const targetDir = path.join(path.resolve(workdir), ".codex");
  await mkdir(targetDir, { recursive: true, mode: 0o700 });
  signal?.throwIfAborted();
  const copied = [];
  for (const filename of CODEX_AUTH_FILES) {
    signal?.throwIfAborted();
    const source = path.join(sourceDir, filename);
    let stat;
    try {
      stat = await lstat(source);
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    signal?.throwIfAborted();
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error(`Refusing non-regular Codex auth file: ${filename}`);
    }
    if (stat.size > CODEX_AUTH_FILE_MAX_BYTES) {
      throw new Error(`Codex auth file exceeds safe limit: ${filename}`);
    }
    const contents = await readFile(source);
    signal?.throwIfAborted();
    const target = path.join(targetDir, filename);
    await writeFile(target, contents, { mode: 0o600 });
    signal?.throwIfAborted();
    await chmod(target, 0o600);
    signal?.throwIfAborted();
    copied.push(filename);
  }
  return copied;
}

function copyAllowedEnv(target, source, keys) {
  for (const key of keys) {
    const value = source?.[key];
    if (typeof value === "string" && value.length > 0) target[key] = value;
  }
}

export function buildCodexChildEnv(
  runId,
  baseEnv = process.env,
  workdir = buildCodexWorkdir({}, runId),
) {
  const env = {};
  copyAllowedEnv(env, baseEnv, CODEX_CHILD_OS_ENV_KEYS);
  copyAllowedEnv(env, baseEnv, CODEX_PROVIDER_ENV_KEYS);
  Object.assign(env, {
    HOME: workdir,
    USERPROFILE: workdir,
    XDG_CONFIG_HOME: path.join(workdir, ".config"),
    CODEX_HOME: path.join(workdir, ".codex"),
    TMPDIR: workdir,
    TMP: workdir,
    TEMP: workdir,
    SANCHO_RUNTIME_RUN_ID: runId,
  });
  return env;
}

function appendOptionalArg(args, flag, keys) {
  const value = firstEnv(keys);
  if (value) args.push(flag, value);
}

export function buildCodexArgs(
  message,
  prompt,
  outputFile = "",
  workdir = bridgeWorkdir(),
) {
  const args = ["exec"];
  appendOptionalArg(args, "-m", ["CODEX_RUNTIME_MODEL"]);
  appendOptionalArg(args, "-p", ["CODEX_RUNTIME_PROFILE"]);
  appendOptionalArg(args, "--local-provider", ["CODEX_RUNTIME_LOCAL_PROVIDER"]);

  if (process.env.CODEX_RUNTIME_OSS === "1") args.push("--oss");
  args.push("-s", firstEnv(["CODEX_RUNTIME_SANDBOX"]) || "read-only");
  args.push("-C", workdir);
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
    ...callbackIdentity(message),
    role: "progress",
    agent: message.agent || message.agentId || "codex",
    event: {
      kind: "thinking",
      label,
      detail,
      target: runId,
    },
  }, message);
}

async function startCodexRun(message, runId, admittedEntry) {
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
  const command = firstEnv(["CODEX_CLI"]) || "codex";
  const workdir = buildCodexWorkdir(message, runId);
  const outputFile = path.join(workdir, "last-message.txt");
  const args = buildCodexArgs(message, prompt, outputFile, workdir);
  admittedEntry.workdir = workdir;
  const existing = activeRuns.get(message.threadId);
  if (admittedEntry.killed || existing !== admittedEntry) {
    return;
  }
  await stageCodexAuthFiles(workdir, process.env, {
    signal: admittedEntry.startupAbortController.signal,
  });
  const afterPrepare = activeRuns.get(message.threadId);
  if (admittedEntry.killed || afterPrepare !== admittedEntry) {
    await cleanupCodexWorkdir(workdir);
    return;
  }

  const child = spawn(command, args, {
    cwd: workdir,
    env: buildCodexChildEnv(runId, process.env, workdir),
    stdio: ["ignore", "pipe", "pipe"],
  });
  const entry = admittedEntry;
  entry.child = child;
  entry.workdir = workdir;
  entry.pending = false;
  activeRuns.set(message.threadId, entry);

  const cleanupWorkdir = () => {
    void cleanupCodexWorkdir(workdir).catch((error) => {
      console.error(
        "[codex bridge] isolated workdir cleanup failed:",
        error instanceof Error ? error.message : "unknown cleanup error",
      );
    });
  };

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
      text: "Codex did not finish the runtime turn before the timeout.",
      agent: message.agent || message.agentId || "codex",
      errorDetail: {
        category: "watchdog_abort",
        raw: `Codex runtime timed out after ${runTimeoutMs()}ms`,
        provider: "codex",
        classifiedAt: Date.now(),
      },
    }, "timeout");
  }, runTimeoutMs());

  postProgress(
    message,
    runId,
    "Codex received the turn",
    `context-pack=${contextPack?.verdict || (contextPack ? "ok" : "disabled")}; executing ${command} exec`,
  ).catch((e) => console.error("[codex bridge] progress webhook failed:", e.message));

  child.on("error", (e) => {
    clearTimeout(timeout);
    entry.killed = true;
    postTerminalOnce(message, {
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
    }, "error");
    cleanupWorkdir();
  });

  child.on("close", (code, signal) => {
    clearTimeout(timeout);
    if (entry.killed || entry.terminalPosted) {
      if (activeRuns.get(message.threadId) === entry) {
        activeRuns.delete(message.threadId);
      }
      cleanupWorkdir();
      return;
    }

    const fileOutput = fs.existsSync(outputFile) ? fs.readFileSync(outputFile, "utf8") : "";
    const cleanOutput = cleanCodexOutput(fileOutput || stdout);
    const cleanStderr = stripAnsi(stderr).trim();
    if (code === 0) {
      postTerminalOnce(message, {
        slug: message.slug,
        threadId: message.threadId,
        text: cleanOutput || "(Codex finished without text output.)",
        agent: message.agent || message.agentId || "codex",
      }, "final");
      cleanupWorkdir();
      return;
    }

    const raw = [cleanStderr, cleanOutput].filter(Boolean).join("\n\n").slice(0, 4096);
    const failure = classifyRuntimeCliFailure(raw, {
      provider: "codex",
      runtimeLabel: "Codex",
      exitCode: code,
      signal,
    });
    postTerminalOnce(message, {
      slug: message.slug,
      threadId: message.threadId,
      text: failure.text,
      agent: message.agent || message.agentId || "codex",
      errorDetail: {
        ...failure.errorDetail,
      },
    }, "failure");
    cleanupWorkdir();
  });
}

async function cancelThread(threadId, missionControlRunId) {
  const entry = activeRuns.get(threadId);
  if (!entry) return false;
  if (
    !missionControlRunId ||
    entry.missionControlRunId !== missionControlRunId
  ) return false;
  entry.killed = true;
  entry.startupAbortController?.abort();
  if (entry.child) {
    entry.child.kill("SIGTERM");
    setTimeout(() => entry.child.kill("SIGKILL"), 1000).unref();
    if (activeRuns.get(threadId) === entry) activeRuns.delete(threadId);
    return true;
  }

  await entry.startupPromise;
  if (entry.child) {
    entry.child.kill("SIGTERM");
    setTimeout(() => entry.child.kill("SIGKILL"), 1000).unref();
  }
  if (entry.workdir) await cleanupCodexWorkdir(entry.workdir);
  if (activeRuns.get(threadId) === entry) activeRuns.delete(threadId);
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
    const missionControlRunId =
      typeof message.missionControlRunId === "string"
        ? message.missionControlRunId.trim()
        : "";
    if (!missionControlRunId) {
      return json(res, 400, { error: "Missing missionControlRunId" });
    }
    const cancelled = await cancelThread(
      message.threadId,
      missionControlRunId,
    );
    return json(res, 200, { ok: true, cancelled });
  }

  if (Object.keys(terminalCallbackAuthorityHeaders(message)).length === 0) {
    return json(res, 400, {
      error: "Missing or expired terminal callback authority",
    });
  }

  if (activeRuns.has(message.threadId)) {
    return json(res, 409, { error: `Thread ${message.threadId} already has an active Codex run` });
  }

  const runId = `codex_${randomUUID()}`;
  const admittedEntry = {
    runId,
    missionControlRunId:
      typeof message.missionControlRunId === "string"
        ? message.missionControlRunId.trim()
        : undefined,
    child: null,
    killed: false,
    pending: true,
    terminalPosted: false,
    startupAbortController: new AbortController(),
    startupPromise: null,
  };
  activeRuns.set(message.threadId, admittedEntry);
  admittedEntry.startupPromise = startCodexRun(message, runId, admittedEntry).catch(async (e) => {
    if (admittedEntry.workdir) {
      try {
        await cleanupCodexWorkdir(admittedEntry.workdir);
      } catch (cleanupError) {
        console.error(
          "[codex bridge] startup cleanup failed:",
          cleanupError instanceof Error ? cleanupError.message : "unknown cleanup error",
        );
      }
    }
    if (admittedEntry.killed) return;
    postTerminalOnce(message, {
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
  const missionControlRunId =
    typeof body?.missionControlRunId === "string"
      ? body.missionControlRunId.trim()
      : "";
  if (!missionControlRunId) {
    return json(res, 400, { error: "Missing missionControlRunId" });
  }
  return json(res, 200, {
    ok: true,
    cancelled: await cancelThread(threadId, missionControlRunId),
  });
}

export function createServer() {
  terminalCallbackOutbox();
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
