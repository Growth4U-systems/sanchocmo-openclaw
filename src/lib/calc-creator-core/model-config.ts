/**
 * calc-creator-core · model config: defaults + overrides (SAN-76)
 *
 * CONTRATO COMPARTIDO Sancho ↔ Yalc:
 *
 *  - La FUENTE DE VERDAD de los defaults es `DEFAULT_CREATOR_MODEL_CONFIG`
 *    (./config.ts). Yalc NO conoce los defaults.
 *  - Yalc persiste por tenant un documento JSON de OVERRIDES (deep-partial de
 *    `CreatorModelConfig`) en la tabla `model_configs` y lo sirve por
 *    `GET/PUT /api/model-config` (bearer). El PUT es PARCIAL: deep-merge del
 *    body sobre lo almacenado (los arrays se REEMPLAZAN enteros).
 *  - La config EFECTIVA = `mergeCreatorModelConfig(overrides)` y se calcula
 *    SIEMPRE en Sancho (proxy `/api/yalc/model-config`, qualify-enrich,
 *    create-search, calc del drawer, tool MCP `yalc_update_model_config`).
 *    Si Yalc no responde, la efectiva degrada a los defaults.
 *
 * Semántica del merge (idéntica a la del PUT de Yalc):
 *  - objetos → merge campo a campo · arrays y escalares → reemplazo entero.
 *  - `tiers` es la excepción: se mergea POR `key` (nano/micro/mid/macro) — la
 *    taxonomía de tiers es fija en v1, no se añaden ni quitan tiers.
 *  - Todo lo desconocido o con tipo inválido se DESCARTA (sanitize): un
 *    override corrupto nunca rompe la calc, solo deja el default en pie.
 */

import { DEFAULT_CREATOR_MODEL_CONFIG } from "./config";
import type {
  BreakEvenSeedConfig,
  CreatorModelConfig,
  DealFormat,
  QualificationMode,
  QualityComponentKey,
  TierConfig,
  TierKey,
} from "./types";

/** Claves de primer nivel admitidas en un documento de overrides. */
export const MODEL_CONFIG_OVERRIDE_KEYS = [
  "tiers",
  "verticals",
  "formats",
  "weights",
  "qualification",
  "scoreBands",
  "breakEven",
] as const;

export type ModelConfigOverrideKey = (typeof MODEL_CONFIG_OVERRIDE_KEYS)[number];

/** Override parcial de un tier — se mergea por `key` sobre el tier default. */
export interface TierOverride {
  key: TierKey;
  label?: string;
  minFollowers?: number;
  maxFollowers?: number | null;
  erBenchmarkPct?: number;
}

/** Deep-partial de `CreatorModelConfig` (el documento que Yalc almacena). */
export interface CreatorModelConfigOverrides {
  tiers?: TierOverride[];
  verticals?: string[];
  formats?: string[];
  weights?: Partial<Record<QualityComponentKey, number>>;
  qualification?: { defaultMode?: QualificationMode; threshold?: number };
  scoreBands?: { high?: number; medium?: number };
  breakEven?: Partial<
    Omit<BreakEvenSeedConfig, "ctrByFormatPct" | "incentiveMultipliers" | "verdict">
  > & {
    ctrByFormatPct?: Partial<Record<DealFormat, number>>;
    incentiveMultipliers?: number[];
    verdict?: { viableMinRatio?: number; tightMinRatio?: number };
  };
}

const TIER_KEYS: readonly TierKey[] = ["nano", "micro", "mid", "macro"];
const QUALIFICATION_MODES: readonly QualificationMode[] = ["auto", "manual", "hybrid"];
const WEIGHT_KEYS: readonly QualityComponentKey[] = [
  "erVsTier",
  "authenticity",
  "sectorFit",
  "audienceEs",
  "consistency",
];
const DEAL_FORMATS: readonly DealFormat[] = ["reel", "post", "story", "video", "carrusel"];
const MAX_LIST_ITEMS = 50;
const MAX_LABEL_CHARS = 60;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function finite(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function pct(value: unknown): number | undefined {
  const num = finite(value);
  return num === undefined ? undefined : clamp(num, 0, 100);
}

/** Lista de strings: trim, sin vacíos, dedupe case-insensitive, con topes. */
function sanitizeStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim().slice(0, MAX_LABEL_CHARS);
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(trimmed);
    if (out.length >= MAX_LIST_ITEMS) break;
  }
  return out;
}

