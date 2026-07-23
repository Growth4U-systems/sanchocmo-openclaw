import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, afterEach, test } from "node:test";
import assert from "node:assert/strict";
import * as runtimeModule from "../runtime";

const runtime =
  (runtimeModule as unknown as { default: typeof runtimeModule }).default ?? runtimeModule;
const previousRuntimeConfigFile = process.env.SANCHO_RUNTIME_CONFIG_FILE;
const testRuntimeConfigFile = path.join(os.tmpdir(), `sancho-runtime-${process.pid}.json`);

process.env.SANCHO_RUNTIME_CONFIG_FILE = testRuntimeConfigFile;

afterEach(() => {
  runtime.resetRuntimeForTests();
  fs.rmSync(testRuntimeConfigFile, { force: true });
});

after(() => {
  if (previousRuntimeConfigFile === undefined) delete process.env.SANCHO_RUNTIME_CONFIG_FILE;
  else process.env.SANCHO_RUNTIME_CONFIG_FILE = previousRuntimeConfigFile;
});

test("getRuntime defaults to the OpenClaw adapter", () => {
  const previous = process.env.SANCHO_RUNTIME;
  delete process.env.SANCHO_RUNTIME;
  runtime.resetRuntimeForTests();

  const adapter = runtime.getRuntime();

  assert.equal(adapter.id, "openclaw");
  assert.equal(adapter.capabilities.chat, true);
  assert.equal(adapter.capabilities.durableChatTurns, true);
  assert.equal(adapter.capabilities.cron, true);

  runtime.resetRuntimeForTests();
  if (previous === undefined) delete process.env.SANCHO_RUNTIME;
  else process.env.SANCHO_RUNTIME = previous;
});

test("OpenClaw health verifies the mc-chat plugin instead of only the gateway", async () => {
  const previousGateway = process.env.MC_CHAT_GATEWAY;
  const previousSecret = process.env.MC_CHAT_SECRET;
  const previousFetch = globalThis.fetch;
  const calls: { url: string; init?: RequestInit }[] = [];
  process.env.MC_CHAT_GATEWAY = "https://openclaw.test";
  process.env.MC_CHAT_SECRET = "health-secret";

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify({ ok: true, channel: "mc-chat" }), { status: 200 });
  }) as typeof fetch;

  try {
    const health = await runtime.createRuntimeAdapter("openclaw").lifecycle.healthcheck();
    assert.equal(health.ok, true);
    assert.equal(calls[0].url, "https://openclaw.test/mc-chat/health");
    assert.equal((calls[0].init?.headers as Record<string, string>)["X-MC-Secret"], "health-secret");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousGateway === undefined) delete process.env.MC_CHAT_GATEWAY;
    else process.env.MC_CHAT_GATEWAY = previousGateway;
    if (previousSecret === undefined) delete process.env.MC_CHAT_SECRET;
    else process.env.MC_CHAT_SECRET = previousSecret;
  }
});

