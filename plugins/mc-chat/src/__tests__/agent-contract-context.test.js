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
  assert.ok(block.includes("skill_policy: guided"));
  assert.ok(block.includes("primary_skill: fast-foundation"));
  assert.ok(block.includes(":::ask"));
  assert.ok(block.includes(":::delegate"));
  assert.ok(block.includes(":::task-route"));
  assert.equal(block.includes(":::sancho-intervene"), false);
  assert.ok(block.endsWith("[/MC Chat Context]"));
});

test("strictly guided workflows expose their declared skill allowlist", () => {
  const block = buildMcChatContextBlock({
    slug: "growth4u",
    threadId: "task-p01-t01",
    skill: "outreach-playbook",
    skills: ["outreach-playbook", "outreach-sequence-builder"],
    requestedAgent: "rocinante",
  });
  assert.ok(block.includes("primary_skill: outreach-playbook"));
  assert.ok(block.includes("allowed_skills: outreach-playbook, outreach-sequence-builder"));
  assert.ok(block.includes("No uses ninguna skill fuera de esa allowlist"));
  assert.ok(block.includes(":::sancho-intervene"));
});

test("task scope keeps the task boundary while exposing the owning agent catalogue", () => {
  const block = buildMcChatContextBlock({
    slug: "growth4u",
    threadId: "task-p01-t01",
    scope: "task",
    skill: "outreach-playbook",
    primarySkill: "outreach-playbook",
    skills: ["outreach-playbook", "outreach-sequence-builder", "yalc-operator"],
    requestedAgent: "rocinante",
  });
  assert.ok(block.includes("execution_mode: task-led"));
  assert.ok(block.includes("skill_policy: task-flexible"));
  assert.ok(block.includes("primary_skill: outreach-playbook"));
  assert.ok(block.includes("permitted_agent_skills: outreach-playbook, outreach-sequence-builder, yalc-operator"));
  assert.ok(block.includes("La TAREA —su objetivo y entregable— es el límite estable"));
  assert.ok(block.includes("Puedes cambiar a cualquier skill de permitted_agent_skills"));
});

test("a skillless task may carry an advisory hint without inventing a primary skill", () => {
  const block = buildMcChatContextBlock({
    slug: "growth4u",
    threadId: "task-p01-t02",
    scope: "task",
    skill: "outreach-playbook",
    skills: ["outreach-playbook", "yalc-operator"],
    requestedAgent: "rocinante",
  });
  assert.ok(block.includes("skill_hint: outreach-playbook"));
  assert.equal(block.includes("primary_skill:"), false);
  assert.ok(block.includes("Esta tarea no fija una skill primaria"));
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
  assert.ok(block.includes(":::sancho-intervene"));
  assert.ok(block.includes("1. Continuar con la skill primaria"));
  assert.ok(block.includes("2. Cambiar de skill dentro del mismo agente"));
  assert.ok(block.includes("3. Intervención temporal de Sancho"));
  assert.ok(block.includes("4. Proponer cambio de agente o nueva tarea"));
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
  assert.equal(block.includes(":::sancho-intervene"), false);
  assert.ok(block.includes("generalist"));
});

test("temporary Sancho is bounded to one in-place turn without cession protocols", () => {
  const block = buildMcChatContextBlock({
    slug: "growth4u",
    threadId: "task-p01-t01",
    requestedAgent: "sancho",
    scope: "agent",
    temporaryAgent: true,
    canDelegate: false,
  });
  assert.ok(block.includes("temporary_intervention: true"));
  assert.ok(block.includes("Intervienes durante UN solo turno"));
  assert.ok(block.includes("No delegues, no cambies de agente/tarea"));
  assert.equal(block.includes(":::delegate\n"), false);
  assert.equal(block.includes(":::task-route\n"), false);
  assert.equal(block.includes(":::sancho-intervene\n"), false);
});

test("a control follow-up cannot receive another control protocol", () => {
  const block = buildMcChatContextBlock({
    slug: "growth4u",
    threadId: "task-p01-t02",
    requestedAgent: "hamete",
    scope: "task",
    controlDepth: 1,
    canDelegate: false,
  });
  assert.ok(block.includes("control_depth: 1"));
  assert.ok(block.includes("no emitas markers de control"));
  assert.equal(block.includes(":::delegate\n"), false);
  assert.equal(block.includes(":::task-route\n"), false);
  assert.equal(block.includes(":::sancho-intervene\n"), false);
  assert.equal(block.includes("ORDEN DE DECISIÓN OBLIGATORIO"), false);
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

test("docs review turns are read-only and receive no action protocols", () => {
  const block = buildMcChatContextBlock({
    slug: "growth4u",
    threadId: "docs-test",
    requestedAgent: "sancho",
    readOnly: true,
  });

  assert.ok(block.includes("channel_mode: docs-review"));
  assert.ok(block.includes("read_only: true"));
  assert.ok(block.includes("no escribas, edites, borres"));
  assert.equal(block.includes(":::ask\n"), false);
  assert.equal(block.includes(":::delegate\n"), false);
  assert.equal(block.includes(":::task-route\n"), false);
});

test("Growie support turns are evidence-led, read-only, and deployment-grounded", () => {
  const block = buildMcChatContextBlock({
    slug: "acme",
    threadId: "acme:support-growie-case-1",
    requestedAgent: "sancho",
    readOnly: true,
    channelMode: "support-diagnostic",
    supportContext: {
      pagePath: "/dashboard/acme/content",
      deployedCommit: "abc123",
      imageDigest: "sha256:def456",
      environment: "Staging",
    },
  });

  assert.ok(block.includes("channel_mode: support-diagnostic"));
  assert.ok(block.includes("visible_identity: Growie"));
  assert.ok(block.includes("support_page: /dashboard/acme/content"));
  assert.ok(block.includes("deployed_commit: abc123"));
  assert.ok(block.includes("No afirmes causa raíz sin evidencia"));
  assert.ok(block.includes("config/product-capability-manifest.json"));
  assert.ok(block.includes("execution_mode: diagnostic"));
  assert.equal(block.includes("Eres Sancho"), false);
  assert.equal(block.includes("private docs.growth4u.io"), false);
  assert.equal(block.includes(":::ask\n"), false);
  assert.equal(block.includes(":::delegate\n"), false);
});
