/**
 * Pipeline/CRM surface — GHL-only rigor header (SAN-319 · PR4).
 *
 * Rendered with `renderToStaticMarkup` under `tsx --test` (jsx: react-jsx via
 * `tsconfig.tsx-tests.json`, so no explicit `import React`). Run: `npm run test:metrics`.
 *
 * Guards the surface's rigor contract: surfaces read ONLY their own source, so
 * Pipeline shows GHL flagged as its own (inflated, ±10) source — `Dedup`;
 * appointments/attendance are not instrumented — `Pendiente` (the real cita is
 * Koibox, which lives in the Atribución view, PR7); GHL is known-dirty so the health
 * badge links to *Salud de dato*; and the surface NEVER references Koibox.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PipelineKpis } from "../PipelineKpis";

const render = (el: ReactElement) => renderToStaticMarkup(el);

const base = {
  contacts: 1240,
  newContacts: 87,
  appointments: 33,
  opportunities: 210,
  pipelineValue: 45000,
  ghlDirty: true,
  dirtyReason: "Eventos inflados (1 cita → 100+ eventos) y leads redondeados ±10",
};

test("PipelineKpis: renders the GHL KPI values + labels", () => {
  const m = render(createElement(PipelineKpis, base));
  for (const v of ["87", "33", "210"]) assert.match(m, new RegExp(v));
  for (const label of ["Contacts", "New", "Appts", "Opps", "Pipeline"]) {
    assert.match(m, new RegExp(label));
  }
});

test("PipelineKpis: GHL leads/pipeline carry a Dedup chip (±10, inflado)", () => {
  assert.match(render(createElement(PipelineKpis, base)), /Dedup/);
});

test("PipelineKpis: appointments/attendance carry a Pendiente chip (no instrumentado)", () => {
  assert.match(render(createElement(PipelineKpis, base)), /Pendiente/);
});

test("PipelineKpis: GHL known-dirty → health badge links to Salud de dato", () => {
  const m = render(createElement(PipelineKpis, base));
  assert.match(m, /#salud-de-dato/);
  assert.match(m, /ghl: problema de dato/);
});

test("PipelineKpis: cross-links the real citas to Conversión/Atribución", () => {
  assert.match(render(createElement(PipelineKpis, base)), /Atribuci[oó]n/);
});

test("PipelineKpis: NEVER references Koibox (cross-source lives in Atribución, PR7)", () => {
  assert.doesNotMatch(render(createElement(PipelineKpis, base)), /koibox/i);
});

test("PipelineKpis: clean GHL → no Salud-de-dato link", () => {
  const m = render(createElement(PipelineKpis, { ...base, ghlDirty: false }));
  assert.doesNotMatch(m, /#salud-de-dato/);
  assert.doesNotMatch(m, /problema de dato/);
});
