import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

process.env.MC_WORKSPACE = fs.mkdtempSync(
  path.join(os.tmpdir(), "san480-v5-test-"),
);

const {
  DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION_V2,
  DurableCancellationStopError,
} = await import("@/lib/durable-execution");
const {
  PARTNERSHIPS_YALC_ASSIGN_EFFECT_STEP,
  partnershipsTargetBindingFingerprint,
  partnershipsYalcAssignPayloadContractV2,
  partnershipsYalcAssignReceiptContractV2,
} = await import("../discovery-handler-v2");
const {
  PARTNERSHIPS_DISCOVERY_HANDLER_VERSION_V5,
  PartnershipsDiscoveryNoCandidatesError,
  createPartnershipsDiscoveryHandlerV5,
  parsePartnershipsDiscoveryCheckpointV5,
} = await import("../discovery-handler-v5");
const { loadDiscoveryAssignmentArtifact } = await import(
  "../discovery-execution-artifact"
);
const { mergeDiscoveryScrapeProgress } = await import(
  "../discovery-progress-store"
);

const SLUG = "hospital-capilar";
const SEARCH_ID = "ds-v5-crash-test";
const CAMPAIGN_ID = "cmp-v5-test-1";

class SimulatedCrashError extends Error {
  constructor() {
    super("simulated process crash");
    this.name = "SimulatedCrashError";
  }
}

function buildCommand(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 2,
    slug: SLUG,
    searchId: SEARCH_ID,
    attempt: 1,
    executionGeneration: 1,
    modelConfig: {},
    title: "Salud capilar femenina · IG",
    campaignId: CAMPAIGN_ID,
    projectId: null,
    taskId: null,
    executionIntent: "live",
    plan: {
      title: "Salud capilar ES · IG",
      sectors: ["salud capilar"],
      hashtags: ["#saludcapilar"],
      networks: ["instagram"],
      tiers: ["micro"],
      targetVolume: 2,
    },
    createdAt: "2026-07-17T10:00:00.000Z",
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
    ...overrides,
  };
}

const POSTS = [
  {
    id: "p1",
    caption: "Consejos de salud capilar y tricología",
    url: "https://www.instagram.com/p/p1/",
    likes: 1200,
    comments: 60,
    publishedAt: "2026-07-10T18:00:00.000Z",
  },
  {
    id: "p2",
    caption: "Rutina capilar para caída del cabello",
    url: "https://www.instagram.com/p/p2/",
    likes: 900,
    comments: 42,
    publishedAt: "2026-07-06T17:30:00.000Z",
  },
  {
    id: "p3",
    caption: "Tratamientos de salud capilar en clínica",
    url: "https://www.instagram.com/p/p3/",
    likes: 1500,
    comments: 75,
    publishedAt: "2026-07-01T19:15:00.000Z",
  },
];

const PROFILE_FIXTURES: Record<
  string,
  { followers: number; name: string; biography: string }
> = {
  "@dra_pelo": {
    followers: 40_000,
    name: "Dra. Pelo",
    biography: "Tricóloga · salud capilar femenina · Madrid",
  },
  "@capilar_clinic": {
    followers: 60_000,
    name: "Capilar Clinic",
    biography: "Clínica de salud capilar y trasplante",
  },
  "@sin_followers": {
    followers: 3_000,
    name: "Cuenta Chica",
    biography: "hair tips",
  },
  "@trasplante_pro": {
    followers: 80_000,
    name: "Trasplante Pro",
    biography: "Trasplante capilar avanzado",
  },
};

const SEARCH_RESULTS: Record<string, unknown[]> = {
  "profiles:salud capilar": [
    { handle: "@dra_pelo", name: "Dra. Pelo", followers: 40_000 },
    { handle: "@capilar_clinic", followers: 60_000 },
    { handle: "@sin_followers" },
  ],
  "hashtag:saludcapilar": [
    { handle: "@dra_pelo", followers: 40_000 },
    { handle: "@trasplante_pro", followers: 80_000 },
  ],
};

interface FakeClientOptions {
  emptySearches?: boolean;
}

function createFakeScrapeClient(
  totals: Map<string, number>,
  options: FakeClientOptions = {},
) {
  const bump = (key: string) => {
    totals.set(key, (totals.get(key) ?? 0) + 1);
  };
  return {
    async searchProfilesOnce(query: string) {
      bump(`search:${query}`);
      if (options.emptySearches) return [];
      return SEARCH_RESULTS[`profiles:${query}`] ?? [];
    },
    async searchHashtagOnce(hashtag: string) {
      bump(`hashtag:${hashtag}`);
      if (options.emptySearches) return [];
      return SEARCH_RESULTS[`hashtag:${hashtag}`] ?? [];
    },
    async getProfileOnce(handle: string) {
      bump(`profile:${handle}`);
      const fixture = PROFILE_FIXTURES[handle];
      if (!fixture) throw new Error(`unknown profile ${handle}`);
      return {
        handle,
        name: fixture.name,
        biography: fixture.biography,
        followers: fixture.followers,
        category: "Doctor",
        profileUrl: `https://www.instagram.com/${handle.slice(1)}/`,
      };
    },
    async getPostsOnce(handle: string) {
      bump(`posts:${handle}`);
      return POSTS;
    },
  };
}

