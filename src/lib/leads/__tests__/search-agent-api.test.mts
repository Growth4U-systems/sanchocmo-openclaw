import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import type { NextApiRequest, NextApiResponse } from "next";
import {
  createAgentLeadsSearchHandler,
  type AgentLeadsSearchRouteDependencies,
} from "../../../pages/api/runtime/leads-search";
import type { LeadsSearchAdmissionReceipt } from "../search-durable-worker";
import type { AgentRun } from "../../data/agent-runs";

const capability = "a".repeat(64);
const capabilitySha256 = createHash("sha256").update(capability).digest("hex");
const timestamp = new Date().toISOString();

function activeAgentRun(
  overrides: Partial<AgentRun> & { input?: unknown } = {},
): AgentRun {
  return {
    id: "arun-chat-001",
    threadId: "hospital-capilar:general",
    runtime: "openclaw",
    agent: "sancho",
    status: "running",
    input: {
      slug: "hospital-capilar",
      threadId: "hospital-capilar:general",
      userId: "mc-admin",
      userName: "Martin",
      isAdmin: true,
      senderRole: "admin",
      readOnly: false,
      controlDepth: 0,
      runtimeToolCapabilitySha256: capabilitySha256,
    },
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

const queuedReceipt: LeadsSearchAdmissionReceipt = {
  ok: true,
  operation: "leads.search",
  runId: "xrun-agent-1",
  status: "queued",
  created: true,
  replayed: false,
  completionBoundary: "ledger_admitted",
  statusUrl: "/api/leads/searches/xrun-agent-1?slug=hospital-capilar",
};

function response() {
  const state: {
    status: number;
    body?: unknown;
    headers: Record<string, string>;
  } = { status: 200, headers: {} };
  const res = {
    setHeader(name: string, value: string | number | readonly string[]) {
      state.headers[name.toLowerCase()] = String(value);
      return this;
    },
    status(code: number) {
      state.status = code;
      return this;
    },
    json(body: unknown) {
      state.body = body;
      return this;
    },
  } as unknown as NextApiResponse;
  return { state, res };
}

function request(overrides: Partial<NextApiRequest> = {}): NextApiRequest {
  return {
    method: "POST",
    query: {},
    headers: {
      "x-mc-secret": "runtime-secret",
      "x-mission-control-run-id": "arun-chat-001",
      "x-sancho-run-capability": capability,
    },
    body: {
      criteria: { titles: ["Marketing Director"] },
      limit: 5,
    },
    ...overrides,
  } as unknown as NextApiRequest;
}

function dependencies(
  overrides: Partial<AgentLeadsSearchRouteDependencies> = {},
): AgentLeadsSearchRouteDependencies {
  return {
    sharedSecret: () => "runtime-secret",
    clientExists: (slug) => slug === "hospital-capilar",
    resolveAgentRun: async (runId) =>
      runId === "arun-chat-001" ? activeAgentRun() : null,
    admit: async () => queuedReceipt,
    ...overrides,
  };
}

function bodyOf(state: { body?: unknown }): Record<string, unknown> {
  assert.ok(state.body && typeof state.body === "object");
  return state.body as Record<string, unknown>;
}

test("agent bridge is method-bounded and authenticates before any read or admission", async () => {
  let clientReads = 0;
  let admissions = 0;
  const handler = createAgentLeadsSearchHandler(
    dependencies({
      clientExists: (slug) => {
        clientReads += 1;
        return slug === "hospital-capilar";
      },
      admit: async () => {
        admissions += 1;
        return queuedReceipt;
      },
    }),
  );

  const method = response();
  await handler(request({ method: "DELETE" }), method.res);
  assert.equal(method.state.status, 405);
  assert.equal(method.state.headers.allow, "POST");

  for (const headers of [
    {},
    { "x-mc-secret": "wrong-secret" },
    {
      "x-mc-secret": "runtime-secret",
      "x-sancho-client-slug": "unknown-client",
      "x-mission-control-run-id": "arun-chat-001",
      "x-sancho-run-capability": capability,
    },
  ]) {
    const mocked = response();
    await handler(request({ headers }), mocked.res);
    assert.equal(mocked.state.status, 403);
  }

  assert.equal(
    clientReads,
    0,
    "legacy tenant claims are rejected before lookup",
  );
  assert.equal(admissions, 0);
});

test("POST derives tenant and idempotency anchor only from the persisted active run", async () => {
  const calls: Array<{ input: unknown; trustedOrigin: unknown }> = [];
  const handler = createAgentLeadsSearchHandler(
    dependencies({
      admit: async (input, admissionDependencies) => {
        calls.push({
          input,
          trustedOrigin: admissionDependencies?.trustedOrigin,
        });
        return queuedReceipt;
      },
    }),
  );

  const spoofed = response();
  await handler(
    request({
      body: {
        slug: "another-client",
        tenant: "another-client",
        requestId: "model-controlled",
        criteria: { titles: ["Marketing Director"] },
      },
    }),
    spoofed.res,
  );
  assert.equal(spoofed.state.status, 400);
  assert.equal(bodyOf(spoofed.state).error, "leads_search_body_invalid");
  assert.equal(calls.length, 0);

  const statusQuery = response();
  await handler(request({ query: { id: "xrun-agent-1" } }), statusQuery.res);
  assert.equal(statusQuery.state.status, 400);
  assert.equal(bodyOf(statusQuery.state).error, "leads_search_query_invalid");
  assert.equal(calls.length, 0);

  const accepted = response();
  await handler(request(), accepted.res);
  assert.equal(accepted.state.status, 202);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].input, {
    slug: "hospital-capilar",
    requestId: "mc-chat-e5a64ea43df09dbaa28c1bb6fdfbd29124a248faa189fb36",
    criteria: { titles: ["Marketing Director"] },
    limit: 5,
    traceId: accepted.state.headers["x-request-id"],
  });
  assert.deepEqual(calls[0].trustedOrigin, {
    schemaVersion: 1,
    kind: "mc_chat_parent_run",
    parentAgentRunId: "arun-chat-001",
  });
  const body = bodyOf(accepted.state);
  assert.equal(body.ok, true);
  assert.equal((body.search as Record<string, unknown>).statusUrl, undefined);
  assert.doesNotMatch(
    JSON.stringify(body),
    /runtime-secret|x-sancho-run-capability|apollo:\/\/tenant/i,
  );
});

