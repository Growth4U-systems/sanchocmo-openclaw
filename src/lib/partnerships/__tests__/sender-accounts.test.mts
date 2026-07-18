/**
 * Cuentas remitentes de Unipile (SAN-480).
 * Run: `npm run test:partnerships`.
 *
 * Cubre: normalización tolerante del contrato `/api/unipile/accounts`,
 * degradación Yalc → env `UNIPILE_SENDER_ACCOUNTS` → `configured:false`,
 * persistencia por tenant, el endpoint GET/PUT y el pass-through de
 * `senderAccountId` en `contactPartnerLeads`.
 */
import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { NextApiRequest, NextApiResponse } from "next";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sancho-sender-accounts-"));
process.env.MC_WORKSPACE = tmp;
delete process.env.LOCAL_DASHBOARD_BYPASS;
fs.writeFileSync(
  path.join(tmp, "clients.json"),
  JSON.stringify({
    clients: [
      {
        slug: "acme",
        name: "Acme",
        active: true,
        mcToken: "acme-token-1234567890",
      },
    ],
    adminToken: "admin-token-1234567890",
  }),
);

// Imports dinámicos: DESPUÉS de fijar MC_WORKSPACE (los módulos capturan
// BASE/paths al cargar — un import estático se hoistearía antes del env).
const lib = await import("../sender-accounts");
const contactLib = await import("../contact");
const route = await import("../../../pages/api/partnerships/sender-accounts");

// ── fetch mock (fuente Yalc) ─────────────────────────────────────────────

const realFetch = globalThis.fetch;
let fetchCalls: Array<{ pathname: string; search: string; body: unknown }> = [];

function mockFetch(
  respond: (pathname: string) => { status: number; body: unknown },
) {
  globalThis.fetch = (async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    const url = new URL(String(input));
    fetchCalls.push({
      pathname: url.pathname,
      search: url.search,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const out = respond(url.pathname);
    return {
      ok: out.status >= 200 && out.status < 300,
      status: out.status,
      statusText: out.status === 200 ? "OK" : "Not Found",
      headers: {
        get: (name: string) =>
          name.toLowerCase() === "content-type" ? "application/json" : null,
      },
      json: async () => out.body,
      text: async () => JSON.stringify(out.body),
    } as unknown as Response;
  }) as typeof fetch;
}

const YALC_ACCOUNTS = {
  ok: true,
  accounts: [
    {
      account_id: "unipile-ig-1",
      type: "INSTAGRAM",
      name: "Martin Fila",
      status: "OK",
    },
    {
      id: "unipile-li-1",
      provider: "linkedin",
      display_name: "Martin Fila",
      state: "CREDENTIALS_ERROR",
    },
  ],
};

beforeEach(() => {
  fetchCalls = [];
  globalThis.fetch = realFetch;
  delete process.env.YALC_BASE_URL;
  delete process.env.YALC_API_TOKEN;
  delete process.env.ACME_YALC_BASE_URL;
  delete process.env.UNIPILE_SENDER_ACCOUNTS;
  delete process.env.ACME_UNIPILE_SENDER_ACCOUNTS;
});

after(() => {
  globalThis.fetch = realFetch;
  fs.rmSync(tmp, { recursive: true, force: true });
});

// ── Normalización ────────────────────────────────────────────────────────

test("normaliza cuentas desde array, {accounts} y {items} con campos tolerantes", () => {
  const fromAccounts = lib.normalizeSenderAccounts(YALC_ACCOUNTS);
  assert.deepEqual(fromAccounts, [
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
  ]);

  const fromItems = lib.normalizeSenderAccounts({
    items: [{ accountId: "a1", network: "IG", username: "@martin" }],
  });
  assert.deepEqual(fromItems, [
    { id: "a1", provider: "instagram", label: "@martin", status: "unknown" },
  ]);

  const fromArray = lib.normalizeSenderAccounts([
    { id: "li-9", provider: "LINKEDIN" },
  ]);
  assert.deepEqual(fromArray, [
    { id: "li-9", provider: "linkedin", label: "li-9", status: "unknown" },
  ]);
});

test("descarta filas sin id, proveedores no soportados y duplicados", () => {
  const accounts = lib.normalizeSenderAccounts({
    accounts: [
      { provider: "instagram", name: "sin id" },
      { id: "wa-1", provider: "whatsapp", name: "no soportado" },
      { id: "ig-1", provider: "instagram", name: "primera" },
      { id: "ig-1", provider: "instagram", name: "duplicada" },
      "no-es-un-objeto",
      null,
    ],
  });
  assert.deepEqual(accounts, [
    { id: "ig-1", provider: "instagram", label: "primera", status: "unknown" },
  ]);
});

// ── listSenderAccounts (Yalc → config → none) ────────────────────────────

test("lista desde Yalc cuando /api/unipile/accounts responde (tenant-scoped)", async () => {
  process.env.YALC_BASE_URL = "http://yalc.test";
  mockFetch((pathname) =>
    pathname === "/api/unipile/accounts"
      ? { status: 200, body: YALC_ACCOUNTS }
      : { status: 404, body: { error: "not found" } },
  );

  const result = await lib.listSenderAccounts("acme");
  assert.equal(result.source, "yalc");
  assert.equal(result.configured, true);
  assert.equal(result.accounts.length, 2);
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].pathname, "/api/unipile/accounts");
  assert.match(fetchCalls[0].search, /tenant=acme/);
});

