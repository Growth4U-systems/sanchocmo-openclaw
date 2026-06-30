import { test } from "node:test";
import assert from "node:assert/strict";
import * as mod from "../metric-kpi-read-model";

const {
  attachMetricKpiComparisons,
  formatMetricKpiValue,
  getMetricKpiReadModelReadThrough,
  resolvePreviousMetricKpiRange,
  resolveMetricKpiReadRange,
  selectNorthStarKpi,
  toMetricKpiReadModelValue,
} = (mod as unknown as { default: typeof mod }).default ?? mod;

function readModel(overrides: Partial<mod.MetricKpiReadModel> = {}): mod.MetricKpiReadModel {
  return {
    configured: true,
    slug: "growth4u",
    requestedRange: {
      key: "30d",
      from: "2026-05-30",
      to: "2026-06-28",
    },
    run: null,
    summary: {
      ok: 0,
      partial: 0,
      missing: 0,
      dirty: 0,
      stale: 0,
      demo: 0,
      total: 0,
      qualityStatus: "missing",
    },
    values: [],
    northStar: null,
    stageRollups: {
      configured: true,
      available: false,
      range: { from: "2026-05-30", to: "2026-06-28" },
      rows: [],
      stages: [],
      channels: [],
      summary: {
        total: 0,
        ok: 0,
        partial: 0,
        missing: 0,
        dirty: 0,
        stale: 0,
        demo: 0,
        qualityStatus: "missing",
        nextAction: "Configure stage rollups.",
      },
    },
    ...overrides,
  };
}

function run(overrides: Partial<mod.MetricKpiReadModelRun> = {}): mod.MetricKpiReadModelRun {
  return {
    id: "mkpir_existing",
    status: "ok",
    trigger: "cron",
    definitionVersion: 1,
    valuesCount: 78,
    qualitySummary: { missing: 78 },
    rangeFrom: "2026-05-30",
    rangeTo: "2026-06-28",
    startedAt: "2026-06-28T08:00:00.000Z",
    finishedAt: "2026-06-28T08:00:01.000Z",
    ...overrides,
  };
}

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

