import {
  DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION_V2,
  DurableCancellationStopError,
  durableExecutionEffectKey,
  type DurableExecutionContextV2,
  type DurableExecutionHandlerV2,
  type DurableEffectMap,
  type DurableJson,
  type DurableJsonBounds,
  type DurableJsonContract,
  type DurableJsonObject,
} from "@/lib/durable-execution";
import type { CreatorModelConfig } from "@/lib/calc-creator-core";
import type { ExecutionRun } from "@/lib/execution-control";
import { DISCOVERY_EXECUTION_OPERATION } from "./discovery-execution-policy";
import {
  discoveryAssignmentArtifactFingerprint,
  persistDiscoveryAssignmentArtifact,
  DiscoveryExecutionArtifactError,
  type DiscoveryAssignmentArtifactData,
} from "./discovery-execution-artifact";
import {
  deleteDiscoveryScrapeProgress,
  emptyDiscoveryScrapeProgress,
  loadDiscoveryScrapeProgress,
  mergeDiscoveryScrapeProgress,
  DiscoveryProgressStoreError,
  type DiscoveryScrapeProgress,
  type DiscoveryScrapeProgressRef,
} from "./discovery-progress-store";
import {
  PARTNERSHIPS_LOCAL_ARTIFACT_STORE,
  PARTNERSHIPS_YALC_ASSIGN_EFFECT_STEP,
  partnershipsDiscoveryCommandContractV2,
  partnershipsDiscoveryResultContractV2,
  type PartnershipsDiscoveryCommandV2,
  type PartnershipsDiscoveryResultV2,
  type PartnershipsYalcAssignEffectV2,
} from "./discovery-handler-v2";
import { normalizeCandidates } from "./discovery-normalize";
import { applyDiscoveryPlanGates } from "./discovery-runner";
import { loadFixtureCandidates } from "./fixtures";
import { qualifyCandidates } from "./qualify-enrich";
import {
  buildLiveDiscoveryQueries,
  computeCandidate,
  matchesWantedTier,
  passesLiveAudienceGate,
  supportsLiveDiscovery,
  targetCandidates,
  unsupportedLiveDiscoveryNetworks,
  type InstagramPost,
  type InstagramProfileUser,
  type SearchProfile,
} from "./scrapecreators-live";
import {
  ScrapeCreatorsAtomicError,
  type AtomicInstagramPost,
  type AtomicInstagramProfile,
  type AtomicSearchPage,
  type AtomicSearchProfile,
  type ScrapeCreatorsAtomicClient,
} from "./scrapecreators-atomic";
import type { DiscoveryPlan, RawDiscoveryCandidate } from "./discovery-types";

/**
 * Durable short-step discovery handler (SAN-480 v5).
 *
 * v4 wrapped the whole scrape (search pages + per-profile enrichment, ~16
 * provider calls) in one 300s read-only effect the Ledger could neither
 * checkpoint nor resume. v5 restructures the same pipeline as a resumable
 * state machine at the handler level:
 *
 *   search  — one provider call per query, checkpointed per call
 *   enrich  — two provider calls per candidate, checkpointed per candidate
 *   qualify — pure scoring + frozen assignment artifact
 *   assign  — the single durable mutation (`yalc.assign_leads`), unchanged
 *
 * Read-only scrape calls run as bounded plain awaits inside `execute()`
 * because durable effect step keys are static per handler (no occurrence
 * index); their resume safety comes from the union-merged progress store plus
 * `context.checkpoint()` after every call. The only external mutation stays a
 * durable effect with receipt + reconcile semantics.
 */
export const PARTNERSHIPS_DISCOVERY_HANDLER_VERSION_V5 = 5 as const;

const CHECKPOINT_BOUNDS: DurableJsonBounds = Object.freeze({
  maxBytes: 16 * 1024,
  maxDepth: 12,
  maxNodes: 256,
  maxStringBytes: 2_048,
  maxArrayItems: 32,
  maxObjectKeys: 64,
});

const SEARCH_POOL_MULTIPLIER = 3;
/** Aligned with the progress store's MAX_POOL_ENTRIES; mirrors the live
 * scraper's poolLimit formula so v5 keeps its candidate recall. */
