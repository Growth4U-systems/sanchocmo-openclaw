/**
 * Intelligence bridge (SAN-319, ⑧). Run: `npm run test:metrics`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { IntelBridge } from "../IntelBridge";

const render = (el: ReactElement) => renderToStaticMarkup(el);
const base = {
  surface: "Web & SEO",
  signals: ["«onboarding clientes b2b» cae 3 posiciones — revisar contenido", "«qué es growth» CTR 0,7% — oportunidad de title"],
};

test("IntelBridge: header carries the surface name", () => {
  const m = render(createElement(IntelBridge, base)); // note: "&" is HTML-escaped to &amp;
  assert.match(m, /Señales de Web/);
  assert.match(m, /SEO vía Intelligence/);
});

test("IntelBridge: renders the locked signal previews", () => {
  const m = render(createElement(IntelBridge, base));
  for (const s of base.signals) assert.match(m, new RegExp(s.slice(0, 12).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(m, /Abrir Intelligence/);
});
