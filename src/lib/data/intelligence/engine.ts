// Intelligence Engine (SAN-270) — the shared `detect` core.
//
// One engine, many detectors. Rules are DATA (see ./rules/), not a file per
// loop. `detect(signals, rules)` filters the normalized signal stream, applies
// one of a handful of primitives, and emits Improvement Proposals — in memory,
// no DB. Persistence/dispatch is wired by callers in later phases.
//
// Primitives: outlier · trend · gapVsTarget · threshold (numeric) + textMatch
// (language-derived loops: meetings, objections, comments).

import { createHash } from "node:crypto";

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

export type Severity = "high" | "medium" | "low";
export type Primitive = "outlier" | "trend" | "gapVsTarget" | "threshold" | "textMatch";

/** A normalized signal row (mirrors the `signals` table; engine works in memory). */
export interface Signal {
  id?: string;
  slug: string;
  category: string;
  provider: string;
  entityType?: string | null;
  entityId?: string | null;
  dims?: Record<string, string | number | null> | null;
  metric: string;
  value?: number | null;
  text?: string | null;
  capturedAt?: Date | string | number | null;
}

/** Proposal template carried by a rule; placeholders are filled by the engine. */
export interface ProposalTemplate {
  title?: string;
  documentName?: string;
  severity?: Severity;
  reason?: string;
  suggestedAction?: string;
}

/** A detector expressed as data. Add a loop = add a rule, not a file. */
export interface Rule {
  id: string;
  domain: string;
  primitive: Primitive;
  /** Filter which signals this rule consumes. */
  category?: string;
  metric?: string;
  /** Group-by dimension (dims[dimension]) for outlier/trend aggregation. */
  dimension?: string;
  /** Primitive-specific params (see *Params interfaces below). */
  params?: Record<string, unknown>;
  proposal: ProposalTemplate;
  target?: { skill?: string; agent?: string };
}

/** What the engine emits. Maps cleanly onto the `improvement_proposals` table. */
export interface Proposal {
  id: string;
  ruleId: string;
  domain: string;
  slug: string;
  signalRef?: string;
  title: string;
  description?: string;
  rationale: string;
  confidence: number;
  priority: Severity;
  documentName?: string;
  severity?: Severity;
  suggestedAction?: string;
  targetSkill?: string;
  targetAgent?: string;
}

// ----------------------------------------------------------------------------
// Primitives (pure, individually exported for direct testing)
// ----------------------------------------------------------------------------

export interface OutlierParams {
  side?: "top" | "bottom";
  percentile?: number;
  minSample?: number;
}
export interface OutlierHit {
  index: number;
  value: number;
  threshold: number;
  side: "top" | "bottom";
}

/** Flag values above (top) or below (bottom) the p-th percentile. */
export function outlier(values: number[], params: OutlierParams = {}): OutlierHit[] {
  const side = params.side ?? "top";
  const p = params.percentile ?? (side === "top" ? 75 : 25);
  const clean = values.filter((v) => typeof v === "number" && Number.isFinite(v));
  if (clean.length < 2) return [];
  const sorted = [...clean].sort((a, b) => a - b);
  const threshold = percentile(sorted, p);
  const hits: OutlierHit[] = [];
  values.forEach((v, index) => {
    if (typeof v !== "number" || !Number.isFinite(v)) return;
    if (side === "top" ? v > threshold : v < threshold) {
      hits.push({ index, value: v, threshold, side });
    }
  });
  return hits;
}

export interface TrendParams {
  direction?: "up" | "down" | "any";
  minDelta?: number;
}
export interface TrendResult {
  direction: "up" | "down";
  delta: number;
  pct: number;
  first: number;
  last: number;
}

