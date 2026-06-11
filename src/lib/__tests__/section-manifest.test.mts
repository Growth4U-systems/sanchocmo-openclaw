import { test } from "node:test";
import assert from "node:assert/strict";

// section-manifest + skill-resolver are client-safe (no fs) → load directly.
const {
  SECTION_MANIFESTS,
  resolveSectionTasks,
  ownerCheckFindings,
} = await import("../section-manifest");

// ── Owner-check: the guard that would have caught SAN-166 ──────────
test("every declared agent === the skill's owner (no SAN-166-class drift)", () => {
  const findings = ownerCheckFindings();
  assert.deepEqual(
    findings,
    [],
    `agent/owner mismatch: ${JSON.stringify(findings, null, 2)}`,
  );
});

// ── Schema sanity per section ─────────────────────────────────────
for (const [key, manifest] of Object.entries(SECTION_MANIFESTS)) {
  test(`section "${key}" — well-formed tasks`, () => {
    assert.equal(manifest.section, key, "section field matches registry key");
    assert.ok(manifest.tasks.length > 0, "has tasks");

    const ids = new Set<string>();
    for (const t of manifest.tasks) {
      for (const field of ["id", "name", "skill", "agent", "docPath"] as const) {
        assert.ok(t[field], `task ${t.id || "?"} missing ${field}`);
      }
      assert.ok(Array.isArray(t.dependsOn), `task ${t.id} dependsOn must be an array`);
      assert.ok(!ids.has(t.id), `duplicate task id ${t.id}`);
      ids.add(t.id);
    }
    // dependsOn must reference ids in the same section.
    for (const t of manifest.tasks) {
      for (const dep of t.dependsOn) {
        assert.ok(ids.has(dep), `task ${t.id} depends on unknown id ${dep}`);
      }
    }
  });
}

// ── Resolution: {slug} / {channel} substitution + perChannel expand ─
test("resolveSectionTasks substitutes {slug} and expands perChannel", () => {
  const tasks = resolveSectionTasks("content", "growth4u", { channels: ["linkedin", "blog"] });

  const strategy = tasks.find((t) => t.id === "content-strategy");
  assert.equal(strategy?.agent, "dulcinea");
  assert.equal(strategy?.docPath, "content/strategy-decisions.md");

  // Per-brand templated skill resolves {slug}.
  const visual = tasks.find((t) => t.id === "visual-templates");
  assert.equal(visual?.skill, "growth4u-visual-generator");
  assert.equal(visual?.agent, "maese-pedro");

  // perChannel task expands once per channel with {channel} substituted.
  const channelStrategies = tasks.filter((t) => t.id === "channel-strategy");
  assert.equal(channelStrategies.length, 2, "one channel-strategy per channel");
  assert.deepEqual(
    channelStrategies.map((t) => t.docPath).sort(),
    ["content/strategy/blog-strategy.md", "content/strategy/linkedin-strategy.md"],
  );
  for (const cs of channelStrategies) assert.equal(cs.agent, "dulcinea");
});

test("unknown section resolves to empty list", () => {
  assert.deepEqual(resolveSectionTasks("nope", "growth4u"), []);
});
