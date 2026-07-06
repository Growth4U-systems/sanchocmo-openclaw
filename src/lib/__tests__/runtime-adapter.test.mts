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
  assert.equal(adapter.capabilities.cron, true);

  runtime.resetRuntimeForTests();
  if (previous === undefined) delete process.env.SANCHO_RUNTIME;
  else process.env.SANCHO_RUNTIME = previous;
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
  assert.equal(adapter.capabilities.cron, false);

  runtime.resetRuntimeForTests();
  if (previous === undefined) delete process.env.SANCHO_RUNTIME;
  else process.env.SANCHO_RUNTIME = previous;
});

test("fake runtime is rejected outside test mode", () => {
  const previousRuntime = process.env.SANCHO_RUNTIME;
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.SANCHO_RUNTIME = "fake";
  process.env.NODE_ENV = "production";
  runtime.resetRuntimeForTests();

  assert.throws(() => runtime.getRuntime(), /Unknown SANCHO_RUNTIME: fake/);

  runtime.resetRuntimeForTests();
  if (previousRuntime === undefined) delete process.env.SANCHO_RUNTIME;
  else process.env.SANCHO_RUNTIME = previousRuntime;
  if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousNodeEnv;
});

test("fake runtime can exercise Sancho without OpenClaw or an external endpoint", async () => {
  const previousRuntime = process.env.SANCHO_RUNTIME;
  const previousNodeEnv = process.env.NODE_ENV;
  const previousFakeHome = process.env.SANCHO_FAKE_RUNTIME_HOME;
  const previousFakeResponse = process.env.SANCHO_FAKE_RUNTIME_RESPONSE;
  const previousFetch = globalThis.fetch;
  const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "sancho-fake-runtime-"));

  process.env.SANCHO_RUNTIME = "fake";
  process.env.NODE_ENV = "test";
  process.env.SANCHO_FAKE_RUNTIME_HOME = fakeHome;
  process.env.SANCHO_FAKE_RUNTIME_RESPONSE = "fake-ok {{threadId}} {{text}}";
  runtime.resetRuntimeForTests();

  globalThis.fetch = (async () => {
    throw new Error("fake runtime must not fetch");
  }) as typeof fetch;

  try {
    const adapter = runtime.getRuntime();
    const result = await adapter.messaging.sendInbound({
      slug: "acme",
      threadId: "acme:general",
      text: "hola",
      userId: "mc-admin",
      userName: "Admin",
      agent: "sancho",
    });

    assert.equal(adapter.id, "fake");
    assert.equal(adapter.capabilities.chat, true);
    assert.equal(adapter.capabilities.cron, false);
    assert.equal(adapter.state.home(), fakeHome);
    assert.equal(adapter.state.runtimeFile("x.json"), path.join(fakeHome, "x.json"));
    assert.equal(result.ok, true);
    assert.equal(result.status, 200);
    assert.equal(result.chatId, "fake:acme:general");
    assert.equal(result.finalText, "fake-ok acme:general hola");
    assert.equal(result.finalAgent, "sancho");
    assert.deepEqual(adapter.state.loadAgentSessions("sancho"), {});
    assert.equal(adapter.state.getRunningCronJobs({}).size, 0);
    assert.deepEqual(await adapter.lifecycle.healthcheck(), {
      ok: true,
      details: { home: fakeHome, mode: "test" },
    });
    await adapter.messaging.cancel("acme:general", { slug: "acme", agent: "sancho" });
    await assert.rejects(() => adapter.control.listAgents(), /Fake runtime does not support listAgents/);
  } finally {
    globalThis.fetch = previousFetch;
    fs.rmSync(fakeHome, { recursive: true, force: true });
    runtime.resetRuntimeForTests();
    if (previousRuntime === undefined) delete process.env.SANCHO_RUNTIME;
    else process.env.SANCHO_RUNTIME = previousRuntime;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousFakeHome === undefined) delete process.env.SANCHO_FAKE_RUNTIME_HOME;
    else process.env.SANCHO_FAKE_RUNTIME_HOME = previousFakeHome;
    if (previousFakeResponse === undefined) delete process.env.SANCHO_FAKE_RUNTIME_RESPONSE;
    else process.env.SANCHO_FAKE_RUNTIME_RESPONSE = previousFakeResponse;
  }
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
  process.env.SANCHO_RUNTIME = "openclaw";
  process.env.HERMES_GATEWAY_URL = "http://hermes.test";
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
      text: "hola",
      userId: "mc-admin",
      userName: "Admin",
    });

    assert.equal(result.ok, true);
    assert.equal(result.chatId, "external_run_1");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://customer-runtime.test/runtime/inbound");
    assert.equal((calls[0].init?.headers as Record<string, string>)["X-MC-Secret"], "external-secret");
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

