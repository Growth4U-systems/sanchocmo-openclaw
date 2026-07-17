import { test } from "node:test";
import assert from "node:assert/strict";
import * as metricsModule from "../metrics";

const metrics =
  (metricsModule as unknown as { default?: typeof metricsModule }).default ??
  metricsModule;

test("metrics health prioritizes provider errors over cached data", () => {
  assert.equal(metrics.resolveMetricsHealthOverall({
    anyData: true,
    anyStale: false,
    anyError: true,
  }), "error");
});

test("metrics health distinguishes no data, stale data and healthy data", () => {
  assert.equal(metrics.resolveMetricsHealthOverall({
    anyData: false,
    anyStale: true,
    anyError: false,
  }), "no-data");
  assert.equal(metrics.resolveMetricsHealthOverall({
    anyData: true,
    anyStale: true,
    anyError: false,
  }), "stale");
  assert.equal(metrics.resolveMetricsHealthOverall({
    anyData: true,
    anyStale: false,
    anyError: false,
  }), "ok");
});

test("metrics health only classifies collector jobs as metrics cron signals", () => {
  assert.equal(metrics.isMetricsCollectorCron({
    name: "Metrics Collector — Growth4U",
    payload: { message: "node skills/metrics-collector/scripts/collect.js --slug growth4u --all" },
  }), true);
  assert.equal(metrics.isMetricsCollectorCron({
    name: "Content calendar",
    description: "Generate weekly posts",
    payload: { message: "Run the publishing workflow" },
  }), false);
});
