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

test("uses definition v9 so persisted runs reject dimensional Google Ads share fallbacks", () => {
  assert.equal(mod.METRIC_KPI_DEFINITION_VERSION, 9);
});

test("canonicalizes provider source aliases across case, spaces, hyphens and underscores", () => {
  for (const source of ["Google Analytics", "google-analytics", "google_analytics", "GA4"]) {
    assert.equal(mod.normalizeSourceId(source), "ga4");
  }
  for (const source of ["Google Search Console", "google-search-console", "google_search_console"]) {
    assert.equal(mod.normalizeSourceId(source), "gsc");
  }
  for (const source of ["Meta Ads", "meta-ads", "meta_ads", "metaads"]) {
    assert.equal(mod.normalizeSourceId(source), "meta_ads");
  }
  for (const source of ["Google Ads", "google-ads", "google_ads", "googleads"]) {
    assert.equal(mod.normalizeSourceId(source), "google_ads");
  }
  for (const source of ["Go High Level", "go-high-level", "go_high_level", "gohighlevel"]) {
    assert.equal(mod.normalizeSourceId(source), "ghl");
  }
});

test("dedupes coexisting provider aliases before spend and weighted CTR aggregation", () => {
  const values = computeSemanticKpisFromSnapshots(
    [
      row({
        id: "spend-old-alias",
        source: "meta-ads",
        metricName: "spend",
        value: 100,
        collectedAt: "2026-06-01T10:00:00.000Z",
      }),
      row({
        id: "spend-new-canonical",
        source: "meta_ads",
        metricName: "spend",
        value: 120,
        collectedAt: "2026-06-01T11:00:00.000Z",
      }),
      row({
        id: "ctr-old-alias",
        source: "meta-ads",
        metricName: "ctr",
        value: 10,
        collectedAt: "2026-06-01T10:00:00.000Z",
      }),
      row({
        id: "ctr-new-canonical",
        source: "meta_ads",
        metricName: "ctr",
        value: 20,
        collectedAt: "2026-06-01T11:00:00.000Z",
      }),
      row({
        id: "impressions-old-alias",
        source: "meta-ads",
        metricName: "impressions",
        value: 100,
        collectedAt: "2026-06-01T10:00:00.000Z",
      }),
      row({
        id: "impressions-new-canonical",
        source: "meta_ads",
        metricName: "impressions",
        value: 300,
        collectedAt: "2026-06-01T11:00:00.000Z",
      }),
      row({
        id: "spend-day-two",
        source: "meta_ads",
        metricName: "spend",
        metricDate: "2026-06-02",
        value: 80,
      }),
      row({
        id: "ctr-day-two",
        source: "meta_ads",
        metricName: "ctr",
        metricDate: "2026-06-02",
        value: 40,
      }),
      row({
        id: "impressions-day-two",
        source: "meta_ads",
        metricName: "impressions",
        metricDate: "2026-06-02",
        value: 100,
      }),
    ],
    { from: "2026-06-01", to: "2026-06-02" },
  );

  const spend = byId(values, "paid.meta.spend");
  assert.equal(spend.value, 200);
  assert.deepEqual(
    spend.inputRefs.map((input) => input.id),
    ["spend-new-canonical", "spend-day-two"],
  );

  const ctr = byId(values, "paid.meta.ctr");
  assert.equal(ctr.value, 25);
  assert.deepEqual(
    new Set(ctr.inputRefs.map((input) => input.id)),
    new Set([
      "ctr-new-canonical",
      "ctr-day-two",
      "impressions-new-canonical",
      "impressions-day-two",
    ]),
  );
});

test("prefers the canonical provider form when duplicate aliases lack collection timestamps", () => {
  const selected = mod.dedupeCanonicalMetricSnapshots([
    row({ id: "alias", source: "meta-ads", metricName: "spend", value: 99 }),
    row({ id: "canonical", source: "meta_ads", metricName: "spend", value: 7 }),
  ]);

  assert.equal(selected.length, 1);
  assert.equal(selected[0]?.id, "canonical");
});

