import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import {
  buildClaudeArgs,
  buildClaudeChildEnv,
  buildClaudePrompt,
  buildClaudeWorkdir,
  buildMcpConfig,
  cleanupClaudeWorkdir,
  cleanClaudeStdout,
  createServer,
  fetchContextPack,
  stageClaudeAuthFiles,
} from "./bridge.mjs";

const terminalCallbackGrant = `${"a".repeat(24)}.${"b".repeat(43)}`;
const terminalCallbackAuthority = (runtimeToolCapability) => ({
  runtimeToolCapability,
  runtimeTerminalCallbackGrant: terminalCallbackGrant,
  runtimeTerminalCallbackGrantExpiresAt: "2099-01-01T00:00:00.000Z",
});

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address()));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

function waitFor(predicate, timeoutMs = 2000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (predicate()) return resolve();
      if (Date.now() - started > timeoutMs) return reject(new Error("timed out"));
      setTimeout(tick, 25);
    };
    tick();
  });
}

function restoreEnv(previous) {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

test("buildClaudePrompt preserves Sancho routing metadata", () => {
  const prompt = buildClaudePrompt(
    {
      slug: "acme",
      threadId: "acme:content:123",
      threadName: "Content draft",
      text: "Revisa este draft",
      agent: "dulcinea",
      skill: "seo-content",
      skills: ["seo-content", "content-review"],
      docPath: "brand/acme/content/draft.md",
      senderRole: "admin",
    },
    {
      slug: "acme",
      skill: "seo-content",
      verdict: "ok",
      summary: "Brand context summary",
    },
  );

  assert.match(prompt, /Claude Code runtime for Sancho/);
  assert.match(prompt, /runtime_id: claude-code/);
  assert.match(prompt, /"threadId": "acme:content:123"/);
  assert.match(prompt, /"agent": "dulcinea"/);
  assert.match(prompt, /ORDEN DE DECISIÓN OBLIGATORIO/);
  assert.match(prompt, /:::sancho-intervene/);
  assert.match(prompt, /:::task-route/);
  assert.match(prompt, /"docPath": "brand\/acme\/content\/draft.md"/);
  assert.match(prompt, /Sancho context pack/);
  assert.match(prompt, /Brand context summary/);
  assert.match(prompt, /Revisa este draft/);
});

test("temporary Sancho in Claude Code cannot receive cession markers", () => {
  const prompt = buildClaudePrompt({
    slug: "acme",
    threadId: "acme:task:1",
    text: "Diagnostica",
    agent: "sancho",
    temporaryAgent: true,
  });
  assert.match(prompt, /temporary_intervention: true/);
  assert.doesNotMatch(prompt, /:::delegate\n/);
  assert.doesNotMatch(prompt, /:::task-route\n/);
});

test("Claude Code receives the closed durable-effect envelope for writable root admin turns", () => {
  const prompt = buildClaudePrompt({
    slug: "acme",
    threadId: "acme:leads",
    text: "Busca founders",
    userId: "mc-admin",
    isAdmin: true,
    senderRole: "admin",
    readOnly: false,
    controlDepth: 0,
    runtimeEffectIntent: ["leads_search_start"],
  });
  assert.match(prompt, /:::sancho-effect/);
  assert.match(prompt, /leads_search_start/);
  assert.doesNotMatch(prompt, /runtimeToolCapability/);
});

test("buildMcpConfig is opt-in when only Sancho base URL exists", () => {
  const previous = {
    SANCHO_BASE_URL: process.env.SANCHO_BASE_URL,
    CLAUDE_CODE_SANCHO_MCP_URL: process.env.CLAUDE_CODE_SANCHO_MCP_URL,
    SANCHO_MCP_URL: process.env.SANCHO_MCP_URL,
    CLAUDE_CODE_SANCHO_MCP_ENABLED: process.env.CLAUDE_CODE_SANCHO_MCP_ENABLED,
    SANCHO_MCP_ENABLED: process.env.SANCHO_MCP_ENABLED,
  };
  process.env.SANCHO_BASE_URL = "http://localhost:3000";
  delete process.env.CLAUDE_CODE_SANCHO_MCP_URL;
  delete process.env.SANCHO_MCP_URL;
  delete process.env.CLAUDE_CODE_SANCHO_MCP_ENABLED;
  delete process.env.SANCHO_MCP_ENABLED;

  try {
    assert.equal(buildMcpConfig(), null);
  } finally {
    restoreEnv(previous);
  }
});

test("buildMcpConfig maps Sancho MCP URL and token", () => {
  const previous = {
    CLAUDE_CODE_SANCHO_MCP_URL: process.env.CLAUDE_CODE_SANCHO_MCP_URL,
    CLAUDE_CODE_SANCHO_MCP_TOKEN: process.env.CLAUDE_CODE_SANCHO_MCP_TOKEN,
    CLAUDE_CODE_SANCHO_MCP_SERVER: process.env.CLAUDE_CODE_SANCHO_MCP_SERVER,
    SANCHO_BASE_URL: process.env.SANCHO_BASE_URL,
    SANCHO_MCP_URL: process.env.SANCHO_MCP_URL,
    SANCHO_MCP_TOKEN: process.env.SANCHO_MCP_TOKEN,
  };
  process.env.CLAUDE_CODE_SANCHO_MCP_URL = "http://localhost:3000/api/mcp/sancho";
  process.env.CLAUDE_CODE_SANCHO_MCP_TOKEN = "test-token";
  process.env.CLAUDE_CODE_SANCHO_MCP_SERVER = "sancho";

  try {
    assert.deepEqual(buildMcpConfig(), {
      mcpServers: {
        sancho: {
          type: "http",
          url: "http://localhost:3000/api/mcp/sancho",
          headers: {
            Authorization: "Bearer test-token",
          },
        },
      },
    });
  } finally {
    restoreEnv(previous);
  }
});

test("fetchContextPack calls Sancho with transport and run authority", async () => {
  const previous = {
    CLAUDE_CODE_CONTEXT_PACK_URL: process.env.CLAUDE_CODE_CONTEXT_PACK_URL,
    CLAUDE_CODE_BRIDGE_SECRET: process.env.CLAUDE_CODE_BRIDGE_SECRET,
    CLAUDE_CODE_SANCHO_SECRET: process.env.CLAUDE_CODE_SANCHO_SECRET,
    CLAUDE_CODE_CONTEXT_PACK_ENABLED: process.env.CLAUDE_CODE_CONTEXT_PACK_ENABLED,
  };
  const calls = [];
  const server = http.createServer((req, res) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      calls.push({ path: req.url, headers: req.headers, body: JSON.parse(raw) });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ slug: "acme", skill: "seo-content", verdict: "ok" }));
    });
  });
  const address = await listen(server);
  process.env.CLAUDE_CODE_CONTEXT_PACK_URL = `http://127.0.0.1:${address.port}/api/chat/context-pack`;
  process.env.CLAUDE_CODE_BRIDGE_SECRET = "transport-secret";
  process.env.CLAUDE_CODE_SANCHO_SECRET = "must-not-override-transport";
  delete process.env.CLAUDE_CODE_CONTEXT_PACK_ENABLED;

  try {
    const runtimeToolCapability = "e".repeat(64);
    const pack = await fetchContextPack({
      slug: "acme",
      missionControlRunId: "run_mc_claude_context",
      runtimeToolCapability,
      skill: "seo-content",
    });

    assert.deepEqual(pack, { slug: "acme", skill: "seo-content", verdict: "ok" });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].path, "/api/chat/context-pack");
    assert.equal(calls[0].headers["x-mc-secret"], "transport-secret");
    assert.equal(
      calls[0].headers["x-mission-control-run-id"],
      "run_mc_claude_context",
    );
    assert.equal(
      calls[0].headers["x-sancho-run-capability"],
      runtimeToolCapability,
    );
    assert.deepEqual(calls[0].body, {});
  } finally {
    await close(server);
    restoreEnv(previous);
  }
});

