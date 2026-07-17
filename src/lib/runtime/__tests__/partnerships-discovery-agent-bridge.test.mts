import assert from "node:assert/strict";
import test from "node:test";
import type {
  CreateExecutionRunInput,
  ExecutionControlRepository,
} from "@/lib/execution-control";
import { DiscoveryCommandError } from "@/lib/partnerships";
import {
  admitPartnershipsDiscoveryFromAgent,
  PartnershipsDiscoveryAgentBridgeError,
  partnershipsDiscoveryAgentAdmissionIdentity,
  type PartnershipsDiscoveryAgentBridgeDependencies,
} from "../partnerships-discovery-agent-bridge";
import { parsePartnershipsDiscoveryStartInput } from "../partnerships-discovery-tool-contract.mjs";

const context = {
  tenantSlug: "hospital-capilar",
  threadId: "hospital-capilar:general",
  agentRunId: "arun-chat-001",
};
const input = {
  plan: {
    title: "Creators capilares España",
    sectors: ["Hair Care"],
    networks: ["Instagram"],
    targetVolume: 25,
  },
};
const originCommandRepository = {
  async claimExecutionOriginCommand(claim: {
    tenantKey: string;
    origin: {
      schemaVersion: 1;
      kind: "mc_chat_parent_run";
      parentAgentRunId: string;
    };
    operation: string;
  }) {
    return {
      tenantKey: claim.tenantKey,
      origin: claim.origin,
      operation: claim.operation,
      claimedAt: "2026-07-16T10:00:00.000Z",
    };
  },
};

function canaryDependencies(
  overrides: Partial<PartnershipsDiscoveryAgentBridgeDependencies> = {},
): PartnershipsDiscoveryAgentBridgeDependencies {
  return {
    originCommandRepository,
    policyFor: () => ({
      mode: "canary",
      enabled: true,
      reason: "enabled",
    }),
    workerBootEnabled: () => true,
    ...overrides,
  };
}

function pending(setupRunId = "xrun-setup-1") {
  return {
    kind: "pending" as const,
    accepted: true as const,
    ready: false as const,
    setupRunId,
    searchId: "ds-1234567890abcdef1234",
    status: "queued" as const,
    statusUrl: `/api/partnerships/searches/admissions/${setupRunId}?slug=hospital-capilar`,
    replayed: false,
  };
}

test("the model command is closed, bounded and canonicalized on the server", () => {
  assert.deepEqual(parsePartnershipsDiscoveryStartInput(input), {
    plan: {
      title: "Creators capilares España",
      sectors: ["hair care"],
      networks: ["instagram"],
      targetVolume: 25,
    },
  });
  for (const invalid of [
    { ...input, commandId: "model-id" },
    { plan: { ...input.plan, networks: ["tiktok"] } },
    { plan: { ...input.plan, targetVolume: 101 } },
    { plan: { ...input.plan, unknown: true } },
  ]) {
    assert.equal(parsePartnershipsDiscoveryStartInput(invalid), null);
  }
});

test("idempotency anchor comes only from tenant plus parent run while command drift is observable", () => {
  const first = partnershipsDiscoveryAgentAdmissionIdentity({
    tenantSlug: context.tenantSlug,
    agentRunId: context.agentRunId,
    plan: input.plan,
  });
  const changed = partnershipsDiscoveryAgentAdmissionIdentity({
    tenantSlug: context.tenantSlug,
    agentRunId: context.agentRunId,
    plan: { ...input.plan, title: "Otro plan" },
  });
  assert.equal(first.commandId, changed.commandId);
  assert.notEqual(first.commandFingerprint, changed.commandFingerprint);
  assert.doesNotMatch(first.commandId, /Creators|capilares|España/);
});

