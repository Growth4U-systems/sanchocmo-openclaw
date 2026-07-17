import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_CREATOR_MODEL_CONFIG } from "@/lib/calc-creator-core";
import type { CreateExecutionRunInput } from "@/lib/execution-control";
import {
  PARTNERSHIPS_YALC_ASSIGN_CONTRACT_FINGERPRINT,
  PartnershipsDiscoveryV2GateError,
  admitPartnershipsDiscoveryV2,
  assertPartnershipsDiscoveryV2StaticGate,
  preflightPartnershipsDiscoveryV2,
  type PartnershipsYalcAssignCapabilityReceipt,
} from "../discovery-admission-v2";
import { partnershipsYalcV2Fetch } from "../discovery-yalc-v2-transport";

const enabledEnv = {
  PARTNERSHIPS_DISCOVERY_EXECUTION_V2: "canary",
  PARTNERSHIPS_DISCOVERY_V2_SLUGS: "hospital-capilar",
  PARTNERSHIPS_DISCOVERY_ARTIFACT_STORE: "local-persistent-single-host",
  PARTNERSHIPS_DISCOVERY_EFFECTS_V2: "canary",
};

function capability(): PartnershipsYalcAssignCapabilityReceipt {
  return {
    schemaVersion: 1,
    capability: "campaign-leads-assign-v1",
    contractVersion: 1,
    endpoints: {
      assign: "/api/campaigns/:campaignId/leads/assign-v1",
      receipt: "/api/campaigns/:campaignId/leads/assign-v1/receipt",
    },
    authentication: { required: true, scheme: "bearer" },
    idempotency: {
      required: true,
      header: "Idempotency-Key",
      requestFingerprintHeader: "Idempotency-Request-Fingerprint",
      requestFingerprint: "sha256_canonical_json_leads_body",
      maxCharacters: 256,
      scope: ["tenant", "campaign", "operation"],
      sameKeySamePayload: "frozen_response",
      sameKeyDifferentPayload: "409_idempotency_conflict",
    },
    execution: {
      atomic: true,
      maxBatchSize: 500,
      replayHeader: "Idempotency-Replayed",
      contractFingerprintHeader: "Yalc-Contract-Fingerprint",
      receiptLookup: "read_only",
    },
    contractFingerprint: PARTNERSHIPS_YALC_ASSIGN_CONTRACT_FINGERPRINT,
    ready: true,
    checks: {
      bearerAuthentication: true,
      receiptTable: true,
      receiptColumns: true,
      uniqueCommandIndex: true,
      uniqueCommandIndexColumns: true,
    },
  };
}

function snapshot() {
  return {
    schemaVersion: 2 as const,
    slug: "hospital-capilar",
    searchId: "search-admission-v2",
    attempt: 1,
    executionGeneration: 1,
    modelConfig: JSON.parse(JSON.stringify(DEFAULT_CREATOR_MODEL_CONFIG)),
    title: "Creators capilares",
    campaignId: "campaign-admission-v2",
    projectId: null,
    taskId: null,
    executionIntent: "fixtures" as const,
    plan: {
      title: "Creators capilares",
      sectors: ["salud capilar"],
      networks: ["instagram"],
      tiers: ["micro"],
      targetVolume: 1,
    },
    createdAt: "2026-07-16T10:00:00.000Z",
  };
}

test("contract-v2 static rollout gates fail closed", () => {
  assert.throws(
    () => assertPartnershipsDiscoveryV2StaticGate({}),
    (error: unknown) =>
      error instanceof PartnershipsDiscoveryV2GateError &&
      error.reason === "effects_v2_disabled",
  );
  assert.throws(
    () =>
      assertPartnershipsDiscoveryV2StaticGate({
        PARTNERSHIPS_DISCOVERY_EFFECTS_V2: "canary",
      }),
    (error: unknown) =>
      error instanceof PartnershipsDiscoveryV2GateError &&
      error.reason === "single_host_artifact_store_required",
  );
  assert.doesNotThrow(() =>
    assertPartnershipsDiscoveryV2StaticGate(enabledEnv),
  );
});

