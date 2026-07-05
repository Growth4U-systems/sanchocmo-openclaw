/**
 * Discoverability surface shell (SAN-319 · PR6) — composition + empty state.
 * Run: `npm run test:metrics`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DiscoverabilitySurface, type DiscoverabilitySeo, type DiscoverabilityAi } from "../DiscoverabilitySurface";

const render = (el: ReactElement) => renderToStaticMarkup(el);

const seo: DiscoverabilitySeo = {
  kpis: [{ label: "Clicks", value: "4.820", source: "GSC", dir: "up", delta: "+19%" }],
  trend: [{ date: "a", clicks: 1, impressions: 10 }, { date: "b", clicks: 2, impressions: 12 }],
  queries: [{ query: "injerto capilar precio", clicks: 210, impressions: 6400, ctr: 3.3, position: 8.1, deltaPos: 2 }],
  pages: [],
  movers: { up: [], down: [] },
  health: { cwv: { lcp: 2.1, cls: 0.06, inp: 180 }, scores: { mobile: 74, desktop: 96, seo: 98 }, positionDist: [{ bucket: "Top 1-3", count: 8 }] },
  funnel: { steps: [{ label: "Clicks", value: "4.820" }], note: "Web aporta 88 de 520 leads" },
};
const ai: DiscoverabilityAi = {
  kpis: [{ label: "Share of Voice", value: "28%", dir: "up", delta: "+4pp" }],
  sov: [{ label: "Tú", color: "rust", points: [24, 28] }],
  competitors: [{ brand: "Tú", sov: 28, visibility: 43, mentions: 195, position: 2.4, sentiment: 72, you: true }],
  engines: [{ engine: "ChatGPT", visibility: 52 }],
  prompts: [{ prompt: "mejor clínica", engine: "Perplexity", position: 2 }],
  movers: { up: [], down: [] },
  readiness: { checklist: [{ check: "GPTBot permitido", status: "ok" }] },
  funnel: { steps: [{ label: "Citas IA", value: "84" }], note: "AI aporta 11" },
};

test("DiscoverabilitySurface: no sources → the empty state", () => {
  assert.match(render(createElement(DiscoverabilitySurface, { data: {} })), /sin conectar/);
});

test("DiscoverabilitySurface: SEO data → SEO tab content + both sub-tab buttons", () => {
  const m = render(createElement(DiscoverabilitySurface, { data: { seo } }));
  assert.match(m, /Clicks/);
  assert.match(m, />SEO</);
  assert.match(m, />AI</);
  assert.match(m, /Señales de Web/); // composed IntelBridge
});

test("DiscoverabilitySurface: AI-only data defaults to the AI tab", () => {
  const m = render(createElement(DiscoverabilitySurface, { data: { ai } }));
  assert.match(m, /Share of Voice/);
  assert.match(m, /Conectado sin datos/);
});
