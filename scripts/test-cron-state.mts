#!/usr/bin/env tsx
/**
 * Unit tests for the cron state derivation + helpers.
 *
 * Run: npx tsx scripts/test-cron-state.mts
 *
 * No vitest/jest in this project; we use node's assert with a tiny `expect`
 * helper so each scenario reports a clear pass/fail line.
 */
import assert from "assert";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const {
  deriveCronState,
  isEnabled,
  formatDuration,
  formatRelative,
  humanizeSchedule,
} = require("../src/components/cron/types.ts") as typeof import("../src/components/cron/types");

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

const NOW = 1_750_000_000_000; // fixed epoch for determinism

// ── deriveCronState ───────────────────────────────────────────────
console.log("deriveCronState");

expect("paused when status=paused and not running", () => {
  const r = deriveCronState({
    cron: { id: "a", name: "A", status: "paused" },
    now: NOW,
  });
  assert.equal(r.state, "paused");
});

expect("running wins over paused (toggle off mid-run)", () => {
  const r = deriveCronState({
    cron: {
      id: "a",
      name: "A",
      status: "paused",
      running: { startedAtMs: NOW - 12_000, lastTouchMs: NOW - 1_000, sessionId: null },
    },
    now: NOW,
  });
  assert.equal(r.state, "running");
  assert.equal(r.ago, 12_000);
});

expect("running ago is non-negative for clock drift", () => {
  const r = deriveCronState({
    cron: {
      id: "a",
      name: "A",
      status: "active",
      running: { startedAtMs: NOW + 5_000, lastTouchMs: NOW + 5_000, sessionId: null },
    },
    now: NOW,
  });
  assert.equal(r.state, "running");
  assert.equal(r.ago, 0);
});

expect("queued from pendingClickFresh", () => {
  const r = deriveCronState({
    cron: { id: "a", name: "A", status: "active" },
    pendingClickFresh: true,
    now: NOW,
  });
  assert.equal(r.state, "queued");
});

expect("queued from fresh flash (<10s old)", () => {
  const r = deriveCronState({
    cron: { id: "a", name: "A", status: "active" },
    flash: { kind: "queued", message: "Lanzada", createdAt: NOW - 5_000 },
    now: NOW,
  });
  assert.equal(r.state, "queued");
});

expect("queued flash expires after 10s", () => {
  const r = deriveCronState({
    cron: { id: "a", name: "A", status: "active" },
    flash: { kind: "queued", message: "Lanzada", createdAt: NOW - 12_000 },
    now: NOW,
  });
  // No consecutive errors, no last_run → idle.
  assert.equal(r.state, "idle");
});

expect("error when consecutive_errors > 0", () => {
  const r = deriveCronState({
    cron: {
      id: "a",
      name: "A",
      status: "active",
      consecutive_errors: 3,
      last_diagnostic_summary: "Out of usage",
      last_run_at: new Date(NOW - 60_000).toISOString(),
    },
    now: NOW,
  });
  assert.equal(r.state, "error");
  assert.equal(r.summary, "Out of usage");
  assert.equal(r.ago, 60_000);
});

expect("ok when last_status=ok and no errors", () => {
  const r = deriveCronState({
    cron: {
      id: "a",
      name: "A",
      status: "active",
      last_status: "ok",
      last_finding: "5 ideas",
      last_run_at: new Date(NOW - 3_600_000).toISOString(),
    },
    now: NOW,
  });
  assert.equal(r.state, "ok");
  assert.equal(r.summary, "5 ideas");
  assert.equal(r.ago, 3_600_000);
});

expect("idle when never ran", () => {
  const r = deriveCronState({
    cron: { id: "a", name: "A", status: "active" },
    now: NOW,
  });
  assert.equal(r.state, "idle");
});

// ── isEnabled ─────────────────────────────────────────────────────
console.log("isEnabled");

expect("status=active is enabled", () => {
  assert.equal(isEnabled({ status: "active" }), true);
});

expect("status=paused is disabled", () => {
  assert.equal(isEnabled({ status: "paused" }), false);
});

expect("missing status defaults to enabled (matches daemon)", () => {
  assert.equal(isEnabled({}), true);
});

// ── formatDuration ────────────────────────────────────────────────
console.log("formatDuration");

expect("0 ms → 0s", () => assert.equal(formatDuration(0), "0s"));
expect("500 ms → 0s (sub-second)", () => assert.equal(formatDuration(500), "0s"));
expect("12500 ms → 12s", () => assert.equal(formatDuration(12_500), "12s"));
expect("60000 ms → 1m", () => assert.equal(formatDuration(60_000), "1m"));
expect("125000 ms → 2m 5s", () => assert.equal(formatDuration(125_000), "2m 5s"));
expect("negative clamps to 0", () => assert.equal(formatDuration(-100), "0s"));

// ── formatRelative ────────────────────────────────────────────────
console.log("formatRelative");

expect("null → nunca", () => assert.equal(formatRelative(null, NOW), "nunca"));
expect("<1 min → ahora mismo", () => {
  assert.equal(formatRelative(new Date(NOW - 30_000).toISOString(), NOW), "ahora mismo");
});
expect("12 min ago", () => {
  assert.equal(formatRelative(new Date(NOW - 12 * 60_000).toISOString(), NOW), "hace 12 min");
});
expect("3 hours ago", () => {
  assert.equal(formatRelative(new Date(NOW - 3 * 3_600_000).toISOString(), NOW), "hace 3h");
});
expect("2 days ago", () => {
  assert.equal(formatRelative(new Date(NOW - 2 * 86_400_000).toISOString(), NOW), "hace 2d");
});

// ── humanizeSchedule ──────────────────────────────────────────────
console.log("humanizeSchedule");

expect("empty → em-dash", () => assert.equal(humanizeSchedule(undefined), "—"));
expect("cron expression Mon-Fri 09:00", () => {
  assert.equal(humanizeSchedule({ expr: "0 9 * * 1-5" }), "L-V 9:00");
});
expect("cron multi-hour", () => {
  assert.equal(humanizeSchedule({ expr: "0 8,12,16 * * *" }), "Cada día 8:00, 12:00, 16:00");
});
expect("every-Ms / hourly", () => {
  assert.equal(humanizeSchedule({ kind: "every", everyMs: 3_600_000 }), "Cada 1h");
});
expect("every-Ms / daily", () => {
  assert.equal(humanizeSchedule({ kind: "every", everyMs: 86_400_000 }), "Cada 1d");
});

// ── Summary ───────────────────────────────────────────────────────
console.log("");
if (failed > 0) {
  console.error(`${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`${passed} passed`);
