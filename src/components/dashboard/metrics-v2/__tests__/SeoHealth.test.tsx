/**
 * Discoverability · SEO health (SAN-319 · PR6, slot ⑥).
 * Run: `npm run test:metrics`. Numeric asserts are separator-tolerant (the tsx test
 * runner's ICU differs from the browser; the surface renders client-side).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SeoHealth } from "../SeoHealth";

const render = (el: ReactElement) => renderToStaticMarkup(el);
const base = {
  cwv: { lcp: 2.1, cls: 0.06, inp: 180 },
  scores: { mobile: 74, desktop: 96, seo: 98 },
  positionDist: [
    { bucket: "Top 1-3", count: 8 },
    { bucket: "4-10", count: 22 },
    { bucket: "11-50", count: 64 },
    { bucket: "51-100", count: 110 },
  ],
  totalKeywords: 204,
};

test("SeoHealth: Lighthouse lab — labels + current values", () => {
  const m = render(createElement(SeoHealth, base));
  for (const l of ["LCP", "CLS", "INP"]) assert.match(m, new RegExp(l));
  assert.match(m, /2[.,]1s/);
  assert.match(m, /0[.,]06/);
  assert.match(m, /180ms/);
});

test("SeoHealth: all lab metrics within thresholds are labelled diagnostically", () => {
  assert.match(render(createElement(SeoHealth, base)), /Dentro de umbrales/);
  assert.match(render(createElement(SeoHealth, base)), /no equivale.*CrUX/);
});

test("SeoHealth: lab LCP outside threshold asks for review", () => {
  const m = render(createElement(SeoHealth, { ...base, cwv: { ...base.cwv, lcp: 4.6 } }));
  assert.match(m, /Revisar/);
});

test("SeoHealth: missing lab metric shows an honest empty state", () => {
  const m = render(createElement(SeoHealth, {
    ...base,
    cwv: { lcp: 2.1, cls: 0.06, inp: null },
    scores: { mobile: 90, desktop: null, seo: null },
  }));
  assert.match(m, /Sin datos/);
  assert.doesNotMatch(m, /Dentro de umbrales/);
  assert.match(m, />—</);
});

test("SeoHealth: PageSpeed score chips render", () => {
  const m = render(createElement(SeoHealth, base));
  for (const v of ["74", "96", "98"]) assert.match(m, new RegExp(v));
});

test("SeoHealth: position distribution buckets + counts", () => {
  const m = render(createElement(SeoHealth, base));
  assert.match(m, /Top 1-3/);
  assert.match(m, /51-100/);
  assert.match(m, /110/);
});

test("SeoHealth: provenance is direct-source without a visible Real tag", () => {
  const m = render(createElement(SeoHealth, base));
  assert.match(m, /Dato directo/);
  assert.doesNotMatch(m, />Real</);
  assert.match(m, /PageSpeed/);
  assert.match(m, /GSC/);
});
