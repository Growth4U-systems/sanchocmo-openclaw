import { and, desc, eq, gte, lte } from "drizzle-orm";
import { getDb, hasDatabase } from "@/db/drizzle";
import { metricKpiRuns, metricSnapshots } from "@/db/schema";
import { ensureMetricsStorage } from "@/lib/data/metrics-snapshots";
import { getMetricsHealth, type SourceHealth } from "@/lib/data/metrics";
import {
  METRIC_KPI_DEFINITIONS,
  METRIC_KPI_DEFINITION_VERSION,
  computeSemanticKpisFromSnapshots,
  normalizeMetricName,
  normalizeSourceId,
  summarizeKpiQuality,
  type ComputedMetricKpiValue,
  type MetricKpiQualityStatus,
  type MetricKpiSnapshotInput,
} from "@/lib/metrics/semantic-kpis";
import { SURFACES, type SurfaceKey } from "@/lib/metrics/surfaces";

type AuditStatus = "ok" | "partial" | "missing" | "stale" | "error" | "dirty";
type AuditRangeKey = "1d" | "7d" | "30d" | "90d";

const DAY_MS = 86_400_000;
const RANGE_DAYS: Record<AuditRangeKey, number> = {
  "1d": 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
};
export interface MetricsAuditOptions {
  range?: string | null;
  from?: string | null;
  to?: string | null;
  now?: Date;
}

export interface MetricsAuditRange {
  key: AuditRangeKey | "custom";
  from: string;
  to: string;
}

export interface MetricsAuditExpectedSource {
  source: string;
  surfaces: SurfaceKey[];
  kpiIds: string[];
  metrics: string[];
}

export interface MetricsAuditSource {
  source: string;
  status: AuditStatus;
  rawSources: string[];
  expected: boolean;
  surfaces: SurfaceKey[];
  expectedMetrics: string[];
  presentMetrics: string[];
  missingMetrics: string[];
  rowCount: number;
  rollupRowCount: number;
  latestMetricDate: string | null;
  latestRun: {
    status: string | null;
    collectedAt: string | null;
    rowCount: number | null;
    error: string | null;
    overdue: boolean | null;
    knownDirty: boolean;
    dirtyReason?: string;
  };
  kpis: Record<MetricKpiQualityStatus | "total", number>;
}

export interface MetricsAuditSurface {
  surface: SurfaceKey;
  label: string;
  status: AuditStatus;
  sources: string[];
  connectedSources: string[];
  kpis: Record<MetricKpiQualityStatus | "total", number>;
}

