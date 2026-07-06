/**
 * Rigor primitives (SAN-319 · PR1) — data-provenance UI.
 *
 * Rendered with `renderToStaticMarkup` under `tsx --test`. The
 * `tsconfig.tsx-tests.json` config sets `jsx: react-jsx` (automatic runtime) so
 * the idiomatic components in `rigor.tsx` need no explicit `import React`.
 * Run: `npm run test:metrics`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DataChip, ProvenanceFooter, ConnectionState, DataHealthBadge } from "../rigor";

const render = (el: ReactElement) => renderToStaticMarkup(el);

// ───────────────────────── DataChip ─────────────────────────

type ChipType = "real" | "dedup" | "seed" | "target" | "pending";
const CHIP_LABEL: Record<ChipType, string> = {
  real: "Dato directo",
  dedup: "Dato validado",
  seed: "Referencia temporal",
  target: "Objetivo",
  pending: "Por conectar",
};

test("DataChip: keeps provenance in title/aria, not as visible tags", () => {
  for (const type of Object.keys(CHIP_LABEL) as ChipType[]) {
    const markup = render(createElement(DataChip, { type, source: "meta_ads" }));
    assert.match(markup, new RegExp(CHIP_LABEL[type]));
    assert.match(markup, /aria-label="Meta Ads/);
    assert.doesNotMatch(markup, new RegExp(`>${CHIP_LABEL[type]}<`));
  }
});

test("DataChip: each type renders a distinct dot colour class", () => {
  const dotClass = (markup: string) => markup.match(/class="([^"]*\bh-1\.5\b[^"]*)"/)?.[1] ?? "";
  const classes = (Object.keys(CHIP_LABEL) as ChipType[]).map((type) =>
    dotClass(render(createElement(DataChip, { type }))),
  );
  assert.equal(new Set(classes).size, 5, "all 5 types must produce distinct dot classes");
  // semantic anchors: real = green, pending = red
  assert.match(render(createElement(DataChip, { type: "real" })), /bg-sage/);
  assert.match(render(createElement(DataChip, { type: "pending" })), /bg-destructive/);
});

test("DataChip: title is user-readable source + provenance + confidence", () => {
  assert.match(
    render(createElement(DataChip, { type: "real", source: "meta_ads", confidence: "alta" })),
    /title="Meta Ads · Dato directo · alta"/,
  );
  const onlySource = render(createElement(DataChip, { type: "real", source: "meta_ads" }));
  assert.match(onlySource, /title="Meta Ads · Dato directo"/);
  assert.match(render(createElement(DataChip, { type: "real" })), /title="Dato directo"/);
});

// ───────────────────────── ProvenanceFooter ─────────────────────────

test("ProvenanceFooter: shows a compact user-facing line and keeps details in title", () => {
  const m = render(
    createElement(ProvenanceFooter, {
      source: "meta_ads",
      route: "ruta/x.json",
      client: "example",
      period: "30d",
      lastCollected: "2026-05-01",
    }),
  );
  assert.match(m, /Datos: Meta Ads · 30d · actualizado 2026-05-01/);
  assert.match(m, /title="Fuente: Meta Ads · Ruta: ruta\/x\.json · Cliente: example · Periodo: 30d · Colectado: 2026-05-01"/);
  assert.doesNotMatch(m, />Ruta:/);
  assert.doesNotMatch(m, />Cliente:/);
});

test("ProvenanceFooter: omits absent optional fields", () => {
  const m = render(createElement(ProvenanceFooter, { source: "meta_ads" }));
  assert.match(m, /Datos: Meta Ads/);
  for (const label of ["Ruta", "Cliente", "Periodo", "Colectado"]) {
    assert.doesNotMatch(m, new RegExp(label));
  }
});

// ───────────────────────── ConnectionState ─────────────────────────

type ConnState = "off" | "partial" | "connected_pending" | "collecting";
const CONN_LABEL: Record<ConnState, string> = {
  off: "No conectado",
  partial: "Falta conexión requerida",
  connected_pending: "Conectado sin datos",
  collecting: "Recolectando",
};

test("ConnectionState: renders the right label for all 4 states", () => {
  for (const state of Object.keys(CONN_LABEL) as ConnState[]) {
    assert.match(render(createElement(ConnectionState, { state })), new RegExp(CONN_LABEL[state]));
  }
});

test("ConnectionState: connected_pending is distinct from partial", () => {
  const partial = render(createElement(ConnectionState, { state: "partial" }));
  const pending = render(createElement(ConnectionState, { state: "connected_pending" }));
  assert.notEqual(partial, pending);
  assert.match(pending, /Conectado sin datos/);
  assert.doesNotMatch(partial, /Conectado sin datos/);
  // distinct colour token
  assert.match(partial, /var\(--yellow\)/);
  assert.match(pending, /var\(--cyan\)/);
});

// ───────────────────────── DataHealthBadge ─────────────────────────

test("DataHealthBadge: clean renders nothing visible", () => {
  const m = render(createElement(DataHealthBadge, { source: "posthog", status: "clean" }));
  assert.equal(m, "");
});

test("DataHealthBadge: dirty renders a red review link without exposing provider as a tag", () => {
  const m = render(createElement(DataHealthBadge, { source: "ghl", status: "dirty", href: "#salud" }));
  assert.match(m, /^<a /);
  assert.match(m, /href="#salud"/);
  assert.match(m, /text-destructive/);
  assert.match(m, /Revisar dato/);
  assert.doesNotMatch(m, />ghl</i);
});

test("DataHealthBadge: dirty defaults href to the Salud de dato anchor", () => {
  const m = render(createElement(DataHealthBadge, { source: "ghl", status: "dirty" }));
  assert.match(m, /href="#salud-de-dato"/);
});

// ───────────────────────── a11y (accessible status names) ─────────────────────────

test("DataHealthBadge: clean does not add an accessible noise label", () => {
  const m = render(createElement(DataHealthBadge, { source: "posthog", status: "clean" }));
  assert.equal(m, "");
});

test("DataHealthBadge: dirty exposes an accessible status name (source + 'problema')", () => {
  const m = render(createElement(DataHealthBadge, { source: "ghl", status: "dirty" }));
  assert.match(m, /aria-label="[^"]*ghl[^"]*"/);
  assert.match(m, /aria-label="[^"]*problema[^"]*"/);
});

test("ConnectionState: exposes an accessible label carrying the state", () => {
  const m = render(createElement(ConnectionState, { state: "connected_pending" }));
  assert.match(m, /aria-label="[^"]*Conectado sin datos[^"]*"/);
});