const MAX_POOL_LIMIT = 200;
const MAX_SEARCH_PAGES_PER_QUERY = 5;
const MAX_QUERIES = 24;
const PROVIDER_RETRY_DELAY_MS = 300;

export type PartnershipsDiscoveryStageV5 =
  | "search"
  | "enrich"
  | "qualify"
  | "assign";

export interface PartnershipsDiscoveryQualifiedV5 extends DurableJsonObject {
  artifactFingerprint: string;
  qualifiedCount: number;
  totalQuality: number;
  invalid: number;
  filtered: number;
}

export interface PartnershipsDiscoveryCheckpointV5 extends DurableJsonObject {
  schemaVersion: 1;
  stage: PartnershipsDiscoveryStageV5;
  searchedQueries: number;
  poolCount: number;
  attemptedCount: number;
  candidateCount: number;
  qualified: PartnershipsDiscoveryQualifiedV5 | null;
}

export class PartnershipsDiscoveryNoCandidatesError extends Error {
  readonly code = "partnerships_no_candidates" as const;

  constructor(message: string) {
    super(message);
    this.name = "PartnershipsDiscoveryNoCandidatesError";
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("object required");
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  input: Record<string, unknown>,
  keys: readonly string[],
): void {
  const expected = new Set(keys);
  if (
    Object.keys(input).length !== keys.length ||
    Object.keys(input).some((key) => !expected.has(key))
  ) {
    throw new Error("unexpected checkpoint shape");
  }
}

function bounded(value: unknown, min: number, max: number): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  ) {
    throw new Error("integer out of bounds");
  }
  return value;
}

function fingerprint64(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error("invalid fingerprint");
  }
  return value;
}

function parseQualified(value: unknown): PartnershipsDiscoveryQualifiedV5 {
  const input = record(value);
  exactKeys(input, [
    "artifactFingerprint",
    "qualifiedCount",
    "totalQuality",
    "invalid",
    "filtered",
  ]);
  const qualifiedCount = bounded(input.qualifiedCount, 1, 500);
  return {
    artifactFingerprint: fingerprint64(input.artifactFingerprint),
    qualifiedCount,
    totalQuality: bounded(input.totalQuality, 0, qualifiedCount * 100),
    invalid: bounded(input.invalid, 0, 100_000),
    filtered: bounded(input.filtered, 0, 100_000),
  };
}

export function parsePartnershipsDiscoveryCheckpointV5(
  value: unknown,
): PartnershipsDiscoveryCheckpointV5 {
  const input = record(value);
  exactKeys(input, [
    "schemaVersion",
    "stage",
    "searchedQueries",
    "poolCount",
    "attemptedCount",
    "candidateCount",
    "qualified",
  ]);
  if (input.schemaVersion !== 1) throw new Error("unsupported checkpoint");
  if (
    input.stage !== "search" &&
    input.stage !== "enrich" &&
    input.stage !== "qualify" &&
    input.stage !== "assign"
  ) {
    throw new Error("invalid checkpoint stage");
  }
  return {
    schemaVersion: 1,
    stage: input.stage,
    searchedQueries: bounded(input.searchedQueries, 0, 1_000),
    poolCount: bounded(input.poolCount, 0, 10_000),
    attemptedCount: bounded(input.attemptedCount, 0, 10_000),
    candidateCount: bounded(input.candidateCount, 0, 10_000),
    qualified: input.qualified === null ? null : parseQualified(input.qualified),
  };
}

export const partnershipsDiscoveryCheckpointContractV5: DurableJsonContract<PartnershipsDiscoveryCheckpointV5> =
  {
    schemaVersion: 1,
    bounds: CHECKPOINT_BOUNDS,
    secrets: { mode: "reject" },
    parse: parsePartnershipsDiscoveryCheckpointV5,
  };

function initialCheckpointV5(): PartnershipsDiscoveryCheckpointV5 {
  return {
    schemaVersion: 1,
    stage: "search",
    searchedQueries: 0,
    poolCount: 0,
    attemptedCount: 0,
    candidateCount: 0,
    qualified: null,
  };
}

