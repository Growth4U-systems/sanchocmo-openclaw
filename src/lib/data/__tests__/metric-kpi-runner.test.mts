import { test } from "node:test";
import assert from "node:assert/strict";
import * as mod from "../metric-kpi-runner";
import type { MetricKpiRunRow } from "../metric-kpis";
import { METRIC_KPI_DEFINITION_VERSION } from "../../metrics/semantic-kpis";
import { composeMetricKpiDefinitionVersion } from "../../metrics/kpi-definition-version";

const { resolveMetricKpiRunnerRange, runMetricKpis } =
  (mod as unknown as { default: typeof mod }).default ?? mod;

const DASHBOARD_VERSION = 7;
const EFFECTIVE_DEFINITION_VERSION = composeMetricKpiDefinitionVersion(
  METRIC_KPI_DEFINITION_VERSION,
  DASHBOARD_VERSION,
);
const getDashboard = async () => ({
  configured: true,
  slug: "growth4u",
  version: DASHBOARD_VERSION,
  definition: null,
  versions: [],
});

function runRow(overrides: Partial<MetricKpiRunRow> = {}): MetricKpiRunRow {
  const now = new Date("2026-06-28T08:00:00.000Z");
  return {
    id: "mkpir_test",
    slug: "growth4u",
    rangeFrom: "2026-06-01",
    rangeTo: "2026-06-28",
    status: "ok",
    trigger: "cron",
    definitionVersion: EFFECTIVE_DEFINITION_VERSION,
    valuesCount: 2,
    qualitySummary: { ok: 2 },
    errors: [],
    startedAt: now,
    finishedAt: now,
    createdAt: now,
    ...overrides,
  };
}

test("defaults to the last 30 complete UTC days", () => {
  assert.deepEqual(
    resolveMetricKpiRunnerRange(null, new Date("2026-06-28T17:30:00.000Z")),
    { from: "2026-05-29", to: "2026-06-27" },
  );
});

test("rejects invalid explicit ranges", () => {
  assert.throws(
    () => resolveMetricKpiRunnerRange({ from: "2026-06-30", to: "2026-06-01" }),
    /after/,
  );
  assert.throws(
    () => resolveMetricKpiRunnerRange({ from: "bad", to: "2026-06-01" }),
    /range\.from/,
  );
});

test("skips when an ok run already exists for the same range and definition", async () => {
  let computeCalls = 0;
  const requestedVersions: number[] = [];
  const existing = runRow({ id: "mkpir_existing", valuesCount: 7 });

  const result = await runMetricKpis(
    {
      slug: "growth4u",
      range: { from: "2026-06-01", to: "2026-06-28" },
      trigger: "cron",
    },
    {
      getDashboard,
      findRun: async (_slug, opts) => {
        requestedVersions.push(opts.definitionVersion ?? -1);
        return opts.statuses?.includes("ok") ? existing : null;
      },
      compute: async () => {
        computeCalls++;
        return { configured: true, run: runRow(), values: [] };
      },
    },
  );

  assert.equal(computeCalls, 0);
  assert.equal(result.ok, true);
  assert.equal(result.skipped, true);
  assert.equal(result.skipReason, "already-computed");
  assert.equal(result.run?.id, "mkpir_existing");
  assert.equal(result.valuesCount, 7);
  assert.deepEqual(requestedVersions, [EFFECTIVE_DEFINITION_VERSION]);
  assert.equal(result.definitionVersion, EFFECTIVE_DEFINITION_VERSION);
});

test("dashboard version participates in the cache key and custom definitions reach compute", async () => {
  const requestedVersions: number[] = [];
  let computeOptions: Parameters<mod.ComputeMetricKpisFn>[1] | null = null;
  const customMetric = {
    id: "cpl",
    label: "CPL",
    formula: "meta-ads.spend / ghl.newContacts",
    format: "currency",
    tier: "diagnostic",
    surface: "paid",
  };

  const result = await runMetricKpis(
    {
      slug: "growth4u",
      range: { from: "2026-06-01", to: "2026-06-28" },
    },
    {
      getDashboard: async () => ({
        configured: true,
        slug: "growth4u",
        version: 8,
        definition: { customMetrics: [customMetric] } as never,
        versions: [],
      }),
      findRun: async (_slug, opts) => {
        requestedVersions.push(opts.definitionVersion ?? -1);
        return null;
      },
      compute: async (_slug, opts) => {
        computeOptions = opts;
        return { configured: true, run: runRow(), values: [] };
      },
    },
  );

  const expected = composeMetricKpiDefinitionVersion(
    METRIC_KPI_DEFINITION_VERSION,
    8,
  );
  assert.deepEqual(requestedVersions, [expected, expected]);
  assert.equal(result.definitionVersion, expected);
  assert.equal(computeOptions?.definitionVersion, expected);
  assert.equal(computeOptions?.dashboardVersion, 8);
  assert.deepEqual(computeOptions?.customMetrics, [customMetric]);
  assert.notEqual(expected, EFFECTIVE_DEFINITION_VERSION);
});

