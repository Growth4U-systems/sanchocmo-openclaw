/**
 * Semantic KPI definitions (SAN-354) - pure, no DB.
 *
 * Guards the direct KPI layer against the concrete data drifts found during the
 * dashboard lineage review: connector aliases, dimension-only social rollups,
 * dirty CRM data, seed/demo rows, and intentionally-missing future layers.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as mod from "../semantic-kpis";

const { computeSemanticKpisFromSnapshots, summarizeKpiQuality } =
  (mod as unknown as { default: typeof mod }).default ?? mod;

type SnapshotInput = mod.MetricKpiSnapshotInput;

const oneDay = { from: "2026-06-01", to: "2026-06-01" };

function row(overrides: Partial<SnapshotInput>): SnapshotInput {
  return {
    id: `row_${Math.random().toString(16).slice(2)}`,
    source: "ga4",
    metricName: "sessions",
    value: 1,
    metricDate: "2026-06-01",
    dimensions: null,
    dimsKey: "",
    ...overrides,
  };
}

function byId(
  values: ReturnType<typeof computeSemanticKpisFromSnapshots>,
  id: string,
) {
  const value = values.find((item) => item.kpiId === id);
  assert.ok(value, `missing KPI ${id}`);
  return value;
}

test("maps Instantly emailsSent onto outbound.sent without faking data", () => {
  const values = computeSemanticKpisFromSnapshots(
    [row({ source: "instantly", metricName: "emailsSent", value: 42 })],
    oneDay,
  );
  const sent = byId(values, "outbound.sent");
  assert.equal(sent.value, 42);
  assert.equal(sent.qualityStatus, "ok");
  assert.equal(sent.inputRefs[0]?.metricName, "emailsSent");
});

test("maps legacy PageSpeed tbt_mobile onto INP and keeps the latest snapshot", () => {
  const values = computeSemanticKpisFromSnapshots(
    [
      row({
        source: "pagespeed",
        metricName: "tbt_mobile",
        value: 120,
        metricDate: "2026-06-01",
      }),
      row({
        source: "pagespeed",
        metricName: "inp_mobile",
        value: 75,
        metricDate: "2026-06-02",
      }),
    ],
    { from: "2026-06-01", to: "2026-06-02" },
  );
  const inp = byId(values, "web.inp_mobile");
  assert.equal(inp.value, 75);
  assert.equal(inp.qualityStatus, "ok");
});

test("rolls up Metricool social metrics when only network dimensions exist", () => {
  const values = computeSemanticKpisFromSnapshots(
    [
      row({
        source: "metricool",
        metricName: "impressions",
        value: 100,
        dimensions: { network: "instagram" },
        dimsKey: '[["network","instagram"]]',
      }),
      row({
        source: "metricool",
        metricName: "impressions",
        value: 50,
        dimensions: { network: "linkedin" },
        dimsKey: '[["network","linkedin"]]',
      }),
    ],
    oneDay,
  );
  const impressions = byId(values, "social.impressions");
  assert.equal(impressions.value, 150);
  assert.equal(impressions.qualityStatus, "ok");
  assert.equal(impressions.inputRefs.length, 2);
});

test("marks known-dirty GHL metrics as dirty instead of ok", () => {
  const values = computeSemanticKpisFromSnapshots(
    [row({ source: "ghl", metricName: "pipelineValue", value: 25000 })],
    oneDay,
  );
  const pipelineValue = byId(values, "pipeline.ghl.pipeline_value");
  assert.equal(pipelineValue.value, 25000);
  assert.equal(pipelineValue.qualityStatus, "dirty");
});

test("metadata-only seed/demo rows remain selectable but never look live", () => {
  const values = computeSemanticKpisFromSnapshots(
    [
      row({
        source: "ga4",
        metricName: "sessions",
        value: 25,
        dimensions: { provenance: "seed" },
        dimsKey: '[["provenance","seed"]]',
      }),
    ],
    oneDay,
  );
  const sessions = byId(values, "web.sessions");
  assert.equal(sessions.value, 25);
  assert.equal(sessions.qualityStatus, "demo");
});

test("partial coverage is explicit for additive KPIs over multi-day ranges", () => {
  const values = computeSemanticKpisFromSnapshots(
    [
      row({
        source: "ga4",
        metricName: "sessions",
        value: 10,
        metricDate: "2026-06-01",
      }),
    ],
    { from: "2026-06-01", to: "2026-06-03" },
  );
  const sessions = byId(values, "web.sessions");
  assert.equal(sessions.value, 10);
  assert.equal(sessions.qualityStatus, "partial");
  assert.equal(sessions.sourceCoverage, 1 / 3);
});

test("future attribution/conversion/trend layers stay missing until implemented", () => {
  const values = computeSemanticKpisFromSnapshots([], oneDay);
  assert.equal(
    byId(values, "channels.attribution_results").qualityStatus,
    "missing",
  );
  assert.equal(byId(values, "conversion.stage_rollups").value, null);
  assert.equal(byId(values, "trends.annotations").inputRefs.length, 0);
  assert.equal(summarizeKpiQuality(values).missing > 0, true);
});