test("OpenClaw health fails when the gateway is alive but mc-chat is missing", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("Not Found", { status: 404 })) as typeof fetch;

  try {
    const health = await runtime.createRuntimeAdapter("openclaw").lifecycle.healthcheck();
    assert.equal(health.ok, false);
    assert.equal(health.details?.status, 404);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("getRuntime memoizes the selected adapter", () => {
  const previous = process.env.SANCHO_RUNTIME;
  process.env.SANCHO_RUNTIME = "openclaw";
  runtime.resetRuntimeForTests();

  const first = runtime.getRuntime();
  const second = runtime.getRuntime();

  assert.equal(first, second);

  runtime.resetRuntimeForTests();
  if (previous === undefined) delete process.env.SANCHO_RUNTIME;
  else process.env.SANCHO_RUNTIME = previous;
});

test("getRuntime observes a persisted selection written by another process", () => {
  const previousRuntime = process.env.SANCHO_RUNTIME;
  const previousGateway = process.env.HERMES_GATEWAY_URL;
  const previousSecret = process.env.HERMES_BRIDGE_SECRET;
  try {
    process.env.SANCHO_RUNTIME = "openclaw";
    process.env.HERMES_GATEWAY_URL = "http://hermes.test";
    process.env.HERMES_BRIDGE_SECRET = "bridge-secret";
    runtime.resetRuntimeForTests();

    const first = runtime.getRuntime();
    fs.writeFileSync(
      testRuntimeConfigFile,
      JSON.stringify({ runtime: "hermes", updatedAt: "2026-07-22T00:00:00.000Z" }),
      "utf8",
    );
    const second = runtime.getRuntime();

    assert.equal(first.id, "openclaw");
    assert.equal(second.id, "hermes");
    assert.notEqual(first, second);
  } finally {
    runtime.resetRuntimeForTests();
    if (previousRuntime === undefined) delete process.env.SANCHO_RUNTIME;
    else process.env.SANCHO_RUNTIME = previousRuntime;
    if (previousGateway === undefined) delete process.env.HERMES_GATEWAY_URL;
    else process.env.HERMES_GATEWAY_URL = previousGateway;
    if (previousSecret === undefined) delete process.env.HERMES_BRIDGE_SECRET;
    else process.env.HERMES_BRIDGE_SECRET = previousSecret;
  }
});

test("async HTTP runtimes are not configured without callback authority", () => {
  const keys = [
    "HERMES_GATEWAY_URL",
    "HERMES_BASE_URL",
    "HERMES_URL",
    "HERMES_BRIDGE_SECRET",
    "HERMES_CHAT_SECRET",
    "HERMES_SHARED_SECRET",
    "MC_CHAT_SECRET",
    "SANCHO_EXTERNAL_GATEWAY_URL",
    "SANCHO_EXTERNAL_RUNTIME_URL",
    "HERMES_EXTERNAL_GATEWAY_URL",
    "HERMES_EXTERNAL_BASE_URL",
    "HERMES_EXTERNAL_URL",
    "SANCHO_EXTERNAL_SECRET",
    "SANCHO_EXTERNAL_RUNTIME_SECRET",
    "HERMES_EXTERNAL_SECRET",
    "HERMES_EXTERNAL_API_KEY",
    "HERMES_EXTERNAL_CHAT_SECRET",
    "SANCHO_EXTERNAL_PROTOCOL",
    "SANCHO_EXTERNAL_RUNTIME_PROTOCOL",
    "HERMES_EXTERNAL_PROTOCOL",
  ] as const;
  const previous = new Map(keys.map((key) => [key, process.env[key]]));
  try {
    for (const key of keys) delete process.env[key];
    process.env.HERMES_GATEWAY_URL = "http://hermes.test";
    assert.equal(runtime.isRuntimeConfigured("hermes"), false);
    process.env.HERMES_BRIDGE_SECRET = "bridge-secret";
    assert.equal(runtime.isRuntimeConfigured("hermes"), true);

    process.env.SANCHO_EXTERNAL_GATEWAY_URL = "https://runtime.test";
    assert.equal(runtime.isRuntimeConfigured("external-http"), false);
    process.env.SANCHO_EXTERNAL_SECRET = "external-secret";
    assert.equal(runtime.isRuntimeConfigured("external-http"), true);
    delete process.env.SANCHO_EXTERNAL_SECRET;
    process.env.SANCHO_EXTERNAL_PROTOCOL = "mc-bridge";
    assert.equal(runtime.isRuntimeConfigured("external-http"), true);
  } finally {
    for (const key of keys) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("getRuntime fails closed for unknown runtime ids", () => {
  const previous = process.env.SANCHO_RUNTIME;
  process.env.SANCHO_RUNTIME = "nope";
  runtime.resetRuntimeForTests();

  assert.throws(() => runtime.getRuntime(), /Unknown SANCHO_RUNTIME: nope/);

  runtime.resetRuntimeForTests();
  if (previous === undefined) delete process.env.SANCHO_RUNTIME;
  else process.env.SANCHO_RUNTIME = previous;
});

test("getRuntime selects the Hermes adapter", () => {
  const previous = process.env.SANCHO_RUNTIME;
  process.env.SANCHO_RUNTIME = "hermes";
  runtime.resetRuntimeForTests();

  const adapter = runtime.getRuntime();

  assert.equal(adapter.id, "hermes");
  assert.equal(adapter.capabilities.chat, true);
  assert.equal(adapter.capabilities.durableChatTurns, false);
  assert.equal(adapter.capabilities.cron, false);
  assert.equal(adapter.capabilities.discord, false);

  runtime.resetRuntimeForTests();
  if (previous === undefined) delete process.env.SANCHO_RUNTIME;
  else process.env.SANCHO_RUNTIME = previous;
});

test("getRuntime selects the external HTTP adapter", () => {
  const previous = process.env.SANCHO_RUNTIME;
  process.env.SANCHO_RUNTIME = "external-http";
  runtime.resetRuntimeForTests();

  const adapter = runtime.getRuntime();

  assert.equal(adapter.id, "external-http");
  assert.equal(adapter.displayName, "Runtime externo HTTP");
  assert.equal(adapter.capabilities.chat, true);
  assert.equal(adapter.capabilities.durableChatTurns, false);
  assert.equal(adapter.capabilities.cron, false);

  runtime.resetRuntimeForTests();
  if (previous === undefined) delete process.env.SANCHO_RUNTIME;
  else process.env.SANCHO_RUNTIME = previous;
});

test("legacy hermes-external runtime id maps to external-http", () => {
  const previous = process.env.SANCHO_RUNTIME;
  process.env.SANCHO_RUNTIME = "hermes-external";
  runtime.resetRuntimeForTests();

  const adapter = runtime.getRuntime();
  const selection = runtime.readRuntimeSelection();

  assert.equal(adapter.id, "external-http");
  assert.equal(selection.runtime, "external-http");
  assert.equal(selection.envRuntime, "hermes-external");

  runtime.resetRuntimeForTests();
  if (previous === undefined) delete process.env.SANCHO_RUNTIME;
  else process.env.SANCHO_RUNTIME = previous;
});

test("persisted runtime selection from the UI overrides SANCHO_RUNTIME", () => {
  const previous = process.env.SANCHO_RUNTIME;
  const previousGateway = process.env.HERMES_GATEWAY_URL;
  const previousSecret = process.env.HERMES_BRIDGE_SECRET;
  process.env.SANCHO_RUNTIME = "openclaw";
  process.env.HERMES_GATEWAY_URL = "http://hermes.test";
  process.env.HERMES_BRIDGE_SECRET = "bridge-secret";
  fs.writeFileSync(
    testRuntimeConfigFile,
    JSON.stringify({ runtime: "hermes", updatedAt: "2026-07-01T00:00:00.000Z" }),
    "utf8",
  );
  runtime.resetRuntimeForTests();

  const adapter = runtime.getRuntime();
  const selection = runtime.readRuntimeSelection();

  assert.equal(adapter.id, "hermes");
  assert.equal(selection.runtime, "hermes");
  assert.equal(selection.source, "ui");

  runtime.resetRuntimeForTests();
  if (previous === undefined) delete process.env.SANCHO_RUNTIME;
  else process.env.SANCHO_RUNTIME = previous;
  if (previousGateway === undefined) delete process.env.HERMES_GATEWAY_URL;
  else process.env.HERMES_GATEWAY_URL = previousGateway;
  if (previousSecret === undefined) delete process.env.HERMES_BRIDGE_SECRET;
  else process.env.HERMES_BRIDGE_SECRET = previousSecret;
});

test("persisted external HTTP selection falls back when not configured", () => {
  const previousRuntime = process.env.SANCHO_RUNTIME;
  const previousExternalGateway = process.env.SANCHO_EXTERNAL_GATEWAY_URL;
  const previousExternalRuntimeUrl = process.env.SANCHO_EXTERNAL_RUNTIME_URL;
  const previousLegacyGateway = process.env.HERMES_EXTERNAL_GATEWAY_URL;
  const previousExternalBase = process.env.HERMES_EXTERNAL_BASE_URL;
  const previousExternalUrl = process.env.HERMES_EXTERNAL_URL;
  delete process.env.SANCHO_RUNTIME;
  delete process.env.SANCHO_EXTERNAL_GATEWAY_URL;
  delete process.env.SANCHO_EXTERNAL_RUNTIME_URL;
  delete process.env.HERMES_EXTERNAL_GATEWAY_URL;
  delete process.env.HERMES_EXTERNAL_BASE_URL;
  delete process.env.HERMES_EXTERNAL_URL;
  fs.writeFileSync(
    testRuntimeConfigFile,
    JSON.stringify({ runtime: "external-http", updatedAt: "2026-07-01T00:00:00.000Z" }),
    "utf8",
  );
  runtime.resetRuntimeForTests();

  const adapter = runtime.getRuntime();
  const selection = runtime.readRuntimeSelection();

  assert.equal(adapter.id, "openclaw");
  assert.equal(selection.runtime, "openclaw");
  assert.equal(selection.source, "default");

  runtime.resetRuntimeForTests();
  if (previousRuntime === undefined) delete process.env.SANCHO_RUNTIME;
  else process.env.SANCHO_RUNTIME = previousRuntime;
  if (previousExternalGateway === undefined) delete process.env.SANCHO_EXTERNAL_GATEWAY_URL;
  else process.env.SANCHO_EXTERNAL_GATEWAY_URL = previousExternalGateway;
  if (previousExternalRuntimeUrl === undefined) delete process.env.SANCHO_EXTERNAL_RUNTIME_URL;
  else process.env.SANCHO_EXTERNAL_RUNTIME_URL = previousExternalRuntimeUrl;
  if (previousLegacyGateway === undefined) delete process.env.HERMES_EXTERNAL_GATEWAY_URL;
  else process.env.HERMES_EXTERNAL_GATEWAY_URL = previousLegacyGateway;
  if (previousExternalBase === undefined) delete process.env.HERMES_EXTERNAL_BASE_URL;
  else process.env.HERMES_EXTERNAL_BASE_URL = previousExternalBase;
  if (previousExternalUrl === undefined) delete process.env.HERMES_EXTERNAL_URL;
  else process.env.HERMES_EXTERNAL_URL = previousExternalUrl;
});

test("persisted runtime selection falls back when the runtime is not configured", () => {
  const previousRuntime = process.env.SANCHO_RUNTIME;
  const previousGateway = process.env.HERMES_GATEWAY_URL;
  const previousBase = process.env.HERMES_BASE_URL;
  const previousUrl = process.env.HERMES_URL;
  delete process.env.SANCHO_RUNTIME;
  delete process.env.HERMES_GATEWAY_URL;
  delete process.env.HERMES_BASE_URL;
  delete process.env.HERMES_URL;
  fs.writeFileSync(
    testRuntimeConfigFile,
    JSON.stringify({ runtime: "hermes", updatedAt: "2026-07-01T00:00:00.000Z" }),
    "utf8",
  );
  runtime.resetRuntimeForTests();

  const adapter = runtime.getRuntime();
  const selection = runtime.readRuntimeSelection();

  assert.equal(adapter.id, "openclaw");
  assert.equal(selection.runtime, "openclaw");
  assert.equal(selection.source, "default");

  runtime.resetRuntimeForTests();
  if (previousRuntime === undefined) delete process.env.SANCHO_RUNTIME;
  else process.env.SANCHO_RUNTIME = previousRuntime;
  if (previousGateway === undefined) delete process.env.HERMES_GATEWAY_URL;
  else process.env.HERMES_GATEWAY_URL = previousGateway;
  if (previousBase === undefined) delete process.env.HERMES_BASE_URL;
  else process.env.HERMES_BASE_URL = previousBase;
  if (previousUrl === undefined) delete process.env.HERMES_URL;
  else process.env.HERMES_URL = previousUrl;
});

test("external HTTP adapter uses only external endpoint and secret", async () => {
  const previousRuntime = process.env.SANCHO_RUNTIME;
  const previousExternalGateway = process.env.SANCHO_EXTERNAL_GATEWAY_URL;
  const previousExternalPath = process.env.SANCHO_EXTERNAL_INBOUND_PATH;
  const previousExternalSecret = process.env.SANCHO_EXTERNAL_SECRET;
  const previousManagedSecret = process.env.MC_CHAT_SECRET;
  const previousFetch = globalThis.fetch;
  const calls: { url: string; init?: RequestInit }[] = [];

  process.env.SANCHO_RUNTIME = "external-http";
  process.env.SANCHO_EXTERNAL_GATEWAY_URL = "https://customer-runtime.test/";
  process.env.SANCHO_EXTERNAL_INBOUND_PATH = "runtime/inbound";
  process.env.SANCHO_EXTERNAL_SECRET = "external-secret";
  process.env.MC_CHAT_SECRET = "managed-secret";
  runtime.resetRuntimeForTests();

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify({ chatId: "external_run_1" }), { status: 202 });
  }) as typeof fetch;

  try {
    const result = await runtime.getRuntime().messaging.sendInbound({
      slug: "acme",
      threadId: "acme:general",
      text: "Busca leads de founders",
      runtimeEffectIntent: ["leads_search_start"],
      userId: "mc-admin",
      userName: "Admin",
      isAdmin: true,
      senderRole: "admin",
      readOnly: false,
      controlDepth: 0,
    });

    assert.equal(result.ok, true);
    assert.equal(result.chatId, "external_run_1");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://customer-runtime.test/runtime/inbound");
    assert.equal((calls[0].init?.headers as Record<string, string>)["X-MC-Secret"], "external-secret");
    const body = JSON.parse(String(calls[0].init?.body));
    assert.deepEqual(
      {
        schemaVersion: body.runtimeContract?.schemaVersion,
        kind: body.runtimeContract?.kind,
      },
      { schemaVersion: 1, kind: "sancho.mc-chat-context" },
    );
    assert.match(body.runtimeContract.instructions, /:::sancho-effect/);
    assert.match(body.runtimeContract.instructions, /leads_search_start/);
    assert.doesNotMatch(body.runtimeContract.instructions, /runtimeToolCapability/);
  } finally {
    globalThis.fetch = previousFetch;
    runtime.resetRuntimeForTests();
    if (previousRuntime === undefined) delete process.env.SANCHO_RUNTIME;
    else process.env.SANCHO_RUNTIME = previousRuntime;
    if (previousExternalGateway === undefined) delete process.env.SANCHO_EXTERNAL_GATEWAY_URL;
    else process.env.SANCHO_EXTERNAL_GATEWAY_URL = previousExternalGateway;
    if (previousExternalPath === undefined) delete process.env.SANCHO_EXTERNAL_INBOUND_PATH;
    else process.env.SANCHO_EXTERNAL_INBOUND_PATH = previousExternalPath;
    if (previousExternalSecret === undefined) delete process.env.SANCHO_EXTERNAL_SECRET;
    else process.env.SANCHO_EXTERNAL_SECRET = previousExternalSecret;
    if (previousManagedSecret === undefined) delete process.env.MC_CHAT_SECRET;
    else process.env.MC_CHAT_SECRET = previousManagedSecret;
  }
});

test("external HTTP bridge shares Sancho generalist and pinned skill semantics", async () => {
  const previousRuntime = process.env.SANCHO_RUNTIME;
  const previousExternalGateway = process.env.SANCHO_EXTERNAL_GATEWAY_URL;
  const previousExternalProtocol = process.env.SANCHO_EXTERNAL_PROTOCOL;
  const previousExternalSecret = process.env.SANCHO_EXTERNAL_SECRET;
  const previousExternalAgent = process.env.SANCHO_EXTERNAL_AGENT;
  const previousExternalPrefix = process.env.SANCHO_EXTERNAL_SESSION_PREFIX;
  const previousFetch = globalThis.fetch;
  const calls: { url: string; init?: RequestInit }[] = [];

  process.env.SANCHO_RUNTIME = "external-http";
  process.env.SANCHO_EXTERNAL_GATEWAY_URL = "https://mc-bridge.test/";
  process.env.SANCHO_EXTERNAL_PROTOCOL = "mc-bridge";
  process.env.SANCHO_EXTERNAL_SECRET = "bridge-secret";
  process.env.SANCHO_EXTERNAL_AGENT = "sancho-coordinator";
  process.env.SANCHO_EXTERNAL_SESSION_PREFIX = "test-sancho";
  runtime.resetRuntimeForTests();

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify({ response: "respuesta desde Hermes", sessionId: "bridge-session-1" }), {
      status: 200,
    });
  }) as typeof fetch;

  try {
    const result = await runtime.getRuntime().messaging.sendInbound({
      slug: "acme",
      threadId: "acme:general",
      threadName: "General",
      text: "Busca leads de founders",
      runtimeEffectIntent: ["leads_search_start"],
      userId: "mc-admin",
      userName: "Admin",
      isAdmin: true,
      senderRole: "admin",
      readOnly: false,
      controlDepth: 0,
    });

    assert.equal(result.ok, true);
    assert.equal(result.chatId, "bridge-session-1");
    assert.equal(result.finalText, "respuesta desde Hermes");
    assert.equal(result.finalAgent, "sancho");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://mc-bridge.test/chat");
    assert.equal(calls[0].init?.method, "POST");
    assert.equal((calls[0].init?.headers as Record<string, string>)["X-MC-Secret"], "bridge-secret");
    assert.equal((calls[0].init?.headers as Record<string, string>).Authorization, "Bearer bridge-secret");
    const body = JSON.parse(String(calls[0].init?.body));
    assert.equal(body.agent, "sancho-coordinator");
    assert.equal(body.sessionKey, "test-sancho:acme:general");
    assert.match(body.message, /\[MC Chat Context\]/);
    assert.match(body.message, /execution_mode: generalist/);
    assert.match(body.message, /skill_policy: auto/);
    assert.match(body.message, /Eres Sancho, el agente generalista/);
    assert.match(body.message, /:::delegate/);
    assert.match(body.message, /:::task-route/);
    assert.match(body.message, /:::sancho-effect/);
    assert.match(body.message, /leads_search_start/);
    assert.doesNotMatch(body.message, /skill_hint:/);
    assert.match(body.message, /Mensaje:\nBusca leads de founders/);

    const pinnedResult = await runtime.getRuntime().messaging.sendInbound({
      slug: "acme",
      threadId: "acme:general",
      threadName: "General",
      text: "escribe el borrador",
      userId: "mc-admin",
      userName: "Admin",
      agent: "dulcinea",
      skill: "content-writer",
    });
    assert.equal(pinnedResult.ok, true);
    assert.equal(calls.length, 2);
    const pinnedBody = JSON.parse(String(calls[1].init?.body));
    assert.match(pinnedBody.message, /execution_mode: guided/);
    assert.match(pinnedBody.message, /skill_policy: guided/);
    assert.match(pinnedBody.message, /primary_skill: content-writer/);
    assert.match(pinnedBody.message, /allowed_skills: content-writer/);
    assert.match(pinnedBody.message, /:::sancho-intervene/);
    assert.match(pinnedBody.message, /La skill primaria es el camino normal/i);
    assert.match(pinnedBody.message, /Solo la opción 4 activa resolución\/cambio\/creación de tarea/i);
  } finally {
    globalThis.fetch = previousFetch;
    runtime.resetRuntimeForTests();
    if (previousRuntime === undefined) delete process.env.SANCHO_RUNTIME;
    else process.env.SANCHO_RUNTIME = previousRuntime;
    if (previousExternalGateway === undefined) delete process.env.SANCHO_EXTERNAL_GATEWAY_URL;
    else process.env.SANCHO_EXTERNAL_GATEWAY_URL = previousExternalGateway;
    if (previousExternalProtocol === undefined) delete process.env.SANCHO_EXTERNAL_PROTOCOL;
    else process.env.SANCHO_EXTERNAL_PROTOCOL = previousExternalProtocol;
    if (previousExternalSecret === undefined) delete process.env.SANCHO_EXTERNAL_SECRET;
    else process.env.SANCHO_EXTERNAL_SECRET = previousExternalSecret;
    if (previousExternalAgent === undefined) delete process.env.SANCHO_EXTERNAL_AGENT;
    else process.env.SANCHO_EXTERNAL_AGENT = previousExternalAgent;
    if (previousExternalPrefix === undefined) delete process.env.SANCHO_EXTERNAL_SESSION_PREFIX;
    else process.env.SANCHO_EXTERNAL_SESSION_PREFIX = previousExternalPrefix;
  }
});

