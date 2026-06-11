/**
 * calc-creator-core · config sembrada v1 (SAN-75)
 *
 * Espejo de `OUTPUTS/sanchocmo/mockups-partnerships/settings.html` (Comic UI):
 * tiers + ER benchmark, verticals y formats del programa Monzo creators ES.
 * Hardcode v1: SAN-76 migrará esta config a Model settings editable; por eso
 * todo es `CreatorModelConfig` tipado y las funciones aceptan overrides.
 */

import type { CreatorModelConfig, ScoreBand, ScoreBandsConfig, TierConfig } from "./types";

export const DEFAULT_CREATOR_MODEL_CONFIG: CreatorModelConfig = {
  // Rangos con límite superior EXCLUSIVO (250.000 → Macro).
  tiers: [
    { key: "nano", label: "Nano", minFollowers: 0, maxFollowers: 25_000, erBenchmarkPct: 8.0 },
    { key: "micro", label: "Micro", minFollowers: 25_000, maxFollowers: 100_000, erBenchmarkPct: 5.5 },
    { key: "mid", label: "Mid", minFollowers: 100_000, maxFollowers: 250_000, erBenchmarkPct: 4.0 },
    { key: "macro", label: "Macro", minFollowers: 250_000, maxFollowers: null, erBenchmarkPct: 2.5 },
  ],
  verticals: ["finanzas personales", "inversión", "ahorro", "fintech"],
  formats: ["reel", "post", "story", "video largo", "carrusel"],
  // Pesos por defecto: iguales (0.2). Con ellos el desglose del drawer
  // (92/88/95/84/76) reproduce exactamente el total 87 del mockup.
  weights: {
    erVsTier: 0.2,
    authenticity: 0.2,
    sectorFit: 0.2,
    audienceEs: 0.2,
    consistency: 0.2,
  },
  // Decisión Alfonso 2026-06-11 (SAN-77): hybrid default, umbral 40.
  qualification: { defaultMode: "hybrid", threshold: 40 },
  // Bandas visuales de la lista (qClass): ≥85 alta · ≥70 media · resto baja.
  scoreBands: { high: 85, medium: 70 },
  // Semillas del break-even (SAN-75b · Ola 2). Motor NO construido aún:
  // valores espejo de la calc del mockup (CAC 80 · click 15% · funnel 8/60/70).
  breakEven: {
    clickRatePct: 15,
    clickToSignupPct: 8,
    signupToKycPct: 60,
    kycToFirstTxPct: 70,
    defaultTargetCacEur: 80,
    incentiveMultipliers: [1, 1.5, 2, 3],
    verdict: { viableMinRatio: 1, tightMinRatio: 0.6 },
  },
};

/**
 * Resuelve el tier de un creator a partir de sus seguidores.
 * Devuelve `null` si followers no es un número finito ≥ 0 (tier desconocido).
 */
export function resolveTier(
  followers: number | undefined,
  tiers: readonly TierConfig[] = DEFAULT_CREATOR_MODEL_CONFIG.tiers,
): TierConfig | null {
  if (typeof followers !== "number" || !Number.isFinite(followers) || followers < 0) {
    return null;
  }
  return (
    tiers.find(
      (tier) =>
        followers >= tier.minFollowers &&
        (tier.maxFollowers === null || followers < tier.maxFollowers),
    ) ?? null
  );
}

/** Banda visual del score total (paridad con qClass de contactos-lista). */
export function scoreBand(
  total: number,
  bands: ScoreBandsConfig = DEFAULT_CREATOR_MODEL_CONFIG.scoreBands,
): ScoreBand {
  if (total >= bands.high) return "high";
  if (total >= bands.medium) return "medium";
  return "low";
}

/**
 * ¿Cae por debajo del umbral de cualificación? (modo auto/hybrid → el
 * runner de SAN-77/79 lo marca `Disqualified` con nota "auto"; reversible.)
 */
export function isBelowQualificationThreshold(
  total: number,
  config: CreatorModelConfig = DEFAULT_CREATOR_MODEL_CONFIG,
): boolean {
  return total < config.qualification.threshold;
}
