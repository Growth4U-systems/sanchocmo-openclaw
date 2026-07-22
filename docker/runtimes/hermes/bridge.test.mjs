import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import {
  buildHermesArgs,
  buildHermesChildEnv,
  buildHermesPrompt,
  buildHermesWorkdir,
  cleanupHermesWorkdir,
  cleanHermesStdout,
  createServer,
  fetchContextPack,
  resolveHermesToolsets,
  stageHermesAuthFiles,
} from "./bridge.mjs";

test("buildHermesChildEnv exposes bounded Sancho metadata to CLI wrappers", () => {
  const env = buildHermesChildEnv(
    {
      slug: "growth4u",
      threadId: "growth4u:outbound",
      agent: "rocinante",
      text: "Crea una base real",
      readOnly: true,
      controlDepth: 1,
      temporaryAgent: true,
    },
    "run-1",
    { PATH: "/usr/bin", DATABASE_URL: "postgres://do-not-leak" },
    "/tmp/sancho-hermes-test/tenant/thread",
  );

  assert.equal(env.PATH, "/usr/bin");
  assert.equal(env.HOME, "/tmp/sancho-hermes-test/tenant/thread");
  assert.equal(env.USERPROFILE, "/tmp/sancho-hermes-test/tenant/thread");
  assert.equal(env.XDG_CONFIG_HOME, "/tmp/sancho-hermes-test/tenant/thread/.config");
  assert.equal(env.HERMES_HOME, "/tmp/sancho-hermes-test/tenant/thread/.hermes");
  assert.equal(env.HERMES_SANCHO_RUN_ID, "run-1");
  assert.equal(env.SANCHO_RUNTIME, "hermes");
  assert.equal(env.SANCHO_CHAT_SLUG, "growth4u");
  assert.equal(env.SANCHO_CHAT_THREAD_ID, "growth4u:outbound");
  assert.equal(env.SANCHO_CHAT_AGENT, "rocinante");
  assert.equal(env.SANCHO_CHAT_READ_ONLY, "1");
  assert.equal(env.SANCHO_CHAT_CONTROL_DEPTH, "1");
  assert.equal(env.SANCHO_CHAT_TEMPORARY_AGENT, "1");
  assert.equal(env.SANCHO_CHAT_REQUEST, undefined);
  assert.equal(env.DATABASE_URL, undefined);
});

test("buildHermesChildEnv isolates Anthropic API auth from Claude Code OAuth", () => {
  const env = buildHermesChildEnv(
    { threadId: "growth4u:general", text: "Hola" },
    "run-2",
    {
      HERMES_CLI_PROVIDER: "anthropic",
      ANTHROPIC_API_KEY: "anthropic-api-key",
      CLAUDE_CODE_OAUTH_TOKEN: "claude-code-oauth",
    },
    "/tmp/sancho-hermes-test/anthropic",
  );

  assert.equal(env.ANTHROPIC_API_KEY, "anthropic-api-key");
  assert.equal(env.CLAUDE_CODE_OAUTH_TOKEN, undefined);
});

test("buildHermesChildEnv translates Sancho Anthropic OAuth for Hermes", () => {
  const env = buildHermesChildEnv(
    { threadId: "growth4u:general", text: "Hola" },
    "run-3",
    {
      HERMES_CLI_PROVIDER: "anthropic",
      ANTHROPIC_OAUTH_TOKEN: "sancho-anthropic-oauth",
    },
    "/tmp/sancho-hermes-test/anthropic-oauth",
  );

  assert.equal(env.CLAUDE_CODE_OAUTH_TOKEN, "sancho-anthropic-oauth");
  assert.equal(env.ANTHROPIC_OAUTH_TOKEN, undefined);
});