test("declares the denominator for every volume-weighted semantic KPI", () => {
  const weights = Object.fromEntries(
    mod.METRIC_KPI_DEFINITIONS
      .filter((definition) => definition.weightMetric)
      .map((definition) => [definition.id, definition.weightMetric]),
  );
  assert.deepEqual(weights, {
    "web.engagement_rate": "sessions",
    "web.gsc_ctr": "impressions",
    "web.gsc_position": "impressions",
    "paid.meta.ctr": "impressions",
    "paid.meta.cpc": "clicks",
    "paid.meta.roas": "spend",
    "paid.google.ctr": "impressions",
    "paid.google.cpc": "clicks",
    "paid.google.roas": "spend",
    "product.activation_rate": "pageviews",
    "social.avg_engagement": "postsWithEngagement",
  });
});

test("does not invent EUR for providers that omit their account currency", () => {
  const units = Object.fromEntries(
    mod.METRIC_KPI_DEFINITIONS.map((definition) => [definition.id, definition.unit]),
  );
  for (const id of [
    "paid.meta.spend",
    "paid.meta.cpc",
    "paid.meta.revenue",
    "paid.google.spend",
    "paid.google.cpc",
    "paid.google.revenue",
    "pipeline.ghl.pipeline_value",
  ]) {
    assert.equal(units[id], "account_currency", id);
  }
  assert.equal(units["partnerships.invested"], "currency");
  assert.equal(units["partnerships.value"], "currency");
});

test("product KPI labels describe the event-based range semantics", () => {
  const labels = Object.fromEntries(
    mod.METRIC_KPI_DEFINITIONS.map((definition) => [definition.id, definition.label]),
  );
  assert.equal(
    labels["product.activation_rate"],
    "Eventos de activación por 100 pageviews",
  );
  assert.equal(
    labels["product.north_star_weekly"],
    "Eventos North Star del rango",
  );
});

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

test("keeps Instantly and Lemlist outbound counters in provider-specific KPI universes", () => {
  const values = computeSemanticKpisFromSnapshots(
    [
      row({ source: "instantly", metricName: "emailsSent", value: 100 }),
      row({ source: "instantly", metricName: "uniqueOpens", value: 50 }),
      row({ source: "instantly", metricName: "uniqueReplies", value: 5 }),
      row({ source: "lemlist", metricName: "sent", value: 20 }),
      row({ source: "lemlist", metricName: "delivered", value: 18 }),
      row({ source: "lemlist", metricName: "opens", value: 60 }),
      row({ source: "lemlist", metricName: "replies", value: 10 }),
      row({ source: "lemlist", metricName: "messagesBounced", value: 2 }),
    ],
    oneDay,
  );

  assert.equal(byId(values, "outbound.sent").value, 120);
  assert.equal(byId(values, "outbound.instantly.sent").value, 100);
  assert.equal(byId(values, "outbound.instantly.unique_opens").value, 50);
  assert.equal(byId(values, "outbound.instantly.unique_replies").value, 5);
  assert.equal(byId(values, "outbound.lemlist.sent").value, 20);
  assert.equal(byId(values, "outbound.lemlist.delivered").value, 18);
  assert.equal(byId(values, "outbound.lemlist.opens").value, 60);
  assert.equal(byId(values, "outbound.lemlist.bounced").value, 2);
});

