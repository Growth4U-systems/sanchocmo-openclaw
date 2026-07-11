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
  assert.match(skill, /present at most three Foundation-backed options and wait for that choice/i);
  assert.match(skill, /only allowed pre-workflow question/i);
  assert.match(skill, /one `:::ask` block with `mode:"single"`/i);
});

test("yalc operator selects signal personalization with a truthful fallback", () => {
  assert.match(skill, /`company_reason_v1`/);
  assert.match(skill, /`hiring_signal_v1`, `recent_news_v1`/);
  assert.match(skill, /falls back without inventing a signal/i);
  assert.match(skill, /Never use fixtures, demo candidates, generated people/);
  assert.match(skill, /performs the provider preflight before persistence/i);
  assert.match(skill, /`manual` is valid only when the user supplied real records/);
});

test("yalc operator must use one persisted deterministic workflow before asking to send", () => {
  assert.match(skill, /`outbound\.workflow\.start` is the only permitted entrypoint/);
  assert.match(skill, /show the batch count and up to three exact persisted samples/i);
  assert.match(skill, /Approval is an internal integrity gate over the immutable content hash/);
  assert.match(skill, /using the same `runId`/);
  assert.match(skill, /Do not present it as a separate user step or decision/);
  assert.match(skill, /never retry it automatically/i);
  assert.match(skill, /must never be a copy of the search goal/);
  assert.match(skill, /currently prepares and sends only the first LinkedIn connection message/);
  assert.match(skill, /Never claim that follow-ups are active/);
  assert.match(skill, /Preparation is not capped by today's LinkedIn sending capacity/);
  assert.match(skill, /1,000 contacts by default and at most 2,000/i);
  assert.match(skill, /never continue to the next cohort automatically/i);
  assert.match(skill, /`outbound\.workflow\.continue` only after an explicit request/i);
});

test("yalc client exposes campaign personalization as an orchestratable step", () => {
  assert.match(client, /campaign-leads-personalize/);
  assert.match(client, /\/leads\/personalize/);
  assert.match(client, /withAsyncCallback\(readPayload\(args\), args\)/);
  assert.match(client, /SANCHO_CHAT_THREAD_ID/);
  assert.match(client, /callbackContext: \{[\s\S]*slug: ctx\.slug,[\s\S]*threadId: ctx\.threadId,[\s\S]*command/);
  assert.match(client, /linkedin-outbound-v1:[\s\S]*createHash/);
  assert.match(client, /async === true[\s\S]*out\.async = true/);
  assert.match(client, /commandName !== 'outbound\.status' && commandName !== 'outbound\.workflow\.status'/);
});
