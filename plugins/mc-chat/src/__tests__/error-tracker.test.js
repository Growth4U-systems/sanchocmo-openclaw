import { test } from "node:test";
import assert from "node:assert/strict";
import { createErrorTracker } from "../error-tracker.js";

function detail(category, classifiedAt) {
  return { category, raw: `raw-${category}`, classifiedAt };
}

test("record + getRecent within TTL returns the last detail", () => {
  const tracker = createErrorTracker({ ttlMs: 1000, maxEntries: 10, now: () => 1000 });
  tracker.record("sancho", detail("rate_limit", 900));
  const got = tracker.getRecent("sancho");
  assert.equal(got?.category, "rate_limit");
});

test("getRecent returns null when older than TTL", () => {
  const now = { t: 0 };
  const tracker = createErrorTracker({ ttlMs: 100, maxEntries: 10, now: () => now.t });
  now.t = 1000;
  tracker.record("sancho", detail("rate_limit", 1000));
  now.t = 1101; // 101ms later, TTL is 100ms
  assert.equal(tracker.getRecent("sancho"), null);
});

test("getRecent returns null when no record for agent", () => {
  const tracker = createErrorTracker({ ttlMs: 1000, maxEntries: 10, now: () => 1000 });
  assert.equal(tracker.getRecent("never-seen"), null);
});

test("record overwrites the prior detail for the same agent", () => {
  const tracker = createErrorTracker({ ttlMs: 1000, maxEntries: 10, now: () => 2000 });
  tracker.record("sancho", detail("rate_limit", 1500));
  tracker.record("sancho", detail("auth", 1700));
  const got = tracker.getRecent("sancho");
  assert.equal(got?.category, "auth");
});

test("eviction: dropping the oldest entry when maxEntries is exceeded", () => {
  const tracker = createErrorTracker({ ttlMs: 10_000, maxEntries: 2, now: () => 1000 });
  tracker.record("a", detail("rate_limit", 100));
  tracker.record("b", detail("auth", 200));
  tracker.record("c", detail("network", 300)); // forces eviction of 'a'
  assert.equal(tracker.getRecent("a"), null);
  assert.equal(tracker.getRecent("b")?.category, "auth");
  assert.equal(tracker.getRecent("c")?.category, "network");
});

test("custom withinMs overrides TTL on read", () => {
  const now = { t: 0 };
  const tracker = createErrorTracker({ ttlMs: 60_000, maxEntries: 10, now: () => now.t });
  now.t = 0;
  tracker.record("sancho", detail("rate_limit", 0));
  now.t = 30_000;
  // Even though TTL is 60s, ask for window of 10s → expired.
  assert.equal(tracker.getRecent("sancho", 10_000), null);
  // Within 40s window → still here.
  assert.equal(tracker.getRecent("sancho", 40_000)?.category, "rate_limit");
});
