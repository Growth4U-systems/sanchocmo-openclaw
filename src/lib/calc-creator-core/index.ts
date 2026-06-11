/**
 * calc-creator-core · API pública (SAN-75)
 *
 * Paquete TS puro (sin DOM, sin Next, sin DB) con la lógica de la calc de
 * Partnerships. Dos motores:
 *   - Pasada A (Ola 0): QUALITY SCORE 0-100 (`./quality-score.ts`).
 *   - Pasada B (Ola 2): BREAK-EVEN (`./break-even.ts`) — solo fijo /
 *     fijo+variable, multiplicador de incentivo del lado alcanzable,
 *     veredicto verde/ámbar/rojo y contraoferta. Paridad exacta con la calc
 *     de `drawer-partner.html`.
 *
 * La tool MCP `yalc_breakeven` vive en `./mcp-tool.ts` como entrypoint
 * SEPARADO (importa zod + MCP SDK): impórtala como
 * `@/lib/calc-creator-core/mcp-tool` para no arrastrar esas deps a los
 * consumidores puros de este index (drawer de SAN-78, workers de SAN-79).
 */

export type {
  BreakEvenDeal,
  BreakEvenDealEcho,
  BreakEvenFunnel,
  BreakEvenFunnelStep,
  BreakEvenResult,
  BreakEvenSeedConfig,
  BreakEvenVerdict,
  BreakEvenVerdictColor,
  CompetitorPromo,
  CreatorMetrics,
  CreatorModelConfig,
  CreatorSignals,
  DealFormat,
  DealStructure,
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
  BREAK_EVEN_VERDICT_LABELS,
  computeBreakEven,
  normalizeDealFormat,
} from "./break-even";

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