test("remote capability is exact and completes before the Ledger create", async () => {
  const order: string[] = [];
  const creates: CreateExecutionRunInput[] = [];
  const repository = {
    async createRun(input: CreateExecutionRunInput) {
      order.push("create");
      creates.push(input);
      return { run: { id: "xrun-admission-v2" }, created: true } as never;
    },
  };
  await admitPartnershipsDiscoveryV2(snapshot(), {
    repository,
    env: enabledEnv,
    resolveYalc: () => ({
      baseUrl: "https://yalc.example.test",
      slug: "hospital-capilar",
      token: "test-token",
    }),
    verifyYalcCapability: async () => {
      order.push("preflight");
      return capability();
    },
  });
  assert.deepEqual(order, ["preflight", "create"]);
  assert.equal(creates.length, 1);
  assert.equal(creates[0].metadata?.executionContractVersion, 2);
  assert.equal(creates[0].metadata?.executionHandlerVersion, 4);
  assert.equal(creates[0].metadata?.yalcCapabilityVersion, 1);
  assert.match(creates[0].idempotencyKey, /:canary:v4$/);
  assert.equal(
    (creates[0].input as Record<string, unknown>).artifactStore,
    "local-persistent-single-host",
  );
});

test("unavailable or drifting capability never creates a Ledger row", async () => {
  for (const verify of [
    async () => {
      throw new Error("unavailable");
    },
    async () => ({ ...capability(), ready: false }) as never,
    async () =>
      ({
        ...capability(),
        contractFingerprint: "sha256:wrong",
      }) as never,
  ]) {
    let creates = 0;
    await assert.rejects(
      admitPartnershipsDiscoveryV2(snapshot(), {
        repository: {
          async createRun() {
            creates += 1;
            return {} as never;
          },
        },
        env: enabledEnv,
        resolveYalc: () => ({
          baseUrl: "https://yalc.example.test",
          slug: "hospital-capilar",
          token: "test-token",
        }),
        verifyYalcCapability: verify,
      }),
    );
    assert.equal(creates, 0);
  }
});

test("strict Yalc transport refuses redirects and validates the response contract header", async () => {
  const originalFetch = globalThis.fetch;
  let redirect: RequestRedirect | undefined;
  globalThis.fetch = (async (_input, init) => {
    redirect = init?.redirect;
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Yalc-Contract-Fingerprint":
          PARTNERSHIPS_YALC_ASSIGN_CONTRACT_FINGERPRINT,
      },
    });
  }) as typeof fetch;
  try {
    const response = await partnershipsYalcV2Fetch(
      {
        baseUrl: "https://yalc.example.test",
        slug: "hospital-capilar",
        token: "test-token",
      },
      "/api/capabilities/campaign-leads-assign-v1",
      {
        method: "GET",
        signal: new AbortController().signal,
        expectedContractFingerprint:
          PARTNERSHIPS_YALC_ASSIGN_CONTRACT_FINGERPRINT,
      },
    );
    assert.equal(redirect, "error");
    assert.deepEqual(response.body, { ok: true });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("preflight canonicalizes and fingerprints the exact configured origin", async () => {
  let observedFingerprint = "";
  const receipt = await preflightPartnershipsDiscoveryV2("hospital-capilar", {
    env: enabledEnv,
    resolveYalc: () => ({
      baseUrl: "https://yalc.example.test/",
      token: "test-token",
    }),
    verifyYalcCapability: async (config, fingerprint) => {
      assert.equal(config.baseUrl, "https://yalc.example.test");
      assert.equal(config.slug, "hospital-capilar");
      observedFingerprint = fingerprint;
      return capability();
    },
  });
  assert.match(observedFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(receipt.targetBindingFingerprint, observedFingerprint);
});