test("skips a recent running run to make cron retries idempotent", async () => {
  let computeCalls = 0;
  const running = runRow({
    id: "mkpir_running",
    status: "running",
    startedAt: new Date("2026-06-28T07:45:00.000Z"),
    finishedAt: null,
    valuesCount: 0,
  });

  const result = await runMetricKpis(
    {
      slug: "growth4u",
      range: { from: "2026-06-01", to: "2026-06-28" },
      now: new Date("2026-06-28T08:00:00.000Z"),
    },
    {
      getDashboard,
      findRun: async (_slug, opts) =>
        opts.statuses?.includes("running") ? running : null,
      compute: async () => {
        computeCalls++;
        return { configured: true, run: runRow(), values: [] };
      },
    },
  );

  assert.equal(computeCalls, 0);
  assert.equal(result.skipped, true);
  assert.equal(result.skipReason, "already-running");
  assert.equal(result.run?.id, "mkpir_running");
});

test("recomputes when only a stale running run exists", async () => {
  let computeCalls = 0;
  const stale = runRow({
    id: "mkpir_stale",
    status: "running",
    startedAt: new Date("2026-06-28T07:00:00.000Z"),
    finishedAt: null,
  });
  const computed = runRow({ id: "mkpir_new", valuesCount: 3 });

  const result = await runMetricKpis(
    {
      slug: "growth4u",
      range: { from: "2026-06-01", to: "2026-06-28" },
      now: new Date("2026-06-28T08:00:00.000Z"),
      runningTtlMs: 30 * 60 * 1000,
    },
    {
      getDashboard,
      findRun: async (_slug, opts) =>
        opts.statuses?.includes("running") ? stale : null,
      compute: async () => {
        computeCalls++;
        return {
          configured: true,
          run: computed,
          values: [{ kpiId: "a" }, { kpiId: "b" }, { kpiId: "c" }] as never,
        };
      },
    },
  );

  assert.equal(computeCalls, 1);
  assert.equal(result.skipped, false);
  assert.equal(result.run?.id, "mkpir_new");
  assert.equal(result.valuesCount, 3);
});

test("force bypasses existing ok runs", async () => {
  let computeCalls = 0;

  const result = await runMetricKpis(
    {
      slug: "growth4u",
      range: { from: "2026-06-01", to: "2026-06-28" },
      force: true,
    },
    {
      getDashboard,
      findRun: async () => runRow({ id: "mkpir_existing" }),
      compute: async () => {
        computeCalls++;
        return {
          configured: true,
          run: runRow({ id: "mkpir_forced", valuesCount: 1 }),
          values: [{ kpiId: "forced" }] as never,
        };
      },
    },
  );

  assert.equal(computeCalls, 1);
  assert.equal(result.skipped, false);
  assert.equal(result.run?.id, "mkpir_forced");
});

test("returns a structured error and latest error run when compute fails", async () => {
  const errorRun = runRow({
    id: "mkpir_error",
    status: "error",
    valuesCount: 0,
    errors: [{ message: "boom" }],
  });

  const result = await runMetricKpis(
    {
      slug: "growth4u",
      range: { from: "2026-06-01", to: "2026-06-28" },
    },
    {
      getDashboard,
      findRun: async (_slug, opts) =>
        opts.statuses?.includes("error") ? errorRun : null,
      compute: async () => {
        throw new Error("boom");
      },
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.skipped, false);
  assert.equal(result.error, "boom");
  assert.equal(result.run?.id, "mkpir_error");
});
