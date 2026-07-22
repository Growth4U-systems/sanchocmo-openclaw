import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import type { NextApiRequest, NextApiResponse } from "next";
import type { AgentRun } from "@/lib/data/agent-runs";
import { PartnershipsDiscoveryAgentBridgeError } from "../partnerships-discovery-agent-bridge";
import {
  createAgentPartnershipsDiscoveryHandler,
  type AgentPartnershipsDiscoveryRouteDependencies,
} from "../../../pages/api/runtime/partnerships-discovery";

const capability = "a".repeat(64);
const leaseToken = "l".repeat(48);
const plan = {
  title: "Creators capilares España",
  sectors: ["hair care"],
  networks: ["instagram"],
};

function parentRun(inputOverrides: Record<string, unknown> = {}): AgentRun {
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
      runtimeDispatchMode: "ledger-v1",
      ...inputOverrides,
    },
    createdAt: "2026-07-16T10:00:00.000Z",
    updatedAt: "2026-07-16T10:00:00.000Z",
  };
}

const receipt = {
  operation: "partnerships.discovery" as const,
  runId: "xrun-setup-1",
  setupRunId: "xrun-setup-1",
  searchId: "ds-1234567890abcdef1234",
  status: "queued" as const,
  completionBoundary: "ledger_admitted" as const,
  created: true,
  replayed: false,
};

function dependencies(
  overrides: Partial<AgentPartnershipsDiscoveryRouteDependencies> = {},
): AgentPartnershipsDiscoveryRouteDependencies {
  return {
    sharedSecret: () => "runtime-secret",
    clientExists: (slug) => slug === "hospital-capilar",
    resolveAgentRun: async () => {
      throw new Error("legacy run capability must not authorize this route");
    },
    authorizeDispatchLease: async () => ({ parentRun: parentRun() }),
    admit: async () => ({
      identity: {
        commandId: "mc-chat-stable",
        commandFingerprint: "a".repeat(64),
      },
      receipt,
    }),
    ...overrides,
  };
}

function request(overrides: Partial<NextApiRequest> = {}): NextApiRequest {
  return {
    method: "POST",
    query: {},
    headers: {
      "x-mc-secret": "runtime-secret",
      "x-mission-control-run-id": "arun-chat-001",
      "x-sancho-run-capability": capability,
      "x-sancho-dispatch-run-id": "dispatch-1",
      "x-sancho-dispatch-lease-token": leaseToken,
    },
    body: { plan },
    ...overrides,
  } as unknown as NextApiRequest;
}

function response() {
  const state: {
    status: number;
    headers: Record<string, string>;
    body?: unknown;
  } = { status: 200, headers: {} };
  const res = {
    setHeader(name: string, value: string | number | readonly string[]) {
      state.headers[name.toLowerCase()] = String(value);
      return this;
    },
    status(status: number) {
      state.status = status;
      return this;
    },
    json(body: unknown) {
      state.body = body;
      return this;
    },
  } as unknown as NextApiResponse;
  return { state, res };
}

function body(state: { body?: unknown }): Record<string, unknown> {
  assert.ok(state.body && typeof state.body === "object");
  return state.body as Record<string, unknown>;
}

test("POST requires the exact durable dispatch lease before tenant lookup or admission", async () => {
  let lookups = 0;
  let admissions = 0;
  const handler = createAgentPartnershipsDiscoveryHandler(
    dependencies({
      clientExists: () => {
        lookups += 1;
        return true;
      },
      admit: async () => {
        admissions += 1;
        return {
          identity: {
            commandId: "mc-chat-stable",
            commandFingerprint: "a".repeat(64),
          },
          receipt,
        };
      },
    }),
  );
  for (const headers of [
    {},
    { "x-mc-secret": "wrong" },
    {
      "x-mc-secret": "runtime-secret",
      "x-mission-control-run-id": "arun-chat-001",
      "x-sancho-run-capability": capability,
    },
    {
      "x-mc-secret": "runtime-secret",
      "x-mission-control-run-id": "arun-chat-001",
      "x-sancho-run-capability": capability,
      "x-sancho-dispatch-run-id": "dispatch-1",
    },
    {
      "x-mc-secret": "runtime-secret",
      "x-mission-control-run-id": "arun-chat-001",
      "x-sancho-run-capability": capability,
      "x-sancho-dispatch-run-id": "dispatch-1",
      "x-sancho-dispatch-lease-token": leaseToken,
      "x-sancho-client-slug": "other-client",
    },
  ]) {
    const mocked = response();
    await handler(request({ headers }), mocked.res);
    assert.equal(mocked.state.status, 403);
  }
  assert.equal(lookups, 0);
  assert.equal(admissions, 0);
});

