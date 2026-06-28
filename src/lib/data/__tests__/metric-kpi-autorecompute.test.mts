import { test } from "node:test";
import assert from "node:assert/strict";
import * as mod from "../metric-kpi-autorecompute";
import type { RunMetricKpisResult } from "../metric-kpi-runner";

const {
  buildMetricKpiAutoRecomputeRanges,
  recomputeMetricKpisAfterIngest,
} = (mod as unknown as { default: typeof mod }).default ?? mod;

const ingestOk = {
  ok: true,
  rows: 3,
  sources: ["ga4"],
  skipped: [],
  storage: { configured: true },
};

function runResult(range: { from: string; to: string }): RunMetricKpisResult {
  return {
    ok: true,
    configured: true,
    skipped: false,
    slug: "growth4u",
    range,
    trigger: "ingest:auto",
    force: true,
    definitionVersion: 1,
    run: null,
    valuesCount: 12,
  };
}

test("builds dashboard ranges plus an ingest window and dedupes overlaps", () => {
  const ranges = buildMetricKpiAutoRecomputeRanges({
    date: "2026-06-28",
    metricDates: ["2026-06-01", "2026-06-15", "not-a-date"],
    now: new Date("2026-06-28T12:00:00.000Z"),
  });

  assert.deepEqual(
    ranges.map((range) => `${range.label}:${range.from}..${range.to}`),
    [
      "1d:2026-06-28..2026-06-28",
      "7d:2026-06-22..2026-06-28",
      "30d:2026-05-30..2026-06-28",
      "90d:2026-03-31..2026-06-28",
      "ingest-window:2026-06-01..2026-06-28",
    ],
  );
});

test("skips recompute when ingest wrote no rows", async () => {
  let calls = 0;
  const result = await recomputeMetricKpisAfterIngest(
    {
      slug: "growth4u",
      date: "2026-06-28",
      ingest: { ...ingestOk, rows: 0 },
    },
    {
      run: async () => {
        calls++;
        return runResult({ from: "2026-06-28", to: "2026-06-28" });
      },
    },
  );

  assert.equal(calls, 0);
  assert.equal(result.skipped, true);
  assert.equal(result.skipReason, "no-rows");
  assert.equal(result.ok, true);
});

test("forces KPI recompute for every deduped dashboard range", async () => {
  const calls: Array<{ from?: string | null; to?: string | null; force?: boolean; trigger?: string }> = [];
  const result = await recomputeMetricKpisAfterIngest(
    {
      slug: "growth4u",
      date: "2026-06-28",
      ingest: ingestOk,
      metricDates: ["2026-06-28"],
      now: new Date("2026-06-28T12:00:00.000Z"),
    },
    {
      run: async (input) => {
        calls.push({
          force: input.force,
          from: input.range?.from,
          to: input.range?.to,
          trigger: input.trigger,
        });
        return runResult({
          from: input.range?.from ?? "2026-06-28",
          to: input.range?.to ?? "2026-06-28",
        });
      },
    },
  );

  assert.equal(result.attempted, true);
  assert.equal(result.ok, true);
  assert.equal(calls.length, 4);
  assert.ok(calls.every((call) => call.force === true));
  assert.ok(calls.every((call) => call.trigger === "ingest:auto"));
  assert.deepEqual(calls.map((call) => `${call.from}..${call.to}`), [
    "2026-06-28..2026-06-28",
    "2026-06-22..2026-06-28",
    "2026-05-30..2026-06-28",
    "2026-03-31..2026-06-28",
  ]);
});

test("returns recompute errors without throwing", async () => {
  const result = await recomputeMetricKpisAfterIngest(
    {
      slug: "growth4u",
      date: "2026-06-28",
      ingest: ingestOk,
      now: new Date("2026-06-28T12:00:00.000Z"),
    },
    {
      run: async (input) => {
        if (input.range?.from === "2026-06-22") throw new Error("runner down");
        return runResult({
          from: input.range?.from ?? "2026-06-28",
          to: input.range?.to ?? "2026-06-28",
        });
      },
    },
  );

  assert.equal(result.attempted, true);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /runner down/);
  assert.equal(result.results.length, 3);
});
