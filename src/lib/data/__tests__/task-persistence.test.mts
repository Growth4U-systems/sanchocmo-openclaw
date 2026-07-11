import { test } from "node:test";
import assert from "node:assert/strict";

const {
  nextChildTaskIdFromIds,
  nextDbProjectIdFromIds,
  nextStandaloneTaskIdFromIds,
} = await import("../tasks");
const {
  persistedTaskSkillFields,
} = await import("../task-execution-contract");

test("DB id allocation counts DB rows and never falls back to an existing T01", () => {
  assert.equal(nextDbProjectIdFromIds(["P00", "P02", "legacy"]), "P03");
  assert.equal(
    nextChildTaskIdFromIds("P03", ["P03-T01", "P03-T09", "P02-T99"]),
    "P03-T10",
  );
  assert.equal(nextStandaloneTaskIdFromIds(["-T01", "T02", "P03-T10"]), "T03");
});

test("a generic skill-less task does not persist the legacy sancho-manager fallback", () => {
  assert.deepEqual(
    persistedTaskSkillFields(
      { type: "execution", agent: "rocinante" },
      { skill: "sancho-manager", skills: ["sancho-manager"] },
    ),
    { skill: null, skills: [] },
  );
});

test("explicit/supporting skills and meaningful structured inference still persist", () => {
  assert.deepEqual(
    persistedTaskSkillFields(
      { type: "execution", skills: ["outreach-playbook"] },
      { skill: "sancho-manager", skills: ["sancho-manager", "outreach-playbook"] },
    ),
    { skill: null, skills: ["outreach-playbook"] },
  );
  assert.deepEqual(
    persistedTaskSkillFields(
      { type: "web-build" },
      { skill: "alarife-integration", skills: ["alarife-integration", "payload"] },
    ),
    {
      skill: "alarife-integration",
      skills: ["alarife-integration", "payload"],
    },
  );
});
