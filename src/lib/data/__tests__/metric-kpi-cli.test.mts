import { test } from "node:test";
import assert from "node:assert/strict";
import * as mod from "../../../../scripts/metrics/compute-kpis";
import type { RunMetricKpisResult } from "../metric-kpi-runner";

const { dashboardMetricKpiRanges, parseMetricKpiCliArgs, runMetricKpiCli } =
  (mod as unknown as { default: typeof mod }).default ?? mod;

function result(
  slug: string,
  overrides: Partial<RunMetricKpisResult> = {},
): RunMetricKpisResult {
  return {
    ok: true,
    configured: true,
    skipped: false,
    slug,
    range: { from: "2026-06-01", to: "2026-06-28" },
    trigger: "cron",
    force: false,
    definitionVersion: 2,
    run: null,
    valuesCount: 2,
    ...overrides,
  };
}

test("parses comma-separated slugs and range flags", () => {
  assert.deepEqual(
    parseMetricKpiCliArgs([
      "--slug",
      "growth4u,rocinante",
      "--from",
      "2026-06-01",
      "--to",
      "2026-06-28",
      "--trigger",
      "cron",
      "--force",
      "--json",
    ]),
    {
      slugs: ["growth4u", "rocinante"],
      all: false,
      from: "2026-06-01",
      to: "2026-06-28",
      dashboardRanges: false,
      trigger: "cron",
      force: true,
      json: true,
    },
  );
});

test("rejects ambiguous slug selection", () => {
  assert.throws(
    () => parseMetricKpiCliArgs(["--all", "--slug", "growth4u"]),
    /either --all or --slug/,
  );
});

test("builds dashboard ranges ending on an explicit UTC day", () => {
  assert.deepEqual(dashboardMetricKpiRanges("2026-06-28"), [
    { from: "2026-06-28", to: "2026-06-28" },
    { from: "2026-06-22", to: "2026-06-28" },
    { from: "2026-05-30", to: "2026-06-28" },
    { from: "2026-03-31", to: "2026-06-28" },
  ]);
});

test("rejects dashboard ranges mixed with explicit custom range", () => {
  assert.throws(
    () => parseMetricKpiCliArgs(["--slug", "growth4u", "--dashboard-ranges", "--from", "2026-06-01"]),
    /dashboard-ranges/,
  );
});

test("runs all client slugs and returns non-zero when one fails", async () => {
  const stdout: string[] = [];
  const seen: string[] = [];

  const res = await runMetricKpiCli(
    parseMetricKpiCliArgs(["--all", "--trigger", "cron"]),
    {
      loadSlugs: () => ["growth4u", "rocinante"],
      stdout: (line) => stdout.push(line),
      run: async (input) => {
        seen.push(input.slug);
        return input.slug === "rocinante"
          ? result(input.slug, { ok: false, error: "boom" })
          : result(input.slug);
      },
    },
  );

  assert.deepEqual(seen, ["growth4u", "rocinante"]);
  assert.equal(res.exitCode, 1);
  assert.equal(stdout.length, 2);
  assert.match(stdout[1], /error="boom"/);
});

test("runs every dashboard range for a slug", async () => {
  const seen: Array<{ slug: string; from?: string | null; to?: string | null; force?: boolean }> = [];

  const res = await runMetricKpiCli(
    parseMetricKpiCliArgs([
      "--slug",
      "growth4u",
      "--dashboard-ranges",
      "--as-of",
      "2026-06-28",
      "--force",
    ]),
    {
      stdout: () => {},
      run: async (input) => {
        seen.push({
          slug: input.slug,
          from: input.range?.from,
          to: input.range?.to,
          force: input.force,
        });
        return result(input.slug, {
          range: {
            from: input.range?.from ?? "2026-06-28",
            to: input.range?.to ?? "2026-06-28",
          },
          force: input.force === true,
        });
      },
    },
  );

  assert.equal(res.exitCode, 0);
  assert.deepEqual(seen, [
    { slug: "growth4u", from: "2026-06-28", to: "2026-06-28", force: true },
    { slug: "growth4u", from: "2026-06-22", to: "2026-06-28", force: true },
    { slug: "growth4u", from: "2026-05-30", to: "2026-06-28", force: true },
    { slug: "growth4u", from: "2026-03-31", to: "2026-06-28", force: true },
  ]);
});
