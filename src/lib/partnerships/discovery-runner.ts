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
}

export interface RunDiscoveryResult {
  search: DiscoverySearchRecord;
  stats: DiscoveryRunnerStats;
  qualified: QualifiedCandidate[];
  inserted: NonNullable<YalcAssignResponse["leads"]>;
  dropped: NonNullable<YalcAssignResponse["dropped"]>;
}

function buildStats(
  qualified: QualifiedCandidate[],
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
    qualified.length > 0
      ? Math.round(
          qualified.reduce((sum, item) => sum + item.score.total, 0) /
            qualified.length,
        )
      : null;
  return {
    candidates: qualified.length,
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
  const search = getSearch(slug, searchId);
  if (!search)
    throw new Error(`Discovery search not found: ${searchId} (${slug})`);
  if (search.archivedAt)
    throw new Error(`Discovery search is archived: ${searchId}`);

  const useFixtures = options.fixtures ?? fixturesEnabledByEnv();
  const mode = useFixtures ? "fixtures" : "live";
  updateRunnerState(slug, searchId, {
    status: "running",
    mode,
    startedAt: new Date().toISOString(),
    error: null,
  });

  try {
    const raw = useFixtures
      ? loadFixtureCandidates()
      : (options.candidates ??
        (await scrapeLiveDiscoveryCandidates(search.plan)));
    const normalized = normalizeCandidates(raw);
    const gated = applyDiscoveryPlanGates(normalized.candidates, search.plan);
    const { candidates } = gated;
    const { invalid } = normalized;
    if (candidates.length === 0) {
      throw new Error(
        useFixtures
          ? "Fixture mode produced no candidates"
          : normalized.candidates.length === 0
            ? "No candidates provided — run live/agentic discovery or pass fixtures=true"
            : `No candidates met the plan hard gates${search.plan.audienceEsMinPct !== undefined ? ` (audiencia ES/alineación CET ≥ ${search.plan.audienceEsMinPct}%)` : ""}`,
      );
    }

    // qualify-enrich: quality score real (calc-creator-core) por candidato,
    // con la config EFECTIVA del modelo (Yalc model-config + defaults, SAN-76;
    // degrada a la sembrada si Yalc no responde).
    const effective = await getEffectiveModelConfig(slug);
    const qualified = qualifyCandidates(candidates, {
      searchId,
      config: effective.config,
    });

    // Inserción en Yalc — resolveEntryStatus decide Sourced/Disqualified/drop.
    const jobId = search.runner.jobId || `partnerships.discovery:${searchId}`;
    const response = await yalcFetch<YalcAssignResponse>(
      resolveYalcConfig(slug),
      `/api/campaigns/${encodeURIComponent(search.campaignId)}/leads/assign`,
      {
        method: "POST",
        headers: { "Idempotency-Key": jobId },
        body: {
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
        },
      },
    );

    const stats = buildStats(qualified, invalid, gated.filtered, response);
    const updated = updateRunnerState(slug, searchId, {
      status: "done",
      finishedAt: new Date().toISOString(),
      stats,
    });

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
      qualified,
      inserted: response.leads ?? [],
      dropped: response.dropped ?? [],
    };
  } catch (err) {
    updateRunnerState(slug, searchId, {
      status: "error",
      finishedAt: new Date().toISOString(),
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