test("buildClaudeArgs wires print mode, Sancho MCP, and safe tool defaults", () => {
  const previous = {
    CLAUDE_CODE_SANCHO_MCP_SERVER: process.env.CLAUDE_CODE_SANCHO_MCP_SERVER,
    CLAUDE_CODE_RUNTIME_MODEL: process.env.CLAUDE_CODE_RUNTIME_MODEL,
  };
  process.env.CLAUDE_CODE_SANCHO_MCP_SERVER = "sancho";
  process.env.CLAUDE_CODE_RUNTIME_MODEL = "sonnet";

  try {
    const args = buildClaudeArgs(
      { threadId: "acme:general" },
      "hello",
      {
        mcpServers: {
          sancho: {
            type: "http",
            url: "http://localhost:3000/api/mcp/sancho",
          },
        },
      },
    );

    assert.deepEqual(args.slice(0, 4), ["-p", "hello", "--output-format", "json"]);
    assert.ok(args.includes("--model"));
    assert.ok(args.includes("sonnet"));
    assert.ok(args.includes("--tools"));
    assert.equal(args[args.indexOf("--tools") + 1], "");
    assert.equal(args[args.indexOf("--setting-sources") + 1], "local");
    assert.ok(args.includes("--disable-slash-commands"));
    assert.ok(args.includes("--no-session-persistence"));
    assert.ok(args.includes("--strict-mcp-config"));
    assert.equal(args[args.indexOf("--allowedTools") + 1], "mcp__sancho__*");
  } finally {
    restoreEnv(previous);
  }
});

