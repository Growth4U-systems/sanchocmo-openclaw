import { test } from "node:test";
import assert from "node:assert/strict";

// chat-openers + skill-resolver are client-safe (no fs) → load directly.
const {
  buildYalcThread,
  buildDiscoverySearchThread,
  buildOutreachTemplateThread,
  buildMediaAssetThread,
  buildVisualIdentityChatThread,
  buildOdGenerateThread,
  buildSkillCreatorThread,
  buildSkillEditorThread,
  buildHtmlConversionThread,
} = await import("../chat-openers");
const { resolveAgentForSkill } = await import("../skill-resolver");

const SLUG = "growth4u";

// Every chat-opener button must route to the agent that OWNS its skill — no
// undefined-agent for owned skills (the SAN-166 class of bug at the button
// level). For each builder, assert agent === resolveAgentForSkill(skill).
const CASES: Array<{ name: string; cfg: { skill: string; agent?: string } }> = [
  { name: "yalc", cfg: buildYalcThread(SLUG) },
  { name: "discovery", cfg: buildDiscoverySearchThread(SLUG) },
  { name: "outreach-template", cfg: buildOutreachTemplateThread(SLUG, { id: "seq-1", name: "Seq" }) },
  { name: "media-asset", cfg: buildMediaAssetThread(SLUG, "brand-book/x/logo.png", "Logo", "logo") },
  { name: "visual-identity", cfg: buildVisualIdentityChatThread(SLUG) },
  { name: "od-generate", cfg: buildOdGenerateThread(SLUG, "poster-maker", "Poster Maker") },
  { name: "skill-creator", cfg: buildSkillCreatorThread(SLUG) },
  { name: "skill-editor", cfg: buildSkillEditorThread(SLUG, "my-skill", "My Skill") },
  { name: "html-conversion", cfg: buildHtmlConversionThread(SLUG, "content/x.md", undefined) },
];

for (const { name, cfg } of CASES) {
  test(`builder "${name}" routes to its skill's owner agent`, () => {
    const owner = resolveAgentForSkill(cfg.skill);
    if (owner) {
      assert.equal(cfg.agent, owner, `${name}: skill ${cfg.skill} owned by ${owner} but agent=${cfg.agent}`);
    } else {
      // Skill has no specialist owner → agent may be undefined (Sancho default) or explicit.
      assert.ok(true);
    }
  });
}
