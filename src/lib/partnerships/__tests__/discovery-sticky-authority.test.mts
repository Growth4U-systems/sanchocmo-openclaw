import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { after, before, test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { NextApiRequest, NextApiResponse } from "next";
import type { DiscoverySearchRecord } from "../discovery-types";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sancho-sticky-authority-"));
process.env.MC_WORKSPACE = tmp;
process.env.OPENCLAW_HOME = tmp;
process.env.MC_TASKS_BACKEND = "json";
process.env.PARTNERSHIPS_DISCOVERY_V2_SLUGS = "hospital-capilar";
process.env.PARTNERSHIPS_DISCOVERY_ARTIFACT_STORE =
  "local-persistent-single-host";
process.env.YALC_BASE_URL = "http://yalc.invalid";

type PartnershipsModule = typeof import("../index");
type PolicyModule = typeof import("../discovery-execution-policy");
type McpModule = typeof import("@/lib/mcp/server");
let partnerships: PartnershipsModule;
let policy: PolicyModule;
let mcp: McpModule;
let searchesHandler: (
  req: NextApiRequest,
  res: NextApiResponse,
) => Promise<void>;
let runHandler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>;
let dispatchHandler: (
  req: NextApiRequest,
  res: NextApiResponse,
) => Promise<void>;

function stickySearch(
  id: string,
  overrides: Partial<DiscoverySearchRecord> = {},
): DiscoverySearchRecord {
  return {
    id,
    slug: "hospital-capilar",
    commandId: `command-${id}`,
    executionIntent: "fixtures",
    executionControl: {
      mode: "canary",
      admittedAt: "2026-07-16T10:00:00.000Z",
      generation: 1,
      runId: `run-${id}`,
    },
    title: "Salud capilar",
    plan: {
      title: "Salud capilar",
      sectors: ["salud capilar"],
      networks: ["instagram"],
      tiers: ["micro"],
      targetVolume: 1,
    },
    campaignId: `campaign-${id}`,
    projectId: null,
    taskId: null,
    threadId: null,
    runner: {
      status: "queued",
      mode: "fixtures",
      jobId: `partnerships.discovery:${id}`,
      attempts: 1,
      queuedAt: "2026-07-16T10:00:00.000Z",
      startedAt: null,
      finishedAt: null,
      error: null,
      stats: null,
    },
    createdAt: "2026-07-16T10:00:00.000Z",
    updatedAt: "2026-07-16T10:00:00.000Z",
    ...overrides,
  };
}

function responseCapture(): {
  response: NextApiResponse;
  read: () => { status: number; payload: unknown };
} {
  let status = 200;
  let payload: unknown;
  const response = {
    headersSent: false,
    setHeader() {},
    status(code: number) {
      status = code;
      return this;
    },
    json(value: unknown) {
      payload = value;
      this.headersSent = true;
      return this;
    },
  } as unknown as NextApiResponse;
  return { response, read: () => ({ status, payload }) };
}

function request(
  method: string,
  url: string,
  query: Record<string, string>,
  body: Record<string, unknown> = {},
): NextApiRequest {
  return {
    method,
    url,
    query,
    body,
    headers: { "x-admin-token": "sticky-admin" },
  } as unknown as NextApiRequest;
}

before(async () => {
  fs.writeFileSync(
    path.join(tmp, "clients.json"),
    JSON.stringify({
      clients: [
        { slug: "hospital-capilar", name: "Hospital Capilar", active: true },
      ],
      adminToken: "sticky-admin",
    }),
  );
  partnerships = await import("../index");
  policy = await import("../discovery-execution-policy");
  searchesHandler = (await import("@/pages/api/partnerships/searches")).default;
  runHandler = (await import("@/pages/api/partnerships/searches/[id]/run"))
    .default;
  dispatchHandler = (
    await import("@/pages/api/partnerships/searches/[id]/dispatch")
  ).default;
  mcp = await import("@/lib/mcp/server");
});

after(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("off and invalid flags never return a Ledger generation to legacy execution", async () => {
  for (const mode of ["off", "definitely-invalid"]) {
    process.env.PARTNERSHIPS_DISCOVERY_EXECUTION_V2 = mode;
    const id = mode === "off" ? "ds-sticky-off" : "ds-sticky-invalid";
    const original = partnerships.saveSearch(stickySearch(id));

    await assert.rejects(
      () =>
        partnerships.runDiscoverySearch({
          slug: original.slug,
          searchId: original.id,
          fixtures: true,
        }),
      (error: unknown) =>
        error instanceof policy.DiscoveryDurableAuthorityError,
    );
    assert.throws(
      () =>
        partnerships.enqueueDiscoverySearchRun({
          slug: original.slug,
          searchId: original.id,
          fixtures: true,
        }),
      (error: unknown) =>
        error instanceof policy.DiscoveryDurableAuthorityError,
    );
    await assert.rejects(
      () =>
        partnerships.requestDiscoverySearchRun({
          slug: original.slug,
          searchId: original.id,
          fixtures: true,
        }),
      (error: unknown) =>
        error instanceof policy.DiscoveryDurableAuthorityError,
    );
    await assert.rejects(
      () =>
        partnerships.triggerDiscoveryRunner({
          slug: original.slug,
          searchId: original.id,
        }),
      (error: unknown) =>
        error instanceof policy.DiscoveryDurableAuthorityError,
    );

    assert.deepEqual(
      await partnerships.resumeQueuedDiscoverySearches(original.slug),
      [],
    );
    const after = partnerships.getSearch(original.slug, original.id);
    assert.equal(
      after?.executionControl?.runId,
      original.executionControl?.runId,
    );
    assert.equal(after?.executionControl?.generation, 1);
    assert.equal(after?.runner.attempts, 1);
  }
});

test("GET, run and dispatch keep sticky authority when rollout config is invalid", async () => {
  process.env.PARTNERSHIPS_DISCOVERY_EXECUTION_V2 = "invalid-mode";
  const id = "ds-sticky-http";
  partnerships.saveSearch(stickySearch(id));

  const listing = responseCapture();
  await searchesHandler(
    request("GET", "/api/partnerships/searches?slug=hospital-capilar", {
      slug: "hospital-capilar",
    }),
    listing.response,
  );
  assert.equal(listing.read().status, 200);
  assert.deepEqual(
    (listing.read().payload as { resumed?: string[] }).resumed,
    [],
  );

  const run = responseCapture();
  await runHandler(
    request(
      "POST",
      `/api/partnerships/searches/${id}/run?slug=hospital-capilar`,
      { slug: "hospital-capilar", id },
      { async: true, fixtures: true },
    ),
    run.response,
  );
  assert.equal(run.read().status, 503);
  assert.equal(
    (run.read().payload as { code?: string }).code,
    "DISCOVERY_DURABLE_AUTHORITY_UNAVAILABLE",
  );

  const dispatch = responseCapture();
  await dispatchHandler(
    request(
      "POST",
      `/api/partnerships/searches/${id}/dispatch?slug=hospital-capilar`,
      { slug: "hospital-capilar", id },
    ),
    dispatch.response,
  );
  assert.equal(dispatch.read().status, 409);
  assert.equal(
    (dispatch.read().payload as { code?: string }).code,
    "DISCOVERY_CANARY_AGENT_DISPATCH_DISABLED",
  );

  const after = partnerships.getSearch("hospital-capilar", id);
  assert.equal(after?.executionControl?.generation, 1);
  assert.equal(after?.runner.attempts, 1);
});

test("the CLI polls but never directly executes a sticky search after flag-off", () => {
  process.env.PARTNERSHIPS_DISCOVERY_EXECUTION_V2 = "off";
  const id = "ds-sticky-cli";
  partnerships.saveSearch(stickySearch(id));
  const result = spawnSync(
    "npx",
    [
      "tsx",
      "scripts/run-discovery-search.mts",
      "--slug",
      "hospital-capilar",
      "--search",
      id,
      "--fixtures",
      "--wait-ms",
      "0",
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, PARTNERSHIPS_DISCOVERY_EXECUTION_V2: "off" },
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 2);
  assert.match(
    `${result.stdout}\n${result.stderr}`,
    /Runner durable aún pendiente/i,
  );
  assert.equal(
    partnerships.getSearch("hospital-capilar", id)?.runner.status,
    "queued",
  );
});

test("MCP sticky replay fails closed without its exact Ledger and performs no legacy effect", async () => {
  process.env.PARTNERSHIPS_DISCOVERY_EXECUTION_V2 = "invalid-mode";
  const commandId = "sticky-mcp-command";
  const id = `ds-${createHash("sha256")
    .update(`hospital-capilar\u0000${commandId}`)
    .digest("hex")
    .slice(0, 20)}`;
  partnerships.saveSearch(
    stickySearch(id, {
      commandId,
      executionIntent: "fixtures",
    }),
  );

  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; method: string }> = [];
  globalThis.fetch = (async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => {
    calls.push({
      url: String(input),
      method: String(init?.method ?? "GET").toUpperCase(),
    });
    return new Response(JSON.stringify({ ok: true, overrides: {} }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  const server = mcp.createSanchoMcpServer({
    principal: {
      id: "sticky-test",
      scopes: ["yalc:write"],
      clients: ["hospital-capilar"],
      tokenHash: "sticky-hash",
    },
    traceId: "sticky-mcp-trace",
  });
  const client = new Client({ name: "sticky-test", version: "1.0.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const result = await client.callTool({
      name: "yalc_create_search",
      arguments: {
        clientSlug: "hospital-capilar",
        title: "Salud capilar",
        sectors: ["salud capilar"],
        networks: ["instagram"],
        tiers: ["micro"],
        targetVolume: 1,
        commandId,
        runFixtures: true,
        dryRun: false,
        confirm: true,
      },
    });
    assert.equal(result.isError, true);
    const errorText =
      result.content[0]?.type === "text" ? result.content[0].text : "";
    assert.match(errorText, /DATABASE_URL|durable|Ledger/i);
    assert.equal(
      calls.some((call) => call.method !== "GET"),
      false,
    );
    assert.equal(
      partnerships.getSearch("hospital-capilar", id)?.runner.attempts,
      1,
    );
  } finally {
    globalThis.fetch = originalFetch;
    await client.close();
    await server.close();
  }
});