test("Claude Code child runs in an isolated directory with provider-only auth", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sancho-claude-boundary-"));
  const connectorState = path.join(root, "runtime-connector");
  const authSource = path.join(root, "host-claude-auth");
  const tempRoot = path.join(root, "model-runs");
  const outbox = path.join(connectorState, "callback-outbox");
  fs.mkdirSync(authSource, { recursive: true, mode: 0o700 });
  fs.mkdirSync(outbox, { recursive: true, mode: 0o700 });
  fs.writeFileSync(
    path.join(authSource, ".credentials.json"),
    '{"oauthAccount":"subscription"}',
    { mode: 0o600 },
  );
  fs.writeFileSync(path.join(authSource, "settings.json"), '{"hooks":"unsafe"}', {
    mode: 0o600,
  });
  fs.writeFileSync(path.join(connectorState, "session-credential.json"), "terminal-secret", {
    mode: 0o600,
  });
  const workdir = buildClaudeWorkdir(
    { slug: "acme", threadId: "acme:private" },
    "claude_boundary_run",
    tempRoot,
  );
  const hostileEnv = {
    PATH: "/usr/bin:/bin",
    HOME: connectorState,
    CLAUDE_CODE_AUTH_SOURCE_DIR: authSource,
    ANTHROPIC_API_KEY: "anthropic-provider-key",
    ANTHROPIC_OAUTH_TOKEN: "anthropic-subscription-token",
    CLAUDE_CODE_BRIDGE_SECRET: "bridge-secret",
    SANCHO_EXTERNAL_SECRET: "transport-secret",
    MC_CHAT_SECRET: "mc-secret",
    SANCHO_RUNTIME_TERMINAL_GRANT_SECRET: "grant-signing-secret",
    RUNTIME_TERMINAL_CALLBACK_GRANT: "terminal-grant",
    NEXTAUTH_SECRET: "app-auth-secret",
    DATABASE_URL: "postgres://app-secret",
    SANCHO_CALLBACK_OUTBOX_DIR: outbox,
  };

  try {
    assert.deepEqual(
      await stageClaudeAuthFiles(workdir, hostileEnv),
      [".credentials.json"],
    );
    const childEnv = buildClaudeChildEnv(
      "claude_boundary_run",
      hostileEnv,
      workdir,
    );

    assert.equal(childEnv.ANTHROPIC_API_KEY, "anthropic-provider-key");
    assert.equal(childEnv.CLAUDE_CODE_OAUTH_TOKEN, "anthropic-subscription-token");
    assert.equal(childEnv.ANTHROPIC_OAUTH_TOKEN, undefined);
    assert.equal(childEnv.HOME, workdir);
    assert.equal(childEnv.CLAUDE_CONFIG_DIR, path.join(workdir, ".claude"));
    assert.equal(childEnv.SANCHO_RUNTIME_RUN_ID, "claude_boundary_run");
    for (const forbidden of [
      "CLAUDE_CODE_BRIDGE_SECRET",
      "SANCHO_EXTERNAL_SECRET",
      "MC_CHAT_SECRET",
      "SANCHO_RUNTIME_TERMINAL_GRANT_SECRET",
      "RUNTIME_TERMINAL_CALLBACK_GRANT",
      "NEXTAUTH_SECRET",
      "DATABASE_URL",
      "SANCHO_CALLBACK_OUTBOX_DIR",
      "CLAUDE_CODE_AUTH_SOURCE_DIR",
    ]) {
      assert.equal(childEnv[forbidden], undefined, `${forbidden} crossed the child boundary`);
    }
    assert.equal(
      Object.values(childEnv).some((value) => String(value).includes(connectorState)),
      false,
    );
    assert.equal(workdir.startsWith(`${connectorState}${path.sep}`), false);
    assert.equal(workdir.startsWith(`${outbox}${path.sep}`), false);
    assert.equal(
      fs.readFileSync(path.join(workdir, ".claude", ".credentials.json"), "utf8"),
      '{"oauthAccount":"subscription"}',
    );
    assert.equal(fs.existsSync(path.join(workdir, ".claude", "settings.json")), false);
    assert.equal(fs.existsSync(path.join(workdir, "session-credential.json")), false);

    await cleanupClaudeWorkdir(workdir, tempRoot);
    assert.equal(fs.existsSync(workdir), false);
    await assert.rejects(
      cleanupClaudeWorkdir(connectorState, tempRoot),
      /Refusing to remove a non-isolated Claude Code workdir/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("temporary Sancho denies task mutation and delegation MCP tools at the Claude CLI boundary", () => {
  const previous = {
    CLAUDE_CODE_SANCHO_MCP_SERVER: process.env.CLAUDE_CODE_SANCHO_MCP_SERVER,
  };
  process.env.CLAUDE_CODE_SANCHO_MCP_SERVER = "sancho";

  try {
    const args = buildClaudeArgs(
      { threadId: "acme:task", temporaryAgent: true },
      "diagnose",
      { mcpServers: { sancho: { type: "http", url: "http://localhost/mcp" } } },
    );
    const denied = args[args.indexOf("--disallowedTools") + 1].split(",");
    assert.deepEqual(denied, [
      "mcp__sancho__sancho_create_task",
      "mcp__sancho__sancho_update_task",
      "mcp__sancho__sancho_delegate",
      "mcp__sancho__content_transition_task",
      "mcp__sancho__content_update_task",
    ]);
  } finally {
    restoreEnv(previous);
  }
});

test("cleanClaudeStdout extracts Claude Code JSON result", () => {
  const output = cleanClaudeStdout(
    JSON.stringify({
      type: "result",
      subtype: "success",
      result: "Respuesta final",
      session_id: "abc",
    }),
  );

  assert.equal(output, "Respuesta final");
});

test("bridge accepts Sancho inbound and posts progress/final webhooks", async () => {
  const previous = {
    CLAUDE_CODE_BRIDGE_SECRET: process.env.CLAUDE_CODE_BRIDGE_SECRET,
    CLAUDE_CODE_SANCHO_SECRET: process.env.CLAUDE_CODE_SANCHO_SECRET,
    CLAUDE_CODE_CLI: process.env.CLAUDE_CODE_CLI,
    CLAUDE_CODE_RUNTIME_WORKDIR: process.env.CLAUDE_CODE_RUNTIME_WORKDIR,
    CLAUDE_CODE_AUTH_SOURCE_DIR: process.env.CLAUDE_CODE_AUTH_SOURCE_DIR,
    CLAUDE_CODE_RUNTIME_TIMEOUT_MS: process.env.CLAUDE_CODE_RUNTIME_TIMEOUT_MS,
    CLAUDE_CODE_RUNTIME_TOOLS: process.env.CLAUDE_CODE_RUNTIME_TOOLS,
    CLAUDE_CODE_CONTEXT_PACK_ENABLED: process.env.CLAUDE_CODE_CONTEXT_PACK_ENABLED,
    CLAUDE_CODE_SANCHO_MCP_URL: process.env.CLAUDE_CODE_SANCHO_MCP_URL,
    SANCHO_WEBHOOK_URL: process.env.SANCHO_WEBHOOK_URL,
    SANCHO_CALLBACK_OUTBOX_DIR: process.env.SANCHO_CALLBACK_OUTBOX_DIR,
    SANCHO_EXTERNAL_SECRET: process.env.SANCHO_EXTERNAL_SECRET,
    MC_CHAT_SECRET: process.env.MC_CHAT_SECRET,
    SANCHO_RUNTIME_TERMINAL_GRANT_SECRET: process.env.SANCHO_RUNTIME_TERMINAL_GRANT_SECRET,
    RUNTIME_TERMINAL_CALLBACK_GRANT: process.env.RUNTIME_TERMINAL_CALLBACK_GRANT,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    DATABASE_URL: process.env.DATABASE_URL,
  };
  const outboxRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sancho-claude-outbox-"));
  const connectorState = path.join(outboxRoot, "connector-state");
  const authSource = path.join(outboxRoot, "host-claude-auth");
  const captureFile = path.join(outboxRoot, "child-capture.json");
  const runtimeScript = path.join(outboxRoot, "fake-claude.mjs");
  fs.mkdirSync(connectorState, { recursive: true, mode: 0o700 });
  fs.mkdirSync(authSource, { recursive: true, mode: 0o700 });
  fs.writeFileSync(
    path.join(authSource, ".credentials.json"),
    '{"oauthAccount":"subscription"}',
    { mode: 0o600 },
  );
  fs.writeFileSync(
    runtimeScript,
    `#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
fs.writeFileSync(${JSON.stringify(captureFile)}, JSON.stringify({
  cwd: process.cwd(),
  env: process.env,
  authPresent: fs.existsSync(path.join(process.env.CLAUDE_CONFIG_DIR || "", ".credentials.json")),
}));
console.log(JSON.stringify({ result: "captured claude output" }));
`,
    { mode: 0o700 },
  );
  const received = [];
  const receivedHeaders = [];
  const runtimeToolCapability = "b".repeat(64);

  const webhook = http.createServer((req, res) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      received.push(JSON.parse(raw));
      receivedHeaders.push(req.headers);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
  });
  const webhookAddr = await listen(webhook);

  process.env.CLAUDE_CODE_BRIDGE_SECRET = "test-secret";
  process.env.CLAUDE_CODE_SANCHO_SECRET = "must-not-override-transport";
  process.env.CLAUDE_CODE_CLI = runtimeScript;
  process.env.CLAUDE_CODE_RUNTIME_WORKDIR = connectorState;
  process.env.CLAUDE_CODE_AUTH_SOURCE_DIR = authSource;
  process.env.CLAUDE_CODE_RUNTIME_TIMEOUT_MS = "5000";
  process.env.CLAUDE_CODE_RUNTIME_TOOLS = "";
  process.env.CLAUDE_CODE_CONTEXT_PACK_ENABLED = "0";
  process.env.CLAUDE_CODE_SANCHO_MCP_URL = "http://localhost:3000/api/mcp/sancho";
  process.env.SANCHO_WEBHOOK_URL = `http://127.0.0.1:${webhookAddr.port}/api/chat/webhook`;
  process.env.SANCHO_CALLBACK_OUTBOX_DIR = outboxRoot;
  process.env.SANCHO_EXTERNAL_SECRET = "must-not-reach-child";
  process.env.MC_CHAT_SECRET = "must-not-reach-child";
  process.env.SANCHO_RUNTIME_TERMINAL_GRANT_SECRET = "must-not-reach-child";
  process.env.RUNTIME_TERMINAL_CALLBACK_GRANT = "must-not-reach-child";
  process.env.NEXTAUTH_SECRET = "must-not-reach-child";
  process.env.DATABASE_URL = "postgres://must-not-reach-child";

  const bridge = createServer();
  const bridgeAddr = await listen(bridge);

  try {
    const res = await fetch(`http://127.0.0.1:${bridgeAddr.port}/sancho/inbound`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-MC-Secret": "test-secret",
      },
      body: JSON.stringify({
        slug: "acme",
        threadId: "acme:general",
        missionControlRunId: "run_mc_claude",
        ...terminalCallbackAuthority(runtimeToolCapability),
        text: "hola",
        agent: "sancho",
      }),
    });

    assert.equal(res.status, 202);
    const body = await res.json();
    assert.match(body.runId, /^claude_code_/);

    await waitFor(() => received.some((item) => item.role === "progress") && received.some((item) => !item.role));
    const progress = received.find((item) => item.role === "progress");
    const final = received.find((item) => !item.role);
    const progressIndex = received.indexOf(progress);
    const finalIndex = received.indexOf(final);
    assert.equal(progress.agent, "sancho");
    assert.equal(progress.missionControlRunId, "run_mc_claude");
    assert.equal(
      receivedHeaders[progressIndex]["x-mission-control-run-id"],
      "run_mc_claude",
    );
    assert.equal(
      receivedHeaders[progressIndex]["x-sancho-run-capability"],
      runtimeToolCapability,
    );
    assert.equal(receivedHeaders[progressIndex]["x-mc-secret"], "test-secret");
    assert.equal(
      receivedHeaders[progressIndex]["x-sancho-terminal-callback-grant"],
      undefined,
    );
    assert.equal(progress.event.kind, "thinking");
    assert.equal(final.slug, "acme");
    assert.equal(final.threadId, "acme:general");
    assert.equal(final.agent, "sancho");
    assert.equal(final.missionControlRunId, "run_mc_claude");
    assert.equal(
      receivedHeaders[finalIndex]["x-mission-control-run-id"],
      "run_mc_claude",
    );
    assert.equal(
      receivedHeaders[finalIndex]["x-sancho-run-capability"],
      runtimeToolCapability,
    );
    assert.equal(receivedHeaders[finalIndex]["x-mc-secret"], "test-secret");
    assert.equal(
      receivedHeaders[finalIndex]["x-sancho-terminal-callback-grant"],
      terminalCallbackGrant,
    );
    assert.equal(final.text, "captured claude output");
    const capture = JSON.parse(fs.readFileSync(captureFile, "utf8"));
    assert.equal(capture.authPresent, true);
    assert.equal(capture.cwd.startsWith(`${connectorState}${path.sep}`), false);
    assert.equal(capture.cwd.startsWith(`${outboxRoot}${path.sep}`), false);
    for (const forbidden of [
      "CLAUDE_CODE_BRIDGE_SECRET",
      "SANCHO_EXTERNAL_SECRET",
      "MC_CHAT_SECRET",
      "SANCHO_CALLBACK_OUTBOX_DIR",
      "SANCHO_RUNTIME_TERMINAL_GRANT_SECRET",
      "RUNTIME_TERMINAL_CALLBACK_GRANT",
      "NEXTAUTH_SECRET",
      "DATABASE_URL",
      "CLAUDE_CODE_RUNTIME_WORKDIR",
      "CLAUDE_CODE_AUTH_SOURCE_DIR",
    ]) {
      assert.equal(capture.env[forbidden], undefined, `${forbidden} reached the spawned CLI`);
    }
    await waitFor(() => !fs.existsSync(capture.cwd));
  } finally {
    await close(bridge);
    await close(webhook);
    restoreEnv(previous);
    fs.rmSync(outboxRoot, { recursive: true, force: true });
  }
});

