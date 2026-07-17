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
  summarizeMetricKpiReadModelQuality,
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
    definitionVersion: 2,
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
    from: "2026-05-29",
    to: "2026-06-27",
  });
  assert.deepEqual(resolveMetricKpiReadRange({ from: "2026-06-01", to: "2026-06-07" }, now), {
    key: "custom",
    from: "2026-06-01",
    to: "2026-06-07",
  });
});

test("rejects impossible or incomplete custom calendar ranges", () => {
  assert.throws(
    () => resolveMetricKpiReadRange({ from: "2026-02-31", to: "2026-03-02" }),
    /range\.from/,
  );
  assert.throws(
    () => resolveMetricKpiReadRange({ from: "2026-02-28", to: "2026-02-30" }),
    /range\.to/,
  );
  assert.throws(
    () => resolveMetricKpiReadRange({ from: "2026-02-28" }),
    /range\.to/,
  );
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
  assert.equal(
    formatMetricKpiValue({ value: 1234.5, valueText: null, unit: "account_currency" }),
    "1234,5 moneda cuenta",
  );
  assert.equal(formatMetricKpiValue({ value: 1234, valueText: null, unit: "currency" }), "1234 €");
  assert.equal(formatMetricKpiValue({ value: 2.45, valueText: null, unit: "ratio" }), "2,45x");
  assert.equal(formatMetricKpiValue({ value: 180, valueText: null, unit: "ms" }), "180 ms");
  assert.equal(formatMetricKpiValue({ value: 44, valueText: "44 leads", unit: null }), "44 leads");
});

