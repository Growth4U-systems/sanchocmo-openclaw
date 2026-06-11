import { test } from "node:test";
import assert from "node:assert/strict";

// chat-openers + task-execution-contract are client-safe (no fs import).
const { buildPillarThread } = await import("../chat-openers");
const { inferTaskExecutionContract } = await import("../data/task-execution-contract");

// Regression for SAN-3 W4: buildPillarThread() maps the pillarKey through
// PILLAR_CANONICAL_FALLBACK *before* calling resolveThreadSkills({ pillar }).
// A canonical value of `kickoff` (the skill name) resolved `{ pillar: "kickoff" }`,
// which is not a pillar key and fell back to sancho-manager — the manager then
// improvised a Company Brief and never wrote company-brief.current.md.
// The canonical for company-brief must be the pillar itself.
test("buildPillarThread('company-brief') routes to the Kickoff on Hamete, not sancho-manager", () => {
  const cfg = buildPillarThread("teros", "company-brief", undefined);
  assert.equal(cfg.skill, "kickoff", "primary skill");
  assert.deepEqual(cfg.skills, ["kickoff"], "skills list");
  assert.equal(cfg.agent, "hamete", "owner agent");
  assert.notEqual(cfg.skill, "sancho-manager", "must not fall back to the manager");
  assert.equal(cfg.threadId, "teros:company-brief", "threadId uses the pillar as canonical");
});

// A couple of other pillars to lock the canonical = pillarKey behavior in general.
test("buildPillarThread keeps pillar key as canonical for analytical pillars", () => {
  const market = buildPillarThread("teros", "market-analysis", undefined);
  assert.equal(market.threadId, "teros:market-analysis");
  assert.equal(market.skill, "market-intelligence");
  assert.equal(market.agent, "hamete");

  const selfA = buildPillarThread("teros", "self-analysis", undefined);
  assert.equal(selfA.threadId, "teros:self-analysis");
  assert.equal(selfA.skill, "self-intelligence");
});

// The task path (inferTaskExecutionContract) had the same SAN-3 W4 regression:
// SKILL_ALIASES aliased `kickoff → sancho-manager` (carried over from the old
// `fast-foundation` entry), so a Kickoff *task* resolved to the manager instead
// of hamete and never wrote company-brief.current.md.
test("a kickoff task resolves to the Kickoff skill on Hamete, not sancho-manager", () => {
  const withSkill = inferTaskExecutionContract({ type: "execution", skill: "kickoff", pillar: "company-brief" });
  assert.equal(withSkill.skill, "kickoff");
  assert.equal(withSkill.agent, "hamete");

  const fromPillar = inferTaskExecutionContract({ type: "execution", pillar: "company-brief" });
  assert.equal(fromPillar.skill, "kickoff");
  assert.equal(fromPillar.agent, "hamete");
});
