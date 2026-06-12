import { test } from "node:test";
import assert from "node:assert/strict";

// chat-openers is client-safe (no fs/paths import) → loads without a workspace.
const { buildDocThread } = await import("../chat-openers");

const SLUG = "growth4u";

// SAN-166: per-channel strategy docs are built by SetupTab.createChannelStrategy
// with `skill: "content-strategy"` and NO pillar. The no-pillar fallback of
// buildDocThread must honor doc.skill and route to the owner agent (Dulcinea)
// instead of collapsing to Sancho.
test("channel strategy doc (no pillar) resolves to content-strategy + dulcinea", () => {
  const cfg = buildDocThread(SLUG, {
    key: "channel-strategy-linkedin",
    name: "Estrategia del canal Founder-Led Content",
    skill: "content-strategy",
    channel: "linkedin",
    docPath: "content/strategy/linkedin-strategy.md",
    status: "pending",
  });
  assert.equal(cfg.skill, "content-strategy", "skill");
  assert.deepEqual(cfg.skills, ["content-strategy"], "skills");
  assert.equal(cfg.agent, "dulcinea", "owner agent");
  // pending doc → create flow (auto-prompt generates the doc)
  assert.equal(cfg.threadState, "create", "threadState for pending doc");
  assert.equal(cfg.threadId, `${SLUG}:content:channel-strategy-linkedin`, "thread id namespace");
});

// Same fallback path is hit by StrategyDocsTab for any non-pillar doc that
// carries a skill — they must all route to their specialist.
test("non-pillar doc with seo-content skill routes to dulcinea", () => {
  const cfg = buildDocThread(SLUG, {
    key: "some-seo-doc",
    name: "SEO brief",
    skill: "seo-content",
    status: "done",
  });
  assert.equal(cfg.skill, "seo-content");
  assert.equal(cfg.agent, "dulcinea");
  assert.equal(cfg.threadState, "continue", "non-pending doc → continue");
});

// Genuinely generic docs with no skill still fall back to the manager (no
// specialist owner → Sancho downstream). Preserves pre-fix behavior.
test("non-pillar doc with no skill falls back to sancho-manager / no owner", () => {
  const cfg = buildDocThread(SLUG, { key: "loose-doc", name: "Loose doc" });
  assert.equal(cfg.skill, "sancho-manager");
  assert.equal(cfg.agent, undefined, "no specialist owner");
});
