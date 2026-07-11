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
  OUTREACH_B2B: process.env.OUTREACH_B2B,
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
  process.env.OUTREACH_B2B = "on";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  calls = [];
  if (originalEnv.YALC_BASE_URL === undefined) delete process.env.YALC_BASE_URL;
  else process.env.YALC_BASE_URL = originalEnv.YALC_BASE_URL;
  if (originalEnv.YALC_API_TOKEN === undefined) delete process.env.YALC_API_TOKEN;
  else process.env.YALC_API_TOKEN = originalEnv.YALC_API_TOKEN;
  if (originalEnv.OUTREACH_B2B === undefined) delete process.env.OUTREACH_B2B;
  else process.env.OUTREACH_B2B = originalEnv.OUTREACH_B2B;
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

test("outbound.source company-db normalizes B2B contacts into the shared YALC lead roster", async () => {
  installFetch((path, call) => {
    if (path === "/api/campaigns/camp-b2b") return { id: "camp-b2b", type: "B2B" };
    if (path === "/api/leads") return { leads: [] };
    if (path === "/api/campaigns/camp-b2b/leads/assign") {
      assert.equal(call.method, "POST");
      const body = call.body as { provider: string; leads: Array<Record<string, unknown>> };
      assert.equal(body.provider, "company-db");
      assert.equal(body.leads[0].company, "Acme");
      assert.equal(body.leads[0].firstName, "Ana");
      assert.equal(body.leads[0].source, "company-db");
      return { ok: true, leads: body.leads };
    }
    throw new Error(`Unexpected path ${path}`);
  });

  const result = await dispatchOutboundCommand(config, {
    command: "outbound.source",
    campaignId: "camp-b2b",
    profileKind: "b2b_contact",
    provider: "company-db",
    criteria: {
      contacts: [{ company_name: "Acme", full_name: "Ana Gil", job_title: "CMO", email: "ana@acme.com" }],
    },
    searchId: "search-1",
  });

  assert.equal(result.httpStatus, 201);
  assert.equal(result.provider, "company-db");
  assert.equal(((result.result as Record<string, unknown>).stats as Record<string, unknown>).inserted, 1);
  assert.deepEqual(calls.map((call) => new URL(call.url).pathname), [
    "/api/campaigns/camp-b2b",
    "/api/leads",
    "/api/campaigns/camp-b2b/leads/assign",
  ]);
});

test("outbound.personalize persists campaign lead personalization through YALC", async () => {
  installFetch((path, call) => {
    if (path === "/api/campaigns/camp-b2b") return { id: "camp-b2b", type: "B2B" };
    if (path === "/api/leads") return { leads: [] };
    if (path === "/api/campaigns/camp-b2b/leads/personalize") {
      assert.equal(call.method, "POST");
      const body = call.body as Record<string, unknown>;
      assert.equal(body.channel, "linkedin");
      assert.equal(body.profileKind, "b2b_contact");
      assert.equal(body.enrichWithCrustdata, true);
      assert.equal(body.source, "outbound.command");
      return { ok: true, updated: 25 };
    }
    throw new Error(`Unexpected path ${path}`);
  });

  const result = await dispatchOutboundCommand(config, {
    command: "outbound.personalize",
    campaignId: "camp-b2b",
    profileKind: "b2b_contact",
    channel: "linkedin",
    enrichWithCrustdata: true,
    limit: 25,
  });

  assert.equal(result.campaignId, "camp-b2b");
  assert.deepEqual(calls.map((call) => new URL(call.url).pathname), [
    "/api/campaigns/camp-b2b",
    "/api/leads",
    "/api/campaigns/camp-b2b/leads/personalize",
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

test("outbound.linkedin_autopilot.plan delegates through the YALC command contract", async () => {
  installFetch((path, call) => {
    if (path === "/api/campaigns/camp-b2b") return { id: "camp-b2b", type: "B2B" };
    if (path === "/api/outbound/command") {
      assert.equal(call.method, "POST");
      const body = call.body as Record<string, unknown>;
      assert.equal(body.command, "outbound.linkedin_autopilot.plan");
      assert.equal(body.campaignId, "camp-b2b");
      assert.equal(body.expectedKind, "b2b");
      assert.deepEqual(body.leadIds, ["lead-1", "lead-2"]);
      return {
        ok: true,
        command: "outbound.linkedin_autopilot.plan",
        campaignId: "camp-b2b",
        plan: { summary: { total: 2, sendable: 2, connect: 1, dm: 1, blocked: 0 }, items: [] },
      };
    }
    throw new Error(`Unexpected path ${path}`);
  });

  const result = await dispatchOutboundCommand(config, {
    command: "outbound.linkedin_autopilot.plan",
    campaignId: "camp-b2b",
    leadIds: ["lead-1", "lead-2"],
  });

  assert.equal(result.campaignId, "camp-b2b");
  assert.equal((result.plan as Record<string, unknown> | undefined)?.summary !== undefined, true);
  assert.deepEqual(calls.map((call) => new URL(call.url).pathname), [
    "/api/campaigns/camp-b2b",
    "/api/outbound/command",
  ]);
});

test("outbound.linkedin_autopilot.execute forwards explicit live confirmation", async () => {
  installFetch((path, call) => {
    if (path === "/api/campaigns/camp-b2b") return { id: "camp-b2b", type: "B2B" };
    if (path === "/api/outbound/command") {
      assert.equal(call.method, "POST");
      const body = call.body as Record<string, unknown>;
      assert.equal(body.command, "outbound.linkedin_autopilot.execute");
      assert.equal(body.dryRun, false);
      assert.equal(body.confirmLinkedInSend, true);
      assert.deepEqual(body.accounts, [{ accountId: "acct-martin", label: "Martin" }]);
      return {
        ok: true,
        command: "outbound.linkedin_autopilot.execute",
        campaignId: "camp-b2b",
        mode: "live",
        summary: { sent: 1, failed: 0 },
      };
    }
    throw new Error(`Unexpected path ${path}`);
  });

  const result = await dispatchOutboundCommand(config, {
    command: "outbound.linkedin_autopilot.execute",
    campaignId: "camp-b2b",
    dryRun: false,
    confirmLinkedInSend: true,
    accounts: [{ accountId: "acct-martin", label: "Martin" }],
  });

  assert.equal(result.mode, "live");
  assert.deepEqual(calls.map((call) => new URL(call.url).pathname), [
    "/api/campaigns/camp-b2b",
    "/api/outbound/command",
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