test("keeps PageSpeed TBT separate from INP and uses the latest real INP snapshot", () => {
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

test("1d flow ending yesterday reads today's latest stocks but excludes today's flow", () => {
  const values = computeSemanticKpisFromSnapshots(
    [
      row({
        source: "pagespeed",
        metricName: "performance_mobile",
        value: 88,
        metricDate: "2026-07-17",
      }),
      row({
        source: "ghl",
        metricName: "totalContacts",
        value: 321,
        metricDate: "2026-07-17",
      }),
      row({ source: "ga4", metricName: "sessions", value: 10, metricDate: "2026-07-16" }),
      row({ source: "ga4", metricName: "sessions", value: 999, metricDate: "2026-07-17" }),
    ],
    { from: "2026-07-16", to: "2026-07-16" },
    mod.METRIC_KPI_DEFINITIONS,
    { observationAsOf: "2026-07-17" },
  );

  assert.equal(byId(values, "web.pagespeed_mobile").value, 88);
  assert.equal(byId(values, "pipeline.ghl.contacts").value, 321);
  assert.equal(byId(values, "web.sessions").value, 10);
  assert.deepEqual(byId(values, "web.sessions").inputRefs.map((ref) => ref.metricDate), ["2026-07-16"]);
});

test("a weekly latest observation before the flow range remains visible and becomes stale as-of", () => {
  const values = computeSemanticKpisFromSnapshots(
    [row({
      source: "pagespeed",
      metricName: "performance_mobile",
      value: 73,
      metricDate: "2026-07-09",
    })],
    { from: "2026-07-16", to: "2026-07-16" },
    mod.METRIC_KPI_DEFINITIONS,
    { observationAsOf: "2026-07-17" },
  );
  const performance = byId(values, "web.pagespeed_mobile");
  assert.equal(performance.value, 73);
  assert.equal(performance.qualityStatus, "stale");
  assert.equal(performance.inputRefs[0]?.metricDate, "2026-07-09");
});

test("does not present PageSpeed TBT as INP when no INP was collected", () => {
  const values = computeSemanticKpisFromSnapshots(
    [
      row({
        source: "pagespeed",
        metricName: "tbt_mobile",
        value: 120,
        metricDate: "2026-06-01",
      }),
    ],
    oneDay,
  );
  const inp = byId(values, "web.inp_mobile");
  assert.equal(inp.value, null);
  assert.equal(inp.qualityStatus, "missing");
});

test("normalizes historical GA4 engagement ratios to percent after weighting by sessions", () => {
  const values = computeSemanticKpisFromSnapshots(
    [
      row({
        source: "ga4",
        metricName: "engagementRate",
        value: 0.25,
        metricDate: "2026-06-01",
      }),
      row({
        source: "ga4",
        metricName: "sessions",
        value: 100,
        metricDate: "2026-06-01",
      }),
      row({
        source: "ga4",
        metricName: "engagementRate",
        value: 0.75,
        metricDate: "2026-06-02",
      }),
      row({
        source: "ga4",
        metricName: "sessions",
        value: 300,
        metricDate: "2026-06-02",
      }),
    ],
    { from: "2026-06-01", to: "2026-06-02" },
  );

  const engagementRate = byId(values, "web.engagement_rate");
  assert.equal(engagementRate.value, 62.5);
  assert.equal(engagementRate.unit, "%");
  assert.equal(engagementRate.qualityStatus, "ok");
  assert.equal(engagementRate.provenanceLabel, "ga4.engagementRate");
  assert.deepEqual(
    engagementRate.inputRefs.map((input) => input.metricName).sort(),
    ["engagementRate", "engagementRate", "sessions", "sessions"],
  );
});

test("shows GA4 totalUsers as an explicit daily average, never an additive range total", () => {
  const values = computeSemanticKpisFromSnapshots(
    [
      row({
        source: "ga4",
        metricName: "totalUsers",
        value: 100,
        metricDate: "2026-06-01",
      }),
      row({
        source: "ga4",
        metricName: "totalUsers",
        value: 300,
        metricDate: "2026-06-02",
      }),
    ],
    { from: "2026-06-01", to: "2026-06-02" },
  );

  const users = byId(values, "web.users");
  assert.equal(users.label, "Usuarios diarios medios");
  assert.equal(users.value, 200);
  assert.equal(users.qualityStatus, "ok");
});

test("propagates companion provenance into weighted KPI quality", () => {
  const values = computeSemanticKpisFromSnapshots(
    [
      row({ source: "ga4", metricName: "engagementRate", value: 0.5 }),
      row({
        source: "ga4",
        metricName: "sessions",
        value: 100,
        dimensions: { __provenance: "seed", __quality: "demo" },
        dimsKey: "",
      }),
    ],
    oneDay,
  );

  const engagementRate = byId(values, "web.engagement_rate");
  assert.equal(engagementRate.value, 50);
  assert.equal(engagementRate.qualityStatus, "demo");
  assert.equal(engagementRate.inputRefs.length, 2);
});

test("weights GSC rates by their matching impression volumes", () => {
  const values = computeSemanticKpisFromSnapshots(
    [
      row({
        source: "gsc",
        metricName: "ctr",
        value: 1,
        metricDate: "2026-06-01",
      }),
      row({
        source: "gsc",
        metricName: "impressions",
        value: 100,
        metricDate: "2026-06-01",
      }),
      row({
        source: "gsc",
        metricName: "ctr",
        value: 10,
        metricDate: "2026-06-02",
      }),
      row({
        source: "gsc",
        metricName: "impressions",
        value: 10_000,
        metricDate: "2026-06-02",
      }),
    ],
    { from: "2026-06-01", to: "2026-06-02" },
  );

  const ctr = byId(values, "web.gsc_ctr");
  assert.ok(ctr.value != null);
  assert.ok(Math.abs(ctr.value - 9.910891089108912) < 1e-12);
});

test("falls back to a plain mean when a weighted KPI has incomplete companions", () => {
  const values = computeSemanticKpisFromSnapshots(
    [
      row({
        source: "gsc",
        metricName: "ctr",
        value: 1,
        metricDate: "2026-06-01",
      }),
      row({
        source: "gsc",
        metricName: "impressions",
        value: 100,
        metricDate: "2026-06-01",
      }),
      row({
        source: "gsc",
        metricName: "ctr",
        value: 10,
        metricDate: "2026-06-02",
      }),
    ],
    { from: "2026-06-01", to: "2026-06-02" },
  );

  const ctr = byId(values, "web.gsc_ctr");
  assert.equal(ctr.value, 5.5);
  assert.equal(ctr.qualityStatus, "partial");
  assert.equal(ctr.inputRefs.length, 2);
});

test("weights paid ROAS by spend instead of averaging unequal days", () => {
  const values = computeSemanticKpisFromSnapshots(
    [
      row({
        source: "meta_ads",
        metricName: "roas",
        value: 1,
        metricDate: "2026-06-01",
      }),
      row({
        source: "meta_ads",
        metricName: "spend",
        value: 100,
        metricDate: "2026-06-01",
      }),
      row({
        source: "meta_ads",
        metricName: "roas",
        value: 4,
        metricDate: "2026-06-02",
      }),
      row({
        source: "meta_ads",
        metricName: "spend",
        value: 900,
        metricDate: "2026-06-02",
      }),
    ],
    { from: "2026-06-01", to: "2026-06-02" },
  );

  const roas = byId(values, "paid.meta.roas");
  assert.equal(roas.value, 3.7);
  assert.equal(roas.qualityStatus, "ok");
  assert.equal(roas.inputRefs.length, 4);
});

test("treats a historical PostHog activation rate with zero pageviews as missing", () => {
  const values = computeSemanticKpisFromSnapshots(
    [
      row({
        source: "posthog",
        metricName: "activation_rate",
        value: 0,
      }),
      row({
        source: "posthog",
        metricName: "pageviews",
        value: 0,
      }),
    ],
    oneDay,
  );

  const activationRate = byId(values, "product.activation_rate");
  assert.equal(activationRate.value, null);
  assert.equal(activationRate.qualityStatus, "missing");
  assert.equal(activationRate.sourceCoverage, 0);
  assert.equal(activationRate.inputRefs.length, 0);
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
        metricName: "Borrowed Trust",
        value: 22,
      }),
      row({
        source: "trust_score",
        metricName: "SERP Trust",
        value: 38,
      }),
      row({
        source: "trust_score",
        metricName: "Brand Assets",
        value: 31,
      }),
      row({
        source: "trust_score",
        metricName: "GEO Presence",
        value: 33,
      }),
      row({
        source: "trust_score",
        metricName: "Outbound Readiness",
        value: 78,
      }),
      row({
        source: "trust_score",
        metricName: "Demand Engine",
        value: 52,
      }),
    ],
    oneDay,
  );

  assert.equal(byId(values, "reputation.trust_score").label, "Trust Core Global");
  assert.equal(byId(values, "reputation.trust_score").value, 41);
  assert.equal(byId(values, "reputation.borrowed_trust").label, "Borrowed Trust");
  assert.equal(byId(values, "reputation.borrowed_trust").value, 22);
  assert.equal(byId(values, "reputation.serp_trust").label, "SERP Trust");
  assert.equal(byId(values, "reputation.serp_trust").value, 38);
  assert.equal(byId(values, "reputation.geo_presence").label, "GEO Presence");
  assert.equal(byId(values, "reputation.outbound_readiness").label, "Outbound Readiness");
  assert.equal(byId(values, "reputation.demand_engine").label, "Demand Engine");
  assert.equal(byId(values, "reputation.brand_assets").value, 31);
  assert.equal(byId(values, "reputation.geo_presence").value, 33);
  assert.equal(byId(values, "reputation.outbound_readiness").value, 78);
  assert.equal(byId(values, "reputation.demand_engine").value, 52);
});

