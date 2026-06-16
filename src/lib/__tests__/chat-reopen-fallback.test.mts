import { test } from "node:test";
import assert from "node:assert/strict";

const { buildTaskIndex, resolveFullThreadConfig } = await import("../chat-openers");

// Reopening a content-flavored thread whose task is NOT in the loaded index
// must still route to Dulcinea (content owner), not fall back to Sancho.
// Root cause of "Content → Ideas sigue saliendo Sancho" (reopened weekly draft).
const emptyIdx = buildTaskIndex([]);

for (const [ns, threadId] of [
  ["content", "growth4u:content:p-content-semana-24-t05-c02"],
  ["idea", "growth4u:idea:abc-123"],
  ["calendar", "growth4u:calendar:2026-06-12-linkedin"],
  ["cron", "growth4u:cron:News Monitor"],
] as const) {
  test(`reopen ${ns}: thread (task no indexada) → dulcinea`, () => {
    const cfg = resolveFullThreadConfig("growth4u", threadId, emptyIdx);
    assert.equal(cfg.agent, "dulcinea", `${ns} → ${cfg.agent}`);
  });
}

// SAN-193: reopening a Partnerships discovery thread whose dynamic id has no
// task/registry row must still route to Rocinante (Outreach owner), not fall
// back to sancho-manager. Covers both the "new search" id (`discovery-new-<ts>`)
// and an existing search (`discovery-<campaignId>`).
for (const [ns, threadId] of [
  ["discovery-new", "growth4u:discovery-new-1781340540550"],
  ["discovery-campaign", "growth4u:discovery-camp_abc"],
] as const) {
  test(`reopen ${ns}: discovery thread (sin tarea) → rocinante`, () => {
    const cfg = resolveFullThreadConfig("growth4u", threadId, emptyIdx);
    assert.equal(cfg.agent, "rocinante", `${ns} → ${cfg.agent}`);
  });
}

test("reopen indexed content task → dulcinea (sin regresión)", () => {
  const idx = buildTaskIndex([
    { project: { id: "P-Content-Semana-24" }, tasks: [{ id: "P-Content-Semana-24-T05", content_tasks: [{ id: "P-Content-Semana-24-T05-C02", name: "PLG", skill: "social-writer" }] }] },
  ]);
  const cfg = resolveFullThreadConfig("growth4u", "growth4u:content:p-content-semana-24-t05-c02", idx);
  assert.equal(cfg.agent, "dulcinea");
});

test("generic recurring/strategy threads still → Sancho default (no agent)", () => {
  const a = resolveFullThreadConfig("growth4u", "growth4u:recurring:weekly-report", buildTaskIndex([]));
  assert.equal(a.agent, undefined);
});

// SAN-205: reopening a BUTTON namespace (formerly chatEntries) now resolves
// from the unified registry, so it routes to the owner agent/skill instead of
// the buggy pillar→sancho fallback. Open and reopen converge on agent+skill.
for (const [label, threadId, agent, skill] of [
  ["yalc", "growth4u:yalc", "rocinante", "yalc-operator"],
  ["outreach-template", "growth4u:outreach-template:seq-1", "rocinante", "outreach-sequence-builder"],
  ["skill-editor", "growth4u:skill:my-skill", "cervantes", "skill-creator"],
  ["media-asset", "growth4u:asset:brand-book-logos-main-png", "maese-pedro", "od-refine"],
  ["visual-identity", "growth4u:visual-identity:colores", "maese-pedro", "design-system"],
  ["od-generate", "growth4u:od-generate:poster-maker", "maese-pedro", "od-generate"],
  ["new-task", "growth4u:new-task:1781340540550", "sancho", "sancho-manager"],
] as const) {
  test(`reopen button namespace ${label} → ${agent}/${skill} (no sancho fallback)`, () => {
    const cfg = resolveFullThreadConfig("growth4u", threadId, buildTaskIndex([]));
    assert.equal(cfg.agent, agent, `${label} agent`);
    assert.equal(cfg.skill, skill, `${label} skill`);
  });
}

test("reopen yalc keeps its static name; threadState forced to continue", () => {
  const cfg = resolveFullThreadConfig("growth4u", "growth4u:yalc", buildTaskIndex([]));
  assert.equal(cfg.threadName, "YALC / GTM-OS");
  assert.equal(cfg.threadState, "continue");
});

test("longest-prefix wins: skill-creator vs skill", () => {
  const creator = resolveFullThreadConfig("growth4u", "growth4u:skill-creator:42", buildTaskIndex([]));
  assert.equal(creator.linkedTo, "skills/new");
  const editor = resolveFullThreadConfig("growth4u", "growth4u:skill:my-skill", buildTaskIndex([]));
  assert.equal(editor.linkedTo, "skills/my-skill");
});

test("reopen project: thread → upper-cased name + projects/<ID> link, sancho-manager", () => {
  const cfg = resolveFullThreadConfig("growth4u", "growth4u:project-p00-onboarding", buildTaskIndex([]));
  assert.equal(cfg.skill, "sancho-manager");
  assert.equal(cfg.threadName, "P00-ONBOARDING");
  assert.equal(cfg.linkedTo, "projects/P00-ONBOARDING");
});

test("reopen competitor-scan (exact) → atalaya skill, tool link, no agent", () => {
  const cfg = resolveFullThreadConfig("growth4u", "growth4u:competitor-scan", buildTaskIndex([]));
  assert.equal(cfg.skill, "atalaya");
  assert.equal(cfg.linkedTo, "tool/atalaya");
  assert.equal(cfg.agent, undefined);
});
