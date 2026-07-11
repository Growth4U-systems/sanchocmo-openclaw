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
  assert.match(skill, /For a live send, ask once/i);
  assert.match(skill, /Never ask the user to approve a preview, proposal, internal draft or `dryRun`/);
  assert.match(skill, /This question must refer to the real external send, never to approval, a test or a dry-run/);
  assert.match(skill, /Missing brand documents or a `partial` context pack are not blockers/);
  assert.match(skill, /without asking the user to approve the recommendation/);
  assert.match(skill, /never call `clarify`, `ask_user` or another interactive tool/);
});

test("yalc operator selects signal personalization with a truthful fallback", () => {
  assert.match(skill, /`company_reason_v1`/);
  assert.match(skill, /`hiring_signal_v1`, `recent_news_v1`/);
  assert.match(skill, /falls back without inventing a signal/i);
  assert.match(skill, /Never use fixtures, demo candidates, generated people/);
  assert.match(skill, /Before creating a campaign, run `providers`/);
  assert.match(skill, /`manual` is valid only when the user supplied real records/);
});

test("yalc operator must use the persisted deterministic batch before asking to send", () => {
  assert.match(skill, /`outbound\.workflow\.prepare` is the only standard preparation path/);
  assert.match(skill, /quote three returned messages from `batch\.sample`/);
  assert.match(skill, /Approval is an internal integrity gate over the immutable content hash/);
  assert.match(skill, /using the same `runId`/);
  assert.match(skill, /Do not present it as a separate user step or decision/);
  assert.match(skill, /never retry it automatically/i);
  assert.match(skill, /must never be a copy of the search goal/);
  assert.match(skill, /currently prepares and sends only the first LinkedIn connection message/);
  assert.match(skill, /Never claim that follow-ups are active/);
  assert.match(skill, /capped by the selected account's remaining daily capacity/);
});

test("yalc client exposes campaign personalization as an orchestratable step", () => {
  assert.match(client, /campaign-leads-personalize/);
  assert.match(client, /\/leads\/personalize/);
  assert.match(client, /withAsyncCallback\(readPayload\(args\), args\)/);
  assert.match(client, /SANCHO_CHAT_THREAD_ID/);
  assert.match(client, /callbackContext: \{ \.\.\.ctx, command, campaignId, profileKind, channel \}/);
  assert.match(client, /async === true[\s\S]*out\.async = true/);
  assert.match(client, /commandName !== 'outbound\.status' && commandName !== 'outbound\.workflow\.status'/);
});