test("keeps legacy Trust Core aliases readable without showing legacy labels", () => {
  const values = computeSemanticKpisFromSnapshots(
    [
      row({ source: "trust_score", metricName: "Borrow Trust", value: 22 }),
      row({ source: "trust_score", metricName: "Served Trust", value: 38 }),
      row({ source: "trust_score", metricName: "Geo Presence", value: 33 }),
      row({ source: "trust_score", metricName: "Out of Readiness", value: 78 }),
      row({ source: "trust_score", metricName: "Demand Agents", value: 52 }),
    ],
    oneDay,
  );

  assert.equal(byId(values, "reputation.borrowed_trust").label, "Borrowed Trust");
  assert.equal(byId(values, "reputation.borrowed_trust").value, 22);
  assert.equal(byId(values, "reputation.serp_trust").label, "SERP Trust");
  assert.equal(byId(values, "reputation.serp_trust").value, 38);
  assert.equal(byId(values, "reputation.geo_presence").label, "GEO Presence");
  assert.equal(byId(values, "reputation.geo_presence").value, 33);
  assert.equal(byId(values, "reputation.outbound_readiness").label, "Outbound Readiness");
  assert.equal(byId(values, "reputation.outbound_readiness").value, 78);
  assert.equal(byId(values, "reputation.demand_engine").label, "Demand Engine");
  assert.equal(byId(values, "reputation.demand_engine").value, 52);
});

