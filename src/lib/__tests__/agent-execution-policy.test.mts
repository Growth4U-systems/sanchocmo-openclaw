import { test } from "node:test";
import assert from "node:assert/strict";

const {
  normalizeThreadRouting,
  resolveAgentExecutionPolicy,
  resolveAgentTurnPolicy,
  toThreadRouting,
} = await import("../runtime/agent-execution-policy");

test("agent scope keeps the seed advisory and widens to the owner's skills", () => {
  const policy = resolveAgentExecutionPolicy([
    {
      agent: "rocinante",
      scope: "agent",
      skill: "discovery-plan-builder",
      skills: ["discovery-plan-builder", "outreach-playbook"],
    },
  ]);

  assert.equal(policy.agent, "rocinante");
  assert.equal(policy.scope, "agent");
  assert.equal(policy.skillMode, "auto");
  assert.equal(policy.skillHint, "discovery-plan-builder");
  assert.equal(policy.availableSkills?.[0], "discovery-plan-builder");
  assert.ok(policy.availableSkills?.includes("discovery-search-runner"));
  assert.ok(policy.availableSkills?.includes("yalc-operator"));
});

test("task scope prioritizes task skills but permits every skill owned by the same agent", () => {
  const policy = resolveAgentExecutionPolicy([{
    agent: "rocinante",
    scope: "task",
    skills: ["outreach-playbook", "outreach-sequence-builder"],
  }]);
  assert.equal(policy.agent, "rocinante");
  assert.equal(policy.scope, "task");
  assert.equal(policy.skillMode, "auto");
  assert.deepEqual(policy.availableSkills?.slice(0, 2), [
    "outreach-playbook",
    "outreach-sequence-builder",
  ]);
  assert.equal(policy.availableSkills?.includes("yalc-operator"), true);
  assert.equal(policy.availableSkills?.includes("ai-seo"), false);
  const persisted = normalizeThreadRouting(toThreadRouting(policy, 55));
  assert.equal(persisted?.scope, "task");
  assert.equal(persisted?.availableSkills?.includes("yalc-operator"), true);
});

test("lower-precedence metadata cannot inject another agent's skill into a task", () => {
  const policy = resolveAgentExecutionPolicy([
    {
      agent: "rocinante",
      scope: "task",
      skills: ["outreach-playbook"],
    },
    {
      agent: "rocinante",
      skill: "ai-seo",
      skills: ["ai-seo"],
    },
  ]);

  assert.equal(policy.scope, "task");
  assert.equal(policy.skillHint, undefined);
  assert.equal(policy.availableSkills?.includes("outreach-playbook"), true);
  assert.equal(policy.availableSkills?.includes("yalc-operator"), true);
  assert.equal(policy.availableSkills?.includes("ai-seo"), false);
});

test("a task cannot authorize a primary skill owned by another agent", () => {
  const policy = resolveAgentExecutionPolicy([{
    agent: "rocinante",
    scope: "task",
    skill: "ai-seo",
    skills: ["ai-seo", "outreach-playbook"],
  }]);
  assert.equal(policy.skillHint, undefined);
  assert.equal(policy.availableSkills?.includes("ai-seo"), false);
  assert.equal(policy.availableSkills?.includes("outreach-playbook"), true);
});

test("a skillless task remains executable through the owning agent catalogue", () => {
  const policy = resolveAgentExecutionPolicy([
    { agent: "rocinante", scope: "task" },
  ]);

  assert.equal(policy.scope, "task");
  assert.equal(policy.skillHint, undefined);
  assert.equal(policy.availableSkills?.includes("outreach-playbook"), true);
  assert.equal(policy.availableSkills?.includes("yalc-operator"), true);
});

test("pinned workflow stays narrow for deterministic runtime triggers", () => {
  const policy = resolveAgentExecutionPolicy([
    {
      agent: "dulcinea",
      scope: "skill",
      skill: "social-writer",
      skills: ["social-writer"],
    },
  ]);

  assert.deepEqual(policy, {
    agent: "dulcinea",
    scope: "skill",
    skillMode: "pinned",
    skillHint: "social-writer",
    availableSkills: ["social-writer"],
  });
});

test("pinned specialist workflows filter skills by ownership", () => {
  const mixed = resolveAgentExecutionPolicy([{
    agent: "rocinante",
    scope: "skill",
    skill: "ai-seo",
    skills: ["ai-seo", "outreach-playbook"],
  }]);
  assert.deepEqual(mixed, {
    agent: "rocinante",
    scope: "skill",
    skillMode: "pinned",
    skillHint: "outreach-playbook",
    availableSkills: ["outreach-playbook"],
  });

  const foreignOnly = resolveAgentExecutionPolicy([{
    agent: "rocinante",
    scope: "skill",
    skill: "ai-seo",
    skills: ["ai-seo"],
  }]);
  assert.equal(foreignOnly.agent, "rocinante");
  assert.equal(foreignOnly.scope, "agent");
  assert.equal(foreignOnly.skillMode, "auto");
  assert.equal(foreignOnly.skillHint, undefined);
  assert.equal(foreignOnly.availableSkills?.includes("ai-seo"), false);
  assert.equal(foreignOnly.availableSkills?.includes("outreach-playbook"), true);

  const legacyForeign = resolveAgentExecutionPolicy([{
    agent: "rocinante",
    skill: "ai-seo",
  }]);
  assert.equal(legacyForeign.scope, "agent");
  assert.equal(legacyForeign.skillHint, undefined);
  assert.equal(legacyForeign.availableSkills?.includes("ai-seo"), false);
});

