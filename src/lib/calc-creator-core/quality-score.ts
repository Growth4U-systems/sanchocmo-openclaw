/**
 * calc-creator-core · motor de QUALITY SCORE 0-100 (SAN-75, pasada A)
 *
 * Score de DISCOVERY: solo calidad, sin precio, para ELEGIR creators.
 * 5 componentes (desglose = filas del drawer-partner del mockup):
 *   ⚡ ER vs tier · 🛡️ Autenticidad · 🎯 Sector fit & track record ·
 *   🇪🇸 Audiencia ES · 📆 Consistencia
 *
 * Principios:
 *  - El score es INFORMACIÓN, no decisión (decisión 2026-06-11): el triaje
 *    lo aplica SAN-77 con `qualification_mode` + umbral.
 *  - Señal ausente → neutro 50 + flag, nunca NaN ni descarte silencioso.
 *  - Pesos configurables (se normalizan); defaults calibrados contra los
 *    7 seeds del mockup contactos-lista (ver __tests__ y seed-creators.ts).
 */

import { DEFAULT_CREATOR_MODEL_CONFIG, resolveTier, scoreBand } from "./config";
import type {
  CreatorMetrics,
  CreatorModelConfig,
  CreatorSignals,
  QualityComponent,
  QualityComponentKey,
  QualityScoreResult,
  QualityWeights,
} from "./types";

/** Score neutro cuando falta la señal primaria de un componente. */
export const NEUTRAL_SCORE = 50;

// ── Curva "ER vs tier" ───────────────────────────────────────────────────
// En el benchmark del tier → 75. Por encima premia fuerte (slope 85/unidad
// de ratio, cap 100 ≈ a 1.3× benchmark); por debajo cae lineal hasta 0.
const ER_AT_BENCHMARK_SCORE = 75;
const ER_ABOVE_BENCHMARK_SLOPE = 85;

// ── Autenticidad ─────────────────────────────────────────────────────────
const FAKE_FOLLOWERS_PENALTY_PER_PCT = 2;
const GROWTH_SPIKES_PENALTY = 15;

// ── Sector fit & track record ────────────────────────────────────────────
const VERTICAL_MATCH_MAX = 70; // contenido 100% en verticals objetivo
const REPEAT_COMPETITOR_BONUS = 25; // ≥2 promos misma marca = revealed preference
const SINGLE_PROMO_BONUS = 12; // 1 promo: señal positiva pero sin repeat
const ACTIVE_CONFLICT_PENALTY = 30; // conflicto activo con competidor

// ── Audiencia ES ─────────────────────────────────────────────────────────
const LANGUAGE_WEIGHT = 0.7;
const CET_ALIGNMENT_WEIGHT = 0.3;

// ── Consistencia ─────────────────────────────────────────────────────────
const POSTS_PER_WEEK_SLOPE = 30; // 3+/semana satura la base
const CONSISTENCY_BASE_CAP = 90;
const LONG_GAP_PENALTY = 7; // por parón de 10+ días en 6 meses

const COMPONENT_LABELS: Record<QualityComponentKey, string> = {
  erVsTier: "ER vs tier",
  authenticity: "Autenticidad",
  sectorFit: "Sector fit & track record",
  audienceEs: "Audiencia ES",
  consistency: "Consistencia",
};

