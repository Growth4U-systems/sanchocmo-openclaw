/**
 * Sales-engine drill-down + live matrix counts (SAN-326): GHL reads behind
 * /api/metrics/sales-engine-leads. Covers the shared fetch layer (mocked fetch
 * — bucket filtering, joins, paging caps, shapes), the counts mode (lists and
 * counts agree on the same fixture BY CONSTRUCTION, truncation as honest lower
 * bounds, the 60s in-process cache) and the route contract (validation,
 * not-connected, 502 on provider failure, no key leakage).
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
const {
  clearSalesEngineCountsCache,
  fetchSalesEngineCounts,
  fetchSalesEngineCountsCached,
  fetchSalesEngineLeads,
  SalesEngineGhlError,
  zonedRangeBounds,
} = (dataMod as unknown as { default: typeof dataMod }).default ?? dataMod;
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

// ── Counts mode (SAN-326: matrix cells live from GHL) ────────────────────────

/**
 * One GHL world reused by counts mode AND every list read, so the tests can
 * assert the doctrine literally: each matrix cell equals the length of the
 * drill-down list behind it — same scans, same channel collapse.
 */
function ghlWorldFetch(calls: FetchCall[] = []) {
  const contactsById: Record<string, unknown> = {
    "c-linkedin": { contact: { contactName: "Sofía", email: "sofia@example.com", source: "LinkedIn Outreach" } },
    "c-email": { contact: { contactName: "Explee Guy", email: "guy@example.com", source: "Explee AutoGTM" } },
    "c-paid": { contact: { contactName: "Paid Guy", email: "paid@example.com", source: "google / cpc" } },
  };
  return async (url: string, init?: FetchInit) => {
    calls.push({ url, init });
    if (/contacts\/search$/.test(url)) {
      return jsonResponse({
        contacts: [
          { contactName: "Lead Email", email: "a@example.com", source: "Explee AutoGTM", dateAdded: "2026-07-18T10:00:00.000Z" },
          { contactName: "Lead Web", email: "b@example.com", source: "google / organic", dateAdded: "2026-07-17T10:00:00.000Z" },
          { contactName: "Lead LinkedIn", email: "c@example.com", source: "LinkedIn Outreach", dateAdded: "2026-07-16T10:00:00.000Z" },
          { contactName: "Lead Sin Origen", email: "d@example.com", dateAdded: "2026-07-15T10:00:00.000Z" },
        ],
      });
    }
    if (/\/calendars\/\?/.test(url)) return jsonResponse({ calendars: [{ id: "cal-1" }] });
    if (/\/calendars\/events/.test(url)) {
      return jsonResponse({
        events: [
          { contactId: "c-linkedin", startTime: "2026-07-18T09:00:00.000Z", appointmentStatus: "confirmed" },
          { contactId: "c-email", startTime: "2026-07-17T09:00:00.000Z", appointmentStatus: "showed" },
          { contactId: "c-deleted", startTime: "2026-07-16T09:00:00.000Z" },
        ],
      });
    }
    if (/opportunities\/pipelines/.test(url)) return jsonResponse({ pipelines: [] });
    if (/opportunities\/search/.test(url)) {
      if (/status=won/.test(url)) {
        return jsonResponse({
          opportunities: [
            { status: "won", contact: { id: "c-email" }, createdAt: "2026-06-01T00:00:00.000Z", monetaryValue: 5000 },
            { status: "won", contact: { id: "c-paid" }, createdAt: "2026-05-01T00:00:00.000Z", monetaryValue: 1500 },
            // Defensa: la API a veces devuelve estados mezclados — solo cuenta won.
            { status: "open", contact: { id: "c-linkedin" }, createdAt: "2026-05-02T00:00:00.000Z", monetaryValue: 900 },
          ],
        });
      }
      return jsonResponse({
        opportunities: [
          { contact: { id: "c-linkedin" }, createdAt: "2026-07-18T08:00:00.000Z", monetaryValue: 100 },
          { contact: { id: "c-paid" }, createdAt: "2026-07-17T08:00:00.000Z", monetaryValue: 250 },
          { status: "won", contact: { id: "c-email" }, createdAt: "2026-07-16T08:00:00.000Z", monetaryValue: 999 },
        ],
      });
    }
    const contactMatch = url.match(/\/contacts\/([^/?]+)$/);
    if (contactMatch) {
      const contact = contactsById[decodeURIComponent(contactMatch[1])];
      return contact ? jsonResponse(contact) : jsonResponse({}, 404);
    }
    throw new Error(`unexpected URL ${url}`);
  };
}

