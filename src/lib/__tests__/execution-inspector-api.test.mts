import assert from "node:assert/strict";
import { test } from "node:test";
import type { NextApiRequest, NextApiResponse } from "next";
import type {
  ExecutionControlReadRepository,
  ExecutionEventPage,
  ExecutionRun,
  ExecutionRunPage,
  ExecutionStepPage,
  ListExecutionEventsPageInput,
  ListExecutionRunsInput,
  ListExecutionStepsPageInput,
} from "../execution-control";
import { createExecutionRunsHandler } from "../../pages/api/admin/execution-runs/index";
import { createExecutionRunDetailHandler } from "../../pages/api/admin/execution-runs/[id]";

const ADMIN_SESSION = { user: { role: "admin" } } as const;
const CLIENT_SESSION = { user: { role: "client" } } as const;
const CURSOR_SECRET = "test-only-cursor-secret";

function run(overrides: Partial<ExecutionRun> = {}): ExecutionRun {
  return {
    id: "xrun_01",
    tenantKey: "growth4u",
    idempotencyKey: "growth4u:search-1:attempt-1",
    aggregateType: "partnerships.discovery",
    aggregateId: "growth4u:search-1",
    operation: "partners.search",
    mode: "shadow",
    status: "completed",
    currentStep: "persisted",
    traceId: "trace-01",
    input: { query: "hair care", token: "sk-secret-123456789" },
    output: { count: 4, email: "private@example.com" },
    error: "Authorization: Bearer secret-token-123456789",
    metadata: { source: "partnerships", apiKey: "sk-private-123456789" },
    createdAt: "2026-07-15T10:00:00.000Z",
    startedAt: "2026-07-15T10:00:01.000Z",
    finishedAt: "2026-07-15T10:00:02.000Z",
    updatedAt: "2026-07-15T10:00:02.000Z",
    ...overrides,
  };
}

interface RepositoryHarness {
  repository: ExecutionControlReadRepository;
  calls: {
    listRuns: ListExecutionRunsInput[];
    detail: Array<{ tenantKey: string; runId: string }>;
    steps: ListExecutionStepsPageInput[];
    events: ListExecutionEventsPageInput[];
  };
}

function repositoryHarness(
  options: {
    runsPage?: ExecutionRunPage;
    detailRun?: ExecutionRun | null;
    stepsPage?: ExecutionStepPage;
    eventsPage?: ExecutionEventPage;
  } = {},
): RepositoryHarness {
  const calls: RepositoryHarness["calls"] = {
    listRuns: [],
    detail: [],
    steps: [],
    events: [],
  };
  const repository: ExecutionControlReadRepository = {
    async listRuns(input) {
      calls.listRuns.push(input);
      return options.runsPage ?? { runs: [run()] };
    },
    async getRunByIdForTenant(tenantKey, runId) {
      calls.detail.push({ tenantKey, runId });
      return options.detailRun === undefined ? run() : options.detailRun;
    },
    async listStepsPage(input) {
      calls.steps.push(input);
      return options.stepsPage ?? { steps: [], truncated: false };
    },
    async listEventsPage(input) {
      calls.events.push(input);
      return options.eventsPage ?? { events: [] };
    },
  };
  return { repository, calls };
}

