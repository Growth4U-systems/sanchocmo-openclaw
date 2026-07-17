import { test } from "node:test";
import assert from "node:assert/strict";
import * as mod from "../custom-metric-kpis";
import type { CustomMetric } from "../dashboard-schema";
import type { MetricKpiSnapshotInput } from "../semantic-kpis";

const { computeCustomMetricKpisFromSnapshots } =
  (mod as unknown as { default: typeof mod }).default ?? mod;

const range = { from: "2026-06-01", to: "2026-06-02" };

function row(overrides: Partial<MetricKpiSnapshotInput>): MetricKpiSnapshotInput {
  return {
    id: `snap_${Math.random().toString(16).slice(2)}`,
    source: "ga4",
    metricName: "sessions",
    value: 1,
    metricDate: "2026-06-01",
    dimensions: null,
    dimsKey: "",
    ...overrides,
  };
}

function metric(overrides: Partial<CustomMetric> = {}): CustomMetric {
  return {
    id: "cpl",
    label: "Coste por lead",
    formula: "meta-ads.spend / ghl.newContacts",
    format: "currency",
    tier: "diagnostic",
    surface: "paid",
    ...overrides,
  };
}

test("aggregates every formula reference with snapshot semantics and preserves lineage", () => {
  const [value] = computeCustomMetricKpisFromSnapshots(
    [
      row({ source: "meta_ads", metricName: "spend", value: 100, metricDate: "2026-06-01" }),
      row({ source: "meta_ads", metricName: "spend", value: 200, metricDate: "2026-06-02" }),
      row({ source: "ghl", metricName: "newContacts", value: 10, metricDate: "2026-06-01" }),
      row({ source: "ghl", metricName: "newContacts", value: 20, metricDate: "2026-06-02" }),
    ],
    range,
    [metric()],
  );

  assert.equal(value.kpiId, "custom.cpl");
  assert.equal(value.value, 10);
  assert.equal(value.unit, "account_currency");
  assert.equal(value.surface, "paid");
  assert.equal(value.dashboardBlock, "surface");
  assert.equal(value.qualityStatus, "ok");
  assert.equal(value.sourceCoverage, 1);
  assert.equal(value.inputRefs.length, 4);
  assert.match(value.provenanceLabel, /meta-ads\.spend \/ ghl\.newContacts/);
});

test("uses registered weighted semantics and normalization for rate references", () => {
  const [value] = computeCustomMetricKpisFromSnapshots(
    [
      row({ metricName: "engagementRate", value: 0.25, metricDate: "2026-06-01" }),
      row({ metricName: "sessions", value: 100, metricDate: "2026-06-01" }),
      row({ metricName: "engagementRate", value: 0.75, metricDate: "2026-06-02" }),
      row({ metricName: "sessions", value: 300, metricDate: "2026-06-02" }),
    ],
    range,
    [metric({ id: "engagement", formula: "ga4.engagementRate", format: "percent", surface: "web" })],
  );

  assert.equal(value.value, 62.5);
  assert.equal(value.unit, "%");
  assert.equal(value.qualityStatus, "ok");
  assert.deepEqual(
    value.inputRefs.map((ref) => ref.metricName).sort(),
    ["engagementRate", "engagementRate", "sessions", "sessions"],
  );
});

test("marks a missing reference and division by zero as missing, never zero", () => {
  const [missing] = computeCustomMetricKpisFromSnapshots(
    [row({ source: "meta_ads", metricName: "spend", value: 100 })],
    range,
    [metric()],
  );
  assert.equal(missing.value, null);
  assert.equal(missing.qualityStatus, "missing");
  assert.equal(missing.inputRefs.length, 1);

  const [zeroDenominator] = computeCustomMetricKpisFromSnapshots(
    [
      row({ source: "meta_ads", metricName: "spend", value: 100 }),
      row({ source: "ghl", metricName: "newContacts", value: 0 }),
    ],
    { from: "2026-06-01", to: "2026-06-01" },
    [metric()],
  );
  assert.equal(zeroDenominator.value, null);
  assert.equal(zeroDenominator.qualityStatus, "missing");
  assert.match(zeroDenominator.provenanceLabel, /division_by_zero/);
});

test("invalid stored syntax degrades to a missing custom KPI", () => {
  const [value] = computeCustomMetricKpisFromSnapshots(
    [],
    range,
    [metric({ formula: "process.exit(1)" })],
  );
  assert.equal(value.value, null);
  assert.equal(value.qualityStatus, "missing");
  assert.match(value.provenanceLabel, /invalid syntax/);

  const [constant] = computeCustomMetricKpisFromSnapshots(
    [],
    range,
    [metric({ id: "constant", formula: "42" })],
  );
  assert.equal(constant.value, null);
  assert.equal(constant.qualityStatus, "missing");
});

test("formula references use as-of for latest but keep additive flows inside range", () => {
  const [value] = computeCustomMetricKpisFromSnapshots(
    [
      row({ source: "ghl", metricName: "totalContacts", value: 100, metricDate: "2026-07-17" }),
      row({ source: "ga4", metricName: "sessions", value: 10, metricDate: "2026-07-16" }),
      row({ source: "ga4", metricName: "sessions", value: 999, metricDate: "2026-07-17" }),
    ],
    { from: "2026-07-16", to: "2026-07-16" },
    [metric({ id: "stock_plus_flow", formula: "ghl.totalContacts + ga4.sessions" })],
    { observationAsOf: "2026-07-17" },
  );

  assert.equal(value.value, 110);
  assert.deepEqual(
    value.inputRefs.map((ref) => [ref.metricName, ref.metricDate]).sort(),
    [["sessions", "2026-07-16"], ["totalContacts", "2026-07-17"]],
  );
});