test("POST accepts the exact durable dispatch lease without a legacy 35-minute capability", async () => {
  const parent = activeAgentRun({
    createdAt: "2025-01-01T00:00:00.000Z",
    input: {
      ...(activeAgentRun().input as Record<string, unknown>),
      runtimeDispatchMode: "ledger-v1",
      runtimeToolCapabilitySha256: undefined,
    },
  });
  let admissions = 0;
  let leaseInput: Record<string, unknown> | undefined;
  const handler = createAgentLeadsSearchHandler(
    dependencies({
      resolveAgentRun: async () => {
        throw new Error("legacy lookup must not authorize the durable turn");
      },
      authorizeDispatchLease: async (input) => {
        leaseInput = input;
        return { parentRun: parent };
      },
      admit: async () => {
        admissions += 1;
        return queuedReceipt;
      },
    }),
  );
  const mocked = response();
  await handler(
    request({
      headers: {
        "x-mc-secret": "runtime-secret",
        "x-mission-control-run-id": "arun-chat-001",
        "x-sancho-run-capability": capability,
        "x-sancho-dispatch-run-id": "dispatch-1",
        "x-sancho-dispatch-lease-token": "l".repeat(48),
      },
    }),
    mocked.res,
  );
  assert.equal(mocked.state.status, 202);
  assert.equal(admissions, 1);
  assert.deepEqual(leaseInput, {
    parentAgentRunId: "arun-chat-001",
    dispatchRunId: "dispatch-1",
    leaseToken: "l".repeat(48),
    runtimeToolCapability: capability,
    allowTerminalParent: undefined,
  });
});

