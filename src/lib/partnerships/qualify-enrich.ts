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
 *
 * Excepción de producto (SAN-480): buscamos CREADORES. Si el clasificador
 * influencer-vs-empresa dictamina `business` (clínica/tienda/marca), el score
 * se fuerza a 0 para que Yalc la descarte bajo cualquier umbral, con la razón
 * visible en `qualityComponents.accountType` y el tag
 * `descartada:cuenta-empresa`. Un veredicto `ambiguous` no descarta: marca el
 * lead con "⚠️ revisar: posible cuenta de negocio".
 */

import { computeQualityScore, DEFAULT_CREATOR_MODEL_CONFIG } from "@/lib/calc-creator-core";
import type { CreatorModelConfig, QualityScoreResult } from "@/lib/calc-creator-core";
import {
  classifyCandidateAccountType,
  type AccountTypeClassification,
} from "./account-type-classifier";
import { candidateToCreatorMetrics } from "./discovery-normalize";
import type { DiscoveryLeadPayload, LeadQualityComponents, RawDiscoveryCandidate } from "./discovery-types";

/** Razón visible cuando el clasificador descarta una cuenta de empresa. */
export const BUSINESS_ACCOUNT_DISQUALIFY_NOTE =
  "Cuenta de empresa (clínica/tienda), no creadora";

/** Nota de revisión cuando el clasificador no puede decidir. */
export const AMBIGUOUS_ACCOUNT_REVIEW_NOTE =
  "⚠️ revisar: posible cuenta de negocio";

export interface QualifiedCandidate {
  candidate: RawDiscoveryCandidate;
  score: QualityScoreResult;
  lead: DiscoveryLeadPayload;
  /** Veredicto influencer-vs-empresa aplicado en qualify (SAN-480). */
  accountType: AccountTypeClassification;
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
  let score = computeQualityScore(candidateToCreatorMetrics(candidate), config);
  const accountType = classifyCandidateAccountType(candidate);

  const tags = [`network:${candidate.network}`];
  if (options.searchId) tags.unshift(`search:${options.searchId}`);
  if (candidate.profileUrl) tags.push(`profile:${candidate.profileUrl}`);

  const qualityComponents = toQualityComponents(score);
  if (accountType.verdict === "business") {
    // Solo buscamos creadores: una cuenta de empresa se descarta SIEMPRE.
    // El score 0 fuerza el Disqualified de Yalc bajo cualquier umbral
    // (auto/hybrid) y la razón queda visible junto al desglose del score.
    score = { ...score, total: 0, band: "low" };
    qualityComponents.band = "low";
    qualityComponents.accountType = {
      verdict: "business",
      note: BUSINESS_ACCOUNT_DISQUALIFY_NOTE,
      reasons: accountType.reasons,
    };
    tags.push("descartada:cuenta-empresa");
  } else if (accountType.verdict === "ambiguous") {
    // No se descarta: se marca para revisión manual sin tocar el score.
    qualityComponents.accountType = {
      verdict: "ambiguous",
      note: AMBIGUOUS_ACCOUNT_REVIEW_NOTE,
      reasons: accountType.reasons,
    };
    tags.push("revisar:posible-negocio");
  }

  const lead: DiscoveryLeadPayload = {
    name: leadName(candidate),
    handle: candidate.handle,
    network: candidate.network,
    ...(candidate.followers !== undefined ? { followers: candidate.followers } : {}),
    ...(candidate.engagementRatePct !== undefined ? { engagementRate: candidate.engagementRatePct } : {}),
    ...(score.tier ? { tier: score.tier } : {}),
    ...(candidate.email ? { email: candidate.email } : {}),
    ...(candidate.customVariables ? { customVariables: candidate.customVariables } : {}),
    qualityScore: score.total,
    qualityComponents,
    source: "discovery",
    tags,
  };

  return { candidate, score, lead, accountType };
}

/** Puntúa una lista de candidatos normalizados (orden de entrada preservado). */
export function qualifyCandidates(
  candidates: readonly RawDiscoveryCandidate[],
  options: QualifyOptions = {},
): QualifiedCandidate[] {
  return candidates.map((candidate) => qualifyCandidate(candidate, options));
}