function fakeAssignEffect() {
  return {
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
      throw new Error("fake effect must not be invoked directly");
    },
    async reconcile() {
      return { kind: "unknown" as const };
    },
    classify: () => ({
      kind: "outcome_unknown" as const,
      code: "partnerships_yalc_outcome_unknown",
    }),
  };
}

interface FakeContextOptions {
  crashAfterCheckpoint?: number;
  /** Simulates process death on the Nth assertLease (before a persist). */
  crashOnAssertLease?: number;
  cancelRequested?: boolean;
  initialOutput?: unknown;
}

function createFakeContext(
  handler: ReturnType<typeof createPartnershipsDiscoveryHandlerV5>,
  runId: string,
  options: FakeContextOptions = {},
) {
  const run = {
    id: runId,
    operation: "partnerships.discovery",
    output: options.initialOutput ?? null,
  } as never;
  const checkpoints: Array<{ currentStep: string; output: unknown }> = [];
  const effectInvocations: Array<{ step: string; payload: unknown }> = [];
  const effectReceipts = new Map<string, unknown>();
  let leaseAsserts = 0;
  const context = {
    contractVersion: DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION_V2,
    delivery: "at_least_once_attempts" as const,
    run,
    scope: {
      tenantKey: SLUG,
      operation: "partnerships.discovery",
      mode: "canary",
    },
    signal: new AbortController().signal,
    deadlineAt: new Date(Date.now() + 600_000).toISOString(),
    async effect(step: string, payload: unknown) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(handler.effects, step),
        `effect step ${step} must be statically declared`,
      );
      const definition = handler.effects[step as keyof typeof handler.effects];
      const parsedPayload = definition.payload.parse(payload) as {
        campaignId: string;
        qualifiedCount: number;
        totalQuality: number;
        invalid: number;
        filtered: number;
      };
      if (effectReceipts.has(step)) return effectReceipts.get(step);
      effectInvocations.push({ step, payload: parsedPayload });
      const receipt = definition.receipt.parse({
        schemaVersion: 1,
        campaignId: parsedPayload.campaignId,
        stats: {
          candidates: parsedPayload.qualifiedCount,
          invalid: parsedPayload.invalid,
          filtered: parsedPayload.filtered,
          inserted: parsedPayload.qualifiedCount,
          sourced: parsedPayload.qualifiedCount,
          disqualified: 0,
          dropped: 0,
          avgQuality: Math.round(
            parsedPayload.totalQuality / parsedPayload.qualifiedCount,
          ),
        },
      });
      effectReceipts.set(step, receipt);
      return receipt;
    },
    async checkpoint(currentStep: string, output: unknown) {
      const parsed = handler.checkpoint.parse(
        JSON.parse(JSON.stringify(output)),
      );
      (run as { output: unknown }).output = parsed;
      checkpoints.push({ currentStep, output: parsed });
      if (options.crashAfterCheckpoint === checkpoints.length) {
        throw new SimulatedCrashError();
      }
    },
    async assertLease() {
      leaseAsserts += 1;
      if (options.crashOnAssertLease === leaseAsserts) {
        throw new SimulatedCrashError();
      }
    },
    async isCancellationRequested() {
      return options.cancelRequested ?? false;
    },
    now: () => new Date("2026-07-17T12:00:00.000Z"),
  };
  return { context, run, checkpoints, effectInvocations };
}

function buildHandler(
  client: ReturnType<typeof createFakeScrapeClient>,
  extra: Record<string, unknown> = {},
) {
  return createPartnershipsDiscoveryHandlerV5({
    resolveScrapeClient: () => client as never,
    assignEffect: fakeAssignEffect() as never,
    ...extra,
  });
}