test("degrada a UNIPILE_SENDER_ACCOUNTS cuando el daemon no expone el endpoint", async () => {
  process.env.YALC_BASE_URL = "http://yalc.test";
  process.env.UNIPILE_SENDER_ACCOUNTS = JSON.stringify([
    { id: "cfg-ig", provider: "instagram", label: "Martin Fila", status: "connected" },
    { id: "cfg-li", provider: "linkedin", label: "Martin Fila", status: "connected" },
  ]);
  mockFetch(() => ({ status: 404, body: { error: "Cannot GET" } }));

  const result = await lib.listSenderAccounts("acme");
  assert.equal(result.source, "config");
  assert.equal(result.configured, true);
  assert.deepEqual(
    result.accounts.map((account) => account.id),
    ["cfg-ig", "cfg-li"],
  );
  assert.ok(result.yalcError, "conserva el error de Yalc como informativo");
});

test("sin Yalc y sin config responde configured:false sin tocar la red", async () => {
  mockFetch(() => ({ status: 500, body: {} }));
  const result = await lib.listSenderAccounts("acme");
  assert.deepEqual(result, {
    configured: false,
    source: "none",
    accounts: [],
    yalcError: undefined,
  });
  assert.equal(fetchCalls.length, 0);
});

// ── Persistencia por tenant ──────────────────────────────────────────────

test("la selección persiste por tenant en brand/{slug}/outreach/settings.json", () => {
  assert.equal(lib.getSenderAccountSelection("acme"), null);
  assert.equal(lib.saveSenderAccountSelection("acme", "unipile-ig-1"), "unipile-ig-1");
  assert.equal(lib.getSenderAccountSelection("acme"), "unipile-ig-1");
  assert.ok(
    fs.existsSync(path.join(tmp, "brand", "acme", "outreach", "settings.json")),
  );
  // Otro tenant no ve la selección.
  assert.equal(lib.getSenderAccountSelection("otro"), null);
  // null limpia (vuelve a la cuenta por defecto de Yalc).
  assert.equal(lib.saveSenderAccountSelection("acme", null), null);
  assert.equal(lib.getSenderAccountSelection("acme"), null);
});

// ── Endpoint GET/PUT ─────────────────────────────────────────────────────

function response() {
  let statusCode = 200;
  let payload: unknown;
  const res = {
    setHeader() {
      return this;
    },
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(value: unknown) {
      payload = value;
      return this;
    },
  } as unknown as NextApiResponse;
  return { res, read: () => ({ statusCode, payload }) };
}

function request(
  method: string,
  query: NextApiRequest["query"],
  body?: unknown,
): NextApiRequest {
  return {
    method,
    query,
    body,
    headers: {
      host: "example.test",
      authorization: "Bearer admin-token-1234567890",
    },
  } as unknown as NextApiRequest;
}

