import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import type { AgentRun } from "../data/agent-runs";
import { durableExecutionMcChatOrigin } from "../durable-execution/execution-origin";
import type {
  ExecutionOriginControlRepository,
  ExecutionRun,
} from "../execution-control";
import { buildMcChatContextBlock } from "../runtime/agent-contract/mc-chat-context.mjs";
import { parseRuntimeControlReply } from "../runtime/agent-contract/control-reply.mjs";
import { processRuntimeControlReply } from "../runtime/control-actions";
import { resolveMcChatExecutionOrigin } from "../runtime/mc-chat-execution-origin";

const timestamp = "2026-07-22T12:00:00.000Z";
const tenantSlug = "acme";
const threadId = `${tenantSlug}:leads`;
const parentRunId = "run-neutral-effect-parent-1";
const authoritySecrets = {
  capability: `cap_${"c".repeat(64)}`,
  tenant: "tenant-authority-must-stay-server-side",
  callback: "https://callback.invalid/private-authority",
};

type PersistedRuntime = "openclaw" | "hermes" | "external-http";
type EffectFixture = "leads" | "partnerships";

const runtimeMatrix: Array<{
  label: string;
  contextRuntimeId: string;
  persistedRuntime: PersistedRuntime;
  effect: EffectFixture;
}> = [
  {
    label: "OpenClaw",
    contextRuntimeId: "openclaw",
    persistedRuntime: "openclaw",
    effect: "leads",
  },
  {
    label: "Hermes",
    contextRuntimeId: "hermes",
    persistedRuntime: "hermes",
    effect: "partnerships",
  },
  {
    label: "external-http",
    contextRuntimeId: "external-http",
    persistedRuntime: "external-http",
    effect: "leads",
  },
  {
    label: "Codex engine over external-http",
    contextRuntimeId: "codex",
    persistedRuntime: "external-http",
    effect: "partnerships",
  },
  {
    label: "Claude engine over external-http",
    contextRuntimeId: "claude-code",
    persistedRuntime: "external-http",
    effect: "leads",
  },
];

const effectFixtures = {
  leads: {
    name: "leads_search_start",
    arguments: {
      criteria: { titles: ["Founder"] },
      limit: 5,
    },
    ack: /Búsqueda de leads admitida en la ejecución durable/,
  },
  partnerships: {
    name: "partnerships_discovery_start",
    arguments: {
      plan: {
        title: "Partners capilares España",
        sectors: ["hair care"],
        networks: ["instagram"],
        tiers: ["micro"],
        audienceEsMinPct: 60,
        targetVolume: 25,
      },
    },
    ack: /Discovery de partnerships admitido en la ejecución durable/,
  },
} as const;

function effectMarker(effect: EffectFixture): string {
  const fixture = effectFixtures[effect];
  return `:::sancho-effect\n${JSON.stringify({
    name: fixture.name,
    arguments: fixture.arguments,
  })}\n:::`;
}

function rootTurnContext(overrides: Record<string, unknown> = {}) {
  return {
    slug: tenantSlug,
    threadId,
    missionControlRunId: parentRunId,
    parentCapability: authoritySecrets.capability,
    respondingAgent: "sancho",
    userText: "Ejecuta esta operación ahora",
    userId: "mc-admin",
    userName: "Admin",
    isAdmin: true,
    senderRole: "admin" as const,
    readOnly: false,
    controlDepth: 0,
    temporaryAgent: false,
    ...overrides,
  };
}

function executionRun(): ExecutionRun {
  return {
    id: "xrun-neutral-effect-1",
    tenantKey: tenantSlug,
    idempotencyKey: "acme:neutral-effect:1",
    aggregateType: "leads_search",
    aggregateId: "search-neutral-effect-1",
    operation: "leads.search",
    mode: "canary",
    status: "completed",
    metadata: {
      executionOrigin: durableExecutionMcChatOrigin(parentRunId),
    },
    availableAt: timestamp,
    claimCount: 1,
    handlerAttempt: 1,
    createdAt: timestamp,
    startedAt: timestamp,
    finishedAt: timestamp,
    updatedAt: timestamp,
  };
}

function persistedParentRun(runtime: PersistedRuntime): AgentRun {
  return {
    id: parentRunId,
    threadId,
    runtime,
    agent: "sancho",
    status: "completed",
    input: {
      slug: tenantSlug,
      threadId,
      isAdmin: true,
      senderRole: "admin",
      readOnly: false,
      userId: "mc-admin",
    },
    createdAt: timestamp,
    finishedAt: timestamp,
    updatedAt: timestamp,
  };
}