test("external HTTP adapter can speak the mc-bridge chat protocol", async () => {
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
      text: "hola",
      userId: "mc-admin",
      userName: "Admin",
      agent: "dulcinea",
      skill: "content-writer",
    });

    assert.equal(result.ok, true);
    assert.equal(result.chatId, "bridge-session-1");
    assert.equal(result.finalText, "respuesta desde Hermes");
    assert.equal(result.finalAgent, "dulcinea");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://mc-bridge.test/chat");
    assert.equal(calls[0].init?.method, "POST");
    assert.equal((calls[0].init?.headers as Record<string, string>)["X-MC-Secret"], "bridge-secret");
    assert.equal((calls[0].init?.headers as Record<string, string>).Authorization, "Bearer bridge-secret");
    const body = JSON.parse(String(calls[0].init?.body));
    assert.equal(body.agent, "sancho-coordinator");
    assert.equal(body.sessionKey, "test-sancho:acme:general");
    assert.match(body.message, /Contexto Sancho:/);
    assert.match(body.message, /Skill seed: content-writer/);
    assert.match(body.message, /Mensaje:\nhola/);
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

test("OpenClaw adapter sends cancellation through the runtime boundary", async () => {
  const previousRuntime = process.env.SANCHO_RUNTIME;
  const previousGateway = process.env.MC_CHAT_GATEWAY;
  const previousSecret = process.env.MC_CHAT_SECRET;
  const previousFetch = globalThis.fetch;
  const calls: { url: string; init?: RequestInit }[] = [];

  process.env.SANCHO_RUNTIME = "openclaw";
  process.env.MC_CHAT_GATEWAY = "https://openclaw-gateway.test";
  process.env.MC_CHAT_SECRET = "managed-secret";
  runtime.resetRuntimeForTests();

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;

  try {
    await runtime.getRuntime().messaging.cancel("acme:general", {
      slug: "acme",
      agent: "dulcinea",
      agentId: "dulcinea",
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://openclaw-gateway.test/mc-chat/inbound");
    assert.equal(calls[0].init?.method, "POST");
    assert.equal((calls[0].init?.headers as Record<string, string>)["X-MC-Secret"], "managed-secret");
    const body = JSON.parse(String(calls[0].init?.body));
    assert.equal(body.slug, "acme");
    assert.equal(body.threadId, "acme:general");
    assert.equal(body.text, "/stop");
    assert.equal(body.agent, "dulcinea");
    assert.equal(body.agentId, "dulcinea");
  } finally {
    globalThis.fetch = previousFetch;
    runtime.resetRuntimeForTests();
    if (previousRuntime === undefined) delete process.env.SANCHO_RUNTIME;
    else process.env.SANCHO_RUNTIME = previousRuntime;
    if (previousGateway === undefined) delete process.env.MC_CHAT_GATEWAY;
    else process.env.MC_CHAT_GATEWAY = previousGateway;
    if (previousSecret === undefined) delete process.env.MC_CHAT_SECRET;
    else process.env.MC_CHAT_SECRET = previousSecret;
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
  const previousSecret = process.env.HERMES_CHAT_SECRET;
  const previousFetch = globalThis.fetch;
  const calls: { url: string; init?: RequestInit }[] = [];

  process.env.SANCHO_RUNTIME = "hermes";
  process.env.HERMES_GATEWAY_URL = "http://hermes.test/";
  process.env.HERMES_INBOUND_PATH = "runtime/inbound";
  process.env.HERMES_CHAT_SECRET = "shh";
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
    assert.equal((calls[0].init?.headers as Record<string, string>)["X-MC-Secret"], "shh");
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
    if (previousSecret === undefined) delete process.env.HERMES_CHAT_SECRET;
    else process.env.HERMES_CHAT_SECRET = previousSecret;
  }
});
