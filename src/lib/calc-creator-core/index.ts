/**
 * calc-creator-core · API pública (SAN-75)
 *
 * Paquete TS puro (sin DOM, sin Next, sin DB) con la lógica de la calc de
 * Partnerships. Pasada A (Ola 0): motor de QUALITY SCORE + config sembrada.
 *
 * Pasada B (SAN-75b · Ola 2 — NO construida aún): motor de BREAK-EVEN.
 * Cuando llegue, vivirá en `./break-even.ts` y se exportará desde aquí:
 *   - solo fijo:        necesita ≥ fee / CAC_objetivo
 *   - fijo + variable:  necesita ≥ fee / (CAC_objetivo − CPA_variable)
 *   - multiplicador de incentivo ×1/1.5/2/3 del lado de lo alcanzable
 *   - veredicto verde/ámbar/rojo (ratios en `config.breakEven.verdict`)
 * La config sembrada (`DEFAULT_CREATOR_MODEL_CONFIG.breakEven`) y sus tipos
 * (`BreakEvenSeedConfig`) ya están listos para acogerlo.
 */

export type {
  BreakEvenSeedConfig,
  CompetitorPromo,
  CreatorMetrics,
  CreatorModelConfig,
  CreatorSignals,
  QualificationConfig,
  QualificationMode,
  QualityComponent,
  QualityComponentKey,
  QualityScoreResult,
  QualityWeights,
  ScoreBand,
  ScoreBandsConfig,
  TierConfig,
  TierKey,
} from "./types";

export {
  DEFAULT_CREATOR_MODEL_CONFIG,
  isBelowQualificationThreshold,
  resolveTier,
  scoreBand,
} from "./config";

export {
  computeQualityScore,
  NEUTRAL_SCORE,
  scoreAudienceEs,
  scoreAuthenticity,
  scoreConsistency,
  scoreErVsTier,
  scoreSectorFit,
} from "./quality-score";

export { SEED_CREATORS } from "./seed-creators";
export type { SeedCreator } from "./seed-creators";