test("buildHermesChildEnv only forwards the selected provider and OS plumbing", () => {
  const env = buildHermesChildEnv(
    { slug: "acme", threadId: "acme:general", text: "Hola" },
    "run-isolated",
    {
      HERMES_CLI_PROVIDER: "openrouter",
      PATH: "/usr/local/bin:/usr/bin",
      HTTPS_PROXY: "http://proxy.internal:8080",
      SSL_CERT_FILE: "/etc/ssl/custom.pem",
      OPENROUTER_API_KEY: "selected-provider-key",
      OPENROUTER_BASE_URL: "https://openrouter.example/v1",
      ANTHROPIC_API_KEY: "unrelated-provider-key",
      ANTHROPIC_OAUTH_TOKEN: "unrelated-provider-oauth",
      OPENAI_API_KEY: "also-unrelated",
      DATABASE_URL: "postgres://sancho-db",
      NEXTAUTH_SECRET: "nextauth-secret",
      MC_CHAT_SECRET: "mc-secret",
      HERMES_CHAT_SECRET: "bridge-secret",
      HERMES_BRIDGE_SECRET: "bridge-secret-2",
      SANCHO_INTERNAL_API_TOKEN: "internal-token",
      ENCRYPTION_KEY: "encryption-key",
      NODE_OPTIONS: "--require /tmp/evil.cjs",
      LD_PRELOAD: "/tmp/evil.so",
      BASH_ENV: "/tmp/evil.sh",
    },
    "/tmp/sancho-hermes-test/openrouter",
  );

  assert.equal(env.PATH, "/usr/local/bin:/usr/bin");
  assert.equal(env.HTTPS_PROXY, "http://proxy.internal:8080");
  assert.equal(env.SSL_CERT_FILE, "/etc/ssl/custom.pem");
  assert.equal(env.OPENROUTER_API_KEY, "selected-provider-key");
  assert.equal(env.OPENROUTER_BASE_URL, "https://openrouter.example/v1");
  for (const forbidden of [
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_OAUTH_TOKEN",
    "CLAUDE_CODE_OAUTH_TOKEN",
    "OPENAI_API_KEY",
    "DATABASE_URL",
    "NEXTAUTH_SECRET",
    "MC_CHAT_SECRET",
    "HERMES_CHAT_SECRET",
    "HERMES_BRIDGE_SECRET",
    "SANCHO_INTERNAL_API_TOKEN",
    "ENCRYPTION_KEY",
    "NODE_OPTIONS",
    "LD_PRELOAD",
    "BASH_ENV",
  ]) {
    assert.equal(env[forbidden], undefined, `${forbidden} must not reach Hermes`);
  }
});

test("buildHermesWorkdir is isolated by tenant/thread and resists traversal", () => {
  const tempRoot = "/tmp/sancho-hermes-adversarial-root";
  const escaped = buildHermesWorkdir(
    {
      slug: "../../../../root/.openclaw",
      threadId: "../../../../etc/passwd\0acme",
    },
    tempRoot,
  );
  const otherTenant = buildHermesWorkdir(
    { slug: "other", threadId: "../../../../etc/passwd\0acme" },
    tempRoot,
  );
  const otherThread = buildHermesWorkdir(
    { slug: "../../../../root/.openclaw", threadId: "other-thread" },
    tempRoot,
  );

  assert.match(
    escaped,
    /^\/tmp\/sancho-hermes-adversarial-root\/tenant-[a-f0-9]{24}\/thread-[a-f0-9]{24}$/,
  );
  assert.equal(escaped.includes(".."), false);
  assert.equal(escaped.includes("openclaw"), false);
  assert.notEqual(escaped, otherTenant);
  assert.notEqual(escaped, otherThread);
});

