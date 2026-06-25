/**
 * Product surface — PostHog funnel by unique users (SAN-319 · PR5).
 *
 * Rendered with `renderToStaticMarkup` under `tsx --test` (jsx: react-jsx via
 * `tsconfig.tsx-tests.json`). Run: `npm run test:metrics`.
 *
 * Rigor contract: the Product surface reads ONLY PostHog (its own source) and shows
 * the frontend funnel by *unique people* — each step is `Real` (PostHog sees the
 * event directly). The real cita and the pago are NOT computed here (they're Koibox /
 * Stripe, joined in the Atribución view, PR7) — so the surface never fabricates a
 * "booked"/appointment step; it cross-links instead.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProductFunnel } from "../ProductFunnel";

const render = (el: ReactElement) => renderToStaticMarkup(el);

const base = {
  steps: [
    { step: "Visita", reached: 2791, dropoff: 0 },
    { step: "Quiz", reached: 270, dropoff: 2521 },
    { step: "Formulario", reached: 60, dropoff: 210 },
  ],
  pageviews: 4200,
  activationEvents: 270,
  recordings: 18,
  posthogDirty: false,
};

test("ProductFunnel: renders the frontend funnel steps by uniques", () => {
  const m = render(createElement(ProductFunnel, base));
  for (const label of ["Visita", "Quiz", "Formulario"]) assert.match(m, new RegExp(label));
  assert.match(m, /791/); // reached value rendered (locale-tolerant)
});

test("ProductFunnel: every step is Real (PostHog sees it directly)", () => {
  assert.match(render(createElement(ProductFunnel, base)), /Real/);
});

test("ProductFunnel: clean PostHog → health badge is clean, no Salud-de-dato link", () => {
  const m = render(createElement(ProductFunnel, base));
  assert.match(m, /posthog: dato limpio/);
  assert.doesNotMatch(m, /#salud-de-dato/);
});

test("ProductFunnel: cross-links the real cita/pago to Conversión/Atribución", () => {
  assert.match(render(createElement(ProductFunnel, base)), /Atribuci[oó]n/);
});

test("ProductFunnel: NEVER fabricates a booking/appointment step (cita real = Atribución)", () => {
  const m = render(createElement(ProductFunnel, base));
  assert.doesNotMatch(m, /booking/i);
  assert.doesNotMatch(m, /reserva/i);
});

test("ProductFunnel: dirty PostHog → health badge links to Salud de dato", () => {
  const m = render(createElement(ProductFunnel, { ...base, posthogDirty: true }));
  assert.match(m, /#salud-de-dato/);
  assert.match(m, /posthog: problema de dato/);
});
