import { test } from "node:test";
import assert from "node:assert/strict";

const { getTaskDefault, getPipeline, ownerCheckFindings } = await import("../data/task-blueprints");
const { STRATEGY_SKILLS } = await import("../skill-resolver");

// The byType defaults must reproduce the old inline ternaries in
// create-execution-tasks.ts / create-batch.ts, plus the co-located agent.
test("getTaskDefault('outreach') === legacy ternary defaults", () => {
  assert.deepEqual(getTaskDefault("outreach"), {
    skill: "outreach-sequence-builder",
    channel: "prospecting",
    agent: "rocinante",
    ideaType: "contact",
    ideaList: "outreach",
  });
});

test("getTaskDefault('content') (and unknown → content) === legacy defaults", () => {
  const content = {
    skill: "seo-content",
    channel: "content",
    agent: "dulcinea",
    ideaType: "content",
    ideaList: "keywords",
  };
  assert.deepEqual(getTaskDefault("content"), content);
  assert.deepEqual(getTaskDefault("whatever"), content); // fallback
});

// The outreach pipeline mirrors STRATEGY_SKILLS["01"] (prospecting), owner rocinante.
test("outreach pipeline stages === STRATEGY_SKILLS['01'].skills", () => {
  const p = getPipeline("outreach");
  assert.ok(p);
  assert.equal(p?.agent, "rocinante");
  assert.deepEqual(p?.stages, STRATEGY_SKILLS["01"].skills);
});

test("owner-check clean (now incl. taskDefaults + pipelines)", () => {
  assert.deepEqual(ownerCheckFindings(), []);
});
