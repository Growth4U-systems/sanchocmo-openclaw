import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const workspace = path.resolve(process.cwd());
const skill = fs.readFileSync(path.join(workspace, "skills/yalc-operator/SKILL.md"), "utf8");
const client = fs.readFileSync(
  path.join(workspace, "skills/yalc-operator/scripts/yalc-client.mjs"),
  "utf8",
);

test("yalc operator treats chat as the primary outbound control surface", () => {
  assert.match(skill, /Chat is the primary control surface/);
  assert.match(skill, /do not ask the user to choose implementation techniques/i);
  assert.match(skill, /Ask for one explicit confirmation before live external contact/i);
});

test("yalc operator selects signal personalization with a truthful fallback", () => {
  assert.match(skill, /verified recent person\/company signal/);
  assert.match(skill, /Never invent a signal/);
  assert.match(skill, /company \+ campaign contact reason/);
});

test("yalc client exposes campaign personalization as an orchestratable step", () => {
  assert.match(client, /campaign-leads-personalize/);
  assert.match(client, /\/leads\/personalize/);
  assert.match(client, /withAsyncCallback\(readPayload\(args\), args\)/);
});
