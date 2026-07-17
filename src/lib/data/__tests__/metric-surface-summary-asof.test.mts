import { test } from "node:test";
import assert from "node:assert/strict";
import * as metricsModule from "../metrics";

const {
  buildSurfaceSummaryEntries,
  selectSurfaceSummaryMetricRows,
} = (metricsModule as unknown as { default: typeof metricsModule }).default
  ?? metricsModule;

test("1d surface summary reads current stocks but excludes today's additive flow", () => {
  const selected = selectSurfaceSummaryMetricRows(
    [
      {
        source: "ga4",
        metric: "sessions",
        value: 10,
        metricDate: "2026-07-16",
      },
      {
        source: "ga4",
        metric: "sessions",
        value: 999,
        metricDate: "2026-07-17",
      },
      {
        source: "pagespeed",
        metric: "performance_mobile",
        value: 73,
        metricDate: "2026-07-09",
      },
      {
        source: "ghl",
        metric: "totalContacts",
        value: 321,
        metricDate: "2026-07-17",
      },
      {
        source: "ghl",
        metric: "newContacts",
        value: 500,
        metricDate: "2026-07-17",
      },
    ],
    { from: "2026-07-16", to: "2026-07-16", asOf: "2026-07-17" },
  );

  assert.deepEqual(
    selected.map((row) => `${row.source}.${row.metric}:${row.value}`).sort(),
    [
      "ga4.sessions:10",
      "ghl.totalContacts:321",
      "pagespeed.performance_mobile:73",
    ],
  );
  const surfaces = buildSurfaceSummaryEntries(
    selected.map(({ source }) => ({ source })),
    selected,
  );
  const web = surfaces.find((surface) => surface.surface === "web");
  const pipeline = surfaces.find((surface) => surface.surface === "pipeline");
  assert.equal(
    web?.metrics.find((metric) => metric.metric === "performance_mobile")?.value,
    73,
  );
  assert.equal(
    web?.metrics.find((metric) => metric.metric === "sessions")?.value,
    10,
  );
  assert.equal(
    pipeline?.metrics.find((metric) => metric.metric === "totalContacts")?.value,
    321,
  );
  assert.equal(pipeline?.metrics.some((metric) => metric.metric === "newContacts"), false);
});

test("surface summary never reads observations after its as-of boundary", () => {
  const selected = selectSurfaceSummaryMetricRows(
    [
      {
        source: "ghl",
        metric: "totalContacts",
        value: 321,
        metricDate: "2026-07-17",
      },
      {
        source: "ghl",
        metric: "totalContacts",
        value: 999,
        metricDate: "2026-07-18",
      },
    ],
    { from: "2026-07-16", to: "2026-07-16", asOf: "2026-07-17" },
  );
  assert.deepEqual(selected.map((row) => row.value), [321]);
});