test("maps Google Ads aliases without averaging campaign impression-share rows", () => {
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
      row({
        source: "google_ads",
        metricName: "lostImpressionShare",
        value: 0.2,
        dimensions: { campaignId: "campaign-1" },
        dimsKey: '[["campaignId","campaign-1"]]',
      }),
      row({
        source: "google_ads",
        metricName: "lostImpressionShare",
        value: 0.4,
        dimensions: { campaignId: "campaign-2" },
        dimsKey: '[["campaignId","campaign-2"]]',
      }),
    ],
    oneDay,
  );

  const spend = byId(values, "paid.google.spend");
  assert.equal(spend.value, 20);
  assert.equal(spend.valueText, null);
  assert.equal(spend.qualityStatus, "demo");
  const impressionShare = byId(values, "paid.google.impression_share");
  assert.equal(impressionShare.value, null);
  assert.equal(impressionShare.qualityStatus, "missing");
  assert.equal(impressionShare.inputRefs.length, 0);
  const lostImpressionShare = byId(values, "paid.google.lost_impression_share");
  assert.equal(lostImpressionShare.value, null);
  assert.equal(lostImpressionShare.qualityStatus, "missing");
  assert.equal(lostImpressionShare.inputRefs.length, 0);
});

test("uses Google Ads account rollups for impression-share KPIs", () => {
  const values = computeSemanticKpisFromSnapshots(
    [
      row({
        source: "google_ads",
        metricName: "impressionShare",
        value: 0.55,
      }),
      row({
        source: "google_ads",
        metricName: "lostImpressionShare",
        value: 0.25,
      }),
    ],
    oneDay,
  );

  assert.equal(byId(values, "paid.google.impression_share").value, 0.55);
  assert.equal(byId(values, "paid.google.lost_impression_share").value, 0.25);
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

test("weights Metricool average engagement by posts with observed engagement", () => {
  const values = computeSemanticKpisFromSnapshots(
    [
      row({
        source: "metricool",
        metricName: "avgEngagement",
        value: 10,
        dimensions: { network: "instagram" },
        dimsKey: '[["network","instagram"]]',
      }),
      row({
        source: "metricool",
        metricName: "postsWithEngagement",
        value: 1,
        dimensions: { network: "instagram" },
        dimsKey: '[["network","instagram"]]',
      }),
      row({
        source: "metricool",
        metricName: "avgEngagement",
        value: 2,
        dimensions: { network: "linkedin" },
        dimsKey: '[["network","linkedin"]]',
      }),
      row({
        source: "metricool",
        metricName: "postsWithEngagement",
        value: 9,
        dimensions: { network: "linkedin" },
        dimsKey: '[["network","linkedin"]]',
      }),
    ],
    oneDay,
  );

  const avgEngagement = byId(values, "social.avg_engagement");
  assert.equal(avgEngagement.value, 2.8);
  assert.equal(avgEngagement.unit, undefined);
  assert.equal(avgEngagement.label, "Engagement acumulado medio por publicación (escala Metricool)");
  assert.equal(
    avgEngagement.provenanceLabel,
    "Metricool · snapshot acumulado de la cohorte · escala configurada por la marca",
  );
  assert.equal(avgEngagement.inputRefs.length, 4);
});

test("excludes Metricool engagement rows whose observed-engagement count is zero", () => {
  const values = computeSemanticKpisFromSnapshots(
    [
      row({
        source: "metricool",
        metricName: "avgEngagement",
        value: 99,
        dimensions: { network: "instagram" },
        dimsKey: '[["network","instagram"]]',
      }),
      row({
        source: "metricool",
        metricName: "postsWithEngagement",
        value: 0,
        dimensions: { network: "instagram" },
        dimsKey: '[["network","instagram"]]',
      }),
      row({
        source: "metricool",
        metricName: "avgEngagement",
        value: 2,
        dimensions: { network: "linkedin" },
        dimsKey: '[["network","linkedin"]]',
      }),
      row({
        source: "metricool",
        metricName: "postsWithEngagement",
        value: 10,
        dimensions: { network: "linkedin" },
        dimsKey: '[["network","linkedin"]]',
      }),
    ],
    oneDay,
  );

  const avgEngagement = byId(values, "social.avg_engagement");
  assert.equal(avgEngagement.value, 2);
  assert.equal(avgEngagement.qualityStatus, "ok");
  assert.equal(avgEngagement.inputRefs.length, 2);
  assert.deepEqual(
    avgEngagement.inputRefs.map((input) => input.dimensions?.network).sort(),
    ["linkedin", "linkedin"],
  );
});

test("propagates source-level partial metadata into social KPI quality", () => {
  const values = computeSemanticKpisFromSnapshots(
    [row({
      source: "metricool",
      metricName: "impressions",
      value: 100,
      dimensions: { network: "instagram", __quality: "partial" },
      dimsKey: '[["__quality","partial"],["network","instagram"]]',
    })],
    oneDay,
  );
  assert.equal(byId(values, "social.impressions").value, 100);
  assert.equal(byId(values, "social.impressions").qualityStatus, "partial");
});

test("treats latest Metricool followers as one snapshot set without retaining stale networks", () => {
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
        value: 80,
        metricDate: "2026-06-01",
        dimensions: { network: "linkedin" },
        dimsKey: '[["network","linkedin"]]',
      }),
      row({
        source: "metricool",
        metricName: "followers",
        value: 120,
        metricDate: "2026-06-02",
        dimensions: { network: "instagram" },
        dimsKey: '[["network","instagram"]]',
      }),
    ],
    { from: "2026-06-01", to: "2026-06-02" },
  );
  const followers = byId(values, "social.followers");
  assert.equal(followers.value, 120);
  assert.equal(followers.qualityStatus, "ok");
  assert.deepEqual(
    followers.inputRefs.map((input) => input.dimensions?.network),
    ["instagram"],
  );
});