function sanitizeTiers(value: unknown): TierOverride[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const byKey = new Map<TierKey, TierOverride>();
  for (const item of value) {
    if (!isRecord(item)) continue;
    const key = item.key;
    if (typeof key !== "string" || !(TIER_KEYS as readonly string[]).includes(key)) continue;
    const tierKey = key as TierKey;
    const previous = byKey.get(tierKey) ?? { key: tierKey };
    const next: TierOverride = { ...previous };

    const er = finite(item.erBenchmarkPct);
    if (er !== undefined && er > 0 && er < 100) next.erBenchmarkPct = er;
    const min = finite(item.minFollowers);
    if (min !== undefined && min >= 0) next.minFollowers = Math.round(min);
    if (item.maxFollowers === null) next.maxFollowers = null;
    else {
      const max = finite(item.maxFollowers);
      if (max !== undefined && max > 0) next.maxFollowers = Math.round(max);
    }
    if (typeof item.label === "string" && item.label.trim()) {
      next.label = item.label.trim().slice(0, MAX_LABEL_CHARS);
    }
    byKey.set(tierKey, next);
  }
  const tiers = Array.from(byKey.values()).filter((tier) => Object.keys(tier).length > 1);
  return tiers.length > 0 ? tiers : undefined;
}

function sanitizeWeights(value: unknown): CreatorModelConfigOverrides["weights"] {
  if (!isRecord(value)) return undefined;
  const out: Partial<Record<QualityComponentKey, number>> = {};
  for (const key of WEIGHT_KEYS) {
    const num = finite(value[key]);
    if (num !== undefined && num >= 0) out[key] = num;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function sanitizeQualification(value: unknown): CreatorModelConfigOverrides["qualification"] {
  if (!isRecord(value)) return undefined;
  const out: { defaultMode?: QualificationMode; threshold?: number } = {};
  if (
    typeof value.defaultMode === "string" &&
    (QUALIFICATION_MODES as readonly string[]).includes(value.defaultMode)
  ) {
    out.defaultMode = value.defaultMode as QualificationMode;
  }
  const threshold = pct(value.threshold);
  if (threshold !== undefined) out.threshold = threshold;
  return Object.keys(out).length > 0 ? out : undefined;
}

function sanitizeScoreBands(value: unknown): CreatorModelConfigOverrides["scoreBands"] {
  if (!isRecord(value)) return undefined;
  const out: { high?: number; medium?: number } = {};
  const high = pct(value.high);
  if (high !== undefined) out.high = high;
  const medium = pct(value.medium);
  if (medium !== undefined) out.medium = medium;
  return Object.keys(out).length > 0 ? out : undefined;
}

function sanitizeBreakEven(value: unknown): CreatorModelConfigOverrides["breakEven"] {
  if (!isRecord(value)) return undefined;
  const out: NonNullable<CreatorModelConfigOverrides["breakEven"]> = {};

  for (const key of [
    "reachRatePct",
    "clickToSignupPct",
    "signupToKycPct",
    "kycToFirstTxPct",
  ] as const) {
    const num = pct(value[key]);
    if (num !== undefined) out[key] = num;
  }
  const cac = finite(value.defaultTargetCacEur);
  if (cac !== undefined && cac >= 1) out.defaultTargetCacEur = cac;

  if (isRecord(value.ctrByFormatPct)) {
    const ctr: Partial<Record<DealFormat, number>> = {};
    for (const format of DEAL_FORMATS) {
      const num = finite(value.ctrByFormatPct[format]);
      if (num !== undefined && num >= 0) ctr[format] = num;
    }
    if (Object.keys(ctr).length > 0) out.ctrByFormatPct = ctr;
  }

  if (Array.isArray(value.incentiveMultipliers)) {
    const multipliers = value.incentiveMultipliers
      .map((item) => finite(item))
      .filter((item): item is number => item !== undefined && item > 0)
      .slice(0, MAX_LIST_ITEMS);
    if (multipliers.length > 0) out.incentiveMultipliers = multipliers;
  }

  if (isRecord(value.verdict)) {
    const verdict: { viableMinRatio?: number; tightMinRatio?: number } = {};
    const viable = finite(value.verdict.viableMinRatio);
    if (viable !== undefined && viable >= 0) verdict.viableMinRatio = viable;
    const tight = finite(value.verdict.tightMinRatio);
    if (tight !== undefined && tight >= 0) verdict.tightMinRatio = tight;
    if (Object.keys(verdict).length > 0) out.verdict = verdict;
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Sanea un documento de overrides crudo (PUT de la UI, tool MCP, JSON a mano
 * en Yalc): conserva solo claves conocidas con valores válidos. Entrada
 * basura → `{}` (la efectiva queda en defaults, nunca rompe).
 */
export function sanitizeCreatorModelOverrides(input: unknown): CreatorModelConfigOverrides {
  if (!isRecord(input)) return {};
  const out: CreatorModelConfigOverrides = {};

  const tiers = sanitizeTiers(input.tiers);
  if (tiers) out.tiers = tiers;

  const verticals = sanitizeStringList(input.verticals);
  if (verticals) out.verticals = verticals;
  const formats = sanitizeStringList(input.formats);
  if (formats) out.formats = formats;

  const weights = sanitizeWeights(input.weights);
  if (weights) out.weights = weights;

  const qualification = sanitizeQualification(input.qualification);
  if (qualification) out.qualification = qualification;

  const scoreBands = sanitizeScoreBands(input.scoreBands);
  if (scoreBands) out.scoreBands = scoreBands;

  const breakEven = sanitizeBreakEven(input.breakEven);
  if (breakEven) out.breakEven = breakEven;

  return out;
}

/**
 * Config EFECTIVA = defaults + overrides (saneados). Los arrays de
 * verticals/formats/incentiveMultipliers se reemplazan enteros; `tiers` se
 * mergea por `key`; el resto, campo a campo.
 */
export function mergeCreatorModelConfig(
  overrides: unknown,
  defaults: CreatorModelConfig = DEFAULT_CREATOR_MODEL_CONFIG,
): CreatorModelConfig {
  const clean = sanitizeCreatorModelOverrides(overrides);
  // Clone JSON-safe: la config es data pura (sin funciones/fechas).
  const merged = JSON.parse(JSON.stringify(defaults)) as CreatorModelConfig;

  if (clean.tiers) {
    const tiers = merged.tiers as TierConfig[];
    for (const override of clean.tiers) {
      const target = tiers.find((tier) => tier.key === override.key);
      if (!target) continue;
      if (override.label !== undefined) target.label = override.label;
      if (override.minFollowers !== undefined) target.minFollowers = override.minFollowers;
      if (override.maxFollowers !== undefined) target.maxFollowers = override.maxFollowers;
      if (override.erBenchmarkPct !== undefined) target.erBenchmarkPct = override.erBenchmarkPct;
    }
  }

  if (clean.verticals) (merged as unknown as { verticals: string[] }).verticals = clean.verticals;
  if (clean.formats) (merged as unknown as { formats: string[] }).formats = clean.formats;

  if (clean.weights) Object.assign(merged.weights, clean.weights);
  if (clean.qualification) Object.assign(merged.qualification, clean.qualification);
  if (clean.scoreBands) Object.assign(merged.scoreBands, clean.scoreBands);

  if (clean.breakEven) {
    const { ctrByFormatPct, incentiveMultipliers, verdict, ...scalars } = clean.breakEven;
    Object.assign(merged.breakEven, scalars);
    if (ctrByFormatPct) Object.assign(merged.breakEven.ctrByFormatPct, ctrByFormatPct);
    if (incentiveMultipliers) {
      (merged.breakEven as unknown as { incentiveMultipliers: number[] }).incentiveMultipliers =
        incentiveMultipliers;
    }
    if (verdict) Object.assign(merged.breakEven.verdict, verdict);
  }

  return merged;
}

/**
 * ¿Hay algún override efectivo? (tras sanear). Útil para reportar `source`
 * ('yalc' vs 'defaults') sin comparar documentos enteros.
 */
export function hasModelConfigOverrides(input: unknown): boolean {
  return Object.keys(sanitizeCreatorModelOverrides(input)).length > 0;
}
