/**
 * Discoverability · Share-of-Voice trend (SAN-319 · PR6). Run: `npm run test:metrics`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SovTrend, type SovLine } from "../SovTrend";

const render = (el: ReactElement) => renderToStaticMarkup(el);
const lines: SovLine[] = [
  { label: "Example", color: "rust", points: [24, 25, 26, 27, 28] },
  { label: "Insparya", color: "navy", points: [30, 31, 31, 32, 32] },
  { label: "Clínica X", color: "cyan", points: [22, 21, 20, 20, 20] },
];

test("SovTrend: renders a line per brand with the legend", () => {
  const m = render(createElement(SovTrend, { lines }));
  assert.match(m, /<svg/);
  assert.match(m, /Example/);
  assert.match(m, /Insparya/);
  assert.equal((m.match(/<path/g) || []).length, lines.length);
});

test("SovTrend: needs ≥2 points", () => {
  assert.equal(render(createElement(SovTrend, { lines: [{ label: "x", color: "rust", points: [1] }] })), "");
});
