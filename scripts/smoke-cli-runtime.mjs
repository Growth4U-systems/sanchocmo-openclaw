#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";

const root = process.cwd();
const runtimeArg = process.argv.find((arg) => arg.startsWith("--runtime="));
const runtime = runtimeArg?.split("=", 2)[1] || process.env.SMOKE_CLI_RUNTIME || "";
const runtimes = new Set(["claude-code", "codex", "hermes"]);

if (!runtimes.has(runtime)) {
  console.error("Usage: node scripts/smoke-cli-runtime.mjs --runtime=claude-code|codex|hermes");
  process.exit(1);
}

const hermesProvider =
  process.env.SMOKE_HERMES_PROVIDER || process.env.HERMES_CLI_PROVIDER || "";
const hermesModel =
  process.env.SMOKE_HERMES_MODEL || process.env.HERMES_CLI_MODEL || "";
if (
  runtime === "hermes" &&
  (!hermesProvider || hermesProvider === "auto" || !hermesModel)
) {
  console.error(
    "Hermes smoke requires an explicit provider and model. Set " +
    "SMOKE_HERMES_PROVIDER and SMOKE_HERMES_MODEL (or HERMES_CLI_PROVIDER " +
    "and HERMES_CLI_MODEL).",
  );
  process.exit(1);
}

const runtimeLabel = runtime === "claude-code"
  ? "Claude Code"
  : runtime === "hermes"
    ? "Hermes"
    : "Codex";
const runtimeAgent = runtime;
const expectedText =
  process.env.SMOKE_CLI_RUNTIME_EXPECTED ||
  (runtime === "claude-code"
    ? "sancho-claude-runtime-ok"
    : runtime === "hermes"
      ? "sancho-hermes-runtime-ok"
      : "sancho-codex-runtime-ok");
const artifactDir = path.join(root, ".context", "cli-runtime-smoke", runtime);
const workspace = path.join(artifactDir, "workspace");
const summaryFile = path.join(artifactDir, "latest.json");
const secret =
  process.env.SMOKE_CLI_RUNTIME_SECRET || randomBytes(32).toString("hex");
const adminToken =
  process.env.SMOKE_CLI_RUNTIME_ADMIN_TOKEN || randomBytes(32).toString("hex");
const terminalGrantSecret =
  process.env.SMOKE_CLI_RUNTIME_TERMINAL_GRANT_SECRET ||
  randomBytes(32).toString("hex");
const encryptionKey =
  process.env.SMOKE_CLI_RUNTIME_ENCRYPTION_KEY ||
  randomBytes(32).toString("hex");
const internalApiToken =
  process.env.SMOKE_CLI_RUNTIME_INTERNAL_API_TOKEN ||
  randomBytes(32).toString("hex");