function decodeCheckpointV5(
  output: unknown,
): PartnershipsDiscoveryCheckpointV5 {
  if (
    output === null ||
    output === undefined ||
    (typeof output === "object" &&
      !Array.isArray(output) &&
      Object.keys(output as object).length === 0)
  ) {
    return initialCheckpointV5();
  }
  return parsePartnershipsDiscoveryCheckpointV5(output);
}

interface DiscoveryQueryV5 {
  kind: "profiles" | "hashtag";
  term: string;
}

export function buildPartnershipsDiscoveryQueriesV5(
  plan: DiscoveryPlan,
): DiscoveryQueryV5[] {
  const { profileQueries, hashtags } = buildLiveDiscoveryQueries(plan);
  // The atomic client rejects terms >200 chars and the progress store bounds
  // its tracked keys, so oversized/overflowing plans degrade to fewer queries
  // instead of failing the run mid-scrape.
  return [
    ...profileQueries.map(
      (term): DiscoveryQueryV5 => ({ kind: "profiles", term }),
    ),
    ...hashtags.map((term): DiscoveryQueryV5 => ({ kind: "hashtag", term })),
  ]
    .filter((query) => query.term.length > 0 && query.term.length <= 200)
    .slice(0, MAX_QUERIES);
}

function queryKey(query: DiscoveryQueryV5): string {
  return `${query.kind}:${query.term}`;
}

function poolLimitFor(target: number): number {
  // Same shape as the live scraper: min(cap, max(target+25, target*3)).
  return Math.min(
    Math.max(target + 25, target * SEARCH_POOL_MULTIPLIER),
    MAX_POOL_LIMIT,
  );
}

/**
 * One bounded in-step retry for transient provider errors (parity with the
 * live scraper's two attempts). Anything beyond this is the durable requeue's
 * job, so a flaky 429/5xx doesn't silently drop a query or candidate.
 */
async function callProviderWithRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (!(error instanceof ScrapeCreatorsAtomicError) || !error.retryable) {
      throw error;
    }
    await new Promise((resolve) =>
      setTimeout(resolve, PROVIDER_RETRY_DELAY_MS),
    );
    return fn();
  }
}

function toSearchProfile(entry: {
  handle: string;
  name?: string;
  followers?: number;
}): SearchProfile {
  return {
    username: entry.handle.replace(/^@/, ""),
    ...(entry.name ? { full_name: entry.name } : {}),
    ...(entry.followers !== undefined
      ? { follower_count: entry.followers }
      : {}),
  };
}

function toProfileUser(profile: AtomicInstagramProfile): InstagramProfileUser {
  return {
    username: profile.handle.replace(/^@/, ""),
    ...(profile.name ? { full_name: profile.name } : {}),
    ...(profile.biography ? { biography: profile.biography } : {}),
    ...(profile.category ? { category_name: profile.category } : {}),
    ...(profile.externalUrl ? { external_url: profile.externalUrl } : {}),
    ...(profile.email ? { business_email: profile.email } : {}),
    ...(profile.followers !== undefined
      ? { edge_followed_by: { count: profile.followers } }
      : {}),
  };
}

function toInstagramPost(post: AtomicInstagramPost): InstagramPost {
  return {
    ...(post.likes !== undefined ? { like_count: post.likes } : {}),
    ...(post.comments !== undefined ? { comment_count: post.comments } : {}),
    ...(post.publishedAt ? { taken_at: post.publishedAt } : {}),
    ...(post.caption !== undefined ? { caption: post.caption } : {}),
    ...(post.url ? { url: post.url } : {}),
    ...(post.id ? { code: post.id } : {}),
  };
}

function searchProfilesFromAtomic(
  profiles: AtomicSearchProfile[],
): Array<{ handle: string; name?: string; followers?: number }> {
  return profiles.map((profile) => ({
    handle: profile.handle,
    ...(profile.name ? { name: profile.name } : {}),
    ...(profile.followers !== undefined
      ? { followers: profile.followers }
      : {}),
  }));
}

