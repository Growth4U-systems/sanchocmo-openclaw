/**
 * Discoverability · SEO KPI scorecards (SAN-319 · PR6).
 *
 * Rendered with `renderToStaticMarkup` under `tsx --test` (jsx: react-jsx via
 * `tsconfig.tsx-tests.json`). Run: `npm run test:metrics`.
 *
 * Rigor contract: the SEO sub-tab reads ONLY its own sources (GA4 · GSC · PageSpeed),
 * every number keeps direct-source provenance without visible technical tags, and it never fabricates the
 * cross-source story (web → cita → pago) — that's Atribución (PR7).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WebSeoKpis, type WebSeoKpi } from "../WebSeoKpis";

const render = (el: ReactElement) => renderToStaticMarkup(el);

const kpis: WebSeoKpi[] = [
  { label: "Clicks", value: "4.820", delta: "+19%", dir: "up", source: "GSC" },
  { label: "Impresiones", value: "192k", delta: "+12%", dir: "up", source: "GSC" },
  { label: "Posición media", value: "11,8", delta: "1,2", dir: "up", source: "GSC" },
  { label: "CTR", value: "2,5%", delta: "+0,3pp", dir: "up", source: "GSC" },
  { label: "Sessions", value: "13,0k", delta: "+9%", dir: "up", source: "GA4" },
  { label: "Engagement", value: "58%", delta: "+2pp", dir: "up", source: "GA4" },
  { label: "Conversiones", value: "142", delta: "+11%", dir: "up", source: "GA4" },
  { label: "Core Web Vitals", value: "Pasa", hint: "74 móvil", dir: "flat", source: "PageSpeed", health: true },
];
const base = { kpis, state: "collecting" as const, client: "hospital-capilar", period: "30d" };

test("WebSeoKpis: renders all 8 SEO KPI labels + values", () => {
  const m = render(createElement(WebSeoKpis, base));
  for (const k of kpis) {
    assert.match(m, new RegExp(k.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(m, new RegExp(k.value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("WebSeoKpis: every KPI keeps direct-source provenance without visible Real tags", () => {
  const m = render(createElement(WebSeoKpis, base));
  assert.match(m, /Dato directo/);
  assert.doesNotMatch(m, />Real</);
  for (const src of ["GSC", "GA4", "PageSpeed"]) assert.match(m, new RegExp(src));
});

test("WebSeoKpis: shows the connection state (collecting)", () => {
  assert.match(render(createElement(WebSeoKpis, base)), /Recolectando/);
});

test("WebSeoKpis: connected_pending = credential present, no rows yet (SAN-228)", () => {
  const m = render(createElement(WebSeoKpis, { ...base, state: "connected_pending" }));
  assert.match(m, /Listo para recolectar/);
});

test("WebSeoKpis: the Core Web Vitals health KPI renders its secondary hint", () => {
  assert.match(render(createElement(WebSeoKpis, base)), /74 móvil/);
});

test("WebSeoKpis: pure SEO — never fabricates the cross-source cita/pago (that's Atribución)", () => {
  const m = render(createElement(WebSeoKpis, base));
  assert.doesNotMatch(m, /cita/i);
  assert.doesNotMatch(m, /booking/i);
  assert.doesNotMatch(m, /pago/i);
});
