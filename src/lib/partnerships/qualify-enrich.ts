/**
 * Partnerships discovery · qualify-enrich (SAN-79)
 *
 * Calcula el quality score REAL con `calc-creator-core` (sustituye al stub de
 * `/api/qualify` en el camino de discovery) y construye el payload de Lead
 * que el runner inserta en Yalc. El sector fit / repeat de competidores entra
 * vía las señales de ad-library del candidato; si no se consultó la ad-library,
 * el paquete puntúa neutro y lo marca en `missingSignals` (señal opcional).
 *
 * La decisión de entrada (Sourced vs Disqualified con nota auto) NO se toma
 * aquí: la aplica Yalc (`resolveEntryStatus`) según el `qualification_mode`
 * de la campaign al insertar — el score es información, no decisión.
 */

import { computeQualityScore, DEFAULT_CREATOR_MODEL_CONFIG } from "@/lib/calc-creator-core";
import type { CreatorModelConfig, QualityScoreResult } from "@/lib/calc-creator-core";
import { candidateToCreatorMetrics } from "./discovery-normalize";
import type { DiscoveryLeadPayload, LeadQualityComponents, RawDiscoveryCandidate } from "./discovery-types";

export interface QualifiedCandidate {
  candidate: RawDiscoveryCandidate;
  score: QualityScoreResult;
  lead: DiscoveryLeadPayload;
}

export interface QualifyOptions {
  /** Id de la búsqueda — se etiqueta en el Lead (`search:<id>`). */
  searchId?: string;
  /** Config del modelo (SAN-76 la hará editable; default sembrada). */
  config?: CreatorModelConfig;
}

function leadName(candidate: RawDiscoveryCandidate): string {
  return candidate.name ?? candidate.handle.replace(/^@/, "");
}

function toQualityComponents(score: QualityScoreResult): LeadQualityComponents {
  return {
    band: score.band,
    tier: score.tier,
    tierLabel: score.tierLabel,
    erBenchmarkPct: score.erBenchmarkPct,
    components: score.components,
    missingSignals: score.missingSignals,
    engine: "calc-creator-core",
  };
}

/** Puntúa un candidato y construye su payload de Lead para Yalc. */
export function qualifyCandidate(
  candidate: RawDiscoveryCandidate,
  options: QualifyOptions = {},
): QualifiedCandidate {
  const config = options.config ?? DEFAULT_CREATOR_MODEL_CONFIG;
  const score = computeQualityScore(candidateToCreatorMetrics(candidate), config);

  const tags = [`network:${candidate.network}`];
  if (options.searchId) tags.unshift(`search:${options.searchId}`);
  if (candidate.profileUrl) tags.push(`profile:${candidate.profileUrl}`);

  const lead: DiscoveryLeadPayload = {
    name: leadName(candidate),
    handle: candidate.handle,
    network: candidate.network,
    ...(candidate.followers !== undefined ? { followers: candidate.followers } : {}),
    ...(candidate.engagementRatePct !== undefined ? { engagementRate: candidate.engagementRatePct } : {}),
    ...(score.tier ? { tier: score.tier } : {}),
    ...(candidate.email ? { email: candidate.email } : {}),
    qualityScore: score.total,
    qualityComponents: toQualityComponents(score),
    source: "discovery",
    tags,
  };

  return { candidate, score, lead };
}

/** Puntúa una lista de candidatos normalizados (orden de entrada preservado). */
export function qualifyCandidates(
  candidates: readonly RawDiscoveryCandidate[],
  options: QualifyOptions = {},
): QualifiedCandidate[] {
  return candidates.map((candidate) => qualifyCandidate(candidate, options));
}
