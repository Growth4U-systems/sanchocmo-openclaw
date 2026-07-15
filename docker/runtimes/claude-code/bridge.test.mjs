import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import {
  buildClaudeArgs,
  buildClaudePrompt,
  buildMcpConfig,
  cleanClaudeStdout,
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

test("fetchContextPack calls Sancho context-pack endpoint with shared secret", async () => {
  const previous = {
    CLAUDE_CODE_CONTEXT_PACK_URL: process.env.CLAUDE_CODE_CONTEXT_PACK_URL,
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
      calls.push({ path: req.url, secret: req.headers["x-mc-secret"], body: JSON.parse(raw) });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ slug: "acme", skill: "seo-content", verdict: "ok" }));
    });
  });
  const address = await listen(server);
  process.env.CLAUDE_CODE_CONTEXT_PACK_URL = `http://127.0.0.1:${address.port}/api/chat/context-pack`;
  process.env.CLAUDE_CODE_SANCHO_SECRET = "sancho-secret";
  delete process.env.CLAUDE_CODE_CONTEXT_PACK_ENABLED;

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
    CLAUDE_CODE_CLI: process.env.CLAUDE_CODE_CLI,
    CLAUDE_CODE_RUNTIME_TIMEOUT_MS: process.env.CLAUDE_CODE_RUNTIME_TIMEOUT_MS,
    CLAUDE_CODE_RUNTIME_TOOLS: process.env.CLAUDE_CODE_RUNTIME_TOOLS,
    CLAUDE_CODE_CONTEXT_PACK_ENABLED: process.env.CLAUDE_CODE_CONTEXT_PACK_ENABLED,
    CLAUDE_CODE_SANCHO_MCP_URL: process.env.CLAUDE_CODE_SANCHO_MCP_URL,
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

  process.env.CLAUDE_CODE_BRIDGE_SECRET = "test-secret";
  process.env.CLAUDE_CODE_CLI = "/bin/echo";
  process.env.CLAUDE_CODE_RUNTIME_TIMEOUT_MS = "5000";
  process.env.CLAUDE_CODE_RUNTIME_TOOLS = "";
  process.env.CLAUDE_CODE_CONTEXT_PACK_ENABLED = "0";
  process.env.CLAUDE_CODE_SANCHO_MCP_URL = "http://localhost:3000/api/mcp/sancho";
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
        missionControlRunId: "run_mc_claude",
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
    assert.equal(progress.agent, "sancho");
    assert.equal(progress.missionControlRunId, "run_mc_claude");
    assert.equal(progress.event.kind, "thinking");
    assert.equal(final.slug, "acme");
    assert.equal(final.threadId, "acme:general");
    assert.equal(final.agent, "sancho");
    assert.equal(final.missionControlRunId, "run_mc_claude");
    assert.match(final.text, /--output-format json/);
  } finally {
    await close(bridge);
    await close(webhook);
    restoreEnv(previous);
  }
});

test("Claude Code spawn error emits exactly one terminal callback", async () => {
  const previous = {
    CLAUDE_CODE_BRIDGE_SECRET: process.env.CLAUDE_CODE_BRIDGE_SECRET,
    CLAUDE_CODE_CLI: process.env.CLAUDE_CODE_CLI,
    CLAUDE_CODE_CONTEXT_PACK_ENABLED: process.env.CLAUDE_CODE_CONTEXT_PACK_ENABLED,
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
  process.env.CLAUDE_CODE_BRIDGE_SECRET = "terminal-secret";
  process.env.CLAUDE_CODE_CLI = "/definitely/missing/claude";
  process.env.CLAUDE_CODE_CONTEXT_PACK_ENABLED = "0";
  process.env.SANCHO_WEBHOOK_URL = `http://127.0.0.1:${webhookAddr.port}/api/chat/webhook`;
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
  }
});
