/**
 * Discoverability · AI KPI scorecards (SAN-319 · PR6). Run: `npm run test:metrics`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AiKpis, type AiKpi } from "../AiKpis";

const render = (el: ReactElement) => renderToStaticMarkup(el);
const kpis: AiKpi[] = [
  { label: "AI Visibility", value: "43,8%", delta: "+6pp", dir: "up" },
  { label: "Share of Voice", value: "28%", delta: "+4pp", dir: "up" },
  { label: "Menciones", value: "195", delta: "+22", dir: "up" },
  { label: "Citas · dominio", value: "84", delta: "+15", dir: "up" },
  { label: "Posición media", value: "2,4", delta: "0,3", dir: "up" },
  { label: "Sentimiento", value: "72 · Bueno", dir: "up", health: true },
  { label: "Motores citado", value: "4 / 6", delta: "+1", dir: "up" },
];

test("AiKpis: renders the AI KPI labels + values", () => {
  const m = render(createElement(AiKpis, { kpis }));
  for (const k of kpis) assert.match(m, new RegExp(k.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(m, /43,8%/);
  assert.match(m, /Share of Voice/);
});

test("AiKpis: AI has no real source yet → numbers are Seed, header connected_pending", () => {
  const m = render(createElement(AiKpis, { kpis }));
  assert.match(m, /Seed/);
  assert.match(m, /IA/);
  assert.match(m, /Conectado · pendiente/);
});
