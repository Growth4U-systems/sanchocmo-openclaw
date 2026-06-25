/**
 * Discoverability · SEO breakdowns (SAN-319 · PR6, slot ④) — the exploration core.
 * Run: `npm run test:metrics`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SeoBreakdown, type SeoQueryRow, type SeoPageRow } from "../SeoBreakdown";

const render = (el: ReactElement) => renderToStaticMarkup(el);

const queries: SeoQueryRow[] = [
  { query: "injerto capilar precio", clicks: 210, impressions: 6400, ctr: 3.3, position: 8.1, deltaPos: 2, history: [12, 10, 9, 8], intent: "Comercial" },
  { query: "clínica capilar madrid", clicks: 96, impressions: 1400, ctr: 6.9, position: 6.2, deltaPos: 0, intent: "Comercial" },
  { query: "injerto capilar opiniones", clicks: 41, impressions: 2000, ctr: 2.1, position: 14.2, deltaPos: -3, intent: "Comercial" },
];
const pages: SeoPageRow[] = [
  { page: "/blog/injerto-precio", visits: 1900, position: 8.1, clicks: 210, ctr: 3.3, conversions: 22, type: "Blog" },
];
const base = { queries, pages, totalQueries: 1240, totalPages: 312 };

test("SeoBreakdown: default Queries view renders the rows + lead metric", () => {
  const m = render(createElement(SeoBreakdown, base));
  for (const q of queries) assert.match(m, new RegExp(q.query));
  assert.match(m, /210/); // clicks of the top row
});

test("SeoBreakdown: only the active dimension renders (Pages hidden by default)", () => {
  const m = render(createElement(SeoBreakdown, base));
  assert.doesNotMatch(m, /blog\/injerto-precio/); // a Pages-only row
});

test("SeoBreakdown: Δposition chip shows direction (▲ improved / ▼ declined)", () => {
  const m = render(createElement(SeoBreakdown, base));
  assert.match(m, /▲/); // injerto capilar precio +2
  assert.match(m, /▼/); // injerto capilar opiniones -3
});

test("SeoBreakdown: the «Ver las N →» door carries the full count", () => {
  const m = render(createElement(SeoBreakdown, base));
  assert.match(m, /Ver las/);
  assert.match(m, /queries/);
  assert.match(m, /1\.?240/); // count present (es-ES grouping is locale-data dependent in the test runner)
});

test("SeoBreakdown: provenance is Real, own-source (GSC)", () => {
  const m = render(createElement(SeoBreakdown, base));
  assert.match(m, /Real/);
  assert.match(m, /GSC/);
});

test("SeoBreakdown: pure — never fabricates the cross-source cita/pago (that's Atribución)", () => {
  const m = render(createElement(SeoBreakdown, base));
  assert.doesNotMatch(m, /cita/i);
  assert.doesNotMatch(m, /pago/i);
});