const COUNTS_WINDOW = { from: "2026-07-01", to: "2026-07-19" } as const;
const BUCKET_KEYS = ["web", "paid", "linkedin", "email", "trust", "otros"] as const;

test("counts: la matriz entera en una llamada, con la atribución del adapter", async () => {
  const counts = await fetchSalesEngineCounts({
    ...COUNTS_WINDOW,
    locationId: "loc-1",
    apiKey: API_KEY,
    timezone: "UTC",
    fetchImpl: ghlWorldFetch(),
  });

  const stage = (key: string) => {
    const found = counts.stages.find((item) => item.stage === key);
    assert.ok(found, key);
    return found;
  };
  assert.deepEqual(stage("leads").buckets, { web: 1, paid: 0, linkedin: 1, email: 1, trust: 0, otros: 1 });
  assert.equal(stage("leads").total, 4);
  assert.deepEqual(stage("meetings").buckets, { web: 0, paid: 0, linkedin: 1, email: 1, trust: 0, otros: 1 });
  assert.equal(stage("meetings").total, 3);
  assert.deepEqual(stage("opportunities").buckets, { web: 0, paid: 1, linkedin: 1, email: 1, trust: 0, otros: 0 });
  assert.equal(stage("opportunities").total, 3);
  // Won = stock del CRM con status won estricto (la fila open no cuenta).
  assert.deepEqual(stage("won").buckets, { web: 0, paid: 1, linkedin: 0, email: 1, trust: 0, otros: 0 });
  assert.equal(stage("won").total, 2);
  assert.deepEqual(counts.wonValue.buckets, { web: 0, paid: 1500, linkedin: 0, email: 5000, trust: 0, otros: 0 });
  assert.equal(counts.wonValue.total, 6500);
  assert.equal(counts.truncated, false);
  // Cada total es la suma de sus celdas — consistencia por construcción.
  for (const item of counts.stages) {
    assert.equal(Object.values(item.buckets).reduce((sum, value) => sum + value, 0), item.total);
  }
});

test("counts == listas: cada celda es exactamente el total del drill-down que abre", async () => {
  const counts = await fetchSalesEngineCounts({
    ...COUNTS_WINDOW,
    locationId: "loc-1",
    apiKey: API_KEY,
    timezone: "UTC",
    fetchImpl: ghlWorldFetch(),
  });

  for (const stageCounts of counts.stages) {
    for (const bucket of [null, ...BUCKET_KEYS] as const) {
      const list = await fetchSalesEngineLeads({
        stage: stageCounts.stage,
        bucket,
        ...COUNTS_WINDOW,
        locationId: "loc-1",
        apiKey: API_KEY,
        timezone: "UTC",
        fetchImpl: ghlWorldFetch(),
      });
      const expected = bucket == null ? stageCounts.total : stageCounts.buckets[bucket];
      assert.equal(
        list.total,
        expected,
        `${stageCounts.stage} × ${bucket ?? "total"}: lista ${list.total} ≠ celda ${expected}`,
      );
    }
  }
});

