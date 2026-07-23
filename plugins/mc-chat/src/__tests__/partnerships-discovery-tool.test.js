import assert from "node:assert/strict";
import test from "node:test";
import {
  PARTNERSHIPS_DISCOVERY_START_TOOL,
  createPartnershipsDiscoveryToolsForContext,
  registerPartnershipsDiscoveryTools,
} from "../partnerships-discovery-tool.js";

const runtimeToolCapability = "a".repeat(64);
const dispatchLeaseToken = "l".repeat(48);
const context = {
  messageChannel: "mc-chat",
  deliveryContext: {
    channel: "mc-chat",
    to: "channel:mc-chat:hospital-capilar:general",
  },
  requesterSenderId: "mc-admin",
  agentId: "sancho",
};
const input = {
  plan: {
    title: "Creators capilares España",
    sectors: ["Hair Care"],
    networks: ["Instagram"],
    hashtags: ["#TrasplanteCapilar"],
    targetVolume: 25,
  },
};

function dependencies(overrides = {}) {
  return {
    clientExists: (slug) => slug === "hospital-capilar",
    runAuthorityFor: () => ({
      missionControlRunId: "arun-chat-001",
      runtimeToolCapability,
      dispatchRunId: "dispatch-1",
      dispatchLeaseToken,
      allowExternalEffects: true,
      allowedExternalEffects: [PARTNERSHIPS_DISCOVERY_START_TOOL],
    }),
    loadConfig: () => ({
      channels: {
        "mc-chat": {
          mcServerUrl: "http://mission-control.internal:3000",
          sharedSecret: "runtime-secret",
        },
      },
    }),
    ...overrides,
  };
}

function response(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function tool(deps = dependencies()) {
  const tools = createPartnershipsDiscoveryToolsForContext(context, deps);
  assert.equal(tools?.length, 1);
  return tools[0];
}

function admitted(overrides = {}) {
  return {
    ok: true,
    discovery: {
      operation: "partnerships.discovery",
      runId: "xrun-setup-1",
      setupRunId: "xrun-setup-1",
      searchId: "ds-1234567890abcdef1234",
      status: "queued",
      completionBoundary: "ledger_admitted",
      created: true,
      replayed: false,
      ...overrides,
    },
  };
}

test("registers one closed and bounded admission tool without authority fields", () => {
  let factory;
  let options;
  registerPartnershipsDiscoveryTools(
    {
      registerTool(candidate, candidateOptions) {
        factory = candidate;
        options = candidateOptions;
      },
    },
    dependencies(),
  );
  assert.deepEqual(options, { names: [PARTNERSHIPS_DISCOVERY_START_TOOL] });
  const start = factory(context)[0];
  assert.equal(start.parameters.additionalProperties, false);
  assert.deepEqual(start.parameters.required, ["plan"]);
  assert.equal(start.parameters.properties.slug, undefined);
  assert.equal(start.parameters.properties.commandId, undefined);
  assert.equal(start.parameters.properties.run, undefined);
  assert.equal(start.parameters.properties.plan.additionalProperties, false);
  assert.equal(
    start.parameters.properties.plan.properties.networks.maxItems,
    1,
  );
  assert.equal(
    start.parameters.properties.plan.properties.targetVolume.maximum,
    100,
  );
  assert.match(start.description, /do not wait, sleep, poll/i);
  assert.match(start.description, /Bash\/curl/i);
});

test("exists only for the exact admin durable dispatch authority", () => {
  for (const candidate of [
    {},
    { ...context, requesterSenderId: "mc-client-hospital-capilar" },
    { ...context, messageChannel: "discord" },
  ]) {
    assert.equal(
      createPartnershipsDiscoveryToolsForContext(candidate, dependencies()),
      null,
    );
  }
  assert.equal(
    createPartnershipsDiscoveryToolsForContext(
      context,
      dependencies({
        runAuthorityFor: () => ({
          missionControlRunId: "arun-chat-001",
          runtimeToolCapability,
          allowExternalEffects: true,
        }),
      }),
    ),
    null,
    "legacy capability without a leased dispatch is insufficient",
  );
  assert.equal(
    createPartnershipsDiscoveryToolsForContext(
      context,
      dependencies({
        runAuthorityFor: () => ({
          missionControlRunId: "arun-chat-001",
          runtimeToolCapability,
          dispatchRunId: "dispatch-1",
          dispatchLeaseToken,
          allowExternalEffects: false,
        }),
      }),
    ),
    null,
  );
});

test("sends the canonical plan with exact parent and lease authority only in headers", async () => {
  const calls = [];
  const start = tool(
    dependencies({
      fetchImpl: async (url, init) => {
        calls.push({ url, init, body: JSON.parse(init.body) });
        return response(202, admitted());
      },
    }),
  );
  const result = await start.execute("tool-1", input);

  assert.equal(result.details.status, "completed");
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    "http://mission-control.internal:3000/api/runtime/partnerships-discovery",
  );
  assert.deepEqual(calls[0].body, {
    plan: {
      title: "Creators capilares España",
      sectors: ["hair care"],
      networks: ["instagram"],
      hashtags: ["#trasplantecapilar"],
      targetVolume: 25,
    },
  });
  assert.equal(
    calls[0].init.headers["X-Mission-Control-Run-Id"],
    "arun-chat-001",
  );
  assert.equal(calls[0].init.headers["X-Sancho-Dispatch-Run-Id"], "dispatch-1");
  assert.equal(
    calls[0].init.headers["X-Sancho-Dispatch-Lease-Token"],
    dispatchLeaseToken,
  );
  assert.equal(calls[0].init.headers["X-Sancho-Client-Slug"], undefined);
  assert.doesNotMatch(calls[0].init.body, /dispatch-1|runtime-secret/);
  assert.doesNotMatch(JSON.stringify(result), /runtime-secret|lease-token/i);
});

