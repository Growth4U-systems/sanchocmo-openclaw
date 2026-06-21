import fs from "fs";
import path from "path";
import { and, desc, eq, gte, lte, sql as dsql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/db/drizzle";
import { metricSnapshots } from "@/db/schema";
import { BASE } from "@/lib/data/paths";
import { ensureMetricsStorage } from "@/lib/data/metrics-snapshots";
import { SURFACES, surfaceForSource, type SurfaceKey } from "@/lib/metrics/surfaces";
import { aggFor, type AggStrategy } from "@/lib/metrics/aggregation";

/**
 * Read layer over the `metric_snapshots` time-series (SAN-264 · Métricas v2 PR-2).
 * All functions degrade cleanly (`configured: false`) when DATABASE_URL is unset.
 * Aggregation is per-metric (SAN-300): additive metrics SUM, rates AVG, and
 * snapshots (trust_score, PageSpeed scores, CRM running totals) take the LATEST
 * value — see `aggFor` in @/lib/metrics/aggregation. The strategy applies to both
 * the bucketed series and the trend windows; an unpinned/mixed query keeps the
 * legacy SUM, so existing call sites never regress.
 */

export type Grain = "day" | "week" | "month";
const GRAINS: Grain[] = ["day", "week", "month"];
function normGrain(grain?: string): Grain {
  return (GRAINS as string[]).includes(grain ?? "") ? (grain as Grain) : "day";
}

const DAY_MS = 86_400_000;
function fmtDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export interface SeriesPoint {
  date: string;
  value: number;
}

export interface TimeSeriesQuery {
  source?: string;
  metric?: string;
  from?: string;
  to?: string;
  grain?: string;
}

export interface TimeSeriesResult {
  configured: boolean;
  grain: Grain;
  source?: string;
  metric?: string;
  points: SeriesPoint[];
}

/**
 * SQL reducer for a metric over a GROUP BY bucket (or a whole window when no
 * groupBy is applied). `sum`/`avg` are plain aggregates; `latest` picks the value
 * at the max metric_date via array_agg — no window function needed, so it composes
 * with the existing grouped query shape and works on both Neon and postgres-js.
 */
function aggExpr(strategy: AggStrategy) {
  const value = metricSnapshots.value;
  const date = metricSnapshots.metricDate;
  if (strategy === "avg") return dsql<number>`coalesce(avg(${value}), 0)`;
  if (strategy === "latest") {
    return dsql<number>`coalesce((array_agg(${value} order by ${date} desc) filter (where ${value} is not null))[1], 0)`;
  }
  return dsql<number>`coalesce(sum(${value}), 0)`;
}

export async function getMetricsTimeSeries(slug: string, query: TimeSeriesQuery = {}): Promise<TimeSeriesResult> {
  const grain = normGrain(query.grain);
  if (!hasDatabase) return { configured: false, grain, points: [] };
  await ensureMetricsStorage();
  const database = getDb();
  const bucket = dsql`date_trunc(${grain}, ${metricSnapshots.metricDate}::date)`;
  const conditions = [
    eq(metricSnapshots.slug, slug),
    // Headline series = roll-up rows only; summing roll-up + dimensioned
    // breakdown rows would overstate the value (Codex review).
    eq(metricSnapshots.dimsKey, ""),
  ];
  if (query.source) conditions.push(eq(metricSnapshots.source, query.source));
  if (query.metric) conditions.push(eq(metricSnapshots.metricName, query.metric));
  if (query.from) conditions.push(gte(metricSnapshots.metricDate, query.from));
  if (query.to) conditions.push(lte(metricSnapshots.metricDate, query.to));
  const rows = await database
    .select({
      bucket: dsql<string>`to_char(${bucket}, 'YYYY-MM-DD')`,
      total: aggExpr(aggFor(query.source, query.metric)),
    })
    .from(metricSnapshots)
    .where(and(...conditions))
    .groupBy(bucket)
    .orderBy(bucket);
  return {
    configured: true,
    grain,
    source: query.source,
    metric: query.metric,
    points: rows.map((row) => ({ date: String(row.bucket), value: Number(row.total) })),
  };
}

export interface TrendResult {
  configured: boolean;
  current: number;
  previous: number;
  deltaPct: number | null;
  direction: "up" | "down" | "flat";
}

/** Reduce a metric over a single window using its per-metric strategy
 *  (sum/avg/latest). Latest = the value at the max metric_date in the window. */
async function aggregateWindow(
  slug: string,
  source: string | undefined,
  metric: string | undefined,
  from: string,
  to: string,
): Promise<number> {
  const database = getDb();
  const conditions = [
    eq(metricSnapshots.slug, slug),
    eq(metricSnapshots.dimsKey, ""), // roll-up rows only — no breakdown double-count
    gte(metricSnapshots.metricDate, from),
    lte(metricSnapshots.metricDate, to),
  ];
  if (source) conditions.push(eq(metricSnapshots.source, source));
  if (metric) conditions.push(eq(metricSnapshots.metricName, metric));
  const rows = await database
    .select({ total: aggExpr(aggFor(source, metric)) })
    .from(metricSnapshots)
    .where(and(...conditions));
  return Number(rows[0]?.total ?? 0);
}

export async function getTrend(
  slug: string,
  query: { source?: string; metric?: string; from: string; to: string },
): Promise<TrendResult> {
  if (!hasDatabase) return { configured: false, current: 0, previous: 0, deltaPct: null, direction: "flat" };
  await ensureMetricsStorage();
  const fromDate = new Date(query.from);
  const toDate = new Date(query.to);
  const spanMs = Math.max(0, toDate.getTime() - fromDate.getTime());
  const prevTo = new Date(fromDate.getTime() - DAY_MS);
  const prevFrom = new Date(prevTo.getTime() - spanMs);
  const current = await aggregateWindow(slug, query.source, query.metric, query.from, query.to);
  const previous = await aggregateWindow(slug, query.source, query.metric, fmtDate(prevFrom), fmtDate(prevTo));
  const deltaPct = previous === 0 ? (current === 0 ? 0 : null) : ((current - previous) / previous) * 100;
  const direction: TrendResult["direction"] =
    deltaPct == null ? "flat" : deltaPct > 0.5 ? "up" : deltaPct < -0.5 ? "down" : "flat";
  return { configured: true, current, previous, deltaPct, direction };
}

export interface DailyMetricEntry {
  name: string;
  value: number;
}

export interface DailySource {
  status: "ok";
  metrics: DailyMetricEntry[];
}

export interface DailyEntry {
  date: string;
  sources: Record<string, DailySource>;
}

export interface DailyHistoryResult {
  configured: boolean;
  days: number;
  daily: DailyEntry[];
}

/**
 * Reconstruct the file-shaped daily snapshots from `metric_snapshots` so the
 * dashboard can read the FULL history (not just the last ~30 day-files). Emits
 * un-dimensioned (dims_key='') numeric roll-up rows only — exactly what the UI's
 * mVal / bucketDaily / aggregateEntries consume — so it's a drop-in replacement
 * for the file loop. Degrades to { configured:false, days:0, daily:[] } when
 * DATABASE_URL is unset (caller falls back to files).
 */
export async function getDailySnapshots(
  slug: string,
  query: { from?: string; to?: string } = {},
): Promise<DailyHistoryResult> {
  if (!hasDatabase) return { configured: false, days: 0, daily: [] };
  await ensureMetricsStorage();
  const database = getDb();
  const conditions = [eq(metricSnapshots.slug, slug), eq(metricSnapshots.dimsKey, "")];
  if (query.from) conditions.push(gte(metricSnapshots.metricDate, query.from));
  if (query.to) conditions.push(lte(metricSnapshots.metricDate, query.to));
  const rows = await database
    .select({
      date: metricSnapshots.metricDate,
      source: metricSnapshots.source,
      metric: metricSnapshots.metricName,
      value: metricSnapshots.value,
    })
    .from(metricSnapshots)
    .where(and(...conditions))
    .orderBy(metricSnapshots.metricDate);

  const byDate = new Map<string, Map<string, DailyMetricEntry[]>>();
  for (const row of rows) {
    if (row.value == null) continue; // text-only metrics: UI expects numbers
    const date = String(row.date);
    let sources = byDate.get(date);
    if (!sources) sources = byDate.set(date, new Map()).get(date)!;
    let metrics = sources.get(row.source);
    if (!metrics) metrics = sources.set(row.source, []).get(row.source)!;
    metrics.push({ name: row.metric, value: Number(row.value) });
  }

  const daily: DailyEntry[] = [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, sources]) => ({
      date,
      sources: Object.fromEntries(
        [...sources.entries()].map(([source, metrics]) => [source, { status: "ok" as const, metrics }]),
      ),
    }));
  return { configured: true, days: daily.length, daily };
}

