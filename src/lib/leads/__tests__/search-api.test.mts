import assert from "node:assert/strict";
import { test } from "node:test";
import type { NextApiRequest, NextApiResponse } from "next";
import {
  LeadsSearchError,
  type LeadsSearchAdmissionReceipt,
  type LeadsSearchCancellationInput,
  type LeadsSearchCancellationReceipt,
  type LeadsSearchStatusReceipt,
} from "../search-durable-worker";
import type {
  LeadsSearchProjection,
  LeadsSearchProjectionPage,
} from "../search-projection";
import {
  createLeadsSearchesHandler,
  type LeadsSearchAdmissionInput,
} from "../../../pages/api/leads/searches/index";
import { createLeadsSearchDetailHandler } from "../../../pages/api/leads/searches/[id]";

interface MockResponseState {
  status: number;
  body?: unknown;
  headers: Record<string, string>;
}

function response() {
  const state: MockResponseState = { status: 200, headers: {} };
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

function request(input: {
  method: string;
  query?: NextApiRequest["query"];
  body?: unknown;
  headers?: NextApiRequest["headers"];
  identity?: { name: string | null; email: string | null };
}): NextApiRequest {
  return {
    method: input.method,
    query: input.query ?? {},
    body: input.body,
    headers: input.headers ?? {},
    ctx: {
      isAdmin: true,
      clientSlug: null,
      allowedSlugs: null,
      adminToken: null,
      portalClient: null,
      identity: input.identity ?? {
        name: "Martin Fila",
        email: "martin@example.test",
      },
    },
  } as unknown as NextApiRequest;
}

function projectedResult() {
  return {
    provider: "apollo" as const,
    candidates: [
      {
        providerId: "person-1",
        name: "Ada Lovelace",
        title: "CTO",
        organizationName: "Analytical Engines",
        organizationDomain: "engines.example",
      },
    ],
    totalAvailable: 1,
    returned: 1,
    page: 1 as const,
    nextPage: null,
    hasMore: false,
  };
}

function result() {
  return {
    completionBoundary: "search_completed" as const,
    ...projectedResult(),
  };
}

function projection(
  overrides: Partial<LeadsSearchProjection> = {},
): LeadsSearchProjection {
  return {
    tenantKey: "hospital-capilar",
    runId: "xrun-search-1",
    terminalStatus: "completed",
    candidateCount: 1,
    result: projectedResult(),
    projectionFingerprint: "a".repeat(64),
    projectedAt: "2026-07-16T08:00:00.000Z",
    ...overrides,
  };
}

function admission(
  overrides: Partial<LeadsSearchAdmissionReceipt> = {},
): LeadsSearchAdmissionReceipt {
  return {
    ok: true,
    operation: "leads.search",
    runId: "xrun-search-1",
    status: "queued",
    created: true,
    replayed: false,
    completionBoundary: "ledger_admitted",
    statusUrl: "/untrusted/status-url",
    ...overrides,
  };
}

function statusReceipt(
  overrides: Partial<LeadsSearchStatusReceipt> = {},
): LeadsSearchStatusReceipt {
  return {
    ok: true,
    operation: "leads.search",
    runId: "xrun-search-1",
    status: "completed",
    completionBoundary: "search_completed",
    statusUrl: "/untrusted/status-url",
    result: result(),
    ...overrides,
  };
}

function cancellation(
  overrides: Partial<LeadsSearchCancellationReceipt> = {},
): LeadsSearchCancellationReceipt {
  return {
    ok: true,
    operation: "leads.search",
    runId: "xrun-search-1",
    status: "running",
    disposition: "requested",
    replayed: false,
    statusUrl: "/untrusted/status-url",
    ...overrides,
  };
}

test("POST admits one bounded tenant-scoped search with exactly one request identity", async () => {
  const calls: LeadsSearchAdmissionInput[] = [];
  const handler = createLeadsSearchesHandler({
    admit: async (input) => {
      calls.push(input);
      return admission();
    },
    projections: { list: async () => ({ items: [] }) },
  });
  const mocked = response();
  await handler(
    request({
      method: "POST",
      query: { slug: "hospital-capilar" },
      headers: { "x-request-id": "trace-search-1" },
      body: {
        slug: "hospital-capilar",
        requestId: "chat-command-1",
        criteria: { titles: ["CTO"] },
        limit: 4,
      },
    }),
    mocked.res,
  );

  assert.equal(mocked.state.status, 202);
  assert.equal(mocked.state.headers["cache-control"], "private, no-store");
  assert.equal(mocked.state.headers["x-request-id"], "trace-search-1");
  assert.deepEqual(calls, [
    {
      slug: "hospital-capilar",
      requestId: "chat-command-1",
      criteria: { titles: ["CTO"] },
      limit: 4,
      traceId: "trace-search-1",
    },
  ]);
  const body = mocked.state.body as {
    traceId: string;
    search: Record<string, unknown>;
  };
  assert.equal(body.traceId, "trace-search-1");
  assert.equal(
    body.search.statusUrl,
    "/api/leads/searches/xrun-search-1?slug=hospital-capilar",
  );
  assert.equal(JSON.stringify(body).includes("untrusted/status-url"), false);
});

test("POST returns 200 for every sticky terminal replay and 202 while work is active", async () => {
  const cases = [
    {
      status: "completed",
      completionBoundary: "search_completed",
      result: result(),
      expectedHttpStatus: 200,
    },
    {
      status: "partial",
      completionBoundary: "ledger_admitted",
      expectedHttpStatus: 200,
    },
    {
      status: "failed",
      completionBoundary: "ledger_admitted",
      expectedHttpStatus: 200,
    },
    {
      status: "cancelled",
      completionBoundary: "ledger_admitted",
      expectedHttpStatus: 200,
    },
    {
      status: "queued",
      completionBoundary: "ledger_admitted",
      expectedHttpStatus: 202,
    },
    {
      status: "running",
      completionBoundary: "ledger_admitted",
      expectedHttpStatus: 202,
    },
  ] as const;

  for (const item of cases) {
    const handler = createLeadsSearchesHandler({
      admit: async () =>
        admission({
          status: item.status,
          created: false,
          replayed: true,
          completionBoundary: item.completionBoundary,
          ...(item.result ? { result: item.result } : {}),
        }),
      projections: { list: async () => ({ items: [] }) },
    });
    const mocked = response();
    await handler(
      request({
        method: "POST",
        query: { slug: "hospital-capilar" },
        body: {
          requestId: `sticky-${item.status}`,
          criteria: { query: "hair" },
        },
      }),
      mocked.res,
    );

    assert.equal(mocked.state.status, item.expectedHttpStatus, item.status);
    const body = mocked.state.body as {
      search: { status: string; replayed: boolean };
    };
    assert.equal(body.search.status, item.status);
    assert.equal(body.search.replayed, true);
  }
});

test("POST accepts the Idempotency-Key header but rejects zero, two, or unsafe command identities", async () => {
  const calls: LeadsSearchAdmissionInput[] = [];
  const handler = createLeadsSearchesHandler({
    admit: async (input) => {
      calls.push(input);
      return admission();
    },
    projections: { list: async () => ({ items: [] }) },
  });
  const base = {
    method: "POST",
    query: { slug: "hospital-capilar" },
  } as const;

  const headerOnly = response();
  await handler(
    request({
      ...base,
      headers: { "idempotency-key": "api-command-1" },
      body: { slug: "hospital-capilar", criteria: { query: "hair" } },
    }),
    headerOnly.res,
  );
  assert.equal(headerOnly.state.status, 202);
  assert.equal(calls[0].idempotencyKey, "api-command-1");
  assert.equal(calls[0].limit, 10);

  const cases = [
    {
      body: { slug: "hospital-capilar", criteria: { query: "hair" } },
      headers: {},
      code: "leads_search_request_id_required",
    },
    {
      body: {
        slug: "hospital-capilar",
        requestId: "body-id",
        criteria: { query: "hair" },
      },
      headers: { "idempotency-key": "header-id" },
      code: "leads_search_request_id_ambiguous",
    },
    {
      body: {
        slug: "hospital-capilar",
        requestId: "unsafe id",
        criteria: { query: "hair" },
      },
      headers: {},
      code: "leads_search_request_id_invalid",
    },
    {
      body: {
        slug: "hospital-capilar",
        requestId: "body-id",
        criteria: { query: "hair" },
        credentialRef: "apollo://forbidden",
      },
      headers: {},
      code: "leads_search_body_invalid",
    },
    {
      body: {
        slug: "another-tenant",
        requestId: "body-id",
        criteria: { query: "hair" },
      },
      headers: {},
      code: "leads_search_slug_invalid",
    },
  ];
  for (const item of cases) {
    const mocked = response();
    await handler(
      request({ ...base, body: item.body, headers: item.headers }),
      mocked.res,
    );
    assert.equal(mocked.state.status, 400, item.code);
    assert.equal(
      (mocked.state.body as { error: string }).error,
      item.code,
      item.code,
    );
  }
  assert.equal(calls.length, 1);
});

test("GET list is bounded, cursor-aware, tenant-scoped, and hides internal projection fields", async () => {
  const calls: unknown[] = [];
  const page: LeadsSearchProjectionPage = {
    items: [projection()],
    nextCursor: {
      projectedAt: "2026-07-16T08:00:00.000Z",
      runId: "xrun-search-1",
    },
  };
  const handler = createLeadsSearchesHandler({
    admit: async () => admission(),
    projections: {
      list: async (input) => {
        calls.push(input);
        return page;
      },
    },
  });
  const mocked = response();
  await handler(
    request({
      method: "GET",
      query: {
        slug: "hospital-capilar",
        limit: "2",
        beforeProjectedAt: "2026-07-16T09:00:00.000Z",
        beforeRunId: "xrun-search-2",
      },
      headers: { "x-request-id": "trace-list" },
    }),
    mocked.res,
  );
  assert.equal(mocked.state.status, 200);
  assert.deepEqual(calls, [
    {
      tenantKey: "hospital-capilar",
      limit: 2,
      before: {
        projectedAt: "2026-07-16T09:00:00.000Z",
        runId: "xrun-search-2",
      },
    },
  ]);
  const serialized = JSON.stringify(mocked.state.body);
  assert.equal(serialized.includes("projectionFingerprint"), false);
  assert.equal(serialized.includes("tenantKey"), false);
  const body = mocked.state.body as {
    page: { hasMore: boolean; nextCursor: unknown };
  };
  assert.equal(body.page.hasMore, true);
  assert.deepEqual(body.page.nextCursor, {
    beforeProjectedAt: "2026-07-16T08:00:00.000Z",
    beforeRunId: "xrun-search-1",
  });
});

test("list rejects malformed pagination before reading storage", async () => {
  let reads = 0;
  const handler = createLeadsSearchesHandler({
    admit: async () => admission(),
    projections: {
      list: async () => {
        reads += 1;
        return { items: [] };
      },
    },
  });
  for (const query of [
    { slug: "hospital-capilar", limit: "0" },
    { slug: "hospital-capilar", limit: "101" },
    { slug: "hospital-capilar", limit: "2.5" },
    { slug: "hospital-capilar", beforeRunId: "xrun-only" },
    {
      slug: "hospital-capilar",
      beforeRunId: "xrun-1",
      beforeProjectedAt: "not-a-date",
    },
  ]) {
    const mocked = response();
    await handler(request({ method: "GET", query }), mocked.res);
    assert.equal(mocked.state.status, 400, JSON.stringify(query));
  }
  assert.equal(reads, 0);
});

test("API errors return only a stable code and trace, never provider payloads", async () => {
  const logs: string[] = [];
  const handler = createLeadsSearchesHandler({
    admit: async () => {
      throw new Error("Authorization: Bearer private-provider-token");
    },
    projections: { list: async () => ({ items: [] }) },
    logError: (message) => logs.push(message),
  });
  const mocked = response();
  await handler(
    request({
      method: "POST",
      query: { slug: "hospital-capilar" },
      headers: { "x-request-id": "trace-error" },
      body: {
        requestId: "command-1",
        criteria: { query: "hair" },
      },
    }),
    mocked.res,
  );
  assert.equal(mocked.state.status, 503);
  assert.deepEqual(mocked.state.body, {
    error: "leads_search_unavailable",
    traceId: "trace-error",
  });
  assert.deepEqual(logs, [
    "[leads-search-api] admit failed traceId=trace-error",
  ]);
  assert.equal(
    JSON.stringify({ body: mocked.state.body, logs }).includes(
      "private-provider-token",
    ),
    false,
  );
});

test("GET detail joins exact-scope durable status with the immutable product projection", async () => {
  const statusCalls: unknown[] = [];
  const projectionCalls: unknown[] = [];
  const handler = createLeadsSearchDetailHandler({
    status: async (input) => {
      statusCalls.push(input);
      return statusReceipt();
    },
    cancel: async () => cancellation(),
    projections: {
      get: async (input) => {
        projectionCalls.push(input);
        return projection();
      },
    },
  });
  const mocked = response();
  await handler(
    request({
      method: "GET",
      query: { slug: "hospital-capilar", id: "xrun-search-1" },
      headers: { "x-request-id": "trace-detail" },
    }),
    mocked.res,
  );
  assert.equal(mocked.state.status, 200);
  assert.deepEqual(statusCalls, [
    { slug: "hospital-capilar", runId: "xrun-search-1" },
  ]);
  assert.deepEqual(projectionCalls, [
    { tenantKey: "hospital-capilar", runId: "xrun-search-1" },
  ]);
  const serialized = JSON.stringify(mocked.state.body);
  assert.equal(serialized.includes("projectionFingerprint"), false);
  assert.equal(serialized.includes("tenantKey"), false);
  assert.equal(serialized.includes("untrusted/status-url"), false);
  assert.equal(serialized.includes("Ada Lovelace"), true);
});

test("GET detail makes another tenant indistinguishable from a missing run", async () => {
  let projectionReads = 0;
  const handler = createLeadsSearchDetailHandler({
    status: async () => null,
    cancel: async () => null,
    projections: {
      get: async () => {
        projectionReads += 1;
        return projection({ tenantKey: "another-tenant" });
      },
    },
  });
  const mocked = response();
  await handler(
    request({
      method: "GET",
      query: { slug: "hospital-capilar", id: "xrun-other" },
    }),
    mocked.res,
  );
  assert.equal(mocked.state.status, 404);
  assert.equal(
    (mocked.state.body as { error: string }).error,
    "leads_search_not_found",
  );
  assert.equal(projectionReads, 0);
});

test("DELETE requests cooperative cancellation with a hashed authenticated actor", async () => {
  const calls: LeadsSearchCancellationInput[] = [];
  const handler = createLeadsSearchDetailHandler({
    status: async () => statusReceipt(),
    cancel: async (input) => {
      calls.push(input);
      return cancellation();
    },
    projections: { get: async () => null },
  });
  const mocked = response();
  await handler(
    request({
      method: "DELETE",
      query: { slug: "hospital-capilar", id: "xrun-search-1" },
      headers: {
        "idempotency-key": "cancel-command-1",
        "x-request-id": "trace-cancel",
      },
      body: { slug: "hospital-capilar" },
      identity: { name: "Martin Fila", email: "martin@example.test" },
    }),
    mocked.res,
  );
  assert.equal(mocked.state.status, 202);
  assert.equal(calls.length, 1);
  assert.deepEqual(
    {
      slug: calls[0].slug,
      runId: calls[0].runId,
      requestId: calls[0].requestId,
    },
    {
      slug: "hospital-capilar",
      runId: "xrun-search-1",
      requestId: "cancel-command-1",
    },
  );
  assert.match(calls[0].actorId, /^user_[a-f0-9]{40}$/);
  assert.equal(calls[0].actorId.includes("martin"), false);
  const serialized = JSON.stringify(mocked.state.body);
  assert.equal(serialized.includes("untrusted/status-url"), false);
  assert.equal(serialized.includes("martin@example.test"), false);
});

test("DELETE enforces one cancellation identity and preserves scoped conflicts", async () => {
  let cancels = 0;
  const handler = createLeadsSearchDetailHandler({
    status: async () => statusReceipt(),
    cancel: async () => {
      cancels += 1;
      throw new LeadsSearchError(
        "execution_cancellation_conflict",
        "private cancellation state",
        409,
      );
    },
    projections: { get: async () => null },
  });
  const base = {
    method: "DELETE",
    query: { slug: "hospital-capilar", id: "xrun-search-1" },
  } as const;
  for (const input of [
    { headers: {}, body: {} },
    {
      headers: { "idempotency-key": "header-id" },
      body: { requestId: "body-id" },
    },
  ]) {
    const mocked = response();
    await handler(request({ ...base, ...input }), mocked.res);
    assert.equal(mocked.state.status, 400);
  }
  assert.equal(cancels, 0);

  const conflict = response();
  await handler(
    request({
      ...base,
      body: { requestId: "cancel-1" },
      headers: { "x-request-id": "trace-conflict" },
    }),
    conflict.res,
  );
  assert.equal(conflict.state.status, 409);
  assert.deepEqual(conflict.state.body, {
    error: "execution_cancellation_conflict",
    traceId: "trace-conflict",
  });
  assert.equal(cancels, 1);
});

test("both routes reject unsupported methods with bounded no-store responses", async () => {
  const index = createLeadsSearchesHandler({
    admit: async () => admission(),
    projections: { list: async () => ({ items: [] }) },
  });
  const detail = createLeadsSearchDetailHandler({
    status: async () => statusReceipt(),
    cancel: async () => cancellation(),
    projections: { get: async () => null },
  });
  for (const [handler, req, allow] of [
    [
      index,
      request({ method: "PATCH", query: { slug: "hospital-capilar" } }),
      "GET, POST",
    ],
    [
      detail,
      request({
        method: "POST",
        query: { slug: "hospital-capilar", id: "xrun-search-1" },
      }),
      "GET, DELETE",
    ],
  ] as const) {
    const mocked = response();
    await handler(req, mocked.res);
    assert.equal(mocked.state.status, 405);
    assert.equal(mocked.state.headers.allow, allow);
    assert.equal(mocked.state.headers["cache-control"], "private, no-store");
  }
});

test("production exports are guarded by slug authentication before database work", async () => {
  const unwrapDefault = (value: unknown): unknown => {
    let current = value;
    for (let depth = 0; depth < 3; depth += 1) {
      if (typeof current === "function") return current;
      if (!current || typeof current !== "object" || !("default" in current)) {
        return current;
      }
      current = (current as { default: unknown }).default;
    }
    return current;
  };
  const indexModule = await import("../../../pages/api/leads/searches/index");
  const detailModule = await import("../../../pages/api/leads/searches/[id]");
  const leadsSearchesRoute = unwrapDefault(indexModule.default);
  const leadsSearchDetailRoute = unwrapDefault(detailModule.default);
  assert.equal(typeof leadsSearchesRoute, "function");
  assert.equal(typeof leadsSearchDetailRoute, "function");
  for (const [handler, req] of [
    [
      leadsSearchesRoute,
      request({
        method: "GET",
        query: { slug: "hospital-capilar" },
        headers: { "x-request-id": "trace-auth-list" },
      }),
    ],
    [
      leadsSearchDetailRoute,
      request({
        method: "GET",
        query: { slug: "hospital-capilar", id: "xrun-search-1" },
        headers: { "x-request-id": "trace-auth-detail" },
      }),
    ],
  ] as const) {
    // The direct factory tests above inject an authenticated context. Remove it
    // here so these calls exercise the composed withSlugAuth production export.
    delete (req as NextApiRequest & { ctx?: unknown }).ctx;
    const mocked = response();
    await (
      handler as (req: NextApiRequest, res: NextApiResponse) => Promise<void>
    )(req, mocked.res);
    assert.equal(mocked.state.status, 403);
    assert.equal(
      mocked.state.headers["x-request-id"].startsWith("trace-auth-"),
      true,
    );
  }
});