test("rejects unknown, unsupported and oversized model input before network I/O", async () => {
  let calls = 0;
  const start = tool(
    dependencies({
      fetchImpl: async () => {
        calls += 1;
        throw new Error("must not execute");
      },
    }),
  );
  const invalid = [
    { ...input, slug: "other-client" },
    { plan: { title: "x", sectors: ["beauty"], networks: ["tiktok"] } },
    { plan: { title: "x", sectors: [], networks: ["instagram"] } },
    {
      plan: {
        title: "x".repeat(161),
        sectors: ["beauty"],
        networks: ["instagram"],
      },
    },
    {
      plan: {
        title: "x",
        sectors: ["beauty", "BEAUTY"],
        networks: ["instagram"],
      },
    },
  ];
  for (const candidate of invalid) {
    const result = await start.execute("tool-invalid", candidate);
    assert.equal(result.details.code, "partnerships_discovery_request_invalid");
  }
  assert.equal(calls, 0);
});

test("accepts a replay receipt and maps changed-command conflict without retrying", async () => {
  const responses = [
    response(200, admitted({ created: false, replayed: true })),
    response(409, { error: "execution_command_conflict" }),
  ];
  let calls = 0;
  const start = tool(
    dependencies({
      fetchImpl: async () => {
        calls += 1;
        return responses.shift();
      },
    }),
  );
  const replay = await start.execute("tool-replay", input);
  const conflict = await start.execute("tool-drift", {
    plan: { ...input.plan, title: "Otro plan" },
  });

  assert.equal(replay.details.discovery.replayed, true);
  assert.equal(conflict.details.status, "failed");
  assert.equal(conflict.details.code, "execution_command_conflict");
  assert.equal(calls, 2);
});

test("fails closed when the control plane adds a polling surface or malformed receipt", async () => {
  for (const payload of [
    admitted({ statusUrl: "/api/partnerships/searches/admissions/xrun" }),
    admitted({ setupRunId: "different-run" }),
    admitted({ providerRows: [{ handle: "private" }] }),
  ]) {
    const start = tool(
      dependencies({ fetchImpl: async () => response(202, payload) }),
    );
    const result = await start.execute("tool-malformed", input);
    assert.equal(
      result.details.code,
      "partnerships_discovery_response_invalid",
    );
    assert.doesNotMatch(JSON.stringify(result), /private|statusUrl/);
  }
});