function response() {
  const state: {
    status: number;
    body?: unknown;
    headers: Record<string, string>;
  } = { status: 200, headers: {} };
  const res = {
    setHeader(name: string, value: string) {
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

function request(
  query: NextApiRequest["query"],
  method = "GET",
): NextApiRequest {
  return {
    method,
    query,
    headers: {},
  } as unknown as NextApiRequest;
}

test("execution inspector is NextAuth-session-only and admin-only", async () => {
  const harness = repositoryHarness();
  for (const authCase of [
    { name: "missing session", session: null, status: 401 },
    { name: "non-admin session", session: CLIENT_SESSION, status: 403 },
  ]) {
    const handler = createExecutionRunsHandler({
      repository: harness.repository,
      cursorSecret: CURSOR_SECRET,
      getSession: async () => authCase.session,
    });
    const mocked = response();
    const req = request({ tenantKey: "growth4u" });
    // Neither a legacy bearer nor a legacy middleware context grants access.
    req.headers.authorization = "Bearer legacy-admin-token";
    (req as NextApiRequest & { ctx?: unknown }).ctx = { isAdmin: true };
    await handler(req, mocked.res);
    assert.equal(mocked.state.status, authCase.status, authCase.name);
    assert.equal(
      mocked.state.headers["cache-control"],
      "private, no-store",
      authCase.name,
    );
  }
  assert.equal(harness.calls.listRuns.length, 0);
});

test("list validates exact tenant, filters, method, and hard page limit", async () => {
  const harness = repositoryHarness();
  const handler = createExecutionRunsHandler({
    repository: harness.repository,
    cursorSecret: CURSOR_SECRET,
    getSession: async () => ADMIN_SESSION,
  });

  for (const query of [
    {},
    { tenantKey: " growth4u" },
    { tenantKey: "Growth4u" },
    { tenantKey: "../growth4u" },
    { tenantKey: ["growth4u", "other"] },
    { tenantKey: "growth4u", status: "done" },
    { tenantKey: "growth4u", mode: "live" },
    { tenantKey: "growth4u", limit: "0" },
    { tenantKey: "growth4u", limit: "101" },
    { tenantKey: "growth4u", operation: "partners/search" },
  ]) {
    const mocked = response();
    await handler(request(query), mocked.res);
    assert.equal(mocked.state.status, 400, JSON.stringify(query));
  }
  assert.equal(harness.calls.listRuns.length, 0);

  const method = response();
  await handler(request({ tenantKey: "growth4u" }, "POST"), method.res);
  assert.equal(method.state.status, 405);
  assert.equal(method.state.headers.allow, "GET");
});

test("list exposes only whitelisted summary fields and passes exact filters", async () => {
  const harness = repositoryHarness({ runsPage: { runs: [run()] } });
  const handler = createExecutionRunsHandler({
    repository: harness.repository,
    cursorSecret: CURSOR_SECRET,
    getSession: async () => ADMIN_SESSION,
  });
  const mocked = response();
  await handler(
    request({
      tenantKey: "growth4u",
      operation: "partners.search",
      aggregateType: "partnerships.discovery",
      status: "completed",
      mode: "shadow",
      limit: "100",
    }),
    mocked.res,
  );

  assert.equal(mocked.state.status, 200);
  assert.deepEqual(harness.calls.listRuns, [
    {
      tenantKey: "growth4u",
      aggregateType: "partnerships.discovery",
      operation: "partners.search",
      status: "completed",
      mode: "shadow",
      limit: 100,
    },
  ]);
  const body = mocked.state.body as {
    runs: Array<Record<string, unknown>>;
    page: { limit: number; nextCursor: string | null; hasMore: boolean };
  };
  assert.equal(body.page.limit, 100);
  assert.equal(body.page.nextCursor, null);
  assert.equal(body.page.hasMore, false);
  const summary = body.runs[0];
  assert.equal(summary.id, "xrun_01");
  assert.equal(summary.hasError, true);
  for (const forbidden of [
    "input",
    "output",
    "metadata",
    "idempotencyKey",
    "error",
  ]) {
    assert.equal(forbidden in summary, false, forbidden);
  }
  const serialized = JSON.stringify(mocked.state.body);
  assert.equal(serialized.includes("hair care"), false);
  assert.equal(serialized.includes("private@example.com"), false);
  assert.equal(serialized.includes("growth4u:search-1:attempt-1"), false);
});

test("list fails closed if the repository returns a cross-tenant row", async () => {
  const leakedMarker = "other-tenant-private-marker";
  const harness = repositoryHarness({
    runsPage: {
      runs: [
        run({
          tenantKey: "other",
          aggregateId: leakedMarker,
        }),
      ],
    },
  });
  const logs: string[] = [];
  const handler = createExecutionRunsHandler({
    repository: harness.repository,
    cursorSecret: CURSOR_SECRET,
    getSession: async () => ADMIN_SESSION,
    logError: (message) => logs.push(message),
  });
  const mocked = response();
  await handler(request({ tenantKey: "growth4u" }), mocked.res);
  assert.equal(mocked.state.status, 500);
  assert.deepEqual(mocked.state.body, {
    error: "Execution inspector unavailable",
  });
  assert.equal(JSON.stringify(mocked.state.body).includes(leakedMarker), false);
  assert.deepEqual(logs, ["[execution-inspector] list read failed"]);
});

test("opaque list cursor is signed and bound to tenant and filters", async () => {
  const firstHarness = repositoryHarness({
    runsPage: {
      runs: [run()],
      nextBefore: { createdAt: "2026-07-15T10:00:00.000Z", id: "xrun_01" },
    },
  });
  const firstHandler = createExecutionRunsHandler({
    repository: firstHarness.repository,
    cursorSecret: CURSOR_SECRET,
    getSession: async () => ADMIN_SESSION,
  });
  const first = response();
  await firstHandler(
    request({
      tenantKey: "growth4u",
      operation: "partners.search",
      limit: "1",
    }),
    first.res,
  );
  const cursor = (
    first.state.body as {
      page: { nextCursor: string };
    }
  ).page.nextCursor;
  assert.ok(cursor.includes("."));
  assert.equal(cursor.includes("growth4u"), false);

  const secondHarness = repositoryHarness({ runsPage: { runs: [] } });
  const secondHandler = createExecutionRunsHandler({
    repository: secondHarness.repository,
    cursorSecret: CURSOR_SECRET,
    getSession: async () => ADMIN_SESSION,
  });
  const second = response();
  await secondHandler(
    request({
      tenantKey: "growth4u",
      operation: "partners.search",
      limit: "1",
      before: cursor,
    }),
    second.res,
  );
  assert.equal(second.state.status, 200);
  assert.deepEqual(secondHarness.calls.listRuns[0].before, {
    createdAt: "2026-07-15T10:00:00.000Z",
    id: "xrun_01",
  });

  for (const query of [
    { tenantKey: "other", operation: "partners.search", before: cursor },
    { tenantKey: "growth4u", operation: "leads.search", before: cursor },
    {
      tenantKey: "growth4u",
      operation: "partners.search",
      before: `${cursor.slice(0, -1)}x`,
    },
  ]) {
    const rejected = response();
    await secondHandler(request(query), rejected.res);
    assert.equal(rejected.state.status, 400, JSON.stringify(query));
  }
  assert.equal(secondHarness.calls.listRuns.length, 1);
});

test("detail returns 404 for missing or cross-tenant run without child reads", async () => {
  for (const detailRun of [null, run({ tenantKey: "other" })]) {
    const harness = repositoryHarness({ detailRun });
    const handler = createExecutionRunDetailHandler({
      repository: harness.repository,
      getSession: async () => ADMIN_SESSION,
    });
    const mocked = response();
    await handler(
      request({ tenantKey: "growth4u", id: "xrun_other_tenant" }),
      mocked.res,
    );
    assert.equal(mocked.state.status, 404);
    assert.deepEqual(harness.calls.detail, [
      { tenantKey: "growth4u", runId: "xrun_other_tenant" },
    ]);
    assert.equal(harness.calls.steps.length, 0);
    assert.equal(harness.calls.events.length, 0);
  }
});

test("detail is also NextAuth-session-only and rejects legacy admin context", async () => {
  const harness = repositoryHarness();
  for (const authCase of [
    { name: "missing session", session: null, status: 401 },
    { name: "non-admin session", session: CLIENT_SESSION, status: 403 },
  ]) {
    const handler = createExecutionRunDetailHandler({
      repository: harness.repository,
      getSession: async () => authCase.session,
    });
    const mocked = response();
    const req = request({ tenantKey: "growth4u", id: "xrun_01" });
    req.headers.authorization = "Bearer legacy-admin-token";
    (req as NextApiRequest & { ctx?: unknown }).ctx = { isAdmin: true };
    await handler(req, mocked.res);
    assert.equal(mocked.state.status, authCase.status, authCase.name);
    assert.equal(mocked.state.headers["cache-control"], "private, no-store");
  }
  assert.equal(harness.calls.detail.length, 0);
  assert.equal(harness.calls.steps.length, 0);
  assert.equal(harness.calls.events.length, 0);
});

test("detail re-sanitizes bounded run, step, error, and event payloads", async () => {
  const harness = repositoryHarness({
    detailRun: run({
      aggregateId: "private-aggregate@example.com",
      currentStep: "Authorization: Bearer top-level-secret-123456789",
      traceId: "private-trace@example.com",
      idempotencyKey: "Bearer idempotency-secret-123456789",
    }),
    stepsPage: {
      steps: [
        {
          id: "xstep_01",
          runId: "xrun_01",
          stepKey: "provider.search private-step@example.com",
          status: "failed",
          attempt: 1,
          input: { email: "step-private@example.com" },
          output: { token: "sk-step-private-123456789" },
          error: "Bearer step-secret-token-123456789",
          createdAt: "2026-07-15T10:00:00.000Z",
          updatedAt: "2026-07-15T10:00:01.000Z",
        },
      ],
      truncated: true,
    },
    eventsPage: {
      events: [
        {
          sequence: 7,
          id: "xevt_07",
          runId: "xrun_01",
          aggregateType: "partnerships.discovery",
          aggregateId: "event-aggregate@example.com",
          type: "provider.failed Bearer event-type-secret-123456789",
          ts: "2026-07-15T10:00:01.000Z",
          data: {
            apiKey: "sk-event-private-123456789",
            contact: "event-private@example.com",
            huge: "x".repeat(20_000),
          },
        },
      ],
      nextAfterSequence: 7,
    },
  });
  const handler = createExecutionRunDetailHandler({
    repository: harness.repository,
    getSession: async () => ADMIN_SESSION,
  });
  const mocked = response();
  await handler(
    request({
      tenantKey: "growth4u",
      id: "xrun_01",
      stepsLimit: "10",
      eventsLimit: "20",
      afterSequence: "3",
    }),
    mocked.res,
  );

  assert.equal(mocked.state.status, 200);
  assert.deepEqual(harness.calls.steps, [
    { tenantKey: "growth4u", runId: "xrun_01", limit: 10 },
  ]);
  assert.deepEqual(harness.calls.events, [
    {
      tenantKey: "growth4u",
      runId: "xrun_01",
      afterSequence: 3,
      limit: 20,
    },
  ]);
  const serialized = JSON.stringify(mocked.state.body);
  for (const secret of [
    "sk-secret-123456789",
    "private@example.com",
    "secret-token-123456789",
    "step-private@example.com",
    "sk-step-private-123456789",
    "step-secret-token-123456789",
    "sk-event-private-123456789",
    "event-private@example.com",
    "private-aggregate@example.com",
    "top-level-secret-123456789",
    "private-trace@example.com",
    "idempotency-secret-123456789",
    "private-step@example.com",
    "event-aggregate@example.com",
    "event-type-secret-123456789",
    "x".repeat(5_000),
  ]) {
    assert.equal(serialized.includes(secret), false, secret.slice(0, 40));
  }
  const body = mocked.state.body as {
    page: {
      steps: { truncated: boolean };
      events: { nextAfterSequence: number; hasMore: boolean };
    };
    redaction: { destination: string; bounded: boolean };
  };
  assert.equal(body.page.steps.truncated, true);
  assert.equal(body.page.events.nextAfterSequence, 7);
  assert.equal(body.page.events.hasMore, true);
  assert.deepEqual(body.redaction.destination, "model");
  assert.equal(body.redaction.bounded, true);
  assert.equal(mocked.state.headers["cache-control"], "private, no-store");
});

test("detail rejects malformed pagination before repository access", async () => {
  const harness = repositoryHarness();
  const handler = createExecutionRunDetailHandler({
    repository: harness.repository,
    getSession: async () => ADMIN_SESSION,
  });
  for (const query of [
    { tenantKey: "growth4u", id: "xrun_01", stepsLimit: "101" },
    { tenantKey: "growth4u", id: "xrun_01", eventsLimit: "0" },
    { tenantKey: "growth4u", id: "xrun_01", afterSequence: "-1" },
    { tenantKey: "growth4u", id: "../xrun_01" },
  ]) {
    const mocked = response();
    await handler(request(query), mocked.res);
    assert.equal(mocked.state.status, 400, JSON.stringify(query));
  }
  assert.equal(harness.calls.detail.length, 0);
});

test("detail fails closed when hostile persisted data cannot be sanitized", async () => {
  const rawSecret = "sk-never-return-this-123456789";
  const hostile = new Proxy(
    { rawSecret },
    {
      ownKeys() {
        throw new Error(rawSecret);
      },
    },
  );
  const harness = repositoryHarness({
    detailRun: run({ metadata: hostile }),
  });
  const logs: string[] = [];
  const handler = createExecutionRunDetailHandler({
    repository: harness.repository,
    getSession: async () => ADMIN_SESSION,
    logError: (message) => logs.push(message),
  });
  const mocked = response();
  await handler(request({ tenantKey: "growth4u", id: "xrun_01" }), mocked.res);
  assert.equal(mocked.state.status, 500);
  assert.deepEqual(mocked.state.body, {
    error: "Execution data could not be sanitized safely",
  });
  assert.equal(JSON.stringify(mocked.state.body).includes(rawSecret), false);
  assert.deepEqual(logs, ["[execution-inspector] detail redaction failed"]);
});