for (const [name, value] of [
  ["SMOKE_CLI_RUNTIME_SECRET", secret],
  ["SMOKE_CLI_RUNTIME_ADMIN_TOKEN", adminToken],
  ["SMOKE_CLI_RUNTIME_TERMINAL_GRANT_SECRET", terminalGrantSecret],
  ["SMOKE_CLI_RUNTIME_ENCRYPTION_KEY", encryptionKey],
  ["SMOKE_CLI_RUNTIME_INTERNAL_API_TOKEN", internalApiToken],
]) {
  if (Buffer.byteLength(value, "utf8") < 32) {
    throw new Error(`${name} must be at least 32 bytes`);
  }
}
const slug = process.env.SMOKE_CLI_RUNTIME_SLUG || "smoke";
const threadShortId = process.env.SMOKE_CLI_RUNTIME_THREAD || `${runtimeAgent}-runtime`;
const threadId = `${slug}:${threadShortId}`;
const timeoutMs = positiveNumber(process.env.SMOKE_CLI_RUNTIME_TIMEOUT_MS, 240000);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function positiveNumber(value, fallback) {
  const parsed = Number(value || "");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

function requireExecutable(file, label) {
  if (!fs.existsSync(file)) {
    throw new Error(`${label} is missing. Run npm install, or symlink node_modules into this worktree.`);
  }
}

function requireNextBuild() {
  const buildId = path.join(root, ".next", "BUILD_ID");
  if (!fs.existsSync(buildId)) {
    throw new Error("Next production build is missing. Run npm run build before this smoke.");
  }
}

async function waitFor(url, label, timeout = 45000) {
  const started = Date.now();
  let lastError = "";
  while (Date.now() - started < timeout) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
      lastError = `HTTP ${res.status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    await sleep(400);
  }
  throw new Error(`${label} did not become ready: ${lastError}`);
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function setupWorkspace() {
  fs.rmSync(artifactDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(workspace, "brand", slug, "chat"), { recursive: true });
  fs.mkdirSync(path.join(workspace, "brand", slug, "company-brief"), { recursive: true });
  fs.mkdirSync(path.join(workspace, "brand", slug, "projects"), { recursive: true });
  fs.mkdirSync(path.join(workspace, "_system"), { recursive: true });

  fs.writeFileSync(
    path.join(workspace, "clients.json"),
    `${JSON.stringify(
      {
        adminToken,
        clients: [
          {
            slug,
            name: "Smoke Runtime",
            active: true,
            workspace,
            phase: 0,
            paths: { brand: `brand/${slug}` },
            metrics: { apis: [] },
            enabledFeatures: [],
          },
        ],
      },
      null,
      2,
    )}\n`,
  );

  fs.writeFileSync(
    path.join(workspace, "brand", slug, "company-brief", "company-brief.current.md"),
    [
      "# Company Brief - Smoke Runtime",
      "",
      "## 1. La Empresa",
      "",
      "**Nombre**: Smoke Runtime",
      "**Tipo**: Runtime smoke test",
      "**Modelo**: Validation fixture for Sancho runtime decoupling.",
      "",
      "## 3. Cliente Ideal",
      "",
      "**En una frase:** Sancho can delegate a chat turn to an interchangeable CLI runtime.",
      "",
    ].join("\n"),
  );
}

function startSancho(port, bridgePort) {
  const child = spawn(path.join(root, "node_modules", ".bin", "next"), ["start", "-p", String(port)], {
    cwd: root,
    env: {
      ...process.env,
      MC_WORKSPACE: workspace,
      MC_ADMIN_TOKEN: adminToken,
      MC_CHAT_SECRET: secret,
      // The smoke intentionally uses its isolated disposable JSON ledger.
      // Production itself remains fail-closed without Postgres.
      SANCHO_AGENT_RUNS_BACKEND: "json",
      SANCHO_AGENT_RUNS_ALLOW_NON_DURABLE: "true",
      SANCHO_RUNTIME: "external-http",
      SANCHO_EXTERNAL_GATEWAY_URL: `http://127.0.0.1:${bridgePort}`,
      SANCHO_EXTERNAL_INBOUND_PATH: "/sancho/inbound",
      SANCHO_EXTERNAL_HEALTH_PATH: "/healthz",
      SANCHO_EXTERNAL_SECRET: secret,
      SANCHO_RUNTIME_TERMINAL_GRANT_SECRET: terminalGrantSecret,
      NEXTAUTH_SECRET: terminalGrantSecret,
      ENCRYPTION_KEY: encryptionKey,
      SANCHO_INTERNAL_API_TOKEN: internalApiToken,
      LOCAL_DASHBOARD_BYPASS: "0",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return captureChild(child, "sancho");
}

function startBridge(port, sanchoPort) {
  const script = path.join(root, "docker", "runtimes", runtime, "bridge.mjs");
  const bridgeEnv = {
    ...process.env,
    MC_WORKSPACE: workspace,
    SANCHO_BASE_URL: `http://127.0.0.1:${sanchoPort}`,
    SANCHO_WEBHOOK_URL: `http://127.0.0.1:${sanchoPort}/api/chat/webhook`,
    SANCHO_CONTEXT_PACK_URL: `http://127.0.0.1:${sanchoPort}/api/chat/context-pack`,
    SANCHO_EXTERNAL_SECRET: secret,
    SANCHO_MCP_ENABLED: process.env.SMOKE_CLI_RUNTIME_MCP_ENABLED || "0",
    MC_CHAT_SECRET: secret,
    NEXT_TELEMETRY_DISABLED: "1",
  };

  if (runtime === "claude-code") {
    bridgeEnv.CLAUDE_CODE_BRIDGE_HOST = "127.0.0.1";
    bridgeEnv.CLAUDE_CODE_BRIDGE_PORT = String(port);
    bridgeEnv.CLAUDE_CODE_BRIDGE_SECRET = secret;
    bridgeEnv.CLAUDE_CODE_RUNTIME_TIMEOUT_MS = String(timeoutMs);
    bridgeEnv.CLAUDE_CODE_SANCHO_MCP_ENABLED = process.env.SMOKE_CLI_RUNTIME_MCP_ENABLED || "0";
    bridgeEnv.CLAUDE_CODE_RUNTIME_MODEL =
      process.env.SMOKE_CLAUDE_MODEL || process.env.CLAUDE_CODE_RUNTIME_MODEL || "haiku";
  } else if (runtime === "codex") {
    bridgeEnv.CODEX_BRIDGE_HOST = "127.0.0.1";
    bridgeEnv.CODEX_BRIDGE_PORT = String(port);
    bridgeEnv.CODEX_BRIDGE_SECRET = secret;
    bridgeEnv.CODEX_RUNTIME_TIMEOUT_MS = String(timeoutMs);
    bridgeEnv.CODEX_RUNTIME_SANDBOX = process.env.CODEX_RUNTIME_SANDBOX || "read-only";
    bridgeEnv.CODEX_RUNTIME_OUTPUT_DIR = path.join(artifactDir, "codex-output");
    if (process.env.SMOKE_CODEX_MODEL && !process.env.CODEX_RUNTIME_MODEL) {
      bridgeEnv.CODEX_RUNTIME_MODEL = process.env.SMOKE_CODEX_MODEL;
    }
  } else {
    bridgeEnv.HERMES_BRIDGE_HOST = "127.0.0.1";
    bridgeEnv.HERMES_BRIDGE_PORT = String(port);
    bridgeEnv.HERMES_BRIDGE_SECRET = secret;
    bridgeEnv.HERMES_RUN_TIMEOUT_MS = String(timeoutMs);
    bridgeEnv.HERMES_CLI_PROVIDER = hermesProvider;
    bridgeEnv.HERMES_CLI_MODEL = hermesModel;
    bridgeEnv.HERMES_CLI_TOOLSETS = "web,vision";
  }

  const child = spawn(process.execPath, [script], {
    cwd: root,
    env: bridgeEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return captureChild(child, runtime);
}

function captureChild(child, label) {
  const logs = [];
  child.stdout.on("data", (chunk) => logs.push(chunk.toString("utf8")));
  child.stderr.on("data", (chunk) => logs.push(chunk.toString("utf8")));
  child.once("exit", (code, signal) => {
    logs.push(`[${label}] exited code=${code} signal=${signal}\n`);
  });
  return { child, logs, label };
}

async function stopChild(processInfo) {
  const child = processInfo?.child;
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    sleep(3000).then(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
    }),
  ]);
}

