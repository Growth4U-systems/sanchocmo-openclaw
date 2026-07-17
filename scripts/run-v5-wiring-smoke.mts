/**
 * SAN-480 — Stage E wiring smoke: the REAL durable path end to end.
 *
 * Exercises the exact code the chat tool triggers, against a real local
 * Postgres: `admitPartnershipsDiscoveryV2` (v5 admission, idempotent replay)
 * → `processNextCanaryDiscoveryRun` (real worker, leases, effects) → v5
 * short-step handler with the LIVE ScrapeCreators API → Yalc assign effect
 * (faked transport — Yalc daemon not required) → product projection + one
 * chat terminal delivery (captured).
 *
 * Usage:
 *   DATABASE_URL=postgresql://localhost/san480_wiring_smoke \
 *   SCRAPECREATORS_API_KEY=... npx tsx scripts/run-v5-wiring-smoke.mts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.MC_WORKSPACE =
  process.env.MC_WORKSPACE ??
  fs.mkdtempSync(path.join(os.tmpdir(), "san480-wiring-"));
process.env.PARTNERSHIPS_DISCOVERY_EFFECTS_V2 = "canary";
process.env.PARTNERSHIPS_DISCOVERY_ARTIFACT_STORE =
  "local-persistent-single-host";
process.env.PARTNERSHIPS_LIVE_DISCOVERY_MAX_CANDIDATES = "3";
process.env.PARTNERSHIPS_LIVE_DISCOVERY_CONCURRENCY = "1";

if (!process.env.DATABASE_URL?.includes("san480_wiring_smoke")) {
  console.error("DATABASE_URL must point at the dedicated san480_wiring_smoke DB");
  process.exit(2);
}
if (!process.env.SCRAPECREATORS_API_KEY?.trim()) {
  console.error("SCRAPECREATORS_API_KEY es obligatoria");
  process.exit(2);
}

const { PostgresExecutionControlRepository } = await import(
  "../src/lib/execution-control/postgres"
);
const {
  PARTNERSHIPS_YALC_ASSIGN_CONTRACT_FINGERPRINT,
  admitPartnershipsDiscoveryV2,
} = await import("../src/lib/partnerships/discovery-admission-v2");
const { processNextCanaryDiscoveryRun } = await import(
  "../src/lib/partnerships/discovery-durable-worker"
);
const { getSearch } = await import("../src/lib/partnerships/discovery-store");
const { mergeCreatorModelConfig } = await import("@/lib/calc-creator-core");

const SLUG = "hospital-capilar";
const SEARCH_ID = "ds-v5-wiring-smoke-1";
const CAMPAIGN_ID = "cmp-v5-wiring-1";

const repository = new PostgresExecutionControlRepository();

const fakeCapabilityReceipt = {
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

const snapshot = {
  schemaVersion: 2 as const,
  slug: SLUG,
  searchId: SEARCH_ID,
  attempt: 1,
  executionGeneration: 1,
  modelConfig: mergeCreatorModelConfig({}),
  title: "Salud capilar femenina · IG (wiring smoke v5)",
  campaignId: CAMPAIGN_ID,
  projectId: null,
  taskId: null,
  executionIntent: "live" as const,
  plan: {
    title: "Salud capilar ES · IG",
    sectors: ["salud capilar"],
    hashtags: ["#saludcapilar"],
    networks: ["instagram"],
    tiers: ["nano", "micro", "mid"],
    targetVolume: 2,
  },
  createdAt: new Date().toISOString(),
};

// Must match the worker-side resolveYalcConfig default origin exactly: the
// admission freezes this fingerprint into the immutable command.
const admissionDeps = {
  repository,
  resolveYalc: () => ({
    baseUrl: "http://localhost:3847",
    slug: SLUG,
    token: "wiring-smoke",
  }),
  verifyYalcCapability: async () => fakeCapabilityReceipt as never,
};

console.log("1) ADMISIÓN v5 (real, Postgres)…");
const first = await admitPartnershipsDiscoveryV2(snapshot as never, admissionDeps);
console.log(`   runId=${first.run.id} created=${first.created} handlerVersion=${first.run.metadata?.executionHandlerVersion}`);
const replay = await admitPartnershipsDiscoveryV2(snapshot as never, admissionDeps);
console.log(`   replay: mismo run=${replay.run.id === first.run.id} created=${replay.created}`);
if (replay.run.id !== first.run.id || replay.created) {
  throw new Error("la admisión no fue idempotente");
}

const deliveries: string[] = [];
const yalcCalls: string[] = [];
const fakeYalcTransport = async (
  _config: unknown,
  urlPath: string,
  input: { method: "GET" | "POST"; body?: unknown },
) => {
  if (input.method === "GET" || urlPath.endsWith("/receipt")) {
    // Authoritative receipt absence: reconciliation may safely replay.
    return {
      status: 404,
      contractFingerprint: PARTNERSHIPS_YALC_ASSIGN_CONTRACT_FINGERPRINT,
      body: {
        ok: false,
        campaignId: CAMPAIGN_ID,
        operation: "leads.assign",
        status: "not_found",
        code: "IDEMPOTENCY_RECEIPT_NOT_FOUND",
      },
    };
  }
  yalcCalls.push(urlPath);
  const body = input.body as { leads: Array<Record<string, unknown>> };
  return {
    status: 200,
    contractFingerprint: PARTNERSHIPS_YALC_ASSIGN_CONTRACT_FINGERPRINT,
    body: {
      ok: true,
      campaignId: CAMPAIGN_ID,
      leads: body.leads.map((lead) => ({ ...lead, lifecycleStatus: "Sourced" })),
      dropped: [],
    },
  };
};

console.log("2) WORKER canario (real: leases + efectos + v5 + ScrapeCreators VIVO)…");
const startedAt = Date.now();
let claims = 0;
const deadline = Date.now() + 240_000;
while (Date.now() < deadline) {
  const processed = await processNextCanaryDiscoveryRun(SLUG, {
    repository,
    yalcAssignEffectDependencies: { transport: fakeYalcTransport as never },
    deliverV2ChatCompletion: (async (run: { id: string }) => {
      deliveries.push(run.id);
    }) as never,
  });
  if (processed) {
    claims += 1;
    continue;
  }
  const current = await repository.getRunByIdForScope({
    tenantKey: SLUG,
    operation: "partnerships.discovery",
    mode: "canary",
    runId: first.run.id,
  });
  if (
    !current ||
    ["completed", "failed", "cancelled", "blocked", "partial"].includes(
      current.status,
    )
  ) {
    break;
  }
  // retry_wait backoff: the run becomes eligible again shortly.
  await new Promise((resolve) => setTimeout(resolve, 2_000));
}
console.log(`   claims procesados=${claims} en ${Math.round((Date.now() - startedAt) / 1000)}s`);

console.log("3) VERIFICACIÓN…");
const run = await repository.getRunByIdForScope({
  tenantKey: SLUG,
  operation: "partnerships.discovery",
  mode: "canary",
  runId: first.run.id,
});
if (!run) throw new Error("run desapareció");
console.log(`   run.status=${run.status} handlerAttempt=${run.handlerAttempt} claimCount=${run.claimCount}`);
console.log(`   run.output=${JSON.stringify(run.output)}`);
if (run.status !== "completed") {
  console.log(`   run.error=${JSON.stringify(run.error)}`);
  throw new Error(`el run terminó en ${run.status}, no completed`);
}
if (yalcCalls.length !== 1) {
  throw new Error(`Yalc assign se invocó ${yalcCalls.length} veces (esperado 1)`);
}
if (deliveries.length !== 1 || deliveries[0] !== first.run.id) {
  throw new Error(`entregas al chat: ${JSON.stringify(deliveries)} (esperada 1)`);
}
const search = getSearch(SLUG, SEARCH_ID);
console.log(`   proyección de producto: runner.status=${search?.runner?.status} stats=${JSON.stringify(search?.runner?.stats ?? null)}`);

console.log("\n=== WIRING SMOKE PASSED ===");
console.log(
  `admisión idempotente ✓ · worker real ✓ · v5 con provider vivo ✓ · 1 assign ✓ · 1 entrega chat ✓`,
);
