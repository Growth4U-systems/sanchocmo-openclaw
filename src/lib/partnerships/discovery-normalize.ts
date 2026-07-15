/**
 * Partnerships discovery · normalizador de candidatos (SAN-79)
 *
 * Convierte la salida cruda del scraping (agente con mcp__scrapecreators__*,
 * fixtures, o un CSV/JSON manual) en `RawDiscoveryCandidate` canónicos:
 * handle con @, red normalizada, números coercionados y señales tipadas
 * (`CreatorSignals` de calc-creator-core). Candidatos sin handle o red → fuera.
 */

import type { CompetitorPromo, CreatorMetrics, CreatorSignals } from "@/lib/calc-creator-core";
import { normalizeNetwork } from "./discovery-plan";
import type { RawDiscoveryCandidate } from "./discovery-types";
import { TEMPLATE_VARIABLE_OPTIONS } from "./templates";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function asNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value.replace(/[,\s]/g, ""));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

const ALLOWED_CUSTOM_VARIABLES = new Set(
  TEMPLATE_VARIABLE_OPTIONS.filter((variable) => variable.source === "custom").map((variable) => variable.key),
);

function normalizeCustomVariables(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;
  const variables: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(value)) {
    const key = rawKey.trim().toLowerCase();
    const stringValue = asString(rawValue);
    if (ALLOWED_CUSTOM_VARIABLES.has(key) && stringValue) variables[key] = stringValue;
  }
  return Object.keys(variables).length > 0 ? variables : undefined;
}

export function normalizeHandle(value: unknown): string | null {
  const raw = asString(value);
  if (!raw) return null;
  const cleaned = raw.replace(/^https?:\/\/[^/]+\//i, "").replace(/\/+$/, "").trim();
  if (!cleaned) return null;
  return cleaned.startsWith("@") ? cleaned : `@${cleaned}`;
}

function normalizePromos(value: unknown): CompetitorPromo[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const promos = value
    .filter(isRecord)
    .map((promo) => {
      const brand = asString(promo.brand);
      const count = asNumber(promo.count);
      if (!brand || count === undefined) return null;
      const windowMonths = asNumber(promo.windowMonths ?? promo.window_months);
      return { brand, count, ...(windowMonths !== undefined ? { windowMonths } : {}) };
    })
    .filter((promo): promo is CompetitorPromo => promo !== null);
  return promos;
}

function normalizeSignals(value: unknown): CreatorSignals | undefined {
  if (!isRecord(value)) return undefined;
  const signals: CreatorSignals = {};

  const fakeFollowersPct = asNumber(value.fakeFollowersPct, value.fake_followers_pct);
  if (fakeFollowersPct !== undefined) signals.fakeFollowersPct = fakeFollowersPct;

  const spikes = asBoolean(value.suspiciousGrowthSpikes ?? value.suspicious_growth_spikes);
  if (spikes !== undefined) signals.suspiciousGrowthSpikes = spikes;

  const verticalMatchShare = asNumber(value.verticalMatchShare, value.vertical_match_share);
  if (verticalMatchShare !== undefined) signals.verticalMatchShare = verticalMatchShare;

  const adLibraryChecked = asBoolean(value.adLibraryChecked ?? value.ad_library_checked);
  if (adLibraryChecked !== undefined) signals.adLibraryChecked = adLibraryChecked;

  const competitorPromos = normalizePromos(value.competitorPromos ?? value.competitor_promos);
  if (competitorPromos !== undefined) signals.competitorPromos = competitorPromos;

  const activeConflict = asBoolean(value.activeConflict ?? value.active_conflict);
  if (activeConflict !== undefined) signals.activeConflict = activeConflict;

  const spanishAudiencePct = asNumber(value.spanishAudiencePct, value.spanish_audience_pct);
  if (spanishAudiencePct !== undefined) signals.spanishAudiencePct = spanishAudiencePct;

  const cetAlignmentPct = asNumber(value.cetAlignmentPct, value.cet_alignment_pct);
  if (cetAlignmentPct !== undefined) signals.cetAlignmentPct = cetAlignmentPct;

  const postsPerWeek = asNumber(value.postsPerWeek, value.posts_per_week);
  if (postsPerWeek !== undefined) signals.postsPerWeek = postsPerWeek;

  const longGaps = asNumber(value.longGapsLast6Months, value.long_gaps_last_6_months);
  if (longGaps !== undefined) signals.longGapsLast6Months = longGaps;

  return Object.keys(signals).length > 0 ? signals : undefined;
}

/** Normaliza un candidato crudo. Devuelve `null` si no es usable (sin handle/red). */
export function normalizeCandidate(input: unknown): RawDiscoveryCandidate | null {
  if (!isRecord(input)) return null;

  const handle = normalizeHandle(input.handle ?? input.username ?? input.user ?? input.account);
  const network = normalizeNetwork(input.network ?? input.net ?? input.platform ?? input.red);
  if (!handle || !network) return null;

  const followers = asNumber(input.followers, input.followerCount, input.follower_count, input.subs, input.subscribers);
  const engagementRatePct = asNumber(
    input.engagementRatePct,
    input.engagement_rate_pct,
    input.engagementRate,
    input.engagement_rate,
    input.er,
  );

  const candidate: RawDiscoveryCandidate = { handle, network };
  const name = asString(input.name ?? input.fullName ?? input.full_name);
  if (name) candidate.name = name;
  const profileUrl = asString(input.profileUrl ?? input.profile_url ?? input.url);
  if (profileUrl) candidate.profileUrl = profileUrl;
  const email = asString(input.email);
  if (email) candidate.email = email;
  if (followers !== undefined) candidate.followers = followers;
  if (engagementRatePct !== undefined) candidate.engagementRatePct = engagementRatePct;
  const customVariables = normalizeCustomVariables(input.customVariables ?? input.custom_variables);
  if (customVariables) candidate.customVariables = customVariables;
  const signals = normalizeSignals(input.signals);
  if (signals) candidate.signals = signals;
  return candidate;
}

export interface NormalizeResult {
  candidates: RawDiscoveryCandidate[];
  /** Nº de entradas descartadas por inválidas (sin handle o red). */
  invalid: number;
}

/** Normaliza una lista cruda; acepta `[...]` o `{ candidates: [...] }`. */
export function normalizeCandidates(input: unknown): NormalizeResult {
  const list = Array.isArray(input)
    ? input
    : isRecord(input) && Array.isArray(input.candidates)
      ? input.candidates
      : [];
  const candidates: RawDiscoveryCandidate[] = [];
  let invalid = 0;
  const seen = new Set<string>();
  for (const item of list) {
    const candidate = normalizeCandidate(item);
    if (!candidate) {
      invalid += 1;
      continue;
    }
    const key = `${candidate.network}:${candidate.handle.toLowerCase()}`;
    if (seen.has(key)) continue; // dedupe silently
    seen.add(key);
    candidates.push(candidate);
  }
  return { candidates, invalid };
}

/** Mapea un candidato normalizado a la entrada del motor de quality score. */
export function candidateToCreatorMetrics(candidate: RawDiscoveryCandidate): CreatorMetrics {
  return {
    handle: candidate.handle,
    network: candidate.network,
    followers: candidate.followers,
    engagementRatePct: candidate.engagementRatePct,
    signals: candidate.signals,
  };
}
