import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMcChatContextBlock } from "../../../../src/lib/runtime/agent-contract/mc-chat-context.mjs";

test("buildMcChatContextBlock includes common MC chat contract and ask protocol", () => {
  const block = buildMcChatContextBlock({
    slug: "growth4u",
    threadId: "strategy",
    threadName: "Strategy",
    skill: "fast-foundation",
    requestedAgent: "sancho",
  });

  assert.ok(block.startsWith("[MC Chat Context]"));
  assert.ok(block.includes("channel: mc-chat"));
  assert.ok(block.includes("client_slug: growth4u"));
  assert.ok(block.includes("thread_id: strategy"));
  assert.ok(block.includes("thread_name: Strategy"));
  assert.ok(block.includes("skill: fast-foundation"));
  assert.ok(block.includes(":::ask"));
  assert.ok(block.includes(":::delegate"));
  assert.ok(block.endsWith("[/MC Chat Context]"));
});

test("buildMcChatContextBlock includes specialist broad-scope skills without delegate protocol", () => {
  const block = buildMcChatContextBlock({
    slug: "growth4u",
    threadId: "research",
    scope: "agent",
    skills: ["market-map", "competitor-research"],
    requestedAgent: "hamete",
  });

  assert.ok(block.includes("requested_agent: hamete"));
  assert.ok(block.includes("skill: market-map"));
  assert.ok(block.includes("competitor-research"));
  assert.ok(block.includes(":::ask"));
  assert.equal(block.includes(":::delegate"), false);
});
