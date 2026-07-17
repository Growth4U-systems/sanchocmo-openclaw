/**
 * SAN-480 — REAL proof driver for the v5 short-step discovery core.
 *
 * Runs the actual handler v5 pipeline against the LIVE ScrapeCreators API for
 * a real plan, persisting checkpoints to disk so a second process invocation
 * resumes exactly where a killed one died. The Yalc mutation is a recording
 * fake (the durable-mutation dedupe is covered elsewhere); everything else is
 * real: HTTP, candidates, qualification, artifact.
 *
 * Usage:
 *   SCRAPECREATORS_API_KEY=... PROOF_DIR=/tmp/v5-proof npx tsx scripts/run-v5-real-proof.mts
 *   DIE_AT_ENRICH_CHECKPOINT=2  → SIGKILLs its own process at that checkpoint.
 *
 * No secrets are written to disk; calls are logged without headers.
 */
import fs from "node:fs";
import path from "node:path";

const PROOF_DIR = process.env.PROOF_DIR || "/tmp/san480-v5-real-proof";
fs.mkdirSync(PROOF_DIR, { recursive: true });
process.env.MC_WORKSPACE = path.join(PROOF_DIR, "workspace");
fs.mkdirSync(process.env.MC_WORKSPACE, { recursive: true });

const { DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION_V2 } = await import(
  "@/lib/durable-execution"
);
const {
  PARTNERSHIPS_YALC_ASSIGN_EFFECT_STEP,
  partnershipsTargetBindingFingerprint,
  partnershipsYalcAssignPayloadContractV2,
  partnershipsYalcAssignReceiptContractV2,
} = await import("../src/lib/partnerships/discovery-handler-v2");
const { createPartnershipsDiscoveryHandlerV5 } = await import(
  "../src/lib/partnerships/discovery-handler-v5"
);
const { createScrapeCreatorsAtomicClient } = await import(
  "../src/lib/partnerships/scrapecreators-atomic"
);
const { loadDiscoveryAssignmentArtifact } = await import(
  "../src/lib/partnerships/discovery-execution-artifact"
);

const apiKey = process.env.SCRAPECREATORS_API_KEY?.trim();
if (!apiKey) {
  console.error("SCRAPECREATORS_API_KEY es obligatoria");
  process.exit(2);
}

const RUN_ID = "run-v5-real-proof-1";
const SLUG = "hospital-capilar";
const SEARCH_ID = "ds-v5-real-proof-1";
const CAMPAIGN_ID = "cmp-v5-real-proof-1";
const OUTPUT_FILE = path.join(PROOF_DIR, "run-output.json");
const CALLS_FILE = path.join(PROOF_DIR, "calls.jsonl");
const ASSIGN_FILE = path.join(PROOF_DIR, "assign-receipt.json");
const dieAtEnrichCheckpoint = Number(process.env.DIE_AT_ENRICH_CHECKPOINT || 0);

const command = {
  schemaVersion: 2,
  slug: SLUG,
  searchId: SEARCH_ID,
  attempt: 1,
  executionGeneration: 1,
  modelConfig: {},
  title: "Salud capilar femenina · IG (prueba real v5)",
  campaignId: CAMPAIGN_ID,
  projectId: null,
  taskId: null,
  executionIntent: "live",
  plan: {
    title: "Salud capilar ES · IG",
    sectors: ["salud capilar"],
    hashtags: ["#saludcapilar"],
    networks: ["instagram"],
    tiers: ["nano", "micro", "mid"],
    targetVolume: 3,
  },
  createdAt: new Date().toISOString(),
  artifactStore: "local-persistent-single-host",
  scrapeCreators: {
    credentialRef: "scrapecreators://default",
    targetBindingFingerprint: partnershipsTargetBindingFingerprint(
      "https://api.scrapecreators.com",
    ),
  },
  yalc: {
    credentialRef: `yalc://tenant/${SLUG}`,
    targetBindingFingerprint: partnershipsTargetBindingFingerprint(
      "http://localhost:3847",
    ),
  },
  setupRunId: null,
  preparedFingerprint: null,
  modelConfigEvidence: null,
};

const loggingFetch: typeof fetch = async (input, init) => {
  const url = new URL(String(input));
  const startedAt = Date.now();
  const response = await fetch(input as never, init as never);
  fs.appendFileSync(
    CALLS_FILE,
    `${JSON.stringify({
      path: url.pathname,
      query: url.searchParams.get("query") ?? url.searchParams.get("hashtag") ?? url.searchParams.get("handle"),
      cursor: url.searchParams.get("cursor") ? "yes" : "no",
      status: response.status,
      ms: Date.now() - startedAt,
      pid: process.pid,
      at: new Date().toISOString(),
    })}\n`,
  );
  return response;
};

const client = createScrapeCreatorsAtomicClient({
  apiKey,
  fetchImpl: loggingFetch,
});

