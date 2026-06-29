import {
  and,
  eq,
  gt,
  gte,
  lte,
  sql as dsql,
} from "drizzle-orm";
import { getDb, hasDatabase } from "@/db/drizzle";
import { metricSnapshots } from "@/db/schema";
import {
  findMetricKpiRunForRange,
  getMetricKpiValues,
  metricKpiStorageConfigured,
  type MetricKpiRunRow,
  type MetricKpiValueRow,
} from "@/lib/data/metric-kpis";
import {
  runMetricKpis,
  type RunMetricKpisResult,
} from "@/lib/data/metric-kpi-runner";
import {
  listMetricStageRollups,
  metricStageRollupStorageConfigured,
  type MetricStageRollupRow,
} from "@/lib/data/metric-stage-rollups";
import { METRIC_KPI_DEFINITION_VERSION } from "@/lib/metrics/semantic-kpis";
import {
  buildMetricStageRollupReadModel,
  type MetricStageRollupReadInput,
  type MetricStageRollupReadModel,
} from "@/lib/metrics/stage-rollup-read-model";
import type { SurfaceKey } from "@/lib/metrics/surfaces";

const DAY_MS = 86_400_000;

export type MetricKpiRangeKey = "1d" | "7d" | "30d" | "90d";
export type MetricKpiQualityStatus =
  | "ok"
  | "partial"
  | "missing"
  | "dirty"
  | "stale"
  | "demo";

export interface MetricKpiReadRangeInput {
  range?: string | null;
  from?: string | null;
  to?: string | null;
}

export interface MetricKpiReadModelOptions extends MetricKpiReadRangeInput {
  runId?: string | null;
  surface?: SurfaceKey | null;
  dashboardBlock?: "overview" | "surface" | "channels" | "conversion" | "trends" | null;
}

export interface MetricKpiReadThroughOptions extends MetricKpiReadModelOptions {
  autoCompute?: boolean;
  trigger?: string | null;
}

export interface MetricKpiReadThroughDeps {
  read?: typeof getMetricKpiReadModel;
  run?: typeof runMetricKpis;
  hasSnapshotUpdatesAfter?: typeof hasMetricKpiSnapshotUpdatesAfter;
}

export interface MetricKpiReadModelValue {
  id: string;
  kpiId: string;
  label: string;
  dashboardBlock: string;
  surface: SurfaceKey | null;
  source: string | null;
  metricName: string | null;
  value: number | null;
  valueText: string | null;
  displayValue: string;
  unit: string | null;
  qualityStatus: MetricKpiQualityStatus;
  provenanceLabel: string;
  inputRefs: Array<Record<string, unknown>>;
  sourceCoverage: number;
  rangeFrom: string;
  rangeTo: string;
  definitionVersion: number | null;
  computedAt: string;
}

export interface MetricKpiReadModelRun {
  id: string;
  status: string;
  trigger: string;
  definitionVersion: number | null;
  valuesCount: number;
  qualitySummary: Record<string, number>;
  rangeFrom: string;
  rangeTo: string;
  startedAt: string;
  finishedAt: string | null;
}

export interface MetricKpiReadModelSummary extends Record<MetricKpiQualityStatus | "total", number> {
  qualityStatus: MetricKpiQualityStatus;
}

export interface MetricKpiReadModel {
  configured: boolean;
  slug: string;
  requestedRange: {
    key: MetricKpiRangeKey | "custom";
    from: string;
    to: string;
  } | null;
  run: MetricKpiReadModelRun | null;
  summary: MetricKpiReadModelSummary;
  values: MetricKpiReadModelValue[];
  northStar: MetricKpiReadModelValue | null;
  stageRollups: MetricStageRollupReadModel;
}