function activeEffectParentRun(effect: EffectFixture = "leads") {
  return {
    id: parentRunId,
    threadId,
    status: "running" as const,
    input: {
      slug: tenantSlug,
      threadId,
      runtimeEffectMode: "execution-origin-v1",
      runtimeEffectIntent: [effectFixtures[effect].name],
      runtimeToolCapabilitySha256: createHash("sha256")
        .update(authoritySecrets.capability)
        .digest("hex"),
      userId: "mc-admin",
      isAdmin: true,
      senderRole: "admin",
      readOnly: false,
      controlDepth: 0,
      temporaryAgent: false,
    },
  };
}

function trustedOriginRepository(
  run: ExecutionRun,
): Pick<ExecutionOriginControlRepository, "getRunTrustedExecutionOrigin"> {
  return {
    getRunTrustedExecutionOrigin: async (input) => {
      assert.deepEqual(input, { tenantKey: run.tenantKey, runId: run.id });
      return {
        tenantKey: run.tenantKey,
        runId: run.id,
        origin: durableExecutionMcChatOrigin(parentRunId),
      };
    },
  };
}

function assertSecretsAbsent(value: unknown): void {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  for (const secret of Object.values(authoritySecrets)) {
    assert.equal(serialized.includes(secret), false, `leaked ${secret}`);
  }
}