const fakeAssignEffect = {
  step: PARTNERSHIPS_YALC_ASSIGN_EFFECT_STEP,
  definitionVersion: 3,
  capability: "yalc.partnerships.leads.assign.v2",
  payload: partnershipsYalcAssignPayloadContractV2,
  receipt: partnershipsYalcAssignReceiptContractV2,
  safety: {
    kind: "reconcile_before_replay",
    delivery: "at_least_once_attempts",
    lookup: "by_effect_key",
    absenceMustBeAuthoritative: true,
  },
  retry: { maxAttempts: 1, baseDelayMs: 1_000, maxDelayMs: 30_000, jitter: "full" },
  timeoutMs: 30_000,
  async invoke() {
    throw new Error("unused: the driver context implements effect()");
  },
  async reconcile() {
    return { kind: "unknown" as const };
  },
  classify: () => ({
    kind: "outcome_unknown" as const,
    code: "partnerships_yalc_outcome_unknown",
  }),
};

const handler = createPartnershipsDiscoveryHandlerV5({
  resolveScrapeClient: () => client,
  assignEffect: fakeAssignEffect as never,
});

let enrichCheckpoints = 0;
let checkpointCount = 0;
const initialOutput = fs.existsSync(OUTPUT_FILE)
  ? JSON.parse(fs.readFileSync(OUTPUT_FILE, "utf8"))
  : null;
if (initialOutput) {
  console.log(`↻ REANUDANDO desde checkpoint persistido:`, initialOutput);
}

const run = {
  id: RUN_ID,
  operation: "partnerships.discovery",
  output: initialOutput,
} as never;

const context = {
  contractVersion: DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION_V2,
  delivery: "at_least_once_attempts" as const,
  run,
  scope: { tenantKey: SLUG, operation: "partnerships.discovery", mode: "canary" },
  signal: new AbortController().signal,
  deadlineAt: new Date(Date.now() + 900_000).toISOString(),
  async effect(step: string, payload: unknown) {
    const parsed = partnershipsYalcAssignPayloadContractV2.parse(payload) as {
      campaignId: string;
      qualifiedCount: number;
      totalQuality: number;
      invalid: number;
      filtered: number;
    };
    if (fs.existsSync(ASSIGN_FILE)) {
      console.log("• yalc.assign_leads: receipt ya persistido (dedupe)");
      return JSON.parse(fs.readFileSync(ASSIGN_FILE, "utf8"));
    }
    const receipt = partnershipsYalcAssignReceiptContractV2.parse({
      schemaVersion: 1,
      campaignId: parsed.campaignId,
      stats: {
        candidates: parsed.qualifiedCount,
        invalid: parsed.invalid,
        filtered: parsed.filtered,
        inserted: parsed.qualifiedCount,
        sourced: parsed.qualifiedCount,
        disqualified: 0,
        dropped: 0,
        avgQuality: Math.round(parsed.totalQuality / parsed.qualifiedCount),
      },
    });
    fs.writeFileSync(ASSIGN_FILE, JSON.stringify(receipt, null, 2));
    console.log(`• yalc.assign_leads INVOCADO 1 vez (${parsed.qualifiedCount} leads)`);
    return receipt;
  },
  async checkpoint(currentStep: string, output: unknown) {
    checkpointCount += 1;
    const parsed = handler.checkpoint.parse(JSON.parse(JSON.stringify(output)));
    (run as { output: unknown }).output = parsed;
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(parsed, null, 2));
    console.log(
      `✓ checkpoint #${checkpointCount} [${currentStep}]`,
      JSON.stringify(parsed),
    );
    if (currentStep === "scrape.enrich") {
      enrichCheckpoints += 1;
      if (dieAtEnrichCheckpoint > 0 && enrichCheckpoints >= dieAtEnrichCheckpoint) {
        console.log(`💀 SIGKILL al propio proceso (pid ${process.pid}) a mitad del enriquecimiento`);
        process.kill(process.pid, "SIGKILL");
      }
    }
  },
  async assertLease() {},
  async isCancellationRequested() {
    return false;
  },
  now: () => new Date(),
};

const parsedCommand = handler.command.parse(command);
const startedAt = Date.now();
const result = await handler.execute(parsedCommand, context as never);
console.log(`\n=== COMPLETADO en ${Math.round((Date.now() - startedAt) / 1000)}s ===`);
console.log("result:", JSON.stringify(result.output, null, 2));

const assignPayload = JSON.parse(fs.readFileSync(ASSIGN_FILE, "utf8"));
void assignPayload;
const artifact = loadDiscoveryAssignmentArtifact({
  slug: SLUG,
  runId: RUN_ID,
  effectKey: `partnerships.discovery:run:${RUN_ID}:step:${PARTNERSHIPS_YALC_ASSIGN_EFFECT_STEP}:v5`,
  searchId: SEARCH_ID,
  campaignId: CAMPAIGN_ID,
});
if (artifact) {
  console.log("\n=== CANDIDATAS REALES ENCONTRADAS ===");
  for (const lead of artifact.assignmentBody.leads as Array<Record<string, unknown>>) {
    console.log(
      `- ${String(lead.handle ?? lead.name ?? "?")} · followers=${String(lead.followers ?? "?")} · ${String(lead.profileUrl ?? "")}`,
    );
  }
}