test("KPI summary keeps demo-only explicit and degrades demo mixed with real data", () => {
  const values = (statuses: mod.MetricKpiQualityStatus[]) =>
    statuses.map((qualityStatus, index) => ({
      kpiId: `kpi.${index}`,
      qualityStatus,
    })) as mod.MetricKpiReadModelValue[];

  assert.equal(
    summarizeMetricKpiReadModelQuality(values(["demo", "demo"])).qualityStatus,
    "demo",
  );
  const mixed = summarizeMetricKpiReadModelQuality(values(["demo", "ok", "ok"]));
  assert.equal(mixed.qualityStatus, "partial");
  assert.equal(mixed.demo, 1);
  assert.equal(mixed.ok, 2);
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
    definitionVersion: 2,
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

test("attaches period-over-period comparison to a persisted custom KPI by stable id", () => {
  const currentRow = {
    id: "value_current",
    runId: "run_current",
    slug: "growth4u",
    kpiId: "custom.cpl",
    label: "CPL",
    dashboardBlock: "surface",
    surface: "paid",
    source: "custom",
    metricName: "cpl",
    value: 120,
    valueText: null,
    unit: null,
    qualityStatus: "ok",
    provenanceLabel: "Formula: meta-ads.spend / ghl.newContacts",
    inputRefs: [],
    sourceCoverage: 1,
    rangeFrom: "2026-06-01",
    rangeTo: "2026-06-30",
    definitionVersion: 2,
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
  assert.equal(withComparison.comparison?.sentiment, "negative");
});

test("suppresses period comparison for latest state and formulas that depend on it", () => {
  const base = {
    id: "current",
    kpiId: "pipeline.ghl.contacts",
    label: "Total contactos GHL",
    dashboardBlock: "surface",
    surface: "pipeline",
    source: "ghl",
    metricName: "totalContacts",
    value: 321,
    valueText: null,
    displayValue: "321",
    unit: null,
    qualityStatus: "ok",
    provenanceLabel: "ghl.totalContacts",
    inputRefs: [],
    sourceCoverage: 1,
    rangeFrom: "2026-07-16",
    rangeTo: "2026-07-16",
    definitionVersion: 8,
    computedAt: "2026-07-17T08:00:00.000Z",
    comparison: null,
  } as mod.MetricKpiReadModelValue;
  const previous = {
    ...base,
    id: "previous",
    value: 300,
    displayValue: "300",
  };
  assert.equal(
    attachMetricKpiComparisons(
      [base],
      [previous],
      { from: "2026-07-15", to: "2026-07-15" },
    )[0]?.comparison,
    null,
  );

  const custom = {
    ...base,
    kpiId: "custom.contacts_per_session",
    source: "custom",
    metricName: "contacts_per_session",
    inputRefs: [
      { source: "ghl", metricName: "totalContacts" },
      { source: "ga4", metricName: "sessions" },
    ],
  };
  assert.equal(
    attachMetricKpiComparisons(
      [custom],
      [{ ...custom, value: 2 }],
      { from: "2026-07-15", to: "2026-07-15" },
    )[0]?.comparison,
    null,
  );
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
    definitionVersion: 2,
    computedAt: new Date("2026-06-30T01:00:00.000Z"),
    createdAt: new Date("2026-06-30T01:00:00.000Z"),
    updatedAt: new Date("2026-06-30T01:00:00.000Z"),
  });

  assert.equal(value.label, "Demand Engine");
});

test("infers generic meetings but never upgrades appointments to qualified meetings", () => {
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

  assert.equal(
    selectNorthStarKpi(values, { label: "Reuniones" })?.kpiId,
    "pipeline.ghl.appointments",
  );
  assert.equal(
    selectNorthStarKpi(values, { label: "Reuniones cualificadas" }),
    null,
  );
});

test("an explicit North Star reference wins even when its label is more qualified", () => {
  const values = [
    {
      kpiId: "pipeline.ghl.appointments",
      label: "Reuniones GHL",
      dashboardBlock: "surface",
      source: "ghl",
      metricName: "appointments",
      value: 10,
    },
  ] as mod.MetricKpiReadModelValue[];

  assert.equal(
    selectNorthStarKpi(values, {
      kpiRef: "pipeline.ghl.appointments",
      label: "Reuniones cualificadas",
    })?.kpiId,
    "pipeline.ghl.appointments",
  );
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
    { range: "30d", now: new Date("2026-06-28T12:00:00.000Z") },
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
          definitionVersion: 2,
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
    { range: "30d", now: new Date("2026-06-28T12:00:00.000Z") },
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
          definitionVersion: 2,
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

test("read-through refreshes latest quality when the observation day advances", async () => {
  const stale = readModel({
    run: run({
      startedAt: "2026-07-16T08:00:00.000Z",
      finishedAt: "2026-07-16T08:00:01.000Z",
    }),
  });
  const refreshed = readModel({
    run: run({
      id: "mkpir_observation_refreshed",
      startedAt: "2026-07-17T08:00:00.000Z",
    }),
  });
  const runCalls: Array<{ force?: boolean; now?: Date }> = [];

  const result = await getMetricKpiReadModelReadThrough(
    "growth4u",
    { range: "30d", now: new Date("2026-07-17T12:00:00.000Z") },
    {
      read: async () => (runCalls.length ? refreshed : stale),
      hasSnapshotUpdatesAfter: async (_slug, _range, _since, options) => {
        assert.equal(options.observationAsOf, "2026-07-17");
        return false;
      },
      run: async (input) => {
        runCalls.push({ force: input.force, now: input.now });
        return {
          ok: true,
          configured: true,
          skipped: false,
          slug: input.slug,
          range: { from: input.range?.from ?? "", to: input.range?.to ?? "" },
          trigger: input.trigger ?? "dashboard:read-through",
          force: input.force === true,
          definitionVersion: 2,
          run: null,
          valuesCount: 78,
        };
      },
    },
  );

  assert.equal(runCalls.length, 1);
  assert.equal(runCalls[0]?.force, true);
  assert.equal(runCalls[0]?.now?.toISOString(), "2026-07-17T12:00:00.000Z");
  assert.equal(result.run?.id, "mkpir_observation_refreshed");
});

test("read-through computes the active-version previous range for custom KPI comparison", async () => {
  const custom = {
    kpiId: "custom.cpl",
    comparison: null,
  } as mod.MetricKpiReadModelValue;
  const compared = {
    ...custom,
    comparison: {
      previousRange: { from: "2026-04-30", to: "2026-05-29" },
      previousValue: 10,
      previousDisplayValue: "10 €",
      absoluteDelta: 2,
      relativeDelta: 0.2,
      displayDelta: "+20%",
      direction: "up",
      sentiment: "negative",
    },
  } as mod.MetricKpiReadModelValue;
  let reads = 0;
  const runCalls: Array<{ from?: string | null; to?: string | null; trigger?: string }> = [];

  const result = await getMetricKpiReadModelReadThrough(
    "growth4u",
    { range: "30d", now: new Date("2026-06-28T12:00:00.000Z") },
    {
      read: async () => {
        reads += 1;
        return readModel({ run: run(), values: [reads > 1 ? compared : custom] });
      },
      hasSnapshotUpdatesAfter: async () => false,
      run: async (input) => {
        runCalls.push({
          from: input.range?.from,
          to: input.range?.to,
          trigger: input.trigger,
        });
        return {
          ok: true,
          configured: true,
          skipped: false,
          slug: input.slug,
          range: { from: input.range?.from ?? "", to: input.range?.to ?? "" },
          trigger: input.trigger ?? "dashboard:read-through:comparison",
          force: false,
          definitionVersion: 2,
          run: null,
          valuesCount: 1,
        };
      },
    },
  );

  assert.deepEqual(runCalls, [{
    from: "2026-04-30",
    to: "2026-05-29",
    trigger: "dashboard:read-through:comparison",
  }]);
  assert.equal(result.values[0]?.comparison?.previousValue, 10);
});