function buildAssignmentDataV5(
  command: PartnershipsDiscoveryCommandV2,
  assignmentEffectKey: string,
  rawCandidates: unknown,
): DiscoveryAssignmentArtifactData {
  const plan = command.plan as unknown as DiscoveryPlan;
  const normalized = normalizeCandidates(rawCandidates);
  const gated = applyDiscoveryPlanGates(normalized.candidates, plan);
  if (gated.candidates.length === 0) {
    throw new PartnershipsDiscoveryNoCandidatesError(
      "No candidates met the frozen Partnerships plan",
    );
  }
  const qualified = qualifyCandidates(gated.candidates, {
    searchId: command.searchId,
    config: command.modelConfig as unknown as CreatorModelConfig,
  });
  return {
    assignmentBody: {
      leads: qualified.map((item) => ({
        ...item.lead,
        provenance: {
          provider: "scrapecreators",
          operation: "creator_discovery",
          searchId: command.searchId,
          jobId: assignmentEffectKey,
          source: "sancho_partnerships_discovery",
        },
        scoreProvenance: {
          provider: "calc-creator-core",
          operation: "creator_quality_score",
          searchId: command.searchId,
          jobId: assignmentEffectKey,
        },
      })),
    },
    qualifiedCount: qualified.length,
    totalQuality: qualified.reduce((sum, item) => sum + item.score.total, 0),
    invalid: normalized.invalid,
    filtered: gated.filtered,
  };
}

type PartnershipsDiscoveryEffectsV5 = DurableEffectMap & {
  [PARTNERSHIPS_YALC_ASSIGN_EFFECT_STEP]: PartnershipsYalcAssignEffectV2;
};

type V5Context = DurableExecutionContextV2<
  PartnershipsDiscoveryEffectsV5,
  PartnershipsDiscoveryCheckpointV5
>;

export interface PartnershipsDiscoveryHandlerV5Dependencies {
  /**
   * Resolves a per-call scrape client for the frozen command binding. The
   * worker owns credential resolution (execute() has no credential access by
   * design); implementations must validate the command's target binding
   * fingerprint before returning a client.
   */
  resolveScrapeClient(
    command: PartnershipsDiscoveryCommandV2,
  ): Promise<ScrapeCreatorsAtomicClient> | ScrapeCreatorsAtomicClient;
  /** The single durable mutation; must declare step `yalc.assign_leads`. */
  assignEffect: PartnershipsYalcAssignEffectV2;
  loadFixtures?: typeof loadFixtureCandidates;
  projectTerminal?(
    run: ExecutionRun,
    command: PartnershipsDiscoveryCommandV2,
  ): Promise<void> | void;
}

async function stopIfCancellationRequested(
  context: V5Context,
  safePoint: string,
): Promise<void> {
  if (await context.isCancellationRequested()) {
    throw new DurableCancellationStopError(safePoint);
  }
}

async function persistStepProgress(
  context: V5Context,
  ref: DiscoveryScrapeProgressRef,
  update: Partial<DiscoveryScrapeProgress>,
  checkpoint: PartnershipsDiscoveryCheckpointV5,
  currentStep: string,
  eventType: string,
): Promise<DiscoveryScrapeProgress> {
  await context.assertLease();
  const merged = mergeDiscoveryScrapeProgress(ref, update, context.now());
  checkpoint.searchedQueries = merged.searchedQueries.length;
  checkpoint.poolCount = merged.pool.length;
  checkpoint.attemptedCount = merged.attempted.length;
  checkpoint.candidateCount = merged.candidates.length;
  await context.checkpoint(currentStep, { ...checkpoint }, {
    type: eventType,
    data: {
      stage: checkpoint.stage,
      searchedQueries: checkpoint.searchedQueries,
      poolCount: checkpoint.poolCount,
      attemptedCount: checkpoint.attemptedCount,
      candidateCount: checkpoint.candidateCount,
    },
  });
  return merged;
}

