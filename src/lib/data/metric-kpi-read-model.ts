import {
  and,
  eq,
  gt,
  gte,
  inArray,
  lte,
  or,
  sql as dsql,
} from "drizzle-orm";
import { getDb, hasDatabase } from "@/db/drizzle";
import { metricSnapshots } from "@/db/schema";
import { getDashboardDefinition } from "@/lib/data/metric-dashboard";
import {
  findMetricKpiRunForRange,
  getMetricKpiValues,
  latestMetricNamesForEvaluation,
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
import {
  canonicalMetricKpiLabel,
  METRIC_KPI_DEFINITIONS,
  METRIC_KPI_DEFINITION_VERSION,
} from "@/lib/metrics/semantic-kpis";
import {
  aggFor,
  latestMetricNamesForSources,
} from "@/lib/metrics/aggregation";
import { composeMetricKpiDefinitionVersion } from "@/lib/metrics/kpi-definition-version";
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
  northStar?: MetricKpiNorthStarHint | null;
}

export interface MetricKpiReadThroughOptions extends MetricKpiReadModelOptions {
  autoCompute?: boolean;
  trigger?: string | null;
  /** Injectable UTC clock for deterministic as-of invalidation. */
  now?: Date;
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
  comparison: MetricKpiComparison | null;
}

export interface MetricKpiComparison {
  previousRange: {
    from: string;
    to: string;
  };
  previousValue: number | null;
  previousDisplayValue: string;
  absoluteDelta: number | null;
  relativeDelta: number | null;
  displayDelta: string | null;
  direction: "up" | "down" | "flat" | null;
  sentiment: "positive" | "negative" | "neutral" | null;
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

export interface MetricKpiNorthStarHint {
  kpiRef?: string | null;
  label?: string | null;
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
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10) === value ? value : null;
}

export function resolveMetricKpiReadRange(
  input: MetricKpiReadRangeInput,
  now = new Date(),
): MetricKpiReadModel["requestedRange"] {
  const from = parseDate(input.from);
  const to = parseDate(input.to);
  const hasCustomFrom = typeof input.from === "string" && input.from.trim().length > 0;
  const hasCustomTo = typeof input.to === "string" && input.to.trim().length > 0;
  if (hasCustomFrom || hasCustomTo) {
    if (!from) throw new Error(`Invalid KPI range.from: ${input.from ?? "missing"}`);
    if (!to) throw new Error(`Invalid KPI range.to: ${input.to ?? "missing"}`);
    if (from > to) throw new Error(`Invalid KPI range: ${from} is after ${to}`);
    return { key: "custom", from, to };
  }

  const key = input.range && input.range in RANGE_DAYS
    ? (input.range as MetricKpiRangeKey)
    : null;
  if (!key) return null;

  // Collectors persist complete provider days (default: yesterday). Ending the
  // preset on today would manufacture a permanently missing day and mark every
  // otherwise complete additive KPI as partial.
  const end = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  ) - DAY_MS;
  const start = end - (RANGE_DAYS[key] - 1) * DAY_MS;
  return {
    key,
    from: isoDay(new Date(start)),
    to: isoDay(new Date(end)),
  };
}