async function waitForThread(threadFile) {
  const started = Date.now();
  let lastThread = null;
  while (Date.now() - started < timeoutMs) {
    if (fs.existsSync(threadFile)) {
      const data = readJson(threadFile, { messages: [] });
      lastThread = data;
      const messages = Array.isArray(data.messages) ? data.messages : [];
      const bot = messages.findLast((message) => message.role === "bot");
      if (bot && String(bot.text || "").includes(expectedText)) return data;
    }
    await sleep(500);
  }
  const lastBot = Array.isArray(lastThread?.messages)
    ? lastThread.messages.filter((message) => message.role === "bot").at(-1)
    : null;
  throw new Error(
    `thread did not receive expected bot text ${JSON.stringify(expectedText)}${
      lastBot ? `; last bot text: ${JSON.stringify(lastBot.text)}` : ""
    }`,
  );
}

async function waitForCompletedRun(runsFile) {
  const started = Date.now();
  let latestRun = null;
  let runs = null;
  while (Date.now() - started < timeoutMs) {
    runs = readJson(runsFile, null);
    latestRun = Array.isArray(runs?.runs)
      ? runs.runs.filter((run) => run.threadId === threadId).at(-1)
      : null;
    const hasTerminalEvent = Array.isArray(runs?.events)
      && runs.events.some(
        (event) => event.runId === latestRun?.id && event.type === "bot_reply",
      );
    if (
      latestRun?.runtime === "external-http"
      && latestRun.status === "completed"
      && typeof latestRun.finishedAt === "string"
      && hasTerminalEvent
    ) {
      return { runs, latestRun };
    }
    await sleep(300);
  }
  throw new Error(`agent run did not complete: ${JSON.stringify(latestRun)}`);
}

