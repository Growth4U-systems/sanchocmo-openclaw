import crypto from "crypto";
import { and, eq, gte, inArray, lte, sql as drizzleSql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/db/drizzle";
import { metricKpiRuns, metricKpiValues } from "@/db/schema";
import { getMetricDefinition } from "@/lib/metrics/definitions";
import type { MetricKpiValuePayload } from "@/lib/metrics/semantic-types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DIMENSION_KEY_RE = /^[a-z][a-z0-9_]{0,63}$/;

const KPI_STORAGE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "metric_kpi_runs" ("id" text PRIMARY KEY NOT NULL, "slug" text NOT NULL, "range_start" text NOT NULL, "range_end" text NOT NULL, "status" text DEFAULT 'running' NOT NULL, "trigger" text DEFAULT 'manual' NOT NULL, "definition_version" integer, "source_snapshot_max_date" text, "kpi_count" integer DEFAULT 0 NOT NULL, "warnings" jsonb DEFAULT '[]'::jsonb NOT NULL, "errors" jsonb DEFAULT '[]'::jsonb NOT NULL, "started_at" timestamp DEFAULT now() NOT NULL, "finished_at" timestamp, "created_at" timestamp DEFAULT now() NOT NULL, "updated_at" timestamp DEFAULT now() NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS "metric_kpi_runs_slug_range_idx" ON "metric_kpi_runs" ("slug", "range_start", "range_end")`,
  `CREATE INDEX IF NOT EXISTS "metric_kpi_runs_slug_status_idx" ON "metric_kpi_runs" ("slug", "status")`,
  `CREATE TABLE IF NOT EXISTS "metric_kpi_values" ("id" text PRIMARY KEY NOT NULL, "slug" text NOT NULL, "metric_date" text NOT NULL, "range_start" text NOT NULL, "range_end" text NOT NULL, "grain" text DEFAULT 'range' NOT NULL, "definition_id" text NOT NULL, "family" text NOT NULL, "surface" text, "source" text, "value" real, "value_text" text, "format" text DEFAULT 'number' NOT NULL, "calculation_kind" text DEFAULT 'direct' NOT NULL, "dimensions" jsonb, "dims_key" text DEFAULT '' NOT NULL, "delta_value" real, "delta_pct" real, "trend_points" jsonb, "quality_status" text DEFAULT 'missing' NOT NULL, "confidence" real, "input_refs" jsonb DEFAULT '[]'::jsonb NOT NULL, "warnings" jsonb DEFAULT '[]'::jsonb NOT NULL, "run_id" text REFERENCES "metric_kpi_runs"("id") ON DELETE SET NULL, "created_at" timestamp DEFAULT now() NOT NULL, "updated_at" timestamp DEFAULT now() NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS "metric_kpi_values_slug_date_idx" ON "metric_kpi_values" ("slug", "metric_date")`,
  `CREATE INDEX IF NOT EXISTS "metric_kpi_values_slug_definition_date_idx" ON "metric_kpi_values" ("slug", "definition_id", "metric_date")`,
  `CREATE INDEX IF NOT EXISTS "metric_kpi_values_slug_surface_date_idx" ON "metric_kpi_values" ("slug", "surface", "metric_date")`,
  `CREATE INDEX IF NOT EXISTS "metric_kpi_values_run_idx" ON "metric_kpi_values" ("run_id")`,
];

let ensurePromise: Promise<void> | null = null;

export async function ensureMetricKpiStorage(): Promise<void> {
  if (!hasDatabase) return;
  if (!ensurePromise) {
    ensurePromise = (async () => {
      const database = getDb();
      for (const statement of KPI_STORAGE_STATEMENTS) {
        await database.execute(drizzleSql.raw(statement));
      }
    })();
  }
  await ensurePromise;
}

export function metricKpiStorageConfigured(): boolean {
  return hasDatabase;
}

export function stableSemanticId(...parts: Array<string | number | null | undefined>): string {
  return crypto
    .createHash("sha1")
    .update(parts.map((part) => (part == null ? "" : String(part))).join("\x1f"))
    .digest("hex")
    .slice(0, 24);
}

export interface CanonicalMetricDimensions {
  dimsKey: string;
  dimensions: Record<string, string> | null;
}

export function canonicalMetricDimensions(dimensions?: Record<string, unknown> | null): CanonicalMetricDimensions {
  if (!dimensions || typeof dimensions !== "object" || Array.isArray(dimensions)) {
    return { dimsKey: "", dimensions: null };
  }

  const entries: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(dimensions)) {
    if (!DIMENSION_KEY_RE.test(key)) {
      throw new Error(`Invalid metric dimension key: ${key}`);
    }
    if (value == null || value === "") continue;
    if (typeof value === "object") {
      throw new Error(`Metric dimension "${key}" must be a scalar value`);
    }
    entries.push([key, String(value)]);
  }
  entries.sort(([a], [b]) => a.localeCompare(b));
  if (!entries.length) return { dimsKey: "", dimensions: null };
  return { dimsKey: JSON.stringify(entries), dimensions: Object.fromEntries(entries) };
}

export function metricKpiValueId(input: {
  slug: string;
  definitionId: string;
  rangeStart: string;
  rangeEnd: string;
  grain?: string | null;
  dimsKey?: string | null;
}): string {
  return `mkv_${stableSemanticId(input.slug, input.definitionId, input.rangeStart, input.rangeEnd, input.grain ?? "range", input.dimsKey ?? "")}`;
}

export function metricKpiRunId(input: {
  slug: string;
  rangeStart: string;
  rangeEnd: string;
  trigger?: string | null;
  startedAt?: string | Date | null;
}): string {
  const startedAt = input.startedAt instanceof Date ? input.startedAt.toISOString() : input.startedAt ?? new Date().toISOString();
  return `mkr_${stableSemanticId(input.slug, input.rangeStart, input.rangeEnd, input.trigger ?? "manual", startedAt)}`;
}

export type MetricKpiRunStatus = "running" | "ok" | "partial" | "error";

export interface StartMetricKpiRunInput {
  slug: string;
  rangeStart: string;
  rangeEnd: string;
  trigger?: string;
  definitionVersion?: number | null;
  sourceSnapshotMaxDate?: string | null;
}

export interface StartMetricKpiRunResult {
  configured: boolean;
  id: string | null;
}

function assertDate(value: string, field: string): void {
  if (!DATE_RE.test(value)) throw new Error(`${field} must be YYYY-MM-DD`);
}

export async function startMetricKpiRun(input: StartMetricKpiRunInput): Promise<StartMetricKpiRunResult> {
  assertDate(input.rangeStart, "rangeStart");
  assertDate(input.rangeEnd, "rangeEnd");
  if (!hasDatabase) return { configured: false, id: null };
  await ensureMetricKpiStorage();

  const now = new Date();
  const id = metricKpiRunId({ ...input, startedAt: now });
  await getDb().insert(metricKpiRuns).values({
    id,
    slug: input.slug,
    rangeStart: input.rangeStart,
    rangeEnd: input.rangeEnd,
    status: "running",
    trigger: input.trigger ?? "manual",
    definitionVersion: input.definitionVersion ?? null,
    sourceSnapshotMaxDate: input.sourceSnapshotMaxDate ?? null,
    startedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  return { configured: true, id };
}

export async function finishMetricKpiRun(
  slug: string,
  runId: string,
  patch: { status: MetricKpiRunStatus; kpiCount?: number; warnings?: string[]; errors?: string[] },
): Promise<void> {
  if (!hasDatabase) return;
  await ensureMetricKpiStorage();
  await getDb()
    .update(metricKpiRuns)
    .set({
      status: patch.status,
      kpiCount: patch.kpiCount ?? 0,
      warnings: patch.warnings ?? [],
      errors: patch.errors ?? [],
      finishedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(metricKpiRuns.slug, slug), eq(metricKpiRuns.id, runId)));
}

type MetricKpiValueRow = typeof metricKpiValues.$inferInsert;

function rowFromPayload(slug: string, payload: MetricKpiValuePayload, runId?: string | null): MetricKpiValueRow {
  assertDate(payload.metricDate, "metricDate");
  assertDate(payload.rangeStart, "rangeStart");
  assertDate(payload.rangeEnd, "rangeEnd");

  const definition = getMetricDefinition(payload.definitionId);
  if (!definition) throw new Error(`Unknown metric definition: ${payload.definitionId}`);

  const { dimsKey, dimensions } = canonicalMetricDimensions(payload.dimensions);
  const grain = payload.grain ?? "range";
  const now = new Date();
  return {
    id: metricKpiValueId({
      slug,
      definitionId: payload.definitionId,
      rangeStart: payload.rangeStart,
      rangeEnd: payload.rangeEnd,
      grain,
      dimsKey,
    }),
    slug,
    metricDate: payload.metricDate,
    rangeStart: payload.rangeStart,
    rangeEnd: payload.rangeEnd,
    grain,
    definitionId: payload.definitionId,
    family: definition.family,
    surface: definition.surface ?? null,
    source: definition.sources[0]?.source ?? null,
    value: payload.value ?? null,
    valueText: payload.valueText ?? null,
    format: definition.format,
    calculationKind: payload.calculationKind ?? definition.calculationKind,
    dimensions,
    dimsKey,
    deltaValue: payload.deltaValue ?? null,
    deltaPct: payload.deltaPct ?? null,
    trendPoints: payload.trendPoints ?? null,
    qualityStatus: payload.qualityStatus ?? "missing",
    confidence: payload.confidence ?? null,
    inputRefs: payload.inputRefs ?? [],
    warnings: payload.warnings ?? [],
    runId: runId ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

export interface UpsertMetricKpiValuesResult {
  configured: boolean;
  rows: number;
}

export async function upsertMetricKpiValues(
  slug: string,
  values: MetricKpiValuePayload[],
  options: { runId?: string | null } = {},
): Promise<UpsertMetricKpiValuesResult> {
  if (!values.length) return { configured: hasDatabase, rows: 0 };
  const rows = values.map((value) => rowFromPayload(slug, value, options.runId));
  if (!hasDatabase) return { configured: false, rows: 0 };
  await ensureMetricKpiStorage();

  const CHUNK = 250;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    await getDb()
      .insert(metricKpiValues)
      .values(chunk)
      .onConflictDoUpdate({
        target: metricKpiValues.id,
        set: {
          value: drizzleSql`excluded."value"`,
          valueText: drizzleSql`excluded."value_text"`,
          format: drizzleSql`excluded."format"`,
          calculationKind: drizzleSql`excluded."calculation_kind"`,
          dimensions: drizzleSql`excluded."dimensions"`,
          dimsKey: drizzleSql`excluded."dims_key"`,
          deltaValue: drizzleSql`excluded."delta_value"`,
          deltaPct: drizzleSql`excluded."delta_pct"`,
          trendPoints: drizzleSql`excluded."trend_points"`,
          qualityStatus: drizzleSql`excluded."quality_status"`,
          confidence: drizzleSql`excluded."confidence"`,
          inputRefs: drizzleSql`excluded."input_refs"`,
          warnings: drizzleSql`excluded."warnings"`,
          runId: drizzleSql`excluded."run_id"`,
          updatedAt: new Date(),
        },
      });
  }
  return { configured: true, rows: rows.length };
}

export interface MetricKpiValuesQuery {
  definitionIds?: string[];
  from?: string;
  to?: string;
  surface?: string;
  family?: string;
}

export interface MetricKpiValuesResult {
  configured: boolean;
  values: Array<typeof metricKpiValues.$inferSelect>;
}

export async function getMetricKpiValues(slug: string, query: MetricKpiValuesQuery = {}): Promise<MetricKpiValuesResult> {
  if (!hasDatabase) return { configured: false, values: [] };
  await ensureMetricKpiStorage();
  const conditions = [eq(metricKpiValues.slug, slug)];
  if (query.definitionIds?.length) conditions.push(inArray(metricKpiValues.definitionId, query.definitionIds));
  if (query.from) conditions.push(gte(metricKpiValues.metricDate, query.from));
  if (query.to) conditions.push(lte(metricKpiValues.metricDate, query.to));
  if (query.surface) conditions.push(eq(metricKpiValues.surface, query.surface));
  if (query.family) conditions.push(eq(metricKpiValues.family, query.family));
  const rows = await getDb()
    .select()
    .from(metricKpiValues)
    .where(and(...conditions))
    .orderBy(metricKpiValues.metricDate);
  return { configured: true, values: rows };
}
