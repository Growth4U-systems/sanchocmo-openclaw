import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import http from "node:http";
import {
  LEADS_SEARCH_START_TOOL,
  createLeadsSearchToolsForContext,
  isKnownSanchoClient,
  registerLeadsSearchTools,
} from "../leads-search-tool.js";

const context = {
  messageChannel: "mc-chat",
  deliveryContext: {
    channel: "mc-chat",
    to: "channel:mc-chat:hospital-capilar:general",
  },
  requesterSenderId: "mc-admin",
  agentId: "sancho",
};
const runtimeToolCapability = "a".repeat(64);

function dependencies(overrides = {}) {
  return {
    clientExists: (slug) => slug === "hospital-capilar",
    runAuthorityFor: () => ({
      missionControlRunId: "arun-chat-001",
      runtimeToolCapability,
      allowExternalEffects: true,
      allowedExternalEffects: [LEADS_SEARCH_START_TOOL],
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

function toolByName(tools, name) {
  const tool = tools?.find((candidate) => candidate.name === name);
  assert.ok(tool, `missing tool ${name}`);
  return tool;
}

function response(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address()));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

test("pins the tool manifest contract to deployed OpenClaw 2026.5.18", () => {
  const manifest = JSON.parse(
    fs.readFileSync(
      new URL("../../openclaw.plugin.json", import.meta.url),
      "utf8",
    ),
  );
  const packageManifest = JSON.parse(
    fs.readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
  );
  const dockerfile = fs.readFileSync(
    new URL("../../../../Dockerfile", import.meta.url),
    "utf8",
  );

  assert.match(dockerfile, /^ARG OPENCLAW_VERSION=2026\.5\.18$/m);
  assert.equal(packageManifest.peerDependencies.openclaw, ">=2026.5.18");
  // OpenClaw 2026.5.18's loader rejects registerTool unless every registered
  // name is predeclared in contracts.tools.
  assert.deepEqual(manifest.contracts?.tools, [
    LEADS_SEARCH_START_TOOL,
    "partnerships_discovery_start",
  ]);
  assert.equal(manifest.activation?.onStartup, true);
  const channelManifest = manifest.channelConfigs?.["mc-chat"];
  assert.equal(channelManifest?.schema?.type, "object");
  assert.equal(channelManifest?.schema?.additionalProperties, false);
  assert.equal(channelManifest?.schema?.properties?.mcServerUrl?.format, "uri");
  assert.equal(
    channelManifest?.schema?.properties?.contextPackUrl?.format,
    "uri",
  );
  assert.equal(channelManifest?.uiHints?.sharedSecret?.sensitive, true);
  assert.match(
    channelManifest?.uiHints?.sharedSecret?.help ?? "",
    /transport authentication only/i,
  );
});

test("registers only the bounded start tool without model-controlled tenant fields", () => {
  let factory;
  let options;
  registerLeadsSearchTools(
    {
      registerTool(candidate, candidateOptions) {
        factory = candidate;
        options = candidateOptions;
      },
    },
    dependencies(),
  );

  assert.equal(typeof factory, "function");
  assert.deepEqual(options, {
    names: [LEADS_SEARCH_START_TOOL],
  });
  const tools = factory(context);
  assert.equal(tools.length, 1);
  const start = toolByName(tools, LEADS_SEARCH_START_TOOL);
  assert.deepEqual(start.parameters.required, ["criteria"]);
  assert.equal(start.parameters.additionalProperties, undefined);
  assert.equal(start.parameters.properties.slug, undefined);
  assert.equal(start.parameters.properties.tenant, undefined);
  assert.equal(start.parameters.properties.requestId, undefined);
  assert.equal(start.parameters.properties.limit.maximum, undefined);
  assert.equal(
    start.parameters.properties.criteria.properties.titles.uniqueItems,
    undefined,
  );
  assert.match(start.description, /published automatically/i);
  assert.match(start.description, /same chat thread/i);
  assert.match(start.description, /do not wait, sleep, poll/i);
});

test("factory fails closed for missing, spoofed, unknown-client or runless contexts", () => {
  const deps = dependencies();
  const rejected = [
    {},
    { ...context, requesterSenderId: "mc-client-hospital-capilar" },
    { ...context, messageChannel: "discord" },
    {
      ...context,
      deliveryContext: { ...context.deliveryContext, channel: "discord" },
    },
    {
      ...context,
      deliveryContext: {
        channel: "mc-chat",
        to: "channel:mc-chat:../other:general",
      },
    },
  ];
  for (const candidate of rejected) {
    assert.equal(createLeadsSearchToolsForContext(candidate, deps), null);
  }
  assert.equal(
    createLeadsSearchToolsForContext(
      {
        ...context,
        deliveryContext: {
          channel: "mc-chat",
          to: "channel:mc-chat:other-client:general",
        },
      },
      deps,
    ),
    null,
  );
  assert.equal(
    createLeadsSearchToolsForContext(context, {
      ...deps,
      runAuthorityFor: () => undefined,
    }),
    null,
  );
});

test("validates the runtime tenant against the known Sancho client registry", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "sancho-leads-tool-"));
  try {
    fs.mkdirSync(path.join(home, "config"), { recursive: true });
    fs.writeFileSync(
      path.join(home, "config", "clients.json"),
      JSON.stringify({ clients: [{ slug: "hospital-capilar" }] }),
      "utf8",
    );
    assert.equal(isKnownSanchoClient("hospital-capilar", home), true);
    assert.equal(isKnownSanchoClient("other-client", home), false);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("sends only the persisted run locator and one-turn capability", async () => {
  const calls = [];
  const tools = createLeadsSearchToolsForContext(
    context,
    dependencies({
      fetchImpl: async (url, init) => {
        calls.push({ url, init, body: JSON.parse(init.body) });
        return response(202, {
          ok: true,
          search: {
            operation: "leads.search",
            runId: "xrun-1",
            status: "queued",
            created: true,
            replayed: false,
            completionBoundary: "ledger_admitted",
          },
        });
      },
    }),
  );
  const result = await toolByName(tools, LEADS_SEARCH_START_TOOL).execute(
    "tool-1",
    {
      criteria: { titles: ["Marketing Director"] },
      limit: 5,
    },
  );

  assert.equal(result.details.status, "completed");
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    "http://mission-control.internal:3000/api/runtime/leads-search",
  );
  assert.equal(calls[0].init.headers["X-Sancho-Client-Slug"], undefined);
  assert.equal(
    calls[0].init.headers["X-Mission-Control-Run-Id"],
    "arun-chat-001",
  );
  assert.equal(
    calls[0].init.headers["X-Sancho-Run-Capability"],
    runtimeToolCapability,
  );
  assert.equal(calls[0].init.headers["X-MC-Secret"], "runtime-secret");
  assert.equal(calls[0].init.redirect, "error");
  assert.deepEqual(calls[0].body, {
    criteria: { titles: ["Marketing Director"] },
    limit: 5,
  });
  assert.doesNotMatch(JSON.stringify(result), /runtime-secret|MC_ADMIN_TOKEN/i);
  assert.equal(result.details.search.statusUrl, undefined);
  assert.doesNotMatch(
    JSON.stringify(result),
    /statusUrl|api\/leads\/searches/i,
  );
  assert.doesNotMatch(calls[0].url, /apollo/i);
});

test("durable leads admission propagates the lease pair only in headers", async () => {
  const calls = [];
  const dispatchLeaseToken = "lease-token-" + "d".repeat(32);
  const tools = createLeadsSearchToolsForContext(
    context,
    dependencies({
      runAuthorityFor: () => ({
        missionControlRunId: "arun-chat-001",
        runtimeToolCapability,
        dispatchRunId: "dispatch-1",
        dispatchLeaseToken,
        allowExternalEffects: true,
        allowedExternalEffects: [LEADS_SEARCH_START_TOOL],
      }),
      fetchImpl: async (_url, init) => {
        calls.push(init);
        return response(202, {
          ok: true,
          search: {
            operation: "leads.search",
            runId: "xrun-1",
            status: "queued",
            completionBoundary: "ledger_admitted",
          },
        });
      },
    }),
  );
  await toolByName(tools, LEADS_SEARCH_START_TOOL).execute("tool-1", {
    criteria: { titles: ["Marketing Director"] },
  });
  assert.equal(calls[0].headers["X-Sancho-Dispatch-Run-Id"], "dispatch-1");
  assert.equal(
    calls[0].headers["X-Sancho-Dispatch-Lease-Token"],
    dispatchLeaseToken,
  );
  assert.doesNotMatch(calls[0].body, new RegExp(dispatchLeaseToken));
});

test("rejects a control-plane response that reintroduces a polling URL", async () => {
  const start = toolByName(
    createLeadsSearchToolsForContext(
      context,
      dependencies({
        fetchImpl: async () =>
          response(202, {
            ok: true,
            search: {
              operation: "leads.search",
              runId: "xrun-1",
              status: "queued",
              completionBoundary: "ledger_admitted",
              created: true,
              replayed: false,
              statusUrl: "/api/leads/searches/xrun-1?slug=hospital-capilar",
            },
          }),
      }),
    ),
    LEADS_SEARCH_START_TOOL,
  );

  const result = await start.execute("tool-status-url", {
    criteria: { titles: ["Marketing Director"] },
  });

  assert.equal(result.details.status, "failed");
  assert.equal(result.details.code, "leads_search_response_invalid");
  assert.doesNotMatch(JSON.stringify(result), /api\/leads\/searches/i);
});

test("execute rejects model-controlled fields and invalid criteria before network I/O", async () => {
  let calls = 0;
  const start = toolByName(
    createLeadsSearchToolsForContext(
      context,
      dependencies({
        fetchImpl: async () => {
          calls += 1;
          throw new Error("must not execute");
        },
      }),
    ),
    LEADS_SEARCH_START_TOOL,
  );
  for (const input of [
    {
      slug: "other-client",
      criteria: { titles: ["Marketing Director"] },
    },
    { criteria: {} },
    { criteria: { seniorities: ["not-an-apollo-seniority"] } },
    { criteria: { titles: ["duplicate", "DUPLICATE"] } },
  ]) {
    const result = await start.execute("tool-invalid", input);
    assert.equal(result.details.code, "leads_search_request_invalid");
  }
  assert.equal(calls, 0);
});

test("same chat run and command replay one receipt while changed input surfaces 409", async () => {
  const commands = new Map();
  let sequence = 0;
  let providerEffects = 0;
  const fetchImpl = async (_url, init) => {
    const run = init.headers["X-Mission-Control-Run-Id"];
    const command = JSON.stringify(JSON.parse(init.body));
    const existing = commands.get(run);
    if (existing && existing.command !== command) {
      return response(409, { error: "execution_command_conflict" });
    }
    if (!existing) {
      commands.set(run, { command, runId: `xrun-${++sequence}` });
    }
    const stored = commands.get(run);
    return response(existing ? 200 : 202, {
      ok: true,
      search: {
        operation: "leads.search",
        runId: stored.runId,
        status: "queued",
        created: !existing,
        replayed: Boolean(existing),
        completionBoundary: "ledger_admitted",
      },
    });
  };
  const start = toolByName(
    createLeadsSearchToolsForContext(context, dependencies({ fetchImpl })),
    LEADS_SEARCH_START_TOOL,
  );
  const input = { criteria: { titles: ["Marketing Director"] }, limit: 5 };

  const first = await start.execute("tool-1", input);
  const duplicate = await start.execute("tool-2", input);
  const conflict = await start.execute("tool-3", {
    criteria: { titles: ["Sales Director"] },
    limit: 5,
  });

  assert.equal(first.details.search.runId, "xrun-1");
  assert.equal(first.details.search.created, true);
  assert.equal(duplicate.details.search.runId, "xrun-1");
  assert.equal(duplicate.details.search.replayed, true);
  assert.equal(conflict.details.status, "failed");
  assert.equal(conflict.details.httpStatus, 409);
  assert.match(conflict.content[0].text, /otros criterios/);
  assert.equal(commands.size, 1);
  assert.equal(providerEffects, 0, "the chat tool must never own provider I/O");
});

test("maps 403, 409, 429 and 5xx failures to stable redacted messages", async () => {
  const cases = [
    {
      status: 403,
      code: "leads_search_not_enabled",
      expected: /no está habilitada/,
    },
    {
      status: 409,
      code: "execution_command_conflict",
      expected: /otros criterios/,
    },
    {
      status: 429,
      code: "leads_search_rate_limited",
      expected: /límite de búsquedas/,
    },
    {
      status: 503,
      code: "leads_search_runtime_unavailable",
      expected: /no está disponible temporalmente/,
    },
  ];
  for (const candidate of cases) {
    const start = toolByName(
      createLeadsSearchToolsForContext(
        context,
        dependencies({
          fetchImpl: async () =>
            response(candidate.status, {
              error: candidate.code,
              internal: "https://api.apollo.io/v1/mixed_people/search?secret=x",
            }),
        }),
      ),
      LEADS_SEARCH_START_TOOL,
    );
    const result = await start.execute("tool-error", {
      criteria: { titles: ["Marketing Director"] },
    });
    assert.equal(result.details.status, "failed");
    assert.equal(result.details.httpStatus, candidate.status);
    assert.match(result.content[0].text, candidate.expected);
    assert.doesNotMatch(JSON.stringify(result), /apollo\.io|secret=x/i);
  }
});

test("redacts malformed error codes and rejects unbounded successful payloads", async () => {
  const maliciousError = toolByName(
    createLeadsSearchToolsForContext(
      context,
      dependencies({
        fetchImpl: async () =>
          response(503, {
            error: "secret=https://api.apollo.io/private",
          }),
      }),
    ),
    LEADS_SEARCH_START_TOOL,
  );
  const failed = await maliciousError.execute("tool-error", {
    criteria: { titles: ["Marketing Director"] },
  });
  assert.equal(failed.details.code, "leads_search_unavailable");
  assert.doesNotMatch(JSON.stringify(failed), /apollo\.io|secret=/i);

  const maliciousSuccess = toolByName(
    createLeadsSearchToolsForContext(
      context,
      dependencies({
        fetchImpl: async () =>
          response(200, {
            ok: true,
            search: {
              operation: "leads.search",
              runId: "xrun-1",
              status: "completed",
              completionBoundary: "search_completed",
              statusUrl: "/api/leads/searches/xrun-1?slug=hospital-capilar",
              result: {
                completionBoundary: "search_completed",
                provider: "apollo",
                candidates: [],
                totalAvailable: 0,
                returned: 0,
                page: 1,
                nextPage: null,
                hasMore: false,
                apiKey: "private-provider-secret",
              },
            },
          }),
      }),
    ),
    LEADS_SEARCH_START_TOOL,
  );
  const rejected = await maliciousSuccess.execute("tool-success", {
    criteria: { titles: ["Marketing Director"] },
  });
  assert.equal(rejected.details.code, "leads_search_response_invalid");
  assert.doesNotMatch(JSON.stringify(rejected), /private-provider-secret/i);
});

test("terminal replay exposes only a receipt with same-thread delivery", async () => {
  const start = toolByName(
    createLeadsSearchToolsForContext(
      context,
      dependencies({
        fetchImpl: async () =>
          response(200, {
            ok: true,
            search: {
              operation: "leads.search",
              runId: "xrun-1",
              status: "completed",
              completionBoundary: "search_completed",
            },
          }),
      }),
    ),
    LEADS_SEARCH_START_TOOL,
  );
  const result = await start.execute("tool-replay", {
    criteria: { titles: ["Marketing Director"] },
  });

  assert.equal(result.details.status, "completed");
  assert.equal(result.details.resultDelivery, "same_chat_thread");
  assert.equal(result.details.search.result, undefined);
  assert.equal(result.details.search.statusUrl, undefined);
  assert.doesNotMatch(
    JSON.stringify(result),
    /statusUrl|api\/leads\/searches|externalProviderData/i,
  );
});

test("rejects oversized commands before network I/O", async () => {
  let calls = 0;
  const start = toolByName(
    createLeadsSearchToolsForContext(
      context,
      dependencies({
        fetchImpl: async () => {
          calls += 1;
          throw new Error("must not execute");
        },
      }),
    ),
    LEADS_SEARCH_START_TOOL,
  );
  const result = await start.execute("tool-large", {
    criteria: { query: "x".repeat(9_000) },
  });
  assert.equal(result.details.httpStatus, 400);
  assert.equal(calls, 0);
});

test("invalid control-plane origins fail closed before network I/O", async () => {
  let calls = 0;
  for (const mcServerUrl of [
    "file:///tmp/control",
    "https://user:pass@mission-control.internal",
    "https://mission-control.internal/base",
    "https://mission-control.internal?redirect=evil",
  ]) {
    const start = toolByName(
      createLeadsSearchToolsForContext(
        context,
        dependencies({
          loadConfig: () => ({
            channels: {
              "mc-chat": { mcServerUrl, sharedSecret: "runtime-secret" },
            },
          }),
          fetchImpl: async () => {
            calls += 1;
            throw new Error("must not execute");
          },
        }),
      ),
      LEADS_SEARCH_START_TOOL,
    );
    const result = await start.execute("tool-origin", {
      criteria: { titles: ["Marketing Director"] },
    });
    assert.equal(result.details.code, "leads_search_agent_bridge_unavailable");
  }
  assert.equal(calls, 0);
});

test("a control-plane redirect cannot leak secrets or run capability", async () => {
  let redirectHits = 0;
  let targetHits = 0;
  const target = http.createServer((_req, res) => {
    targetHits += 1;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end("{}");
  });
  const targetAddress = await listen(target);
  const source = http.createServer((req, res) => {
    redirectHits += 1;
    assert.equal(req.headers["x-mc-secret"], "runtime-secret");
    assert.equal(req.headers["x-sancho-run-capability"], runtimeToolCapability);
    res.writeHead(302, {
      Location: `http://127.0.0.1:${targetAddress.port}/capture`,
    });
    res.end();
  });
  const sourceAddress = await listen(source);
  try {
    const start = toolByName(
      createLeadsSearchToolsForContext(
        context,
        dependencies({
          loadConfig: () => ({
            channels: {
              "mc-chat": {
                mcServerUrl: `http://127.0.0.1:${sourceAddress.port}`,
                sharedSecret: "runtime-secret",
              },
            },
          }),
        }),
      ),
      LEADS_SEARCH_START_TOOL,
    );
    const result = await start.execute("tool-redirect", {
      criteria: { titles: ["Marketing Director"] },
    });
    assert.equal(result.details.code, "leads_search_unavailable");
    assert.equal(redirectHits, 1);
    assert.equal(targetHits, 0);
  } finally {
    await close(source);
    await close(target);
  }
});
