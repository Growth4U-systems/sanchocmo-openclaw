/**
 * Discoverability · SEO movers (SAN-319 · PR6, slot ⑤).
 * Run: `npm run test:metrics`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SeoMovers, type SeoMover } from "../SeoMovers";

const render = (el: ReactElement) => renderToStaticMarkup(el);
const up: SeoMover[] = [
  { query: "qué es growth marketing", from: 23, to: 18 },
  { query: "growth agency valencia", to: 19, tag: "new" },
];
const down: SeoMover[] = [
  { query: "onboarding clientes b2b", from: 11, to: 14 },
  { query: "marketing automation b2b", to: 101, tag: "lost" },
];
const base = { up, down };

test("SeoMovers: both columns render with their headers", () => {
  const m = render(createElement(SeoMovers, base));
  assert.match(m, /Suben/);
  assert.match(m, /Bajan/);
});

test("SeoMovers: a climbing query shows its position change (#23 → #18 ▲)", () => {
  const m = render(createElement(SeoMovers, base));
  assert.match(m, /qué es growth marketing/);
  assert.match(m, /#23/);
  assert.match(m, /#18/);
  assert.match(m, /▲/);
});

test("SeoMovers: a new ranking carries the 'nueva' tag", () => {
  const m = render(createElement(SeoMovers, base));
  assert.match(m, /nueva/);
  assert.match(m, /growth agency valencia/);
});

test("SeoMovers: a declining query shows ▼", () => {
  assert.match(render(createElement(SeoMovers, base)), /▼/);
});

test("SeoMovers: a lost ranking carries 'perdida' + 'salió top 100'", () => {
  const m = render(createElement(SeoMovers, base));
  assert.match(m, /perdida/);
  assert.match(m, /salió top 100/);
});
