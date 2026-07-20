/**
 * Sales-engine drill-down (SAN-326): live GHL reads behind
 * /api/metrics/sales-engine-leads. Covers the pure fetch layer (mocked fetch —
 * bucket filtering, joins, paging caps, shapes) and the route contract
 * (validation, not-connected, 502 on provider failure, no key leakage).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { NextApiRequest, NextApiResponse } from "next";
import type { RequestContext } from "../api-middleware";

// Isolate the workspace and strip global GHL credentials BEFORE importing
// anything that captures BASE / reads brand env.
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "sales-engine-leads-"));
process.env.MC_WORKSPACE = workspace;
for (const key of [
  "GHL_API_KEY",
  "GHL_PRIVATE_INTEGRATION_TOKEN",
  "GHL_APIKEY",
  "GOHIGHLEVEL_API_KEY",
  "GHL_LOCATION_ID",
]) {
  delete process.env[key];
}

const dataMod = await import("../data/sales-engine-leads");
const { fetchSalesEngineLeads, SalesEngineGhlError, zonedRangeBounds } =
  (dataMod as unknown as { default: typeof dataMod }).default ?? dataMod;
// The route's default export is the composed handler (a function), so unwrap
// only the named raw handler here.
const { salesEngineLeadsHandler } = await import("../../pages/api/metrics/sales-engine-leads");

type FetchInit = { method?: string; headers?: Record<string, string>; body?: string };
type FetchCall = { url: string; init?: FetchInit };

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function fakeFetch(
  route: (url: string, init?: FetchInit) => { body: unknown; status?: number },
  calls: FetchCall[] = [],
) {
  return async (url: string, init?: FetchInit) => {
    calls.push({ url, init });
    const matched = route(url, init);
    return jsonResponse(matched.body, matched.status ?? 200);
  };
}

const API_KEY = "pit-secret-test-key";

test("zonedRangeBounds cubre el rango inclusivo en la zona del location", () => {
  const bounds = zonedRangeBounds("2026-07-01", "2026-07-02", "UTC");
  assert.equal(bounds.fromIso, "2026-07-01T00:00:00.000Z");
  assert.equal(bounds.toIso, "2026-07-02T23:59:59.999Z");
  // Madrid (UTC+2 en verano): la medianoche local cae a las 22:00Z del día previo.
  const madrid = zonedRangeBounds("2026-07-01", "2026-07-01", "Europe/Madrid");
  assert.equal(madrid.fromIso, "2026-06-30T22:00:00.000Z");
});

test("leads: filtra por bucket con el colapso de canal del adapter y pagina", async () => {
  const pageOne = Array.from({ length: 100 }, (_, index) => ({
    contactName: `Lead ${index}`,
    email: `lead${index}@example.com`,
    companyName: "ACME",
    source: index % 2 === 0 ? "Explee AutoGTM" : "google / organic",
    dateAdded: `2026-07-${String(1 + (index % 19)).padStart(2, "0")}T10:00:00.000Z`,
  }));
  const pageTwo = Array.from({ length: 5 }, (_, index) => ({
    contactName: `Tail ${index}`,
    email: `tail${index}@example.com`,
    companyName: "ACME",
    source: "Explee AutoGTM",
    dateAdded: "2026-07-19T12:00:00.000Z",
  }));
  const calls: FetchCall[] = [];
  const result = await fetchSalesEngineLeads({
    stage: "leads",
    bucket: "email",
    from: "2026-07-01",
    to: "2026-07-19",
    locationId: "loc-1",
    apiKey: API_KEY,
    timezone: "UTC",
    fetchImpl: fakeFetch((url, init) => {
      assert.match(url, /contacts\/search$/);
      const body = JSON.parse(init?.body ?? "{}");
      return { body: { contacts: body.page === 1 ? pageOne : pageTwo } };
    }, calls),
  });

  // 50 Explee de la página 1 + 5 de la 2; el resto es bucket web y queda fuera.
  assert.equal(result.total, 55);
  assert.equal(result.rows.length, 55);
  assert.equal(result.truncated, false);
  assert.ok(result.rows.every((row) => row.source === "Explee AutoGTM"));
  // Orden: más recientes primero.
  const dates = result.rows.map((row) => row.date);
  assert.deepEqual(dates, [...dates].sort().reverse());

  // El filtro server-side usa dateAdded range con los límites del día local.
  const firstBody = JSON.parse(calls[0].init?.body ?? "{}");
  assert.deepEqual(firstBody.filters, [{
    field: "dateAdded",
    operator: "range",
    value: { gte: "2026-07-01T00:00:00.000Z", lte: "2026-07-19T23:59:59.999Z" },
  }]);
});

test("meetings: join contactId→contacto con caché y 404 = Unknown", async () => {
  const calls: FetchCall[] = [];
  const result = await fetchSalesEngineLeads({
    stage: "meetings",
    bucket: "linkedin",
    from: "2026-07-01",
    to: "2026-07-19",
    locationId: "loc-1",
    apiKey: API_KEY,
    timezone: "UTC",
    fetchImpl: async (url: string, init?: FetchInit) => {
      calls.push({ url, init });
      if (/\/calendars\/\?/.test(url)) return jsonResponse({ calendars: [{ id: "cal-1" }] });
      if (/\/calendars\/events/.test(url)) {
        return jsonResponse({
          events: [
            { contactId: "c1", startTime: "2026-07-18T09:00:00.000Z", appointmentStatus: "confirmed" },
            { contactId: "c1", startTime: "2026-07-19T09:00:00.000Z", appointmentStatus: "showed" },
            { contactId: "c-deleted", startTime: "2026-07-19T11:00:00.000Z" },
          ],
        });
      }
      if (/\/contacts\/c1$/.test(url)) {
        return jsonResponse({
          contact: {
            contactName: "Sofía LinkedIn",
            email: "sofia@example.com",
            source: "LinkedIn Outreach",
          },
        });
      }
      if (/\/contacts\/c-deleted$/.test(url)) return jsonResponse({}, 404);
      throw new Error(`unexpected URL ${url}`);
    },
  });

  // Dos eventos del contacto LinkedIn entran; el contacto borrado es Unknown→Otros.
  assert.equal(result.total, 2);
  assert.deepEqual(result.rows.map((row) => row.status), ["showed", "confirmed"]);
  assert.equal(result.rows[0].source, "LinkedIn Outreach");
  // La caché del join: c1 se consulta una sola vez.
  assert.equal(calls.filter((call) => /\/contacts\/c1$/.test(call.url)).length, 1);
});

test("opportunities: fechas MM-DD-YYYY, nombre de etapa y valor monetario", async () => {
  const calls: FetchCall[] = [];
  const result = await fetchSalesEngineLeads({
    stage: "opportunities",
    bucket: "paid",
    from: "2026-07-01",
    to: "2026-07-19",
    locationId: "loc-1",
    apiKey: API_KEY,
    fetchImpl: async (url: string, init?: FetchInit) => {
      calls.push({ url, init });
      if (/opportunities\/pipelines/.test(url)) {
        return jsonResponse({ pipelines: [{ stages: [{ id: "s1", name: "Cualificado" }] }] });
      }
      if (/opportunities\/search/.test(url)) {
        return jsonResponse({
          opportunities: [
            {
              contact: { id: "c-paid" },
              createdAt: "2026-07-18T08:00:00.000Z",
              monetaryValue: 1000,
              pipelineStageId: "s1",
            },
            {
              contact: { id: "c-web" },
              createdAt: "2026-07-17T08:00:00.000Z",
              monetaryValue: 400,
              pipelineStageId: "s1",
            },
          ],
        });
      }
      if (/\/contacts\/c-paid$/.test(url)) {
        return jsonResponse({ contact: { contactName: "Paid Lead", source: "google / cpc" } });
      }
      if (/\/contacts\/c-web$/.test(url)) {
        return jsonResponse({ contact: { contactName: "Web Lead", source: "website form" } });
      }
      throw new Error(`unexpected URL ${url}`);
    },
  });

  assert.equal(result.total, 1);
  assert.equal(result.rows[0].name, "Paid Lead");
  assert.equal(result.rows[0].pipelineStage, "Cualificado");
  assert.equal(result.rows[0].monetaryValue, 1000);
  const searchCall = calls.find((call) => /opportunities\/search/.test(call.url));
  assert.ok(searchCall);
  assert.match(searchCall.url, /date=07-01-2026&endDate=07-19-2026/);
  assert.match(searchCall.url, /status=all/);
});

test("won: stock del CRM sin filtro de fechas y solo status won", async () => {
  const result = await fetchSalesEngineLeads({
    stage: "won",
    bucket: null,
    locationId: "loc-1",
    apiKey: API_KEY,
    fetchImpl: async (url: string) => {
      if (/opportunities\/pipelines/.test(url)) return jsonResponse({ pipelines: [] });
      if (/opportunities\/search/.test(url)) {
        assert.match(url, /status=won/);
        assert.doesNotMatch(url, /date=/);
        return jsonResponse({
          opportunities: [
            { status: "won", contact: { id: "c1" }, monetaryValue: 5000, createdAt: "2026-06-01T00:00:00.000Z" },
            { status: "open", contact: { id: "c2" }, monetaryValue: 900, createdAt: "2026-06-02T00:00:00.000Z" },
          ],
        });
      }
      if (/\/contacts\/c1$/.test(url)) {
        return jsonResponse({ contact: { contactName: "Ganado", source: "Explee AutoGTM" } });
      }
      throw new Error(`unexpected URL ${url}`);
    },
  });

  assert.equal(result.total, 1);
  assert.equal(result.rows[0].monetaryValue, 5000);
  assert.equal(result.rows[0].source, "Explee AutoGTM");
});

test("un fallo de GHL se convierte en SalesEngineGhlError sin filtrar la key", async () => {
  await assert.rejects(
    fetchSalesEngineLeads({
      stage: "leads",
      bucket: null,
      from: "2026-07-01",
      to: "2026-07-19",
      locationId: "loc-1",
      apiKey: API_KEY,
      timezone: "UTC",
      fetchImpl: async () => jsonResponse({ message: "unauthorized" }, 401),
    }),
    (error: unknown) => {
      assert.ok(error instanceof SalesEngineGhlError);
      assert.match((error as Error).message, /401/);
      assert.doesNotMatch((error as Error).message, new RegExp(API_KEY));
      return true;
    },
  );
});

// ── Route contract ───────────────────────────────────────────────────────────

const admin: RequestContext = {
  isAdmin: true,
  clientSlug: null,
  allowedSlugs: null,
  adminToken: null,
  portalClient: null,
};

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

async function invoke(query: NextApiRequest["query"]) {
  const mocked = response();
  await salesEngineLeadsHandler(
    { method: "GET", query, headers: {}, ctx: admin } as unknown as NextApiRequest,
    mocked.res,
  );
  return mocked.read();
}

test("la ruta valida stage, bucket y fechas antes de tocar GHL", async () => {
  const badStage = await invoke({ slug: "acme", stage: "ganadas" });
  assert.equal(badStage.statusCode, 400);
  assert.match(String((badStage.payload as { error?: string }).error), /stage must be one of/);

  const badBucket = await invoke({ slug: "acme", stage: "leads", bucket: "madeup", from: "2026-07-01", to: "2026-07-19" });
  assert.equal(badBucket.statusCode, 400);
  assert.match(String((badBucket.payload as { error?: string }).error), /Invalid bucket/);

  const missingDates = await invoke({ slug: "acme", stage: "leads" });
  assert.equal(missingDates.statusCode, 400);
  assert.match(String((missingDates.payload as { error?: string }).error), /from and to/);

  const reversed = await invoke({ slug: "acme", stage: "leads", from: "2026-07-19", to: "2026-07-01" });
  assert.equal(reversed.statusCode, 400);
});

test("sin credenciales GHL la ruta responde 400 configured:false (no 500)", async () => {
  const result = await invoke({
    slug: "acme-desconectado",
    stage: "leads",
    from: "2026-07-01",
    to: "2026-07-19",
  });
  assert.equal(result.statusCode, 400);
  assert.deepEqual(
    result.payload,
    {
      configured: false,
      error: "GoHighLevel no está conectado para este cliente (falta API key o Location ID)",
    },
  );
});

function seedConnectedBrand(slug: string) {
  const brandDir = path.join(workspace, "brand", slug);
  fs.mkdirSync(brandDir, { recursive: true });
  fs.writeFileSync(
    path.join(brandDir, "integrations.json"),
    JSON.stringify({
      dataSources: {
        ghl: { status: "connected", config: { locationId: "loc-e2e", timezone: "UTC" } },
      },
    }),
  );
  fs.writeFileSync(
    path.join(brandDir, ".env"),
    `${slug.replace(/-/g, "_").toUpperCase()}_GHL_API_KEY=${API_KEY}\n`,
  );
}

test("ruta e2e: credenciales de brand + GHL vivo → lista con contrato estable", async () => {
  seedConnectedBrand("acme");
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: unknown, init?: unknown) => {
    const target = String(url);
    const request = init as FetchInit | undefined;
    assert.equal(request?.headers?.Authorization, `Bearer ${API_KEY}`);
    if (/contacts\/search$/.test(target)) {
      return jsonResponse({
        contacts: [
          {
            contactName: "Hoy Mismo",
            email: "hoy@example.com",
            companyName: "Explee",
            source: "Explee AutoGTM",
            dateAdded: "2026-07-20T09:00:00.000Z",
          },
          {
            contactName: "Orgánico",
            email: "org@example.com",
            source: "google / organic",
            dateAdded: "2026-07-19T09:00:00.000Z",
          },
        ],
      });
    }
    throw new Error(`unexpected URL ${target}`);
  }) as typeof fetch;
  try {
    const result = await invoke({
      slug: "acme",
      stage: "leads",
      bucket: "email",
      from: "2026-07-01",
      to: "2026-07-20",
    });
    assert.equal(result.statusCode, 200);
    const payload = result.payload as {
      configured: boolean;
      source: string;
      total: number;
      truncated: boolean;
      rows: Array<Record<string, unknown>>;
    };
    assert.equal(payload.configured, true);
    assert.equal(payload.source, "ghl-live");
    assert.equal(payload.total, 1);
    assert.equal(payload.truncated, false);
    assert.deepEqual(payload.rows, [{
      name: "Hoy Mismo",
      email: "hoy@example.com",
      companyName: "Explee",
      source: "Explee AutoGTM",
      date: "2026-07-20T09:00:00.000Z",
    }]);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("ruta e2e: fallo del proveedor → 502 con mensaje claro y sin la key", async () => {
  seedConnectedBrand("acme");
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => jsonResponse({ message: "boom" }, 503)) as typeof fetch;
  try {
    const result = await invoke({
      slug: "acme",
      stage: "leads",
      from: "2026-07-01",
      to: "2026-07-20",
    });
    assert.equal(result.statusCode, 502);
    const message = String((result.payload as { error?: string }).error);
    assert.match(message, /GoHighLevel respondió HTTP 503/);
    assert.doesNotMatch(message, new RegExp(API_KEY));
  } finally {
    globalThis.fetch = realFetch;
  }
});
