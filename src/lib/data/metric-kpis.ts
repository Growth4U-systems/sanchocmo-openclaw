import {
  and,
  desc,
  eq,
  gte,
  inArray,
  lte,
  sql as drizzleSql,
} from "drizzle-orm";
import { getDb, hasDatabase } from "@/db/drizzle";
import { metricKpiRuns, metricKpiValues, metricSnapshots } from "@/db/schema";
import { getDashboardDefinition } from "@/lib/data/metric-dashboard";
import {
  persistMetricStageRollupsForSnapshots,
  replaceStageRollupAvailabilityKpi,
} from "@/lib/data/metric-stage-rollups";
import { ensureMetricsStorage, stableId } from "@/lib/data/metrics-snapshots";
import {
  METRIC_KPI_DEFINITIONS,
  METRIC_KPI_DEFINITION_VERSION,
  computeSemanticKpisFromSnapshots,
  summarizeKpiQuality,
  type ComputedMetricKpiValue,
  type MetricKpiDashboardBlock,
  type MetricKpiDefinition,
  type MetricKpiSnapshotInput,
} from "@/lib/metrics/semantic-kpis";
import type { SurfaceKey } from "@/lib/metrics/surfaces";
import type { CustomMetric } from "@/lib/metrics/dashboard-schema";
import { computeCustomMetricKpisFromSnapshots } from "@/lib/metrics/custom-metric-kpis";
import { composeMetricKpiDefinitionVersion } from "@/lib/metrics/kpi-definition-version";
import { aggFor } from "@/lib/metrics/aggregation";
import { parseMetricFormula } from "@/lib/metrics/formula";

/**
 * Semantic KPI read model (SAN-354).
 *
 * Raw `metric_snapshots` stay the source of truth. This layer computes direct,
 * dashboard-ready KPIs with quality/provenance and persists them in
 * `metric_kpi_runs` + `metric_kpi_values`. Versioned dashboard custom formulas
 * are evaluated here too; attribution and revenue stitching remain future
 * layers.
 */

export type MetricKpiRunRow = typeof metricKpiRuns.$inferSelect;
export type MetricKpiValueRow = typeof metricKpiValues.$inferSelect;
export type MetricKpiRunStatus = "running" | "ok" | "error";

export interface ComputeMetricKpisOptions {
  from?: string;
  to?: string;
  trigger?: string;
  definitionVersion?: number;
  dashboardVersion?: number;
  definitions?: MetricKpiDefinition[];
  customMetrics?: CustomMetric[];
  /** UTC boundary for point-in-time (`latest`) observations. */
  observationAsOf?: string;
}

export interface ComputeMetricKpisResult {
  configured: boolean;
  run: MetricKpiRunRow | null;
  values: ComputedMetricKpiValue[];
}

export interface MetricKpiReadOptions {
  dashboardBlock?: MetricKpiDashboardBlock;
  surface?: SurfaceKey;
  runId?: string;
  definitionVersion?: number;
}

export interface MetricKpiRunLookupOptions {
  from: string;
  to: string;
  statuses?: MetricKpiRunStatus[];
  definitionVersion?: number;
}