/** JS-side reducer mirroring `aggExpr` for the scorecard pivot (small windows). */
function reduceSeries(strategy: AggStrategy, series: Array<{ date: string; value: number }>): number {
  if (!series.length) return 0;
  if (strategy === "latest") {
    let best = series[0];
    for (const point of series) if (point.date >= best.date) best = point;
    return best.value;
  }
  const total = series.reduce((acc, point) => acc + point.value, 0);
  return strategy === "avg" ? total / series.length : total;
}

export interface SourceScorecardMetric {
  metric: string;
  value: number;
  agg: AggStrategy;
}

export interface SourceScorecard {
  source: string;
  surface: SurfaceKey | null;
  metrics: SourceScorecardMetric[];
}

export interface SourceScorecardsResult {
  configured: boolean;
  from: string;
  to: string;
  sources: SourceScorecard[];
}

/**
 * "One row per tool" pivot for the dashboard cards: each connected source with
 * its roll-up metrics aggregated over [from,to] using the per-metric strategy
 * (so a card never sums a position or a trust score). Defaults to the last 30
 * days. Degrades to { configured:false } when DATABASE_URL is unset.
 */
export async function getSourceScorecards(
  slug: string,
  query: { from?: string; to?: string } = {},
): Promise<SourceScorecardsResult> {
  const to = query.to ?? fmtDate(new Date());
  const from = query.from ?? fmtDate(new Date(Date.now() - 30 * DAY_MS));
  if (!hasDatabase) return { configured: false, from, to, sources: [] };
  await ensureMetricsStorage();
  const database = getDb();
  const rows = await database
    .select({
      date: metricSnapshots.metricDate,
      source: metricSnapshots.source,
      metric: metricSnapshots.metricName,
      value: metricSnapshots.value,
    })
    .from(metricSnapshots)
    .where(
      and(
        eq(metricSnapshots.slug, slug),
        eq(metricSnapshots.dimsKey, ""),
        gte(metricSnapshots.metricDate, from),
        lte(metricSnapshots.metricDate, to),
      ),
    )
    .orderBy(metricSnapshots.metricDate);

  const grouped = new Map<string, Map<string, Array<{ date: string; value: number }>>>();
  for (const row of rows) {
    if (row.value == null) continue;
    let metrics = grouped.get(row.source);
    if (!metrics) metrics = grouped.set(row.source, new Map()).get(row.source)!;
    let series = metrics.get(row.metric);
    if (!series) series = metrics.set(row.metric, []).get(row.metric)!;
    series.push({ date: String(row.date), value: Number(row.value) });
  }

  const sources: SourceScorecard[] = [...grouped.entries()].map(([source, metrics]) => ({
    source,
    surface: surfaceForSource(source),
    metrics: [...metrics.entries()].map(([metric, series]) => {
      const agg = aggFor(source, metric);
      return { metric, value: reduceSeries(agg, series), agg };
    }),
  }));
  return { configured: true, from, to, sources };
}

