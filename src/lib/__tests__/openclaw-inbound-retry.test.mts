import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import type { InboundMessage } from "../runtime/types";

const { createOpenclawChannelThread, sendOpenclawInbound } = await import(
  "../runtime/adapters/openclaw/messaging"
);

const inbound: InboundMessage = {
  slug: "demo",
  threadId: "demo:general",
  text: "hola",
  userId: "u1",
  userName: "U",
  controlBaseUrl: "http://127.0.0.1:3000",
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

test("retries the gateway forward on a connection-level failure, then succeeds", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  let observedSignal: AbortSignal | null = null;
  globalThis.fetch = (async (_input, init) => {
    calls += 1;
    observedSignal = init?.signal as AbortSignal;
    if (calls < 3) throw new TypeError("fetch failed");
    return jsonResponse(202, { chatId: "chat-1" });
  }) as typeof fetch;
  try {
    const result = await sendOpenclawInbound(inbound);
    assert.equal(result.ok, true);
    assert.equal(result.status, 202);
    assert.equal(result.chatId, "chat-1");
    assert.equal(calls, 3);
    assert.ok(observedSignal instanceof AbortSignal);
  } finally {
    globalThis.fetch = original;
  }
});

test("does not retry when the gateway answers with an HTTP error (avoids double-dispatch)", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return jsonResponse(409, { error: "conflict" });
  }) as typeof fetch;
  try {
    const result = await sendOpenclawInbound(inbound);
    assert.equal(result.ok, false);
    assert.equal(result.status, 409);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
  }
});

test("surfaces status 0 after exhausting retries on a persistent connection failure", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    throw new TypeError("fetch failed");
  }) as typeof fetch;
  try {
    const result = await sendOpenclawInbound(inbound);
    assert.equal(result.ok, false);
    assert.equal(result.status, 0);
    assert.equal(result.error, "fetch failed");
    assert.equal(calls, 3);
  } finally {
    globalThis.fetch = original;
  }
});

test("a cross-origin redirect cannot receive the runtime capability or gateway secret", async () => {
  const previousGateway = process.env.MC_CHAT_GATEWAY;
  const previousSecret = process.env.MC_CHAT_SECRET;
  let targetRequests = 0;
  const target = createServer((_req, res) => {
    targetRequests += 1;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ chatId: "should-not-arrive" }));
  });
  const targetOrigin = await listen(target);
  let sourceRequests = 0;
  const source = createServer((_req, res) => {
    sourceRequests += 1;
    res.writeHead(308, { Location: `${targetOrigin}/capture` });
    res.end();
  });
  const sourceOrigin = await listen(source);
  process.env.MC_CHAT_GATEWAY = sourceOrigin;
  process.env.MC_CHAT_SECRET = "redirect-secret";

  try {
    const result = await sendOpenclawInbound({
      ...inbound,
      missionControlRunId: "arun-redirect",
      runtimeToolCapability: "c".repeat(64),
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, 0);
    assert.equal(sourceRequests, 3, "redirect failures remain bounded by retry policy");
    assert.equal(targetRequests, 0, "fetch must never follow the redirect");
  } finally {
    if (previousGateway === undefined) delete process.env.MC_CHAT_GATEWAY;
    else process.env.MC_CHAT_GATEWAY = previousGateway;
    if (previousSecret === undefined) delete process.env.MC_CHAT_SECRET;
    else process.env.MC_CHAT_SECRET = previousSecret;
    await Promise.all([close(source), close(target)]);
  }
});

test("an invalid gateway URL fails before capability-bearing network I/O", async () => {
  const previousGateway = process.env.MC_CHAT_GATEWAY;
  const originalFetch = globalThis.fetch;
  let calls = 0;
  process.env.MC_CHAT_GATEWAY = "https://user:password@example.test/path";
  globalThis.fetch = (async () => {
    calls += 1;
    throw new Error("must not be called");
  }) as typeof fetch;
  try {
    const result = await sendOpenclawInbound({
      ...inbound,
      runtimeToolCapability: "d".repeat(64),
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, 0);
    assert.equal(result.error, "Invalid MC_CHAT_GATEWAY origin");
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousGateway === undefined) delete process.env.MC_CHAT_GATEWAY;
    else process.env.MC_CHAT_GATEWAY = previousGateway;
  }
});

test("Discord thread creation is disabled until scoped authority exists", async () => {
  const previousGateway = process.env.MC_CHAT_GATEWAY;
  const previousSecret = process.env.MC_CHAT_SECRET;
  const previousFallbackSecret = process.env.OPENCLAW_GATEWAY_TOKEN;
  const originalFetch = globalThis.fetch;
  let calls = 0;
  process.env.MC_CHAT_GATEWAY = "https://openclaw.test";
  process.env.MC_CHAT_SECRET = "discord-thread-secret";
  delete process.env.OPENCLAW_GATEWAY_TOKEN;
  globalThis.fetch = (async () => {
    calls += 1;
    throw new Error("must not be called");
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => createOpenclawChannelThread({ channelId: "channel-1", name: "Sancho" }),
      /disabled until scoped authority/i,
    );
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousGateway === undefined) delete process.env.MC_CHAT_GATEWAY;
    else process.env.MC_CHAT_GATEWAY = previousGateway;
    if (previousSecret === undefined) delete process.env.MC_CHAT_SECRET;
    else process.env.MC_CHAT_SECRET = previousSecret;
    if (previousFallbackSecret === undefined) delete process.env.OPENCLAW_GATEWAY_TOKEN;
    else process.env.OPENCLAW_GATEWAY_TOKEN = previousFallbackSecret;
  }
});