const RANGE_DAYS: Record<MetricKpiRangeKey, number> = {
  "1d": 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

const QUALITY_ORDER: MetricKpiQualityStatus[] = [
  "dirty",
  "stale",
  "demo",
  "partial",
  "ok",
  "missing",
];

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseDate(value: string | null | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return value;
}

export function resolveMetricKpiReadRange(
  input: MetricKpiReadRangeInput,
  now = new Date(),
): MetricKpiReadModel["requestedRange"] {
  const from = parseDate(input.from);
  const to = parseDate(input.to);
  if (from && to) {
    if (from > to) throw new Error(`Invalid KPI range: ${from} is after ${to}`);
    return { key: "custom", from, to };
  }

  const key = input.range && input.range in RANGE_DAYS
    ? (input.range as MetricKpiRangeKey)
    : null;
  if (!key) return null;

  const end = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const start = end - (RANGE_DAYS[key] - 1) * DAY_MS;
  return {
    key,
    from: isoDay(new Date(start)),
    to: isoDay(new Date(end)),
  };
}

function dateToString(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function dateValue(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeQuality(value: string | null | undefined): MetricKpiQualityStatus {
  return QUALITY_ORDER.includes(value as MetricKpiQualityStatus)
    ? (value as MetricKpiQualityStatus)
    : "missing";
}

function normalizeInputRefs(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === "object" && !Array.isArray(item),
    )
    : [];
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("es-ES", {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value);
}

export function formatMetricKpiValue(row: Pick<MetricKpiValueRow, "value" | "valueText" | "unit">): string {
  if (row.valueText) return row.valueText;
  if (row.value == null) return "-";
  const value = Number(row.value);
  if (!Number.isFinite(value)) return "-";

  switch (row.unit) {
    case "currency":
      return new Intl.NumberFormat("es-ES", {
        currency: "EUR",
        maximumFractionDigits: 0,
        style: "currency",
      }).format(value);
    case "%":
      return `${formatNumber(value)}%`;
    case "ratio":
      return `${formatNumber(value)}x`;
    case "ms":
    case "s":
      return `${formatNumber(value)} ${row.unit}`;
    default:
      return formatNumber(value);
  }
}

function toSummary(values: MetricKpiReadModelValue[], run?: MetricKpiRunRow | null): MetricKpiReadModelSummary {
  const counts = {
    ok: 0,
    partial: 0,
    missing: 0,
    dirty: 0,
    stale: 0,
    demo: 0,
    total: values.length,
  };
  const rawSummary = run?.qualitySummary ?? {};
  for (const status of QUALITY_ORDER) {
    const rawCount = rawSummary[status];
    counts[status] = typeof rawCount === "number"
      ? rawCount
      : values.filter((value) => value.qualityStatus === status).length;
  }

  let qualityStatus: MetricKpiQualityStatus = "missing";
  if (counts.dirty > 0) qualityStatus = "dirty";
  else if (counts.stale > 0) qualityStatus = "stale";
  else if (counts.demo > 0 && counts.ok === 0) qualityStatus = "demo";
  else if (counts.partial > 0 || counts.missing > 0) qualityStatus = values.length ? "partial" : "missing";
  else if (counts.ok > 0) qualityStatus = "ok";

  return { ...counts, qualityStatus };
}

function emptyReadModel(args: {
  configured: boolean;
  slug: string;
  requestedRange: MetricKpiReadModel["requestedRange"];
  stageRollups: MetricStageRollupReadModel;
}): MetricKpiReadModel {
  return {
    configured: args.configured,
    slug: args.slug,
    requestedRange: args.requestedRange,
    run: null,
    summary: toSummary([]),
    values: [],
    northStar: null,
    stageRollups: args.stageRollups,
  };
}

function toRun(row: MetricKpiRunRow): MetricKpiReadModelRun {
  return {
    id: row.id,
    status: row.status,
    trigger: row.trigger,
    definitionVersion: row.definitionVersion,
    valuesCount: row.valuesCount,
    qualitySummary: row.qualitySummary ?? {},
    rangeFrom: row.rangeFrom,
    rangeTo: row.rangeTo,
    startedAt: dateToString(row.startedAt) ?? "",
    finishedAt: dateToString(row.finishedAt),
  };
}

export function toMetricKpiReadModelValue(row: MetricKpiValueRow): MetricKpiReadModelValue {
  return {
    id: row.id,
    kpiId: row.kpiId,
    label: row.label,
    dashboardBlock: row.dashboardBlock,
    surface: row.surface as SurfaceKey | null,
    source: row.source,
    metricName: row.metricName,
    value: row.value == null ? null : Number(row.value),
    valueText: row.valueText,
    displayValue: formatMetricKpiValue(row),
    unit: row.unit,
    qualityStatus: normalizeQuality(row.qualityStatus),
    provenanceLabel: row.provenanceLabel,
    inputRefs: normalizeInputRefs(row.inputRefs),
    sourceCoverage: Number(row.sourceCoverage ?? 0),
    rangeFrom: row.rangeFrom,
    rangeTo: row.rangeTo,
    definitionVersion: row.definitionVersion,
    computedAt: dateToString(row.computedAt) ?? "",
  };
}

export function selectNorthStarKpi(values: MetricKpiReadModelValue[]): MetricKpiReadModelValue | null {
  return values.find((value) => value.dashboardBlock === "overview" && value.value != null)
    ?? values.find((value) => value.value != null)
    ?? values.find((value) => value.dashboardBlock === "overview")
    ?? null;
}

function toStageRollupInput(row: MetricStageRollupRow): MetricStageRollupReadInput {
  return {
    id: row.id,
    stageId: row.stageId,
    stageLabel: row.stageLabel,
    stageOrder: row.stageOrder,
    stageDate: row.stageDate,
    channel: row.channel,
    surface: row.surface,
    source: row.source,
    metricName: row.metricName,
    value: row.value == null ? null : Number(row.value),
    qualityStatus: row.qualityStatus,
    provenanceLabel: row.provenanceLabel,
    inputRefs: row.inputRefs,
    rangeFrom: row.rangeFrom,
    rangeTo: row.rangeTo,
    definitionVersion: row.definitionVersion,
    computedAt: row.computedAt,
  };
}

async function getStageRollupsForReadModel(
  slug: string,
  requestedRange: MetricKpiReadModel["requestedRange"],
  runId?: string | null,
): Promise<MetricStageRollupReadModel> {
  if (!requestedRange) {
    return buildMetricStageRollupReadModel({
      configured: metricStageRollupStorageConfigured(),
      range: null,
      rows: [],
    });
  }

  const rows = await listMetricStageRollups(slug, {
    from: requestedRange.from,
    to: requestedRange.to,
    runId,
    definitionVersion: METRIC_KPI_DEFINITION_VERSION,
  });

  return buildMetricStageRollupReadModel({
    configured: metricStageRollupStorageConfigured(),
    range: { from: requestedRange.from, to: requestedRange.to },
    rows: rows.map(toStageRollupInput),
  });
}

export async function getMetricKpiReadModel(
  slug: string,
  opts: MetricKpiReadModelOptions = {},
): Promise<MetricKpiReadModel> {
  const requestedRange = resolveMetricKpiReadRange(opts);
  const run = opts.runId
    ? null
    : requestedRange
      ? await findMetricKpiRunForRange(slug, {
        from: requestedRange.from,
        to: requestedRange.to,
        statuses: ["ok"],
        definitionVersion: METRIC_KPI_DEFINITION_VERSION,
      })
      : null;
  const stageRollups = await getStageRollupsForReadModel(
    slug,
    requestedRange,
    opts.runId ?? run?.id ?? null,
  );

  if (requestedRange && !run && !opts.runId) {
    return emptyReadModel({
      configured: metricKpiStorageConfigured(),
      requestedRange,
      slug,
      stageRollups,
    });
  }

  const result = await getMetricKpiValues(slug, {
    dashboardBlock: opts.dashboardBlock ?? undefined,
    runId: opts.runId ?? run?.id,
    surface: opts.surface ?? undefined,
  });
  const values = result.values.map(toMetricKpiReadModelValue);

  return {
    configured: result.configured,
    slug,
    requestedRange,
    run: result.run ? toRun(result.run) : null,
    summary: toSummary(values, result.run),
    values,
    northStar: selectNorthStarKpi(values),
    stageRollups,
  };
}

export async function hasMetricKpiSnapshotUpdatesAfter(
  slug: string,
  range: { from: string; to: string },
  since: Date | string | null | undefined,
): Promise<boolean> {
  const sinceDate = dateValue(since);
  if (!hasDatabase || !sinceDate) return false;

  const database = getDb();
  const rows = await database
    .select({ count: dsql<number>`count(*)` })
    .from(metricSnapshots)
    .where(
      and(
        eq(metricSnapshots.slug, slug),
        gte(metricSnapshots.metricDate, range.from),
        lte(metricSnapshots.metricDate, range.to),
        gt(metricSnapshots.updatedAt, sinceDate),
      ),
    );

  return Number(rows[0]?.count ?? 0) > 0;
}

function shouldAutoComputeReadModel(args: {
  model: MetricKpiReadModel;
  opts: MetricKpiReadThroughOptions;
  snapshotsChanged: boolean;
}): boolean {
  if (args.opts.autoCompute === false) return false;
  if (args.opts.runId) return false;
  if (!args.model.requestedRange) return false;
  if (!args.model.run) return true;
  return args.snapshotsChanged;
}

async function readAfterAutoCompute(args: {
  read: typeof getMetricKpiReadModel;
  slug: string;
  opts: MetricKpiReadThroughOptions;
  result: RunMetricKpisResult;
}): Promise<MetricKpiReadModel> {
  if (args.result.skipped && args.result.skipReason === "already-running") {
    return args.read(args.slug, args.opts);
  }
  return args.read(args.slug, args.opts);
}

export async function getMetricKpiReadModelReadThrough(
  slug: string,
  opts: MetricKpiReadThroughOptions = {},
  deps: MetricKpiReadThroughDeps = {},
): Promise<MetricKpiReadModel> {
  const read = deps.read ?? getMetricKpiReadModel;
  const run = deps.run ?? runMetricKpis;
  const hasSnapshotUpdatesAfter =
    deps.hasSnapshotUpdatesAfter ?? hasMetricKpiSnapshotUpdatesAfter;

  const model = await read(slug, opts);
  const snapshotsChanged =
    model.requestedRange && model.run
      ? await hasSnapshotUpdatesAfter(
        slug,
        { from: model.requestedRange.from, to: model.requestedRange.to },
        model.run.finishedAt ?? model.run.startedAt,
      )
      : false;

  if (!shouldAutoComputeReadModel({ model, opts, snapshotsChanged })) {
    return model;
  }

  const range = model.requestedRange;
  if (!range) return model;
  const result = await run({
    slug,
    range: { from: range.from, to: range.to },
    trigger: opts.trigger?.trim() || "dashboard:read-through",
    force: snapshotsChanged,
  });

  if (!result.ok) return model;
  return readAfterAutoCompute({ read, slug, opts, result });
}