test("runtime-neutral durable-effect rail conformance", async (suite) => {
  await suite.test("root admin context publishes the same closed protocol", async (matrix) => {
    for (const runtime of runtimeMatrix) {
      await matrix.test(runtime.label, () => {
        const block = buildMcChatContextBlock({
          slug: tenantSlug,
          threadId,
          runtimeId: runtime.contextRuntimeId,
          requestedAgent: "sancho",
          canDelegate: true,
          isAdmin: true,
          senderRole: "admin",
          readOnly: false,
          controlDepth: 0,
          temporaryAgent: false,
          runtimeEffectIntent: [effectFixtures[runtime.effect].name],
          // Unknown authority-like fields model an adapter accidentally
          // forwarding its private callback state into the prompt.
          parentCapability: authoritySecrets.capability,
          tenantKey: authoritySecrets.tenant,
          callbackUrl: authoritySecrets.callback,
        });

        assert.match(block, new RegExp(`runtime_id: ${runtime.contextRuntimeId}`));
        assert.match(block, /:::sancho-effect/);
        assert.match(block, new RegExp(effectFixtures[runtime.effect].name));
        assert.match(block, /el servidor añadirá el recibo autoritativo/);
        assertSecretsAbsent(block);
      });
    }
  });

  await suite.test("marker parsing and dispatch are identical across runtimes", async (matrix) => {
    for (const runtime of runtimeMatrix) {
      await matrix.test(runtime.label, async () => {
        const fixture = effectFixtures[runtime.effect];
        const marker = effectMarker(runtime.effect);
        const rawReply = `Voy a solicitar la operación.\n\n${marker}\n\n${marker}`;
        const parsed = parseRuntimeControlReply(rawReply, {
          respondingAgent: "sancho",
        });

        assert.equal(parsed.effectRequests.length, 1);
        assert.equal(parsed.effectRequests[0]?.name, fixture.name);
        assert.deepEqual(parsed.effectRequests[0]?.arguments, fixture.arguments);
        assert.equal(parsed.text.includes(":::sancho-effect"), false);
        assert.equal(parsed.blockedCount, 1);
        assertSecretsAbsent(parsed);

        let admissions = 0;
        const result = await processRuntimeControlReply(
          rawReply,
          rootTurnContext(),
          {
            effectDependencies: {
              resolveParentRun: async (runId) => {
                assert.equal(runId, parentRunId);
                return activeEffectParentRun(runtime.effect);
              },
              admitLeadsSearch: (async (admissionContext, input) => {
                assert.equal(runtime.effect, "leads");
                admissions += 1;
                assert.deepEqual(admissionContext, {
                  tenantSlug,
                  agentRunId: parentRunId,
                });
                assert.deepEqual(input, effectFixtures.leads.arguments);
                return {
                  identity: {
                    requestId: "request-neutral-1",
                    commandFingerprint: "fingerprint-neutral-1",
                  },
                  receipt: {
                    operation: "leads.search",
                    runId: "xrun-leads-neutral-1",
                    status: "queued",
                    completionBoundary: "ledger_admitted",
                    created: true,
                    replayed: false,
                  },
                };
              }) as never,
              admitPartnershipsDiscovery: (async (admissionContext, input) => {
                assert.equal(runtime.effect, "partnerships");
                admissions += 1;
                assert.deepEqual(admissionContext, {
                  tenantSlug,
                  threadId,
                  agentRunId: parentRunId,
                });
                assert.deepEqual(input, effectFixtures.partnerships.arguments);
                return {
                  identity: {
                    commandId: "command-neutral-1",
                    commandFingerprint: "fingerprint-neutral-1",
                  },
                  receipt: {
                    operation: "partnerships.discovery",
                    runId: "xrun-partnerships-neutral-1",
                    setupRunId: "xrun-partnerships-neutral-1",
                    searchId: "search-partnerships-neutral-1",
                    status: "queued",
                    completionBoundary: "ledger_admitted",
                    created: true,
                    replayed: false,
                  },
                };
              }) as never,
            },
          },
        );

        assert.equal(admissions, 1);
        assert.equal(result.effectsDispatched, 1);
        assert.equal(result.actionsDispatched, 1);
        assert.match(result.text, fixture.ack);
        assert.equal(result.text.includes(":::sancho-effect"), false);
        assertSecretsAbsent(result);
      });
    }
  });

  await suite.test("client and nested or read-only turns fail closed", async (negative) => {
    const deniedTurns = [
      {
        label: "client",
        context: {
          userId: `client:${tenantSlug}`,
          isAdmin: false,
          senderRole: "client" as const,
        },
      },
      { label: "readOnly", context: { readOnly: true } },
      { label: "depth1", context: { controlDepth: 1 } },
      { label: "temporary", context: { temporaryAgent: true } },
    ];

    for (const denied of deniedTurns) {
      await negative.test(denied.label, async () => {
        const prompt = buildMcChatContextBlock({
          slug: tenantSlug,
          threadId,
          runtimeId: "external-http",
          requestedAgent: "sancho",
          isAdmin: true,
          senderRole: "admin",
          readOnly: false,
          controlDepth: 0,
          temporaryAgent: false,
          runtimeEffectIntent: ["leads_search_start"],
          ...denied.context,
        });
        assert.equal(prompt.includes(":::sancho-effect"), false);

        let admissions = 0;
        const result = await processRuntimeControlReply(
          effectMarker("leads"),
          rootTurnContext(denied.context),
          {
            effectDependencies: {
              resolveParentRun: async () => activeEffectParentRun("leads"),
              admitLeadsSearch: (async () => {
                admissions += 1;
                throw new Error("denied turn reached admission");
              }) as never,
            },
          },
        );

        assert.equal(admissions, 0);
        assert.equal(result.effectsDispatched, 0);
        assert.equal(result.text.includes(":::sancho-effect"), false);
        assert.doesNotMatch(result.text, /Búsqueda de leads admitida/);
        assert.match(result.text, /no tiene autoridad administrativa de escritura/i);
        assertSecretsAbsent(result);
      });
    }
  });

  await suite.test("forged capability, tenant and callback fields never reach admission", async () => {
    const forgedMarker = `:::sancho-effect\n${JSON.stringify({
      name: "leads_search_start",
      arguments: {
        criteria: { titles: ["Founder"] },
        tenant: authoritySecrets.tenant,
        runtimeToolCapability: authoritySecrets.capability,
        callbackUrl: authoritySecrets.callback,
      },
    })}\n:::`;
    let admissions = 0;
    const result = await processRuntimeControlReply(
      forgedMarker,
      rootTurnContext(),
      {
        effectDependencies: {
          resolveParentRun: async () => activeEffectParentRun("leads"),
          admitLeadsSearch: (async () => {
            admissions += 1;
            throw new Error("forged authority reached admission");
          }) as never,
        },
      },
    );

    assert.equal(admissions, 0);
    assert.equal(result.effectsDispatched, 0);
    assert.equal(result.text.includes(":::sancho-effect"), false);
    assert.match(result.text, /criterios no cumplen el contrato acotado/i);
    assertSecretsAbsent(result);
  });

  await suite.test("trusted origin returns to the persisted runtime chat", async (matrix) => {
    for (const runtime of runtimeMatrix) {
      await matrix.test(runtime.label, async () => {
        const run = executionRun();
        const resolved = await resolveMcChatExecutionOrigin(run, {
          originRepository: trustedOriginRepository(run),
          resolveAgentRun: async (runId) => {
            assert.equal(runId, parentRunId);
            return persistedParentRun(runtime.persistedRuntime);
          },
          resolveAgentRunEvents: async () => [],
        });

        assert.ok(resolved);
        assert.equal(resolved.parentRun.runtime, runtime.persistedRuntime);
        assert.equal(resolved.tenantSlug, tenantSlug);
        assert.equal(resolved.threadId, threadId);
        assert.equal(resolved.origin.parentAgentRunId, parentRunId);
        if (runtime.contextRuntimeId === "codex" || runtime.contextRuntimeId === "claude-code") {
          assert.equal(resolved.parentRun.runtime, "external-http");
        }
      });
    }
  });
});