test("legacy messages infer auto without a skill and pinned with one skill", () => {
  const generalist = resolveAgentExecutionPolicy([{ agent: "sancho" }]);
  assert.equal(generalist.agent, "sancho");
  assert.equal(generalist.skillMode, "auto");
  assert.equal(generalist.skillHint, undefined);

  const guided = resolveAgentExecutionPolicy([
    { agent: "sanson", skill: "feedback-triage", skills: ["feedback-triage"] },
  ]);
  assert.equal(guided.skillMode, "pinned");
});

test("a route without an owner falls back to the Sancho generalist", () => {
  const policy = resolveAgentExecutionPolicy([{}]);

  assert.equal(policy.agent, "sancho");
  assert.equal(policy.scope, "agent");
  assert.equal(policy.skillMode, "auto");
});

test("an invalid pinned route without a seed falls back to agent execution", () => {
  const policy = resolveAgentExecutionPolicy([
    { agent: "rocinante", skillMode: "pinned" },
  ]);

  assert.equal(policy.agent, "rocinante");
  assert.equal(policy.skillMode, "auto");
  assert.equal(policy.scope, "agent");
});

test("legacy multi-skill workflows stay pinned when they declare a seed", () => {
  const policy = resolveAgentExecutionPolicy([
    {
      agent: "maese-pedro",
      skill: "od-generate",
      skills: ["od-generate", "od-refine", "od-export"],
    },
  ]);

  assert.equal(policy.skillMode, "pinned");
  assert.equal(policy.scope, "skill");
});

test("changing the owner never leaks the previous agent's skill catalogue", () => {
  const policy = resolveAgentExecutionPolicy([
    { agent: "dulcinea" },
    {
      agent: "rocinante",
      skillMode: "auto",
      skillHint: "discovery-plan-builder",
      availableSkills: ["discovery-plan-builder", "yalc-operator"],
    },
  ]);

  assert.equal(policy.agent, "dulcinea");
  assert.equal(policy.skillHint, undefined);
  assert.equal(policy.skillMode, "auto");
  assert.ok(policy.availableSkills?.includes("ai-seo"));
  assert.equal(policy.availableSkills?.includes("yalc-operator"), false);
});

test("routing precedence is explicit request, persisted route, then namespace", () => {
  const policy = resolveAgentExecutionPolicy([
    { skill: "outreach-sequence-builder" },
    {
      agent: "rocinante",
      skillMode: "auto",
      skillHint: "discovery-plan-builder",
      availableSkills: ["discovery-plan-builder"],
    },
    { agent: "sancho", scope: "skill", skill: "sancho-manager" },
  ]);

  assert.equal(policy.agent, "rocinante");
  assert.equal(policy.skillHint, "outreach-sequence-builder");
  assert.equal(policy.skillMode, "auto");
});

test("durable routing normalizes untrusted JSON and round-trips auto mode", () => {
  const policy = resolveAgentExecutionPolicy([
    { agent: "Rocinante", scope: "agent", skill: "YALC-Operator" },
  ]);
  const routing = toThreadRouting(policy, 1234);
  const normalized = normalizeThreadRouting(routing);

  assert.equal(normalized?.agent, "rocinante");
  assert.equal(normalized?.skillMode, "auto");
  assert.equal(normalized?.skillHint, "yalc-operator");
  assert.equal(normalized?.updatedAt, 1234);
  assert.equal(normalizeThreadRouting({ skillMode: "unknown" }), undefined);
});

test("temporary Sancho takes one turn without replacing the durable owner", () => {
  const persisted = {
    agent: "rocinante",
    skillMode: "pinned" as const,
    skillHint: "outreach-playbook",
    availableSkills: ["outreach-playbook", "outreach-sequence-builder"],
    updatedAt: 123,
  };
  const turn = resolveAgentTurnPolicy(
    [persisted],
    { temporaryAgent: true, agent: "sancho" },
  );
  assert.equal(turn.policy.agent, "sancho");
  assert.equal(turn.policy.skillMode, "auto");
  assert.equal(turn.persistRoute, false);
  assert.equal(turn.temporarySancho, true);

  const nextTurn = resolveAgentTurnPolicy([persisted]);
  assert.equal(nextTurn.policy.agent, "rocinante");
  assert.equal(nextTurn.policy.skillHint, "outreach-playbook");
  assert.equal(nextTurn.persistRoute, true);
});

test("temporary override is restricted to Sancho", () => {
  const turn = resolveAgentTurnPolicy(
    [{ agent: "rocinante", scope: "skill", skill: "outreach-playbook" }],
    { temporaryAgent: true, agent: "hamete" },
  );
  assert.equal(turn.policy.agent, "rocinante");
  assert.equal(turn.persistRoute, true);
  assert.equal(turn.temporarySancho, false);
});
