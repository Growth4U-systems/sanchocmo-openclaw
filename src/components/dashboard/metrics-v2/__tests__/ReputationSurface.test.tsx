/**
 * Reputation surface (SAN-319) — renders the real /api/trust-score compare report.
 * Run: `npm run test:metrics`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReputationSurface } from "../ReputationSurface";
import type { CompareResult, BrandScore, TrustPillars } from "@/lib/trust-score/client";

const render = (el: ReactElement) => renderToStaticMarkup(el);
const pillars = (b: number, s: number, br: number, g: number, o: number, d: number): TrustPillars => ({
  borrowed_trust: { score: b, findings: ["hallazgo borrowed"] },
  serp_trust: { score: s, findings: [] },
  brand_assets: { score: br, findings: [] },
  geo_presence: { score: g, findings: ["sin perfil en Capterra/G2"] },
  outbound_readiness: { score: o, findings: [] },
  demand_engine: { score: d, findings: [] },
});
const brand = (name: string, dom: string, ts: number, p: TrustPillars, geo: Record<string, { mentions: boolean }>): BrandScore => ({
  url: "https://" + dom, domain: dom, brand_name: name, sector: "SaaS fiscal", region: "ES", trust_score: ts,
  pillars: p, top_gaps: ["Geo Presence 18 — ausente en LLMs", "Reputación SERP negativa"], serp_highlight: "", geo_highlight: "", verdict: "posición intermedia",
  geo_llm_results: geo, geo_llms_tested: Object.keys(geo).length,
});
const data: CompareResult = {
  primary: brand("Declarando", "declarando.es", 56, pillars(62, 58, 46, 18, 78, 61), { Gemini: { mentions: false }, Perplexity: { mentions: false } }),
  competitors: [
    brand("Ayuda T Pymes", "ayudatpymes.com", 80, pillars(91, 88, 74, 68, 82, 71), { Gemini: { mentions: true }, Perplexity: { mentions: true } }),
    brand("TaxDown", "taxdown.es", 72, pillars(88, 82, 71, 38, 78, 57), { Gemini: { mentions: false }, Perplexity: { mentions: true } }),
  ],
  comparison: {
    pillar_winners: {}, primary_advantages: ["Outbound Readiness 78 — su pilar más sólido"],
    primary_gaps: ["Geo Presence 18 vs 68 (−50)"], insights: ["Citabilidad ≠ autoridad"],
    verdict: "Declarando ocupa una posición intermedia",
  },
};

test("ReputationSurface: header + Trust Score + gap vs leader", () => {
  const m = render(createElement(ReputationSurface, { data }));
  assert.match(m, /Declarando/);
  assert.match(m, /56/);
  assert.match(m, /Ayuda T Pymes/); // leader in the gap hint + scoreboard
});

test("ReputationSurface: the 6 pillars vs the leader", () => {
  const m = render(createElement(ReputationSurface, { data }));
  for (const l of ["Borrowed Trust", "SERP Trust", "Brand Assets", "Geo Presence", "Outbound Readiness", "Demand Engine"]) assert.match(m, new RegExp(l));
});

test("ReputationSurface: GEO matrix shows the 0/2 AI-mention gap", () => {
  const m = render(createElement(ReputationSurface, { data }));
  assert.match(m, /Gemini/);
  assert.match(m, /Perplexity/);
  assert.match(m, /0\/2/);
});

test("ReputationSurface: diagnosis — verdict + wins + gaps + insights", () => {
  const m = render(createElement(ReputationSurface, { data }));
  assert.match(m, /posición intermedia/);
  assert.match(m, /Outbound Readiness 78/);
  assert.match(m, /Geo Presence 18 vs 68/);
  assert.match(m, /Citabilidad/);
});

test("ReputationSurface: no data → Trust Engine not-run empty state", () => {
  assert.match(render(createElement(ReputationSurface, { data: null })), /aún no ha corrido/);
});