/** First→last movement over a time-ordered series (needs ≥2 points). */
export function trend(series: Array<{ t: number; v: number }>, params: TrendParams = {}): TrendResult | null {
  const clean = series
    .filter((point) => Number.isFinite(point.v) && Number.isFinite(point.t))
    .sort((a, b) => a.t - b.t);
  if (clean.length < 2) return null;
  const first = clean[0].v;
  const last = clean[clean.length - 1].v;
  const delta = last - first;
  const minDelta = params.minDelta ?? 0;
  let direction: "up" | "down" | "flat" = "flat";
  if (delta > minDelta) direction = "up";
  else if (delta < -minDelta) direction = "down";
  if (direction === "flat") return null;
  const want = params.direction ?? "any";
  if (want !== "any" && direction !== want) return null;
  const pct = first !== 0 ? (delta / Math.abs(first)) * 100 : 0;
  return { direction, delta, pct, first, last };
}

export interface GapParams {
  direction?: "higher_better" | "lower_better";
}
export interface GapResult {
  gap: number;
  value: number;
  target: number;
}

/** Gap vs a target — returns a result only when the value is off-target. */
export function gapVsTarget(value: number, target: number, params: GapParams = {}): GapResult | null {
  if (!Number.isFinite(value) || !Number.isFinite(target)) return null;
  const dir = params.direction ?? "higher_better";
  const isProblem = dir === "higher_better" ? value < target : value > target;
  if (!isProblem) return null;
  return { gap: value - target, value, target };
}

export interface ThresholdParams {
  op?: "gt" | "gte" | "lt" | "lte";
  bound: number;
}

/** Whether a value crosses a fixed bound. */
export function threshold(value: number, params: ThresholdParams): boolean {
  if (!Number.isFinite(value)) return false;
  switch (params.op ?? "gt") {
    case "gt":
      return value > params.bound;
    case "gte":
      return value >= params.bound;
    case "lt":
      return value < params.bound;
    case "lte":
      return value <= params.bound;
    default:
      return false;
  }
}

export interface TextMatchParams {
  anyOf?: RegExp[];
  allOf?: RegExp[];
}

/** Keyword/regex match for language-derived loops. At least one matcher required. */
export function textMatch(text: string, params: TextMatchParams): boolean {
  if (!text) return false;
  const anyOf = params.anyOf ?? [];
  const allOf = params.allOf ?? [];
  if (anyOf.length === 0 && allOf.length === 0) return false;
  const test = (re: RegExp) => {
    re.lastIndex = 0; // defensive: tolerate /g-flagged rules reused across signals
    return re.test(text);
  };
  const anyOk = anyOf.length === 0 || anyOf.some(test);
  const allOk = allOf.length === 0 || allOf.every(test);
  return anyOk && allOk;
}

// ----------------------------------------------------------------------------
// Engine — detect(signals, rules) → proposals[]
// ----------------------------------------------------------------------------

export function detect(signals: Signal[], rules: Rule[]): Proposal[] {
  const proposals: Proposal[] = [];
  for (const rule of rules) {
    const relevant = signals.filter(
      (signal) =>
        (rule.category === undefined || signal.category === rule.category) &&
        (rule.metric === undefined || signal.metric === rule.metric),
    );
    if (relevant.length === 0) continue;
    switch (rule.primitive) {
      case "textMatch":
        proposals.push(...runTextMatch(rule, relevant));
        break;
      case "outlier":
        proposals.push(...runOutlier(rule, relevant));
        break;
      case "trend":
        proposals.push(...runTrend(rule, relevant));
        break;
      case "gapVsTarget":
        proposals.push(...runGapVsTarget(rule, relevant));
        break;
      case "threshold":
        proposals.push(...runThreshold(rule, relevant));
        break;
    }
  }
  return proposals;
}

function runTextMatch(rule: Rule, signals: Signal[]): Proposal[] {
  const params = (rule.params ?? {}) as TextMatchParams;
  const out: Proposal[] = [];
  for (const signal of signals) {
    const text = signal.text ?? "";
    if (!textMatch(text, params)) continue;
    out.push(
      buildProposal(rule, {
        signal,
        dimKey: null,
        severity: rule.proposal.severity ?? "medium",
        confidence: 0.6,
        rationale: rule.proposal.reason ?? rule.proposal.suggestedAction ?? `Coincidencia de texto (${rule.id}).`,
      }),
    );
  }
  return out;
}

