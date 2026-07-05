import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

const { OutboundCommandError, dispatchOutboundCommand } = await import("../yalc/outbound-command");

type FetchCall = {
  url: string;
  method: string;
  body: unknown;
};

const originalFetch = globalThis.fetch;
const originalEnv = {
  YALC_BASE_URL: process.env.YALC_BASE_URL,
  YALC_API_TOKEN: process.env.YALC_API_TOKEN,
};

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
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    const call = { url, method: init?.method || "GET", body };
    calls.push(call);
    return jsonResponse(handler(parsed.pathname, call));
  }) as typeof fetch;
}

beforeEach(() => {
  process.env.YALC_BASE_URL = "http://yalc.test";
  process.env.YALC_API_TOKEN = "tok";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  calls = [];
  if (originalEnv.YALC_BASE_URL === undefined) delete process.env.YALC_BASE_URL;
  else process.env.YALC_BASE_URL = originalEnv.YALC_BASE_URL;
  if (originalEnv.YALC_API_TOKEN === undefined) delete process.env.YALC_API_TOKEN;
  else process.env.YALC_API_TOKEN = originalEnv.YALC_API_TOKEN;
});

const config = { baseUrl: "http://yalc.test", token: "tok", slug: "growth4u" };

test("outbound.plan creates a typed YALC campaign draft", async () => {
  installFetch((path, call) => {
    assert.equal(path, "/api/campaigns");
    assert.equal(call.method, "POST");
    return { id: "camp-1", title: "Fintech podcasts" };
  });

  const result = await dispatchOutboundCommand(config, {
    command: "outbound.plan",
    campaignType: "Partnerships",
    goal: "Find fintech podcast partners",
    target: { sector: "fintech", country: "ES" },
    channels: ["email"],
  });

  assert.equal(result.httpStatus, 201);
  assert.equal(result.campaignId, "camp-1");
  assert.equal(calls[0].url, "http://yalc.test/api/campaigns?tenant=growth4u");
  assert.deepEqual((calls[0].body as Record<string, unknown>).channels, ["email"]);
  assert.equal((calls[0].body as Record<string, unknown>).type, "Partnerships");
  assert.equal((calls[0].body as Record<string, unknown>).source, "outbound.command");
});

test("outbound.source manual creator writes through leads/assign and preserves creator fields", async () => {
  installFetch((path, call) => {
    assert.equal(path, "/api/campaigns/camp-creator/leads/assign");
    assert.equal(call.method, "POST");
    const body = call.body as { leads: Array<Record<string, unknown>>; profileKind: string; provider: string };
    assert.equal(body.profileKind, "creator");
    assert.equal(body.provider, "manual");
    assert.equal(body.leads[0].handle, "@finanzasconlucia");
    assert.equal(body.leads[0].network, "Instagram");
    return { ok: true, leads: body.leads };
  });

  const result = await dispatchOutboundCommand(config, {
    command: "outbound.source",
    campaignId: "camp-creator",
    profileKind: "creator",
    provider: "manual",
    criteria: {
      leads: [{ id: "lead-1", handle: "@finanzasconlucia", network: "Instagram", qualityScore: 87 }],
    },
  });

  assert.equal(result.httpStatus, 201);
  assert.equal(result.profileKind, "creator");
  assert.equal(calls.length, 1);
});

test("outbound.source provider B2B checks campaign lock before leads/search", async () => {
  installFetch((path, call) => {
    if (path === "/api/campaigns/camp-b2b") return { id: "camp-b2b", type: "B2B" };
    if (path === "/api/leads") return { leads: [] };
    if (path === "/api/campaigns/camp-b2b/leads/search") {
      assert.equal(call.method, "POST");
      assert.equal((call.body as Record<string, unknown>).provider, "apollo");
      assert.equal((call.body as Record<string, unknown>).profileKind, "b2b_contact");
      return { ok: true, providerRunId: "run-1" };
    }
    throw new Error(`Unexpected path ${path}`);
  });

  const result = await dispatchOutboundCommand(config, {
    command: "outbound.source",
    campaignId: "camp-b2b",
    profileKind: "b2b_contact",
    provider: "apollo",
    criteria: { titles: ["CMO"] },
    limit: 25,
  });

  assert.equal(result.provider, "apollo");
  assert.deepEqual(calls.map((call) => new URL(call.url).pathname), [
    "/api/campaigns/camp-b2b",
    "/api/leads",
    "/api/campaigns/camp-b2b/leads/search",
  ]);
});

test("outbound.status aggregates campaign, readiness, events, leads and provider runs", async () => {
  installFetch((path) => {
    if (path === "/api/campaigns/camp-1") return { id: "camp-1", type: "B2B" };
    if (path === "/api/campaigns/camp-1/leads") return { leads: [{ id: "l1" }, { id: "l2" }] };
    if (path === "/api/campaigns/camp-1/readiness") return { ready: true, providerRuns: [{ id: "ready-run" }] };
    if (path === "/api/campaigns/camp-1/events") return { events: [{ type: "apollo.search", id: "evt-1" }] };
    throw new Error(`Unexpected path ${path}`);
  });

  const result = await dispatchOutboundCommand(config, {
    command: "outbound.status",
    campaignId: "camp-1",
  });

  assert.equal(result.leadsCount, 2);
  assert.equal(result.campaignKind, "b2b");
  assert.equal((result.providerRuns as unknown[]).length, 2);
});

test("outbound.approve_and_publish approves then runs a dry-run by default", async () => {
  installFetch((path, call) => {
    if (path === "/api/campaigns/camp-creator") return { id: "camp-creator", type: "Partnerships" };
    if (path === "/api/campaigns/camp-creator/sequence/approve") {
      assert.equal(call.method, "POST");
      assert.equal((call.body as Record<string, unknown>).profileKind, "creator");
      return { approved: true };
    }
    if (path === "/api/campaigns/camp-creator/dry-run") {
      assert.equal(call.method, "POST");
      assert.equal((call.body as Record<string, unknown>).confirmDryRun, true);
      assert.equal((call.body as Record<string, unknown>).dryRun, true);
      return { dryRun: true, leads: 3 };
    }
    throw new Error(`Unexpected path ${path}`);
  });

  const result = await dispatchOutboundCommand(config, {
    command: "outbound.approve_and_publish",
    campaignId: "camp-creator",
    channel: "email",
    profileKind: "creator",
  });

  assert.equal(result.dryRun, true);
  assert.deepEqual(calls.map((call) => new URL(call.url).pathname), [
    "/api/campaigns/camp-creator",
    "/api/campaigns/camp-creator/sequence/approve",
    "/api/campaigns/camp-creator/dry-run",
  ]);
});

test("outbound.enrich fails loud for entity-only mode until entity store lands in this repo", async () => {
  await assert.rejects(
    dispatchOutboundCommand(config, {
      command: "outbound.enrich",
      entityIds: ["person-1"],
      providers: ["apollo"],
    }),
    (err) => err instanceof OutboundCommandError && err.status === 501,
  );
});
