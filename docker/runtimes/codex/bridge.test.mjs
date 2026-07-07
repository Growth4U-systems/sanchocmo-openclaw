import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import {
  buildCodexArgs,
  buildCodexPrompt,
  cleanCodexOutput,
  createServer,
  fetchContextPack,
} from "./bridge.mjs";

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
  assert.match(prompt, /"threadId": "acme:content:123"/);
  assert.match(prompt, /"agent": "dulcinea"/);
  assert.match(prompt, /"docPath": "brand\/acme\/content\/draft.md"/);
  assert.match(prompt, /Sancho context pack/);
  assert.match(prompt, /Brand context summary/);
  assert.match(prompt, /Revisa este draft/);
});

test("buildCodexArgs wires non-interactive exec defaults", () => {
  const previous = {
    CODEX_RUNTIME_MODEL: process.env.CODEX_RUNTIME_MODEL,
    CODEX_RUNTIME_SANDBOX: process.env.CODEX_RUNTIME_SANDBOX,
    CODEX_RUNTIME_APPROVAL_POLICY: process.env.CODEX_RUNTIME_APPROVAL_POLICY,
    CODEX_RUNTIME_WORKDIR: process.env.CODEX_RUNTIME_WORKDIR,
  };
  process.env.CODEX_RUNTIME_MODEL = "gpt-5.1-codex";
  process.env.CODEX_RUNTIME_SANDBOX = "read-only";
  process.env.CODEX_RUNTIME_APPROVAL_POLICY = "never";
  process.env.CODEX_RUNTIME_WORKDIR = "/tmp/sancho-codex";

  try {
    const args = buildCodexArgs({ threadId: "acme:general" }, "hello", "/tmp/out.txt");

    assert.equal(args[0], "exec");
    assert.equal(args[args.indexOf("-m") + 1], "gpt-5.1-codex");
    assert.equal(args[args.indexOf("-s") + 1], "read-only");
    assert.equal(args[args.indexOf("-a") + 1], "never");
    assert.equal(args[args.indexOf("-C") + 1], "/tmp/sancho-codex");
    assert.ok(args.includes("--skip-git-repo-check"));
    assert.ok(args.includes("--ephemeral"));
    assert.equal(args[args.indexOf("-o") + 1], "/tmp/out.txt");
    assert.equal(args.at(-1), "hello");
  } finally {
    restoreEnv(previous);
  }
});

test("fetchContextPack calls Sancho context-pack endpoint with shared secret", async () => {
  const previous = {
    CODEX_CONTEXT_PACK_URL: process.env.CODEX_CONTEXT_PACK_URL,
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
      calls.push({ path: req.url, secret: req.headers["x-mc-secret"], body: JSON.parse(raw) });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ slug: "acme", skill: "seo-content", verdict: "ok" }));
    });
  });
  const address = await listen(server);
  process.env.CODEX_CONTEXT_PACK_URL = `http://127.0.0.1:${address.port}/api/chat/context-pack`;
  process.env.CODEX_SANCHO_SECRET = "sancho-secret";
  delete process.env.CODEX_CONTEXT_PACK_ENABLED;

  try {
    const pack = await fetchContextPack({ slug: "acme", skill: "seo-content" });

    assert.deepEqual(pack, { slug: "acme", skill: "seo-content", verdict: "ok" });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].path, "/api/chat/context-pack");
    assert.equal(calls[0].secret, "sancho-secret");
    assert.deepEqual(calls[0].body, { slug: "acme", skill: "seo-content" });
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
    CODEX_CLI: process.env.CODEX_CLI,
    CODEX_RUNTIME_TIMEOUT_MS: process.env.CODEX_RUNTIME_TIMEOUT_MS,
    CODEX_CONTEXT_PACK_ENABLED: process.env.CODEX_CONTEXT_PACK_ENABLED,
    SANCHO_WEBHOOK_URL: process.env.SANCHO_WEBHOOK_URL,
  };
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

  process.env.CODEX_BRIDGE_SECRET = "test-secret";
  process.env.CODEX_CLI = "/bin/echo";
  process.env.CODEX_RUNTIME_TIMEOUT_MS = "5000";
  process.env.CODEX_CONTEXT_PACK_ENABLED = "0";
  process.env.SANCHO_WEBHOOK_URL = `http://127.0.0.1:${webhookAddr.port}/api/chat/webhook`;

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
    assert.equal(progress.agent, "sancho");
    assert.equal(progress.event.kind, "thinking");
    assert.equal(final.slug, "acme");
    assert.equal(final.threadId, "acme:general");
    assert.equal(final.agent, "sancho");
    assert.match(final.text, /exec/);
  } finally {
    await close(bridge);
    await close(webhook);
    restoreEnv(previous);
  }
});