function runOutlier(rule: Rule, signals: Signal[]): Proposal[] {
  const params = (rule.params ?? {}) as OutlierParams;
  const groups = rule.dimension
    ? [...groupByDim(signals, rule.dimension).entries()].map(([dimKey, rows]) => ({
        dimKey,
        rows,
        value: mean(rows.map((row) => num(row.value))),
      }))
    : signals
        .filter((signal) => typeof signal.value === "number" && Number.isFinite(signal.value))
        .map((signal) => ({ dimKey: dimKeyOf(signal), rows: [signal], value: signal.value as number }));

  const hits = outlier(
    groups.map((group) => group.value),
    params,
  );
  return hits.map((hit) => {
    const group = groups[hit.index];
    const effect = clamp01(Math.abs(hit.value - hit.threshold) / (Math.abs(hit.threshold) || 1));
    const sampleFactor = clamp01((rule.dimension ? group.rows.length : signals.length) / (params.minSample ?? 8));
    const sideLabel = hit.side === "top" ? "supera" : "queda bajo";
    const dimLabel = rule.dimension ? `${rule.dimension}="${group.dimKey}" ` : "";
    return buildProposal(rule, {
      signal: group.rows[0],
      dimKey: group.dimKey,
      severity: severityFromEffect(effect),
      confidence: 0.4 * sampleFactor + 0.6 * effect,
      rationale: `${dimLabel}${rule.metric ?? "metric"}=${fmt(hit.value)} ${sideLabel} el p${
        params.percentile ?? (hit.side === "top" ? 75 : 25)
      } (${fmt(hit.threshold)}) en ${rule.dimension ? group.rows.length : signals.length} muestras.`,
    });
  });
}

function runTrend(rule: Rule, signals: Signal[]): Proposal[] {
  const params = (rule.params ?? {}) as TrendParams;
  const groups = rule.dimension ? groupByDim(signals, rule.dimension) : new Map([["", signals]]);
  const out: Proposal[] = [];
  for (const [dimKey, rows] of groups) {
    const series = rows
      .filter((row) => typeof row.value === "number" && Number.isFinite(row.value))
      .map((row) => ({ t: toTime(row.capturedAt), v: row.value as number }));
    const result = trend(series, params);
    if (!result) continue;
    const effect = clamp01(Math.abs(result.pct) / 100);
    const dimLabel = dimKey ? `${rule.dimension}="${dimKey}": ` : "";
    out.push(
      buildProposal(rule, {
        signal: rows[0],
        dimKey: dimKey || null,
        severity: severityFromEffect(effect),
        confidence: 0.4 + 0.6 * effect,
        rationale: `${dimLabel}${rule.metric ?? "metric"} ${result.direction === "up" ? "sube" : "baja"} ${fmt(
          result.pct,
        )}% (${fmt(result.first)}→${fmt(result.last)}).`,
      }),
    );
  }
  return out;
}

function runGapVsTarget(rule: Rule, signals: Signal[]): Proposal[] {
  const params = (rule.params ?? {}) as GapParams & { target?: number };
  const target = typeof params.target === "number" ? params.target : NaN;
  const out: Proposal[] = [];
  for (const signal of signals) {
    if (typeof signal.value !== "number" || !Number.isFinite(signal.value)) continue;
    const result = gapVsTarget(signal.value, target, params);
    if (!result) continue;
    const effect = clamp01(Math.abs(result.gap) / (Math.abs(result.target) || 1));
    out.push(
      buildProposal(rule, {
        signal,
        dimKey: dimKeyOf(signal),
        severity: severityFromEffect(effect),
        confidence: 0.4 + 0.6 * effect,
        rationale: `${rule.metric ?? "metric"}=${fmt(result.value)} vs target ${fmt(result.target)} (gap ${fmt(
          result.gap,
        )}).`,
      }),
    );
  }
  return out;
}

