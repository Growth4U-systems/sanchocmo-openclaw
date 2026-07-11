import { test } from "node:test";
import assert from "node:assert/strict";

const {
  normalizeThreadRouting,
  resolveAgentExecutionPolicy,
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
