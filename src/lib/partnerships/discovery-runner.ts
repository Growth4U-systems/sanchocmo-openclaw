/**
 * Partnerships discovery · runner (SAN-79)
 *
 * Ejecuta el plan de una búsqueda: candidatos → normalizar → qualify-enrich
 * (quality score REAL con calc-creator-core) → insertar como Leads en la
 * campaign Partnerships de Yalc. La decisión de entrada (Sourced vs
 * Disqualified con nota auto) la aplica Yalc con `resolveEntryStatus` según
 * el `qualification_mode` de la campaign (hybrid por defecto).
 *
 * Fuentes de candidatos:
 *  - `fixtures: true` (o env `DISCOVERY_FIXTURES=1`) → los 9 creators fake del
 *    mockup, SIN llamar a ScrapeCreators (camino de tests + verificador).
 *  - `candidates: [...]` → salida cruda del scraping agentic (la skill
 *    `discovery-search-runner` los produce con mcp__scrapecreators__* y los
 *    POSTea a `/api/partnerships/searches/{id}/run`).
 */

import { updateTask } from "@/lib/data/tasks";
import { resolveYalcConfig, yalcFetch } from "@/lib/yalc/client";
import { observeDiscoveryExecutionTransition } from "./discovery-execution-observer";
import {
  loadDiscoveryAssignmentArtifact,
  persistDiscoveryAssignmentArtifact,
  type DiscoveryAssignmentArtifactRef,
} from "./discovery-execution-artifact";
import {
  DiscoveryDurableAuthorityError,
  isDiscoveryLedgerAuthoritative,
  resolveDiscoveryExecutionPolicy,
} from "./discovery-execution-policy";
import { normalizeCandidates } from "./discovery-normalize";
import { getSearch, updateRunnerState } from "./discovery-store";
import { fixturesEnabledByEnv, loadFixtureCandidates } from "./fixtures";
import { getEffectiveModelConfig } from "./model-config";
import { qualifyCandidates } from "./qualify-enrich";
import { scrapeLiveDiscoveryCandidates } from "./scrapecreators-live";
import type {
  DiscoveryPlan,
  DiscoveryRunnerStats,
  DiscoverySearchRecord,
  RawDiscoveryCandidate,
} from "./discovery-types";
import type { QualifiedCandidate } from "./qualify-enrich";
import type { CreatorModelConfig } from "@/lib/calc-creator-core";

const DEFAULT_YALC_WRITE_TIMEOUT_MS = 15_000;

interface YalcAssignResponse {
  ok?: boolean;
  campaignId?: string;
  leads?: Array<{
    id?: string;
    handle?: string | null;
    lifecycleStatus?: string;
    discardNote?: string | null;
  }>;
  dropped?: Array<{
    providerId?: string;
    handle?: string | null;
    score?: number | null;
  }>;
}

export interface RunDiscoveryOptions {
  slug: string;
  searchId: string;
  /** Candidatos crudos del scraping agentic (ignorado si fixtures=true). */
  candidates?: unknown;
  /** Modo fixture: usa los seeds del mockup sin llamar a ScrapeCreators. */
  fixtures?: boolean;
  /** Internal execution hooks used by the fenced canary worker. */
  execution?: {
    /** Marker set only by the worker after an atomic Ledger claim. */
    leaseAuthority?: "canary";
    /** The durable worker owns the JSON projection and Ledger lifecycle. */
    manageRunnerState?: boolean;
    /** Stable for every reclaim of the same durable run. */
    yalcIdempotencyKey?: string;
    /** Bounded external write deadline; primarily injectable for tests. */
    yalcWriteTimeoutMs?: number;
    /** Runtime deadline/shutdown signal owned by the durable handler contract. */
    signal?: AbortSignal;
    /** Effective scoring config frozen before Ledger admission. */
    modelConfig?: CreatorModelConfig;
    /** Private exact-payload checkpoint; required for durable canary effects. */
    assignmentArtifact?: Pick<
      DiscoveryAssignmentArtifactRef,
      "runId" | "effectKey"
    >;
    /** Immutable product command captured in the authoritative Ledger run. */
    commandSnapshot?: {
      title: string;
      plan: DiscoveryPlan;
      campaignId: string;
      projectId: string | null;
      taskId: string | null;
    };
    /** Fenced checkpoint before every expensive or externally visible step. */
    beforeStep?: (
      step:
        | "discover"
        | "ingest"
        | "qualify"
        | "prepare_assignment"
        | "assign"
        | "project",
    ) => Promise<void>;
  };
}