test("POST never returns provider data when a replay is already terminal", async () => {
  const terminalReceipt: LeadsSearchAdmissionReceipt = {
    ...queuedReceipt,
    status: "completed",
    created: false,
    replayed: true,
    completionBoundary: "search_completed",
    result: {
      completionBoundary: "search_completed",
      provider: "apollo",
      candidates: [
        {
          providerId: "person-1",
          name: "Private Provider Name",
          title: "Marketing Director",
        },
      ],
      totalAvailable: 1,
      returned: 1,
      page: 1,
      nextPage: null,
      hasMore: false,
    },
  };
  const handler = createAgentLeadsSearchHandler(
    dependencies({ admit: async () => terminalReceipt }),
  );
  const mocked = response();
  await handler(request(), mocked.res);

  assert.equal(mocked.state.status, 200);
  const body = bodyOf(mocked.state);
  const search = body.search as Record<string, unknown>;
  assert.equal(search.status, "completed");
  assert.equal(search.result, undefined);
  assert.equal(search.statusUrl, undefined);
  assert.doesNotMatch(
    JSON.stringify(body),
    /Private Provider Name|person-1|apollo/i,
  );
});

test("missing, wrong, cross-run and stale capabilities cannot authorize provider admission", async () => {
  let admissions = 0;
  const runBToken = "b".repeat(64);
  const runBHash = createHash("sha256").update(runBToken).digest("hex");
  const runs = new Map<string, AgentRun>([
    ["arun-chat-001", activeAgentRun()],
    [
      "arun-chat-002",
      activeAgentRun({
        id: "arun-chat-002",
        input: {
          ...(activeAgentRun().input as Record<string, unknown>),
          runtimeToolCapabilitySha256: runBHash,
        },
      }),
    ],
    [
      "arun-terminal",
      activeAgentRun({ id: "arun-terminal", status: "completed" }),
    ],
    [
      "arun-expired",
      activeAgentRun({
        id: "arun-expired",
        createdAt: new Date(Date.now() - 36 * 60 * 1000).toISOString(),
      }),
    ],
  ]);
  const handler = createAgentLeadsSearchHandler(
    dependencies({
      resolveAgentRun: async (runId) => runs.get(runId) ?? null,
      admit: async () => {
        admissions += 1;
        return queuedReceipt;
      },
    }),
  );
  const rejectedHeaders = [
    {
      "x-mc-secret": "runtime-secret",
      "x-mission-control-run-id": "arun-chat-001",
    },
    {
      "x-mc-secret": "runtime-secret",
      "x-mission-control-run-id": "arun-chat-001",
      "x-sancho-run-capability": "f".repeat(64),
    },
    {
      "x-mc-secret": "runtime-secret",
      "x-mission-control-run-id": "arun-chat-002",
      "x-sancho-run-capability": capability,
    },
    {
      "x-mc-secret": "runtime-secret",
      "x-mission-control-run-id": "arun-terminal",
      "x-sancho-run-capability": capability,
    },
    {
      "x-mc-secret": "runtime-secret",
      "x-mission-control-run-id": "arun-expired",
      "x-sancho-run-capability": capability,
    },
  ];
  for (const headers of rejectedHeaders) {
    const mocked = response();
    await handler(request({ headers }), mocked.res);
    assert.equal(mocked.state.status, 403);
    assert.equal(
      bodyOf(mocked.state).error,
      "leads_search_agent_context_invalid",
    );
  }
  assert.equal(admissions, 0);
});

