import assert from "node:assert/strict";
import { test } from "node:test";
import type { NextApiRequest, NextApiResponse } from "next";
import type { LeadsSearchOperationalReadiness } from "../leads/search-durable-worker";
import { createLeadsSearchReadinessHandler } from "../../pages/api/admin/leads-search-readiness";

const ADMIN_SESSION = { user: { role: "admin" } } as const;
const CLIENT_SESSION = { user: { role: "client" } } as const;

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

function request(method = "GET"): NextApiRequest {
  return {
    method,
    query: {},
    headers: { authorization: "Bearer legacy-admin-token" },
    ctx: { isAdmin: true },
  } as unknown as NextApiRequest;
}

function counters(value = 1) {
  return {
    scansStarted: value,
    scansSucceeded: value,
    scansFailed: value,
    pages: value,
    scopesSeen: value,
    scopesAllowed: value,
    scopesRejected: value,
    workersStarted: value,
    workersWoken: value,
    workersRetired: value,
    workersFairnessYielded: value,
    workerRetireOwnershipLost: value,
    capacityDeferredScopes: value,
    blockedProjectionPages: value,
    blockedProjectionScopes: value,
    blockedRunPages: value,
    blockedRunScopes: value,
  };
}

function readiness(): LeadsSearchOperationalReadiness {
  return {
    acceptsNewAdmissions: true,
    rolloutReady: true,
    enabledTenantCount: 2,
    credentialBindingReady: true,
    startup: {
      state: "ready",
      lastAttemptAt: "2026-07-16T08:00:00.000Z",
      lastSuccessAt: "2026-07-16T08:00:01.000Z",
    },
    supervisor: {
      state: "degraded",
      started: true,
      scanInFlight: false,
      operations: ["leads.search"],
      modes: ["canary"],
      startedAt: "2026-07-16T08:00:00.000Z",
      lastFullSuccessAt: "2026-07-16T08:00:02.000Z",
      lastError: {
        code: "scope_scan_failed",
        at: "2026-07-16T08:00:03.000Z",
      },
      lastScan: {
        startedAt: "2026-07-16T08:00:01.000Z",
        finishedAt: "2026-07-16T08:00:02.000Z",
        pages: 2,
        scopesSeen: 3,
        scopesAllowed: 2,
        scopesRejected: 1,
        rejectionCodes: { policy_denied: 1 },
        workersStarted: 1,
        workersWoken: 1,
        workersRetired: 0,
        workersFairnessYielded: 0,
        workerRetireOwnershipLost: 0,
        capacityDeferredScopes: 1,
        blockedProjectionPages: 1,
        blockedProjectionScopes: 1,
        blockedRunPages: 1,
        blockedRunScopes: 1,
      },
      counters: counters(),
      workers: [
        {
          scope: {
            tenantKey: "private-hospital-tenant",
            operation: "leads.search",
            mode: "canary",
          },
          workerId: "private-worker-id",
          started: true,
          state: "ready",
          blockedProjection: {
            runId: "private-run-id",
            lastErrorCode: "private_error",
            updatedAt: "2026-07-16T08:00:03.000Z",
          },
          counters: { privatePayload: "provider-payload" },
        },
        {
          scope: {
            tenantKey: "private-second-tenant",
            operation: "leads.search",
            mode: "canary",
          },
          workerId: "private-second-worker-id",
          started: false,
          state: "degraded",
          counters: { privatePayload: "provider-payload-2" },
        },
      ],
      capacity: {
        maxWorkers: 8,
        activeWorkers: 1,
        stoppingWorkers: 1,
        occupiedWorkers: 2,
        availableSlots: 6,
        pendingDemands: 1,
        fairnessYieldInProgress: false,
      },
      managedWorkerCount: 2,
      capacityDeferredScopes: [
        {
          tenantKey: "private-deferred-tenant",
          operation: "leads.search",
          mode: "canary",
        },
      ],
      capacityDeferredScopeCount: 1,
      capacityDeferredScopesTruncated: false,
      blockedProjectionScopes: [
        {
          tenantKey: "private-blocked-projection-tenant",
          operation: "leads.search",
          mode: "canary",
        },
      ],
      blockedProjectionScopeCount: 1,
      blockedProjectionScopesTruncated: false,
      blockedProjectionVisibility: "available",
      blockedRunScopes: [
        {
          tenantKey: "private-blocked-run-tenant",
          operation: "leads.search",
          mode: "canary",
        },
      ],
      blockedRunScopeCount: 1,
      blockedRunScopesTruncated: false,
      blockedRunVisibility: "available",
    },
  } as unknown as LeadsSearchOperationalReadiness;
}

test("readiness route is GET-only and never resolves auth for other methods", async () => {
  let sessions = 0;
  let reads = 0;
  const handler = createLeadsSearchReadinessHandler({
    getSession: async () => {
      sessions += 1;
      return ADMIN_SESSION;
    },
    getReadiness: () => {
      reads += 1;
      return readiness();
    },
  });
  const mocked = response();
  await handler(request("POST"), mocked.res);
  assert.equal(mocked.state.status, 405);
  assert.equal(mocked.state.headers.allow, "GET");
  assert.equal(mocked.state.headers["cache-control"], "private, no-store");
  assert.equal(sessions, 0);
  assert.equal(reads, 0);
});