test("GET devuelve cuentas + selección; PUT persiste y valida", async () => {
  process.env.UNIPILE_SENDER_ACCOUNTS = JSON.stringify([
    { id: "cfg-ig", provider: "instagram", label: "Martin Fila", status: "connected" },
    { id: "cfg-li", provider: "linkedin", label: "Martin Fila", status: "connected" },
  ]);

  const put = response();
  await route.default(
    request("PUT", { slug: "acme" }, { senderAccountId: "cfg-li" }),
    put.res,
  );
  assert.equal(put.read().statusCode, 200);
  assert.deepEqual(put.read().payload, { ok: true, selectedAccountId: "cfg-li" });

  const get = response();
  await route.default(request("GET", { slug: "acme" }), get.res);
  const payload = get.read().payload as {
    ok: boolean;
    configured: boolean;
    source: string;
    accounts: Array<{ id: string; provider: string }>;
    selectedAccountId: string | null;
  };
  assert.equal(get.read().statusCode, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.configured, true);
  assert.equal(payload.source, "config");
  assert.deepEqual(
    payload.accounts.map((account) => account.provider),
    ["instagram", "linkedin"],
  );
  assert.equal(payload.selectedAccountId, "cfg-li");

  const bad = response();
  await route.default(
    request("PUT", { slug: "acme" }, { senderAccountId: 7 }),
    bad.res,
  );
  assert.equal(bad.read().statusCode, 400);

  const clear = response();
  await route.default(
    request("PUT", { slug: "acme" }, { senderAccountId: null }),
    clear.res,
  );
  assert.deepEqual(clear.read().payload, { ok: true, selectedAccountId: null });
});

test("el endpoint exige auth y slug", async () => {
  const anon = response();
  await route.default(
    {
      method: "GET",
      query: { slug: "acme" },
      headers: { host: "example.test" },
    } as unknown as NextApiRequest,
    anon.res,
  );
  assert.equal(anon.read().statusCode, 403);

  const noSlug = response();
  await route.default(request("GET", {}), noSlug.res);
  assert.equal(noSlug.read().statusCode, 400);
});

// ── Pass-through de senderAccountId en el contacto ───────────────────────

async function runContact(senderAccountId?: string) {
  process.env.YALC_BASE_URL = "http://yalc.test";
  mockFetch((pathname) => {
    if (pathname === "/api/campaigns/camp-1") {
      return { status: 200, body: { id: "camp-1", type: "Partnerships" } };
    }
    if (pathname === "/api/campaigns/camp-1/partner-contact") {
      return {
        status: 200,
        body: {
          ok: true,
          runId: "run-1",
          gateId: "approve-send",
          prompt: "Aprobar envío",
          queuedLeads: 1,
          dryRun: true,
          drafts: [
            {
              leadId: "lead-1",
              displayName: "@creator",
              steps: [{ body: "Hola", delayDays: 0 }],
            },
          ],
        },
      };
    }
    return { status: 404, body: { error: "not found" } };
  });

  await contactLib.contactPartnerLeads({
    slug: "acme",
    leads: [{ id: "lead-1", campaignId: "camp-1" }],
    sequence: [{ body: "Hola", delayDays: 0 }],
    ...(senderAccountId ? { senderAccountId } : {}),
  });
  return fetchCalls.find(
    (call) => call.pathname === "/api/campaigns/camp-1/partner-contact",
  );
}

test("contactPartnerLeads propaga senderAccountId a Yalc (contrato hacia delante)", async () => {
  const call = await runContact("unipile-ig-1");
  assert.ok(call, "llegó el POST partner-contact");
  assert.equal(
    (call!.body as { senderAccountId?: string }).senderAccountId,
    "unipile-ig-1",
  );
});

test("sin selección el payload de partner-contact no incluye senderAccountId", async () => {
  const call = await runContact();
  assert.ok(call, "llegó el POST partner-contact");
  assert.equal("senderAccountId" in (call!.body as object), false);
});
