// Keyword Antenna — shared, surface-agnostic core (SAN-260).
//
// The antenna's *discovery* (DataForSEO / GSC / the 3 modes + AEO overlay) runs
// agent-side (the `keyword-antenna` skill, where the DataForSEO MCP lives). This
// module is the deterministic part both surfaces share: score agent-supplied
// keyword candidates, shape them into enriched `seo` Ideas, and read/write the
// blog Idea queue. The MCP tool calls it in-process; the skill calls it over HTTP
// via /api/content-engine/keyword-antenna. One implementation, two surfaces.
import path from "node:path";
import { readJSON, writeJSON } from "./json-io";
import { BASE } from "./paths";

// ── Input shapes (the antenna's discovery step fills these) ──────────────────
export type DiscoveryMode = "identity" | "six-circles" | "competitor-gap" | "gsc-nearmiss" | "demand";
export type KeywordIntent = "informational" | "commercial" | "transactional" | "navigational";

export interface KeywordDemand {
  volume?: number | null; // monthly searches (DataForSEO) — null until connected
  gscImpressions?: number | null;
  trend?: "up" | "flat" | "down" | null;
}
export interface KeywordWinnability {
  kdGap?: number | null; // (your authority − KD); positive = favorable
  currentRank?: number | null; // GSC current position (page-2 near-miss = winnable)
  competitorsRanking?: number | null;
  serpPageType?: string | null; // "listicle" | "definition" | ...
}
export interface KeywordAiCitability {
  aiOverviewPresent?: boolean;
  citedNow?: boolean;
  shareOfVoice?: number | null; // 0..1
}

export interface KeywordCandidate {
  keyword: string;
  pillarId?: string; // P1, P2, … (from content-pillars.md)
  angleDraft?: string; // optional editorial angle supplied by the discovery agent
  angle_draft?: string; // tolerate the idea-queue field name when callers reuse it
  discoveredBy?: DiscoveryMode[];
  intent?: KeywordIntent;
  bofuCategory?: string; // "best-of" | "comparison" | "category" | "how-to" | …
  demand?: KeywordDemand | null;
  winnability?: KeywordWinnability | null;
  businessValue?: number; // 0..1; defaults from bofuCategory
  strategicFlag?: boolean; // declared target → priority floor, never filtered out
  aiCitability?: KeywordAiCitability | null; // AEO overlay (Intelligence-fed)
  recommendedPageType?: string;
}

export interface ScoredKeyword extends KeywordCandidate {
  priorityScore: number; // 0..100, multiplicative
  aiOpportunity: number; // 0..100, separate AEO axis
  programmaticRiskFlag: boolean; // anti-thin-programmatic guardrail
  lastScoredAt: string; // ISO
}

// Raw entry as written to brand/{slug}/content/idea-queue.json (a bare array).
// Mirrors what the other antennas write; the enriched `seo` block rides along and
// survives loadIdeas() via normalizeContentIdea's `...raw` spread.
export interface SeoIdeaRecord {
  id: string;
  type: "content";
  status: "New";
  title: string;
  pillar_id: string;
  target_channel: "blog";
  content_type: string;
  source: "keyword-antenna";
  list: "keywords";
  source_signals: string[]; // ["kw-YYYY-MM-DD-slug"] → lights up the "Keywords" UI filter
  signal: { summary: string; source: "keyword-antenna"; date: string };
  angle_draft: string;
  pov_confidence: number;
  created_at: string;
  seo: SeoEnrichment;
}
export interface SeoEnrichment {
  keyword: string;
  pillarId: string | null;
  discoveredBy: DiscoveryMode[];
  intent: KeywordIntent | null;
  bofuCategory: string | null;
  demand: KeywordDemand | null;
  winnability: KeywordWinnability | null;
  businessValue: number | null;
  strategicFlag: boolean;
  aiCitability: KeywordAiCitability | null;
  recommendedPageType: string | null;
  programmaticRiskFlag: boolean;
  priorityScore: number;
  aiOpportunity: number;
  lastScoredAt: string;
}

