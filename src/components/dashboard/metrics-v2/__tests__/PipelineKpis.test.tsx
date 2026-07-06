/**
 * Pipeline/CRM surface — GHL-only rigor header (SAN-319 · PR4).
 *
 * Rendered with `renderToStaticMarkup` under `tsx --test` (jsx: react-jsx via
 * `tsconfig.tsx-tests.json`, so no explicit `import React`). Run: `npm run test:metrics`.
 *
 * Guards the surface's rigor contract: surfaces read ONLY their own source, so
 * Pipeline keeps GHL as the CRM-owned direct source; cross-source attribution lives
 * in the Atribución view (PR7); and the surface NEVER references Koibox.
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
  ghlDirty: false,
};

test("PipelineKpis: renders the GHL KPI values + labels", () => {
  const m = render(createElement(PipelineKpis, base));
  for (const v of ["87", "33", "210"]) assert.match(m, new RegExp(v));
  for (const label of ["Contacts", "New", "Appts", "Opps", "Pipeline"]) {
    assert.match(m, new RegExp(label));
  }
});

test("PipelineKpis: GHL keeps direct-source provenance without a visible Real tag", () => {
  const m = render(createElement(PipelineKpis, base));
  assert.match(m, /Dato directo/);
  assert.doesNotMatch(m, />Real</);
  assert.match(m, /dato directo de GHL/);
});

test("PipelineKpis: clean GHL does not show pending instrumentation copy", () => {
  const m = render(createElement(PipelineKpis, base));
  assert.doesNotMatch(m, /Pendiente/);
  assert.doesNotMatch(m, /inflado/);
});

test("PipelineKpis: dirty GHL still links to Salud de dato when passed explicitly", () => {
  const m = render(createElement(PipelineKpis, { ...base, ghlDirty: true, dirtyReason: "API inconsistente" }));
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