test("Hermes isolation stages credentials but not host rules or plugins", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sancho-hermes-auth-"));
  const source = path.join(root, "persistent-hermes");
  const workdir = path.join(root, "isolated-turn");
  fs.mkdirSync(source, { recursive: true, mode: 0o700 });
  fs.writeFileSync(
    path.join(source, "auth.json"),
    JSON.stringify({ version: 2, credential_pool: { anthropic: ["secret"] } }),
    { mode: 0o600 },
  );
  fs.writeFileSync(
    path.join(source, ".anthropic_oauth.json"),
    JSON.stringify({ access_token: "oauth-secret" }),
    { mode: 0o600 },
  );
  fs.writeFileSync(path.join(source, "config.yaml"), "unsafe rules", {
    mode: 0o600,
  });

  try {
    assert.deepEqual(
      await stageHermesAuthFiles(workdir, {
        HERMES_AUTH_SOURCE_DIR: source,
      }),
      ["auth.json", ".anthropic_oauth.json"],
    );
    for (const filename of ["auth.json", ".anthropic_oauth.json"]) {
      const target = path.join(workdir, ".hermes", filename);
      assert.equal(fs.statSync(target).mode & 0o777, 0o600);
      assert.equal(
        fs.readFileSync(target, "utf8"),
        fs.readFileSync(path.join(source, filename), "utf8"),
      );
    }
    assert.equal(
      fs.existsSync(path.join(workdir, ".hermes", "config.yaml")),
      false,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("cleanupHermesWorkdir removes only an exact hashed run directory", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sancho-hermes-cleanup-"));
  const workdir = buildHermesWorkdir(
    { slug: "acme", threadId: "acme:private" },
    tempRoot,
  );
  fs.mkdirSync(workdir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(workdir, "prompt.txt"), "private prompt", { mode: 0o600 });

  try {
    await cleanupHermesWorkdir(workdir, tempRoot);
    assert.equal(fs.existsSync(workdir), false);
    await assert.rejects(
      cleanupHermesWorkdir(tempRoot, tempRoot),
      /Refusing to remove a non-isolated Hermes workdir/,
    );
    await assert.rejects(
      cleanupHermesWorkdir(path.dirname(tempRoot), tempRoot),
      /Refusing to remove a non-isolated Hermes workdir/,
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("buildHermesPrompt preserves Sancho routing metadata", () => {
  const prompt = buildHermesPrompt({
    slug: "acme",
    threadId: "acme:content:123",
    threadName: "Content draft",
    text: "Revisa este draft",
    agent: "dulcinea",
    skill: "seo-content",
    skills: ["seo-content", "content-review"],
    docPath: "brand/acme/content/draft.md",
    senderRole: "admin",
  });

  assert.match(prompt, /Sancho Mission Control/);
  assert.match(prompt, /runtime_id: hermes/);
  assert.match(prompt, /never call clarify or any interactive question tool/);
  assert.match(prompt, /"threadId": "acme:content:123"/);
  assert.match(prompt, /"agent": "dulcinea"/);
  assert.match(prompt, /execution_mode: guided/);
  assert.match(prompt, /skill_policy: guided/);
  assert.match(prompt, /primary_skill: seo-content/);
  assert.match(prompt, /allowed_skills: seo-content, content-review/);
  assert.match(prompt, /"docPath": "brand\/acme\/content\/draft.md"/);
  assert.match(prompt, /Revisa este draft/);
});

test("Hermes keeps Sancho generalist and specialist skill-auto roles distinct", () => {
  const sanchoPrompt = buildHermesPrompt({
    slug: "acme",
    threadId: "acme:general",
    text: "Resuelve esto",
  });
  assert.match(sanchoPrompt, /execution_mode: generalist/);
  assert.match(sanchoPrompt, /Eres Sancho, el agente generalista/);
  assert.match(sanchoPrompt, /:::delegate/);
  assert.match(sanchoPrompt, /:::task-route/);

  const specialistPrompt = buildHermesPrompt({
    slug: "acme",
    threadId: "acme:discovery-new",
    text: "Corrige la audiencia",
    agent: "rocinante",
    skill: "discovery-plan-builder",
    skills: ["discovery-plan-builder", "outreach-sequence-builder"],
    scope: "agent",
    skillMode: "auto",
  });
  assert.match(specialistPrompt, /execution_mode: agent-led/);
  assert.match(specialistPrompt, /skill_policy: auto/);
  assert.match(specialistPrompt, /No eres Sancho ni un generalista global/);
  assert.match(specialistPrompt, /:::sancho-intervene/);
});

test("buildHermesPrompt includes Sancho context pack when available", () => {
  const prompt = buildHermesPrompt(
    {
      slug: "acme",
      threadId: "acme:general",
      text: "Dame contexto",
      skill: "seo-content",
    },
    {
      slug: "acme",
      skill: "seo-content",
      verdict: "ok",
      summary: "Brand context summary",
      docPaths: ["brand/acme/foundation/current.md"],
    },
  );

  assert.match(prompt, /Sancho context pack/);
  assert.match(prompt, /"verdict": "ok"/);
  assert.match(prompt, /Brand context summary/);
});

test("buildHermesArgs keeps Sancho skills portable instead of requiring Hermes installation", () => {
  const args = buildHermesArgs(
    {
      skill: "seo-content",
      skills: ["seo-content", "content-review"],
    },
    "hello",
    {
      HERMES_CLI_PROVIDER: "nous",
      HERMES_CLI_MODEL: "anthropic/claude-sonnet-4",
    },
  );

  assert.deepEqual(args, [
    "chat",
    "-Q",
    "--source",
    "sancho",
    "--ignore-user-config",
    "--ignore-rules",
    "--provider",
    "nous",
    "--model",
    "anthropic/claude-sonnet-4",
    "--toolsets",
    "web,vision",
    "-q",
    "hello",
  ]);
});

test("buildHermesArgs supports explicit Hermes-native skills", () => {
  const args = buildHermesArgs(
    { skill: "sancho-manager" },
    "hello",
    { HERMES_CLI_SKILLS: "computer-use" },
  );

  assert.deepEqual(args, [
    "chat",
    "-Q",
    "--source",
    "sancho",
    "--ignore-user-config",
    "--ignore-rules",
    "-s",
    "computer-use",
    "--toolsets",
    "web,vision",
    "-q",
    "hello",
  ]);
});

test("restricted Hermes turns cannot widen toolsets even with the unsafe opt-in", () => {
  const hostileEnv = {
    HERMES_CLI_TOOLSETS: "terminal,file,messaging,browser,mcp,cron",
    HERMES_UNSAFE_ALLOW_DANGEROUS_TOOLSETS: "1",
  };
  for (const message of [
    { readOnly: true },
    { controlDepth: 1 },
    { temporaryAgent: true },
    { temporary: true },
  ]) {
    assert.equal(resolveHermesToolsets(message, hostileEnv), "web,vision");
    const args = buildHermesArgs(message, "diagnose", hostileEnv);
    assert.equal(args[args.indexOf("--toolsets") + 1], "web,vision");
    assert.equal(
      args.some((arg) => /terminal|file|messaging|browser|mcp|cron/.test(arg)),
      false,
    );
  }
});

test("primary Hermes turns fail closed on dangerous configured toolsets", () => {
  assert.throws(
    () => resolveHermesToolsets({}, { HERMES_CLI_TOOLSETS: "web,terminal,file" }),
    /Unsafe Hermes toolsets denied: terminal, file/,
  );
});

test("dangerous primary toolsets require a clearly unsafe explicit opt-in", () => {
  assert.equal(
    resolveHermesToolsets(
      {},
      {
        HERMES_CLI_TOOLSETS: "web,terminal,file",
        HERMES_UNSAFE_ALLOW_DANGEROUS_TOOLSETS: "1",
      },
    ),
    "web,terminal,file",
  );
});

test("buildHermesArgs never preloads a hinted skill in auto mode", () => {
  const args = buildHermesArgs(
    {
      skill: "discovery-plan-builder",
      skills: ["discovery-plan-builder", "outreach-sequence-builder"],
      scope: "agent",
      skillMode: "auto",
    },
    "hello",
    {},
  );

  assert.deepEqual(args, [
    "chat",
    "-Q",
    "--source",
    "sancho",
    "--ignore-user-config",
    "--ignore-rules",
    "--toolsets",
    "web,vision",
    "-q",
    "hello",
  ]);
});

test("cleanHermesStdout removes transport metadata and runtime warnings", () => {
  const output = cleanHermesStdout(
    [
      "session_id: 20260630_235507_7789b2",
      "tirith security scanner enabled but not available - command scanning will use pattern matching only",
      "Respuesta final",
    ].join("\n"),
  );

  assert.equal(output, "Respuesta final");
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

test("fetchContextPack calls Sancho with transport and run authority", async () => {
  const previousUrl = process.env.SANCHO_CONTEXT_PACK_URL;
  const previousSecret = process.env.HERMES_SANCHO_SECRET;
  const previousEnabled = process.env.HERMES_CONTEXT_PACK_ENABLED;
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
  process.env.SANCHO_CONTEXT_PACK_URL = `http://127.0.0.1:${address.port}/api/chat/context-pack`;
  process.env.HERMES_SANCHO_SECRET = "sancho-secret";
  delete process.env.HERMES_CONTEXT_PACK_ENABLED;

  try {
    const runtimeToolCapability = "d".repeat(64);
    const pack = await fetchContextPack({
      slug: "acme",
      missionControlRunId: "run_mc_hermes_context",
      runtimeToolCapability,
      skill: "seo-content",
      scope: "agent",
      skillMode: "auto",
    });

    assert.deepEqual(pack, { slug: "acme", skill: "seo-content", verdict: "ok" });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].path, "/api/chat/context-pack");
    assert.equal(calls[0].headers["x-mc-secret"], "sancho-secret");
    assert.equal(
      calls[0].headers["x-mission-control-run-id"],
      "run_mc_hermes_context",
    );
    assert.equal(
      calls[0].headers["x-sancho-run-capability"],
      runtimeToolCapability,
    );
    assert.deepEqual(calls[0].body, {});
  } finally {
    await close(server);
    if (previousUrl === undefined) delete process.env.SANCHO_CONTEXT_PACK_URL;
    else process.env.SANCHO_CONTEXT_PACK_URL = previousUrl;
    if (previousSecret === undefined) delete process.env.HERMES_SANCHO_SECRET;
    else process.env.HERMES_SANCHO_SECRET = previousSecret;
    if (previousEnabled === undefined) delete process.env.HERMES_CONTEXT_PACK_ENABLED;
    else process.env.HERMES_CONTEXT_PACK_ENABLED = previousEnabled;
  }
});

test("bridge accepts Sancho inbound and posts progress/final webhooks", async () => {
  const previousSecret = process.env.HERMES_BRIDGE_SECRET;
  const previousCli = process.env.HERMES_CLI;
  const previousWebhook = process.env.SANCHO_WEBHOOK_URL;
  const previousTimeout = process.env.HERMES_RUN_TIMEOUT_MS;
  const previousContextEnabled = process.env.HERMES_CONTEXT_PACK_ENABLED;
  const previousToolsets = process.env.HERMES_CLI_TOOLSETS;
  const previousUnsafeToolsets = process.env.HERMES_UNSAFE_ALLOW_DANGEROUS_TOOLSETS;
  const previousOutboxDir = process.env.SANCHO_CALLBACK_OUTBOX_DIR;
  const outboxRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sancho-hermes-outbox-"));
  const received = [];
  const receivedHeaders = [];
  const runtimeToolCapability = "a".repeat(64);

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

  process.env.HERMES_BRIDGE_SECRET = "test-secret";
  process.env.HERMES_CLI = "/bin/echo";
  process.env.HERMES_RUN_TIMEOUT_MS = "5000";
  process.env.SANCHO_WEBHOOK_URL = `http://127.0.0.1:${webhookAddr.port}/api/chat/webhook`;
  process.env.HERMES_CONTEXT_PACK_ENABLED = "0";
  process.env.HERMES_CLI_TOOLSETS = "web,vision";
  process.env.SANCHO_CALLBACK_OUTBOX_DIR = outboxRoot;
  delete process.env.HERMES_UNSAFE_ALLOW_DANGEROUS_TOOLSETS;

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
        missionControlRunId: "run_mc_hermes",
        runtimeToolCapability,
        text: "Hola Hermes",
        userId: "mc-admin",
        userName: "Admin",
        skill: "sancho-manager",
      }),
    });

    assert.equal(res.status, 202);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.match(body.runId, /^hermes_/);

    await waitFor(() => received.some((payload) => payload.text), 3000);
    assert.equal(received[0].role, "progress");
    assert.equal(received[0].missionControlRunId, "run_mc_hermes");
    assert.equal(
      receivedHeaders[0]["x-mission-control-run-id"],
      "run_mc_hermes",
    );
    assert.equal(
      receivedHeaders[0]["x-sancho-run-capability"],
      runtimeToolCapability,
    );
    const final = received.find((payload) => payload.text);
    const finalIndex = received.indexOf(final);
    assert.equal(final.slug, "acme");
    assert.equal(final.threadId, "acme:general");
    assert.equal(final.agent, "hermes");
    assert.equal(final.missionControlRunId, "run_mc_hermes");
    assert.equal(
      receivedHeaders[finalIndex]["x-mission-control-run-id"],
      "run_mc_hermes",
    );
    assert.equal(
      receivedHeaders[finalIndex]["x-sancho-run-capability"],
      runtimeToolCapability,
    );
    assert.match(final.text, /Hola Hermes/);
  } finally {
    await close(bridge);
    await close(webhook);
    if (previousSecret === undefined) delete process.env.HERMES_BRIDGE_SECRET;
    else process.env.HERMES_BRIDGE_SECRET = previousSecret;
    if (previousCli === undefined) delete process.env.HERMES_CLI;
    else process.env.HERMES_CLI = previousCli;
    if (previousWebhook === undefined) delete process.env.SANCHO_WEBHOOK_URL;
    else process.env.SANCHO_WEBHOOK_URL = previousWebhook;
    if (previousTimeout === undefined) delete process.env.HERMES_RUN_TIMEOUT_MS;
    else process.env.HERMES_RUN_TIMEOUT_MS = previousTimeout;
    if (previousContextEnabled === undefined) delete process.env.HERMES_CONTEXT_PACK_ENABLED;
    else process.env.HERMES_CONTEXT_PACK_ENABLED = previousContextEnabled;
    if (previousToolsets === undefined) delete process.env.HERMES_CLI_TOOLSETS;
    else process.env.HERMES_CLI_TOOLSETS = previousToolsets;
    if (previousUnsafeToolsets === undefined) delete process.env.HERMES_UNSAFE_ALLOW_DANGEROUS_TOOLSETS;
    else process.env.HERMES_UNSAFE_ALLOW_DANGEROUS_TOOLSETS = previousUnsafeToolsets;
    if (previousOutboxDir === undefined) delete process.env.SANCHO_CALLBACK_OUTBOX_DIR;
    else process.env.SANCHO_CALLBACK_OUTBOX_DIR = previousOutboxDir;
    fs.rmSync(outboxRoot, { recursive: true, force: true });
  }
});

test("Hermes spawn error emits exactly one terminal callback", async () => {
  const previous = {
    HERMES_BRIDGE_SECRET: process.env.HERMES_BRIDGE_SECRET,
    HERMES_CLI: process.env.HERMES_CLI,
    HERMES_CONTEXT_PACK_ENABLED: process.env.HERMES_CONTEXT_PACK_ENABLED,
    SANCHO_WEBHOOK_URL: process.env.SANCHO_WEBHOOK_URL,
    SANCHO_CALLBACK_OUTBOX_DIR: process.env.SANCHO_CALLBACK_OUTBOX_DIR,
  };
  const outboxRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sancho-hermes-error-outbox-"));
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
  process.env.HERMES_BRIDGE_SECRET = "terminal-secret";
  process.env.HERMES_CLI = "/definitely/missing/hermes";
  process.env.HERMES_CONTEXT_PACK_ENABLED = "0";
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
        threadId: "acme:hermes-error",
        missionControlRunId: "run_mc_hermes_error",
        text: "hola",
      }),
    });
    await waitFor(() => received.some((payload) => payload.text), 3000);
    await new Promise((resolve) => setTimeout(resolve, 75));
    const terminal = received.filter((payload) => payload.text);
    assert.equal(terminal.length, 1);
    assert.equal(terminal[0].missionControlRunId, "run_mc_hermes_error");
  } finally {
    await close(bridge);
    await close(webhook);
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(outboxRoot, { recursive: true, force: true });
  }
});