export interface SurfaceSummaryEntry {
  surface: SurfaceKey;
  name: string;
  emoji: string;
  connected: boolean;
  sources: string[];
  metrics: Array<{ source: string; metric: string; value: number | null; date: string }>;
}

export interface SurfaceSummaryResult {
  configured: boolean;
  surfaces: SurfaceSummaryEntry[];
}

function emptySurfaces(): SurfaceSummaryEntry[] {
  return SURFACES.map((surface) => ({
    surface: surface.key,
    name: surface.name,
    emoji: surface.emoji,
    connected: false,
    sources: [],
    metrics: [],
  }));
}

export async function getSurfaceSummary(slug: string, query: { from?: string; to?: string } = {}): Promise<SurfaceSummaryResult> {
  if (!hasDatabase) return { configured: false, surfaces: emptySurfaces() };
  await ensureMetricsStorage();
  const database = getDb();
  const from = query.from ?? fmtDate(new Date(Date.now() - 90 * DAY_MS));
  const baseConds = [eq(metricSnapshots.slug, slug), gte(metricSnapshots.metricDate, from)];
  if (query.to) baseConds.push(lte(metricSnapshots.metricDate, query.to));

  // Connectivity = the source has ANY row in the window (incl. dimension-only
  // sources like Metricool whose metrics all carry a `network` dimension);
  // filtering to roll-up rows here would wrongly mark them disconnected (Codex).
  const sourceRows = await database
    .selectDistinct({ source: metricSnapshots.source })
    .from(metricSnapshots)
    .where(and(...baseConds));
  const connectedSources = new Set(sourceRows.map((row) => row.source));

  // Headline values = latest per (source, metric) among roll-up rows only.
  const rows = await database
    .select({
      source: metricSnapshots.source,
      metric: metricSnapshots.metricName,
      value: metricSnapshots.value,
      metricDate: metricSnapshots.metricDate,
    })
    .from(metricSnapshots)
    .where(and(...baseConds, eq(metricSnapshots.dimsKey, "")))
    .orderBy(desc(metricSnapshots.metricDate));

  const bySurface = new Map<SurfaceKey, SurfaceSummaryEntry>();
  for (const entry of emptySurfaces()) bySurface.set(entry.surface, entry);
  for (const surface of SURFACES) {
    const entry = bySurface.get(surface.key);
    if (!entry) continue;
    entry.sources = surface.sources.filter((source) => connectedSources.has(source));
    entry.connected = entry.sources.length > 0;
  }

  const seen = new Set<string>();
  for (const row of rows) {
    const dedupeKey = `${row.source} ${row.metric}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    const key = surfaceForSource(row.source);
    if (!key) continue;
    const entry = bySurface.get(key);
    if (!entry) continue;
    entry.metrics.push({
      source: row.source,
      metric: row.metric,
      value: row.value == null ? null : Number(row.value),
      date: String(row.metricDate),
    });
  }
  return { configured: true, surfaces: [...bySurface.values()] };
}

export interface NorthStarResult {
  configured: boolean;
  plan: {
    archetype?: string;
    activationEvent?: string;
    primaryKPI?: unknown;
    kpis?: unknown[];
    channels?: unknown;
  } | null;
}

/** North Star + KPI plan from the client's metrics-plan.json (file-backed). */
export function getNorthStar(slug: string): NorthStarResult {
  const planFile = path.join(BASE, "brand", slug, "metrics-plan.json");
  if (!fs.existsSync(planFile)) return { configured: hasDatabase, plan: null };
  try {
    const plan = JSON.parse(fs.readFileSync(planFile, "utf8")) as NonNullable<NorthStarResult["plan"]>;
    return { configured: hasDatabase, plan };
  } catch {
    return { configured: hasDatabase, plan: null };
  }
}
