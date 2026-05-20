#!/usr/bin/env tsx
/**
 * Unit tests for the openclaw-crons backend helpers (pure parts only —
 * brand resolution, category detection, schedule humanization).
 *
 * Run: npx tsx scripts/test-openclaw-crons.mts
 */
import assert from "assert";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const {
  resolveCronBrand,
  detectCronCategory,
  humanizeSchedule,
} = require("../src/lib/data/openclaw-crons.ts") as typeof import("../src/lib/data/openclaw-crons");

let passed = 0;
let failed = 0;

function expect(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log("  ✓", name);
  } catch (err) {
    failed++;
    console.error("  ✗", name);
    console.error("    ", err instanceof Error ? err.message : err);
  }
}

const CLIENTS = [
  { slug: "growth4u", name: "Growth4U" },
  { slug: "rocinante", name: "Rocinante" },
];

// ── resolveCronBrand ──────────────────────────────────────────────
console.log("resolveCronBrand");

expect("matches slug embedded in name", () => {
  const r = resolveCronBrand(
    { id: "1", name: "Morning Metrics — growth4u" },
    CLIENTS,
  );
  assert.equal(r, "growth4u");
});

expect("matches client display name in cron name", () => {
  const r = resolveCronBrand(
    { id: "1", name: "Pulse Check — Rocinante" },
    CLIENTS,
  );
  assert.equal(r, "rocinante");
});

expect("matches brand/<slug>/ path in prompt", () => {
  const r = resolveCronBrand(
    { id: "1", name: "Backup", payload: { message: "Run for brand/growth4u/foo" } },
    CLIENTS,
  );
  assert.equal(r, "growth4u");
});

expect("returns null for shared system crons", () => {
  const r = resolveCronBrand(
    { id: "1", name: "Daily Backup", payload: { message: "rsync everything" } },
    CLIENTS,
  );
  assert.equal(r, null);
});

expect("returns null when prompt mentions unknown brand", () => {
  const r = resolveCronBrand(
    { id: "1", name: "Job", payload: { message: "brand/unknown-brand/x" } },
    CLIENTS,
  );
  assert.equal(r, null);
});

// ── detectCronCategory ────────────────────────────────────────────
console.log("detectCronCategory");

expect("metrics from 'Morning Metrics'", () => {
  assert.equal(detectCronCategory("Morning Metrics"), "metrics");
});
expect("metrics from 'Cost Tracker'", () => {
  assert.equal(detectCronCategory("Cost Tracker"), "metrics");
});
expect("intelligence from 'Pulse Check'", () => {
  assert.equal(detectCronCategory("Pulse Check"), "intelligence");
});
expect("intelligence from 'Idea Generation'", () => {
  assert.equal(detectCronCategory("Content Idea Generation"), "intelligence");
});
expect("outreach from 'Lead Prospecting'", () => {
  assert.equal(detectCronCategory("Lead Prospecting"), "outreach");
});
expect("content from 'Blog Publisher'", () => {
  // "blog" matches content
  assert.equal(detectCronCategory("Blog Publisher"), "content");
});
expect("system from 'Daily Backup'", () => {
  assert.equal(detectCronCategory("Daily Backup"), "system");
});
expect("system from 'Memory Compaction'", () => {
  assert.equal(detectCronCategory("Memory Compaction"), "system");
});
expect("other when nothing matches", () => {
  assert.equal(detectCronCategory("Random Foo"), "other");
});

// ── humanizeSchedule (server side) ────────────────────────────────
console.log("humanizeSchedule");

expect("null schedule → em-dash", () => {
  assert.equal(humanizeSchedule(undefined), "—");
});
expect("expr Mon-Fri 09:00", () => {
  assert.equal(humanizeSchedule({ expr: "0 9 * * 1-5" }), "L-V 9:00");
});
expect("expr daily 08:00", () => {
  assert.equal(humanizeSchedule({ expr: "0 8 * * *" }), "Cada día 8:00");
});
expect("every-Ms / hourly", () => {
  assert.equal(humanizeSchedule({ kind: "every", everyMs: 3_600_000 }), "Cada 1h");
});

// ── Summary ───────────────────────────────────────────────────────
console.log("");
if (failed > 0) {
  console.error(`${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`${passed} passed`);
