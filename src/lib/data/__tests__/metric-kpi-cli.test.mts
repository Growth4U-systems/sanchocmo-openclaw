import { test } from "node:test";
import assert from "node:assert/strict";
import * as mod from "../../../../scripts/metrics/compute-kpis";
import type { RunMetricKpisResult } from "../metric-kpi-runner";

const { parseMetricKpiCliArgs, runMetricKpiCli } =
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
    definitionVersion: 1,
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
