/**
 * Selector de cuenta remitente de Unipile (SAN-480).
 * Run: `npm run test:partnerships-ui` (mismo arnés renderToStaticMarkup que
 * los tests de metrics-v2 — el componente es presentacional a propósito).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  SenderAccountSelect,
  senderAccountOptionLabel,
} from "../sender-account-select";
import type { SenderAccount } from "@/lib/partnerships/sender-accounts";

const render = (el: ReactElement) => renderToStaticMarkup(el);
const noop = () => {};

const accounts: SenderAccount[] = [
  {
    id: "unipile-ig-1",
    provider: "instagram",
    label: "Martin Fila",
    status: "connected",
  },
  {
    id: "unipile-li-1",
    provider: "linkedin",
    label: "Martin Fila",
    status: "disconnected",
  },
];

test("sin cuentas configuradas no renderiza nada (fallback configured:false)", () => {
  const markup = render(
    createElement(SenderAccountSelect, {
      accounts: [],
      selectedAccountId: null,
      onSelect: noop,
    }),
  );
  assert.equal(markup, "");
});

test("lista las cuentas conectadas con icono de red y opción por defecto", () => {
  const markup = render(
    createElement(SenderAccountSelect, {
      accounts,
      selectedAccountId: null,
      onSelect: noop,
    }),
  );
  assert.match(markup, /Enviar desde/);
  assert.match(markup, /Cuenta por defecto/);
  assert.match(markup, /📸/);
  assert.match(markup, /💼/);
  assert.match(markup, /Martin Fila · Instagram/);
  assert.match(markup, /Martin Fila · LinkedIn/);
});

test("marca la selección y avisa cuando la cuenta elegida no está conectada", () => {
  const markup = render(
    createElement(SenderAccountSelect, {
      accounts,
      selectedAccountId: "unipile-li-1",
      onSelect: noop,
    }),
  );
  assert.match(markup, /value="unipile-li-1" selected/);
  assert.match(markup, /desconectada/);
});

test("la etiqueta de opción incluye red y estado no conectado", () => {
  assert.equal(
    senderAccountOptionLabel(accounts[0]),
    "📸 Martin Fila · Instagram",
  );
  assert.equal(
    senderAccountOptionLabel(accounts[1]),
    "💼 Martin Fila · LinkedIn · desconectada",
  );
});