test("a partial followers snapshot updates observed networks but cannot remove missing ones", () => {
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
        value: 80,
        metricDate: "2026-06-01",
        dimensions: { network: "linkedin" },
        dimsKey: '[["network","linkedin"]]',
      }),
      row({
        source: "metricool",
        metricName: "followers",
        value: 120,
        metricDate: "2026-06-02",
        dimensions: { network: "instagram", __quality: "partial" },
        dimsKey: '[["__quality","partial"],["network","instagram"]]',
      }),
    ],
    { from: "2026-06-01", to: "2026-06-02" },
  );
  const followers = byId(values, "social.followers");
  assert.equal(followers.value, 200);
  assert.equal(followers.qualityStatus, "partial");
});

test("a complete exact followers scope with no values clears the previous follower set", () => {
  const values = computeSemanticKpisFromSnapshots(
    [
      row({
        source: "metricool",
        metricName: "followers",
        value: 180,
        metricDate: "2026-06-01",
        dimensions: { network: "instagram" },
        dimsKey: '[["network","instagram"]]',
      }),
      row({
        source: "metricool",
        metricName: "followers",
        value: null,
        metricDate: "2026-06-02",
        dimensions: { __scopeEvidence: "complete" },
        dimsKey: "__scope_evidence__",
      }),
    ],
    { from: "2026-06-01", to: "2026-06-02" },
  );
  const followers = byId(values, "social.followers");
  assert.equal(followers.value, null);
  assert.equal(followers.qualityStatus, "missing");
  assert.equal(followers.sourceCoverage, 0);
  assert.deepEqual(followers.inputRefs, []);
});

