import { test } from "node:test";
import assert from "node:assert/strict";
import * as mod from "../metric-kpi-runner";
import type { MetricKpiRunRow } from "../metric-kpis";

const { resolveMetricKpiRunnerRange, runMetricKpis } =
  (mod as unknown as { default: typeof mod }).default ?? mod;

function runRow(overrides: Partial<MetricKpiRunRow> = {}): MetricKpiRunRow {
  const now = new Date("2026-06-28T08:00:00.000Z");
  return {
    id: "mkpir_test",
    slug: "growth4u",
    rangeFrom: "2026-06-01",
    rangeTo: "2026-06-28",
    status: "ok",
    trigger: "cron",
    definitionVersion: 1,
    valuesCount: 2,
    qualitySummary: { ok: 2 },
    errors: [],
    startedAt: now,
    finishedAt: now,
    createdAt: now,
    ...overrides,
  };
}

test("defaults to the last 30 UTC days", () => {
  assert.deepEqual(
    resolveMetricKpiRunnerRange(null, new Date("2026-06-28T17:30:00.000Z")),
    { from: "2026-05-30", to: "2026-06-28" },
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
  const existing = runRow({ id: "mkpir_existing", valuesCount: 7 });

  const result = await runMetricKpis(
    {
      slug: "growth4u",
      range: { from: "2026-06-01", to: "2026-06-28" },
      trigger: "cron",
    },
    {
      findRun: async (_slug, opts) =>
        opts.statuses?.includes("ok") ? existing : null,
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
