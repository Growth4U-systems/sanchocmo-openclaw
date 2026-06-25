/**
 * Discoverability · SEO hero trend (SAN-319 · PR6, slot ③).
 * Run: `npm run test:metrics`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SeoTrend } from "../SeoTrend";

const render = (el: ReactElement) => renderToStaticMarkup(el);
const series = Array.from({ length: 8 }, (_, i) => ({ date: `d${i}`, clicks: 100 + i * 12, impressions: 5000 + i * 220 }));

test("SeoTrend: renders the dual-axis SVG (clicks bars + impressions line)", () => {
  const m = render(createElement(SeoTrend, { series }));
  assert.match(m, /<svg/);
  assert.match(m, /<rect/); // clicks bars
  assert.match(m, /<path/); // impressions line
  assert.match(m, /Clicks/);
  assert.match(m, /Impresiones/);
});

test("SeoTrend: needs ≥2 points — a single point renders nothing", () => {
  assert.equal(render(createElement(SeoTrend, { series: series.slice(0, 1) })), "");
});
