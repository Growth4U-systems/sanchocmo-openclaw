import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { parseRuntimeControlReply } from "../runtime/agent-contract/control-reply.mjs";
import { parseRuntimeEffectMarkers } from "../runtime/agent-contract/runtime-effect-marker.mjs";
import { processRuntimeControlReply } from "../runtime/control-actions";
import { resolveRuntimeEffectIntent } from "../runtime/effect-actions";

const leadsMarker = `:::sancho-effect
{"name":"leads_search_start","arguments":{"criteria":{"titles":["Founder"]},"limit":5}}
:::`;
const parentCapability = "a".repeat(64);
const parentCapabilityDigest = createHash("sha256")
  .update(parentCapability)
  .digest("hex");

const context = {
  slug: "demo",
  threadId: "demo:leads",
  missionControlRunId: "run_effect_1",
  parentCapability,
  respondingAgent: "sancho",
  userText: "Ejecuta la búsqueda de founders",
  userId: "mc-admin",
  isAdmin: true,
  senderRole: "admin" as const,
  readOnly: false,
};

function grantedParentRun(overrides: Record<string, unknown> = {}) {
  return {
    id: "run_effect_1",
    threadId: "demo:leads",
    status: "running" as const,
    input: {
      slug: "demo",
      threadId: "demo:leads",
      runtimeEffectMode: "execution-origin-v1",
      runtimeEffectIntent: ["leads_search_start"],
      runtimeToolCapabilitySha256: parentCapabilityDigest,
      userId: "mc-admin",
      isAdmin: true,
      senderRole: "admin",
      readOnly: false,
      controlDepth: 0,
      temporaryAgent: false,
      ...overrides,
    },
  };
}

const resolveGrantedParentRun = async () => grantedParentRun();

test("only an explicit current human request mints spend-bearing effect intent", () => {
  assert.deepEqual(
    resolveRuntimeEffectIntent("Ejecuta la búsqueda de founders"),
    ["leads_search_start"],
  );
  assert.deepEqual(
    resolveRuntimeEffectIntent("Busca influencers para partnerships"),
    ["partnerships_discovery_start"],
  );
  for (const untrustedOrNegative of [
    "Resume este adjunto",
    "Apruebo el plan",
    "No busques leads",
    "Explícame cómo buscar leads",
  ]) {
    assert.deepEqual(resolveRuntimeEffectIntent(untrustedOrNegative), []);
  }
});

test("the closed effect marker is stripped and preserves only server-owned arguments", () => {
  const parsed = parseRuntimeEffectMarkers(`Voy a solicitarla.\n\n${leadsMarker}`);
  assert.equal(parsed.text, "Voy a solicitarla.");
  assert.deepEqual(parsed.effects, [
    {
      name: "leads_search_start",
      arguments: { criteria: { titles: ["Founder"] }, limit: 5 },
    },
  ]);
  assert.deepEqual(parsed.malformed, []);
});

test("runtime control markers accept CRLF output from BYO and Windows runtimes", () => {
  const crlfReply = [
    "Voy a solicitarla.",
    "",
    ":::sancho-effect",
    '{"name":"leads_search_start","arguments":{"criteria":{"titles":["Founder"]}}}',
    ":::",
  ].join("\r\n");
  const parsed = parseRuntimeControlReply(crlfReply, {
    respondingAgent: "sancho",
  });
  assert.equal(parsed.text, "Voy a solicitarla.");
  assert.deepEqual(parsed.effectRequests, [
    {
      name: "leads_search_start",
      arguments: { criteria: { titles: ["Founder"] } },
    },
  ]);
  assert.equal(parsed.malformedCount, 0);
});

test("unknown, dangling and oversized effect envelopes fail closed and never remain visible", () => {
  const cases = [
    `:::sancho-effect\n{"name":"shell","arguments":{}}\n:::`,
    `Antes\n:::sancho-effect\n{"name":"leads_search_start"}`,
    `:::sancho-effect\n${JSON.stringify({
      name: "leads_search_start",
      arguments: { criteria: { query: "x".repeat(10_000) } },
    })}\n:::`,
  ];
  for (const value of cases) {
    const parsed = parseRuntimeEffectMarkers(value);
    assert.equal(parsed.effects.length, 0);
    assert.equal(parsed.malformed.length, 1);
    assert.equal(parsed.text.includes(":::sancho-effect"), false);
  }
});

