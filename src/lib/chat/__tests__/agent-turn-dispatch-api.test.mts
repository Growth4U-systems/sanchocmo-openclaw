import assert from "node:assert/strict";
import test from "node:test";
import type { NextApiRequest, NextApiResponse } from "next";
import type {
  ChatAgentTurnRemoteClaim,
  ChatAgentTurnRuntimeAuthority,
} from "../agent-turn-remote-worker";
import {
  createChatAgentTurnDispatchHandler,
  type ChatAgentTurnDispatchRouteDependencies,
} from "../../../pages/api/runtime/chat-agent-turn-dispatch";

const leaseToken = "l".repeat(48);
const capability = "a".repeat(64);
const leaseExpiresAt = "2026-07-16T12:00:00.000Z";

function remoteClaim(): ChatAgentTurnRemoteClaim {
  return {
    dispatchRunId: "dispatch-1",
    parentAgentRunId: "parent-1",
    leaseToken,
    leaseExpiresAt,
    recovered: false,
    runtimeToolCapability: capability,
    envelope: {
      slug: "hospital-capilar",
      threadId: "hospital-capilar:general",
      missionControlRunId: "parent-1",
      runtimeToolCapability: capability,
      text: "Busca partners",
      userId: "mc-admin",
      userName: "Martin",
      agent: "sancho",
      agentId: "sancho",
    },
  };
}

function authority(): ChatAgentTurnRuntimeAuthority {
  return {
    lease: { expiresAt: leaseExpiresAt },
  } as ChatAgentTurnRuntimeAuthority;
}

function dependencies(
  overrides: Partial<ChatAgentTurnDispatchRouteDependencies> = {},
): ChatAgentTurnDispatchRouteDependencies {
  return {
    sharedSecret: () => "runtime-secret",
    enabled: () => true,
    claim: async () => remoteClaim(),
    authorize: async () => authority(),
    markStarted: async () => ({ status: "running" }),
    complete: async () => ({ status: "completed" }),
    requeue: async () => ({ status: "queued" }),
    ...overrides,
  };
}

function request(
  body: Record<string, unknown>,
  headers: Record<string, string> = {
    "x-mc-secret": "runtime-secret",
  },
  method = "POST",
): NextApiRequest {
  return {
    method,
    query: {},
    headers,
    body,
  } as unknown as NextApiRequest;
}

function claimHeaders(): Record<string, string> {
  return {
    "x-mc-secret": "runtime-secret",
    "x-mission-control-run-id": "parent-1",
    "x-sancho-dispatch-run-id": "dispatch-1",
    "x-sancho-dispatch-lease-token": leaseToken,
    "x-sancho-run-capability": capability,
  };
}

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

test("claim returns one server-owned durable envelope only to the authenticated worker", async () => {
  let workerId: unknown;
  const handler = createChatAgentTurnDispatchHandler(
    dependencies({
      claim: async (value) => {
        workerId = value;
        return remoteClaim();
      },
    }),
  );
  const mocked = response();
  await handler(
    request({ action: "claim", workerId: "openclaw-staging-1" }),
    mocked.res,
  );
  assert.equal(mocked.state.status, 200);
  assert.equal(workerId, "openclaw-staging-1");
  assert.deepEqual(mocked.state.body, { ok: true, claim: remoteClaim() });
  assert.match(mocked.state.headers["cache-control"], /no-store/);
});

test("disabled, unauthenticated, query-bearing and over-specified requests fail closed", async () => {
  const cases: Array<{
    deps?: Partial<ChatAgentTurnDispatchRouteDependencies>;
    req: NextApiRequest;
    status: number;
  }> = [
    {
      deps: { enabled: () => false },
      req: request({ action: "claim", workerId: "worker-1" }),
      status: 503,
    },
    {
      req: request(
        { action: "claim", workerId: "worker-1" },
        { "x-mc-secret": "wrong" },
      ),
      status: 403,
    },
    {
      req: {
        ...request({ action: "claim", workerId: "worker-1" }),
        query: { slug: "hospital-capilar" },
      } as NextApiRequest,
      status: 400,
    },
    {
      req: request({ action: "claim", workerId: "worker-1", tenant: "x" }),
      status: 400,
    },
  ];
  for (const candidate of cases) {
    const mocked = response();
    await createChatAgentTurnDispatchHandler(dependencies(candidate.deps))(
      candidate.req,
      mocked.res,
    );
    assert.equal(mocked.state.status, candidate.status);
  }
});

