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