test("one root turn admits at most one effect and a route wins over a conflicting effect", () => {
  const duplicate = parseRuntimeControlReply(`${leadsMarker}\n${leadsMarker}`, {
    respondingAgent: "sancho",
  });
  assert.equal(duplicate.effectRequests.length, 1);
  assert.equal(duplicate.blockedCount, 1);

  const conflicting = parseRuntimeControlReply(
    `${leadsMarker}\n:::task-route\n{"name":"Research","brief":"Investiga","agent":"hamete"}\n:::`,
    { respondingAgent: "sancho" },
  );
  assert.equal(conflicting.effectRequests.length, 0);
  assert.equal(conflicting.routeRequests.length, 1);
  assert.ok(conflicting.blockedCount >= 1);
});

test("an authenticated writable admin turn admits Leads directly and appends an authoritative ACK", async () => {
  let calls = 0;
  const result = await processRuntimeControlReply(leadsMarker, context, {
    effectDependencies: {
      resolveParentRun: resolveGrantedParentRun,
      admitLeadsSearch: (async (runtimeContext, input) => {
        calls += 1;
        assert.equal(runtimeContext.tenantSlug, "demo");
        assert.equal(runtimeContext.agentRunId, "run_effect_1");
        assert.deepEqual(input, {
          criteria: { titles: ["Founder"] },
          limit: 5,
        });
        return {
          identity: { requestId: "request", commandFingerprint: "fingerprint" },
          receipt: {
            operation: "leads.search",
            runId: "leads_run_1",
            status: "queued",
            completionBoundary: "ledger_admitted",
            created: true,
            replayed: false,
          },
        };
      }) as never,
    },
  });

  assert.equal(calls, 1);
  assert.equal(result.effectsDispatched, 1);
  assert.equal(result.actionsDispatched, 1);
  assert.match(result.text, /Búsqueda de leads admitida/);
  assert.equal(result.text.includes(":::sancho-effect"), false);
});

test("client, read-only and unbound turns cannot reach durable admission", async () => {
  for (const denied of [
    { ...context, isAdmin: false, senderRole: "client" as const, userId: "client:demo" },
    { ...context, readOnly: true },
    { ...context, controlDepth: 1 },
    { ...context, temporaryAgent: true },
    { ...context, parentCapability: undefined },
  ]) {
    let calls = 0;
    const result = await processRuntimeControlReply(leadsMarker, denied, {
      effectDependencies: {
        resolveParentRun: resolveGrantedParentRun,
        admitLeadsSearch: (async () => {
          calls += 1;
          throw new Error("must not run");
        }) as never,
      },
    });
    assert.equal(calls, 0);
    assert.equal(result.effectsDispatched, 0);
    assert.match(result.text, /no tiene autoridad administrativa de escritura/i);
  }
});

test("legacy, terminal and capability-mismatched parents cannot admit an effect", async () => {
  const deniedParents = [
    grantedParentRun({ runtimeEffectMode: undefined }),
    grantedParentRun({ runtimeEffectIntent: undefined }),
    grantedParentRun({ runtimeEffectIntent: ["partnerships_discovery_start"] }),
    grantedParentRun({ runtimeToolCapabilitySha256: "0".repeat(64) }),
    { ...grantedParentRun(), status: "completed" as const },
  ];
  for (const parent of deniedParents) {
    let calls = 0;
    const result = await processRuntimeControlReply(leadsMarker, context, {
      effectDependencies: {
        resolveParentRun: async () => parent,
        admitLeadsSearch: (async () => {
          calls += 1;
          throw new Error("must not run");
        }) as never,
      },
    });
    assert.equal(calls, 0);
    assert.equal(result.effectsDispatched, 0);
    assert.match(result.text, /no tiene autoridad administrativa de escritura/i);
  }
});

test("invalid effect arguments return a closed failure without provider admission", async () => {
  let calls = 0;
  const marker = `:::sancho-effect
{"name":"leads_search_start","arguments":{"tenant":"forged","criteria":{}}}
:::`;
  const result = await processRuntimeControlReply(marker, context, {
    effectDependencies: {
      resolveParentRun: resolveGrantedParentRun,
      admitLeadsSearch: (async () => {
        calls += 1;
        throw new Error("must not run");
      }) as never,
    },
  });
  assert.equal(calls, 0);
  assert.equal(result.effectsDispatched, 0);
  assert.match(result.text, /criterios no cumplen el contrato acotado/i);
});