export interface MetricKpiReadResult {
  configured: boolean;
  run: MetricKpiRunRow | null;
  values: MetricKpiValueRow[];
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isCalendarDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

const ENSURE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "metric_kpi_runs" ("id" text PRIMARY KEY NOT NULL, "slug" text NOT NULL, "range_from" text NOT NULL, "range_to" text NOT NULL, "status" text DEFAULT 'running' NOT NULL, "trigger" text DEFAULT 'agent' NOT NULL, "definition_version" integer, "values_count" integer DEFAULT 0 NOT NULL, "quality_summary" jsonb DEFAULT '{}'::jsonb NOT NULL, "errors" jsonb DEFAULT '[]'::jsonb NOT NULL, "started_at" timestamp DEFAULT now() NOT NULL, "finished_at" timestamp, "created_at" timestamp DEFAULT now() NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS "metric_kpi_runs_slug_range_idx" ON "metric_kpi_runs" ("slug", "range_from", "range_to")`,
  `CREATE INDEX IF NOT EXISTS "metric_kpi_runs_slug_status_idx" ON "metric_kpi_runs" ("slug", "status")`,
  `CREATE TABLE IF NOT EXISTS "metric_kpi_values" ("id" text PRIMARY KEY NOT NULL, "run_id" text NOT NULL REFERENCES "metric_kpi_runs"("id") ON DELETE CASCADE, "slug" text NOT NULL, "kpi_id" text NOT NULL, "label" text NOT NULL, "dashboard_block" text NOT NULL, "surface" text, "source" text, "metric_name" text, "value" real, "value_text" text, "unit" text, "quality_status" text NOT NULL, "provenance_label" text NOT NULL, "input_refs" jsonb DEFAULT '[]'::jsonb NOT NULL, "source_coverage" real DEFAULT 0 NOT NULL, "range_from" text NOT NULL, "range_to" text NOT NULL, "definition_version" integer, "computed_at" timestamp DEFAULT now() NOT NULL, "created_at" timestamp DEFAULT now() NOT NULL, "updated_at" timestamp DEFAULT now() NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS "metric_kpi_values_run_idx" ON "metric_kpi_values" ("run_id")`,
  `CREATE INDEX IF NOT EXISTS "metric_kpi_values_slug_kpi_idx" ON "metric_kpi_values" ("slug", "kpi_id")`,
  `CREATE INDEX IF NOT EXISTS "metric_kpi_values_slug_block_idx" ON "metric_kpi_values" ("slug", "dashboard_block")`,
  `CREATE INDEX IF NOT EXISTS "metric_kpi_values_slug_surface_idx" ON "metric_kpi_values" ("slug", "surface")`,
];

let ensurePromise: Promise<void> | null = null;

export async function ensureMetricKpiStorage(): Promise<void> {
  if (!hasDatabase) return;
  await ensureMetricsStorage();
  if (!ensurePromise) {
    ensurePromise = (async () => {
      const database = getDb();
      for (const statement of ENSURE_STATEMENTS) {
        await database.execute(drizzleSql.raw(statement));
      }
    })();
  }
  await ensurePromise;
}

export function metricKpiStorageConfigured(): boolean {
  return hasDatabase;
}

export function defaultMetricKpiRange(now = new Date()): {
  from: string;
  to: string;
} {
  const end = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  ) - 86_400_000;
  const start = end - 29 * 86_400_000;
  return {
    from: new Date(start).toISOString().slice(0, 10),
    to: new Date(end).toISOString().slice(0, 10),
  };
}

function normalizeRange(opts: ComputeMetricKpisOptions): {
  from: string;
  to: string;
} {
  const fallback = defaultMetricKpiRange();
  const rawFrom = opts.from?.trim();
  const rawTo = opts.to?.trim();
  if (rawFrom && !isCalendarDate(rawFrom)) {
    throw new Error(`Invalid metric KPI range.from: ${rawFrom}`);
  }
  if (rawTo && !isCalendarDate(rawTo)) {
    throw new Error(`Invalid metric KPI range.to: ${rawTo}`);
  }
  const from = rawFrom || fallback.from;
  const to = rawTo || fallback.to;
  if (from > to)
    throw new Error(`Invalid metric KPI range: ${from} is after ${to}`);
  return { from, to };
}

function observationAsOfDay(value: string | undefined, now = new Date()): string {
  const day = value?.trim() || now.toISOString().slice(0, 10);
  if (!isCalendarDate(day)) {
    throw new Error(`Invalid metric KPI observationAsOf: ${day}`);
  }
  return day;
}

export function latestMetricNamesForEvaluation(
  definitions: MetricKpiDefinition[],
  customMetrics: CustomMetric[],
): string[] {
  const names = new Set<string>();
  for (const definition of definitions) {
    if ((definition.agg ?? aggFor(definition.source, definition.metric)) !== "latest") continue;
    names.add(definition.metric);
    for (const alias of definition.metricAliases ?? []) names.add(alias);
  }
  for (const customMetric of customMetrics) {
    const parsed = parseMetricFormula(customMetric.formula);
    if (!parsed.ok) continue;
    for (const reference of parsed.references) {
      if (aggFor(reference.source, reference.metric) === "latest") {
        names.add(reference.metric);
      }
    }
  }
  return [...names];
}

function errorPayload(error: unknown): Array<Record<string, unknown>> {
  return [
    {
      message: error instanceof Error ? error.message : String(error),
      at: new Date().toISOString(),
    },
  ];
}

function toInputRefs(
  value: ComputedMetricKpiValue,
): Array<Record<string, unknown>> {
  return value.inputRefs.map((ref) => ({
    id: ref.id,
    source: ref.source,
    metricName: ref.metricName,
    metricDate: ref.metricDate,
    dimensions: ref.dimensions,
  }));
}

export async function computeMetricKpis(
  slug: string,
  opts: ComputeMetricKpisOptions = {},
): Promise<ComputeMetricKpisResult> {
  if (!hasDatabase) return { configured: false, run: null, values: [] };
  if (!slug) throw new Error("slug is required to compute metric KPIs");
  const range = normalizeRange(opts);
  const observationAsOf = observationAsOfDay(opts.observationAsOf);
  const database = getDb();
  await ensureMetricKpiStorage();

  const startedAt = new Date();
  let dashboardVersion = opts.dashboardVersion;
  let customMetrics = opts.customMetrics;
  if (dashboardVersion == null || customMetrics == null) {
    const dashboard = await getDashboardDefinition(slug);
    dashboardVersion ??= dashboard.version;
    customMetrics ??= dashboard.definition?.customMetrics ?? [];
  }
  const definitionVersion =
    opts.definitionVersion ?? composeMetricKpiDefinitionVersion(
      METRIC_KPI_DEFINITION_VERSION,
      dashboardVersion,
    );
  const runId = `mkpir_${stableId(slug, range.from, range.to, startedAt.toISOString(), Math.random())}`;

  await database.insert(metricKpiRuns).values({
    id: runId,
    slug,
    rangeFrom: range.from,
    rangeTo: range.to,
    status: "running",
    trigger: opts.trigger ?? "agent",
    definitionVersion,
    valuesCount: 0,
    qualitySummary: {},
    errors: [],
    startedAt,
    createdAt: startedAt,
  });

  try {
    const definitions = opts.definitions ?? METRIC_KPI_DEFINITIONS;
    const latestMetricNames = latestMetricNamesForEvaluation(
      definitions,
      customMetrics,
    );
    const flowRowsQuery = database
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
      );
    const latestRowsQuery = latestMetricNames.length
      ? database
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
        .where(and(
          eq(metricSnapshots.slug, slug),
          inArray(metricSnapshots.metricName, latestMetricNames),
          lte(metricSnapshots.metricDate, observationAsOf),
        ))
      : Promise.resolve([]);
    const [flowRows, latestRows] = await Promise.all([flowRowsQuery, latestRowsQuery]);
    const rawRows = [...new Map(
      [...flowRows, ...latestRows].map((row) => [row.id, row]),
    ).values()];

    const snapshots: MetricKpiSnapshotInput[] = rawRows.map((row) => ({
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
    let values = computeSemanticKpisFromSnapshots(
      snapshots,
      range,
      definitions,
      { observationAsOf },
    );
    values = [
      ...values,
      ...computeCustomMetricKpisFromSnapshots(
        snapshots,
        range,
        customMetrics,
        { observationAsOf },
      ),
    ];
    const stageRollups = await persistMetricStageRollupsForSnapshots(slug, {
      runId,
      range,
      snapshots,
      definitionVersion,
    });
    values = replaceStageRollupAvailabilityKpi(values, stageRollups, range);
    const now = new Date();

    if (values.length) {
      await database
        .insert(metricKpiValues)
        .values(
          values.map((value) => ({
            id: `mkpiv_${stableId(runId, value.kpiId)}`,
            runId,
            slug,
            kpiId: value.kpiId,
            label: value.label,
            dashboardBlock: value.dashboardBlock,
            surface: value.surface ?? null,
            source: value.source,
            metricName: value.metricName,
            value: value.value,
            valueText: value.valueText,
            unit: value.unit ?? null,
            qualityStatus: value.qualityStatus,
            provenanceLabel: value.provenanceLabel,
            inputRefs: toInputRefs(value),
            sourceCoverage: value.sourceCoverage,
            rangeFrom: range.from,
            rangeTo: range.to,
            definitionVersion,
            computedAt: now,
            createdAt: now,
            updatedAt: now,
          })),
        )
        .onConflictDoUpdate({
          target: metricKpiValues.id,
          set: {
            label: drizzleSql`excluded."label"`,
            dashboardBlock: drizzleSql`excluded."dashboard_block"`,
            surface: drizzleSql`excluded."surface"`,
            source: drizzleSql`excluded."source"`,
            metricName: drizzleSql`excluded."metric_name"`,
            value: drizzleSql`excluded."value"`,
            valueText: drizzleSql`excluded."value_text"`,
            unit: drizzleSql`excluded."unit"`,
            qualityStatus: drizzleSql`excluded."quality_status"`,
            provenanceLabel: drizzleSql`excluded."provenance_label"`,
            inputRefs: drizzleSql`excluded."input_refs"`,
            sourceCoverage: drizzleSql`excluded."source_coverage"`,
            rangeFrom: drizzleSql`excluded."range_from"`,
            rangeTo: drizzleSql`excluded."range_to"`,
            definitionVersion: drizzleSql`excluded."definition_version"`,
            computedAt: drizzleSql`excluded."computed_at"`,
            updatedAt: now,
          },
        });
    }

    const finishedAt = new Date();
    const qualitySummary = summarizeKpiQuality(values);
    const [run] = await database
      .update(metricKpiRuns)
      .set({
        status: "ok",
        valuesCount: values.length,
        qualitySummary,
        errors: [],
        finishedAt,
      })
      .where(eq(metricKpiRuns.id, runId))
      .returning();

    return { configured: true, run: run ?? null, values };
  } catch (error) {
    await database
      .update(metricKpiRuns)
      .set({
        status: "error",
        errors: errorPayload(error),
        finishedAt: new Date(),
      })
      .where(eq(metricKpiRuns.id, runId));
    throw error;
  }
}

export async function getLatestMetricKpiRun(
  slug: string,
  definitionVersion?: number,
): Promise<MetricKpiRunRow | null> {
  if (!hasDatabase) return null;
  await ensureMetricKpiStorage();
  const conditions = [
    eq(metricKpiRuns.slug, slug),
    eq(metricKpiRuns.status, "ok"),
  ];
  if (typeof definitionVersion === "number") {
    conditions.push(eq(metricKpiRuns.definitionVersion, definitionVersion));
  }
  const [run] = await getDb()
    .select()
    .from(metricKpiRuns)
    .where(and(...conditions))
    .orderBy(desc(metricKpiRuns.startedAt))
    .limit(1);
  return run ?? null;
}

export async function findMetricKpiRunForRange(
  slug: string,
  opts: MetricKpiRunLookupOptions,
): Promise<MetricKpiRunRow | null> {
  if (!hasDatabase) return null;
  if (!slug) throw new Error("slug is required to find metric KPI runs");
  if (!isCalendarDate(opts.from) || !isCalendarDate(opts.to) || opts.from > opts.to) {
    throw new Error(`Invalid metric KPI range: ${opts.from}..${opts.to}`);
  }

  await ensureMetricKpiStorage();
  const conditions = [
    eq(metricKpiRuns.slug, slug),
    eq(metricKpiRuns.rangeFrom, opts.from),
    eq(metricKpiRuns.rangeTo, opts.to),
  ];
  if (typeof opts.definitionVersion === "number") {
    conditions.push(eq(metricKpiRuns.definitionVersion, opts.definitionVersion));
  }
  if (opts.statuses?.length === 1) {
    conditions.push(eq(metricKpiRuns.status, opts.statuses[0]));
  } else if (opts.statuses && opts.statuses.length > 1) {
    conditions.push(inArray(metricKpiRuns.status, opts.statuses));
  }

  const [run] = await getDb()
    .select()
    .from(metricKpiRuns)
    .where(and(...conditions))
    .orderBy(desc(metricKpiRuns.startedAt))
    .limit(1);
  return run ?? null;
}

export async function getMetricKpiValues(
  slug: string,
  opts: MetricKpiReadOptions = {},
): Promise<MetricKpiReadResult> {
  if (!hasDatabase) return { configured: false, run: null, values: [] };
  await ensureMetricKpiStorage();
  const database = getDb();

  let run: MetricKpiRunRow | null = null;
  if (opts.runId) {
    const [row] = await database
      .select()
      .from(metricKpiRuns)
      .where(
        and(eq(metricKpiRuns.slug, slug), eq(metricKpiRuns.id, opts.runId)),
      )
      .limit(1);
    run = row ?? null;
  } else {
    run = await getLatestMetricKpiRun(slug, opts.definitionVersion);
  }
  if (!run) return { configured: true, run: null, values: [] };

  const conditions = [
    eq(metricKpiValues.slug, slug),
    eq(metricKpiValues.runId, run.id),
  ];
  if (opts.dashboardBlock)
    conditions.push(eq(metricKpiValues.dashboardBlock, opts.dashboardBlock));
  if (opts.surface) conditions.push(eq(metricKpiValues.surface, opts.surface));

  const values = await database
    .select()
    .from(metricKpiValues)
    .where(and(...conditions))
    .orderBy(
      metricKpiValues.dashboardBlock,
      metricKpiValues.surface,
      metricKpiValues.kpiId,
    );

  return { configured: true, run, values };
}
