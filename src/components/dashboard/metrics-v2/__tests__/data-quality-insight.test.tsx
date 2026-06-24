/**
 * DataQualityInsight (SAN-319 · PR8 component) — instrumentation-quality callout.
 *
 * Presentational only: the *Salud de dato* view feeds it from getMetricsHealth
 * (GHL inflation, ±10 leads, attendance not emitted, connected≠collected). Each
 * surface only links here via DataHealthBadge. Rendered with `renderToStaticMarkup`
 * under `tsx --test`. Run: `npm run test:metrics`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DataQualityInsight } from "../DataQualityInsight";

const render = (el: ReactElement) => renderToStaticMarkup(el);

test("DataQualityInsight: renders its title and body", () => {
  const m = render(
    createElement(DataQualityInsight, {
      title: "GHL infla eventos de cita",
      body: "1 cita real → 100+ eventos; los conteos no son cifra exacta.",
      severity: "high",
    }),
  );
  assert.match(m, /GHL infla eventos de cita/);
  assert.match(m, /100\+ eventos/);
});

test("DataQualityInsight: high and warn render distinct severity styling and labels", () => {
  const high = render(
    createElement(DataQualityInsight, { title: "t", body: "b", severity: "high" }),
  );
  const warn = render(
    createElement(DataQualityInsight, { title: "t", body: "b", severity: "warn" }),
  );
  assert.notEqual(high, warn);
  // high = red/destructive + "Crítico"; warn = yellow + "Aviso"
  assert.match(high, /text-destructive/);
  assert.match(high, /Crítico/);
  assert.match(warn, /var\(--yellow\)/);
  assert.match(warn, /Aviso/);
  assert.doesNotMatch(warn, /Crítico/);
});

test("DataQualityInsight: shows the owner when given, omits the label when absent", () => {
  const withOwner = render(
    createElement(DataQualityInsight, { title: "t", body: "b", severity: "warn", owner: "Pipeline · GHL" }),
  );
  assert.match(withOwner, /Due[ñn]o/);
  assert.match(withOwner, /Pipeline · GHL/);

  const noOwner = render(createElement(DataQualityInsight, { title: "t", body: "b", severity: "warn" }));
  assert.doesNotMatch(noOwner, /Due[ñn]o/);
});

test("DataQualityInsight: exposes a note role for assistive tech", () => {
  const m = render(createElement(DataQualityInsight, { title: "t", body: "b", severity: "high" }));
  assert.match(m, /role="note"/);
});