test("readiness route is strict NextAuth admin-only", async () => {
  let reads = 0;
  for (const authCase of [
    { name: "missing session", session: null, status: 401 },
    { name: "client session", session: CLIENT_SESSION, status: 403 },
  ]) {
    const handler = createLeadsSearchReadinessHandler({
      getSession: async () => authCase.session,
      getReadiness: () => {
        reads += 1;
        return readiness();
      },
    });
    const mocked = response();
    await handler(request(), mocked.res);
    assert.equal(mocked.state.status, authCase.status, authCase.name);
    assert.equal(
      mocked.state.headers["cache-control"],
      "private, no-store",
      authCase.name,
    );
  }
  // Legacy bearer and req.ctx.isAdmin on request() never grant access.
  assert.equal(reads, 0);
});

test("admin response exposes only closed operational evidence", async () => {
  const raw = readiness() as LeadsSearchOperationalReadiness &
    Record<string, unknown>;
  raw.APOLLO_API_KEY = "private-apollo-key";
  raw.env = { DATABASE_URL: "private-database-url" };
  raw.payload = { provider: "private-provider-payload" };
  const handler = createLeadsSearchReadinessHandler({
    getSession: async () => ADMIN_SESSION,
    getReadiness: () => raw,
  });
  const mocked = response();
  await handler(request(), mocked.res);

  assert.equal(mocked.state.status, 200);
  const body = mocked.state.body as Record<string, unknown> & {
    startup: Record<string, unknown>;
    supervisor: Record<string, unknown> & {
      workers: {
        total: number;
        started: number;
        byState: Record<string, number>;
      };
    };
  };
  assert.deepEqual(Object.keys(body).sort(), [
    "acceptsNewAdmissions",
    "credentialBindingReady",
    "enabledTenantCount",
    "operation",
    "rolloutReady",
    "schemaVersion",
    "startup",
    "supervisor",
  ]);
  assert.equal(body.schemaVersion, "leads-search-readiness.v1");
  assert.equal(body.operation, "leads.search");
  assert.equal(body.acceptsNewAdmissions, true);
  assert.equal(body.rolloutReady, true);
  assert.equal(body.enabledTenantCount, 2);
  assert.equal(body.credentialBindingReady, true);
  assert.deepEqual(body.startup, {
    state: "ready",
    lastAttemptAt: "2026-07-16T08:00:00.000Z",
    lastSuccessAt: "2026-07-16T08:00:01.000Z",
  });
  assert.deepEqual(body.supervisor.workers, {
    total: 2,
    started: 1,
    byState: { stopped: 0, starting: 0, ready: 1, degraded: 1 },
  });
  assert.deepEqual(body.supervisor.capacity, {
    maxWorkers: 8,
    activeWorkers: 1,
    stoppingWorkers: 1,
    occupiedWorkers: 2,
    availableSlots: 6,
    pendingDemands: 1,
    fairnessYieldInProgress: false,
  });
  assert.equal(body.supervisor.blockedProjectionScopeCount, 1);
  assert.equal(body.supervisor.blockedRunScopeCount, 1);
  assert.equal(body.supervisor.capacityDeferredScopeCount, 1);

  const serialized = JSON.stringify(body);
  for (const forbidden of [
    "APOLLO_API_KEY",
    "private-apollo-key",
    "DATABASE_URL",
    "private-database-url",
    "private-provider-payload",
    "private-hospital-tenant",
    "private-worker-id",
    "private-run-id",
    "private-deferred-tenant",
    "private-blocked-projection-tenant",
    "private-blocked-run-tenant",
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test("startup without a supervisor is a valid redacted readiness state", async () => {
  const handler = createLeadsSearchReadinessHandler({
    getSession: async () => ADMIN_SESSION,
    getReadiness: () => ({
      acceptsNewAdmissions: false,
      rolloutReady: false,
      enabledTenantCount: 0,
      credentialBindingReady: false,
      startup: {
        state: "failed",
        lastAttemptAt: "2026-07-16T08:00:00.000Z",
        lastError: {
          code: "leads_search_startup_failed",
          at: "2026-07-16T08:00:00.000Z",
        },
      },
    }),
  });
  const mocked = response();
  await handler(request(), mocked.res);
  assert.equal(mocked.state.status, 200);
  assert.deepEqual(mocked.state.body, {
    schemaVersion: "leads-search-readiness.v1",
    operation: "leads.search",
    acceptsNewAdmissions: false,
    rolloutReady: false,
    enabledTenantCount: 0,
    credentialBindingReady: false,
    startup: {
      state: "failed",
      lastAttemptAt: "2026-07-16T08:00:00.000Z",
      lastError: {
        code: "leads_search_startup_failed",
        at: "2026-07-16T08:00:00.000Z",
      },
    },
    supervisor: null,
  });
});

test("session and readiness failures are stable and never expose thrown data", async () => {
  const secret = "private-readiness-secret";
  for (const failure of ["session", "readiness"] as const) {
    const logs: string[] = [];
    const handler = createLeadsSearchReadinessHandler({
      getSession: async () => {
        if (failure === "session") throw new Error(secret);
        return ADMIN_SESSION;
      },
      getReadiness: () => {
        if (failure === "readiness") throw new Error(secret);
        return readiness();
      },
      logError: (message) => logs.push(message),
    });
    const mocked = response();
    await handler(request(), mocked.res);
    assert.equal(mocked.state.status, 500, failure);
    assert.deepEqual(
      mocked.state.body,
      { error: "Leads search readiness unavailable" },
      failure,
    );
    assert.equal(
      JSON.stringify({ body: mocked.state.body, logs }).includes(secret),
      false,
      failure,
    );
    assert.deepEqual(logs, [
      failure === "session"
        ? "[leads-search-readiness] session lookup failed"
        : "[leads-search-readiness] readiness lookup failed",
    ]);
  }
});
