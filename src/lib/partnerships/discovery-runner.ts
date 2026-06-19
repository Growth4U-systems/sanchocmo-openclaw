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
import type { DiscoveryRunnerStats, DiscoverySearchRecord } from "./discovery-types";
import type { QualifiedCandidate } from "./qualify-enrich";

interface YalcAssignResponse {
  ok?: boolean;
  campaignId?: string;
  leads?: Array<{ id?: string; handle?: string | null; lifecycleStatus?: string; discardNote?: string | null }>;
  dropped?: Array<{ providerId?: string; handle?: string | null; score?: number | null }>;
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
  response: YalcAssignResponse,
): DiscoveryRunnerStats {
  const inserted = response.leads ?? [];
  const dropped = response.dropped ?? [];
  const disqualified = inserted.filter((lead) => lead.lifecycleStatus === "Disqualified").length;
  const avgQuality =
    qualified.length > 0
      ? Math.round(qualified.reduce((sum, item) => sum + item.score.total, 0) / qualified.length)
      : null;
  return {
    candidates: qualified.length,
    invalid,
    inserted: inserted.length,
    sourced: inserted.length - disqualified,
    disqualified,
    dropped: dropped.length,
    avgQuality,
  };
}

/** Ejecuta el runner de una búsqueda existente (creada con createDiscoverySearch). */
export async function runDiscoverySearch(options: RunDiscoveryOptions): Promise<RunDiscoveryResult> {
  const { slug, searchId } = options;
  const search = getSearch(slug, searchId);
  if (!search) throw new Error(`Discovery search not found: ${searchId} (${slug})`);

  const useFixtures = options.fixtures ?? fixturesEnabledByEnv();
  const mode = useFixtures ? "fixtures" : "live";
  updateRunnerState(slug, searchId, {
    status: "running",
    mode,
    startedAt: new Date().toISOString(),
    error: null,
  });

  try {
    const raw = useFixtures ? loadFixtureCandidates() : options.candidates;
    const { candidates, invalid } = normalizeCandidates(raw);
    if (candidates.length === 0) {
      throw new Error(
        useFixtures
          ? "Fixture mode produced no candidates"
          : "No candidates provided — run the agentic scraping (discovery-search-runner skill) or pass fixtures=true",
      );
    }

    // qualify-enrich: quality score real (calc-creator-core) por candidato,
    // con la config EFECTIVA del modelo (Yalc model-config + defaults, SAN-76;
    // degrada a la sembrada si Yalc no responde).
    const effective = await getEffectiveModelConfig(slug);
    const qualified = qualifyCandidates(candidates, { searchId, config: effective.config });

    // Inserción en Yalc — resolveEntryStatus decide Sourced/Disqualified/drop.
    const response = await yalcFetch<YalcAssignResponse>(
      resolveYalcConfig(slug),
      `/api/campaigns/${encodeURIComponent(search.campaignId)}/leads/assign`,
      { method: "POST", body: { leads: qualified.map((item) => item.lead) } },
    );

    const stats = buildStats(qualified, invalid, response);
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
            `quality medio ${stats.avgQuality ?? "—"}.`,
        });
      } catch (err) {
        console.error(`[partnerships] updateTask failed for search ${searchId} (${slug}):`, err);
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
