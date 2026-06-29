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

test("maps Lemlist rollups onto outbound KPIs", () => {
  const values = computeSemanticKpisFromSnapshots(
    [
      row({ source: "lemlist", metricName: "sent", value: 12 }),
      row({ source: "lemlist", metricName: "opens", value: 7 }),
      row({ source: "lemlist", metricName: "replies", value: 3 }),
    ],
    oneDay,
  );

  assert.equal(byId(values, "outbound.sent").value, 12);
  assert.equal(byId(values, "outbound.opens").value, 7);
  assert.equal(byId(values, "outbound.replies").qualityStatus, "ok");
});

test("maps Lemlist deliverability and meeting fields when present", () => {
  const values = computeSemanticKpisFromSnapshots(
    [
      row({ source: "lemlist", metricName: "delivered", value: 11 }),
      row({ source: "lemlist", metricName: "messagesBounced", value: 2 }),
      row({ source: "lemlist", metricName: "unsubscribed", value: 1 }),
      row({ source: "lemlist", metricName: "interested", value: 3 }),
      row({ source: "lemlist", metricName: "meetingBooked", value: 4 }),
    ],
    oneDay,
  );

  assert.equal(byId(values, "outbound.delivered").value, 11);
  assert.equal(byId(values, "outbound.bounced").value, 2);
  assert.equal(byId(values, "outbound.unsubscribed").value, 1);
  assert.equal(byId(values, "outbound.positive_replies").value, 3);
  assert.equal(byId(values, "outbound.meetings").qualityStatus, "ok");
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

test("maps Trust Core labels and aliases onto Reputation KPIs", () => {
  const values = computeSemanticKpisFromSnapshots(
    [
      row({
        source: "Trust Core",
        metricName: "Trust Core Global",
        value: 41,
      }),
      row({
        source: "trust-core",
        metricName: "Borrow Trust",
        value: 22,
      }),
      row({
        source: "trust_score",
        metricName: "Served Trust",
        value: 38,
      }),
      row({
        source: "trust_score",
        metricName: "Brand Assets",
        value: 31,
      }),
      row({
        source: "trust_score",
        metricName: "Geo Presence",
        value: 33,
      }),
      row({
        source: "trust_score",
        metricName: "Out of Readiness",
        value: 78,
      }),
      row({
        source: "trust_score",
        metricName: "Demand Agents",
        value: 52,
      }),
    ],
    oneDay,
  );

  assert.equal(byId(values, "reputation.trust_score").label, "Trust Core Global");
  assert.equal(byId(values, "reputation.trust_score").value, 41);
  assert.equal(byId(values, "reputation.borrowed_trust").label, "Borrow Trust");
  assert.equal(byId(values, "reputation.borrowed_trust").value, 22);
  assert.equal(byId(values, "reputation.serp_trust").label, "Served Trust");
  assert.equal(byId(values, "reputation.serp_trust").value, 38);
  assert.equal(byId(values, "reputation.brand_assets").value, 31);
  assert.equal(byId(values, "reputation.geo_presence").value, 33);
  assert.equal(byId(values, "reputation.outbound_readiness").value, 78);
  assert.equal(byId(values, "reputation.demand_engine").value, 52);
});

test("maps Google Ads aliases and keeps seed platform KPIs as demo", () => {
  const values = computeSemanticKpisFromSnapshots(
    [
      row({
        source: "google-ads",
        metricName: "spend",
        value: 20,
        dimensions: { __provenance: "seed", __quality: "demo" },
        dimsKey: "",
      }),
      row({
        source: "google_ads",
        metricName: "impressionShare",
        value: 0.5,
        dimensions: { keyword: "brand", __provenance: "seed" },
        dimsKey: '[["keyword","brand"]]',
      }),
      row({
        source: "google_ads",
        metricName: "impressionShare",
        value: 0.7,
        dimensions: { keyword: "non-brand", __provenance: "seed" },
        dimsKey: '[["keyword","non-brand"]]',
      }),
    ],
    oneDay,
  );

  const spend = byId(values, "paid.google.spend");
  assert.equal(spend.value, 20);
  assert.equal(spend.valueText, null);
  assert.equal(spend.qualityStatus, "demo");
  const impressionShare = byId(values, "paid.google.impression_share");
  assert.equal(impressionShare.value, 0.6);
  assert.equal(impressionShare.qualityStatus, "demo");
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

test("rolls latest Metricool followers by network without dropping dimensions", () => {
  const values = computeSemanticKpisFromSnapshots(
    [
      row({
        source: "metricool",
        metricName: "followers",
        value: 100,
        metricDate: "2026-06-01",
        dimensions: { network: "instagram" },
        dimsKey: '[["network","instagram"]]',
      }),
      row({
        source: "metricool",
        metricName: "followers",
        value: 120,
        metricDate: "2026-06-02",
        dimensions: { network: "instagram" },
        dimsKey: '[["network","instagram"]]',
      }),
      row({
        source: "metricool",
        metricName: "followers",
        value: 80,
        metricDate: "2026-06-02",
        dimensions: { network: "linkedin" },
        dimsKey: '[["network","linkedin"]]',
      }),
    ],
    { from: "2026-06-01", to: "2026-06-02" },
  );
  const followers = byId(values, "social.followers");
  assert.equal(followers.value, 200);
  assert.equal(followers.qualityStatus, "ok");
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

test("ingest-style __provenance/__quality metadata marks seed rows as demo", () => {
  const values = computeSemanticKpisFromSnapshots(
    [
      row({
        source: "ga4",
        metricName: "sessions",
        value: 25,
        dimensions: { __provenance: "seed", __quality: "demo" },
        dimsKey: "",
      }),
    ],
    oneDay,
  );
  const sessions = byId(values, "web.sessions");
  assert.equal(sessions.value, 25);
  assert.equal(sessions.qualityStatus, "demo");
  assert.equal(sessions.inputRefs[0]?.dimensions?.__provenance, "seed");
});

test("mixed real and seed inputs never publish a KPI as ok", () => {
  const values = computeSemanticKpisFromSnapshots(
    [
      row({ source: "ga4", metricName: "sessions", value: 10 }),
      row({
        source: "ga4",
        metricName: "sessions",
        value: 5,
        dimensions: { __provenance: "seed", __quality: "demo" },
        dimsKey: "",
      }),
    ],
    oneDay,
  );
  const sessions = byId(values, "web.sessions");
  assert.equal(sessions.value, 15);
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
