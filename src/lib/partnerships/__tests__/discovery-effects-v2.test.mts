import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { DEFAULT_CREATOR_MODEL_CONFIG } from "@/lib/calc-creator-core";
import { durableExecutionEffectKey } from "@/lib/durable-execution/runtime";
import { durableEffectPolicyFingerprint } from "@/lib/durable-execution/effect-contract";
import { YalcClientError } from "@/lib/yalc/client";

const workspace = fs.mkdtempSync(
  path.join(os.tmpdir(), "sancho-partnerships-effects-v2-"),
);
process.env.MC_WORKSPACE = workspace;
process.env.MC_TASKS_BACKEND = "json";

type EffectsModule = typeof import("../discovery-effects-v2");
type HandlerModule = typeof import("../discovery-handler-v2");
type AdmissionModule = typeof import("../discovery-admission-v2");
let effects: EffectsModule;
let handler: HandlerModule;
let admission: AdmissionModule;

before(async () => {
  effects = await import("../discovery-effects-v2");
  handler = await import("../discovery-handler-v2");
  admission = await import("../discovery-admission-v2");
});

after(() => fs.rmSync(workspace, { recursive: true, force: true }));

function effectKey(runId = "xrun-effects-v2") {
  return durableExecutionEffectKey({
    operation: "partnerships.discovery",
    runId,
    handlerVersion: handler.PARTNERSHIPS_DISCOVERY_HANDLER_VERSION_V2,
    step: "yalc.assign_leads",
  });
}

function command() {
  return handler.parsePartnershipsDiscoveryCommandV2({
    schemaVersion: 2,
    slug: "hospital-capilar",
    searchId: "search-effects-v2",
    attempt: 1,
    executionGeneration: 1,
    modelConfig: DEFAULT_CREATOR_MODEL_CONFIG,
    title: "Creators capilares",
    campaignId: "campaign-effects-v2",
    projectId: null,
    taskId: null,
    executionIntent: "fixtures",
    plan: {
      title: "Creators capilares",
      sectors: ["salud capilar"],
      networks: ["instagram"],
      tiers: ["micro"],
      targetVolume: 1,
    },
    createdAt: "2026-07-16T10:00:00.000Z",
    artifactStore: "local-persistent-single-host",
    scrapeCreators: {
      credentialRef: "scrapecreators://default",
      targetBindingFingerprint: handler.partnershipsTargetBindingFingerprint(
        "https://api.scrapecreators.com",
      ),
    },
    yalc: {
      credentialRef: "yalc://tenant/hospital-capilar",
      targetBindingFingerprint: handler.partnershipsTargetBindingFingerprint(
        "https://yalc.example.test",
      ),
    },
    setupRunId: null,
    preparedFingerprint: null,
    modelConfigEvidence: null,
  });
}

const rawCandidates = [
  {
    handle: "@capilar_fixture",
    email: "private@example.test",
    network: "instagram",
    followers: 48_000,
    engagementRatePct: 5.2,
    signals: { fakeFollowersPct: 0 },
  },
];

const credentials = {
  async resolve(reference: string) {
    if (reference !== "yalc://tenant/hospital-capilar") {
      throw new Error("unexpected credential reference");
    }
    return {
      slug: "hospital-capilar",
      baseUrl: "https://yalc.example.test",
      token: "test-token",
      targetBindingFingerprint: handler.partnershipsTargetBindingFingerprint(
        "https://yalc.example.test",
      ),
    };
  },
};

async function preparedPayload() {
  const runId = "xrun-effects-v2";
  const assignmentEffectKey = effectKey(runId);
  const prepare = effects.createPartnershipsPrepareAssignmentEffectV2({
    loadFixtures: () => rawCandidates,
  });
  const payload = {
    executionRunId: runId,
    assignmentEffectKey,
    command: command(),
  };
  const context = {
    effectKey: durableExecutionEffectKey({
      operation: "partnerships.discovery",
      runId,
      handlerVersion: handler.PARTNERSHIPS_DISCOVERY_HANDLER_VERSION_V2,
      step: "provider.prepare_assignment",
    }),
    signal: new AbortController().signal,
    deadlineAt: "2026-07-16T10:05:00.000Z",
    tenantKey: "hospital-capilar",
    credentials,
  };
  const first = await prepare.invoke(payload, context);
  const replay = await prepare.invoke(payload, context);
  assert.deepEqual(replay, first);
  return {
    runId,
    assignmentEffectKey,
    receipt: first as Awaited<ReturnType<typeof prepare.invoke>>,
  };
}

