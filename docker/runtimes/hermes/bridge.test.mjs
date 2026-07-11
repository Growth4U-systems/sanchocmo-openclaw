import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import {
  buildHermesArgs,
  buildHermesPrompt,
  cleanHermesStdout,
  createServer,
  fetchContextPack,
} from "./bridge.mjs";

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

test("buildHermesArgs maps Sancho skills to Hermes -s preload", () => {
  const previousProvider = process.env.HERMES_CLI_PROVIDER;
  const previousModel = process.env.HERMES_CLI_MODEL;
  const previousToolsets = process.env.HERMES_CLI_TOOLSETS;
  process.env.HERMES_CLI_PROVIDER = "nous";
  process.env.HERMES_CLI_MODEL = "anthropic/claude-sonnet-4";
  process.env.HERMES_CLI_TOOLSETS = "web,terminal,skills";

  try {
    const args = buildHermesArgs(
      {
        skill: "seo-content",
        skills: ["seo-content", "content-review"],
      },
      "hello",
    );

    assert.deepEqual(args, [
      "chat",
      "-Q",
      "-s",
      "seo-content,content-review",
      "--provider",
      "nous",
      "--model",
      "anthropic/claude-sonnet-4",
      "--toolsets",
      "web,terminal,skills",
      "-q",
      "hello",
    ]);
  } finally {
    if (previousProvider === undefined) delete process.env.HERMES_CLI_PROVIDER;
    else process.env.HERMES_CLI_PROVIDER = previousProvider;
    if (previousModel === undefined) delete process.env.HERMES_CLI_MODEL;
    else process.env.HERMES_CLI_MODEL = previousModel;
    if (previousToolsets === undefined) delete process.env.HERMES_CLI_TOOLSETS;
    else process.env.HERMES_CLI_TOOLSETS = previousToolsets;
  }
});

test("buildHermesArgs skips generic Sancho chat skill aliases", () => {
  const args = buildHermesArgs(
    {
      skill: "general",
      skills: ["default", "seo-content", "none", "seo-content"],
    },
    "hello",
  );

  assert.deepEqual(args, ["chat", "-Q", "-s", "seo-content", "-q", "hello"]);
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
  );

  assert.deepEqual(args, ["chat", "-Q", "-q", "hello"]);
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

test("fetchContextPack calls Sancho context-pack endpoint with shared secret", async () => {
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
      calls.push({ path: req.url, secret: req.headers["x-mc-secret"], body: JSON.parse(raw) });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ slug: "acme", skill: "seo-content", verdict: "ok" }));
    });
  });
  const address = await listen(server);
  process.env.SANCHO_CONTEXT_PACK_URL = `http://127.0.0.1:${address.port}/api/chat/context-pack`;
  process.env.HERMES_SANCHO_SECRET = "sancho-secret";
  delete process.env.HERMES_CONTEXT_PACK_ENABLED;

  try {
    const pack = await fetchContextPack({
      slug: "acme",
      skill: "seo-content",
      scope: "agent",
      skillMode: "auto",
    });

    assert.deepEqual(pack, { slug: "acme", skill: "seo-content", verdict: "ok" });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].path, "/api/chat/context-pack");
    assert.equal(calls[0].secret, "sancho-secret");
    assert.deepEqual(calls[0].body, { slug: "acme", skill: "seo-content" });
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
  const received = [];

  const webhook = http.createServer((req, res) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      received.push(JSON.parse(raw));
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
    const final = received.find((payload) => payload.text);
    assert.equal(final.slug, "acme");
    assert.equal(final.threadId, "acme:general");
    assert.equal(final.agent, "hermes");
    assert.equal(final.missionControlRunId, "run_mc_hermes");
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
  }
});

test("Hermes spawn error emits exactly one terminal callback", async () => {
  const previous = {
    HERMES_BRIDGE_SECRET: process.env.HERMES_BRIDGE_SECRET,
    HERMES_CLI: process.env.HERMES_CLI,
    HERMES_CONTEXT_PACK_ENABLED: process.env.HERMES_CONTEXT_PACK_ENABLED,
    SANCHO_WEBHOOK_URL: process.env.SANCHO_WEBHOOK_URL,
  };
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
  }
});
