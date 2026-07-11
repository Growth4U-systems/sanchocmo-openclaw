import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildMcChatContextBlock,
  groundingSkillForTurn,
  resolveTurnSkillPolicy,
} from "../../../../src/lib/runtime/agent-contract/mc-chat-context.mjs";

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
  assert.ok(block.includes("execution_mode: guided"));
  assert.ok(block.includes("skill_policy: pinned"));
  assert.ok(block.includes("skill: fast-foundation"));
  assert.ok(block.includes(":::ask"));
  assert.ok(block.includes(":::delegate"));
  assert.ok(block.includes(":::task-route"));
  assert.ok(block.endsWith("[/MC Chat Context]"));
});

test("buildMcChatContextBlock includes specialist broad-scope skills without delegate protocol", () => {
  const block = buildMcChatContextBlock({
    slug: "growth4u",
    threadId: "research",
    scope: "agent",
    skills: ["market-map", "competitor-research"],
    requestedAgent: "hamete",
    docPath: "brand/growth4u/research/market-map.md",
    docKind: "file",
  });

  assert.ok(block.includes("requested_agent: hamete"));
  assert.ok(block.includes("execution_mode: agent-led"));
  assert.ok(block.includes("skill_policy: auto"));
  assert.ok(block.includes("skill_hint: market-map"));
  assert.ok(block.includes("available_skills: market-map, competitor-research"));
  assert.ok(block.includes("thread_document: brand/growth4u/research/market-map.md (file)"));
  assert.ok(block.includes("No eres Sancho ni un generalista global"));
  assert.ok(block.includes("La ausencia de una skill NUNCA es motivo para fallar"));
  assert.equal(block.includes("skill: market-map"), false);
  assert.ok(block.includes(":::ask"));
  assert.equal(block.includes(":::delegate"), false);
  assert.ok(block.includes(":::task-route"));
});

test("adapters without a task cession rail never receive route markers", () => {
  const block = buildMcChatContextBlock({
    slug: "growth4u",
    threadId: "general",
    requestedAgent: "sancho",
    canDelegate: false,
  });
  assert.equal(block.includes(":::delegate"), false);
  assert.equal(block.includes(":::task-route"), false);
  assert.ok(block.includes("generalist"));
});

test("execution policy and bounded grounding are independent", () => {
  assert.equal(
    resolveTurnSkillPolicy({ scope: "agent", skill: "market-map" }),
    "auto",
  );
  assert.equal(
    groundingSkillForTurn({ scope: "agent", skill: "market-map" }),
    "market-map",
  );

  assert.equal(resolveTurnSkillPolicy({ skill: "content-writer" }), "pinned");
  assert.equal(groundingSkillForTurn({ skill: "content-writer" }), "content-writer");
});

test("turns without a skill remain executable generalist turns", () => {
  const block = buildMcChatContextBlock({
    slug: "growth4u",
    threadId: "general",
    requestedAgent: "sancho",
  });

  assert.equal(resolveTurnSkillPolicy({}), "auto");
  assert.equal(groundingSkillForTurn({}), null);
  assert.ok(block.includes("execution_mode: generalist"));
  assert.ok(block.includes("skill_policy: auto"));
  assert.ok(block.includes("Eres Sancho, el agente generalista y orquestador"));
  assert.ok(block.includes("Si ninguna skill encaja pero la petición sigue dentro de tu dominio"));
});
