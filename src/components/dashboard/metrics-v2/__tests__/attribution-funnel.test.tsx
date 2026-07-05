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
  // citas = Koibox, deduped by appointment id; provenance stays in tooltip/aria.
  assert.match(m, /koibox/i);
  assert.match(m, /Dato validado/);
  assert.doesNotMatch(m, />Dedup</);
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

// ── Rich Atribución view (SAN-319 · PR7 completion): bruto→corregido + layers ──

const RICH = {
  rows: ROWS,
  truthSource: "koibox" as const,
  rawVsCorrected: { raw: '100 "bookings"', corrected: "7 citas Koibox", factor: "14× inflado" },
  layers: [
    { label: "Bruto", text: "Plataforma: 100 bookings, 13 conversions Meta." },
    { label: "Corregido", text: "Koibox: 7 citas (Meta 3·Google 2·sin-UTM 2)." },
    { label: "Lectura", text: "Google 6,7× más eficiente por visita." },
    { label: "Decisión", text: "Reasignar a Google; CAC €905 insostenible (N=1)." },
  ],
  representative: true,
};

test("AttributionFunnel: rawVsCorrected shows the bruto→corregido headline (100 → 7)", () => {
  const m = render(createElement(AttributionFunnel, RICH));
  assert.match(m, /bookings/);
  assert.match(m, /7 citas Koibox/);
  assert.match(m, /14× inflado/);
});

test("AttributionFunnel: layers render Bruto/Corregido/Lectura/Decisión", () => {
  const m = render(createElement(AttributionFunnel, RICH));
  for (const label of ["Bruto", "Corregido", "Lectura", "Decisión"]) assert.match(m, new RegExp(label));
  assert.match(m, /Reasignar a Google/);
});

test("AttributionFunnel: representative flag marks the numbers as illustrative", () => {
  assert.match(render(createElement(AttributionFunnel, RICH)), /representativos/i);
});

test("AttributionFunnel: without the rich props nothing extra renders (backward-compatible)", () => {
  const m = render(createElement(AttributionFunnel, { rows: ROWS, truthSource: "koibox" }));
  assert.doesNotMatch(m, /Decisión/);
  assert.doesNotMatch(m, /representativos/i);
  assert.doesNotMatch(m, /TOTAL/);
});

test("AttributionFunnel: total=true appends a TOTAL row summing finite values", () => {
  // ROWS: visits 1200+980, citas 4+7=11, spend 540+365=905; Sin-UTM-style NaN must be skipped
  const rows = [...ROWS, { channel: "Sin UTM", visits: NaN, conversions: 2, convRate: NaN, spend: NaN, cpa: NaN }];
  const m = render(createElement(AttributionFunnel, { rows, truthSource: "koibox", total: true }));
  assert.match(m, /TOTAL/);
  assert.match(m, /€905/); // total spend = finite-only sum (NaN skipped)
  assert.match(m, /13\b/); // total citas = 4 + 7 + 2
  assert.doesNotMatch(m, /NaN/);
});