test("preparation persists one exact private handoff and exposes aggregates only", async () => {
  const { receipt } = await preparedPayload();
  assert.equal(receipt.artifactStore, "local-persistent-single-host");
  assert.match(receipt.artifactFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(receipt.qualifiedCount, 1);
  assert.doesNotMatch(
    JSON.stringify(receipt),
    /capilar_fixture|private@example/,
  );
});

test("handler performs external work only through the two declared Ledger effects", async () => {
  const effectCalls: string[] = [];
  const v2 = handler.createPartnershipsDiscoveryHandlerV2();
  const result = await v2.execute(command(), {
    contractVersion: 2,
    delivery: "at_least_once_attempts",
    run: { id: "xrun-handler-v2" },
    scope: {
      tenantKey: "hospital-capilar",
      operation: "partnerships.discovery",
      mode: "canary",
    },
    signal: new AbortController().signal,
    deadlineAt: "2026-07-16T10:05:00.000Z",
    effect: (async (step: string) => {
      effectCalls.push(step);
      return step === "provider.prepare_assignment"
        ? {
            schemaVersion: 1,
            artifactStore: "local-persistent-single-host",
            artifactFingerprint: "a".repeat(64),
            qualifiedCount: 1,
            totalQuality: 80,
            invalid: 0,
            filtered: 0,
          }
        : {
            schemaVersion: 1,
            campaignId: "campaign-effects-v2",
            stats: {
              candidates: 1,
              invalid: 0,
              filtered: 0,
              inserted: 1,
              sourced: 1,
              disqualified: 0,
              dropped: 0,
              avgQuality: 80,
            },
          };
    }) as never,
    checkpoint: async () => {},
    assertLease: async () => {},
    isCancellationRequested: async () => false,
    now: () => new Date("2026-07-16T10:00:00.000Z"),
  } as never);
  assert.deepEqual(effectCalls, [
    "provider.prepare_assignment",
    "yalc.assign_leads",
  ]);
  assert.equal(result.status, "completed");
});

test("admission policy and runtime-bound effects have identical immutable fingerprints", () => {
  const prepare = effects.createPartnershipsPrepareAssignmentEffectV2({
    loadFixtures: () => rawCandidates,
  });
  const assign = effects.createPartnershipsYalcAssignEffectV2({
    transport: async () => {
      throw new Error("not invoked by fingerprinting");
    },
  });
  assert.deepEqual(assign.safety, {
    kind: "reconcile_before_replay",
    delivery: "at_least_once_attempts",
    lookup: "by_effect_key",
    absenceMustBeAuthoritative: true,
  });
  assert.equal(
    durableEffectPolicyFingerprint(prepare),
    durableEffectPolicyFingerprint(
      handler.partnershipsDiscoveryEffectPolicyV2[
        "provider.prepare_assignment"
      ],
    ),
  );
  assert.equal(
    durableEffectPolicyFingerprint(assign),
    durableEffectPolicyFingerprint(
      handler.partnershipsDiscoveryEffectPolicyV2["yalc.assign_leads"],
    ),
  );
});

test("assignment uses the versioned Yalc contract with the same key and canonical payload fingerprint", async () => {
  const prepared = await preparedPayload();
  const calls: Array<{ path: string; input: Record<string, unknown> }> = [];
  const assign = effects.createPartnershipsYalcAssignEffectV2({
    transport: async (_config, requestPath, input) => {
      calls.push({ path: requestPath, input });
      const body = input.body as { leads: Array<Record<string, unknown>> };
      return {
        status: 201,
        contractFingerprint:
          admission.PARTNERSHIPS_YALC_ASSIGN_CONTRACT_FINGERPRINT,
        body: {
          ok: true,
          campaignId: "campaign-effects-v2",
          leads: body.leads.map((lead) => ({
            ...lead,
            lifecycleStatus: "Sourced",
          })),
          dropped: [],
        },
      };
    },
  });
  const payload = {
    executionRunId: prepared.runId,
    assignmentEffectKey: prepared.assignmentEffectKey,
    slug: "hospital-capilar",
    searchId: "search-effects-v2",
    campaignId: "campaign-effects-v2",
    credentialRef: "yalc://tenant/hospital-capilar",
    targetBindingFingerprint: handler.partnershipsTargetBindingFingerprint(
      "https://yalc.example.test",
    ),
    artifactStore: "local-persistent-single-host" as const,
    artifactFingerprint: prepared.receipt.artifactFingerprint as string,
    qualifiedCount: prepared.receipt.qualifiedCount as number,
    totalQuality: prepared.receipt.totalQuality as number,
    invalid: prepared.receipt.invalid as number,
    filtered: prepared.receipt.filtered as number,
  };
  const receipt = await assign.invoke(payload, {
    effectKey: prepared.assignmentEffectKey,
    signal: new AbortController().signal,
    deadlineAt: "2026-07-16T10:05:00.000Z",
    tenantKey: "hospital-capilar",
    credentials,
  });

  assert.equal(assign.retry.maxAttempts, 1);
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].path,
    "/api/campaigns/campaign-effects-v2/leads/assign-v1",
  );
  const headers = calls[0].input.headers as Record<string, string>;
  assert.equal(headers["Idempotency-Key"], prepared.assignmentEffectKey);
  assert.match(headers["Idempotency-Request-Fingerprint"], /^[a-f0-9]{64}$/);
  assert.equal(
    headers["Idempotency-Request-Fingerprint"],
    effects.partnershipsYalcAssignmentRequestFingerprint(calls[0].input.body),
  );
  assert.equal(
    calls[0].input.expectedContractFingerprint,
    admission.PARTNERSHIPS_YALC_ASSIGN_CONTRACT_FINGERPRINT,
  );
  assert.equal((receipt as { stats: { inserted: number } }).stats.inserted, 1);
});