test("v5 happy path: short steps, checkpoints per call, one assign", async () => {
  const totals = new Map<string, number>();
  const client = createFakeScrapeClient(totals);
  const handler = buildHandler(client);
  const command = handler.command.parse(buildCommand());
  const { context, checkpoints, effectInvocations } = createFakeContext(
    handler,
    "run-v5-happy-1",
  );

  const result = await handler.execute(command, context as never);

  assert.equal(result.status, "completed");
  assert.equal(handler.version, PARTNERSHIPS_DISCOVERY_HANDLER_VERSION_V5);
  assert.deepEqual(Object.keys(handler.effects), [
    PARTNERSHIPS_YALC_ASSIGN_EFFECT_STEP,
  ]);
  // 2 search calls, then 2 candidates × (profile+posts); target=2 stops early.
  assert.equal(totals.get("search:salud capilar"), 1);
  assert.equal(totals.get("hashtag:saludcapilar"), 1);
  assert.equal(totals.get("profile:@dra_pelo"), 1);
  assert.equal(totals.get("posts:@dra_pelo"), 1);
  assert.equal(totals.get("profile:@capilar_clinic"), 1);
  assert.equal(totals.get("posts:@capilar_clinic"), 1);
  assert.equal(totals.get("profile:@sin_followers"), undefined);
  assert.equal(totals.get("profile:@trasplante_pro"), undefined);
  assert.equal(effectInvocations.length, 1);
  const payload = effectInvocations[0].payload as {
    artifactFingerprint: string;
    qualifiedCount: number;
  };
  assert.equal(payload.qualifiedCount, 2);
  // The frozen artifact the assign effect reads must exist and match.
  const artifact = loadDiscoveryAssignmentArtifact({
    slug: SLUG,
    runId: "run-v5-happy-1",
    effectKey: (effectInvocations[0].payload as { assignmentEffectKey: string })
      .assignmentEffectKey,
    searchId: SEARCH_ID,
    campaignId: CAMPAIGN_ID,
  });
  assert.ok(artifact);
  assert.equal(artifact.qualifiedCount, 2);
  // Per-call checkpoints: 2 search + stage + 2 enrich + qualify-stage + assign.
  assert.ok(checkpoints.length >= 6, `expected >=6 checkpoints, got ${checkpoints.length}`);
  const stats = (result.output as { stats: { inserted: number } }).stats;
  assert.equal(stats.inserted, 2);
});

test("v5 process death between fetch and persist: only that step repeats", async () => {
  const totals = new Map<string, number>();
  const client = createFakeScrapeClient(totals);
  const handler = buildHandler(client);
  const command = handler.command.parse(buildCommand());
  // assertLease sequence: q1 head(1)+persist(2), q2 head(3)+persist(4),
  // dra head(5)+persist(6), clinic head(7)+persist(8). Dying on #8 models a
  // process killed after @capilar_clinic's fetches but before their persist.
  const first = createFakeContext(handler, "run-v5-crash-1", {
    crashOnAssertLease: 8,
  });

  await assert.rejects(
    handler.execute(command, first.context as never),
    SimulatedCrashError,
  );
  // The interrupted step made its calls but persisted nothing.
  assert.equal(totals.get("profile:@capilar_clinic"), 1);
  assert.equal(totals.get("posts:@capilar_clinic"), 1);

  const second = createFakeContext(handler, "run-v5-crash-1", {
    initialOutput: (first.run as { output: unknown }).output,
  });
  const result = await handler.execute(command, second.context as never);

  assert.equal(result.status, "completed");
  // Persisted steps never re-fetch; only the interrupted step repeats.
  assert.equal(totals.get("search:salud capilar"), 1);
  assert.equal(totals.get("hashtag:saludcapilar"), 1);
  assert.equal(totals.get("profile:@dra_pelo"), 1);
  assert.equal(totals.get("posts:@dra_pelo"), 1);
  assert.equal(totals.get("profile:@capilar_clinic"), 2);
  assert.equal(totals.get("posts:@capilar_clinic"), 2);
  assert.equal(totals.get("profile:@trasplante_pro"), undefined);
  assert.equal(second.effectInvocations.length, 1);
});

test("v5 crash right after a checkpoint: resume repeats nothing", async () => {
  const totals = new Map<string, number>();
  const client = createFakeScrapeClient(totals);
  const handler = buildHandler(client);
  const command = handler.command.parse(buildCommand());
  const first = createFakeContext(handler, "run-v5-crash-2", {
    crashAfterCheckpoint: 2,
  });

  await assert.rejects(
    handler.execute(command, first.context as never),
    SimulatedCrashError,
  );
  assert.equal(totals.get("search:salud capilar"), 1);
  assert.equal(totals.get("hashtag:saludcapilar"), 1);

  const second = createFakeContext(handler, "run-v5-crash-2", {
    initialOutput: (first.run as { output: unknown }).output,
  });
  const result = await handler.execute(command, second.context as never);

  assert.equal(result.status, "completed");
  // Both search queries were persisted before the crash: zero repeats.
  assert.equal(totals.get("search:salud capilar"), 1);
  assert.equal(totals.get("hashtag:saludcapilar"), 1);
  assert.equal(totals.get("profile:@dra_pelo"), 1);
  assert.equal(totals.get("profile:@capilar_clinic"), 1);
  assert.equal(second.effectInvocations.length, 1);
});