const STRATEGIC_FLOOR = 50; // declared targets never score below this
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

// ── Pure scoring ─────────────────────────────────────────────────────────────
function bofuDefault(bofuCategory?: string): number {
  const c = (bofuCategory || "").toLowerCase();
  if (/best-of|comparison|compar|vs|alternative|category|pricing|review/.test(c)) return 0.9; // BOFU
  if (/how-to|guide|framework|template/.test(c)) return 0.6; // MOFU
  if (/what-is|definition|trend|news/.test(c)) return 0.35; // TOFU
  return 0.5;
}

function demandFactor(d?: KeywordDemand | null): number {
  // log scale: ~100/mo → 0.44, ~1k → 0.67, ~10k → 0.89
  const n =
    typeof d?.volume === "number" ? d.volume : typeof d?.gscImpressions === "number" ? d.gscImpressions : null;
  if (n === null) return 0.4; // unknown demand (v1 native, no paid data) → modest
  return clamp01(Math.log10(Math.max(1, n)) / 4.5);
}

function trendMultiplier(d?: KeywordDemand | null): number {
  return d?.trend === "up" ? 1.1 : d?.trend === "down" ? 0.9 : 1;
}

function winnabilityFactor(w?: KeywordWinnability | null): number {
  if (!w) return 0.5;
  let f = 0.5;
  if (typeof w.kdGap === "number") f = clamp01(0.5 + w.kdGap / 100); // +gap = favorable
  if (typeof w.currentRank === "number" && w.currentRank >= 8 && w.currentRank <= 20) f = Math.max(f, 0.8); // page-2 near-miss
  return clamp01(f);
}

function strategicFit(c: KeywordCandidate): number {
  if (c.strategicFlag) return 1;
  return c.pillarId ? 0.7 : 0.5;
}

export function scoreAiOpportunity(ai?: KeywordAiCitability | null): number {
  if (!ai || ai.aiOverviewPresent === undefined) return 0; // no AEO signal (Intelligence not connected)
  if (!ai.aiOverviewPresent) return 10; // no AI Overview → low AEO opportunity
  if (ai.citedNow) return 30; // already cited → defend, lower opportunity
  const sov = typeof ai.shareOfVoice === "number" ? clamp01(ai.shareOfVoice) : 0;
  return Math.round(70 + (1 - sov) * 30); // AI Overview present, not cited → high (70..100)
}

export function isProgrammaticRisk(c: KeywordCandidate): boolean {
  if (/programmatic/i.test(c.recommendedPageType || "")) return true;
  const volume = typeof c.demand?.volume === "number" ? c.demand!.volume! : 0;
  // high volume + weak winnability + no brand anchor → thin-programmatic risk
  return volume > 5000 && winnabilityFactor(c.winnability) < 0.4 && !c.strategicFlag && !c.pillarId;
}

export function scoreKeyword(c: KeywordCandidate, opts?: { now?: string }): ScoredKeyword {
  const businessValue = clamp01(c.businessValue ?? bofuDefault(c.bofuCategory));
  const winnability = winnabilityFactor(c.winnability);
  const demand = clamp01(demandFactor(c.demand) * trendMultiplier(c.demand));
  const fit = strategicFit(c);

  let priority = businessValue * winnability * demand * fit * 100; // multiplicative
  if (c.strategicFlag) priority = Math.max(priority, STRATEGIC_FLOOR);

  return {
    ...c,
    priorityScore: Math.round(clamp01(priority / 100) * 100),
    aiOpportunity: scoreAiOpportunity(c.aiCitability),
    programmaticRiskFlag: isProgrammaticRisk(c),
    lastScoredAt: opts?.now ?? new Date().toISOString(),
  };
}

