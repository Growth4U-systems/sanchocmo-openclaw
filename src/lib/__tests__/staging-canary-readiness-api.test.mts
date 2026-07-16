import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import type { NextApiRequest, NextApiResponse } from "next";

import type { DurableExecutionScopeSupervisorReadiness } from "../durable-execution";
import type { LeadsSearchOperationalReadiness } from "../leads/search-durable-worker";
import { requireInternalAuth } from "../sancho-internal-api";
import { createStagingCanaryReadinessHandler } from "../runtime/staging-canary-readiness-api";
import { STAGING_CANARY_READINESS_SCHEMA } from "../runtime/staging-canary-readiness-contract";
import { isLeadsSearchCanaryReady } from "../../pages/api/internal/staging-canary-readiness/leads";
import { isPartnershipsDiscoveryCanaryReady } from "../../pages/api/internal/staging-canary-readiness/partnerships";

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

function request(method = "GET", authorization?: string): NextApiRequest {
  return {
    method,
    query: {},
    headers: authorization === undefined ? {} : { authorization },
  } as unknown as NextApiRequest;
}

function supervisor(
  overrides: Partial<DurableExecutionScopeSupervisorReadiness> = {},
): DurableExecutionScopeSupervisorReadiness {
  return {
    state: "ready",
    started: true,
    scanInFlight: false,
    operations: ["leads.search"],
    modes: ["canary"],
    startedAt: "2026-07-16T08:00:00.000Z",
    lastFullSuccessAt: "2026-07-16T08:00:01.000Z",
    counters: {} as DurableExecutionScopeSupervisorReadiness["counters"],
    workers: [],
    capacity: {} as DurableExecutionScopeSupervisorReadiness["capacity"],
    managedWorkerCount: 0,
    capacityDeferredScopes: [],
    capacityDeferredScopeCount: 0,
    capacityDeferredScopesTruncated: false,
    blockedProjectionScopes: [],
    blockedProjectionScopeCount: 0,
    blockedProjectionScopesTruncated: false,
    blockedProjectionVisibility: "available",
    blockedRunScopes: [],
    blockedRunScopeCount: 0,
    blockedRunScopesTruncated: false,
    blockedRunVisibility: "available",
    ...overrides,
  };
}

function leads(
  overrides: Partial<LeadsSearchOperationalReadiness> = {},
): LeadsSearchOperationalReadiness {
  return {
    acceptsNewAdmissions: true,
    rolloutReady: true,
    enabledTenantCount: 1,
    credentialBindingReady: true,
    startup: {
      state: "ready",
      lastAttemptAt: "2026-07-16T08:00:00.000Z",
      lastSuccessAt: "2026-07-16T08:00:01.000Z",
    },
    supervisor: supervisor(),
    ...overrides,
  };
}

