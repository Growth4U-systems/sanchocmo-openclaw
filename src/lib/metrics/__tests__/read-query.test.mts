import { test } from "node:test";
import assert from "node:assert/strict";
import * as mod from "../read-query";

const { assertMetricCalendarRange, isMetricCalendarDate, metricCalendarRangeError } =
  (mod as unknown as { default: typeof mod }).default ?? mod;

test("calendar validation accepts real leap dates and rejects normalized overflows", () => {
  assert.equal(isMetricCalendarDate("2024-02-29"), true);
  assert.equal(isMetricCalendarDate("2026-07-16"), true);
  assert.equal(isMetricCalendarDate("2026-02-29"), false);
  assert.equal(isMetricCalendarDate("2026-02-30"), false);
  assert.equal(isMetricCalendarDate("2026-7-16"), false);
  assert.equal(isMetricCalendarDate("2026-07-16T00:00:00Z"), false);
});

test("inclusive ranges reject reverse bounds and can require both dates", () => {
  assert.equal(metricCalendarRangeError({ from: "2026-07-01", to: "2026-07-31" }), null);
  assert.match(metricCalendarRangeError({ from: "2026-08-01", to: "2026-07-31" }) ?? "", /before/);
  assert.match(metricCalendarRangeError({ from: "2026-07-01" }, { requireBoth: true }) ?? "", /required/);
  assert.equal(metricCalendarRangeError({ from: "2026-07-01" }), null);
});

test("assertion helper fails before a malformed text date reaches lexical SQL comparisons", () => {
  assert.throws(
    () => assertMetricCalendarRange({ from: "not-a-date", to: "2026-07-31" }),
    /valid calendar date/,
  );
  assert.doesNotThrow(() =>
    assertMetricCalendarRange({ from: "2026-07-31", to: "2026-07-31" }, { requireBoth: true }),
  );
});