async function runSearchStage(
  context: V5Context,
  ref: DiscoveryScrapeProgressRef,
  plan: DiscoveryPlan,
  client: ScrapeCreatorsAtomicClient,
  checkpoint: PartnershipsDiscoveryCheckpointV5,
): Promise<DiscoveryScrapeProgress> {
  const queries = buildPartnershipsDiscoveryQueriesV5(plan);
  const wantedTiers = new Set<string>(plan.tiers || []);
  const poolLimit = poolLimitFor(targetCandidates(plan));
  let progress =
    loadDiscoveryScrapeProgress(ref) ?? emptyDiscoveryScrapeProgress();
  let lastError: Error | null = null;

  for (const query of queries) {
    const key = queryKey(query);
    for (;;) {
      if (progress.searchedQueries.includes(key)) break;
      if (progress.pool.length >= poolLimit) break;
      const pagesFetched = progress.queryPages[key] ?? 0;
      const savedCursor = progress.queryCursors[key];
      if (pagesFetched >= MAX_SEARCH_PAGES_PER_QUERY || savedCursor === null) {
        // Exhausted by page budget or by the provider: mark and move on.
        progress = await persistStepProgress(
          context,
          ref,
          { searchedQueries: [key] },
          checkpoint,
          "scrape.search",
          "partnerships.discovery.scrape_progress",
        );
        break;
      }
      await stopIfCancellationRequested(context, "scrape_search");
      await context.assertLease();
      let page: AtomicSearchPage;
      try {
        // Only the provider call is tolerated per-step; lease/checkpoint/store
        // failures below must propagate so the runtime keeps its guarantees.
        page = await callProviderWithRetry(() =>
          query.kind === "profiles"
            ? client.searchProfilesPage(query.term, savedCursor)
            : client.searchHashtagPage(query.term, savedCursor),
        );
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        break;
      }
      const entries = searchProfilesFromAtomic(page.profiles)
        .filter((entry) =>
          matchesWantedTier(entry.followers, wantedTiers, true),
        )
        .map((entry, index) => ({ ...entry, seq: index }));
      const exhausted = page.nextCursor === undefined;
      progress = await persistStepProgress(
        context,
        ref,
        {
          pool: entries,
          queryPages: { [key]: pagesFetched + 1 },
          queryCursors: { [key]: page.nextCursor ?? null },
          ...(exhausted ? { searchedQueries: [key] } : {}),
        },
        checkpoint,
        "scrape.search",
        "partnerships.discovery.scrape_progress",
      );
      if (exhausted) break;
    }
    if (progress.pool.length >= poolLimit) break;
  }

  if (progress.pool.length === 0 && lastError) throw lastError;
  return progress;
}

async function runEnrichStage(
  context: V5Context,
  ref: DiscoveryScrapeProgressRef,
  plan: DiscoveryPlan,
  client: ScrapeCreatorsAtomicClient,
  checkpoint: PartnershipsDiscoveryCheckpointV5,
  initialProgress: DiscoveryScrapeProgress,
): Promise<DiscoveryScrapeProgress> {
  const wantedTiers = new Set<string>(plan.tiers || []);
  const target = targetCandidates(plan);
  let progress = initialProgress;
  let lastError: Error | null = null;

  const pool = [...progress.pool].sort((a, b) => a.seq - b.seq);
  for (const entry of pool) {
    if (progress.candidates.length >= target) break;
    if (progress.attempted.includes(entry.handle)) continue;
    await stopIfCancellationRequested(context, "scrape_enrich");
    await context.assertLease();
    let profile: AtomicInstagramProfile;
    let posts: AtomicInstagramPost[];
    try {
      // Only the provider calls are tolerated per-step; lease/checkpoint/store
      // failures below must propagate so the runtime keeps its guarantees.
      profile = await callProviderWithRetry(() =>
        client.getProfileOnce(entry.handle),
      );
      posts = await callProviderWithRetry(() =>
        client.getPostsOnce(entry.handle),
      );
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      continue;
    }
    const candidate = computeCandidate(
      toSearchProfile(entry),
      toProfileUser(profile),
      posts.map(toInstagramPost),
      plan,
    );
    const accepted =
      candidate !== null &&
      matchesWantedTier(candidate.followers, wantedTiers, false) &&
      passesLiveAudienceGate(candidate, plan);
    progress = await persistStepProgress(
      context,
      ref,
      {
        attempted: [entry.handle],
        candidates:
          accepted && candidate ? [candidate as RawDiscoveryCandidate] : [],
      },
      checkpoint,
      "scrape.enrich",
      "partnerships.discovery.scrape_progress",
    );
  }

  if (progress.candidates.length === 0) {
    if (lastError) throw lastError;
    throw new PartnershipsDiscoveryNoCandidatesError(
      "Live discovery found no candidates matching the frozen plan",
    );
  }
  return progress;
}

