import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

const { B2BIngestError, ingestB2BContacts } = await import("../b2b-ingest");

type FetchCall = {
  url: string;
  method: string;
  headers: Headers;
  body: unknown;
};

const originalFetch = globalThis.fetch;
const originalOutreachB2B = process.env.OUTREACH_B2B;
let calls: FetchCall[] = [];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function installFetch(handler: (path: string, call: FetchCall) => unknown) {
  calls = [];
  globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = String(input);
    const parsed = new URL(url);
    const headers = new Headers(init?.headers);
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    const call = { url, method: init?.method || "GET", headers, body };
    calls.push(call);
    return jsonResponse(handler(parsed.pathname, call));
  }) as typeof fetch;
}

beforeEach(() => {
  process.env.OUTREACH_B2B = "on";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  calls = [];
  if (originalOutreachB2B === undefined) delete process.env.OUTREACH_B2B;
  else process.env.OUTREACH_B2B = originalOutreachB2B;
});

const config = { baseUrl: "http://yalc.test", token: "tok", slug: "growth4u" };

test("ingestB2BContacts fails closed when OUTREACH_B2B is not enabled", async () => {
  delete process.env.OUTREACH_B2B;

  await assert.rejects(
    ingestB2BContacts(config, {
      campaignId: "camp-b2b",
      contacts: [{ company: "Acme", email: "ana@acme.com" }],
    }),
    (err) => err instanceof B2BIngestError && err.status === 403,
  );
});

test("ingestB2BContacts normalizes company-DB rows and assigns them to a B2B YALC campaign", async () => {
  installFetch((path, call) => {
    if (path === "/api/campaigns/camp-b2b") return { id: "camp-b2b", type: "B2B" };
    if (path === "/api/leads") return { leads: [] };
    if (path === "/api/campaigns/camp-b2b/leads/assign") {
      assert.equal(call.method, "POST");
      assert.equal(call.headers.get("Idempotency-Key"), "job-123");
      const body = call.body as {
        expectedKind: string;
        provider: string;
        profileKind: string;
        leads: Array<Record<string, unknown>>;
      };
      assert.equal(body.expectedKind, "b2b");
      assert.equal(body.provider, "company-db");
      assert.equal(body.profileKind, "b2b_contact");
      assert.equal(body.leads.length, 2);
      assert.equal(body.leads[0].company, "Acme");
      assert.equal(body.leads[0].firstName, "Ana");
      assert.equal(body.leads[0].source, "company-db");
      assert.equal((body.leads[0].provenance as Record<string, unknown>).searchId, "search-1");
      assert.equal((body.leads[0].scoreProvenance as Record<string, unknown>).operation, "b2b_fit_score");
      return { ok: true, leads: body.leads.slice(0, 1), dropped: [{ company: "Beta" }] };
    }
    throw new Error(`Unexpected path ${path}`);
  });

  const result = await ingestB2BContacts(config, {
    campaignId: "camp-b2b",
    contacts: [
      { company_name: "Acme", full_name: "Ana Gil", job_title: "CMO", email: "ana@acme.com", icp_score: 91 },
      { company: "Beta", linkedinUrl: "https://linkedin.com/in/beta" },
      { firstName: "Sin empresa" },
    ],
    searchId: "search-1",
    jobId: "job-123",
  });

  assert.deepEqual(result.stats, { candidates: 2, invalid: 1, inserted: 1, dropped: 1 });
  assert.deepEqual(calls.map((call) => new URL(call.url).pathname), [
    "/api/campaigns/camp-b2b",
    "/api/leads",
    "/api/campaigns/camp-b2b/leads/assign",
  ]);
  assert.ok(calls.every((call) => call.url.includes("tenant=growth4u")));
});
