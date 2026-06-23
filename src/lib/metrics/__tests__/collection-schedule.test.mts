/**
 * Per-source collection cadence (SAN-300) — pure date logic, no DB.
 * Dates are constructed and their weekday derived at runtime, so the asserts
 * never hardcode "which date is a Monday".
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as mod from "../collection-schedule";

const { defaultScheduleFor, isDueToday, cronDueOnDate, normalizeCadence, getKnownDirty } =
  (mod as unknown as { default: typeof mod }).default ?? mod;

test("defaults: trust_score & pagespeed weekly Monday, everything else daily", () => {
  assert.deepEqual(defaultScheduleFor("trust_score"), {
    source: "trust_score", cadence: "weekly", daysOfWeek: [1], cronExpr: null, enabled: true,
  });
  assert.equal(defaultScheduleFor("pagespeed").cadence, "weekly");
  const ga4 = defaultScheduleFor("ga4");
  assert.equal(ga4.cadence, "daily");
  assert.deepEqual(ga4.daysOfWeek, []);
});

test("normalizeCadence falls back to daily on garbage", () => {
  assert.equal(normalizeCadence("weekly"), "weekly");
  assert.equal(normalizeCadence("nonsense"), "daily");
  assert.equal(normalizeCadence(undefined), "daily");
});

test("daily is always due; disabled is never due", () => {
  const d = new Date(2026, 5, 15, 9, 0, 0);
  assert.equal(isDueToday({ cadence: "daily", daysOfWeek: [], cronExpr: null, enabled: true }, d), true);
  assert.equal(isDueToday({ cadence: "daily", daysOfWeek: [], cronExpr: null, enabled: false }, d), false);
});

test("weekly / twice_weekly match days_of_week (JS getDay)", () => {
  const d = new Date(2026, 5, 15, 9, 0, 0);
  const dow = d.getDay();
  assert.equal(isDueToday({ cadence: "weekly", daysOfWeek: [dow], cronExpr: null, enabled: true }, d), true);
  assert.equal(isDueToday({ cadence: "weekly", daysOfWeek: [(dow + 1) % 7], cronExpr: null, enabled: true }, d), false);
  assert.equal(isDueToday({ cadence: "twice_weekly", daysOfWeek: [(dow + 3) % 7, dow], cronExpr: null, enabled: true }, d), true);
});

test("custom uses cron; missing cron is never due", () => {
  const d = new Date(2026, 5, 15, 9, 0, 0);
  const dow = d.getDay();
  assert.equal(isDueToday({ cadence: "custom", daysOfWeek: [], cronExpr: `0 9 * * ${dow}`, enabled: true }, d), true);
  assert.equal(isDueToday({ cadence: "custom", daysOfWeek: [], cronExpr: null, enabled: true }, d), false);
});

test("cronDueOnDate: dow, dom, month, lists and the dom/dow OR quirk", () => {
  const d = new Date(2026, 5, 15, 9, 0, 0); // 2026-06-15
  const dow = d.getDay();
  const dom = d.getDate(); // 15
  const month = d.getMonth() + 1; // 6
  assert.equal(cronDueOnDate(`0 9 * * ${dow}`, d), true);
  assert.equal(cronDueOnDate(`0 9 * * ${(dow + 1) % 7}`, d), false);
  assert.equal(cronDueOnDate(`0 9 ${dom} * *`, d), true);
  assert.equal(cronDueOnDate(`0 9 ${dom === 1 ? 2 : 1} * *`, d), false);
  assert.equal(cronDueOnDate(`0 9 * ${month === 1 ? 2 : 1} *`, d), false); // month mismatch
  assert.equal(cronDueOnDate(`0 9 * * ${dow},${(dow + 2) % 7}`, d), true); // list
  // both dom and dow restricted → fires if EITHER matches (dom matches here)
  assert.equal(cronDueOnDate(`0 9 ${dom} * ${(dow + 1) % 7}`, d), true);
  assert.equal(cronDueOnDate("bad expr", d), false);
});

test("cron Sunday accepts both 0 and 7", () => {
  const base = new Date(2026, 5, 15);
  const sunday = new Date(base);
  sunday.setDate(base.getDate() - base.getDay()); // rewind to Sunday of that week
  assert.equal(sunday.getDay(), 0);
  assert.equal(cronDueOnDate("0 9 * * 7", sunday), true);
  assert.equal(cronDueOnDate("0 9 * * 0", sunday), true);
});

test("getKnownDirty: flags ghl as known-dirty with a reason; clean sources are not", () => {
  const ghl = getKnownDirty("ghl");
  assert.equal(ghl.knownDirty, true);
  assert.ok(typeof ghl.dirtyReason === "string" && ghl.dirtyReason.length > 0);
  const ga4 = getKnownDirty("ga4");
  assert.equal(ga4.knownDirty, false);
  assert.equal(ga4.dirtyReason, undefined);
});
