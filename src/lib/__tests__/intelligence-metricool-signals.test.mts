import { test } from "node:test";
import assert from "node:assert/strict";

// SAN-271 — Metricool→signals adapter. The DB upsert + the file-based collector
// are covered by the staging e2e; here we lock the PURE core (`buildContentSignals`)
// that turns published-post metrics into normalized signal rows. Runs without
// DATABASE_URL and without touching the filesystem.
const { buildContentSignals } = await import("../data/intelligence/adapters/metricool-signals");

type Snapshot = {
  impressions: number;
  likes: number;
  clicks: number;
  comments: number;
  engagement_pct: number;
  measured_at: string;
};

function post(over: Partial<{ entityId: string; metrics: Snapshot; dims: Record<string, string | number | null> }> = {}) {
  return {
    channel: "linkedin",
    entityId: "https://linkedin.com/posts/abc",
    dims: { author: "founder-1", content_type: "Hot Take", pillar: "P1", channel: "linkedin" },
    metrics: {
      impressions: 1000,
      likes: 30,
      clicks: 12,
      comments: 5,
      engagement_pct: 4.2,
      measured_at: "2026-06-18T09:00:00.000Z",
    } as Snapshot,
    ...over,
  };
}

test("buildContentSignals emits one normalized row per metric (content/metricool)", () => {
  const rows = buildContentSignals("growth4u", [post()]);
  assert.equal(rows.length, 5); // engagement_pct, impressions, likes, clicks, comments
  for (const row of rows) {
    assert.equal(row.slug, "growth4u");
    assert.equal(row.category, "content");
    assert.equal(row.provider, "metricool");
    assert.equal(row.entityType, "post");
    assert.deepEqual(row.dims, { author: "founder-1", content_type: "Hot Take", pillar: "P1", channel: "linkedin" });
    assert.ok(String(row.id).startsWith("sig_"));
  }
  assert.equal(rows.find((r) => r.metric === "engagement_pct")?.value, 4.2);
  assert.equal(rows.find((r) => r.metric === "impressions")?.value, 1000);
});

test("buildContentSignals is idempotent: same input → same ids", () => {
  const a = buildContentSignals("g", [post()]).map((r) => r.id).sort();
  const b = buildContentSignals("g", [post()]).map((r) => r.id).sort();
  assert.deepEqual(a, b);
});

test("the id buckets by day (idempotent within a day, accumulates across days)", () => {
  const morning = buildContentSignals("g", [post({ metrics: { ...post().metrics, measured_at: "2026-06-18T09:00:00.000Z" } })]);
  const evening = buildContentSignals("g", [post({ metrics: { ...post().metrics, measured_at: "2026-06-18T21:30:00.000Z" } })]);
  assert.deepEqual(
    morning.map((r) => r.id).sort(),
    evening.map((r) => r.id).sort(),
    "same day → same ids",
  );
  const nextDay = buildContentSignals("g", [post({ metrics: { ...post().metrics, measured_at: "2026-06-19T09:00:00.000Z" } })]);
  assert.notDeepEqual(
    morning.map((r) => r.id).sort(),
    nextDay.map((r) => r.id).sort(),
    "different day → different ids",
  );
});

test("buildContentSignals skips unparseable snapshots and non-finite values", () => {
  assert.equal(
    buildContentSignals("g", [post({ metrics: { ...post().metrics, measured_at: "not-a-date" } })]).length,
    0,
  );
  const partial = buildContentSignals("g", [
    post({ metrics: { impressions: 1000, likes: Number.NaN, clicks: 12, comments: 5, engagement_pct: 4.2, measured_at: "2026-06-18T09:00:00.000Z" } }),
  ]);
  assert.equal(partial.length, 4, "likes=NaN is dropped");
  assert.ok(!partial.some((r) => r.metric === "likes"));
});