interface ComponentScore {
  score: number;
  note: string;
  missingData: boolean;
  missingSignals: string[];
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function fmt(value: number, decimals = 1): string {
  const rounded = value.toFixed(decimals);
  return rounded.endsWith(".0") ? rounded.slice(0, -2) : rounded;
}

/** ⚡ ER vs tier: ratio frente al benchmark del tier resuelto por followers. */
export function scoreErVsTier(
  metrics: CreatorMetrics,
  config: CreatorModelConfig = DEFAULT_CREATOR_MODEL_CONFIG,
): ComponentScore {
  const tier = resolveTier(metrics.followers, config.tiers);
  const er = metrics.engagementRatePct;

  if (!tier || !isFiniteNumber(er) || er < 0) {
    const missingSignals: string[] = [];
    if (!tier) missingSignals.push("followers");
    if (!isFiniteNumber(er) || (er as number) < 0) missingSignals.push("engagementRate");
    const what = !tier ? "tier desconocido (followers no válidos)" : "ER no disponible";
    return {
      score: NEUTRAL_SCORE,
      note: `Sin datos suficientes (${what}) — se aplica neutro ${NEUTRAL_SCORE}.`,
      missingData: true,
      missingSignals,
    };
  }

  const benchmark = tier.erBenchmarkPct;
  const ratio = er / benchmark;
  const raw =
    ratio >= 1
      ? ER_AT_BENCHMARK_SCORE + (ratio - 1) * ER_ABOVE_BENCHMARK_SLOPE
      : ratio * ER_AT_BENCHMARK_SCORE;
  const score = clampScore(raw);
  const verdict =
    ratio >= 1 ? "Por encima del benchmark ✓" : `Por debajo del benchmark (${fmt(ratio * 100, 0)}%)`;
  return {
    score,
    note: `ER ${fmt(er)}% frente a benchmark ${fmt(benchmark)}% del tier ${tier.label}. ${verdict}`,
    missingData: false,
    missingSignals: [],
  };
}

/** 🛡️ Autenticidad: proxy de fake-followers + picos de crecimiento sospechosos. */
export function scoreAuthenticity(signals: CreatorSignals = {}): ComponentScore {
  const fake = signals.fakeFollowersPct;
  if (!isFiniteNumber(fake) || fake < 0) {
    return {
      score: NEUTRAL_SCORE,
      note: `Sin proxy de fake-followers — se aplica neutro ${NEUTRAL_SCORE}.`,
      missingData: true,
      missingSignals: ["fakeFollowers"],
    };
  }
  const spikes = signals.suspiciousGrowthSpikes === true;
  const score = clampScore(
    100 - fake * FAKE_FOLLOWERS_PENALTY_PER_PCT - (spikes ? GROWTH_SPIKES_PENALTY : 0),
  );
  const spikesNote = spikes
    ? "Picos sospechosos de compra de seguidores detectados."
    : "Sin picos sospechosos de compra de seguidores.";
  return {
    score,
    note: `Proxy de fake-followers: ~${fmt(fake, 0)}% estimado. ${spikesNote}`,
    missingData: false,
    missingSignals: [],
  };
}

/**
 * 🎯 Sector fit & track record: cuota de contenido en los verticals objetivo
 * + repeat de competidores vía ad-library (revealed preference) − conflicto activo.
 */
export function scoreSectorFit(signals: CreatorSignals = {}): ComponentScore {
  const match = signals.verticalMatchShare;
  const missingSignals: string[] = [];
  const hasMatch = isFiniteNumber(match) && match >= 0;
  if (!hasMatch) missingSignals.push("verticalMatch");

  const adLibraryChecked = signals.adLibraryChecked === true;
  if (!adLibraryChecked) missingSignals.push("adLibrary");

  const base = hasMatch ? Math.min(match as number, 1) * VERTICAL_MATCH_MAX : NEUTRAL_SCORE;

  let bonus = 0;
  let trackNote: string;
  if (!adLibraryChecked) {
    trackNote = "Sin datos de ad-library: track record de competidores no verificado.";
  } else {
    const promos = signals.competitorPromos ?? [];
    const repeat = promos.find((promo) => promo.count >= 2);
    const single = promos.find((promo) => promo.count === 1);
    if (repeat) {
      bonus = REPEAT_COMPETITOR_BONUS;
      const window = repeat.windowMonths ? ` en ${repeat.windowMonths} meses` : "";
      trackNote = `Repeat de competidores: ${repeat.brand} ${repeat.count}×${window} (ad-library) — revealed preference ✓.`;
    } else if (single) {
      bonus = SINGLE_PROMO_BONUS;
      trackNote = `1 promo de competidor (${single.brand}) detectada vía ad-library, sin repeat aún.`;
    } else {
      trackNote = "Ad-library consultada: sin promos de competidores detectadas.";
    }
  }

  const conflict = signals.activeConflict === true;
  const penalty = conflict ? ACTIVE_CONFLICT_PENALTY : 0;
  const conflictNote = conflict
    ? ` ⚠ Conflicto activo con un competidor (−${ACTIVE_CONFLICT_PENALTY}).`
    : "";

  const matchNote = hasMatch
    ? `Contenido ${fmt(Math.min(match as number, 1) * 100, 0)}% en los verticals objetivo.`
    : `Sin cuota de contenido por vertical — se aplica base neutra ${NEUTRAL_SCORE}.`;

  return {
    score: clampScore(base + bonus - penalty),
    note: `${matchNote} ${trackNote}${conflictNote}`,
    missingData: !hasMatch,
    missingSignals,
  };
}

/** 🇪🇸 Audiencia ES: proxy idioma (70%) + alineación horaria CET (30%). */
export function scoreAudienceEs(signals: CreatorSignals = {}): ComponentScore {
  const language = signals.spanishAudiencePct;
  if (!isFiniteNumber(language) || language < 0) {
    return {
      score: NEUTRAL_SCORE,
      note: `Sin proxy de idioma de la audiencia — se aplica neutro ${NEUTRAL_SCORE}.`,
      missingData: true,
      missingSignals: ["spanishAudience"],
    };
  }
  const missingSignals: string[] = [];
  const hasCet = isFiniteNumber(signals.cetAlignmentPct) && (signals.cetAlignmentPct as number) >= 0;
  if (!hasCet) missingSignals.push("cetAlignment");
  const cet = hasCet ? Math.min(signals.cetAlignmentPct as number, 100) : NEUTRAL_SCORE;
  const lang = Math.min(language, 100);
  const score = clampScore(lang * LANGUAGE_WEIGHT + cet * CET_ALIGNMENT_WEIGHT);
  const cetNote = hasCet
    ? `alineación horaria CET ${fmt(cet, 0)}%.`
    : `sin dato de horarios — CET neutro ${NEUTRAL_SCORE}.`;
  return {
    score,
    note: `Proxy de idioma: ~${fmt(lang, 0)}% de comentarios en español; ${cetNote}`,
    missingData: false,
    missingSignals,
  };
}

/** 📆 Consistencia: cadencia de publicación − parones de 10+ días en 6 meses. */
export function scoreConsistency(signals: CreatorSignals = {}): ComponentScore {
  const postsPerWeek = signals.postsPerWeek;
  if (!isFiniteNumber(postsPerWeek) || postsPerWeek < 0) {
    return {
      score: NEUTRAL_SCORE,
      note: `Sin cadencia de publicación — se aplica neutro ${NEUTRAL_SCORE}.`,
      missingData: true,
      missingSignals: ["postsPerWeek"],
    };
  }
  const gaps = isFiniteNumber(signals.longGapsLast6Months)
    ? Math.max(0, signals.longGapsLast6Months as number)
    : 0;
  const base = Math.min(CONSISTENCY_BASE_CAP, Math.round(postsPerWeek * POSTS_PER_WEEK_SLOPE));
  const score = clampScore(base - gaps * LONG_GAP_PENALTY);
  const gapsNote =
    gaps > 0
      ? `${fmt(gaps, 0)} parón(es) de 10+ días en los últimos 6 meses.`
      : "Sin parones de 10+ días en los últimos 6 meses.";
  return {
    score,
    note: `${fmt(postsPerWeek)} posts/semana. ${gapsNote}`,
    missingData: false,
    missingSignals: [],
  };
}

function normalizeWeights(weights: QualityWeights): QualityWeights {
  const keys = Object.keys(COMPONENT_LABELS) as QualityComponentKey[];
  const safe = keys.map((key) => {
    const value = weights[key];
    return isFiniteNumber(value) && value > 0 ? value : 0;
  });
  const sum = safe.reduce((acc, value) => acc + value, 0);
  const normalized = {} as QualityWeights;
  keys.forEach((key, index) => {
    normalized[key] = sum > 0 ? safe[index] / sum : 1 / keys.length;
  });
  return normalized;
}

/**
 * Calcula el quality score 0-100 de un creator: total + desglose por
 * componente + señales ausentes. Determinista y sin efectos secundarios.
 */
export function computeQualityScore(
  metrics: CreatorMetrics,
  config: CreatorModelConfig = DEFAULT_CREATOR_MODEL_CONFIG,
): QualityScoreResult {
  const signals = metrics.signals ?? {};
  const weights = normalizeWeights(config.weights);

  const partials: Record<QualityComponentKey, ComponentScore> = {
    erVsTier: scoreErVsTier(metrics, config),
    authenticity: scoreAuthenticity(signals),
    sectorFit: scoreSectorFit(signals),
    audienceEs: scoreAudienceEs(signals),
    consistency: scoreConsistency(signals),
  };

  const components: QualityComponent[] = (
    Object.keys(COMPONENT_LABELS) as QualityComponentKey[]
  ).map((key) => ({
    key,
    label: COMPONENT_LABELS[key],
    score: partials[key].score,
    weight: weights[key],
    note: partials[key].note,
    missingData: partials[key].missingData,
  }));

  const total = clampScore(
    components.reduce((acc, component) => acc + component.score * component.weight, 0),
  );

  const tier = resolveTier(metrics.followers, config.tiers);
  const missingSignals = Array.from(
    new Set(
      (Object.keys(partials) as QualityComponentKey[]).flatMap(
        (key) => partials[key].missingSignals,
      ),
    ),
  );

  return {
    total,
    band: scoreBand(total, config.scoreBands),
    tier: tier?.key ?? null,
    tierLabel: tier?.label ?? null,
    erBenchmarkPct: tier?.erBenchmarkPct ?? null,
    components,
    missingSignals,
  };
}
