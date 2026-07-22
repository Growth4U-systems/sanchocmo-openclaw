import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import {
  buildCodexArgs,
  buildCodexChildEnv,
  buildCodexPrompt,
  buildCodexWorkdir,
  cleanupCodexWorkdir,
  cleanCodexOutput,
  createServer,
  fetchContextPack,
  stageCodexAuthFiles,
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

test("buildCodexPrompt preserves Sancho routing metadata and context pack", () => {
  const prompt = buildCodexPrompt(
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

  assert.match(prompt, /Codex CLI runtime for Sancho/);
  assert.match(prompt, /runtime_id: codex/);
  assert.match(prompt, /read and follow skills\/<skill>\/SKILL\.md/);
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

test("temporary Sancho in Codex cannot receive cession markers", () => {
  const prompt = buildCodexPrompt({
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

test("Codex receives the closed durable-effect envelope for writable root admin turns", () => {
  const prompt = buildCodexPrompt({
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

test("buildCodexArgs wires non-interactive exec defaults", () => {
  const previous = {
    CODEX_RUNTIME_MODEL: process.env.CODEX_RUNTIME_MODEL,
    CODEX_RUNTIME_SANDBOX: process.env.CODEX_RUNTIME_SANDBOX,
    CODEX_RUNTIME_WORKDIR: process.env.CODEX_RUNTIME_WORKDIR,
  };
  process.env.CODEX_RUNTIME_MODEL = "gpt-5.1-codex";
  process.env.CODEX_RUNTIME_SANDBOX = "read-only";
  process.env.CODEX_RUNTIME_WORKDIR = "/tmp/sancho-codex";

  try {
    const args = buildCodexArgs({ threadId: "acme:general" }, "hello", "/tmp/out.txt");

    assert.equal(args[0], "exec");
    assert.equal(args[args.indexOf("-m") + 1], "gpt-5.1-codex");
    assert.equal(args[args.indexOf("-s") + 1], "read-only");
    assert.equal(args.includes("-a"), false);
    assert.equal(args[args.indexOf("-C") + 1], "/tmp/sancho-codex");
    assert.ok(args.includes("--skip-git-repo-check"));
    assert.ok(args.includes("--ephemeral"));
    assert.ok(args.includes("--ignore-user-config"));
    assert.equal(args[args.indexOf("-o") + 1], "/tmp/out.txt");
    assert.equal(args.at(-1), "hello");
  } finally {
    restoreEnv(previous);
  }
});

test("Codex child runs in an isolated directory with provider-only auth", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sancho-codex-boundary-"));
  const connectorState = path.join(root, "runtime-connector");
  const authSource = path.join(root, "host-codex-auth");
  const tempRoot = path.join(root, "model-runs");
  const outbox = path.join(connectorState, "callback-outbox");
  fs.mkdirSync(authSource, { recursive: true, mode: 0o700 });
  fs.mkdirSync(outbox, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(authSource, "auth.json"), '{"tokens":"subscription"}', {
    mode: 0o600,
  });
  fs.writeFileSync(path.join(authSource, "config.toml"), "mcp_secret = 'nope'", {
    mode: 0o600,
  });
  fs.writeFileSync(path.join(connectorState, "session-credential.json"), "terminal-secret", {
    mode: 0o600,
  });
  const workdir = buildCodexWorkdir(
    { slug: "acme", threadId: "acme:private" },
    "codex_boundary_run",
    tempRoot,
  );
  const hostileEnv = {
    PATH: "/usr/bin:/bin",
    HOME: connectorState,
    CODEX_AUTH_SOURCE_DIR: authSource,
    OPENAI_API_KEY: "openai-provider-key",
    CODEX_BRIDGE_SECRET: "bridge-secret",
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
      await stageCodexAuthFiles(workdir, hostileEnv),
      ["auth.json"],
    );
    const childEnv = buildCodexChildEnv(
      "codex_boundary_run",
      hostileEnv,
      workdir,
    );

    assert.equal(childEnv.OPENAI_API_KEY, "openai-provider-key");
    assert.equal(childEnv.HOME, workdir);
    assert.equal(childEnv.CODEX_HOME, path.join(workdir, ".codex"));
    assert.equal(childEnv.SANCHO_RUNTIME_RUN_ID, "codex_boundary_run");
    for (const forbidden of [
      "CODEX_BRIDGE_SECRET",
      "SANCHO_EXTERNAL_SECRET",
      "MC_CHAT_SECRET",
      "SANCHO_RUNTIME_TERMINAL_GRANT_SECRET",
      "RUNTIME_TERMINAL_CALLBACK_GRANT",
      "NEXTAUTH_SECRET",
      "DATABASE_URL",
      "SANCHO_CALLBACK_OUTBOX_DIR",
      "CODEX_AUTH_SOURCE_DIR",
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
      fs.readFileSync(path.join(workdir, ".codex", "auth.json"), "utf8"),
      '{"tokens":"subscription"}',
    );
    assert.equal(fs.existsSync(path.join(workdir, ".codex", "config.toml")), false);
    assert.equal(fs.existsSync(path.join(workdir, "session-credential.json")), false);

    await cleanupCodexWorkdir(workdir, tempRoot);
    assert.equal(fs.existsSync(workdir), false);
    await assert.rejects(
      cleanupCodexWorkdir(connectorState, tempRoot),
      /Refusing to remove a non-isolated Codex workdir/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("fetchContextPack calls Sancho with transport and run authority", async () => {
  const previous = {
    CODEX_CONTEXT_PACK_URL: process.env.CODEX_CONTEXT_PACK_URL,
    CODEX_BRIDGE_SECRET: process.env.CODEX_BRIDGE_SECRET,
    CODEX_SANCHO_SECRET: process.env.CODEX_SANCHO_SECRET,
    CODEX_CONTEXT_PACK_ENABLED: process.env.CODEX_CONTEXT_PACK_ENABLED,
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
  process.env.CODEX_CONTEXT_PACK_URL = `http://127.0.0.1:${address.port}/api/chat/context-pack`;
  process.env.CODEX_BRIDGE_SECRET = "transport-secret";
  process.env.CODEX_SANCHO_SECRET = "must-not-override-transport";
  delete process.env.CODEX_CONTEXT_PACK_ENABLED;

  try {
    const runtimeToolCapability = "f".repeat(64);
    const pack = await fetchContextPack({
      slug: "acme",
      missionControlRunId: "run_mc_codex_context",
      runtimeToolCapability,
      skill: "seo-content",
    });

    assert.deepEqual(pack, { slug: "acme", skill: "seo-content", verdict: "ok" });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].path, "/api/chat/context-pack");
    assert.equal(calls[0].headers["x-mc-secret"], "transport-secret");
    assert.equal(
      calls[0].headers["x-mission-control-run-id"],
      "run_mc_codex_context",
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

test("cleanCodexOutput removes empty lines and CLI metadata", () => {
  const output = cleanCodexOutput(["OpenAI Codex", "", "Respuesta final"].join("\n"));
  assert.equal(output, "Respuesta final");
});

test("bridge accepts Sancho inbound and posts progress/final webhooks", async () => {
  const previous = {
    CODEX_BRIDGE_SECRET: process.env.CODEX_BRIDGE_SECRET,
    CODEX_SANCHO_SECRET: process.env.CODEX_SANCHO_SECRET,
    CODEX_CLI: process.env.CODEX_CLI,
    CODEX_RUNTIME_WORKDIR: process.env.CODEX_RUNTIME_WORKDIR,
    CODEX_AUTH_SOURCE_DIR: process.env.CODEX_AUTH_SOURCE_DIR,
    CODEX_RUNTIME_TIMEOUT_MS: process.env.CODEX_RUNTIME_TIMEOUT_MS,
    CODEX_CONTEXT_PACK_ENABLED: process.env.CODEX_CONTEXT_PACK_ENABLED,
    SANCHO_WEBHOOK_URL: process.env.SANCHO_WEBHOOK_URL,
    SANCHO_CALLBACK_OUTBOX_DIR: process.env.SANCHO_CALLBACK_OUTBOX_DIR,
    SANCHO_EXTERNAL_SECRET: process.env.SANCHO_EXTERNAL_SECRET,
    MC_CHAT_SECRET: process.env.MC_CHAT_SECRET,
    SANCHO_RUNTIME_TERMINAL_GRANT_SECRET: process.env.SANCHO_RUNTIME_TERMINAL_GRANT_SECRET,
    RUNTIME_TERMINAL_CALLBACK_GRANT: process.env.RUNTIME_TERMINAL_CALLBACK_GRANT,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    DATABASE_URL: process.env.DATABASE_URL,
  };
  const outboxRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sancho-codex-outbox-"));
  const connectorState = path.join(outboxRoot, "connector-state");
  const authSource = path.join(outboxRoot, "host-codex-auth");
  const captureFile = path.join(outboxRoot, "child-capture.json");
  const runtimeScript = path.join(outboxRoot, "fake-codex.mjs");
  fs.mkdirSync(connectorState, { recursive: true, mode: 0o700 });
  fs.mkdirSync(authSource, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(authSource, "auth.json"), '{"tokens":"subscription"}', {
    mode: 0o600,
  });
  fs.writeFileSync(
    runtimeScript,
    `#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
const args = process.argv.slice(2);
fs.writeFileSync(${JSON.stringify(captureFile)}, JSON.stringify({
  cwd: process.cwd(),
  env: process.env,
  authPresent: fs.existsSync(path.join(process.env.CODEX_HOME || "", "auth.json")),
}));
const outputIndex = args.indexOf("-o");
if (outputIndex >= 0) fs.writeFileSync(args[outputIndex + 1], "captured codex output");
`,
    { mode: 0o700 },
  );
  const received = [];
  const receivedHeaders = [];
  const runtimeToolCapability = "c".repeat(64);

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

  process.env.CODEX_BRIDGE_SECRET = "test-secret";
  process.env.CODEX_SANCHO_SECRET = "must-not-override-transport";
  process.env.CODEX_CLI = runtimeScript;
  process.env.CODEX_RUNTIME_WORKDIR = connectorState;
  process.env.CODEX_AUTH_SOURCE_DIR = authSource;
  process.env.CODEX_RUNTIME_TIMEOUT_MS = "5000";
  process.env.CODEX_CONTEXT_PACK_ENABLED = "0";
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
        missionControlRunId: "run_mc_codex",
        ...terminalCallbackAuthority(runtimeToolCapability),
        text: "hola",
        agent: "sancho",
      }),
    });

    assert.equal(res.status, 202);
    const body = await res.json();
    assert.match(body.runId, /^codex_/);

    await waitFor(() => received.some((item) => item.role === "progress") && received.some((item) => !item.role));
    const progress = received.find((item) => item.role === "progress");
    const final = received.find((item) => !item.role);
    const progressIndex = received.indexOf(progress);
    const finalIndex = received.indexOf(final);
    assert.equal(progress.agent, "sancho");
    assert.equal(progress.missionControlRunId, "run_mc_codex");
    assert.equal(
      receivedHeaders[progressIndex]["x-mission-control-run-id"],
      "run_mc_codex",
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
    assert.equal(final.missionControlRunId, "run_mc_codex");
    assert.equal(
      receivedHeaders[finalIndex]["x-mission-control-run-id"],
      "run_mc_codex",
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
    assert.equal(final.text, "captured codex output");
    const capture = JSON.parse(fs.readFileSync(captureFile, "utf8"));
    assert.equal(capture.authPresent, true);
    assert.equal(capture.cwd.startsWith(`${connectorState}${path.sep}`), false);
    assert.equal(capture.cwd.startsWith(`${outboxRoot}${path.sep}`), false);
    for (const forbidden of [
      "CODEX_BRIDGE_SECRET",
      "SANCHO_EXTERNAL_SECRET",
      "MC_CHAT_SECRET",
      "SANCHO_CALLBACK_OUTBOX_DIR",
      "SANCHO_RUNTIME_TERMINAL_GRANT_SECRET",
      "RUNTIME_TERMINAL_CALLBACK_GRANT",
      "NEXTAUTH_SECRET",
      "DATABASE_URL",
      "CODEX_RUNTIME_WORKDIR",
      "CODEX_AUTH_SOURCE_DIR",
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

test("Codex spawn error emits exactly one terminal callback", async () => {
  const previous = {
    CODEX_BRIDGE_SECRET: process.env.CODEX_BRIDGE_SECRET,
    CODEX_CLI: process.env.CODEX_CLI,
    CODEX_CONTEXT_PACK_ENABLED: process.env.CODEX_CONTEXT_PACK_ENABLED,
    SANCHO_WEBHOOK_URL: process.env.SANCHO_WEBHOOK_URL,
    SANCHO_CALLBACK_OUTBOX_DIR: process.env.SANCHO_CALLBACK_OUTBOX_DIR,
  };
  const outboxRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sancho-codex-error-outbox-"));
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
  process.env.CODEX_BRIDGE_SECRET = "terminal-secret";
  process.env.CODEX_CLI = "/definitely/missing/codex";
  process.env.CODEX_CONTEXT_PACK_ENABLED = "0";
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
        threadId: "acme:codex-error",
        missionControlRunId: "run_mc_codex_error",
        ...terminalCallbackAuthority("d".repeat(64)),
        text: "hola",
      }),
    });
    await waitFor(() => received.some((payload) => payload.text), 3000);
    await new Promise((resolve) => setTimeout(resolve, 75));
    const terminal = received.filter((payload) => payload.text);
    assert.equal(terminal.length, 1);
    assert.equal(terminal[0].missionControlRunId, "run_mc_codex_error");
  } finally {
    await close(bridge);
    await close(webhook);
    restoreEnv(previous);
    fs.rmSync(outboxRoot, { recursive: true, force: true });
  }
});