function runThreshold(rule: Rule, signals: Signal[]): Proposal[] {
  const params = (rule.params ?? {}) as Partial<ThresholdParams>;
  if (typeof params.bound !== "number") return [];
  const bound = params.bound;
  const op = params.op ?? "gt";
  const out: Proposal[] = [];
  for (const signal of signals) {
    if (typeof signal.value !== "number" || !Number.isFinite(signal.value)) continue;
    if (!threshold(signal.value, { op, bound })) continue;
    out.push(
      buildProposal(rule, {
        signal,
        dimKey: dimKeyOf(signal),
        severity: rule.proposal.severity ?? "medium",
        confidence: 0.6,
        rationale: `${rule.metric ?? "metric"}=${fmt(signal.value)} cruza el umbral ${op} ${fmt(bound)}.`,
      }),
    );
  }
  return out;
}

// ----------------------------------------------------------------------------
// Proposal assembly + helpers
// ----------------------------------------------------------------------------

interface ProposalCtx {
  signal: Signal;
  dimKey: string | null;
  severity: Severity;
  confidence: number;
  rationale: string;
}

function buildProposal(rule: Rule, ctx: ProposalCtx): Proposal {
  const slug = ctx.signal.slug ?? "";
  const docName = rule.proposal.documentName;
  const dimKey = ctx.dimKey ?? ctx.signal.entityId ?? "";
  const title =
    rule.proposal.title ?? (docName ? `Revisar ${docName}` : `${rule.domain}: ${rule.id}`);
  return {
    id: `prop_${stableId(slug, rule.domain, rule.id, dimKey)}`,
    ruleId: rule.id,
    domain: rule.domain,
    slug,
    signalRef: ctx.signal.id ?? undefined,
    title,
    description: rule.proposal.suggestedAction,
    rationale: ctx.rationale,
    confidence: round2(clamp01(ctx.confidence)),
    priority: ctx.severity,
    documentName: docName,
    severity: ctx.severity,
    suggestedAction: rule.proposal.suggestedAction,
    targetSkill: rule.target?.skill,
    targetAgent: rule.target?.agent,
  };
}

function severityFromEffect(effect: number): Severity {
  if (effect >= 0.66) return "high";
  if (effect >= 0.33) return "medium";
  return "low";
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  if (sorted.length === 1) return sorted[0];
  const rank = (clamp01(p / 100)) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  return sorted[lo] * (hi - rank) + sorted[hi] * (rank - lo);
}

function groupByDim(signals: Signal[], dim: string): Map<string, Signal[]> {
  const groups = new Map<string, Signal[]>();
  for (const signal of signals) {
    const raw = signal.dims?.[dim];
    const key = raw === null || raw === undefined ? "" : String(raw);
    const bucket = groups.get(key);
    if (bucket) bucket.push(signal);
    else groups.set(key, [signal]);
  }
  return groups;
}

function dimKeyOf(signal: Signal): string {
  return String(signal.entityId ?? signal.id ?? "");
}

function mean(values: number[]): number {
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length === 0) return NaN;
  return clean.reduce((acc, v) => acc + v, 0) / clean.length;
}

function num(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : NaN;
}

function toTime(value: Signal["capturedAt"]): number {
  if (value === null || value === undefined) return NaN;
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? NaN : parsed;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function fmt(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  return String(Math.round(value * 100) / 100);
}

function stableId(...parts: Array<string | number | null | undefined>): string {
  const key = parts
    .filter((part) => part !== null && part !== undefined && part !== "")
    .map((part) => String(part))
    .join(":");
  return createHash("sha1").update(key).digest("hex").slice(0, 24);
}