test("retains followers only as a degraded fallback when the exact followers scope is partial", () => {
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
        value: 80,
        metricDate: "2026-06-01",
        dimensions: { network: "linkedin" },
        dimsKey: '[["network","linkedin"]]',
      }),
      row({
        source: "metricool",
        metricName: "followers",
        value: null,
        metricDate: "2026-06-02",
        dimensions: { __scopeEvidence: "partial", __quality: "partial" },
        dimsKey: "__scope_evidence__",
      }),
    ],
    { from: "2026-06-01", to: "2026-06-02" },
  );
  const followers = byId(values, "social.followers");
  assert.equal(followers.value, 180);
  assert.equal(followers.qualityStatus, "partial");
  assert.equal(followers.sourceCoverage, 0.5);
  const followerRefs = followers.inputRefs.filter((input) =>
    input.metricName === "followers" && input.dimensions?.network);
  assert.equal(followerRefs.length, 2);
  assert.ok(followerRefs.every((input) => input.metricDate === "2026-06-01"));
  assert.ok(followers.inputRefs.some((input) =>
    input.metricName === "followers"
    && input.metricDate === "2026-06-02"
    && input.dimensions?.__scopeEvidence === "partial"));
});

test("unrelated Metricool flow evidence cannot clear the followers snapshot family", () => {
  const values = computeSemanticKpisFromSnapshots(
    [
      row({
        source: "metricool",
        metricName: "followers",
        value: 180,
        metricDate: "2026-06-01",
        dimensions: { network: "instagram" },
        dimsKey: '[["network","instagram"]]',
      }),
      row({
        source: "metricool",
        metricName: "posts",
        value: 5,
        metricDate: "2026-06-02",
        dimensions: { network: "instagram" },
        dimsKey: '[["network","instagram"]]',
      }),
    ],
    { from: "2026-06-01", to: "2026-06-02" },
  );
  const followers = byId(values, "social.followers");
  assert.equal(followers.value, 180);
  assert.equal(followers.qualityStatus, "ok");
  assert.ok(followers.inputRefs.every((input) => input.metricName === "followers"));
});

