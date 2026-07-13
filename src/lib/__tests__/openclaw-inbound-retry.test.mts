import assert from "node:assert/strict";
import test from "node:test";
import type { InboundMessage } from "../runtime/types";

const { sendOpenclawInbound } = await import("../runtime/adapters/openclaw/messaging");

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

test("retries the gateway forward on a connection-level failure, then succeeds", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    if (calls < 3) throw new TypeError("fetch failed");
    return jsonResponse(202, { chatId: "chat-1" });
  }) as typeof fetch;
  try {
    const result = await sendOpenclawInbound(inbound);
    assert.equal(result.ok, true);
    assert.equal(result.status, 202);
    assert.equal(result.chatId, "chat-1");
    assert.equal(calls, 3);
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