test("surface readiness adapters have no cross-product static imports", async () => {
  const [
    handlerSource,
    clientSource,
    preflightContractSource,
    leadsSource,
    partnershipsSource,
  ] = await Promise.all([
    readFile(
      new URL("../runtime/staging-canary-readiness-api.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../runtime/staging-canary-readiness-client.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../runtime/staging-canary-preflight-contract.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../pages/api/internal/staging-canary-readiness/leads.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../pages/api/internal/staging-canary-readiness/partnerships.ts",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  const productImport =
    /(?:from\s+|import\(\s*)["'][^"']*\/(?:leads|partnerships)\//;
  assert.doesNotMatch(handlerSource, productImport);
  assert.doesNotMatch(clientSource, productImport);
  assert.doesNotMatch(preflightContractSource, productImport);
  assert.doesNotMatch(
    leadsSource,
    /(?:from\s+|import\(\s*)["'][^"']*\/partnerships\//,
  );
  assert.doesNotMatch(
    partnershipsSource,
    /(?:from\s+|import\(\s*)["'][^"']*\/leads\//,
  );
});

test("surface readiness is GET-only and rejects before auth or runtime reads", () => {
  let authorizations = 0;
  let runtimeReads = 0;
  const handler = createStagingCanaryReadinessHandler({
    surface: "leads",
    authorize: () => {
      authorizations += 1;
      return true;
    },
    getReady: () => {
      runtimeReads += 1;
      return true;
    },
  });

  for (const method of ["POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]) {
    const mocked = response();
    handler(request(method), mocked.res);
    assert.equal(mocked.state.status, 405, method);
    assert.deepEqual(
      mocked.state.body,
      { error: "Method not allowed" },
      method,
    );
    assert.equal(mocked.state.headers.allow, "GET", method);
    assert.equal(
      mocked.state.headers["cache-control"],
      "private, no-store",
      method,
    );
  }
  assert.equal(authorizations, 0);
  assert.equal(runtimeReads, 0);
});

test("surface readiness uses exact internal bearer auth and never reads runtime on rejection", () => {
  const previousToken = process.env.SANCHO_INTERNAL_API_TOKEN;
  const expectedToken = "staging-canary-test-token-29d1";
  let runtimeReads = 0;
  const handler = createStagingCanaryReadinessHandler({
    surface: "leads",
    authorize: requireInternalAuth,
    getReady: () => {
      runtimeReads += 1;
      return true;
    },
  });

  try {
    delete process.env.SANCHO_INTERNAL_API_TOKEN;
    const unconfigured = response();
    handler(request(), unconfigured.res);
    assert.equal(unconfigured.state.status, 503);
    assert.equal(
      unconfigured.state.headers["cache-control"],
      "private, no-store",
    );
    assert.equal(runtimeReads, 0);

    process.env.SANCHO_INTERNAL_API_TOKEN = expectedToken;
    const rejectedHeaders = [
      undefined,
      `Basic ${expectedToken}`,
      `bearer ${expectedToken}`,
      "Bearer wrong-length",
      "Bearer staging-canary-test-token-29x1",
      `Bearer ${expectedToken} trailing-data`,
    ];
    for (const authorization of rejectedHeaders) {
      const rejected = response();
      handler(request("GET", authorization), rejected.res);
      assert.equal(rejected.state.status, 403, authorization ?? "missing");
      assert.deepEqual(
        rejected.state.body,
        { error: "Unauthorized" },
        authorization ?? "missing",
      );
      assert.equal(
        rejected.state.headers["cache-control"],
        "private, no-store",
        authorization ?? "missing",
      );
    }
    assert.equal(runtimeReads, 0);

    const accepted = response();
    handler(request("GET", `Bearer ${expectedToken}`), accepted.res);
    assert.equal(accepted.state.status, 200);
    assert.equal(runtimeReads, 1);

    const serialized = JSON.stringify({
      unconfigured: unconfigured.state.body,
      accepted: accepted.state.body,
    });
    assert.equal(serialized.includes(expectedToken), false);
  } finally {
    if (previousToken === undefined) {
      delete process.env.SANCHO_INTERNAL_API_TOKEN;
    } else {
      process.env.SANCHO_INTERNAL_API_TOKEN = previousToken;
    }
  }
});

test("surface readiness returns a fixed redacted no-store projection", () => {
  const forbidden = [
    "private-apollo-key",
    "private-lead@example.com",
    "private-hospital-tenant",
    "private-leads-run",
    "private-yalc-token",
    "private-partnerships-tenant",
    "private-partnerships-run",
  ];

  for (const surface of ["leads", "partnerships"] as const) {
    const privateRuntimeState = { surface, forbidden };
    const handler = createStagingCanaryReadinessHandler({
      surface,
      authorize: () => true,
      getReady: () => {
        assert.equal(privateRuntimeState.surface, surface);
        return true;
      },
    });
    const mocked = response();
    handler(request(), mocked.res);

    assert.equal(mocked.state.status, 200);
    assert.equal(mocked.state.headers["cache-control"], "private, no-store");
    assert.deepEqual(mocked.state.body, {
      schemaVersion: STAGING_CANARY_READINESS_SCHEMA,
      surface,
      ready: true,
    });
    assert.deepEqual(Object.keys(mocked.state.body as object).sort(), [
      "ready",
      "schemaVersion",
      "surface",
    ]);

    const serialized = JSON.stringify(mocked.state.body);
    for (const secret of forbidden) {
      assert.equal(serialized.includes(secret), false, secret);
    }
  }
});

test("Leads readiness fails closed for every required admission and worker signal", () => {
  assert.equal(isLeadsSearchCanaryReady(leads()), true);
  const cases: Array<{
    name: string;
    value: LeadsSearchOperationalReadiness;
  }> = [
    {
      name: "admissions closed",
      value: leads({ acceptsNewAdmissions: false }),
    },
    { name: "rollout closed", value: leads({ rolloutReady: false }) },
    {
      name: "credential binding missing",
      value: leads({ credentialBindingReady: false }),
    },
    {
      name: "startup incomplete",
      value: leads({ startup: { state: "starting" } }),
    },
    { name: "supervisor missing", value: leads({ supervisor: undefined }) },
    {
      name: "supervisor degraded",
      value: leads({ supervisor: supervisor({ state: "degraded" }) }),
    },
    {
      name: "supervisor not started",
      value: leads({ supervisor: supervisor({ started: false }) }),
    },
    {
      name: "successful scan missing",
      value: leads({
        supervisor: supervisor({ lastFullSuccessAt: undefined }),
      }),
    },
    {
      name: "supervisor error present",
      value: leads({
        supervisor: supervisor({
          lastError: {
            code: "scope_scan_failed",
            at: "2026-07-16T08:00:02.000Z",
          },
        }),
      }),
    },
  ];

  for (const readinessCase of cases) {
    assert.equal(
      isLeadsSearchCanaryReady(readinessCase.value),
      false,
      readinessCase.name,
    );
  }
});

test("Partnerships readiness fails closed for every required worker signal", () => {
  assert.equal(isPartnershipsDiscoveryCanaryReady(supervisor()), true);
  const cases: Array<{
    name: string;
    value: DurableExecutionScopeSupervisorReadiness | undefined;
  }> = [
    { name: "supervisor missing", value: undefined },
    { name: "supervisor starting", value: supervisor({ state: "starting" }) },
    { name: "supervisor degraded", value: supervisor({ state: "degraded" }) },
    { name: "supervisor stopped", value: supervisor({ state: "stopped" }) },
    { name: "supervisor stopping", value: supervisor({ state: "stopping" }) },
    { name: "supervisor not started", value: supervisor({ started: false }) },
    {
      name: "successful scan missing",
      value: supervisor({ lastFullSuccessAt: undefined }),
    },
    {
      name: "supervisor error present",
      value: supervisor({
        lastError: {
          code: "scope_scan_failed",
          at: "2026-07-16T08:00:02.000Z",
        },
      }),
    },
  ];

  for (const readinessCase of cases) {
    assert.equal(
      isPartnershipsDiscoveryCanaryReady(readinessCase.value),
      false,
      readinessCase.name,
    );
  }
});

test("runtime lookup failures return a stable credential-free fail-closed error", () => {
  const secret = "private-runtime-error-payload";
  const logs: string[] = [];
  const handler = createStagingCanaryReadinessHandler({
    surface: "leads",
    authorize: () => true,
    getReady: () => {
      throw new Error(secret);
    },
    logError: (message) => logs.push(message),
  });
  const mocked = response();
  handler(request(), mocked.res);

  assert.equal(mocked.state.status, 500);
  assert.equal(mocked.state.headers["cache-control"], "private, no-store");
  assert.deepEqual(mocked.state.body, {
    error: "Canary readiness unavailable",
  });
  assert.deepEqual(logs, ["[staging-canary-readiness] lookup failed"]);
  assert.equal(
    JSON.stringify({ body: mocked.state.body, logs }).includes(secret),
    false,
  );
});
