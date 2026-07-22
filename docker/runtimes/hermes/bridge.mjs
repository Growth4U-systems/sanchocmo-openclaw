#!/usr/bin/env node
import http from "node:http";
import { spawn } from "node:child_process";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { chmod, lstat, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
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
// OpenClaw reserves 18791 for browser control inside the Sancho container.
const DEFAULT_PORT = 18795;
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
const DEFAULT_CONTEXT_PACK_TIMEOUT_MS = 5000;
const SAFE_HERMES_TOOLSETS = Object.freeze(["web", "vision"]);
const UNSAFE_TOOLSETS_OPT_IN = "HERMES_UNSAFE_ALLOW_DANGEROUS_TOOLSETS";
const HERMES_PROCESS_TMP_ROOT = resolve(
  tmpdir(),
  `sancho-hermes-${process.pid}-${randomUUID()}`,
);
const HERMES_AUTH_FILES = Object.freeze([
  "auth.json",
  ".anthropic_oauth.json",
]);
const HERMES_AUTH_FILE_MAX_BYTES = 2 * 1024 * 1024;

// Only operating-system plumbing required to start the CLI is inherited.
// In particular, application/database/session secrets never cross the runtime
// boundary merely because they happen to exist in the Sancho process.
const HERMES_CHILD_OS_ENV_KEYS = Object.freeze([
  "PATH",
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
  "HERMES_CA_BUNDLE",
]);

// Provider credentials are selected by the explicit Hermes provider. Never
// forward every *_KEY / *_TOKEN variable: doing so exposes unrelated provider
// and application credentials to model-invoked tools.
const HERMES_PROVIDER_ENV_KEYS = Object.freeze({
  anthropic: [
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_TOKEN",
    "CLAUDE_CODE_OAUTH_TOKEN",
    "ANTHROPIC_BASE_URL",
    "ANTHROPIC_AUTH_MODE",
  ],
  openrouter: ["OPENROUTER_API_KEY", "OPENROUTER_BASE_URL"],
  nous: ["NOUS_API_KEY", "NOUS_PORTAL_BASE_URL", "NOUS_INFERENCE_BASE_URL"],
  openai: ["OPENAI_API_KEY", "OPENAI_BASE_URL", "OPENAI_AUTH_MODE"],
  "openai-codex": ["OPENAI_API_KEY", "OPENAI_BASE_URL", "OPENAI_AUTH_MODE"],
  fireworks: ["FIREWORKS_API_KEY", "FIREWORKS_BASE_URL"],
  gemini: ["GOOGLE_API_KEY", "GEMINI_API_KEY", "GEMINI_BASE_URL"],
  xai: ["XAI_API_KEY", "XAI_BASE_URL"],
  zai: ["GLM_API_KEY", "ZAI_API_KEY", "Z_AI_API_KEY", "GLM_BASE_URL"],
  "kimi-coding": ["KIMI_API_KEY", "KIMI_CODING_API_KEY", "KIMI_BASE_URL"],
  "kimi-coding-cn": ["KIMI_CN_API_KEY"],
  stepfun: ["STEPFUN_API_KEY", "STEPFUN_BASE_URL"],
  arcee: ["ARCEEAI_API_KEY", "ARCEE_BASE_URL"],
  minimax: ["MINIMAX_API_KEY", "MINIMAX_BASE_URL"],
  "minimax-cn": ["MINIMAX_CN_API_KEY", "MINIMAX_CN_BASE_URL"],
  deepseek: ["DEEPSEEK_API_KEY", "DEEPSEEK_BASE_URL"],
  nvidia: ["NVIDIA_API_KEY", "NVIDIA_BASE_URL"],
  kilocode: ["KILOCODE_API_KEY", "KILOCODE_BASE_URL"],
  huggingface: ["HF_TOKEN", "HF_BASE_URL"],
  xiaomi: ["XIAOMI_API_KEY", "XIAOMI_BASE_URL"],
  "ollama-cloud": ["OLLAMA_API_KEY", "OLLAMA_BASE_URL"],
  copilot: [
    "COPILOT_GITHUB_TOKEN",
    "GH_TOKEN",
    "GITHUB_TOKEN",
    "COPILOT_API_BASE_URL",
  ],
  "copilot-acp": [
    "COPILOT_GITHUB_TOKEN",
    "GH_TOKEN",
    "GITHUB_TOKEN",
    "COPILOT_ACP_BASE_URL",
  ],
  bedrock: [
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_SESSION_TOKEN",
    "AWS_REGION",
    "AWS_DEFAULT_REGION",
    "BEDROCK_BASE_URL",
  ],
});
const activeRuns = new Map();
const callbackOutboxes = new Map();

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
  // Context-pack and callbacks belong to the exact transport that admitted
  // the parent run. A second outbound-only secret would never match the
  // immutable digest stored by Mission Control and would strand every run.
  return secret();
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
  const directory = resolveCallbackOutboxDir("hermes");
  let outbox = callbackOutboxes.get(directory);
  if (!outbox) {
    outbox = createCallbackOutbox({
      runtimeId: "hermes",
      directory,
      logger(event) {
        if (event.event !== "retry_scheduled" && event.event !== "expired") return;
        const status = event.status ? ` status=${event.status}` : "";
        console.warn(
          `[hermes bridge] terminal callback ${event.event}` +
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
      `[hermes bridge] ${label} terminal callback could not be persisted:`,
      error instanceof Error ? error.message : "unknown outbox error",
    );
    return false;
  }
  entry.terminalPosted = true;
  if (activeRuns.get(message.threadId) === entry) activeRuns.delete(message.threadId);
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
    runtimeId: "hermes",
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

function normalizeToolsets(value) {
  return uniqueStrings(
    String(value || "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter((item) => /^[a-z][a-z0-9_-]*$/.test(item)),
  );
}

function isRestrictedHermesTurn(message) {
  return (
    message?.readOnly === true ||
    message?.controlDepth === 1 ||
    message?.temporaryAgent === true ||
    message?.temporary === true
  );
}

export function resolveHermesToolsets(message, baseEnv = process.env) {
  // Diagnostic, control-depth and temporary turns are unconditionally pinned
  // to the non-mutating surface. An unsafe process-wide opt-in cannot widen
  // these run-level restrictions.
  if (isRestrictedHermesTurn(message)) return SAFE_HERMES_TOOLSETS.join(",");

  const configured = normalizeToolsets(baseEnv.HERMES_CLI_TOOLSETS);
  if (configured.length === 0) return SAFE_HERMES_TOOLSETS.join(",");

  const dangerous = configured.filter(
    (toolset) => !SAFE_HERMES_TOOLSETS.includes(toolset),
  );
  if (dangerous.length > 0 && baseEnv[UNSAFE_TOOLSETS_OPT_IN] !== "1") {
    throw new Error(
      `Unsafe Hermes toolsets denied: ${dangerous.join(", ")}. ` +
      `Remove them or explicitly set ${UNSAFE_TOOLSETS_OPT_IN}=1 for unrestricted primary turns.`,
    );
  }
  return configured.join(",");
}

export function buildHermesArgs(message, prompt, baseEnv = process.env) {
  const args = [
    "chat",
    "-Q",
    "--source",
    "sancho",
    // The Sancho context pack is the sole policy/configuration input. Do not
    // import host-level Hermes rules, hooks, plugins or default toolsets.
    "--ignore-user-config",
    "--ignore-rules",
  ];
  // Sancho skills are runtime-neutral and travel in the context pack. Only
  // explicitly configured Hermes-native skills may be passed to the CLI.
  const nativeSkills = baseEnv.HERMES_CLI_SKILLS?.trim();
  if (nativeSkills) args.push("-s", nativeSkills);
  if (baseEnv.HERMES_CLI_PROVIDER) {
    args.push("--provider", baseEnv.HERMES_CLI_PROVIDER);
  }
  if (baseEnv.HERMES_CLI_MODEL) args.push("--model", baseEnv.HERMES_CLI_MODEL);
  args.push("--toolsets", resolveHermesToolsets(message, baseEnv));
  args.push("-q", prompt);
  return args;
}

function opaquePathSegment(label, value) {
  const digest = createHash("sha256")
    .update(String(value || "unknown"), "utf8")
    .digest("hex")
    .slice(0, 24);
  return `${label}-${digest}`;
}

export function buildHermesWorkdir(
  message,
  runId,
  tempRoot = HERMES_PROCESS_TMP_ROOT,
) {
  if (typeof runId !== "string" || !runId.trim()) {
    throw new Error("Hermes workdir requires a unique run id");
  }
  const root = resolve(tempRoot);
  const tenant = opaquePathSegment("tenant", message?.slug);
  const thread = opaquePathSegment("thread", message?.threadId);
  const run = opaquePathSegment("run", runId);
  const workdir = resolve(root, tenant, thread, run);
  if (!workdir.startsWith(`${root}${sep}`)) {
    throw new Error("Refusing Hermes workdir outside the isolated temp root");
  }
  return workdir;
}

export async function cleanupHermesWorkdir(
  workdir,
  tempRoot = HERMES_PROCESS_TMP_ROOT,
) {
  const root = resolve(tempRoot);
  const target = resolve(workdir);
  const relativeTarget = relative(root, target);
  const segments = relativeTarget.split(sep);
  const isExactRunDirectory =
    relativeTarget &&
    !relativeTarget.startsWith(`..${sep}`) &&
    !relativeTarget.includes(`${sep}..${sep}`) &&
    segments.length === 3 &&
    /^tenant-[a-f0-9]{24}$/.test(segments[0]) &&
    /^thread-[a-f0-9]{24}$/.test(segments[1]) &&
    /^run-[a-f0-9]{24}$/.test(segments[2]);
  if (!isExactRunDirectory) {
    throw new Error("Refusing to remove a non-isolated Hermes workdir");
  }
  await rm(target, { recursive: true, force: true, maxRetries: 2 });
  return true;
}

function hermesAuthSourceDir(baseEnv = process.env) {
  const explicit = String(baseEnv.HERMES_AUTH_SOURCE_DIR || "").trim();
  if (explicit) return resolve(explicit);
  const configuredHermesHome = String(baseEnv.HERMES_HOME || "").trim();
  if (configuredHermesHome) return resolve(configuredHermesHome);
  const userHome = String(baseEnv.HOME || "").trim() || homedir();
  return resolve(userHome, ".hermes");
}

/**
 * Copy only Hermes' credential stores into the isolated per-turn home. Rules,
 * hooks, memories, sessions and plugins remain excluded, while an existing
 * `hermes auth` login keeps working after the isolation boundary is enabled.
 */
export async function stageHermesAuthFiles(
  workdir,
  baseEnv = process.env,
  { signal } = {},
) {
  signal?.throwIfAborted();
  const sourceDir = hermesAuthSourceDir(baseEnv);
  const targetDir = join(resolve(workdir), ".hermes");
  await mkdir(targetDir, { recursive: true, mode: 0o700 });
  signal?.throwIfAborted();
  const copied = [];
  for (const filename of HERMES_AUTH_FILES) {
    signal?.throwIfAborted();
    const source = join(sourceDir, filename);
    let stat;
    try {
      stat = await lstat(source);
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    signal?.throwIfAborted();
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error(`Refusing non-regular Hermes auth file: ${filename}`);
    }
    if (stat.size > HERMES_AUTH_FILE_MAX_BYTES) {
      throw new Error(`Hermes auth file exceeds safe limit: ${filename}`);
    }
    const contents = await readFile(source);
    signal?.throwIfAborted();
    const target = join(targetDir, filename);
    await writeFile(target, contents, { mode: 0o600 });
    signal?.throwIfAborted();
    await chmod(target, 0o600);
    signal?.throwIfAborted();
    copied.push(filename);
  }
  return copied;
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

function copyAllowedEnv(target, source, keys) {
  for (const key of keys) {
    const value = source?.[key];
    if (typeof value === "string" && value.length > 0) target[key] = value;
  }
}

export function buildHermesChildEnv(
  message,
  runId,
  baseEnv = process.env,
  workdir = buildHermesWorkdir(message, runId),
) {
  const env = {};
  copyAllowedEnv(env, baseEnv, HERMES_CHILD_OS_ENV_KEYS);

  const provider = String(baseEnv.HERMES_CLI_PROVIDER || "").trim().toLowerCase();
  copyAllowedEnv(env, baseEnv, HERMES_PROVIDER_ENV_KEYS[provider] || []);

  if (provider === "anthropic" && !env.ANTHROPIC_API_KEY) {
    // Sancho's public credential names differ from the names Hermes consumes.
    // Translate only the selected Anthropic credential instead of inheriting
    // the full parent environment.
    if (
      !env.ANTHROPIC_TOKEN &&
      typeof baseEnv.ANTHROPIC_AUTH_TOKEN === "string" &&
      baseEnv.ANTHROPIC_AUTH_TOKEN.length > 0
    ) {
      env.ANTHROPIC_TOKEN = baseEnv.ANTHROPIC_AUTH_TOKEN;
    }
    if (
      !env.CLAUDE_CODE_OAUTH_TOKEN &&
      typeof baseEnv.ANTHROPIC_OAUTH_TOKEN === "string" &&
      baseEnv.ANTHROPIC_OAUTH_TOKEN.length > 0
    ) {
      env.CLAUDE_CODE_OAUTH_TOKEN = baseEnv.ANTHROPIC_OAUTH_TOKEN;
    }
  }

  Object.assign(env, {
    // Keep Hermes config, sessions, logs and temporary files inside this
    // tenant/thread directory instead of ~/.hermes or /root/.openclaw.
    HOME: workdir,
    USERPROFILE: workdir,
    XDG_CONFIG_HOME: join(workdir, ".config"),
    HERMES_HOME: join(workdir, ".hermes"),
    TMPDIR: workdir,
    TMP: workdir,
    TEMP: workdir,
    HERMES_SANCHO_RUN_ID: runId,
    SANCHO_RUNTIME: "hermes",
    SANCHO_CHAT_SLUG: message.slug || "",
    SANCHO_CHAT_THREAD_ID: message.threadId || "",
    SANCHO_CHAT_AGENT: message.agent || message.agentId || "hermes",
    SANCHO_CHAT_READ_ONLY: message.readOnly === true ? "1" : "0",
    SANCHO_CHAT_CONTROL_DEPTH: message.controlDepth === 1 ? "1" : "0",
    SANCHO_CHAT_TEMPORARY_AGENT:
      message.temporaryAgent === true || message.temporary === true ? "1" : "0",
  });

  // Claude Code OAuth belongs to the local Claude runtime. If Hermes has an
  // explicit Anthropic API key, letting that OAuth leak into the child makes
  // Hermes prefer the unrelated subscription credential instead.
  if (
    baseEnv.HERMES_CLI_PROVIDER === "anthropic" &&
    baseEnv.ANTHROPIC_API_KEY
  ) {
    delete env.CLAUDE_CODE_OAUTH_TOKEN;
  }

  return env;
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
  }, message);
}

async function startHermesRun(message, runId, admittedEntry, dependencies) {
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
  const workdir = buildHermesWorkdir(message, runId);
  admittedEntry.workdir = workdir;
  const existing = activeRuns.get(message.threadId);
  if (admittedEntry.killed || existing !== admittedEntry) {
    return;
  }
  await dependencies.stageAuthFiles(workdir, process.env, {
    signal: admittedEntry.startupAbortController.signal,
  });
  // Auth staging yields to the event loop. Re-check the exact admission
  // immediately before spawn so a /stop received during preparation cannot
  // resurrect the cancelled run.
  const afterPrepare = activeRuns.get(message.threadId);
  if (admittedEntry.killed || afterPrepare !== admittedEntry) {
    await cleanupHermesWorkdir(workdir);
    return;
  }
  const child = dependencies.spawnProcess(command, args, {
    cwd: workdir,
    env: buildHermesChildEnv(message, runId, process.env, workdir),
    stdio: ["ignore", "pipe", "pipe"],
  });
  const entry = admittedEntry;
  entry.child = child;
  entry.workdir = workdir;
  entry.pending = false;
  activeRuns.set(message.threadId, entry);

  const cleanupWorkdir = () => {
    void cleanupHermesWorkdir(workdir).catch((error) => {
      console.error(
        "[hermes bridge] isolated workdir cleanup failed:",
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
    cleanupWorkdir();
  });

  child.on("close", (code, signal) => {
    clearTimeout(timeout);
    if (entry.killed || entry.terminalPosted) {
      cleanupWorkdir();
      return;
    }

    const cleanStdout = cleanHermesStdout(stdout);
    const cleanStderr = stripAnsi(stderr).trim();
    if (code === 0) {
      postTerminalOnce(message, {
        slug: message.slug,
        threadId: message.threadId,
        text: cleanStdout || "(Hermes terminó sin texto de salida.)",
        agent: message.agent || message.agentId || "hermes",
      }, "final");
      cleanupWorkdir();
      return;
    }

    const raw = [cleanStderr, cleanStdout].filter(Boolean).join("\n\n").slice(0, 4096);
    const failure = classifyRuntimeCliFailure(raw, {
      provider: "hermes",
      runtimeLabel: "Hermes",
      exitCode: code,
      signal,
    });
    postTerminalOnce(message, {
      slug: message.slug,
      threadId: message.threadId,
      text: failure.text,
      agent: message.agent || message.agentId || "hermes",
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

  // Cancellation is not acknowledged until every asynchronous startup step
  // has settled. Otherwise an already-issued mkdir/write can complete after a
  // successful response and briefly recreate a cancelled execution.
  await entry.startupPromise;
  if (entry.child) {
    entry.child.kill("SIGTERM");
    setTimeout(() => entry.child.kill("SIGKILL"), 1000).unref();
  }
  if (entry.workdir) await cleanupHermesWorkdir(entry.workdir);
  if (activeRuns.get(threadId) === entry) activeRuns.delete(threadId);
  return true;
}

async function handleInbound(req, res, dependencies) {
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
    return json(res, 409, { error: `Thread ${message.threadId} already has an active Hermes run` });
  }

  const runId = `hermes_${randomUUID()}`;
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
  admittedEntry.startupPromise = startHermesRun(
    message,
    runId,
    admittedEntry,
    dependencies,
  ).catch(async (e) => {
    if (admittedEntry.workdir) {
      try {
        await cleanupHermesWorkdir(admittedEntry.workdir);
      } catch (cleanupError) {
        console.error(
          "[hermes bridge] startup cleanup failed:",
          cleanupError instanceof Error ? cleanupError.message : "unknown cleanup error",
        );
      }
    }
    if (admittedEntry.killed) return;
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

export function createServer({
  stageAuthFiles = stageHermesAuthFiles,
  spawnProcess = spawn,
} = {}) {
  const dependencies = { stageAuthFiles, spawnProcess };
  // Starting the bridge also replays any terminal callback persisted by a
  // previous process before it crashed or restarted.
  terminalCallbackOutbox();
  return http.createServer((req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (req.method === "GET" && url.pathname === "/healthz") {
      return json(res, 200, { ok: true, activeRuns: activeRuns.size });
    }
    if (req.method === "POST" && url.pathname === "/sancho/inbound") {
      handleInbound(req, res, dependencies).catch((e) => json(res, 500, { error: e.message || String(e) }));
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