test("non-admin, read-only and cross-tenant persisted runs fail before Ledger mutation", async () => {
  let admissions = 0;
  const baseInput = activeAgentRun().input as Record<string, unknown>;
  const cases: AgentRun[] = [
    activeAgentRun({
      input: {
        ...baseInput,
        isAdmin: false,
        senderRole: "client",
        userId: "mc-client-hospital-capilar",
      },
    }),
    activeAgentRun({ input: { ...baseInput, readOnly: true } }),
    activeAgentRun({ input: { ...baseInput, controlDepth: 1 } }),
    activeAgentRun({ input: { ...baseInput, temporaryAgent: true } }),
    activeAgentRun({
      threadId: "other-client:general",
      input: { ...baseInput },
    }),
  ];
  for (const run of cases) {
    const handler = createAgentLeadsSearchHandler(
      dependencies({
        resolveAgentRun: async () => run,
        clientExists: () => true,
        admit: async () => {
          admissions += 1;
          return queuedReceipt;
        },
      }),
    );
    const mocked = response();
    await handler(request(), mocked.res);
    assert.equal(mocked.state.status, 403);
  }
  assert.equal(admissions, 0);
});

test("transport authentication stays bound to the admitted parent after secret rotation", async () => {
  const admittedSecret = "admitted-runtime-secret";
  const parent = activeAgentRun({
    input: {
      ...(activeAgentRun().input as Record<string, unknown>),
      runtimeTransportSecretSha256: createHash("sha256")
        .update(admittedSecret)
        .digest("hex"),
    },
  });
  let legacyLookups = 0;
  const handler = createAgentLeadsSearchHandler(
    dependencies({
      sharedSecret: () => {
        legacyLookups += 1;
        return "rotated-runtime-secret";
      },
      resolveAgentRun: async () => parent,
    }),
  );
  const mocked = response();
  await handler(
    request({
      headers: {
        ...request().headers,
        "x-mc-secret": admittedSecret,
      },
    }),
    mocked.res,
  );
  assert.equal(mocked.state.status, 202);
  assert.equal(legacyLookups, 0);
});

test("GET is not a model-facing status surface", async () => {
  let runReads = 0;
  let admissions = 0;
  const handler = createAgentLeadsSearchHandler(
    dependencies({
      resolveAgentRun: async () => {
        runReads += 1;
        return activeAgentRun();
      },
      admit: async () => {
        admissions += 1;
        return queuedReceipt;
      },
    }),
  );
  const mocked = response();
  await handler(
    request({
      method: "GET",
      query: { id: "xrun-agent-1" },
      body: undefined,
    }),
    mocked.res,
  );
  assert.equal(mocked.state.status, 405);
  assert.equal(mocked.state.headers.allow, "POST");
  assert.equal(bodyOf(mocked.state).error, "leads_search_method_not_allowed");
  assert.equal(runReads, 0);
  assert.equal(admissions, 0);
});

test("rollout, conflict, rate-limit and boot failures remain stable and fail closed", async () => {
  const cases = [
    [403, "leads_search_not_enabled"],
    [409, "execution_command_conflict"],
    [429, "leads_search_rate_limited"],
    [503, "leads_search_runtime_disabled"],
  ] as const;

  for (const [status, code] of cases) {
    const logs: string[] = [];
    const handler = createAgentLeadsSearchHandler(
      dependencies({
        admit: async () => {
          throw Object.assign(new Error("private apollo provider detail"), {
            name: "LeadsSearchError",
            status,
            code,
          });
        },
        logError: (message) => logs.push(message),
      }),
    );
    const mocked = response();
    await handler(request(), mocked.res);
    assert.equal(mocked.state.status, status);
    assert.equal(bodyOf(mocked.state).error, code);
    assert.doesNotMatch(JSON.stringify(mocked.state.body), /private|apollo/i);
    assert.equal(logs.length, status >= 500 ? 1 : 0);
    assert.doesNotMatch(logs.join("\n"), /private|apollo|runtime-secret/i);
  }
});
