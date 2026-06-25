/**
 * Between-stage funnel (SAN-319 · Conversión). Run: `npm run test:metrics`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BetweenStageFunnel, type FunnelStage } from "../BetweenStageFunnel";

const render = (el: ReactElement) => renderToStaticMarkup(el);
const stages: FunnelStage[] = [
  { label: "Sessions", value: 13000 },
  { label: "Leads", value: 520 },
  { label: "Cualificados", value: 165 },
  { label: "Reuniones", value: 72 },
  { label: "Deals", value: 16 },
];

test("BetweenStageFunnel: renders every stage with its value", () => {
  const m = render(createElement(BetweenStageFunnel, { stages }));
  for (const s of stages) assert.match(m, new RegExp(s.label));
  assert.match(m, /13\.000/);
  assert.match(m, /520/);
});

test("BetweenStageFunnel: shows the between-stage conversion %", () => {
  const m = render(createElement(BetweenStageFunnel, { stages }));
  assert.match(m, /4%/); // 520 / 13000 ≈ 4%
  assert.match(m, /global/); // overall conversion summary
});

test("BetweenStageFunnel: flags the worst drops as leaks", () => {
  const m = render(createElement(BetweenStageFunnel, { stages }));
  // the two lowest rates are Sessions→Leads (4%) and Reuniones→Deals (22%)
  assert.match(m, /mayor fuga/);
});

test("BetweenStageFunnel: < 2 resolvable stages → graceful note", () => {
  const m = render(createElement(BetweenStageFunnel, { stages: [{ label: "Leads", value: NaN }] }));
  assert.match(m, /aparece cuando las etapas/);
});