async function main() {
  requireExecutable(path.join(root, "node_modules", ".bin", "next"), "next");
  requireNextBuild();
  setupWorkspace();

  const sanchoPort = await freePort();
  const bridgePort = await freePort();
  const sancho = startSancho(sanchoPort, bridgePort);
  const bridge = startBridge(bridgePort, sanchoPort);

  try {
    await waitFor(`http://127.0.0.1:${sanchoPort}/api/health`, "Sancho");
    await waitFor(`http://127.0.0.1:${bridgePort}/healthz`, `${runtimeLabel} bridge`);

    const sendBody = {
      slug,
      threadId,
      threadName: `${runtimeLabel} runtime smoke`,
      agent: runtimeAgent,
      text: `Smoke test for Sancho runtime decoupling. Reply exactly with: ${expectedText}`,
      userName: "Smoke",
      userId: "smoke-user",
    };
    const unauthenticated = await fetch(
      `http://127.0.0.1:${sanchoPort}/api/chat/send`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sendBody),
      },
    );
    await unauthenticated.text();
    if (unauthenticated.status !== 403) {
      throw new Error(
        `unauthenticated /api/chat/send must fail closed, got HTTP ${unauthenticated.status}`,
      );
    }

    const sendRes = await fetch(`http://127.0.0.1:${sanchoPort}/api/chat/send`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(sendBody),
    });
    const sendText = await sendRes.text();
    if (!sendRes.ok) {
      throw new Error(`/api/chat/send failed HTTP ${sendRes.status}: ${sendText}`);
    }

    const threadFile = path.join(workspace, "brand", slug, "chat", `${threadShortId}.json`);
    const thread = await waitForThread(threadFile);
    const runsFile = path.join(workspace, "_system", "agent-runs.json");
    const { runs, latestRun } = await waitForCompletedRun(runsFile);
    const messages = thread.messages.map((message) => ({
      role: message.role,
      agent: message.agent,
      text: message.text,
      progressCount: Array.isArray(message.progress) ? message.progress.length : 0,
      errorDetail: message.errorDetail,
    }));

    const summary = {
      ok: true,
      runtime,
      expectedText,
      sanchoPort,
      bridgePort,
      workspace,
      unauthenticatedStatus: unauthenticated.status,
      sendResponse: JSON.parse(sendText),
      latestRun: {
        id: latestRun.id,
        runtime: latestRun.runtime,
        status: latestRun.status,
        agent: latestRun.agent,
        startedAt: latestRun.startedAt,
        finishedAt: latestRun.finishedAt,
      },
      runEvents: Array.isArray(runs?.events)
        ? runs.events
            .filter((event) => event.threadId === threadId)
            .map((event) => ({ type: event.type, threadId: event.threadId }))
        : [],
      threadMessages: messages,
      sanchoLogTail: sancho.logs.join("").split("\n").slice(-30),
      bridgeLogTail: bridge.logs.join("").split("\n").slice(-30),
    };

    fs.mkdirSync(artifactDir, { recursive: true });
    fs.writeFileSync(summaryFile, `${JSON.stringify(summary, null, 2)}\n`);
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await stopChild(bridge);
    await stopChild(sancho);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack || err.message : String(err));
  process.exit(1);
});
