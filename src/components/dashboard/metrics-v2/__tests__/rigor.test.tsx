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
  real: "Real",
  dedup: "Dedup",
  seed: "Seed",
  target: "Target",
  pending: "Pendiente",
};

test("DataChip: renders the label for each type", () => {
  for (const type of Object.keys(CHIP_LABEL) as ChipType[]) {
    assert.match(render(createElement(DataChip, { type })), new RegExp(CHIP_LABEL[type]));
  }
});

test("DataChip: each type renders a distinct dot colour class", () => {
  const dotClass = (markup: string) => markup.match(/class="([^"]*\brounded-full\b[^"]*)"/)?.[1] ?? "";
  const classes = (Object.keys(CHIP_LABEL) as ChipType[]).map((type) =>
    dotClass(render(createElement(DataChip, { type }))),
  );
  assert.equal(new Set(classes).size, 5, "all 5 types must produce distinct dot classes");
  // semantic anchors: real = green, pending = red
  assert.match(render(createElement(DataChip, { type: "real" })), /bg-sage/);
  assert.match(render(createElement(DataChip, { type: "pending" })), /bg-destructive/);
});

test("DataChip: title is `source · confidence`, omitting absent parts", () => {
  assert.match(
    render(createElement(DataChip, { type: "real", source: "meta_ads", confidence: "alta" })),
    /title="meta_ads · alta"/,
  );
  const onlySource = render(createElement(DataChip, { type: "real", source: "meta_ads" }));
  assert.match(onlySource, /title="meta_ads"/);
  assert.doesNotMatch(onlySource, /·/);
  assert.doesNotMatch(render(createElement(DataChip, { type: "real" })), /title=/);
});

// ───────────────────────── ProvenanceFooter ─────────────────────────

test("ProvenanceFooter: shows every provided field with its label", () => {
  const m = render(
    createElement(ProvenanceFooter, {
      source: "meta_ads",
      route: "ruta/x.json",
      client: "hospital-capilar",
      period: "30d",
      lastCollected: "2026-05-01",
    }),
  );
  for (const v of ["meta_ads", "ruta/x.json", "hospital-capilar", "30d", "2026-05-01"]) {
    assert.match(m, new RegExp(v));
  }
  for (const label of ["Fuente", "Ruta", "Cliente", "Periodo", "Colectado"]) {
    assert.match(m, new RegExp(label));
  }
});

test("ProvenanceFooter: omits absent optional fields", () => {
  const m = render(createElement(ProvenanceFooter, { source: "meta_ads" }));
  assert.match(m, /meta_ads/);
  assert.match(m, /Fuente/);
  for (const label of ["Ruta", "Cliente", "Periodo", "Colectado"]) {
    assert.doesNotMatch(m, new RegExp(label));
  }
});

// ───────────────────────── ConnectionState ─────────────────────────

type ConnState = "off" | "partial" | "connected_pending" | "collecting";
const CONN_LABEL: Record<ConnState, string> = {
  off: "Desconectado",
  partial: "Parcial",
  connected_pending: "Conectado · pendiente",
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
  assert.match(pending, /Conectado · pendiente/);
  assert.doesNotMatch(partial, /Conectado/);
  // distinct colour token
  assert.match(partial, /var\(--yellow\)/);
  assert.match(pending, /var\(--cyan\)/);
});

// ───────────────────────── DataHealthBadge ─────────────────────────

test("DataHealthBadge: clean renders a non-link green badge", () => {
  const m = render(createElement(DataHealthBadge, { source: "posthog", status: "clean" }));
  assert.match(m, /^<span/);
  assert.doesNotMatch(m, /href=/);
  assert.match(m, /text-sage/);
  assert.match(m, /posthog/);
});

test("DataHealthBadge: dirty renders a red link to the given href", () => {
  const m = render(createElement(DataHealthBadge, { source: "ghl", status: "dirty", href: "#salud" }));
  assert.match(m, /^<a /);
  assert.match(m, /href="#salud"/);
  assert.match(m, /text-destructive/);
  assert.match(m, /ghl/);
});

test("DataHealthBadge: dirty defaults href to the Salud de dato anchor", () => {
  const m = render(createElement(DataHealthBadge, { source: "ghl", status: "dirty" }));
  assert.match(m, /href="#salud-de-dato"/);
});