// ── Shaping ──────────────────────────────────────────────────────────────────
export function keywordSlug(keyword: string): string {
  return keyword
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function fallbackAngleDraft(k: ScoredKeyword): string {
  const supplied = (k.angleDraft || k.angle_draft || "").trim();
  if (supplied) return supplied;
  const pillar = k.pillarId ? ` del pilar ${k.pillarId}` : "";
  const pageType = (k.recommendedPageType || k.bofuCategory || "SEO Article").toLowerCase();
  return `Responder "${k.keyword}" desde el POV de marca${pillar}, no como una definicion generica. Convertir la intencion de busqueda en una pieza ${pageType} que explique que decision tiene que tomar el buyer, que criterio diferencia a la marca y que siguiente paso practico debe probar. Frame: "${k.keyword} como decision de negocio, no solo busqueda SEO".`;
}

export function toSeoIdea(k: ScoredKeyword, opts: { now?: string }): SeoIdeaRecord {
  const nowIso = opts.now ?? new Date().toISOString();
  const date = nowIso.slice(0, 10);
  const slug = keywordSlug(k.keyword);
  const signalId = `kw-${date}-${slug}`;
  return {
    id: `idea-${date}-${signalId}`,
    type: "content",
    status: "New",
    title: k.keyword,
    pillar_id: k.pillarId ?? "",
    target_channel: "blog",
    content_type: k.recommendedPageType || "SEO Article",
    source: "keyword-antenna",
    list: "keywords",
    source_signals: [signalId],
    signal: { summary: `Keyword opportunity: "${k.keyword}"`, source: "keyword-antenna", date },
    angle_draft: fallbackAngleDraft(k),
    pov_confidence: clamp01(k.priorityScore / 100),
    created_at: nowIso,
    seo: {
      keyword: k.keyword,
      pillarId: k.pillarId ?? null,
      discoveredBy: k.discoveredBy ?? [],
      intent: k.intent ?? null,
      bofuCategory: k.bofuCategory ?? null,
      demand: k.demand ?? null,
      winnability: k.winnability ?? null,
      businessValue: k.businessValue ?? null,
      strategicFlag: k.strategicFlag ?? false,
      aiCitability: k.aiCitability ?? null,
      recommendedPageType: k.recommendedPageType ?? null,
      programmaticRiskFlag: k.programmaticRiskFlag,
      priorityScore: k.priorityScore,
      aiOpportunity: k.aiOpportunity,
      lastScoredAt: k.lastScoredAt,
    },
  };
}

export function dedupeCandidates(cands: KeywordCandidate[]): KeywordCandidate[] {
  const seen = new Map<string, KeywordCandidate>();
  for (const c of cands) {
    const key = keywordSlug(c.keyword);
    const prev = seen.get(key);
    if (!prev) {
      seen.set(key, c);
    } else {
      // merge discoveredBy (keyword seen via ≥2 modes ranks up), keep richest fields
      const discoveredBy = Array.from(new Set([...(prev.discoveredBy ?? []), ...(c.discoveredBy ?? [])]));
      seen.set(key, { ...prev, ...c, discoveredBy, strategicFlag: prev.strategicFlag || c.strategicFlag });
    }
  }
  return Array.from(seen.values());
}

// ── Queue read/promote: pure cores + thin IO wrappers ───────────────────────
function ideaQueueFile(slug: string): string {
  return path.join(BASE, "brand", slug, "content", "idea-queue.json");
}

function isKeywordAntennaIdea(raw: unknown): raw is SeoIdeaRecord {
  return !!raw && typeof raw === "object" && (raw as { source?: string }).source === "keyword-antenna";
}

export interface KeywordOpportunityFilters {
  pillarId?: string;
  minPriority?: number;
  mode?: DiscoveryMode;
  limit?: number;
}

// Pure: filter + sort an existing queue (no IO).
export function selectKeywordOpportunities(queue: unknown[], filters: KeywordOpportunityFilters = {}): SeoIdeaRecord[] {
  const out = (Array.isArray(queue) ? queue : [])
    .filter(isKeywordAntennaIdea)
    .filter((i) => (filters.pillarId ? i.seo?.pillarId === filters.pillarId : true))
    .filter((i) => (typeof filters.minPriority === "number" ? (i.seo?.priorityScore ?? 0) >= filters.minPriority : true))
    .filter((i) => (filters.mode ? (i.seo?.discoveredBy ?? []).includes(filters.mode) : true))
    .sort((a, b) => (b.seo?.priorityScore ?? 0) - (a.seo?.priorityScore ?? 0));
  return typeof filters.limit === "number" ? out.slice(0, filters.limit) : out;
}

export interface PromoteResult {
  created: SeoIdeaRecord[];
  skipped: Array<{ keyword: string; reason: string }>;
  total: number; // queue length after write
}

// Pure: append scored keywords onto an existing queue, deduped by keyword against
// prior keyword-antenna ideas. Returns the next queue + what changed.
export function appendScoredToQueue(
  queue: unknown[],
  scored: ScoredKeyword[],
  opts: { now?: string },
): { next: unknown[]; result: Omit<PromoteResult, "total"> } {
  const base = Array.isArray(queue) ? [...queue] : [];
  const existingKw = new Set(
    base.filter(isKeywordAntennaIdea).map((i) => keywordSlug(i.seo?.keyword ?? i.title ?? "")),
  );
  const created: SeoIdeaRecord[] = [];
  const skipped: Array<{ keyword: string; reason: string }> = [];
  for (const k of dedupeScored(scored)) {
    const slug = keywordSlug(k.keyword);
    if (!slug) {
      skipped.push({ keyword: k.keyword, reason: "empty-slug" });
      continue;
    }
    if (existingKw.has(slug)) {
      skipped.push({ keyword: k.keyword, reason: "already-in-queue" });
      continue;
    }
    existingKw.add(slug);
    const idea = toSeoIdea(k, opts);
    base.push(idea);
    created.push(idea);
  }
  return { next: base, result: { created, skipped } };
}

function dedupeScored(scored: ScoredKeyword[]): ScoredKeyword[] {
  const seen = new Set<string>();
  const out: ScoredKeyword[] = [];
  for (const k of scored) {
    const slug = keywordSlug(k.keyword);
    if (seen.has(slug)) continue;
    seen.add(slug);
    out.push(k);
  }
  return out;
}

// IO: read the blog idea-queue, return scored keyword opportunities.
export function listKeywordOpportunities(slug: string, filters: KeywordOpportunityFilters = {}): SeoIdeaRecord[] {
  const queue = readJSON<unknown[]>(ideaQueueFile(slug), []);
  return selectKeywordOpportunities(queue, filters);
}

// IO: append enriched `seo` Ideas to the blog idea-queue (append-only, dedupe,
// verify-after-write). The shared write path used by both the MCP tool and the
// /api/content-engine/keyword-antenna endpoint (the skill's HTTP face).
export function promoteKeywordsToIdeas(slug: string, scored: ScoredKeyword[], opts: { now?: string } = {}): PromoteResult {
  const file = ideaQueueFile(slug);
  const queue = readJSON<unknown[]>(file, []);
  const before = Array.isArray(queue) ? queue.length : 0;
  const { next, result } = appendScoredToQueue(queue, scored, opts);
  if (result.created.length > 0) {
    writeJSON(file, next);
    const after = readJSON<unknown[]>(file, []).length; // verify-after-write
    if (after < before + result.created.length) {
      throw new Error(`keyword-antenna: idea-queue write verification failed (before=${before}, after=${after})`);
    }
  }
  return { ...result, total: next.length };
}

// Convenience: score + promote in one call (the MCP write path).
export function scoreAndPromote(slug: string, candidates: KeywordCandidate[], opts: { now?: string } = {}): {
  scored: ScoredKeyword[];
  promote: PromoteResult;
} {
  const scored = dedupeCandidates(candidates).map((c) => scoreKeyword(c, opts));
  const promote = promoteKeywordsToIdeas(slug, scored, opts);
  return { scored, promote };
}