test("admission fixes tenant, thread, mode and command id and attests origin on setup plus child", async () => {
  const creates: CreateExecutionRunInput[] = [];
  const repository = {
    async createRun(command: CreateExecutionRunInput) {
      creates.push(command);
      return { run: { id: `xrun-${creates.length}` }, created: true } as never;
    },
    async createRunWithTrustedOrigin(input: {
      command: CreateExecutionRunInput;
      origin: Record<string, unknown>;
    }) {
      return this.createRun({
        ...input.command,
        metadata: {
          ...(input.command.metadata ?? {}),
          executionOrigin: input.origin,
        },
      });
    },
  } as unknown as ExecutionControlRepository;
  let capturedOptions: Record<string, unknown> | undefined;
  let capturedDependencies: Record<string, unknown> | undefined;
  const result = await admitPartnershipsDiscoveryFromAgent(
    context,
    input,
    canaryDependencies({
      repository,
      createSearch: (async (options, dependencies) => {
        capturedOptions = options;
        capturedDependencies = dependencies as unknown as Record<
          string,
          unknown
        >;
        await dependencies.repository!.createRun({
          tenantKey: options.slug,
          aggregateType: "partnerships.search",
          aggregateId: "hospital-capilar:ds-1",
          operation: "partnerships.discovery.setup",
          idempotencyKey: "setup-1",
          metadata: {
            source: "test",
            executionOrigin: {
              kind: "mc_chat_parent_run",
              parentAgentRunId: "model-spoof",
            },
          },
        });
        await dependencies.repository!.createRun({
          tenantKey: options.slug,
          aggregateType: "partnerships.search",
          aggregateId: "hospital-capilar:ds-1",
          operation: "partnerships.discovery",
          idempotencyKey: "child-1",
          metadata: { source: "test" },
        });
        return pending();
      }) as never,
    }),
  );

  assert.deepEqual(capturedOptions, {
    slug: "hospital-capilar",
    plan: {
      title: "Creators capilares España",
      sectors: ["hair care"],
      networks: ["instagram"],
      targetVolume: 25,
    },
    threadId: "hospital-capilar:general",
    commandId: result.identity.commandId,
    executionIntent: "auto",
  });
  assert.deepEqual(
    (capturedDependencies?.setup as Record<string, unknown>).inlineTimeoutMs,
    0,
  );
  assert.equal(creates.length, 2);
  for (const command of creates) {
    assert.deepEqual(command.metadata?.executionOrigin, {
      schemaVersion: 1,
      kind: "mc_chat_parent_run",
      parentAgentRunId: "arun-chat-001",
    });
  }
  assert.equal(creates[0].metadata?.source, "test");
  assert.deepEqual(result.receipt, {
    operation: "partnerships.discovery",
    runId: "xrun-setup-1",
    setupRunId: "xrun-setup-1",
    searchId: "ds-1234567890abcdef1234",
    status: "queued",
    completionBoundary: "ledger_admitted",
    created: true,
    replayed: false,
  });
});

test("rollout and worker authority fail before repository construction or admission", async () => {
  let calls = 0;
  const createSearch = (async () => {
    calls += 1;
    return pending();
  }) as never;
  await assert.rejects(
    admitPartnershipsDiscoveryFromAgent(
      context,
      input,
      canaryDependencies({
        policyFor: () => ({
          mode: "off",
          enabled: false,
          reason: "disabled",
        }),
        createSearch,
      }),
    ),
    (error: unknown) =>
      error instanceof PartnershipsDiscoveryAgentBridgeError &&
      error.code === "partnerships_discovery_not_enabled" &&
      error.status === 403,
  );
  await assert.rejects(
    admitPartnershipsDiscoveryFromAgent(
      context,
      input,
      canaryDependencies({ workerBootEnabled: () => false, createSearch }),
    ),
    (error: unknown) =>
      error instanceof PartnershipsDiscoveryAgentBridgeError &&
      error.code === "partnerships_discovery_runtime_disabled" &&
      error.status === 503,
  );
  assert.equal(calls, 0);
});

