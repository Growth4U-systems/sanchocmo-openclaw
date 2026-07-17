/**
 * Aggregation strategy resolution (SAN-300) — pure, no DB.
 * Guards that additive metrics sum, rates average, and snapshots take latest,
 * so week/month rollups and trends never sum a position or a trust score.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as mod from "../aggregation";
import * as tsClient from "../../trust-score/client";

// .mts→.ts interop: named imports across the boundary fail under tsx, so unwrap
// the namespace's default (mirrors every other test in this repo).
const { aggFor, DEFAULT_AGG, reduceMetricSeries, weightMetricFor } =
  (mod as unknown as { default: typeof mod }).default ?? mod;
const { TRUST_PILLAR_KEYS } = (tsClient as unknown as { default: typeof tsClient }).default ?? tsClient;

test("default is sum for unknown / additive metrics", () => {
  assert.equal(DEFAULT_AGG, "sum");
  for (const m of ["sessions", "clicks", "impressions", "spend", "leads", "newContacts"]) {
    assert.equal(aggFor("ga4", m), "sum", `${m} should sum`);
  }
});

test("no metric pinned → sum (legacy mixed-query behaviour)", () => {
  assert.equal(aggFor(), "sum");
  assert.equal(aggFor("ga4"), "sum");
  assert.equal(aggFor(undefined, undefined), "sum");
});

test("rates and averages use avg, never sum", () => {
  for (const m of [
    "ctr",
    "cpc",
    "position",
    "bounceRate",
    "engagementRate",
    "averageSessionDuration",
    "totalUsers",
    "avgEngagement",
    "frequency",
    "roas",
    "impressionShare",
    "lostImpressionShare",
    "hookRate",
    "activation_rate",
    "topPageDuration",
    "topPageEngagementRate",
  ]) {
    assert.equal(aggFor(undefined, m), "avg", `${m} should avg`);
  }
  // collisions stay correct regardless of source
  assert.equal(aggFor("gsc", "ctr"), "avg");
  assert.equal(aggFor("meta-ads", "ctr"), "avg");
  assert.equal(aggFor("gsc", "position"), "avg");
});

test("scores and web vitals take the latest snapshot", () => {
  for (const m of [
    "trust_score",
    "performance_mobile",
    "seo_mobile",
    "accessibility_mobile",
    "best_practices_mobile",
    "performance_desktop",
    "seo_desktop",
    "accessibility_desktop",
    "best_practices_desktop",
    "lcp_mobile",
    "cls_mobile",
    "inp_mobile",
    "tbt_mobile",
    "lcp_desktop",
    "cls_desktop",
    "inp_desktop",
    "tbt_desktop",
    "followers",
    "followersTotal",
    "followerCount",
  ]) {
    assert.equal(aggFor(undefined, m), "latest", `${m} should be latest`);
  }
  for (const pillar of TRUST_PILLAR_KEYS) {
    assert.equal(aggFor("trust_score", pillar), "latest", `pillar ${pillar} should be latest`);
  }
});

test("source-specific overrides: CRM running totals are latest, period values sum", () => {
  assert.equal(aggFor("ga4", "totalUsers"), "avg");
  assert.equal(aggFor("google-analytics", "totalUsers"), "avg");
  assert.equal(aggFor("ghl", "totalContacts"), "latest");
  assert.equal(aggFor("ghl", "totalOpportunities"), "latest");
  // per-period increments still sum
  assert.equal(aggFor("ghl", "newContacts"), "sum");
  assert.equal(aggFor("ghl", "appointments"), "sum");
  assert.equal(aggFor("ghl", "opportunities"), "sum");
  assert.equal(aggFor("ghl", "pipelineValue"), "sum");
  // the same bare name without the ghl source falls through to default sum
  assert.equal(aggFor("other", "totalContacts"), "sum");
});

test("Lemlist campaign catalogue is a latest snapshot while delivery stats remain additive", () => {
  assert.equal(aggFor("lemlist", "campaigns"), "latest");
  assert.equal(aggFor("lemlist", "sent"), "sum");
  assert.equal(aggFor("lemlist", "replied"), "sum");
});

test("Explee lifetime/current project metrics always use the newest snapshot", () => {
  for (const metric of [
    "campaignsCurrent",
    "emailsSentLifetime",
    "repliesLifetime",
    "replyRatePctLifetime",
    "hotLeadsLifetime",
    "spendUsdLifetime",
    "costPerHotLeadUsdLifetime",
  ]) {
    assert.equal(aggFor("explee", metric), "latest", metric);
  }
  assert.deepEqual(
    reduceMetricSeries(aggFor("explee", "emailsSentLifetime"), [
      { date: "2026-07-16", value: 90 },
      { date: "2026-07-17", value: 100 },
    ]),
    { value: 100, quality: "ok" },
  );
});

test("source aliases are canonicalized before source-specific overrides", () => {
  for (const source of ["ghl", "go-high-level", "go_high_level", "GO HIGH LEVEL", "gohighlevel"]) {
    assert.equal(aggFor(source, "totalContacts"), "latest", `${source} totalContacts`);
    assert.equal(aggFor(source, "pipeline"), "latest", `${source} pipeline`);
    assert.equal(aggFor(source, "pipelineStage"), "latest", `${source} pipelineStage`);
  }
  assert.equal(aggFor("other", "pipeline"), "sum");
  assert.equal(aggFor("other", "pipelineStage"), "sum");
});

test("GHL pipeline snapshots select the newest day instead of summing repeated state", () => {
  const result = reduceMetricSeries(aggFor("go-high-level", "pipelineStage"), [
    { date: "2026-07-01", value: 8 },
    { date: "2026-07-02", value: 11 },
  ]);
  assert.deepEqual(result, { value: 11, quality: "ok" });
});

test("Metricool post detail keeps the newest cumulative post snapshot", () => {
  for (const metric of [
    "postDetail",
    "postLikes",
    "postClicks",
    "postShares",
    "postSaves",
    "postReach",
    "postVideoViews",
    "postEngagement",
  ]) {
    assert.equal(aggFor("metricool", metric), "latest", metric);
  }
  const result = reduceMetricSeries(aggFor("metricool", "postDetail"), [
    { date: "2026-07-01", value: 100 },
    { date: "2026-07-02", value: 145 },
  ]);
  assert.deepEqual(result, { value: 145, quality: "ok" });
});

test("clicks and impressions always sum across sources (no collision surprise)", () => {
  for (const src of ["gsc", "meta-ads", "metricool"]) {
    assert.equal(aggFor(src, "clicks"), "sum");
    assert.equal(aggFor(src, "impressions"), "sum");
  }
});

test("companion-weight vocabulary covers traffic, paid, product and social averages", () => {
  assert.equal(weightMetricFor("gsc", "ctr"), "impressions");
  assert.equal(weightMetricFor("google-search-console", "position"), "impressions");
  assert.equal(weightMetricFor("meta-ads", "cpc"), "clicks");
  assert.equal(weightMetricFor("google_ads", "roas"), "spend");
  assert.equal(weightMetricFor("google-analytics", "engagementRate"), "sessions");
  assert.equal(weightMetricFor("ga4", "bounceRate"), "sessions");
  assert.equal(weightMetricFor("google-analytics", "topPageDuration"), "topPageSessions");
  assert.equal(weightMetricFor("ga4", "topPageEngagementRate"), "topPageSessions");
  assert.equal(weightMetricFor("posthog", "activation_rate"), "pageviews");
  assert.equal(weightMetricFor("metricool", "avgEngagement"), "postsWithEngagement");
  assert.equal(weightMetricFor("Meta Ads", "cpc"), "clicks");
  assert.equal(weightMetricFor("GOOGLE ANALYTICS", "engagementRate"), "sessions");
  assert.equal(weightMetricFor("ga4", "totalUsers"), null);
  assert.equal(weightMetricFor("gsc", "clicks"), null);
});

test("rate reduction weights every daily value by its same-date denominator", () => {
  const result = reduceMetricSeries(
    "avg",
    [
      { date: "2026-07-01", value: 10 },
      { date: "2026-07-02", value: 20 },
    ],
    "impressions",
    [
      { date: "2026-07-01", value: 100 },
      { date: "2026-07-02", value: 900 },
    ],
  );
  assert.equal(result.value, 19);
  assert.equal(result.quality, "ok");
  assert.equal(result.fallbackReason, undefined);
});

test("GA4 top-page siblings weight duration and percent rate by sessions, not pageviews", () => {
  const sessionWeights = [
    { date: "2026-07-01", value: 100 },
    { date: "2026-07-02", value: 300 },
  ];
  for (const metric of ["topPageDuration", "topPageEngagementRate"]) {
    const result = reduceMetricSeries(
      aggFor("google analytics", metric),
      [
        { date: "2026-07-01", value: 20 },
        { date: "2026-07-02", value: 40 },
      ],
      weightMetricFor("google analytics", metric),
      sessionWeights,
    );
    assert.deepEqual(result, { value: 35, quality: "ok" }, metric);
  }
});

test("incomplete companion coverage keeps every value but marks arithmetic fallback partial", () => {
  const result = reduceMetricSeries(
    "avg",
    [
      { date: "2026-07-01", value: 10 },
      { date: "2026-07-02", value: 20 },
    ],
    "sessions",
    [{ date: "2026-07-01", value: 100 }],
  );
  assert.equal(result.value, 15);
  assert.equal(result.quality, "partial");
  assert.equal(result.fallbackReason, "missing_companion_weight");
});

test("ambiguous or all-zero companions never masquerade as exact weighted averages", () => {
  const values = [
    { date: "2026-07-01", value: 10 },
    { date: "2026-07-02", value: 20 },
  ];
  const ambiguous = reduceMetricSeries("avg", values, "clicks", [
    { date: "2026-07-01", value: 10 },
    { date: "2026-07-01", value: 20 },
    { date: "2026-07-02", value: 30 },
  ]);
  assert.equal(ambiguous.quality, "partial");
  assert.equal(ambiguous.fallbackReason, "ambiguous_companion_weight");

  const zero = reduceMetricSeries("avg", values, "clicks", [
    { date: "2026-07-01", value: 0 },
    { date: "2026-07-02", value: 0 },
  ]);
  assert.equal(zero.value, 0);
  assert.equal(zero.quality, "missing");
  assert.equal(zero.fallbackReason, "zero_total_weight");

  const mixed = reduceMetricSeries("avg", values, "clicks", [
    { date: "2026-07-01", value: 0 },
    { date: "2026-07-02", value: 5 },
  ]);
  assert.equal(mixed.value, 20);
  assert.equal(mixed.quality, "ok");

  const singleZero = reduceMetricSeries(
    "avg",
    [{ date: "2026-07-01", value: 99 }],
    "clicks",
    [{ date: "2026-07-01", value: 0 }],
  );
  assert.equal(singleZero.value, 0);
  assert.equal(singleZero.quality, "missing");
});

test("empty windows are explicitly missing while sum/latest keep exact semantics", () => {
  assert.equal(reduceMetricSeries("avg", [], "sessions", []).quality, "missing");
  assert.deepEqual(
    reduceMetricSeries("sum", [
      { date: "2026-07-01", value: 2 },
      { date: "2026-07-02", value: 3 },
    ]),
    { value: 5, quality: "ok" },
  );
  assert.deepEqual(
    reduceMetricSeries("latest", [
      { date: "2026-07-02", value: 3 },
      { date: "2026-07-01", value: 2 },
    ]),
    { value: 3, quality: "ok" },
  );
});
