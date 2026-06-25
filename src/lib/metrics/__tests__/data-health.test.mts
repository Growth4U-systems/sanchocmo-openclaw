/**
 * Salud de dato — insight mapper (SAN-319 · PR8). Pure logic, no DB.
 *
 * Turns getMetricsHealth() output into DataQualityInsight cards: known-dirty sources
 * (high), connected≠collected (warn), cron degraded (warn). Run: `npm run test:lib`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as mod from "../data-health";

// `.ts` is CJS; named imports into this ESM `.mts` arrive under `default` (interop).
const { buildDataQualityInsights } =
  (mod as unknown as { default: typeof mod }).default ?? mod;

const src = (over: Record<string, unknown> = {}) => ({
  source: "x",
  enabled: true,
  knownDirty: false,
  lastMetricDate: "2026-05-01",
  overdue: false,
  ...over,
});

test("knownDirty source → a high insight carrying its reason + owner", () => {
  const ins = buildDataQualityInsights({
    configured: true,
    cron: { degraded: false, reasons: [] },
    sources: [src({ source: "ghl", knownDirty: true, dirtyReason: "Eventos inflados (1 cita → 100+)" })],
  });
  const ghl = ins.find((i: { owner?: string }) => i.owner === "ghl");
  assert.ok(ghl, "expected a ghl insight");
  assert.equal(ghl.severity, "high");
  assert.match(ghl.title, /GHL/);
  assert.match(ghl.body, /inflados/);
});

test("connected ≠ collected → a warn insight listing the stale sources", () => {
  const ins = buildDataQualityInsights({
    configured: true,
    cron: { degraded: false, reasons: [] },
    sources: [src({ source: "ga4", lastMetricDate: null })],
  });
  const w = ins.find((i: { title: string }) => /recolectado/i.test(i.title));
  assert.ok(w, "expected a connected≠collected insight");
  assert.equal(w.severity, "warn");
  assert.match(w.body, /ga4/);
});

test("cron degraded → a warn insight", () => {
  const ins = buildDataQualityInsights({
    configured: true,
    cron: { degraded: true, reasons: ["timeout"] },
    sources: [],
  });
  assert.ok(ins.some((i: { title: string; severity: string }) => /degradado/i.test(i.title) && i.severity === "warn"));
});

test("no health (null or unconfigured) → no insights", () => {
  assert.deepEqual(buildDataQualityInsights(null), []);
  assert.deepEqual(
    buildDataQualityInsights({ configured: false, cron: { degraded: false, reasons: [] }, sources: [] }),
    [],
  );
});
