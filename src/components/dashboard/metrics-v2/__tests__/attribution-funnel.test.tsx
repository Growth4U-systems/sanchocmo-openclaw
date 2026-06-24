/**
 * AttributionFunnel (SAN-319 · PR7 component) — cross-source channel→cita→pago table.
 *
 * Presentational only: it renders rows it's handed (the cross-source JOIN lives in
 * the data layer / Atribución view, not here) and makes the Koibox truth-source +
 * dedup provenance explicit. Rendered with `renderToStaticMarkup` under `tsx --test`.
 * Run: `npm run test:metrics`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AttributionFunnel } from "../AttributionFunnel";

const render = (el: ReactElement) => renderToStaticMarkup(el);

const ROWS = [
  { channel: "Meta Ads", visits: 1200, conversions: 4, convRate: 0.0033, spend: 540, cpa: 135 },
  { channel: "Google Ads", visits: 980, conversions: 7, convRate: 0.0071, spend: 365, cpa: 52 },
];

test("AttributionFunnel: renders one row per channel with its citas and spend", () => {
  const m = render(createElement(AttributionFunnel, { rows: ROWS, truthSource: "koibox" }));
  assert.match(m, /Meta Ads/);
  assert.match(m, /Google Ads/);
  // money is € + rounded, with no thousands separator under 1000
  assert.match(m, /€540/);
  assert.match(m, /€365/);
  assert.match(m, /€135/);
  assert.match(m, /€52\b/);
  // a conversion-rate column renders a percentage
  assert.match(m, /%/);
});

test("AttributionFunnel: makes the Koibox dedup truth-source explicit", () => {
  const m = render(createElement(AttributionFunnel, { rows: ROWS, truthSource: "koibox" }));
  // citas = Koibox, deduped by appointment id → DataChip(type=dedup) + the source name
  assert.match(m, /koibox/i);
  assert.match(m, /Dedup/);
});

test("AttributionFunnel: guards a non-finite CPA (0 citas) — never prints Infinity/NaN", () => {
  const rows = [{ channel: "Email", visits: 10, conversions: 0, convRate: 0, spend: 50, cpa: Number.POSITIVE_INFINITY }];
  const m = render(createElement(AttributionFunnel, { rows, truthSource: "koibox" }));
  assert.doesNotMatch(m, /Infinity/);
  assert.doesNotMatch(m, /NaN/);
  assert.match(m, /—/); // em dash placeholder for an undefined CPA
  assert.match(m, /€50/); // spend still shown
});

test("AttributionFunnel: empty rows render an explicit empty state, not a bare table", () => {
  const m = render(createElement(AttributionFunnel, { rows: [], truthSource: "koibox" }));
  assert.match(m, /Sin datos de atribución/i);
  assert.doesNotMatch(m, /Meta Ads/);
});