test("receipt reconciliation distinguishes found, authoritative absence, conflict and unknown", async () => {
  const prepared = await preparedPayload();
  const basePayload = {
    executionRunId: prepared.runId,
    assignmentEffectKey: prepared.assignmentEffectKey,
    slug: "hospital-capilar",
    searchId: "search-effects-v2",
    campaignId: "campaign-effects-v2",
    credentialRef: "yalc://tenant/hospital-capilar",
    targetBindingFingerprint: handler.partnershipsTargetBindingFingerprint(
      "https://yalc.example.test",
    ),
    artifactStore: "local-persistent-single-host" as const,
    artifactFingerprint: prepared.receipt.artifactFingerprint as string,
    qualifiedCount: prepared.receipt.qualifiedCount as number,
    totalQuality: prepared.receipt.totalQuality as number,
    invalid: prepared.receipt.invalid as number,
    filtered: prepared.receipt.filtered as number,
  };
  const context = {
    effectKey: prepared.assignmentEffectKey,
    signal: new AbortController().signal,
    deadlineAt: "2026-07-16T10:05:00.000Z",
    tenantKey: "hospital-capilar",
    credentials,
  };
  const found = effects.createPartnershipsYalcAssignEffectV2({
    transport: async (_config, _path, input) => ({
      status: 200,
      contractFingerprint:
        admission.PARTNERSHIPS_YALC_ASSIGN_CONTRACT_FINGERPRINT,
      body: {
        ok: true,
        campaignId: "campaign-effects-v2",
        operation: "leads.assign",
        status: "completed",
        requestFingerprint: input.headers["Idempotency-Request-Fingerprint"],
        responseBody: {
          ok: true,
          campaignId: "campaign-effects-v2",
          leads: [{ lifecycleStatus: "Sourced" }],
          dropped: [],
        },
      },
    }),
  });
  assert.equal((await found.reconcile!(basePayload, context)).kind, "found");

  for (const status of [
    "completed",
    "effects_committed",
    "processing",
  ] as const) {
    const drifted = effects.createPartnershipsYalcAssignEffectV2({
      transport: async () => ({
        status: status === "processing" ? 202 : 200,
        contractFingerprint:
          admission.PARTNERSHIPS_YALC_ASSIGN_CONTRACT_FINGERPRINT,
        body: {
          ok: true,
          campaignId: "campaign-effects-v2",
          operation: "leads.assign",
          status,
          requestFingerprint: "0".repeat(64),
          ...(status === "completed"
            ? {
                responseBody: {
                  ok: true,
                  campaignId: "campaign-effects-v2",
                  leads: [],
                  dropped: [],
                },
              }
            : status === "effects_committed"
              ? { effectResult: { inserted: [], dropped: [] } }
              : {}),
        },
      }),
    });
    assert.deepEqual(await drifted.reconcile!(basePayload, context), {
      kind: "conflict",
      code: "partnerships_yalc_receipt_fingerprint_conflict",
    });
  }
  const absent = effects.createPartnershipsYalcAssignEffectV2({
    transport: async () => {
      throw new YalcClientError("not found", 404, {
        ok: false,
        campaignId: "campaign-effects-v2",
        operation: "leads.assign",
        status: "not_found",
        code: "IDEMPOTENCY_RECEIPT_NOT_FOUND",
      });
    },
  });
  assert.deepEqual(await absent.reconcile!(basePayload, context), {
    kind: "not_found",
  });

  const conflict = effects.createPartnershipsYalcAssignEffectV2({
    transport: async () => {
      throw new YalcClientError("conflict", 409, {
        code: "IDEMPOTENCY_CONFLICT",
      });
    },
  });
  assert.deepEqual(await conflict.reconcile!(basePayload, context), {
    kind: "conflict",
    code: "partnerships_yalc_idempotency_conflict",
  });

  const unknown = effects.createPartnershipsYalcAssignEffectV2({
    transport: async () => {
      throw new YalcClientError("unavailable", 503, {});
    },
  });
  assert.deepEqual(await unknown.reconcile!(basePayload, context), {
    kind: "unknown",
  });
});