test("Hermes adapter reports clear configuration errors", async () => {
  const previousRuntime = process.env.SANCHO_RUNTIME;
  const previousGateway = process.env.HERMES_GATEWAY_URL;
  const previousBase = process.env.HERMES_BASE_URL;
  const previousUrl = process.env.HERMES_URL;
  process.env.SANCHO_RUNTIME = "hermes";
  delete process.env.HERMES_GATEWAY_URL;
  delete process.env.HERMES_BASE_URL;
  delete process.env.HERMES_URL;
  runtime.resetRuntimeForTests();

  const result = await runtime.getRuntime().messaging.sendInbound({
    slug: "acme",
    threadId: "acme:general",
    text: "hola",
    userId: "mc-admin",
    userName: "Admin",
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 0);
  assert.match(result.error ?? "", /Hermes managed runtime is not configured/);

  runtime.resetRuntimeForTests();
  if (previousRuntime === undefined) delete process.env.SANCHO_RUNTIME;
  else process.env.SANCHO_RUNTIME = previousRuntime;
  if (previousGateway === undefined) delete process.env.HERMES_GATEWAY_URL;
  else process.env.HERMES_GATEWAY_URL = previousGateway;
  if (previousBase === undefined) delete process.env.HERMES_BASE_URL;
  else process.env.HERMES_BASE_URL = previousBase;
  if (previousUrl === undefined) delete process.env.HERMES_URL;
  else process.env.HERMES_URL = previousUrl;
});

test("Hermes adapter posts inbound messages to the configured bridge", async () => {
  const previousRuntime = process.env.SANCHO_RUNTIME;
  const previousGateway = process.env.HERMES_GATEWAY_URL;
  const previousPath = process.env.HERMES_INBOUND_PATH;
  const previousBridgeSecret = process.env.HERMES_BRIDGE_SECRET;
  const previousChatSecret = process.env.HERMES_CHAT_SECRET;
  const previousManagedSecret = process.env.MC_CHAT_SECRET;
  const previousFetch = globalThis.fetch;
  const calls: { url: string; init?: RequestInit }[] = [];

  process.env.SANCHO_RUNTIME = "hermes";
  process.env.HERMES_GATEWAY_URL = "http://hermes.test/";
  process.env.HERMES_INBOUND_PATH = "runtime/inbound";
  process.env.HERMES_BRIDGE_SECRET = "bridge-shh";
  process.env.HERMES_CHAT_SECRET = "legacy-shh";
  process.env.MC_CHAT_SECRET = "openclaw-shh";
  runtime.resetRuntimeForTests();

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify({ runId: "run_123" }), { status: 202 });
  }) as typeof fetch;

  try {
    const result = await runtime.getRuntime().messaging.sendInbound(
      {
        slug: "acme",
        threadId: "acme:general",
        text: "hola",
        userId: "mc-admin",
        userName: "Admin",
      },
      { timeoutMs: 1000, headers: { "X-Test": "1" } },
    );

    assert.equal(result.ok, true);
    assert.equal(result.status, 202);
    assert.equal(result.chatId, "run_123");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "http://hermes.test/runtime/inbound");
    assert.equal(calls[0].init?.method, "POST");
    assert.equal(
      (calls[0].init?.headers as Record<string, string>)["X-MC-Secret"],
      "bridge-shh",
    );
    assert.equal((calls[0].init?.headers as Record<string, string>)["X-Test"], "1");
    assert.equal(JSON.parse(String(calls[0].init?.body)).threadId, "acme:general");
  } finally {
    globalThis.fetch = previousFetch;
    runtime.resetRuntimeForTests();
    if (previousRuntime === undefined) delete process.env.SANCHO_RUNTIME;
    else process.env.SANCHO_RUNTIME = previousRuntime;
    if (previousGateway === undefined) delete process.env.HERMES_GATEWAY_URL;
    else process.env.HERMES_GATEWAY_URL = previousGateway;
    if (previousPath === undefined) delete process.env.HERMES_INBOUND_PATH;
    else process.env.HERMES_INBOUND_PATH = previousPath;
    if (previousBridgeSecret === undefined) delete process.env.HERMES_BRIDGE_SECRET;
    else process.env.HERMES_BRIDGE_SECRET = previousBridgeSecret;
    if (previousChatSecret === undefined) delete process.env.HERMES_CHAT_SECRET;
    else process.env.HERMES_CHAT_SECRET = previousChatSecret;
    if (previousManagedSecret === undefined) delete process.env.MC_CHAT_SECRET;
    else process.env.MC_CHAT_SECRET = previousManagedSecret;
  }
});