test("heartbeat renews the exact parent/dispatch lease tuple without returning its token", async () => {
  let authorizationInput: Record<string, unknown> | undefined;
  const handler = createChatAgentTurnDispatchHandler(
    dependencies({
      authorize: async (input) => {
        authorizationInput = input;
        return authority();
      },
    }),
  );
  const mocked = response();
  await handler(request({ action: "heartbeat" }, claimHeaders()), mocked.res);
  assert.equal(mocked.state.status, 200);
  assert.deepEqual(authorizationInput, {
    parentAgentRunId: "parent-1",
    dispatchRunId: "dispatch-1",
    leaseToken,
    runtimeToolCapability: capability,
    allowTerminalParent: true,
    allowCancellationRequested: true,
  });
  assert.deepEqual(mocked.state.body, {
    ok: true,
    leaseExpiresAt,
    cancellationRequested: false,
  });
  assert.doesNotMatch(
    JSON.stringify(mocked.state.body),
    new RegExp(leaseToken),
  );
});

test("started, terminal complete and busy requeue use fenced authority", async () => {
  let started = 0;
  let completed = 0;
  let requeueReason: string | undefined;
  const handler = createChatAgentTurnDispatchHandler(
    dependencies({
      markStarted: async () => {
        started += 1;
        return { status: "running" };
      },
      complete: async () => {
        completed += 1;
        return { status: "completed" };
      },
      requeue: async (_authority, reason) => {
        requeueReason = reason;
        return { status: "queued" };
      },
    }),
  );

  const startedResponse = response();
  await handler(
    request({ action: "started" }, claimHeaders()),
    startedResponse.res,
  );
  assert.equal(startedResponse.state.status, 200);
  assert.equal(started, 1);

  const completeResponse = response();
  await handler(
    request({ action: "complete" }, claimHeaders()),
    completeResponse.res,
  );
  assert.equal(completeResponse.state.status, 200);
  assert.equal(completed, 1);

  const requeueResponse = response();
  await handler(
    request(
      { action: "requeue", reason: "runtime_session_busy" },
      claimHeaders(),
    ),
    requeueResponse.res,
  );
  assert.equal(requeueResponse.state.status, 202);
  assert.equal(requeueReason, "runtime_session_busy");
});

test("a stale lease, a non-terminal parent and an invalid requeue reason are visible conflicts", async () => {
  const staleHandler = createChatAgentTurnDispatchHandler(
    dependencies({ authorize: async () => null }),
  );
  const staleResponse = response();
  await staleHandler(
    request({ action: "heartbeat" }, claimHeaders()),
    staleResponse.res,
  );
  assert.equal(staleResponse.state.status, 409);

  const activeHandler = createChatAgentTurnDispatchHandler(
    dependencies({ complete: async () => null }),
  );
  const activeResponse = response();
  await activeHandler(
    request({ action: "complete" }, claimHeaders()),
    activeResponse.res,
  );
  assert.equal(activeResponse.state.status, 409);
  assert.deepEqual(activeResponse.state.body, {
    error: "chat_agent_turn_parent_not_terminal",
  });

  const cancellingHandler = createChatAgentTurnDispatchHandler(
    dependencies({
      authorize: async () =>
        ({
          ...authority(),
          dispatchRun: { cancelRequestedAt: leaseExpiresAt },
        }) as ChatAgentTurnRuntimeAuthority,
      complete: async () => null,
    }),
  );
  const cancellingResponse = response();
  await cancellingHandler(
    request({ action: "complete" }, claimHeaders()),
    cancellingResponse.res,
  );
  assert.equal(cancellingResponse.state.status, 409);
  assert.deepEqual(cancellingResponse.state.body, {
    error: "chat_agent_turn_cancellation_pending",
  });

  const invalidResponse = response();
  await activeHandler(
    request({ action: "requeue", reason: "provider_timeout" }, claimHeaders()),
    invalidResponse.res,
  );
  assert.equal(invalidResponse.state.status, 400);
});
