import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as kpisMod from "../metric-kpis";
import * as funnelMod from "../metric-funnel";

const kpis = (kpisMod as unknown as { default: typeof kpisMod }).default ?? kpisMod;
const funnel = (funnelMod as unknown as { default: typeof funnelMod }).default ?? funnelMod;

const {
  canonicalMetricDimensions,
  metricKpiValueId,
  stableSemanticId,
} = kpis;
const {
  getDefaultFunnelStageMap,
  metricStageRollupId,
  validateFunnelStageMap,
} = funnel;

test("canonicalMetricDimensions produces stable keys independent of input order", () => {
  const a = canonicalMetricDimensions({ channel: "paid", campaign: 123, empty: "" });
  const b = canonicalMetricDimensions({ campaign: 123, channel: "paid" });

  assert.deepEqual(a, b);
  assert.deepEqual(a.dimensions, { campaign: "123", channel: "paid" });
  assert.equal(a.dimsKey, JSON.stringify([["campaign", "123"], ["channel", "paid"]]));

  const idA = metricKpiValueId({
    slug: "acme",
    definitionId: "paid.spend",
    rangeStart: "2026-06-01",
    rangeEnd: "2026-06-30",
    grain: "range",
    dimsKey: a.dimsKey,
  });
  const idB = metricKpiValueId({
    slug: "acme",
    definitionId: "paid.spend",
    rangeStart: "2026-06-01",
    rangeEnd: "2026-06-30",
    grain: "range",
    dimsKey: b.dimsKey,
  });
  assert.equal(idA, idB);
  assert.match(idA, /^mkv_[a-f0-9]{24}$/);
});

test("dimension canonicalization rejects unstable keys and nested values", () => {
  assert.throws(() => canonicalMetricDimensions({ "bad-key": "x" }), /Invalid metric dimension key/);
  assert.throws(() => canonicalMetricDimensions({ channel: { nested: true } }), /must be a scalar/);
});

test("stableSemanticId changes only when semantic identity parts change", () => {
  assert.equal(stableSemanticId("slug", "metric", "2026-06-01"), stableSemanticId("slug", "metric", "2026-06-01"));
  assert.notEqual(stableSemanticId("slug", "metric", "2026-06-01"), stableSemanticId("slug", "metric", "2026-06-02"));
});

test("default funnel maps validate for supported archetypes and use stable rollup ids", () => {
  for (const archetype of ["lead-to-sale", "marketplace", "saas", "ecommerce", "fintech"]) {
    const stages = getDefaultFunnelStageMap(archetype);
    assert.ok(stages.length >= 4, `expected enough stages for ${archetype}`);
    assert.deepEqual(validateFunnelStageMap(stages), []);
    assert.equal([...stages].sort((a, b) => a.stageOrder - b.stageOrder)[0].stageOrder, 10);
  }

  const dims = canonicalMetricDimensions({ channel: "paid" });
  const rollup = { metricDate: "2026-06-27", stageKey: "meetings", channel: "paid", count: 12 };
  assert.equal(metricStageRollupId("acme", rollup, dims.dimsKey), metricStageRollupId("acme", rollup, dims.dimsKey));
  assert.match(metricStageRollupId("acme", rollup, dims.dimsKey), /^msroll_[a-f0-9]{24}$/);
});

test("funnel validator returns errors for duplicate stages and bad dimensions", () => {
  const errors = validateFunnelStageMap([
    { stageKey: "lead", stageLabel: "Lead", stageOrder: 10, source: "ghl", metricName: "newContacts" },
    { stageKey: "lead", stageLabel: "Lead again", stageOrder: -1, source: "", metricName: "", dimensions: { "bad-key": "x" } },
  ]);
  assert.ok(errors.some((error) => error.includes("Duplicate stage key")));
  assert.ok(errors.some((error) => error.includes("Invalid order")));
  assert.ok(errors.some((error) => error.includes("Missing source")));
  assert.ok(errors.some((error) => error.includes("Invalid metric dimension key")));
});

test("semantic layer migration declares required tables and only creates schema objects", () => {
  const migrationPath = path.join(process.cwd(), "src/db/migrations/0015_metric_semantic_layer.sql");
  const sql = fs.readFileSync(migrationPath, "utf8");
  for (const table of [
    "metric_kpi_values",
    "metric_kpi_runs",
    "metric_funnel_stage_map",
    "metric_stage_rollups",
    "metric_stage_events",
    "metric_attribution_results",
    "metric_annotations",
    "metric_signals",
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS "${table}"`));
  }

  assert.doesNotMatch(sql, /\b(DROP|TRUNCATE|INSERT INTO|UPDATE)\b/i);
  assert.doesNotMatch(sql, /\bDELETE\s+FROM\b/i);
  const statements = sql.split(";").map((statement) => statement.trim()).filter(Boolean);
  assert.ok(statements.length >= 25);
  for (const statement of statements) {
    assert.match(statement, /^CREATE (TABLE|INDEX) IF NOT EXISTS /);
  }
});
