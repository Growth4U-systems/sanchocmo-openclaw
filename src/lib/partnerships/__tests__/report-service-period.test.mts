import { test } from "node:test";
import assert from "node:assert/strict";
import * as reportServiceModule from "../report-service";

const reportService =
  (reportServiceModule as unknown as { default?: typeof reportServiceModule }).default ??
  reportServiceModule;

test("partnership report accepts every dashboard date preset", () => {
  assert.deepEqual(reportService.REPORT_PERIODS, [1, 7, 30, 90]);
  assert.equal(reportService.parseReportPeriod("1"), 1);
  assert.equal(reportService.parseReportPeriod("7"), 7);
  assert.equal(reportService.parseReportPeriod(30), 30);
  assert.equal(reportService.parseReportPeriod("90"), 90);
});

test("partnership report falls back to the documented 90-day default", () => {
  assert.equal(reportService.parseReportPeriod("14"), 90);
  assert.equal(reportService.parseReportPeriod(""), 90);
  assert.equal(reportService.parseReportPeriod(undefined), 90);
});

test("partnership presets cover complete UTC days and exclude an incomplete today", () => {
  const range = reportService.completeUtcReportRange(
    7,
    new Date("2026-07-16T18:30:00.000Z"),
  );
  assert.equal(range.from.toISOString(), "2026-07-09T00:00:00.000Z");
  assert.equal(range.to.toISOString(), "2026-07-15T23:59:59.999Z");
});

test("production report excludes seeded performance unless demo is explicit", () => {
  const records = [
    { handle: "@demo", source: "seed", posts: [] },
    { handle: "@live", source: "impact", posts: [] },
  ] as Parameters<typeof reportService.filterReportPerformance>[0];

  assert.deepEqual(
    reportService.filterReportPerformance(records).map((record) => record.handle),
    ["@live"],
  );
  assert.deepEqual(
    reportService.filterReportPerformance(records, true).map((record) => record.handle),
    ["@demo", "@live"],
  );
});
