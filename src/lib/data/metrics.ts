import fs from "fs";
import path from "path";
import {
  and,
  desc,
  eq,
  gte,
  inArray,
  lte,
  max,
  or,
  sql as dsql,
  type SQL,
} from "drizzle-orm";
import { getDb, hasDatabase } from "@/db/drizzle";
import { metricSnapshots, metricSourceRuns } from "@/db/schema";
import { BASE } from "@/lib/data/paths";
import { ensureMetricsStorage } from "@/lib/data/metrics-snapshots";
import { SURFACES, surfaceForSource, type SurfaceKey } from "@/lib/metrics/surfaces";
import {
  aggFor,
  latestMetricNamesForSources,
  reduceMetricSeries,
  weightMetricFor,
  type AggregationFallbackReason,
  type AggregationQuality,
  type AggStrategy,
  type DatedMetricValue,
  type ReducedMetricSeries,
} from "@/lib/metrics/aggregation";
import { assertMetricCalendarRange, isMetricCalendarDate } from "@/lib/metrics/read-query";
import { normalizeSourceId } from "@/lib/metrics/semantic-kpis";
import { getResolvedSchedules, getLatestSourceRuns } from "@/lib/data/metrics-schedule";
import { isDueToday, getKnownDirty, type Cadence } from "@/lib/metrics/collection-schedule";
import {
  loadAllCrons,
  loadJobsState,
  type RawCronJob,
} from "@/lib/data/openclaw-crons";

/**
 * Read layer over the `metric_snapshots` time-series (SAN-264 · Métricas v2 PR-2).
 * All functions degrade cleanly (`configured: false`) when DATABASE_URL is unset.
 * Aggregation is per-metric (SAN-300): additive metrics SUM, rates AVG, and
 * snapshots (trust_score, PageSpeed scores, CRM running totals) take the LATEST
 * value — see `aggFor` in @/lib/metrics/aggregation. Rates with a known
 * denominator are weighted per day; an incomplete denominator falls back to a
 * plain average with explicit `quality=partial` metadata.
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
  quality: AggregationQuality;
  fallbackReason?: AggregationFallbackReason;
}

export interface TimeSeriesQuery {
  source: string;
  metric: string;
  from?: string;
  to?: string;
  grain?: string;
}

export interface TimeSeriesResult {
  configured: boolean;
  grain: Grain;
  source: string;
  metric: string;
  aggregation: {
    strategy: AggStrategy;
    weightMetric: string | null;
  };
  points: SeriesPoint[];
}

function pinnedMetric(source: string, metric: string): { source: string; metric: string } {
  const cleanSource = source?.trim();
  const cleanMetric = metric?.trim();
  if (!cleanSource || !cleanMetric) {
    throw new RangeError("source and metric are required");
  }
  return { source: cleanSource, metric: cleanMetric };
}

/** PostgreSQL-compatible UTC date_trunc for the supported calendar grains. */
function metricBucketDate(date: string, grain: Grain): string {
  if (!isMetricCalendarDate(date)) {
    throw new Error(`Invalid stored metric_date: ${date}`);
  }
  if (grain === "day") return date;
  if (grain === "month") return `${date.slice(0, 7)}-01`;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  const daysSinceMonday = (parsed.getUTCDay() + 6) % 7;
  parsed.setUTCDate(parsed.getUTCDate() - daysSinceMonday);
  return fmtDate(parsed);
}

interface LoadedMetricSeries {
  values: DatedMetricValue[];
  weights: DatedMetricValue[];
}