test("GHL metrics are clean when collected directly from the CRM", () => {
  const values = computeSemanticKpisFromSnapshots(
    [row({ source: "ghl", metricName: "pipelineValue", value: 25000 })],
    oneDay,
  );
  const pipelineValue = byId(values, "pipeline.ghl.pipeline_value");
  assert.equal(pipelineValue.value, 25000);
  assert.equal(pipelineValue.label, "Valor de oportunidades GHL creadas en el rango");
  assert.equal(pipelineValue.qualityStatus, "ok");
});

test("GHL distinguishes cumulative contacts from opportunities collected in the requested range", () => {
  const values = computeSemanticKpisFromSnapshots(
    [
      row({ source: "ghl", metricName: "totalContacts", value: 900 }),
      row({ source: "ghl", metricName: "newContacts", value: 12 }),
      row({ source: "ghl", metricName: "opportunities", value: 14 }),
      row({ source: "ghl", metricName: "totalOpportunities", value: 400 }),
    ],
    oneDay,
  );
  const contacts = byId(values, "pipeline.ghl.contacts");
  const newContacts = byId(values, "pipeline.ghl.new_contacts");
  const opportunities = byId(values, "pipeline.ghl.opportunities");
  assert.equal(contacts.label, "Total contactos GHL");
  assert.equal(contacts.value, 900);
  assert.equal(newContacts.label, "Contactos nuevos GHL del rango");
  assert.equal(newContacts.value, 12);
  assert.equal(opportunities.label, "Oportunidades GHL del rango");
  assert.equal(opportunities.value, 14);
});

test("latest point-in-time KPIs report full coverage when a fresh snapshot exists", () => {
  const values = computeSemanticKpisFromSnapshots(
    [row({ source: "pagespeed", metricName: "performance_mobile", value: 93, metricDate: "2026-06-03" })],
    { from: "2026-06-01", to: "2026-06-03" },
  );
  const performance = byId(values, "web.pagespeed_mobile");
  assert.equal(performance.qualityStatus, "ok");
  assert.equal(performance.sourceCoverage, 1);
});

test("Partnerships sums exact daily flows without mixing legacy rolling snapshots", () => {
  const values = computeSemanticKpisFromSnapshots(
    [
      row({ source: "yalc", metricName: "clicksDaily", value: 4, metricDate: "2026-06-01" }),
      row({ source: "yalc", metricName: "clicksDaily", value: 6, metricDate: "2026-06-02" }),
      row({ source: "yalc", metricName: "clicks", value: 999, metricDate: "2026-06-02" }),
      row({ source: "yalc", metricName: "valueDaily", value: 40, metricDate: "2026-06-01" }),
      row({ source: "yalc", metricName: "valueDaily", value: 80, metricDate: "2026-06-02" }),
      row({ source: "yalc", metricName: "invested", value: 100, metricDate: "2026-06-01" }),
      row({ source: "yalc", metricName: "invested", value: 150, metricDate: "2026-06-02" }),
    ],
    { from: "2026-06-01", to: "2026-06-02" },
  );

  assert.equal(byId(values, "partnerships.clicks").value, 10);
  assert.equal(byId(values, "partnerships.clicks").qualityStatus, "ok");
  assert.equal(byId(values, "partnerships.value").value, 120);
  assert.equal(byId(values, "partnerships.invested").value, 150);
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