test("Claude Code spawn error emits exactly one terminal callback", async () => {
  const previous = {
    CLAUDE_CODE_BRIDGE_SECRET: process.env.CLAUDE_CODE_BRIDGE_SECRET,
    CLAUDE_CODE_CLI: process.env.CLAUDE_CODE_CLI,
    CLAUDE_CODE_CONTEXT_PACK_ENABLED: process.env.CLAUDE_CODE_CONTEXT_PACK_ENABLED,
    SANCHO_WEBHOOK_URL: process.env.SANCHO_WEBHOOK_URL,
    SANCHO_CALLBACK_OUTBOX_DIR: process.env.SANCHO_CALLBACK_OUTBOX_DIR,
  };
  const outboxRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sancho-claude-error-outbox-"));
  const received = [];
  const webhook = http.createServer((req, res) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      received.push(JSON.parse(raw));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
  });
  const webhookAddr = await listen(webhook);
  process.env.CLAUDE_CODE_BRIDGE_SECRET = "terminal-secret";
  process.env.CLAUDE_CODE_CLI = "/definitely/missing/claude";
  process.env.CLAUDE_CODE_CONTEXT_PACK_ENABLED = "0";
  process.env.SANCHO_WEBHOOK_URL = `http://127.0.0.1:${webhookAddr.port}/api/chat/webhook`;
  process.env.SANCHO_CALLBACK_OUTBOX_DIR = outboxRoot;
  const bridge = createServer();
  const bridgeAddr = await listen(bridge);

  try {
    await fetch(`http://127.0.0.1:${bridgeAddr.port}/sancho/inbound`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-MC-Secret": "terminal-secret" },
      body: JSON.stringify({
        slug: "acme",
        threadId: "acme:claude-error",
        missionControlRunId: "run_mc_claude_error",
        ...terminalCallbackAuthority("d".repeat(64)),
        text: "hola",
      }),
    });
    await waitFor(() => received.some((payload) => payload.text), 3000);
    await new Promise((resolve) => setTimeout(resolve, 75));
    const terminal = received.filter((payload) => payload.text);
    assert.equal(terminal.length, 1);
    assert.equal(terminal[0].missionControlRunId, "run_mc_claude_error");
  } finally {
    await close(bridge);
    await close(webhook);
    restoreEnv(previous);
    fs.rmSync(outboxRoot, { recursive: true, force: true });
  }
});