test("POST derives tenant, thread and parent identity from the leased run", async () => {
  let leaseInput: Record<string, unknown> | undefined;
  let admission:
    { context: Record<string, unknown>; input: unknown } | undefined;
  const handler = createAgentPartnershipsDiscoveryHandler(
    dependencies({
      authorizeDispatchLease: async (input) => {
        leaseInput = input;
        return { parentRun: parentRun() };
      },
      admit: async (context, input) => {
        admission = { context, input };
        return {
          identity: {
            commandId: "mc-chat-stable",
            commandFingerprint: "a".repeat(64),
          },
          receipt,
        };
      },
    }),
  );
  const mocked = response();
  await handler(request(), mocked.res);

  assert.equal(mocked.state.status, 202);
  assert.deepEqual(leaseInput, {
    parentAgentRunId: "arun-chat-001",
    dispatchRunId: "dispatch-1",
    leaseToken,
    runtimeToolCapability: capability,
    allowTerminalParent: undefined,
  });
  assert.deepEqual(admission, {
    context: {
      tenantSlug: "hospital-capilar",
      threadId: "hospital-capilar:general",
      agentRunId: "arun-chat-001",
    },
    input: { plan },
  });
  const payload = body(mocked.state);
  assert.equal(payload.ok, true);
  assert.deepEqual(payload.discovery, receipt);
  assert.equal(mocked.state.headers["cache-control"], "private, no-store");
  assert.doesNotMatch(
    JSON.stringify(payload),
    /runtime-secret|dispatch-1|mc-chat-stable/,
  );
});

test("unknown body/query authority fields are rejected before admission", async () => {
  let admissions = 0;
  const handler = createAgentPartnershipsDiscoveryHandler(
    dependencies({
      admit: async () => {
        admissions += 1;
        return {
          identity: {
            commandId: "mc-chat-stable",
            commandFingerprint: "a".repeat(64),
          },
          receipt,
        };
      },
    }),
  );
  for (const override of [
    { body: { plan, slug: "other-client" } },
    { body: { plan, commandId: "model-controlled" } },
    { query: { status: "xrun-setup-1" } },
  ]) {
    const mocked = response();
    await handler(request(override as Partial<NextApiRequest>), mocked.res);
    assert.equal(mocked.state.status, 400);
    assert.equal(
      body(mocked.state).error,
      "partnerships_discovery_request_invalid",
    );
  }
  assert.equal(admissions, 0);
});

test("non-admin, read-only, client and non-ledger parents fail closed", async () => {
  let admissions = 0;
  const cases = [
    { isAdmin: false },
    { readOnly: true },
    { senderRole: "client", userId: "mc-client-hospital-capilar" },
    { controlDepth: 1 },
    { temporaryAgent: true },
    { runtimeDispatchMode: "gateway" },
  ];
  for (const inputOverrides of cases) {
    const handler = createAgentPartnershipsDiscoveryHandler(
      dependencies({
        authorizeDispatchLease: async () => ({
          parentRun: parentRun(inputOverrides),
        }),
        admit: async () => {
          admissions += 1;
          return {
            identity: {
              commandId: "mc-chat-stable",
              commandFingerprint: "a".repeat(64),
            },
            receipt,
          };
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
  const parent = parentRun({
    runtimeTransportSecretSha256: createHash("sha256")
      .update(admittedSecret)
      .digest("hex"),
  });
  let legacyLookups = 0;
  const handler = createAgentPartnershipsDiscoveryHandler(
    dependencies({
      sharedSecret: () => {
        legacyLookups += 1;
        return "rotated-runtime-secret";
      },
      authorizeDispatchLease: async () => ({ parentRun: parent }),
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

test("method and bridge failures expose only stable codes", async () => {
  const handler = createAgentPartnershipsDiscoveryHandler(
    dependencies({
      admit: async () => {
        throw new PartnershipsDiscoveryAgentBridgeError(
          "execution_command_conflict",
          409,
        );
      },
    }),
  );
  const method = response();
  await handler(request({ method: "GET" }), method.res);
  assert.equal(method.state.status, 405);
  assert.equal(method.state.headers.allow, "POST");

  const conflict = response();
  await handler(request(), conflict.res);
  assert.equal(conflict.state.status, 409);
  assert.deepEqual(body(conflict.state).error, "execution_command_conflict");
});