async function loadRollupMetricSeries(
  slug: string,
  source: string,
  metric: string,
  weightMetric: string | null,
  range: { from?: string; to?: string },
): Promise<LoadedMetricSeries> {
  const database = getDb();
  const conditions = [
    eq(metricSnapshots.slug, slug),
    eq(metricSnapshots.source, source),
    eq(metricSnapshots.dimsKey, ""),
    weightMetric
      ? inArray(metricSnapshots.metricName, [metric, weightMetric])
      : eq(metricSnapshots.metricName, metric),
  ];
  if (range.from) conditions.push(gte(metricSnapshots.metricDate, range.from));
  if (range.to) conditions.push(lte(metricSnapshots.metricDate, range.to));
  const rows = await database
    .select({
      date: metricSnapshots.metricDate,
      metric: metricSnapshots.metricName,
      value: metricSnapshots.value,
    })
    .from(metricSnapshots)
    .where(and(...conditions))
    .orderBy(metricSnapshots.metricDate);

  const values: DatedMetricValue[] = [];
  const weights: DatedMetricValue[] = [];
  for (const row of rows) {
    if (row.value == null || !Number.isFinite(Number(row.value))) continue;
    const point = { date: String(row.date), value: Number(row.value) };
    if (row.metric === metric) values.push(point);
    else if (weightMetric && row.metric === weightMetric) weights.push(point);
  }
  return { values, weights };
}

export async function getMetricsTimeSeries(slug: string, query: TimeSeriesQuery): Promise<TimeSeriesResult> {
  const { source, metric } = pinnedMetric(query.source, query.metric);
  assertMetricCalendarRange({ from: query.from, to: query.to });
  const grain = normGrain(query.grain);
  const strategy = aggFor(source, metric);
  const weightMetric = weightMetricFor(source, metric);
  const aggregation = { strategy, weightMetric };
  if (!hasDatabase) {
    return { configured: false, grain, source, metric, aggregation, points: [] };
  }
  await ensureMetricsStorage();
  const loaded = await loadRollupMetricSeries(slug, source, metric, weightMetric, query);
  const buckets = new Map<string, LoadedMetricSeries>();
  for (const point of loaded.values) {
    const bucket = metricBucketDate(point.date, grain);
    let grouped = buckets.get(bucket);
    if (!grouped) grouped = buckets.set(bucket, { values: [], weights: [] }).get(bucket)!;
    grouped.values.push(point);
  }
  for (const point of loaded.weights) {
    const bucket = metricBucketDate(point.date, grain);
    // Weight-only buckets do not produce output, but retaining them here lets a
    // later value row (input ordering is not a contract) find its companion.
    let grouped = buckets.get(bucket);
    if (!grouped) grouped = buckets.set(bucket, { values: [], weights: [] }).get(bucket)!;
    grouped.weights.push(point);
  }

  const points: SeriesPoint[] = [...buckets.entries()]
    .filter(([, grouped]) => grouped.values.length > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, grouped]) => {
      const reduced = reduceMetricSeries(strategy, grouped.values, weightMetric, grouped.weights);
      return {
        date,
        value: reduced.value,
        quality: reduced.quality,
        ...(reduced.fallbackReason ? { fallbackReason: reduced.fallbackReason } : {}),
      };
    });
  return {
    configured: true,
    grain,
    source,
    metric,
    aggregation,
    points,
  };
}

export interface TrendResult {
  configured: boolean;
  current: number;
  previous: number;
  deltaPct: number | null;
  direction: "up" | "down" | "flat";
  quality: AggregationQuality;
  currentQuality: AggregationQuality;
  previousQuality: AggregationQuality;
  currentFallbackReason?: AggregationFallbackReason;
  previousFallbackReason?: AggregationFallbackReason;
  aggregation: {
    strategy: AggStrategy;
    weightMetric: string | null;
  };
}

/** Reduce a metric over a single window using its per-metric strategy
 *  (sum/avg/latest). Latest = the value at the max metric_date in the window. */
async function aggregateWindow(
  slug: string,
  source: string,
  metric: string,
  from: string,
  to: string,
): Promise<ReducedMetricSeries> {
  const strategy = aggFor(source, metric);
  const weightMetric = weightMetricFor(source, metric);
  const loaded = await loadRollupMetricSeries(slug, source, metric, weightMetric, { from, to });
  return reduceMetricSeries(strategy, loaded.values, weightMetric, loaded.weights);
}

