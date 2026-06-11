import { test } from "node:test";
import assert from "node:assert/strict";

// skill-resolver is client-safe (no fs/paths import), so it loads without a workspace.
const { resolveThreadSkills } = await import("../skill-resolver");

// Expected skill + owner agent per Foundation pillar key, as opened by
// buildPillarThread → resolveThreadSkills({ pillar }) with NO chat-config.json.
// agent === undefined means "no specialist owner → defaults to Sancho downstream".
// W4: company-brief is now the single Layer-0 pillar (skill=kickoff, owner=hamete).
// fast-foundation and fast-context are retired.
const CASES: Array<{ pillar: string; skill: string; agent: string | undefined }> = [
  { pillar: "company-brief", skill: "kickoff", agent: "hamete" },
  { pillar: "market-analysis", skill: "market-intelligence", agent: "hamete" },
  { pillar: "competitor-analysis", skill: "competitor-intelligence", agent: "hamete" },
  { pillar: "self-analysis", skill: "self-intelligence", agent: "hamete" },
  { pillar: "market-synthesis", skill: "market-synthesis", agent: "hamete" },
  { pillar: "niche-discovery", skill: "niche-discovery-100x", agent: "hamete" },
  { pillar: "positioning", skill: "positioning-messaging", agent: "dulcinea" },
  { pillar: "pricing", skill: "pricing-strategy", agent: undefined },
  { pillar: "brand-voice", skill: "brand-voice", agent: "dulcinea" },
  { pillar: "visual-identity", skill: "visual-identity", agent: "maese-pedro" },
  { pillar: "metrics-setup", skill: "metrics-setup", agent: "merlin" },
  { pillar: "strategic-plan", skill: "strategic-plan", agent: undefined },
  { pillar: "existing-customer-data", skill: "existing-customer-data", agent: "hamete" },
  { pillar: "ecp-validation", skill: "ecp-validation", agent: "sanson" },
];

for (const c of CASES) {
  test(`pillar "${c.pillar}" resolves skill=${c.skill} agent=${c.agent ?? "(sancho default)"}`, () => {
    const res = resolveThreadSkills({ pillar: c.pillar });
    assert.equal(res.skill, c.skill, `skill for ${c.pillar}`);
    assert.equal(res.agent, c.agent, `agent for ${c.pillar}`);
  });
}

test("per-brand chat-config.json pillar override still wins over the bridge", () => {
  const res = resolveThreadSkills(
    { pillar: "self-analysis" },
    { pillars: { "self-analysis": { skill: "custom-skill", agent: "merlin" } } },
  );
  assert.equal(res.skill, "custom-skill");
  assert.equal(res.agent, "merlin");
});