test("counts: un cap de paginación trunca honesto (cota inferior, no fallo)", async () => {
  const fullPage = Array.from({ length: 100 }, (_, index) => ({
    contactName: `Bulk ${index}`,
    email: `bulk${index}@example.com`,
    source: "Explee AutoGTM",
    dateAdded: "2026-07-18T10:00:00.000Z",
  }));
  const counts = await fetchSalesEngineCounts({
    ...COUNTS_WINDOW,
    locationId: "loc-1",
    apiKey: API_KEY,
    timezone: "UTC",
    limits: { contactsPageCap: 2 },
    fetchImpl: async (url: string) => {
      if (/contacts\/search$/.test(url)) return jsonResponse({ contacts: fullPage });
      if (/\/calendars\/\?/.test(url)) return jsonResponse({ calendars: [] });
      if (/opportunities\/search/.test(url)) return jsonResponse({ opportunities: [] });
      throw new Error(`unexpected URL ${url}`);
    },
  });
  const leads = counts.stages.find((item) => item.stage === "leads");
  assert.ok(leads);
  assert.equal(leads.total, 200);
  assert.equal(leads.truncated, true);
  assert.equal(counts.truncated, true);
  const meetings = counts.stages.find((item) => item.stage === "meetings");
  assert.equal(meetings?.truncated, false);
});

test("counts: el cap del join de contactos detiene el scan y marca truncated", async () => {
  const counts = await fetchSalesEngineCounts({
    ...COUNTS_WINDOW,
    locationId: "loc-1",
    apiKey: API_KEY,
    timezone: "UTC",
    limits: { contactJoinCap: 1 },
    fetchImpl: async (url: string) => {
      if (/contacts\/search$/.test(url)) return jsonResponse({ contacts: [] });
      if (/\/calendars\/\?/.test(url)) return jsonResponse({ calendars: [{ id: "cal-1" }] });
      if (/\/calendars\/events/.test(url)) {
        return jsonResponse({
          events: [
            { contactId: "c1", startTime: "2026-07-18T09:00:00.000Z" },
            { contactId: "c2", startTime: "2026-07-17T09:00:00.000Z" },
          ],
        });
      }
      if (/opportunities\/search/.test(url)) return jsonResponse({ opportunities: [] });
      if (/\/contacts\/c1$/.test(url)) return jsonResponse({ contact: { contactName: "Uno", source: "LinkedIn" } });
      throw new Error(`unexpected URL ${url}`);
    },
  });
  const meetings = counts.stages.find((item) => item.stage === "meetings");
  assert.ok(meetings);
  // Solo el primer contacto entró antes del cap: cota inferior honesta.
  assert.equal(meetings.total, 1);
  assert.equal(meetings.truncated, true);
  assert.equal(counts.truncated, true);
});

test("counts cache: TTL 60s por clave, dedupe en vuelo y errores sin cachear", async () => {
  clearSalesEngineCountsCache();
  let searches = 0;
  let failing = false;
  const fetchImpl = async (url: string) => {
    if (failing) return jsonResponse({ message: "boom" }, 503);
    if (/contacts\/search$/.test(url)) {
      searches += 1;
      return jsonResponse({ contacts: [] });
    }
    if (/\/calendars\/\?/.test(url)) return jsonResponse({ calendars: [] });
    if (/opportunities\/search/.test(url)) return jsonResponse({ opportunities: [] });
    throw new Error(`unexpected URL ${url}`);
  };
  let clock = 1_000_000;
  const now = () => clock;
  const query = { ...COUNTS_WINDOW, locationId: "loc-1", apiKey: API_KEY, timezone: "UTC" as const, fetchImpl };

  // Dos peticiones concurrentes comparten UNA lectura de GHL.
  await Promise.all([
    fetchSalesEngineCountsCached("acme|loc-1|w", query, now),
    fetchSalesEngineCountsCached("acme|loc-1|w", query, now),
  ]);
  assert.equal(searches, 1);

  // Dentro del TTL: hit; otra clave: miss; pasado el TTL: refetch.
  clock += 59_000;
  await fetchSalesEngineCountsCached("acme|loc-1|w", query, now);
  assert.equal(searches, 1);
  await fetchSalesEngineCountsCached("acme|loc-1|otro", query, now);
  assert.equal(searches, 2);
  clock += 2_000;
  await fetchSalesEngineCountsCached("acme|loc-1|w", query, now);
  assert.equal(searches, 3);

  // Un fallo del proveedor no queda cacheado: el siguiente intento reintenta.
  clock += 61_000;
  failing = true;
  await assert.rejects(
    fetchSalesEngineCountsCached("acme|loc-1|w", query, now),
    SalesEngineGhlError,
  );
  failing = false;
  await fetchSalesEngineCountsCached("acme|loc-1|w", query, now);
  assert.equal(searches, 4);
});