function utcDay(value: string): number {
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

export function resolvePreviousMetricKpiRange(
  range: NonNullable<MetricKpiReadModel["requestedRange"]>,
): { from: string; to: string } {
  const from = utcDay(range.from);
  const to = utcDay(range.to);
  const days = Math.max(1, Math.round((to - from) / DAY_MS) + 1);
  const previousTo = from - DAY_MS;
  const previousFrom = previousTo - (days - 1) * DAY_MS;
  return {
    from: isoDay(new Date(previousFrom)),
    to: isoDay(new Date(previousTo)),
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
    case "account_currency":
      return `${formatNumber(value)} moneda cuenta`;
    case "currency":
      return new Intl.NumberFormat("es-ES", {
        currency: "EUR",
        maximumFractionDigits: 0,
        style: "currency",
      }).format(value);
    case "USD":
      return new Intl.NumberFormat("es-ES", {
        currency: "USD",
        maximumFractionDigits: 2,
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

export function summarizeMetricKpiReadModelQuality(
  values: MetricKpiReadModelValue[],
  run?: MetricKpiRunRow | null,
): MetricKpiReadModelSummary {
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
  else if (
    counts.demo > 0 &&
    counts.ok === 0 &&
    counts.partial === 0 &&
    counts.missing === 0
  ) qualityStatus = "demo";
  // Demo mixed with real/unknown data cannot inherit `ok`: the summary is not
  // fully production-backed even when every non-demo row is healthy.
  else if (counts.demo > 0) qualityStatus = "partial";
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
    summary: summarizeMetricKpiReadModelQuality([]),
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
    label: canonicalMetricKpiLabel({
      kpiId: row.kpiId,
      label: row.label,
      source: row.source,
      metricName: row.metricName,
    }),
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
    comparison: null,
  };
}

function formatDeltaNumber(value: number): string {
  const abs = Math.abs(value);
  const formatted = new Intl.NumberFormat("es-ES", {
    maximumFractionDigits: abs < 10 && !Number.isInteger(abs) ? 1 : 0,
  }).format(abs);
  return `${value > 0 ? "+" : value < 0 ? "-" : ""}${formatted}`;
}

function formatRelativeDelta(value: number): string {
  const pct = value * 100;
  const abs = Math.abs(pct);
  const formatted = new Intl.NumberFormat("es-ES", {
    maximumFractionDigits: abs < 10 ? 1 : 0,
  }).format(abs);
  return `${pct > 0 ? "+" : pct < 0 ? "-" : ""}${formatted}%`;
}

function lowerIsBetter(value: MetricKpiReadModelValue): boolean {
  const haystack = normalizeComparable(
    `${value.kpiId} ${value.label} ${value.metricName ?? ""} ${value.unit ?? ""}`,
  );
  return /\b(cac|cpa|cpc|cpl|cost|coste|position|posicion|lost|perdida|bounce|rebote|lcp|cls|inp|latency|latencia)\b/.test(haystack);
}

function buildComparison(
  current: MetricKpiReadModelValue,
  previous: MetricKpiReadModelValue | undefined,
  previousRange: { from: string; to: string },
): MetricKpiComparison | null {
  if (!previous) {
    return {
      previousRange,
      previousValue: null,
      previousDisplayValue: "-",
      absoluteDelta: null,
      relativeDelta: null,
      displayDelta: null,
      direction: null,
      sentiment: null,
    };
  }

  const currentValue = current.value;
  const previousValue = previous.value;
  const hasDelta =
    currentValue != null &&
    previousValue != null &&
    Number.isFinite(currentValue) &&
    Number.isFinite(previousValue);
  if (!hasDelta) {
    return {
      previousRange,
      previousValue,
      previousDisplayValue: previous.displayValue,
      absoluteDelta: null,
      relativeDelta: null,
      displayDelta: null,
      direction: null,
      sentiment: null,
    };
  }

  const absoluteDelta = currentValue - previousValue;
  const relativeDelta = previousValue !== 0
    ? absoluteDelta / Math.abs(previousValue)
    : null;
  const direction = Math.abs(absoluteDelta) < 1e-9
    ? "flat"
    : absoluteDelta > 0
      ? "up"
      : "down";
  const sentiment = direction === "flat"
    ? "neutral"
    : lowerIsBetter(current)
      ? direction === "down" ? "positive" : "negative"
      : direction === "up" ? "positive" : "negative";
  const displayDelta = current.unit === "%"
    ? `${formatDeltaNumber(absoluteDelta)} pp`
    : relativeDelta != null
      ? formatRelativeDelta(relativeDelta)
      : formatDeltaNumber(absoluteDelta);

  return {
    previousRange,
    previousValue,
    previousDisplayValue: previous.displayValue,
    absoluteDelta,
    relativeDelta,
    displayDelta,
    direction,
    sentiment,
  };
}

export function attachMetricKpiComparisons(
  values: MetricKpiReadModelValue[],
  previousValues: MetricKpiReadModelValue[],
  previousRange: { from: string; to: string },
): MetricKpiReadModelValue[] {
  const previousByKpi = new Map(previousValues.map((value) => [value.kpiId, value]));
  return values.map((value) => ({
    ...value,
    // `latest` is present state as of the computation day, not a flow attached
    // to either period. Comparing two cached range runs would therefore mix
    // observation dates (or compare the same stock twice) and label that delta
    // as period-over-period. Suppress it, including custom formulas that depend
    // on a latest reference; additive/rate formulas keep normal comparisons.
    comparison: usesCurrentStateObservation(value)
      ? null
      : buildComparison(value, previousByKpi.get(value.kpiId), previousRange),
  }));
}

function usesCurrentStateObservation(value: MetricKpiReadModelValue): boolean {
  if (
    value.source
    && value.metricName
    && aggFor(value.source, value.metricName) === "latest"
  ) {
    return true;
  }
  return (value.inputRefs ?? []).some((ref) => {
    const source = typeof ref.source === "string" ? ref.source : null;
    const metric = typeof ref.metricName === "string" ? ref.metricName : null;
    return Boolean(source && metric && aggFor(source, metric) === "latest");
  });
}

function normalizeComparable(value?: string | null): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_\-.]+/g, " ")
    .trim()
    .toLowerCase();
}

function preferPopulated(values: MetricKpiReadModelValue[]): MetricKpiReadModelValue | null {
  return values.find((value) => value.value != null) ?? values[0] ?? null;
}

const QUALIFIED_NORTH_STAR_PATTERN = /cualific|qualif|\bsql\b/;

function northStarMatchesKpi(label: string, kpi: MetricKpiReadModelValue): boolean {
  const haystack = normalizeComparable(`${kpi.kpiId} ${kpi.label} ${kpi.source ?? ""} ${kpi.metricName ?? ""}`);
  // A qualifier is part of the business outcome, not decorative copy. Never
  // satisfy "qualified meetings/SQL" with a generic appointments counter.
  if (
    QUALIFIED_NORTH_STAR_PATTERN.test(label) &&
    !QUALIFIED_NORTH_STAR_PATTERN.test(haystack)
  ) return false;
  if (/meeting|reunion|cita|appointment/.test(label)) {
    return /meeting|reunion|cita|appointment/.test(haystack);
  }
  if (/lead|contact|cualific|qualif|\bsql\b/.test(label)) {
    return /lead|contact|cualific|qualif|\bsql\b/.test(haystack);
  }
  if (/deal|opportunit|oportunidad|proposal|propuesta/.test(label)) {
    return /deal|opportunit|oportunidad|proposal|propuesta/.test(haystack);
  }
  if (/revenue|gmv|venta|sales|ingreso/.test(label)) {
    return /revenue|gmv|venta|sales|ingreso|value/.test(haystack);
  }
  if (/activation|activacion|activated/.test(label)) {
    return /activation|activacion|activated/.test(haystack);
  }
  return false;
}

export function selectNorthStarKpi(
  values: MetricKpiReadModelValue[],
  northStar?: MetricKpiNorthStarHint | null,
): MetricKpiReadModelValue | null {
  const ref = normalizeComparable(northStar?.kpiRef);
  const label = normalizeComparable(northStar?.label);

  if (ref) {
    const explicit = values.filter((value) =>
      [value.kpiId, value.label, value.metricName, `${value.source ?? ""}.${value.metricName ?? ""}`]
        .some((candidate) => normalizeComparable(candidate) === ref),
    );
    const match = preferPopulated(explicit);
    if (match) return match;
  }

  if (label) {
    const exact = preferPopulated(values.filter((value) => normalizeComparable(value.label) === label));
    if (exact) return exact;
    return preferPopulated(values.filter((value) => northStarMatchesKpi(label, value)));
  }

  return values.find((value) => value.dashboardBlock === "overview" && value.value != null)
    ?? values.find((value) => value.value != null)
    ?? values.find((value) => value.dashboardBlock === "overview")
    ?? null;
}

function toStageRollupInput(row: MetricStageRollupRow): MetricStageRollupReadInput {
  return {
    id: row.id,
    mapId: row.mapId,
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
  definitionVersion = METRIC_KPI_DEFINITION_VERSION,
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
    definitionVersion,
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
  const dashboard = await getDashboardDefinition(slug);
  const definitionVersion = composeMetricKpiDefinitionVersion(
    METRIC_KPI_DEFINITION_VERSION,
    dashboard.version,
  );
  const run = opts.runId
    ? null
    : requestedRange
      ? await findMetricKpiRunForRange(slug, {
        from: requestedRange.from,
        to: requestedRange.to,
        statuses: ["ok"],
        definitionVersion,
      })
      : null;
  const stageRollups = await getStageRollupsForReadModel(
    slug,
    requestedRange,
    opts.runId ?? run?.id ?? null,
    definitionVersion,
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
    definitionVersion,
    runId: opts.runId ?? run?.id,
    surface: opts.surface ?? undefined,
  });
  let values = result.values.map(toMetricKpiReadModelValue);

  if (requestedRange && !opts.runId) {
    const previousRange = resolvePreviousMetricKpiRange(requestedRange);
    const previousRun = await findMetricKpiRunForRange(slug, {
      from: previousRange.from,
      to: previousRange.to,
      statuses: ["ok"],
      definitionVersion,
    });
    if (previousRun) {
      const previousResult = await getMetricKpiValues(slug, {
        dashboardBlock: opts.dashboardBlock ?? undefined,
        runId: previousRun.id,
        surface: opts.surface ?? undefined,
      });
      values = attachMetricKpiComparisons(
        values,
        previousResult.values.map(toMetricKpiReadModelValue),
        previousRange,
      );
    }
  }

  return {
    configured: result.configured,
    slug,
    requestedRange,
    run: result.run ? toRun(result.run) : null,
    summary: summarizeMetricKpiReadModelQuality(values, result.run),
    values,
    northStar: selectNorthStarKpi(values, opts.northStar),
    stageRollups,
  };
}

export async function hasMetricKpiSnapshotUpdatesAfter(
  slug: string,
  range: { from: string; to: string },
  since: Date | string | null | undefined,
  options: {
    observationAsOf?: string;
    latestMetricNames?: ReadonlyArray<string>;
  } = {},
): Promise<boolean> {
  const sinceDate = dateValue(since);
  if (!hasDatabase || !sinceDate) return false;
  const observationAsOf = options.observationAsOf
    ?? new Date().toISOString().slice(0, 10);
  if (!parseDate(observationAsOf)) {
    throw new RangeError(`Invalid KPI snapshot observationAsOf: ${observationAsOf}`);
  }
  const latestMetricNames = [...new Set(options.latestMetricNames ?? [
    ...latestMetricNamesForEvaluation(METRIC_KPI_DEFINITIONS, []),
    ...latestMetricNamesForSources(),
  ])];
  const flowWindow = and(
    gte(metricSnapshots.metricDate, range.from),
    lte(metricSnapshots.metricDate, range.to),
  );
  const latestWindow = latestMetricNames.length
    ? and(
      inArray(metricSnapshots.metricName, latestMetricNames),
      lte(metricSnapshots.metricDate, observationAsOf),
    )
    : undefined;

  const database = getDb();
  const rows = await database
    .select({ count: dsql<number>`count(*)` })
    .from(metricSnapshots)
    .where(
      and(
        eq(metricSnapshots.slug, slug),
        latestWindow ? or(flowWindow, latestWindow) : flowWindow,
        gt(metricSnapshots.updatedAt, sinceDate),
      ),
    );

  return Number(rows[0]?.count ?? 0) > 0;
}

function shouldAutoComputeReadModel(args: {
  model: MetricKpiReadModel;
  opts: MetricKpiReadThroughOptions;
  snapshotsChanged: boolean;
  observationDayChanged: boolean;
}): boolean {
  if (args.opts.autoCompute === false) return false;
  if (args.opts.runId) return false;
  if (!args.model.requestedRange) return false;
  if (!args.model.run) return true;
  return args.snapshotsChanged || args.observationDayChanged;
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
  const now = opts.now ?? new Date();
  const observationAsOf = now.toISOString().slice(0, 10);

  const model = await read(slug, opts);
  const snapshotsChanged =
    model.requestedRange && model.run
      ? await hasSnapshotUpdatesAfter(
        slug,
        { from: model.requestedRange.from, to: model.requestedRange.to },
        model.run.finishedAt ?? model.run.startedAt,
        { observationAsOf },
      )
      : false;
  const runStartedAt = model.run ? dateValue(model.run.startedAt) : null;
  const observationDayChanged = Boolean(
    model.run
    && (!runStartedAt
      || runStartedAt.toISOString().slice(0, 10) !== observationAsOf),
  );

  let current = model;
  if (shouldAutoComputeReadModel({
    model,
    opts,
    snapshotsChanged,
    observationDayChanged,
  })) {
    const range = model.requestedRange;
    if (!range) return model;
    const result = await run({
      slug,
      range: { from: range.from, to: range.to },
      trigger: opts.trigger?.trim() || "dashboard:read-through",
      force: snapshotsChanged || observationDayChanged,
      now,
    });

    if (!result.ok) return model;
    current = await readAfterAutoCompute({ read, slug, opts, result });
  }

  // Custom formulas are expected to compare like built-in KPIs. After a new
  // dashboard version, the previous-period run necessarily has the old cache
  // key; compute that one range lazily so the first fresh custom KPI does not
  // remain permanently comparison-less.
  const needsCustomComparison =
    opts.autoCompute !== false &&
    !opts.runId &&
    current.run != null &&
    current.requestedRange != null &&
    current.values.some(
      (value) =>
        value.kpiId.startsWith("custom.")
        && value.comparison === null
        && !usesCurrentStateObservation(value),
    );
  if (!needsCustomComparison || !current.requestedRange) return current;

  const previousRange = resolvePreviousMetricKpiRange(current.requestedRange);
  const previousResult = await run({
    slug,
    range: previousRange,
    trigger: `${opts.trigger?.trim() || "dashboard:read-through"}:comparison`,
    force: false,
    now,
  });
  if (!previousResult.ok) return current;
  return read(slug, opts);
}
