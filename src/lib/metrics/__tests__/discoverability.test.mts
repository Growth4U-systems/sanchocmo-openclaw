/**
 * Discoverability wiring parser (SAN-319 · PR6). Run: `npm run test:lib`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as mod from "../discoverability";
import type { DiscoverabilityEntry } from "../discoverability";
// .mts→.ts interop: named imports across the boundary fail under tsx, so unwrap.
const { buildDiscoverabilityData } = (mod as unknown as { default: typeof mod }).default ?? mod;

const day = (date: string, mul: number): DiscoverabilityEntry => ({
  date,
  sources: {
    gsc: { status: "ok", metrics: [
      { name: "clicks", value: 100 },
      { name: "impressions", value: 5000 },
      { name: "position", value: 12 },
      { name: "ctr", value: 2 },
      { name: "clicks", value: 20, dimensions: { query: "injerto", intent: "Comercial" } },
      { name: "impressions", value: 600, dimensions: { query: "injerto" } },
      { name: "ctr", value: 3, dimensions: { query: "injerto" } },
      { name: "position", value: 10 - mul, dimensions: { query: "injerto" } },
    ] },
    ga4: { status: "ok", metrics: [
      { name: "sessions", value: 400 },
      { name: "conversions", value: 5 },
      { name: "engagementRate", value: 0.57 },
      { name: "topPage", value: 200, dimensions: { page: "/", conversions: 3 } },
    ] },
    pagespeed: { status: "ok", metrics: [
      { name: "performance_mobile", value: 74 }, { name: "performance_desktop", value: 96 }, { name: "seo_mobile", value: 98 },
      { name: "lcp_mobile", value: 2.1 }, { name: "cls_mobile", value: 0.06 }, { name: "inp_mobile", value: 180 },
    ] },
    aeo: { status: "ok", metrics: [
      { name: "ai_visibility", value: 43 }, { name: "share_of_voice", value: 28 }, { name: "mentions", value: 195 },
      { name: "citations", value: 84 }, { name: "ai_position", value: 2.4 }, { name: "sentiment", value: 72 }, { name: "engines_cited", value: 4 },
      { name: "share_of_voice", value: 28, dimensions: { brand: "Example" } },
      { name: "share_of_voice", value: 32, dimensions: { brand: "Insparya" } },
      { name: "ai_visibility", value: 52, dimensions: { engine: "ChatGPT" } },
      { name: "ai_prompt", value: 2, dimensions: { prompt: "mejor clínica", engine: "Perplexity" } },
      { name: "ai_readiness", value: 1, dimensions: { check: "GPTBot permitido" } },
      { name: "ai_readiness", value: 0, dimensions: { check: "llms.txt publicado" } },
    ] },
  },
});
const entries = [day("2026-06-01", 0), day("2026-06-02", 1)];

test("buildDiscoverabilityData: SEO — sums clicks, builds queries with a position delta", () => {
  const d = buildDiscoverabilityData(entries);
  assert.ok(d.seo, "seo present");
  assert.equal(d.seo!.kpis[0].label, "Clicks");
  assert.equal(d.seo!.kpis[0].value, "200"); // 100 + 100
  assert.equal(d.seo!.kpis.find((kpi) => kpi.label === "Engagement")?.value, "57%");
  const q = d.seo!.queries[0];
  assert.equal(q.query, "injerto");
  assert.equal(q.clicks, 40); // 20 + 20
  assert.ok(q.deltaPos > 0, "position improved over the range"); // 10 → 9
  assert.equal(d.seo!.health.cwv.lcp, 2.1);
});

test("buildDiscoverabilityData: AI — KPIs + competitors with the primary flagged 'you'", () => {
  const d = buildDiscoverabilityData(entries);
  assert.ok(d.ai, "ai present");
  assert.ok(d.ai!.kpis.some((k) => k.label === "Share of Voice" && k.value === "28%"));
  assert.equal(d.ai!.competitors.length, 2);
  assert.equal(d.ai!.competitors[0].you, true);
  assert.equal(d.ai!.engines[0].engine, "ChatGPT");
});

test("buildDiscoverabilityData: no entries → empty (surface shows its empty state)", () => {
  assert.deepEqual(buildDiscoverabilityData([]), {});
});

test("buildDiscoverabilityData: missing lab INP never reports Lighthouse thresholds as complete", () => {
  const data = buildDiscoverabilityData([
    {
      date: "2026-06-01",
      sources: {
        ga4: { status: "ok", metrics: [{ name: "sessions", value: 10 }] },
        pagespeed: {
          status: "ok",
          metrics: [
            { name: "performance_mobile", value: 90 },
            { name: "lcp_mobile", value: 2.1 },
            { name: "cls_mobile", value: 0.06 },
            { name: "tbt_mobile", value: 120 },
          ],
        },
      },
    },
  ]);

  const cwvKpi = data.seo?.kpis.find((kpi) => kpi.label === "Lighthouse lab");
  assert.equal(cwvKpi?.value, "Sin datos");
  assert.deepEqual(data.seo?.health.cwv, { lcp: 2.1, cls: 0.06, inp: null });
});