test("contract-v2 capability preflight fails before setup, campaign, search or provider work", async () => {
  let preflights = 0;
  let createSearchCalls = 0;
  let campaignCalls = 0;
  let providerCalls = 0;
  await assert.rejects(
    admitPartnershipsDiscoveryFromAgent(
      context,
      input,
      canaryDependencies({
        env: {
          PARTNERSHIPS_DISCOVERY_EXECUTION_V2: "canary",
          PARTNERSHIPS_DISCOVERY_V2_SLUGS: "hospital-capilar",
          PARTNERSHIPS_DISCOVERY_ARTIFACT_STORE: "local-persistent-single-host",
          PARTNERSHIPS_DISCOVERY_EFFECTS_V2: "canary",
        },
        preflightV2: async () => {
          preflights += 1;
          throw new Error("Yalc contract unavailable");
        },
        createSearch: (async () => {
          createSearchCalls += 1;
          campaignCalls += 1;
          providerCalls += 1;
          return pending();
        }) as never,
      }),
    ),
    (error: unknown) =>
      error instanceof PartnershipsDiscoveryAgentBridgeError &&
      error.code === "partnerships_discovery_runtime_disabled" &&
      error.status === 503,
  );
  assert.equal(preflights, 1);
  assert.equal(createSearchCalls, 0);
  assert.equal(campaignCalls, 0);
  assert.equal(providerCalls, 0);
});

test("same parent with changed plan maps the product conflict to a stable 409", async () => {
  await assert.rejects(
    admitPartnershipsDiscoveryFromAgent(
      context,
      input,
      canaryDependencies({
        repository: {} as ExecutionControlRepository,
        createSearch: (async () => {
          throw new DiscoveryCommandError("changed plan", 409);
        }) as never,
      }),
    ),
    (error: unknown) =>
      error instanceof PartnershipsDiscoveryAgentBridgeError &&
      error.code === "execution_command_conflict" &&
      error.status === 409,
  );
});

test("another external tool winning the parent claim blocks setup before any product write", async () => {
  let createSearchCalls = 0;
  await assert.rejects(
    admitPartnershipsDiscoveryFromAgent(
      context,
      input,
      canaryDependencies({
        originCommandRepository: {
          async claimExecutionOriginCommand() {
            throw Object.assign(new Error("redacted"), {
              code: "execution_origin_command_conflict",
            });
          },
        },
        createSearch: (async () => {
          createSearchCalls += 1;
          return pending();
        }) as never,
      }),
    ),
    (error: unknown) =>
      error instanceof PartnershipsDiscoveryAgentBridgeError &&
      error.code === "execution_command_conflict" &&
      error.status === 409,
  );
  assert.equal(createSearchCalls, 0);
});

test("a completed setup returns only durable identifiers, never product/provider rows", async () => {
  const result = await admitPartnershipsDiscoveryFromAgent(
    context,
    input,
    canaryDependencies({
      repository: {} as ExecutionControlRepository,
      createSearch: (async () => ({
        search: {
          id: "ds-1234567890abcdef1234",
          executionControl: {
            mode: "canary",
            admittedAt: "2026-07-16T00:00:00.000Z",
            setupRunId: "xrun-setup-1",
            runId: "xrun-discovery-1",
          },
        },
        campaignId: "private-campaign",
        taskId: "private-task",
        plan: input.plan,
        replayed: true,
      })) as never,
    }),
  );
  assert.deepEqual(result.receipt, {
    operation: "partnerships.discovery",
    runId: "xrun-setup-1",
    setupRunId: "xrun-setup-1",
    discoveryRunId: "xrun-discovery-1",
    searchId: "ds-1234567890abcdef1234",
    status: "completed",
    completionBoundary: "discovery_admitted",
    created: false,
    replayed: true,
  });
  assert.doesNotMatch(JSON.stringify(result.receipt), /private-campaign|task/);
});
