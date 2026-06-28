import { test } from "node:test";
import assert from "node:assert/strict";
import * as mod from "../metric-kpi-read-model";

const {
  formatMetricKpiValue,
  resolveMetricKpiReadRange,
  selectNorthStarKpi,
  toMetricKpiReadModelValue,
} = (mod as unknown as { default: typeof mod }).default ?? mod;

test("resolves dashboard range keys into UTC date windows", () => {
  const now = new Date("2026-06-28T12:00:00.000Z");
  assert.deepEqual(resolveMetricKpiReadRange({ range: "30d" }, now), {
    key: "30d",
    from: "2026-05-30",
    to: "2026-06-28",
  });
  assert.deepEqual(resolveMetricKpiReadRange({ from: "2026-06-01", to: "2026-06-07" }, now), {
    key: "custom",
    from: "2026-06-01",
    to: "2026-06-07",
  });
});

test("formats KPI display values without inventing missing numbers", () => {
  assert.equal(formatMetricKpiValue({ value: null, valueText: null, unit: null }), "-");
  assert.equal(formatMetricKpiValue({ value: 1234, valueText: null, unit: "currency" }), "1234 €");
  assert.equal(formatMetricKpiValue({ value: 2.45, valueText: null, unit: "ratio" }), "2,45x");
  assert.equal(formatMetricKpiValue({ value: 180, valueText: null, unit: "ms" }), "180 ms");
  assert.equal(formatMetricKpiValue({ value: 44, valueText: "44 leads", unit: null }), "44 leads");
});

test("adapts persisted KPI rows into client-safe read model values", () => {
  const value = toMetricKpiReadModelValue({
    id: "value_1",
    runId: "run_1",
    slug: "growth4u",
    kpiId: "web.sessions",
    label: "Sessions",
    dashboardBlock: "overview",
    surface: "web",
    source: "ga4",
    metricName: "sessions",
    value: 42,
    valueText: null,
    unit: null,
    qualityStatus: "ok",
    provenanceLabel: "ga4.sessions",
    inputRefs: [{ source: "ga4", metricName: "sessions" }],
    sourceCoverage: 1,
    rangeFrom: "2026-06-01",
    rangeTo: "2026-06-30",
    definitionVersion: 1,
    computedAt: new Date("2026-06-30T01:00:00.000Z"),
    createdAt: new Date("2026-06-30T01:00:00.000Z"),
    updatedAt: new Date("2026-06-30T01:00:00.000Z"),
  });

  assert.equal(value.kpiId, "web.sessions");
  assert.equal(value.displayValue, "42");
  assert.equal(value.qualityStatus, "ok");
  assert.equal(value.inputRefs.length, 1);
});

test("selects an overview KPI as the north star without requiring hardcoded business metrics", () => {
  const values = [
    { kpiId: "paid.meta.spend", dashboardBlock: "surface", value: 10 },
    { kpiId: "web.sessions", dashboardBlock: "overview", value: 25 },
  ] as mod.MetricKpiReadModelValue[];

  assert.equal(selectNorthStarKpi(values)?.kpiId, "web.sessions");
});
