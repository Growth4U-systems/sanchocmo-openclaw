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
const { aggFor, DEFAULT_AGG } = (mod as unknown as { default: typeof mod }).default ?? mod;
const { TRUST_PILLAR_KEYS } = (tsClient as unknown as { default: typeof tsClient }).default ?? tsClient;

test("default is sum for unknown / additive metrics", () => {
  assert.equal(DEFAULT_AGG, "sum");
  for (const m of ["sessions", "clicks", "impressions", "spend", "leads", "newContacts", "totalUsers"]) {
    assert.equal(aggFor("ga4", m), "sum", `${m} should sum`);
  }
});

test("no metric pinned → sum (legacy mixed-query behaviour)", () => {
  assert.equal(aggFor(), "sum");
  assert.equal(aggFor("ga4"), "sum");
  assert.equal(aggFor(undefined, undefined), "sum");
});

test("rates and averages use avg, never sum", () => {
  for (const m of ["ctr", "cpc", "position", "bounceRate", "engagementRate", "averageSessionDuration", "avgEngagement"]) {
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
    "performance_desktop",
    "seo_desktop",
    "lcp_mobile",
    "cls_mobile",
    "tbt_mobile",
  ]) {
    assert.equal(aggFor(undefined, m), "latest", `${m} should be latest`);
  }
  for (const pillar of TRUST_PILLAR_KEYS) {
    assert.equal(aggFor("trust_score", pillar), "latest", `pillar ${pillar} should be latest`);
  }
});

test("source-specific overrides: CRM running totals are latest, increments sum", () => {
  assert.equal(aggFor("ghl", "totalContacts"), "latest");
  assert.equal(aggFor("ghl", "totalOpportunities"), "latest");
  assert.equal(aggFor("ghl", "pipelineValue"), "latest");
  // per-period increments still sum
  assert.equal(aggFor("ghl", "newContacts"), "sum");
  assert.equal(aggFor("ghl", "appointments"), "sum");
  assert.equal(aggFor("ghl", "opportunities"), "sum");
  // the same bare name without the ghl source falls through to default sum
  assert.equal(aggFor("other", "totalContacts"), "sum");
});

test("clicks and impressions always sum across sources (no collision surprise)", () => {
  for (const src of ["gsc", "meta-ads", "metricool"]) {
    assert.equal(aggFor(src, "clicks"), "sum");
    assert.equal(aggFor(src, "impressions"), "sum");
  }
});