test("v5 fixtures intent: no provider calls, one assign", async () => {
  const totals = new Map<string, number>();
  const client = createFakeScrapeClient(totals);
  const handler = buildHandler(client, {
    loadFixtures: () => [
      {
        handle: "@fixture_creator",
        network: "instagram",
        name: "Fixture Creator",
        followers: 45_000,
        engagementRatePct: 3.1,
        signals: { verticalMatchShare: 0.8, adLibraryChecked: false },
      },
    ],
  });
  const command = handler.command.parse(
    buildCommand({ executionIntent: "fixtures" }),
  );
  const { context, effectInvocations } = createFakeContext(
    handler,
    "run-v5-fixtures-1",
  );
  const result = await handler.execute(command, context as never);
  assert.equal(result.status, "completed");
  assert.equal(totals.size, 0);
  assert.equal(effectInvocations.length, 1);
});

test("v5 cancellation stops at a cooperative boundary before scraping", async () => {
  const totals = new Map<string, number>();
  const client = createFakeScrapeClient(totals);
  const handler = buildHandler(client);
  const command = handler.command.parse(buildCommand());
  const { context } = createFakeContext(handler, "run-v5-cancel-1", {
    cancelRequested: true,
  });
  await assert.rejects(
    handler.execute(command, context as never),
    (error: unknown) =>
      error instanceof DurableCancellationStopError &&
      error.safePoint === "scrape_search",
  );
  assert.equal(totals.size, 0);
});

test("v5 empty provider results fail closed as no-candidates", async () => {
  const totals = new Map<string, number>();
  const client = createFakeScrapeClient(totals, { emptySearches: true });
  const handler = buildHandler(client);
  const command = handler.command.parse(buildCommand());
  const { context } = createFakeContext(handler, "run-v5-empty-1");
  await assert.rejects(
    handler.execute(command, context as never),
    PartnershipsDiscoveryNoCandidatesError,
  );
  const decision = handler.classifyPureError(
    new PartnershipsDiscoveryNoCandidatesError("none"),
    "checkpoint",
  );
  assert.equal(decision.code, "partnerships_no_candidates");
  assert.equal(decision.retryable, false);
});

test("v5 checkpoint contract enforces its closed shape", () => {
  const valid = parsePartnershipsDiscoveryCheckpointV5({
    schemaVersion: 1,
    stage: "enrich",
    searchedQueries: 2,
    poolCount: 4,
    attemptedCount: 1,
    candidateCount: 1,
    qualified: null,
  });
  assert.equal(valid.stage, "enrich");
  assert.throws(() =>
    parsePartnershipsDiscoveryCheckpointV5({
      schemaVersion: 1,
      stage: "enrich",
      searchedQueries: 2,
      poolCount: 4,
      attemptedCount: 1,
      candidateCount: 1,
      qualified: null,
      extra: true,
    }),
  );
  assert.throws(() =>
    parsePartnershipsDiscoveryCheckpointV5({
      schemaVersion: 1,
      stage: "unknown-stage",
      searchedQueries: 0,
      poolCount: 0,
      attemptedCount: 0,
      candidateCount: 0,
      qualified: null,
    }),
  );
});

test("progress store merges are idempotent and monotonic", () => {
  const ref = {
    slug: SLUG,
    runId: "run-v5-store-1",
    searchId: SEARCH_ID,
  };
  const update = {
    searchedQueries: ["profiles:salud capilar"],
    pool: [
      { handle: "@dra_pelo", seq: 0, followers: 40_000 },
      { handle: "@capilar_clinic", seq: 1, followers: 60_000 },
    ],
  };
  const first = mergeDiscoveryScrapeProgress(ref, update);
  const second = mergeDiscoveryScrapeProgress(ref, update);
  assert.deepEqual(first, second);
  const third = mergeDiscoveryScrapeProgress(ref, {
    searchedQueries: ["hashtag:saludcapilar"],
    pool: [
      { handle: "@DRA_PELO", seq: 0 },
      { handle: "@trasplante_pro", seq: 1, followers: 80_000 },
    ],
  });
  assert.deepEqual(third.searchedQueries, [
    "profiles:salud capilar",
    "hashtag:saludcapilar",
  ]);
  assert.equal(third.pool.length, 3);
  assert.deepEqual(
    third.pool.map((entry) => entry.handle),
    ["@dra_pelo", "@capilar_clinic", "@trasplante_pro"],
  );
  assert.deepEqual(
    third.pool.map((entry) => entry.seq),
    [0, 1, 2],
  );
});