export interface MetricsRuntimeAudit {
  configured: boolean;
  slug: string;
  generatedAt: string;
  range: MetricsAuditRange;
  expectedSources: MetricsAuditExpectedSource[];
  sources: MetricsAuditSource[];
  surfaces: MetricsAuditSurface[];
  kpis: {
    definitionVersion: number;
    computedFromSnapshots: Record<MetricKpiQualityStatus | "total", number>;
    persistedRun: {
      id: string;
      status: string;
      valuesCount: number;
      finishedAt: string | null;
    } | null;
  };
  health: Awaited<ReturnType<typeof getMetricsHealth>>;
  nextActions: string[];
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseDate(value: string | null | undefined): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export function resolveMetricsAuditRange(opts: MetricsAuditOptions = {}): MetricsAuditRange {
  const from = parseDate(opts.from);
  const to = parseDate(opts.to);
  if (from && to && from <= to) return { key: "custom", from, to };

  const key = opts.range && opts.range in RANGE_DAYS ? (opts.range as AuditRangeKey) : "30d";
  const now = opts.now ?? new Date();
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const start = end - (RANGE_DAYS[key] - 1) * DAY_MS;
  return {
    key,
    from: isoDay(new Date(start)),
    to: isoDay(new Date(end)),
  };
}

function emptyQualityCounts(): Record<MetricKpiQualityStatus | "total", number> {
  return {
    ok: 0,
    partial: 0,
    missing: 0,
    dirty: 0,
    stale: 0,
    demo: 0,
    total: 0,
  };
}

function qualityCounts(values: ComputedMetricKpiValue[]): Record<MetricKpiQualityStatus | "total", number> {
  return { ...emptyQualityCounts(), ...summarizeKpiQuality(values), total: values.length };
}

export function getExpectedMetricAuditSources(): MetricsAuditExpectedSource[] {
  const bySource = new Map<string, MetricsAuditExpectedSource>();
  for (const def of METRIC_KPI_DEFINITIONS) {
    const source = normalizeSourceId(def.source);
    if (source === "semantic") continue;
    let entry = bySource.get(source);
    if (!entry) {
      entry = { source, surfaces: [], kpiIds: [], metrics: [] };
      bySource.set(source, entry);
    }
    if (def.surface && !entry.surfaces.includes(def.surface)) entry.surfaces.push(def.surface);
    if (!entry.kpiIds.includes(def.id)) entry.kpiIds.push(def.id);
    const metric = normalizeMetricName(def.metric);
    if (!entry.metrics.includes(metric)) entry.metrics.push(metric);
  }
  return [...bySource.values()].sort((a, b) => a.source.localeCompare(b.source));
}

function sourceHealthByCanonical(health: SourceHealth[]): Map<string, SourceHealth> {
  const out = new Map<string, SourceHealth>();
  for (const item of health) {
    const key = normalizeSourceId(item.source);
    const existing = out.get(key);
    if (!existing || (item.lastMetricDate ?? "") > (existing.lastMetricDate ?? "")) out.set(key, item);
  }
  return out;
}

function sourceStatus(args: {
  rowCount: number;
  health?: SourceHealth;
  kpis: Record<MetricKpiQualityStatus | "total", number>;
  missingMetrics: string[];
}): AuditStatus {
  if (args.rowCount === 0) return "missing";
  if (args.health?.lastStatus === "error") return "error";
  if (args.health?.knownDirty) return "dirty";
  if (args.health?.overdue || args.kpis.stale > 0) return "stale";
  if (args.missingMetrics.length || args.kpis.missing || args.kpis.partial || args.kpis.demo) return "partial";
  return "ok";
}

function surfaceStatus(counts: Record<MetricKpiQualityStatus | "total", number>, connectedSources: string[]): AuditStatus {
  if (!connectedSources.length) return "missing";
  if (counts.dirty > 0) return "dirty";
  if (counts.stale > 0) return "stale";
  if (counts.missing > 0 || counts.partial > 0 || counts.demo > 0) return "partial";
  return counts.ok > 0 ? "ok" : "missing";
}

async function findPersistedKpiRun(slug: string, range: MetricsAuditRange) {
  const database = getDb();
  const rows = await database
    .select({
      id: metricKpiRuns.id,
      status: metricKpiRuns.status,
      valuesCount: metricKpiRuns.valuesCount,
      finishedAt: metricKpiRuns.finishedAt,
    })
    .from(metricKpiRuns)
    .where(
      and(
        eq(metricKpiRuns.slug, slug),
        eq(metricKpiRuns.rangeFrom, range.from),
        eq(metricKpiRuns.rangeTo, range.to),
        eq(metricKpiRuns.definitionVersion, METRIC_KPI_DEFINITION_VERSION),
      ),
    )
    .orderBy(desc(metricKpiRuns.startedAt))
    .limit(1);
  const run = rows[0];
  return run
    ? {
        id: run.id,
        status: run.status,
        valuesCount: run.valuesCount,
        finishedAt: run.finishedAt ? new Date(run.finishedAt).toISOString() : null,
      }
    : null;
}

function buildNextActions(args: {
  configured: boolean;
  sources: MetricsAuditSource[];
  persistedRun: MetricsRuntimeAudit["kpis"]["persistedRun"];
  kpiCounts: Record<MetricKpiQualityStatus | "total", number>;
}): string[] {
  if (!args.configured) return ["Configure DATABASE_URL/METRICS_RO_URL for metric_snapshots access."];
  const bySource = new Map(args.sources.map((source) => [source.source, source]));
  const actions: string[] = [];
  for (const source of ["ga4", "gsc", "pagespeed", "posthog", "metricool", "yalc", "trust_score"]) {
    if (bySource.get(source)?.status === "missing") actions.push(`Collect ${source}: no rows in audit range.`);
  }
  if (args.kpiCounts.dirty > 0) actions.push("Review dirty KPI sources before using them as exact headline figures.");
  if (!args.persistedRun) actions.push("Run KPI recompute for this range or open the dashboard once to trigger read-through recompute.");
  if (args.kpiCounts.missing > 0) actions.push(`Map or collect missing KPI inputs (${args.kpiCounts.missing} missing definitions).`);
  return [...new Set(actions)];
}

export async function getMetricsRuntimeAudit(slug: string, opts: MetricsAuditOptions = {}): Promise<MetricsRuntimeAudit> {
  const generatedAt = new Date().toISOString();
  const range = resolveMetricsAuditRange(opts);
  const expectedSources = getExpectedMetricAuditSources();

  if (!hasDatabase) {
    const health = await getMetricsHealth(slug);
    return {
      configured: false,
      slug,
      generatedAt,
      range,
      expectedSources,
      sources: [],
      surfaces: [],
      kpis: {
        definitionVersion: METRIC_KPI_DEFINITION_VERSION,
        computedFromSnapshots: emptyQualityCounts(),
        persistedRun: null,
      },
      health,
      nextActions: buildNextActions({
        configured: false,
        kpiCounts: emptyQualityCounts(),
        persistedRun: null,
        sources: [],
      }),
    };
  }

  await ensureMetricsStorage();
  const database = getDb();
  const [rows, health, persistedRun] = await Promise.all([
    database
      .select({
        id: metricSnapshots.id,
        source: metricSnapshots.source,
        metricName: metricSnapshots.metricName,
        value: metricSnapshots.value,
        valueText: metricSnapshots.valueText,
        metricDate: metricSnapshots.metricDate,
        dimensions: metricSnapshots.dimensions,
        dimsKey: metricSnapshots.dimsKey,
        collectedAt: metricSnapshots.collectedAt,
        ingestRunId: metricSnapshots.ingestRunId,
      })
      .from(metricSnapshots)
      .where(
        and(
          eq(metricSnapshots.slug, slug),
          gte(metricSnapshots.metricDate, range.from),
          lte(metricSnapshots.metricDate, range.to),
        ),
      ),
    getMetricsHealth(slug),
    findPersistedKpiRun(slug, range).catch(() => null),
  ]);

  const snapshots: MetricKpiSnapshotInput[] = rows.map((row) => ({
    id: row.id,
    source: row.source,
    metricName: row.metricName,
    value: row.value == null ? null : Number(row.value),
    valueText: row.valueText,
    metricDate: row.metricDate,
    dimensions: row.dimensions,
    dimsKey: row.dimsKey,
    collectedAt: row.collectedAt,
    ingestRunId: row.ingestRunId,
  }));
  const computed = computeSemanticKpisFromSnapshots(snapshots, range);
  const computedCounts = qualityCounts(computed);
  const expectedBySource = new Map(expectedSources.map((source) => [source.source, source]));
  const healthBySource = sourceHealthByCanonical(health.sources);
  const actualBySource = new Map<string, {
    rawSources: Set<string>;
    metrics: Set<string>;
    rowCount: number;
    rollupRowCount: number;
    latestMetricDate: string | null;
  }>();

  for (const row of rows) {
    const source = normalizeSourceId(row.source);
    let entry = actualBySource.get(source);
    if (!entry) {
      entry = {
        rawSources: new Set(),
        metrics: new Set(),
        rowCount: 0,
        rollupRowCount: 0,
        latestMetricDate: null,
      };
      actualBySource.set(source, entry);
    }
    entry.rawSources.add(row.source);
    entry.metrics.add(normalizeMetricName(row.metricName));
    entry.rowCount += 1;
    if (!row.dimsKey) entry.rollupRowCount += 1;
    if (!entry.latestMetricDate || row.metricDate > entry.latestMetricDate) entry.latestMetricDate = row.metricDate;
  }

  const sourceNames = new Set([...expectedBySource.keys(), ...actualBySource.keys()]);
  const sources = [...sourceNames].sort().map((source): MetricsAuditSource => {
    const expected = expectedBySource.get(source);
    const actual = actualBySource.get(source);
    const healthItem = healthBySource.get(source);
    const sourceKpis = qualityCounts(computed.filter((value) => normalizeSourceId(value.source) === source));
    const presentMetrics = [...(actual?.metrics ?? new Set<string>())].sort();
    const expectedMetrics = [...(expected?.metrics ?? [])].sort();
    const missingMetrics = expectedMetrics.filter((metric) => !actual?.metrics.has(metric));
    const status = sourceStatus({
      rowCount: actual?.rowCount ?? 0,
      health: healthItem,
      kpis: sourceKpis,
      missingMetrics,
    });
    return {
      source,
      status,
      rawSources: [...(actual?.rawSources ?? new Set<string>())].sort(),
      expected: Boolean(expected),
      surfaces: expected?.surfaces ?? [],
      expectedMetrics,
      presentMetrics,
      missingMetrics,
      rowCount: actual?.rowCount ?? 0,
      rollupRowCount: actual?.rollupRowCount ?? 0,
      latestMetricDate: actual?.latestMetricDate ?? null,
      latestRun: {
        status: healthItem?.lastStatus ?? null,
        collectedAt: healthItem?.lastCollectedAt ?? null,
        rowCount: healthItem?.lastRowCount ?? null,
        error: healthItem?.lastError ?? null,
        overdue: healthItem?.overdue ?? null,
        knownDirty: healthItem?.knownDirty ?? false,
        ...(healthItem?.dirtyReason ? { dirtyReason: healthItem.dirtyReason } : {}),
      },
      kpis: sourceKpis,
    };
  });

  const sourceByName = new Map(sources.map((source) => [source.source, source]));
  const surfaces = SURFACES.map((surface): MetricsAuditSurface => {
    const canonicalSources = [...new Set(surface.sources.map((source) => normalizeSourceId(source)))];
    const connectedSources = canonicalSources.filter((source) => (sourceByName.get(source)?.rowCount ?? 0) > 0);
    const values = computed.filter((value) => value.surface === surface.key);
    const counts = qualityCounts(values);
    return {
      surface: surface.key,
      label: surface.name,
      status: surfaceStatus(counts, connectedSources),
      sources: canonicalSources,
      connectedSources,
      kpis: counts,
    };
  });

  return {
    configured: true,
    slug,
    generatedAt,
    range,
    expectedSources,
    sources,
    surfaces,
    kpis: {
      definitionVersion: METRIC_KPI_DEFINITION_VERSION,
      computedFromSnapshots: computedCounts,
      persistedRun,
    },
    health,
    nextActions: buildNextActions({
      configured: true,
      kpiCounts: computedCounts,
      persistedRun,
      sources,
    }),
  };
}