export interface RunDiscoveryResult {
  search: DiscoverySearchRecord;
  stats: DiscoveryRunnerStats;
  /** Empty on a durable reclaim to avoid a second private PII copy on disk. */
  qualified: QualifiedCandidate[];
  inserted: NonNullable<YalcAssignResponse["leads"]>;
  dropped: NonNullable<YalcAssignResponse["dropped"]>;
}

function yalcWriteTimeoutMs(options: RunDiscoveryOptions): number {
  const raw =
    options.execution?.yalcWriteTimeoutMs ??
    Number(process.env.PARTNERSHIPS_DISCOVERY_YALC_WRITE_TIMEOUT_MS);
  if (!Number.isFinite(raw)) return DEFAULT_YALC_WRITE_TIMEOUT_MS;
  return Math.max(25, Math.min(Math.floor(raw), 45_000));
}

async function assignLeadsBounded(
  options: RunDiscoveryOptions,
  search: DiscoverySearchRecord,
  jobId: string,
  body: unknown,
): Promise<YalcAssignResponse> {
  const controller = new AbortController();
  const signal = options.execution?.signal
    ? AbortSignal.any([controller.signal, options.execution.signal])
    : controller.signal;
  const timeout = setTimeout(
    () => controller.abort(),
    yalcWriteTimeoutMs(options),
  );
  try {
    return await yalcFetch<YalcAssignResponse>(
      resolveYalcConfig(options.slug),
      `/api/campaigns/${encodeURIComponent(search.campaignId)}/leads/assign`,
      {
        method: "POST",
        headers: { "Idempotency-Key": jobId },
        body,
        signal,
      },
    );
  } catch (error) {
    if (controller.signal.aborted && !options.execution?.signal?.aborted) {
      throw new Error("YALC leads assignment timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function buildStats(
  qualifiedCount: number,
  totalQuality: number,
  invalid: number,
  filtered: number,
  response: YalcAssignResponse,
): DiscoveryRunnerStats {
  const inserted = response.leads ?? [];
  const dropped = response.dropped ?? [];
  const disqualified = inserted.filter(
    (lead) => lead.lifecycleStatus === "Disqualified",
  ).length;
  const avgQuality =
    qualifiedCount > 0 ? Math.round(totalQuality / qualifiedCount) : null;
  return {
    candidates: qualifiedCount,
    invalid,
    filtered,
    inserted: inserted.length,
    sourced: inserted.length - disqualified,
    disqualified,
    dropped: dropped.length,
    avgQuality,
  };
}

/**
 * Aplica los hard gates del plan también a los candidatos del runner agentic.
 * Si el runner agentic trae audiencia ES real, esa señal manda. En el runner
 * live de Instagram (sin geografía de audiencia), el gate usa el porcentaje
 * CET calculado de timestamps reales. Nunca se infiere desde bio o captions.
 */
export function applyDiscoveryPlanGates(
  candidates: RawDiscoveryCandidate[],
  plan: DiscoveryPlan,
): { candidates: RawDiscoveryCandidate[]; filtered: number } {
  const wantedNetworks = new Set(plan.networks);
  const wantedTiers = new Set(plan.tiers || []);
  const tierForFollowers = (
    followers: number | undefined,
  ): DiscoveryPlan["tiers"][number] | null => {
    if (followers === undefined || followers < 0) return null;
    if (followers < 25_000) return "nano";
    if (followers < 100_000) return "micro";
    if (followers < 250_000) return "mid";
    return "macro";
  };

  const eligible = candidates.filter((candidate) => {
    if (!wantedNetworks.has(candidate.network)) return false;
    if (wantedTiers.size > 0) {
      const tier = tierForFollowers(candidate.followers);
      if (!tier || !wantedTiers.has(tier)) return false;
    }
    if (plan.audienceEsMinPct !== undefined) {
      const audienceSignal =
        candidate.signals?.spanishAudiencePct ??
        candidate.signals?.cetAlignmentPct;
      if (
        typeof audienceSignal !== "number" ||
        !Number.isFinite(audienceSignal) ||
        audienceSignal < plan.audienceEsMinPct
      ) {
        return false;
      }
    }
    return true;
  });

  const requested = Number.isFinite(plan.targetVolume)
    ? Math.max(1, Math.floor(plan.targetVolume as number))
    : eligible.length;
  const selected = eligible.slice(0, Math.min(requested, 500));
  return {
    candidates: selected,
    filtered: candidates.length - selected.length,
  };
}

/** Ejecuta el runner de una búsqueda existente (creada con createDiscoverySearch). */
export async function runDiscoverySearch(
  options: RunDiscoveryOptions,
): Promise<RunDiscoveryResult> {
  const { slug, searchId } = options;
  const storedSearch = getSearch(slug, searchId);
  if (!storedSearch)
    throw new Error(`Discovery search not found: ${searchId} (${slug})`);
  const executionPolicy = resolveDiscoveryExecutionPolicy(slug);
  if (
    (isDiscoveryLedgerAuthoritative(storedSearch) ||
      (executionPolicy.enabled && executionPolicy.mode === "canary")) &&
    options.execution?.leaseAuthority !== "canary"
  ) {
    throw new DiscoveryDurableAuthorityError(
      "Partnerships discovery canary execution requires a claimed Ledger lease",
    );
  }
  const search = options.execution?.commandSnapshot
    ? {
        ...storedSearch,
        title: options.execution.commandSnapshot.title,
        plan: options.execution.commandSnapshot.plan,
        campaignId: options.execution.commandSnapshot.campaignId,
        projectId: options.execution.commandSnapshot.projectId,
        taskId: options.execution.commandSnapshot.taskId,
      }
    : storedSearch;
  if (search.archivedAt)
    throw new Error(`Discovery search is archived: ${searchId}`);

  const useFixtures = options.fixtures ?? fixturesEnabledByEnv();
  const mode = useFixtures ? "fixtures" : "live";
  const manageRunnerState = options.execution?.manageRunnerState !== false;
  if (
    options.execution?.leaseAuthority === "canary" &&
    (!options.execution.modelConfig || !options.execution.assignmentArtifact)
  ) {
    throw new Error(
      "Durable discovery canary requires frozen model config and assignment artifact",
    );
  }
  const currentAttempts = Math.max(0, search.runner.attempts ?? 0);
  const attempt =
    search.runner.status === "error"
      ? currentAttempts + 1
      : Math.max(1, currentAttempts);
  const runningSearch = manageRunnerState
    ? updateRunnerState(slug, searchId, {
        status: "running",
        mode,
        attempts: attempt,
        startedAt: new Date().toISOString(),
        error: null,
      })
    : search;
  if (manageRunnerState) {
    await observeDiscoveryExecutionTransition(
      runningSearch,
      "execution.started",
      {
        status: "running",
        currentStep: options.candidates === undefined ? "discover" : "ingest",
      },
      {
        runnerMode: mode,
        candidateSource: useFixtures
          ? "fixtures"
          : options.candidates === undefined
            ? "provider"
            : "agent_callback",
      },
    );
  }

  try {
    await options.execution?.beforeStep?.(
      options.candidates === undefined ? "discover" : "ingest",
    );
    const jobId =
      options.execution?.yalcIdempotencyKey ||
      search.runner.jobId ||
      `partnerships.discovery:${searchId}`;
    const artifactRef = options.execution?.assignmentArtifact
      ? {
          slug,
          runId: options.execution.assignmentArtifact.runId,
          effectKey: options.execution.assignmentArtifact.effectKey,
          searchId,
          campaignId: search.campaignId,
        }
      : null;
    let artifact = artifactRef
      ? loadDiscoveryAssignmentArtifact(artifactRef)
      : null;
    let qualifiedForResult: QualifiedCandidate[] = [];
    if (!artifact) {
      const raw = useFixtures
        ? loadFixtureCandidates()
        : (options.candidates ??
          (await scrapeLiveDiscoveryCandidates(search.plan, {
            signal: options.execution?.signal,
          })));
      const normalized = normalizeCandidates(raw);
      const gated = applyDiscoveryPlanGates(normalized.candidates, search.plan);
      const { candidates } = gated;
      if (candidates.length === 0) {
        throw new Error(
          useFixtures
            ? "Fixture mode produced no candidates"
            : normalized.candidates.length === 0
              ? "No candidates provided — run live/agentic discovery or pass fixtures=true"
              : `No candidates met the plan hard gates${search.plan.audienceEsMinPct !== undefined ? ` (audiencia ES/alineación CET ≥ ${search.plan.audienceEsMinPct}%)` : ""}`,
        );
      }

      await options.execution?.beforeStep?.("qualify");
      const modelConfig = options.execution?.modelConfig
        ? options.execution.modelConfig
        : (await getEffectiveModelConfig(slug)).config;
      const qualified = qualifyCandidates(candidates, {
        searchId,
        config: modelConfig,
      });
      qualifiedForResult = qualified;
      const assignmentBody = {
        leads: qualified.map((item) => ({
          ...item.lead,
          provenance: {
            provider: "scrapecreators",
            operation: "creator_discovery",
            searchId,
            jobId,
            source: "sancho_partnerships_discovery",
          },
          scoreProvenance: {
            provider: "calc-creator-core",
            operation: "creator_quality_score",
            searchId,
            jobId,
          },
        })),
      };
      artifact = {
        assignmentBody,
        qualifiedCount: qualified.length,
        totalQuality: qualified.reduce(
          (sum, item) => sum + item.score.total,
          0,
        ),
        invalid: normalized.invalid,
        filtered: gated.filtered,
      };
      if (artifactRef) {
        await options.execution?.beforeStep?.("prepare_assignment");
        artifact = persistDiscoveryAssignmentArtifact(artifactRef, artifact);
      }
    }

    // Insertion replay always uses the exact private artifact bytes/shape.
    await options.execution?.beforeStep?.("assign");
    const response = await assignLeadsBounded(
      options,
      search,
      jobId,
      artifact.assignmentBody,
    );

    const stats = buildStats(
      artifact.qualifiedCount,
      artifact.totalQuality,
      artifact.invalid,
      artifact.filtered,
      response,
    );
    await options.execution?.beforeStep?.("project");
    const updated = manageRunnerState
      ? updateRunnerState(slug, searchId, {
          status: "done",
          finishedAt: new Date().toISOString(),
          stats,
        })
      : search;
    if (manageRunnerState) {
      await observeDiscoveryExecutionTransition(
        updated,
        "execution.completed",
        { status: "completed", currentStep: "verify", output: { stats } },
        { stats },
      );
    }

    if (search.taskId) {
      try {
        await updateTask(slug, search.taskId, {
          execution_notes:
            `Runner ${mode} completado: ${stats.inserted} leads insertados en la campaign ${search.campaignId} ` +
            `(${stats.sourced} Sourced · ${stats.disqualified} Disqualified auto · ${stats.dropped} drop) · ` +
            `${stats.filtered} fuera por gates/volumen · ` +
            `quality medio ${stats.avgQuality ?? "—"}.`,
        });
      } catch (err) {
        console.error(
          `[partnerships] updateTask failed for search ${searchId} (${slug}):`,
          err,
        );
      }
    }

    return {
      search: updated,
      stats,
      qualified: qualifiedForResult,
      inserted: response.leads ?? [],
      dropped: response.dropped ?? [],
    };
  } catch (err) {
    if (!manageRunnerState) throw err;
    const failed = updateRunnerState(slug, searchId, {
      status: "error",
      finishedAt: new Date().toISOString(),
      error: err instanceof Error ? err.message : String(err),
    });
    await observeDiscoveryExecutionTransition(failed, "execution.failed", {
      status: "failed",
      currentStep: "failed",
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