// ── Route contract: counts mode ──────────────────────────────────────────────

test("ruta counts: valida fechas y responde 200 configured:false sin credenciales", async () => {
  const missingDates = await invoke({ slug: "acme-desconectado", view: "counts" });
  assert.equal(missingDates.statusCode, 400);

  const badView = await invoke({ slug: "acme", view: "grid" });
  assert.equal(badView.statusCode, 400);

  const unconfigured = await invoke({
    slug: "acme-desconectado",
    view: "counts",
    from: "2026-07-01",
    to: "2026-07-19",
  });
  // 200 (no 400): "sin conectar" es un estado normal de la matriz, no un
  // error del caller — la UI muestra su prompt de conexión.
  assert.equal(unconfigured.statusCode, 200);
  const payload = unconfigured.payload as { configured: boolean; error?: string };
  assert.equal(payload.configured, false);
  assert.match(String(payload.error), /no está conectado/);
});

test("ruta e2e counts: matriz completa en una llamada y cacheada 60s", async () => {
  clearSalesEngineCountsCache();
  seedConnectedBrand("acme");
  const calls: FetchCall[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = ghlWorldFetch(calls) as unknown as typeof fetch;
  try {
    const result = await invoke({ slug: "acme", view: "counts", ...COUNTS_WINDOW });
    assert.equal(result.statusCode, 200);
    const payload = result.payload as {
      configured: boolean;
      source: string;
      from: string;
      to: string;
      truncated: boolean;
      stages: Array<{ stage: string; buckets: Record<string, number>; total: number; truncated: boolean }>;
      wonValue: { buckets: Record<string, number>; total: number; truncated: boolean };
    };
    assert.equal(payload.configured, true);
    assert.equal(payload.source, "ghl-live");
    assert.equal(payload.from, COUNTS_WINDOW.from);
    assert.equal(payload.to, COUNTS_WINDOW.to);
    assert.deepEqual(payload.stages.map((item) => item.stage), ["leads", "meetings", "opportunities", "won"]);
    assert.equal(payload.stages[0].total, 4);
    assert.equal(payload.stages[0].buckets.email, 1);
    assert.equal(payload.wonValue.total, 6500);
    assert.equal(payload.truncated, false);

    // Segunda petición dentro del TTL: servida desde caché, cero llamadas a GHL.
    const callsAfterFirst = calls.length;
    const cachedResult = await invoke({ slug: "acme", view: "counts", ...COUNTS_WINDOW });
    assert.equal(cachedResult.statusCode, 200);
    assert.equal(calls.length, callsAfterFirst);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("ruta counts: fallo del proveedor → 502 con mensaje claro y sin la key", async () => {
  clearSalesEngineCountsCache();
  seedConnectedBrand("acme");
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => jsonResponse({ message: "boom" }, 503)) as typeof fetch;
  try {
    const result = await invoke({ slug: "acme", view: "counts", from: "2026-07-02", to: "2026-07-19" });
    assert.equal(result.statusCode, 502);
    const message = String((result.payload as { error?: string }).error);
    assert.match(message, /GoHighLevel respondió HTTP 503/);
    assert.doesNotMatch(message, new RegExp(API_KEY));
  } finally {
    globalThis.fetch = realFetch;
  }
});