export async function getTrend(
  slug: string,
  query: { source: string; metric: string; from: string; to: string },
): Promise<TrendResult> {
  const { source, metric } = pinnedMetric(query.source, query.metric);
  assertMetricCalendarRange(query, { requireBoth: true });
  const aggregation = {
    strategy: aggFor(source, metric),
    weightMetric: weightMetricFor(source, metric),
  };
  if (!hasDatabase) {
    return {
      configured: false,
      current: 0,
      previous: 0,
      deltaPct: null,
      direction: "flat",
      quality: "missing",
      currentQuality: "missing",
      previousQuality: "missing",
      aggregation,
    };
  }
  await ensureMetricsStorage();
  const fromDate = new Date(`${query.from}T00:00:00.000Z`);
  const toDate = new Date(`${query.to}T00:00:00.000Z`);
  const spanMs = toDate.getTime() - fromDate.getTime();
  const prevTo = new Date(fromDate.getTime() - DAY_MS);
  const prevFrom = new Date(prevTo.getTime() - spanMs);
  const current = await aggregateWindow(slug, source, metric, query.from, query.to);
  const previous = await aggregateWindow(slug, source, metric, fmtDate(prevFrom), fmtDate(prevTo));
  const quality: AggregationQuality =
    current.quality === "missing" || previous.quality === "missing"
      ? "missing"
      : current.quality === "partial" || previous.quality === "partial"
        ? "partial"
        : "ok";
  const deltaPct = quality === "missing"
    ? null
    : previous.value === 0
      ? (current.value === 0 ? 0 : null)
      : ((current.value - previous.value) / previous.value) * 100;
  const direction: TrendResult["direction"] =
    deltaPct == null ? "flat" : deltaPct > 0.5 ? "up" : deltaPct < -0.5 ? "down" : "flat";
  return {
    configured: true,
    current: current.value,
    previous: previous.value,
    deltaPct,
    direction,
    quality,
    currentQuality: current.quality,
    previousQuality: previous.quality,
    ...(current.fallbackReason ? { currentFallbackReason: current.fallbackReason } : {}),
    ...(previous.fallbackReason ? { previousFallbackReason: previous.fallbackReason } : {}),
    aggregation,
  };
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
 * for the old file loop. Degrades to { configured:false, days:0, daily:[] } when
 * DATABASE_URL is unset.
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

export interface LatestMetricSummaryValue {
  name: string;
  value: number | string;
  date?: string;
}

export interface LatestMetricSummarySource {
  source: string;
  status: "ok";
  metrics: LatestMetricSummaryValue[];
}

export interface LatestMetricSummaryResult {
  configured: boolean;
  collectedAt: string | null;
  sources: LatestMetricSummarySource[];
}

/**
 * Compact "latest by source/metric" snapshot for internal status surfaces. This
 * replaces the old latest JSON file read: metric_snapshots is the runtime source
 * of truth, and we keep the same output shape for callers.
 */
export async function getLatestMetricSummary(slug: string, limitPerSource = 20): Promise<LatestMetricSummaryResult> {
  if (!hasDatabase) return { configured: false, collectedAt: null, sources: [] };
  await ensureMetricsStorage();
  const database = getDb();
  const rows = await database
    .select({
      source: metricSnapshots.source,
      metric: metricSnapshots.metricName,
      value: metricSnapshots.value,
      valueText: metricSnapshots.valueText,
      metricDate: metricSnapshots.metricDate,
      collectedAt: metricSnapshots.collectedAt,
    })
    .from(metricSnapshots)
    .where(and(eq(metricSnapshots.slug, slug), eq(metricSnapshots.dimsKey, "")))
    .orderBy(desc(metricSnapshots.metricDate), desc(metricSnapshots.updatedAt));

  const bySource = new Map<string, LatestMetricSummarySource>();
  const seen = new Set<string>();
  let collectedAt: string | null = null;
  for (const row of rows) {
    if (row.collectedAt) {
      const iso = new Date(row.collectedAt).toISOString();
      if (!collectedAt || iso > collectedAt) collectedAt = iso;
    }
    const key = `${row.source}:${row.metric}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const value = row.value == null ? row.valueText : Number(row.value);
    if (typeof value !== "number" && typeof value !== "string") continue;
    let source = bySource.get(row.source);
    if (!source) {
      source = { source: row.source, status: "ok", metrics: [] };
      bySource.set(row.source, source);
    }
    if (source.metrics.length >= limitPerSource) continue;
    source.metrics.push({ name: row.metric, value, date: String(row.metricDate) });
  }
  return { configured: true, collectedAt, sources: [...bySource.values()] };
}

export interface MetricoolPostDetailDim {
  network?: string;
  url?: string;
  text?: string;
  likes?: number;
  clicks?: number;
  engagement?: number;
}

export interface MetricoolPostDetailEntry {
  name: "postDetail";
  value: number;
  date: string;
  dimensions: MetricoolPostDetailDim;
}

function numberDim(dimensions: Record<string, string> | null | undefined, key: string): number | undefined {
  const raw = dimensions?.[key];
  if (raw == null || raw === "") return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Post-level Metricool metrics from the DB. `dimensions` are string-normalized at
 * ingest time, so numeric dimension fields are parsed back for legacy consumers.
 */
export async function listMetricoolPostDetails(slug: string): Promise<Array<{ metricDate: string; entry: MetricoolPostDetailEntry }>> {
  if (!hasDatabase) return [];
  await ensureMetricsStorage();
  const database = getDb();
  const rows = await database
    .select({
      metricDate: metricSnapshots.metricDate,
      value: metricSnapshots.value,
      dimensions: metricSnapshots.dimensions,
    })
    .from(metricSnapshots)
    .where(
      and(
        eq(metricSnapshots.slug, slug),
        eq(metricSnapshots.source, "metricool"),
        eq(metricSnapshots.metricName, "postDetail"),
      ),
    )
    .orderBy(desc(metricSnapshots.metricDate), desc(metricSnapshots.updatedAt));

  return rows.flatMap((row) => {
    const value = row.value == null ? null : Number(row.value);
    if (value == null || !Number.isFinite(value)) return [];
    return [{
      metricDate: String(row.metricDate),
      entry: {
        name: "postDetail",
        value,
        date: String(row.metricDate),
        dimensions: {
          network: row.dimensions?.network,
          url: row.dimensions?.url,
          text: row.dimensions?.text,
          likes: numberDim(row.dimensions, "likes"),
          clicks: numberDim(row.dimensions, "clicks"),
          engagement: numberDim(row.dimensions, "engagement"),
        },
      },
    }];
  });
}

export async function findMetricoolPostByUrl(slug: string, externalUrl: string): Promise<MetricoolPostDetailEntry | null> {
  const entries = await listMetricoolPostDetails(slug);
  return entries.find(({ entry }) => entry.dimensions.url === externalUrl)?.entry ?? null;
}

export interface SourceScorecardMetric {
  metric: string;
  value: number;
  agg: AggStrategy;
  weightMetric: string | null;
  quality: AggregationQuality;
  fallbackReason?: AggregationFallbackReason;
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
  assertMetricCalendarRange(query);
  const now = new Date();
  const to = query.to ?? fmtDate(new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  ) - DAY_MS));
  // Inclusive [from,to]: the end date plus its preceding 29 dates is 30 days.
  // Basing this on an explicit historical `to` avoids an accidental empty range.
  const toTime = new Date(`${to}T00:00:00.000Z`).getTime();
  const from = query.from ?? fmtDate(new Date(toTime - 29 * DAY_MS));
  assertMetricCalendarRange({ from, to }, { requireBoth: true });
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
    surface: surfaceForSource(normalizeSourceId(source)),
    metrics: [...metrics.entries()].map(([metric, series]) => {
      const agg = aggFor(source, metric);
      const weightMetric = weightMetricFor(source, metric);
      const reduced = reduceMetricSeries(
        agg,
        series,
        weightMetric,
        weightMetric ? metrics.get(weightMetric) ?? [] : [],
      );
      return {
        metric,
        value: reduced.value,
        agg,
        weightMetric,
        quality: reduced.quality,
        ...(reduced.fallbackReason ? { fallbackReason: reduced.fallbackReason } : {}),
      };
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
  /** Latest successful in-range evidence says the provider is connected but has no observations. */
  dataStatus?: "connected_no_data";
}

export interface SurfaceSummaryResult {
  configured: boolean;
  /** False only when the bounded headline read hit its safety cap. */
  complete?: boolean;
  surfaces: SurfaceSummaryEntry[];
}

export const MAX_SURFACE_SUMMARY_ROWS = 20_000;

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

export interface SurfaceSummaryRunEvidence {
  source: string;
  status: string;
  metricDate: string;
  collectedAt?: Date | string | null;
}

export interface SurfaceSummaryMetricRow {
  source: string;
  metric: string;
  value: number | null;
  metricDate: string;
  collectedAt?: Date | string | null;
}

/**
 * Flow headlines stay in [from,to]. Only point-in-time vocabulary may escape
 * that window, selecting observations at/before `asOf`. This pure guard is
 * repeated after SQL loading so future query refactors cannot leak today's
 * additive data into a preset that ends yesterday.
 */
export function selectSurfaceSummaryMetricRows(
  rows: ReadonlyArray<SurfaceSummaryMetricRow>,
  range: { from: string; to: string; asOf: string },
): SurfaceSummaryMetricRow[] {
  return rows
    .filter((row) => {
      const inFlowRange = row.metricDate >= range.from && row.metricDate <= range.to;
      return inFlowRange || (
        row.metricDate <= range.asOf
        && aggFor(normalizeSourceId(row.source), row.metric) === "latest"
      );
    })
    .sort((left, right) =>
      right.metricDate.localeCompare(left.metricDate)
      || runCollectedAtMs(right.collectedAt) - runCollectedAtMs(left.collectedAt));
}

function runCollectedAtMs(value: Date | string | null | undefined): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

/**
 * Build the surface read model from snapshots plus collection evidence. The
 * latest ledger row is selected per normalized provider. Error/skipped rows do
 * not manufacture connectivity; connected_no_data does, while suppressing
 * older snapshot headlines for that provider inside the requested window.
 */
export function buildSurfaceSummaryEntries(
  snapshotSources: ReadonlyArray<{ source: string }>,
  metricRows: ReadonlyArray<SurfaceSummaryMetricRow>,
  runEvidence: ReadonlyArray<SurfaceSummaryRunEvidence> = [],
): SurfaceSummaryEntry[] {
  const connectedSources = new Set(
    snapshotSources.map((row) => normalizeSourceId(row.source)),
  );
  const latestRunBySource = new Map<string, SurfaceSummaryRunEvidence>();
  const sortedRuns = [...runEvidence].sort((left, right) => {
    const byDate = right.metricDate.localeCompare(left.metricDate);
    if (byDate) return byDate;
    return runCollectedAtMs(right.collectedAt) - runCollectedAtMs(left.collectedAt);
  });
  for (const run of sortedRuns) {
    if (run.status !== "ok" && run.status !== "connected_no_data") continue;
    const source = normalizeSourceId(run.source);
    if (!latestRunBySource.has(source)) latestRunBySource.set(source, run);
  }

  const latestMetricBySource = new Map<string, { metricDate: string; collectedAtMs: number }>();
  for (const row of metricRows) {
    const source = normalizeSourceId(row.source);
    const candidate = {
      metricDate: row.metricDate,
      collectedAtMs: runCollectedAtMs(row.collectedAt),
    };
    const current = latestMetricBySource.get(source);
    if (
      !current
      || candidate.metricDate > current.metricDate
      || (candidate.metricDate === current.metricDate && candidate.collectedAtMs > current.collectedAtMs)
    ) {
      latestMetricBySource.set(source, candidate);
    }
  }
  const connectedNoDataSources = new Set<string>();
  for (const [source, run] of latestRunBySource) {
    connectedSources.add(source);
    const metric = latestMetricBySource.get(source);
    const noDataCollectedAt = runCollectedAtMs(run.collectedAt);
    if (
      run.status === "connected_no_data"
      && (
        !metric
        || metric.metricDate < run.metricDate
        || (
          metric.metricDate === run.metricDate
          && metric.collectedAtMs <= noDataCollectedAt
        )
      )
    ) {
      connectedNoDataSources.add(source);
    }
  }

  const bySurface = new Map<SurfaceKey, SurfaceSummaryEntry>();
  for (const entry of emptySurfaces()) bySurface.set(entry.surface, entry);
  for (const surface of SURFACES) {
    const entry = bySurface.get(surface.key);
    if (!entry) continue;
    entry.sources = [
      ...new Set(
        surface.sources
          .map((source) => normalizeSourceId(source))
          .filter((source) => connectedSources.has(source)),
      ),
    ];
    entry.connected = entry.sources.length > 0;
  }

  const seen = new Set<string>();
  const sortedMetricRows = [...metricRows].sort((left, right) =>
    right.metricDate.localeCompare(left.metricDate)
    || runCollectedAtMs(right.collectedAt) - runCollectedAtMs(left.collectedAt));
  for (const row of sortedMetricRows) {
    const normalizedSource = normalizeSourceId(row.source);
    if (connectedNoDataSources.has(normalizedSource)) continue;
    const dedupeKey = `${normalizedSource} ${row.metric}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    const key = surfaceForSource(normalizedSource);
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

  for (const entry of bySurface.values()) {
    if (
      entry.connected
      && entry.metrics.length === 0
      && entry.sources.length > 0
      && entry.sources.every((source) => connectedNoDataSources.has(source))
    ) {
      entry.dataStatus = "connected_no_data";
    }
  }
  return [...bySurface.values()];
}

export async function getSurfaceSummary(slug: string, query: { from?: string; to?: string } = {}): Promise<SurfaceSummaryResult> {
  assertMetricCalendarRange(query);
  if (!hasDatabase) return { configured: false, complete: false, surfaces: emptySurfaces() };
  await ensureMetricsStorage();
  const database = getDb();
  const asOf = fmtDate(new Date());
  const to = query.to ?? asOf;
  const from = query.from ?? fmtDate(new Date(Date.now() - 90 * DAY_MS));
  assertMetricCalendarRange({ from, to }, { requireBoth: true });
  const latestMetricNames = latestMetricNamesForSources();
  const flowWindow = and(
    gte(metricSnapshots.metricDate, from),
    lte(metricSnapshots.metricDate, to),
  );
  const latestWindow = and(
    inArray(metricSnapshots.metricName, latestMetricNames),
    lte(metricSnapshots.metricDate, asOf),
  );

  // Connectivity = the source has ANY row in the window (incl. dimension-only
  // sources like Metricool whose metrics all carry a `network` dimension);
  // filtering to roll-up rows here would wrongly mark them disconnected (Codex).
  const runThrough = asOf > to ? asOf : to;
  const [sourceRows, runRows, flowDates, latestDates] = await Promise.all([
    database
      .selectDistinct({ source: metricSnapshots.source })
      .from(metricSnapshots)
      .where(and(
        eq(metricSnapshots.slug, slug),
        or(flowWindow, latestWindow),
      )),
    database
      .select({
        source: metricSourceRuns.source,
        status: metricSourceRuns.status,
        metricDate: metricSourceRuns.metricDate,
        collectedAt: metricSourceRuns.collectedAt,
      })
      .from(metricSourceRuns)
      .where(and(
        eq(metricSourceRuns.slug, slug),
        gte(metricSourceRuns.metricDate, from),
        lte(metricSourceRuns.metricDate, runThrough),
      ))
      .orderBy(desc(metricSourceRuns.metricDate), desc(metricSourceRuns.collectedAt)),
    database
      .select({
        source: metricSnapshots.source,
        metric: metricSnapshots.metricName,
        metricDate: max(metricSnapshots.metricDate),
      })
      .from(metricSnapshots)
      .where(and(
        eq(metricSnapshots.slug, slug),
        eq(metricSnapshots.dimsKey, ""),
        flowWindow,
      ))
      .groupBy(metricSnapshots.source, metricSnapshots.metricName),
    database
      .select({
        source: metricSnapshots.source,
        metric: metricSnapshots.metricName,
        metricDate: max(metricSnapshots.metricDate),
      })
      .from(metricSnapshots)
      .where(and(
        eq(metricSnapshots.slug, slug),
        eq(metricSnapshots.dimsKey, ""),
        latestWindow,
      ))
      .groupBy(metricSnapshots.source, metricSnapshots.metricName),
  ]);

  // Headline values = one exact max date per source+metric. Additive/rate
  // headlines resolve inside the flow range; latest state resolves as-of today.
  // Fetching exact pairs keeps the read bounded regardless of history length.
  const pairs = new Map<string, { source: string; metric: string; metricDate: string }>();
  for (const row of flowDates) {
    if (!row.metricDate) continue;
    const pair = { ...row, metricDate: String(row.metricDate) };
    pairs.set(JSON.stringify([pair.source, pair.metric, pair.metricDate]), pair);
  }
  for (const row of latestDates) {
    if (
      !row.metricDate
      || aggFor(normalizeSourceId(row.source), row.metric) !== "latest"
    ) continue;
    const pair = { ...row, metricDate: String(row.metricDate) };
    pairs.set(JSON.stringify([pair.source, pair.metric, pair.metricDate]), pair);
  }
  const exactPairs = [...pairs.values()];
  const rows: SurfaceSummaryMetricRow[] = [];
  let complete = true;
  for (let offset = 0; offset < exactPairs.length && complete; offset += 40) {
    const chunk = exactPairs.slice(offset, offset + 40);
    const remainingWithProbe = MAX_SURFACE_SUMMARY_ROWS + 1 - rows.length;
    const exactCondition = or(...chunk.map((pair) => and(
      eq(metricSnapshots.source, pair.source),
      eq(metricSnapshots.metricName, pair.metric),
      eq(metricSnapshots.metricDate, pair.metricDate),
    )));
    if (!exactCondition) continue;
    const conditions: SQL[] = [
      eq(metricSnapshots.slug, slug),
      eq(metricSnapshots.dimsKey, ""),
      exactCondition,
    ];
    const page = await database
      .select({
        source: metricSnapshots.source,
        metric: metricSnapshots.metricName,
        value: metricSnapshots.value,
        metricDate: metricSnapshots.metricDate,
        collectedAt: metricSnapshots.collectedAt,
      })
      .from(metricSnapshots)
      .where(and(...conditions))
      .limit(Math.min(MAX_SURFACE_SUMMARY_ROWS + 1, remainingWithProbe));
    rows.push(...page.map((row) => ({ ...row, metricDate: String(row.metricDate) })));
    if (rows.length > MAX_SURFACE_SUMMARY_ROWS) {
      rows.length = MAX_SURFACE_SUMMARY_ROWS;
      complete = false;
    }
  }
  const selectedRows = selectSurfaceSummaryMetricRows(rows, { from, to, asOf });

  return {
    configured: true,
    complete,
    surfaces: buildSurfaceSummaryEntries(
      sourceRows,
      selectedRows,
      runRows.map((row) => ({ ...row, metricDate: String(row.metricDate) })),
    ),
  };
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

// ── Health / monitoring (SAN-300) ───────────────────────────────────────────

const HEALTH_GRACE_DAYS = 2;
function maxIntervalDays(cadence: Cadence): number {
  switch (cadence) {
    case "daily":
      return 1;
    case "twice_weekly":
      return 4;
    case "weekly":
    case "custom":
    default:
      return 7;
  }
}

export interface SourceHealth {
  source: string;
  cadence: Cadence;
  enabled: boolean;
  lastMetricDate: string | null;
  lastCollectedAt: string | null;
  ageDays: number | null;
  dueToday: boolean;
  overdue: boolean;
  lastStatus: string | null;
  lastError: string | null;
  lastRowCount: number | null;
  lastDeletedCount: number | null;
  /** Known instrumentation problem for this source — see KNOWN_DIRTY. */
  knownDirty: boolean;
  dirtyReason?: string;
}

export interface MetricsHealthResult {
  configured: boolean;
  slug: string;
  generatedAt: string;
  sources: SourceHealth[];
  cron: { degraded: boolean; reasons: string[] };
  overall: "ok" | "stale" | "error" | "no-data";
}

export function resolveMetricsHealthOverall(input: {
  anyData: boolean;
  anyStale: boolean;
  anyError: boolean;
}): MetricsHealthResult["overall"] {
  if (input.anyError) return "error";
  if (!input.anyData) return "no-data";
  return input.anyStale ? "stale" : "ok";
}

export function isMetricsCollectorCron(cron: Pick<RawCronJob, "name" | "description" | "payload">): boolean {
  const text = [cron.name, cron.description, cron.payload?.message]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
  return /metrics?[-_\s]?collector|collect\.js\b|ingest-metrics|\/api\/metrics\/ingest/.test(text);
}

function cronTargetsDifferentSlug(cron: RawCronJob, slug: string): boolean {
  const text = [cron.name, cron.description, cron.payload?.message].filter(Boolean).join("\n");
  const targets = [
    ...text.matchAll(/--slug(?:=|\s+)([a-z0-9_-]+)/gi),
    ...text.matchAll(/brand\/([a-z0-9_-]+)\//gi),
  ].map((match) => match[1].toLowerCase());
  return targets.length > 0 && !targets.includes(slug.toLowerCase());
}

/** Collector-only cron signal. Joining job definitions to state avoids turning
 * unrelated billing/time-out failures elsewhere in Sancho into a false Metrics
 * outage. Best-effort; never throws. */
function readCronHealth(slug: string): { degraded: boolean; reasons: string[] } {
  try {
    const state = loadJobsState();
    const collectorJobs = loadAllCrons().filter(
      (cron) => cron.enabled !== false
        && isMetricsCollectorCron(cron)
        && !cronTargetsDifferentSlug(cron, slug),
    );
    const reasons: string[] = [];
    for (const cron of collectorJobs) {
      const s = state[cron.id]?.state;
      if (!s) continue;
      const status = (s.lastRunStatus || s.lastStatus) ?? null;
      if (status === "error" && s.lastErrorReason) reasons.push(s.lastErrorReason);
    }
    return { degraded: reasons.length > 0, reasons: [...new Set(reasons)] };
  } catch {
    return { degraded: false, reasons: [] };
  }
}

/**
 * Per-source collection health: last data, age, due-today and overdue (relative
 * to each source's cadence, not a fixed threshold), plus the latest ledger status
 * and a global cron-degraded flag. Degrades to { configured:false } without a DB.
 */
export async function getMetricsHealth(slug: string): Promise<MetricsHealthResult> {
  const generatedAt = new Date().toISOString();
  const cron = readCronHealth(slug);
  if (!hasDatabase) return { configured: false, slug, generatedAt, sources: [], cron, overall: "no-data" };
  await ensureMetricsStorage();
  const database = getDb();
  const [lastRows, schedules, runs] = await Promise.all([
    database
      .select({ source: metricSnapshots.source, last: dsql<string>`max(${metricSnapshots.metricDate})` })
      .from(metricSnapshots)
      .where(eq(metricSnapshots.slug, slug))
      .groupBy(metricSnapshots.source),
    getResolvedSchedules(slug),
    getLatestSourceRuns(slug),
  ]);
  const lastBySource = new Map(lastRows.map((row) => [row.source, String(row.last)]));
  const runBySource = new Map(runs.map((run) => [run.source, run]));
  const today = new Date();
  let anyData = false;
  let anyStale = false;
  let anyError = cron.degraded;
  const sources: SourceHealth[] = schedules.map((schedule) => {
    const lastMetricDate = lastBySource.get(schedule.source) ?? null;
    const run = runBySource.get(schedule.source) ?? null;
    const ageDays = lastMetricDate
      ? Math.floor((today.getTime() - new Date(lastMetricDate).getTime()) / DAY_MS)
      : null;
    if (lastMetricDate) anyData = true;
    const overdue = !schedule.enabled
      ? false
      : lastMetricDate == null
        ? true
        : (ageDays ?? 0) > maxIntervalDays(schedule.cadence) + HEALTH_GRACE_DAYS;
    if (overdue) anyStale = true;
    if (run?.status === "error") anyError = true;
    return {
      source: schedule.source,
      cadence: schedule.cadence,
      enabled: schedule.enabled,
      lastMetricDate,
      lastCollectedAt: run?.collectedAt ?? null,
      ageDays,
      dueToday: isDueToday(schedule, today),
      overdue,
      lastStatus: run?.status ?? null,
      lastError: run?.error ?? null,
      lastRowCount: run?.rowCount ?? null,
      lastDeletedCount: run?.deletedCount ?? null,
      ...getKnownDirty(schedule.source),
    };
  });
  const overall = resolveMetricsHealthOverall({ anyData, anyStale, anyError });
  return { configured: true, slug, generatedAt, sources, cron, overall };
}
