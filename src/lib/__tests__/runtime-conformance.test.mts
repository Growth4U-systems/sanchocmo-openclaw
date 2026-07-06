import assert from "node:assert/strict";
import { test } from "node:test";
import * as runtimeModule from "../runtime";
import type {
  RuntimeAdapter,
  RuntimeCapability,
  RuntimeId,
  SendInboundResult,
} from "../runtime";

const runtime =
  (runtimeModule as unknown as { default: typeof runtimeModule }).default ?? runtimeModule;

const RUNTIME_CAPABILITIES: RuntimeCapability[] = [
  "chat",
  "cron",
  "modelPicker",
  "agentRegistry",
  "discord",
  "slack",
];

function assertAdapterShape(adapter: RuntimeAdapter) {
  assert.equal(typeof adapter.id, "string");
  assert.notEqual(adapter.id.trim(), "");
  assert.equal(typeof adapter.displayName, "string");
  assert.notEqual(adapter.displayName.trim(), "");

  for (const capability of RUNTIME_CAPABILITIES) {
    assert.equal(typeof adapter.capabilities[capability], "boolean");
  }

  assert.equal(typeof adapter.messaging.sendInbound, "function");
  assert.equal(typeof adapter.messaging.cancel, "function");
  assert.equal(typeof adapter.control.runCommand, "function");
  assert.equal(typeof adapter.state.home, "function");
  assert.equal(typeof adapter.lifecycle.healthcheck, "function");
  assert.equal(typeof adapter.lifecycle.restart, "function");
}

async function assertChatDispatchContract(adapter: RuntimeAdapter): Promise<SendInboundResult> {
  assertAdapterShape(adapter);

  const result = await adapter.messaging.sendInbound({
    slug: "contract",
    threadId: "contract:runtime",
    threadName: "Runtime contract",
    text: "contract ping",
    userId: "contract-user",
    userName: "Contract User",
    agent: "sancho",
    skill: "sancho-manager",
  });

  assert.equal(result.ok, true);
  assert.equal(typeof result.status, "number");
  assert.equal(result.status >= 200 && result.status < 300, true);
  assert.equal(typeof result.raw, "string");
  assert.notEqual(result.raw.length, 0);
  assert.equal(typeof result.chatId, "string");

  await adapter.messaging.cancel("contract:runtime", {
    slug: "contract",
    agent: "sancho",
    agentId: "sancho",
  });

  const health = await adapter.lifecycle.healthcheck();
  assert.equal(typeof health.ok, "boolean");
  assert.equal(typeof adapter.state.home(), "string");
  assert.equal(typeof adapter.state.runtimeFile("contract.json"), "string");
  assert.equal(adapter.state.getRunningCronJobs({}) instanceof Map, true);

  return result;
}

test("fake runtime satisfies the chat dispatch contract without external services", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousResponse = process.env.SANCHO_FAKE_RUNTIME_RESPONSE;
  process.env.NODE_ENV = "test";
  process.env.SANCHO_FAKE_RUNTIME_RESPONSE = "contract-ok {{threadId}}";

  try {
    const result = await assertChatDispatchContract(runtime.createRuntimeAdapter("fake" as RuntimeId));
    assert.equal(result.finalText, "contract-ok contract:runtime");
    assert.equal(result.finalAgent, "sancho");
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousResponse === undefined) delete process.env.SANCHO_FAKE_RUNTIME_RESPONSE;
    else process.env.SANCHO_FAKE_RUNTIME_RESPONSE = previousResponse;
  }
});

test("external HTTP runtime satisfies the async chat dispatch contract", async () => {
  const previousGateway = process.env.SANCHO_EXTERNAL_GATEWAY_URL;
  const previousSecret = process.env.SANCHO_EXTERNAL_SECRET;
  const previousProtocol = process.env.SANCHO_EXTERNAL_PROTOCOL;
  const previousFetch = globalThis.fetch;
  const calls: { url: string; init?: RequestInit }[] = [];

  process.env.SANCHO_EXTERNAL_GATEWAY_URL = "https://runtime-contract.test";
  process.env.SANCHO_EXTERNAL_SECRET = "contract-secret";
  delete process.env.SANCHO_EXTERNAL_PROTOCOL;

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    if (String(input).endsWith("/healthz")) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    return new Response(JSON.stringify({ runId: "contract-run" }), { status: 202 });
  }) as typeof fetch;

  try {
    const result = await assertChatDispatchContract(runtime.createRuntimeAdapter("external-http" as RuntimeId));
    assert.equal(result.chatId, "contract-run");
    assert.equal(calls[0].url, "https://runtime-contract.test/sancho/inbound");
    assert.equal((calls[0].init?.headers as Record<string, string>)["X-MC-Secret"], "contract-secret");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousGateway === undefined) delete process.env.SANCHO_EXTERNAL_GATEWAY_URL;
    else process.env.SANCHO_EXTERNAL_GATEWAY_URL = previousGateway;
    if (previousSecret === undefined) delete process.env.SANCHO_EXTERNAL_SECRET;
    else process.env.SANCHO_EXTERNAL_SECRET = previousSecret;
    if (previousProtocol === undefined) delete process.env.SANCHO_EXTERNAL_PROTOCOL;
    else process.env.SANCHO_EXTERNAL_PROTOCOL = previousProtocol;
  }
});