test("resolves the immediately previous equivalent KPI window", () => {
  assert.deepEqual(resolvePreviousMetricKpiRange({
    key: "30d",
    from: "2026-05-30",
    to: "2026-06-28",
  }), {
    from: "2026-04-30",
    to: "2026-05-29",
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
  assert.equal(value.comparison, null);
});

test("attaches period-over-period comparison without changing persisted KPI rows", () => {
  const currentRow = {
    id: "value_current",
    runId: "run_current",
    slug: "growth4u",
    kpiId: "web.sessions",
    label: "Sessions",
    dashboardBlock: "overview",
    surface: "web",
    source: "ga4",
    metricName: "sessions",
    value: 120,
    valueText: null,
    unit: null,
    qualityStatus: "ok",
    provenanceLabel: "ga4.sessions",
    inputRefs: [],
    sourceCoverage: 1,
    rangeFrom: "2026-06-01",
    rangeTo: "2026-06-30",
    definitionVersion: 1,
    computedAt: new Date("2026-06-30T01:00:00.000Z"),
    createdAt: new Date("2026-06-30T01:00:00.000Z"),
    updatedAt: new Date("2026-06-30T01:00:00.000Z"),
  };
  const current = toMetricKpiReadModelValue(currentRow);
  const previous = toMetricKpiReadModelValue({
    ...currentRow,
    id: "value_previous",
    runId: "run_previous",
    value: 100,
    rangeFrom: "2026-05-02",
    rangeTo: "2026-05-31",
  });

  const [withComparison] = attachMetricKpiComparisons(
    [current],
    [previous],
    { from: "2026-05-02", to: "2026-05-31" },
  );

  assert.equal(withComparison.comparison?.previousValue, 100);
  assert.equal(withComparison.comparison?.absoluteDelta, 20);
  assert.equal(withComparison.comparison?.displayDelta, "+20%");
  assert.equal(withComparison.comparison?.sentiment, "positive");
});

test("canonicalizes persisted legacy Trust Core labels for the dashboard", () => {
  const value = toMetricKpiReadModelValue({
    id: "value_trust_demand",
    runId: "run_1",
    slug: "growth4u",
    kpiId: "reputation.demand_engine",
    label: "Demand Agents",
    dashboardBlock: "surface",
    surface: "reputation",
    source: "trust_score",
    metricName: "demand_engine",
    value: 52,
    valueText: null,
    unit: null,
    qualityStatus: "ok",
    provenanceLabel: "trust_score.demand_engine",
    inputRefs: [{ source: "trust_score", metricName: "Demand Agents" }],
    sourceCoverage: 1,
    rangeFrom: "2026-06-01",
    rangeTo: "2026-06-30",
    definitionVersion: 1,
    computedAt: new Date("2026-06-30T01:00:00.000Z"),
    createdAt: new Date("2026-06-30T01:00:00.000Z"),
    updatedAt: new Date("2026-06-30T01:00:00.000Z"),
  });

  assert.equal(value.label, "Demand Engine");
});

test("selects the dashboard-defined north star over the generic overview KPI", () => {
  const values = [
    {
      kpiId: "pipeline.ghl.appointments",
      label: "Reuniones GHL",
      dashboardBlock: "surface",
      source: "ghl",
      metricName: "appointments",
      value: 10,
    },
    { kpiId: "web.sessions", dashboardBlock: "overview", value: 25 },
  ] as mod.MetricKpiReadModelValue[];

  assert.equal(selectNorthStarKpi(values, { label: "Reuniones cualificadas" })?.kpiId, "pipeline.ghl.appointments");
});

test("returns null for an unmatched dashboard north star instead of inventing a fallback", () => {
  const values = [
    { kpiId: "web.sessions", label: "Visitas web", dashboardBlock: "overview", value: 25 },
    { kpiId: "conversion.stage_rollups", label: "Embudo unificado", dashboardBlock: "conversion", value: 3 },
  ] as mod.MetricKpiReadModelValue[];

  assert.equal(selectNorthStarKpi(values, { label: "Retencion neta" }), null);
});

test("read-through computes the requested range when no KPI run exists", async () => {
  const reads: mod.MetricKpiReadModel[] = [
    readModel(),
    readModel({ run: run(), values: [{ kpiId: "web.sessions" }] as mod.MetricKpiReadModelValue[] }),
  ];
  const runCalls: Array<{ from?: string | null; to?: string | null; force?: boolean; trigger?: string }> = [];

  const result = await getMetricKpiReadModelReadThrough(
    "growth4u",
    { range: "30d" },
    {
      read: async () => reads.shift() ?? readModel({ run: run() }),
      run: async (input) => {
        runCalls.push({
          from: input.range?.from,
          to: input.range?.to,
          force: input.force,
          trigger: input.trigger,
        });
        return {
          ok: true,
          configured: true,
          skipped: false,
          slug: input.slug,
          range: { from: input.range?.from ?? "", to: input.range?.to ?? "" },
          trigger: input.trigger ?? "dashboard:read-through",
          force: input.force === true,
          definitionVersion: 1,
          run: null,
          valuesCount: 78,
        };
      },
    },
  );

  assert.equal(runCalls.length, 1);
  assert.deepEqual(runCalls[0], {
    from: "2026-05-30",
    to: "2026-06-28",
    force: false,
    trigger: "dashboard:read-through",
  });
  assert.equal(result.run?.id, "mkpir_existing");
  assert.equal(result.values.length, 1);
});

test("read-through forces refresh when snapshots changed after the KPI run", async () => {
  const stale = readModel({ run: run({ finishedAt: "2026-06-28T08:00:00.000Z" }) });
  const refreshed = readModel({ run: run({ id: "mkpir_refreshed" }) });
  const runCalls: Array<{ force?: boolean }> = [];

  const result = await getMetricKpiReadModelReadThrough(
    "growth4u",
    { range: "30d" },
    {
      read: async () => (runCalls.length ? refreshed : stale),
      hasSnapshotUpdatesAfter: async () => true,
      run: async (input) => {
        runCalls.push({ force: input.force });
        return {
          ok: true,
          configured: true,
          skipped: false,
          slug: input.slug,
          range: { from: input.range?.from ?? "", to: input.range?.to ?? "" },
          trigger: input.trigger ?? "dashboard:read-through",
          force: input.force === true,
          definitionVersion: 1,
          run: null,
          valuesCount: 78,
        };
      },
    },
  );

  assert.equal(runCalls.length, 1);
  assert.equal(runCalls[0]?.force, true);
  assert.equal(result.run?.id, "mkpir_refreshed");
});
