/**
 * Funnel contribution (SAN-319, ⑦). Run: `npm run test:metrics`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FunnelContribution } from "../FunnelContribution";

const render = (el: ReactElement) => renderToStaticMarkup(el);
const base = {
  steps: [
    { label: "Impresiones", value: "192k" },
    { label: "Clicks", value: "4.820" },
    { label: "Sessions", value: "13.000" },
    { label: "Conversiones", value: "142" },
    { label: "Leads (web)", value: "88" },
  ],
  note: "Web aporta 88 de 520 leads (17%)",
};

test("FunnelContribution: renders every step (label + value)", () => {
  const m = render(createElement(FunnelContribution, base));
  for (const s of base.steps) {
    assert.match(m, new RegExp(s.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(m, new RegExp(s.value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("FunnelContribution: shows the contribution note + Channels link", () => {
  const m = render(createElement(FunnelContribution, base));
  assert.match(m, /Web aporta 88 de 520 leads/);
  assert.match(m, /ver en Channels/);
});