export function createPartnershipsDiscoveryHandlerV5(
  dependencies: PartnershipsDiscoveryHandlerV5Dependencies,
): DurableExecutionHandlerV2<
  PartnershipsDiscoveryCommandV2,
  PartnershipsDiscoveryCheckpointV5,
  PartnershipsDiscoveryResultV2,
  PartnershipsDiscoveryEffectsV5
> {
  if (dependencies.assignEffect.step !== PARTNERSHIPS_YALC_ASSIGN_EFFECT_STEP) {
    throw new Error("v5 assign effect must declare the yalc.assign_leads step");
  }
  const loadFixtures = dependencies.loadFixtures ?? loadFixtureCandidates;
  const effectMap = {
    [PARTNERSHIPS_YALC_ASSIGN_EFFECT_STEP]: dependencies.assignEffect,
  } as unknown as PartnershipsDiscoveryEffectsV5;

  return {
    contractVersion: DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION_V2,
    operation: DISCOVERY_EXECUTION_OPERATION,
    version: PARTNERSHIPS_DISCOVERY_HANDLER_VERSION_V5,
    command: partnershipsDiscoveryCommandContractV2,
    checkpoint: partnershipsDiscoveryCheckpointContractV5,
    result: partnershipsDiscoveryResultContractV2,
    effects: effectMap,
    async execute(command, context) {
      const assignmentEffectKey = durableExecutionEffectKey({
        operation: DISCOVERY_EXECUTION_OPERATION,
        runId: context.run.id,
        handlerVersion: PARTNERSHIPS_DISCOVERY_HANDLER_VERSION_V5,
        step: PARTNERSHIPS_YALC_ASSIGN_EFFECT_STEP,
      });
      if (command.artifactStore !== PARTNERSHIPS_LOCAL_ARTIFACT_STORE) {
        throw new Error("shared artifact store is not configured");
      }
      const plan = command.plan as unknown as DiscoveryPlan;
      const fixtures = command.executionIntent === "fixtures";
      if (!fixtures && !supportsLiveDiscovery(plan)) {
        throw new Error(
          `Partnerships v5 live discovery currently supports Instagram only; unsupported networks: ${unsupportedLiveDiscoveryNetworks(plan).join(", ")}`,
        );
      }
      const ref: DiscoveryScrapeProgressRef = {
        slug: command.slug,
        runId: context.run.id,
        searchId: command.searchId,
      };
      const checkpoint = decodeCheckpointV5(context.run.output);

      let rawCandidates: unknown = null;
      if (!fixtures) {
        const client = await dependencies.resolveScrapeClient(command);
        let progress: DiscoveryScrapeProgress | null = null;
        if (checkpoint.stage === "search") {
          progress = await runSearchStage(
            context,
            ref,
            plan,
            client,
            checkpoint,
          );
          checkpoint.stage = "enrich";
          await context.checkpoint("scrape.enrich", { ...checkpoint });
        }
        if (checkpoint.stage === "enrich") {
          progress = await runEnrichStage(
            context,
            ref,
            plan,
            client,
            checkpoint,
            progress ??
              loadDiscoveryScrapeProgress(ref) ??
              emptyDiscoveryScrapeProgress(),
          );
          checkpoint.stage = "qualify";
          await context.checkpoint("qualify", { ...checkpoint });
        }
        if (checkpoint.stage === "qualify") {
          progress = progress ?? loadDiscoveryScrapeProgress(ref);
          // A checkpoint that recorded accepted candidates but a store with
          // none means the single-host progress file was lost or replaced:
          // fail closed as corruption instead of a misleading "no candidates".
          if (
            checkpoint.candidateCount > 0 &&
            (progress?.candidates.length ?? 0) === 0
          ) {
            throw new DiscoveryProgressStoreError(
              "progress_corrupt",
              "Scrape progress vanished between checkpointed steps",
            );
          }
        }
        rawCandidates = (progress ?? emptyDiscoveryScrapeProgress()).candidates;
      } else {
        rawCandidates = loadFixtures();
        if (checkpoint.stage === "search" || checkpoint.stage === "enrich") {
          checkpoint.stage = "qualify";
        }
      }

      await stopIfCancellationRequested(context, "before_qualify");
      if (checkpoint.stage === "qualify") {
        const data = buildAssignmentDataV5(
          command,
          assignmentEffectKey,
          rawCandidates,
        );
        const persisted = persistDiscoveryAssignmentArtifact(
          {
            slug: command.slug,
            runId: context.run.id,
            effectKey: assignmentEffectKey,
            searchId: command.searchId,
            campaignId: command.campaignId,
          },
          data,
        );
        checkpoint.qualified = {
          artifactFingerprint: discoveryAssignmentArtifactFingerprint(persisted),
          qualifiedCount: persisted.qualifiedCount,
          totalQuality: persisted.totalQuality,
          invalid: persisted.invalid,
          filtered: persisted.filtered,
        };
        checkpoint.stage = "assign";
        await context.assertLease();
        await context.checkpoint("assign", { ...checkpoint }, {
          type: "partnerships.discovery.assignment_prepared",
          data: {
            qualifiedCount: checkpoint.qualified.qualifiedCount,
            artifactFingerprint: checkpoint.qualified.artifactFingerprint,
          },
        });
      }

      const qualified = checkpoint.qualified;
      if (!qualified) {
        throw new Error("assignment stage reached without qualified snapshot");
      }
      const assigned = await context.effect(
        PARTNERSHIPS_YALC_ASSIGN_EFFECT_STEP,
        {
          executionRunId: context.run.id,
          assignmentEffectKey,
          slug: command.slug,
          searchId: command.searchId,
          campaignId: command.campaignId,
          credentialRef: command.yalc.credentialRef,
          targetBindingFingerprint: command.yalc.targetBindingFingerprint,
          artifactStore: PARTNERSHIPS_LOCAL_ARTIFACT_STORE,
          artifactFingerprint: qualified.artifactFingerprint,
          qualifiedCount: qualified.qualifiedCount,
          totalQuality: qualified.totalQuality,
          invalid: qualified.invalid,
          filtered: qualified.filtered,
        },
      );
      try {
        // Scrape progress holds lead PII and its purpose ends with the
        // committed assignment; the frozen artifact keeps the audited copy.
        deleteDiscoveryScrapeProgress(ref);
      } catch {
        // Best-effort cleanup; retention bounds still apply to leftovers.
      }
      return {
        status: "completed",
        currentStep: "verify",
        output: {
          completionBoundary: "partnerships_discovery_completed",
          stats: assigned.stats,
        },
        eventType: "partnerships.discovery.completed",
        eventData: {
          completionBoundary: "partnerships_discovery_completed",
          executionVersion: 2,
          handlerVersion: PARTNERSHIPS_DISCOVERY_HANDLER_VERSION_V5,
        },
      };
    },
    classifyPureError(error) {
      if (error instanceof ScrapeCreatorsAtomicError) {
        return {
          code: `partnerships_scrape_${error.code}`,
          retryable: error.retryable,
          message: "Partnerships discovery provider call failed",
        };
      }
      if (error instanceof PartnershipsDiscoveryNoCandidatesError) {
        return {
          code: error.code,
          retryable: false,
          message: error.message,
        };
      }
      if (error instanceof DiscoveryProgressStoreError) {
        return {
          code: `partnerships_${error.code}`,
          retryable: error.code === "progress_lock_timeout",
          message: "Partnerships discovery progress store failed",
        };
      }
      if (error instanceof DiscoveryExecutionArtifactError) {
        return {
          code: `partnerships_${error.code}`,
          retryable: false,
          message: "Partnerships discovery assignment artifact failed",
        };
      }
      return {
        code:
          error instanceof Error && "code" in error
            ? String((error as Error & { code: unknown }).code)
            : "partnerships_discovery_v5_contract_invalid",
        retryable: false,
        message: "Partnerships discovery failed closed at a pure boundary",
      };
    },
    projectTerminal(run, command) {
      return dependencies.projectTerminal?.(run, command);
    },
  };
}
