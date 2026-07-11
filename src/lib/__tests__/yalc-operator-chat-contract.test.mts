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
  assert.match(skill, /Never ask the user to approve a preview, proposal, internal draft or `dryRun`/);
  assert.match(skill, /This question must refer to the real external send, never to a test or dry-run/);
  assert.match(skill, /Missing brand documents or a `partial` context pack are not blockers/);
  assert.match(skill, /without asking the user to approve the recommendation/);
  assert.match(skill, /never call `clarify`, `ask_user` or another interactive tool/);
});

test("yalc operator selects signal personalization with a truthful fallback", () => {
  assert.match(skill, /verified recent person\/company signal/);
  assert.match(skill, /Never invent a signal/);
  assert.match(skill, /company \+ campaign contact reason/);
});

test("yalc operator must show actual LinkedIn preview messages before asking to send", () => {
  assert.match(skill, /returns this automatically in `preview\.items`/);
  assert.match(skill, /quote three returned `preview\.items\[\]\.message` values/);
  assert.match(skill, /must never be a copy of the search goal/);
});

test("yalc client exposes campaign personalization as an orchestratable step", () => {
  assert.match(client, /campaign-leads-personalize/);
  assert.match(client, /\/leads\/personalize/);
  assert.match(client, /withAsyncCallback\(readPayload\(args\), args\)/);
});
