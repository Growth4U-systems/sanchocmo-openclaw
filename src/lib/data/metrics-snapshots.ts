import crypto from "crypto";
import { and, eq, inArray, notInArray, or, sql as drizzleSql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/db/drizzle";
import { metricSnapshots, metricSourceRuns } from "@/db/schema";
import {
  applyMetricQualityMetadata,
  isDemoQualityMetadata,
  isMetricMetadataDimensionKey,
  type MetricQualityMetadata,
} from "@/lib/metrics/provenance";

/**
 * Time-series storage for client metrics (SAN-263 · Métricas v2 PR-1).
 *
 * DB-only time-series storage for client metrics. The collector and score
 * refreshers ingest directly into `metric_snapshots` (one tidy row per
 * slug/date/source/metric/dimensions); historical JSON backfill remains a script,
 * not a runtime dependency. Mirrors the meeting-intelligence-db.ts pattern:
 * guard on `hasDatabase`, lazily `ensureMetricsStorage()`, upsert idempotently.
 */

export interface RawMetric {
  name: string;
  value?: number | string | null;
  date?: string | null;
  dimensions?: Record<string, unknown> | null;
  provenance?: string | null;
  quality?: string | null;
}

export interface SourcePayload {
  status?: string;
  collectedAt?: string | null;
  provenance?: string | null;
  quality?: string | null;
  error?: string | null;
  metrics?: RawMetric[];
  /** Exact provider days authoritatively restated as having no observations. */
  restatedDates?: string[];
  /** Exact provider days this collection attempted (routine or backfill). */
  attemptedDates?: string[];
  /**
   * Exact metric scopes the provider authoritatively queried. Unlike deriving
   * scopes only from returned rows, this can restate a metric to an empty set.
   */
  restatedScopes?: MetricRestatementScopeInput[];
}

export interface DailySnapshotInput {
  slug?: string;
  collectedAt?: string | null;
  provenance?: string | null;
  quality?: string | null;
  sources?: Record<string, SourcePayload>;
}

/**
 * Destructive convergence is valid only when the source says its payload is
 * complete. A partial payload may contain a headline row while an optional
 * dimensional query failed (for example GA4 sessions without channel/device);
 * using that headline scope to delete dimensions would turn an upstream
 * partial failure into silent data loss.
 */
export function canDeleteStaleSourcePayload(
  payload: SourcePayload | null | undefined,
  inheritedQuality?: string | null,
): boolean {
  return String(payload?.quality ?? inheritedQuality ?? "").trim().toLowerCase() !== "partial";
}

export interface IngestResult {
  ok: boolean;
  rows: number;
  sources: string[];
  skipped: string[];
  deleted?: number;
  storage: { configured: boolean };
}

const STORAGE_NOT_CONFIGURED = { configured: false } as const;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const CONNECTED_NO_DATA_STATUS = "connected_no_data" as const;
export const MAX_ATTEMPTED_PROVIDER_DATES = 366;
export const MAX_METRIC_RESTATEMENT_SCOPES = 10_000;

export interface MetricRestatementScopeInput {
  metricDate: string;
  metricName: string;
}

export function isRealMetricDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function resolveMetricDateForIngest(
  metricDate: unknown,
  fallbackDate: unknown,
): string {
  if (!isRealMetricDate(fallbackDate)) {
    throw new RangeError(`Invalid snapshot date: ${String(fallbackDate ?? "missing")}`);
  }
  if (metricDate == null) return fallbackDate;
  if (!isRealMetricDate(metricDate)) {
    throw new RangeError(`Invalid metric date: ${String(metricDate)}`);
  }
  return metricDate;
}

/** Validate bounded, exact provider-day evidence before it reaches the ledger. */
export function normalizeAttemptedProviderDates(value: unknown): string[] {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    throw new RangeError("attemptedDates must be an array of real YYYY-MM-DD dates");
  }
  if (value.length > MAX_ATTEMPTED_PROVIDER_DATES) {
    throw new RangeError(
      `attemptedDates cannot exceed ${MAX_ATTEMPTED_PROVIDER_DATES} dates`,
    );
  }
  if (value.some((date) => !isRealMetricDate(date))) {
    throw new RangeError("attemptedDates must contain only real YYYY-MM-DD dates");
  }
  return [...new Set(value)].sort();
}

/**
 * Restatement scopes are intentionally explicit date+metric pairs. A
 * `restatedMetrics` shorthand would be ambiguous for a multi-day backfill when
 * a provider returns no row for one of the requested days.
 */
export function normalizeMetricRestatementScopeInputs(
  value: unknown,
  attemptedDates: ReadonlyArray<string> = [],
): MetricRestatementScopeInput[] {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    throw new RangeError("restatedScopes must be an array of exact metric scopes");
  }
  if (value.length > MAX_METRIC_RESTATEMENT_SCOPES) {
    throw new RangeError(
      `restatedScopes cannot exceed ${MAX_METRIC_RESTATEMENT_SCOPES} scopes`,
    );
  }
  if (value.length > 0 && attemptedDates.length === 0) {
    throw new RangeError("restatedScopes require exact attemptedDates");
  }
  const attempted = new Set(attemptedDates);
  const deduped = new Map<string, MetricRestatementScopeInput>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new RangeError("restatedScopes entries must contain metricDate and metricName");
    }
    const scope = raw as { metricDate?: unknown; metricName?: unknown };
    const metricName = typeof scope.metricName === "string"
      ? scope.metricName.trim()
      : "";
    if (!isRealMetricDate(scope.metricDate) || !metricName || metricName.length > 200) {
      throw new RangeError("restatedScopes entries need a real metricDate and metricName");
    }
    if (attempted.size && !attempted.has(scope.metricDate)) {
      throw new RangeError("restatedScopes metricDate must be present in attemptedDates");
    }
    const normalized = { metricDate: scope.metricDate, metricName };
    deduped.set(`${normalized.metricDate}\u0000${normalized.metricName}`, normalized);
  }
  return [...deduped.values()].sort((left, right) =>
    left.metricDate.localeCompare(right.metricDate)
    || left.metricName.localeCompare(right.metricName));
}

/**
 * Validate the intentionally narrow destructive no-data contract. Only YALC
 * currently emits it; every date must be explicit and real, and a contradictory
 * payload containing metrics is rejected wholesale.
 */
export function connectedNoDataRestatementDates(
  source: string,
  payload: SourcePayload | null | undefined,
): string[] {
  if (source.trim().toLowerCase() !== "yalc") return [];
  if (payload?.status !== CONNECTED_NO_DATA_STATUS) return [];
  if (!Array.isArray(payload.metrics) || payload.metrics.length !== 0) return [];
  if (!Array.isArray(payload.restatedDates) || payload.restatedDates.length === 0) return [];
  if (payload.restatedDates.some((date) => !isRealMetricDate(date))) return [];
  return [...new Set(payload.restatedDates)].sort();
}

// Keep byte-aligned with src/db/migrations/0011_metric_snapshots.sql and
// 0014_metric_schedule_runs.sql so the runtime ensure (local / no-drizzle-kit
// envs) and the deploy migration agree.
const ENSURE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "metric_snapshots" ("id" text PRIMARY KEY NOT NULL, "slug" text NOT NULL, "metric_date" text NOT NULL, "source" text NOT NULL, "metric_name" text NOT NULL, "value" real, "value_text" text, "dimensions" jsonb, "dims_key" text DEFAULT '' NOT NULL, "grain" text DEFAULT 'day' NOT NULL, "collected_at" timestamp, "ingest_run_id" text, "created_at" timestamp DEFAULT now() NOT NULL, "updated_at" timestamp DEFAULT now() NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS "metric_snapshots_slug_date_idx" ON "metric_snapshots" ("slug", "metric_date")`,
  `CREATE INDEX IF NOT EXISTS "metric_snapshots_slug_source_metric_idx" ON "metric_snapshots" ("slug", "source", "metric_name")`,
  `CREATE INDEX IF NOT EXISTS "metric_snapshots_slug_source_date_idx" ON "metric_snapshots" ("slug", "source", "metric_date")`,
  `CREATE TABLE IF NOT EXISTS "metric_collection_schedule" ("id" text PRIMARY KEY NOT NULL, "slug" text NOT NULL, "source" text NOT NULL, "cadence" text DEFAULT 'daily' NOT NULL, "days_of_week" jsonb DEFAULT '[]'::jsonb NOT NULL, "cron_expr" text, "enabled" boolean DEFAULT true NOT NULL, "created_at" timestamp DEFAULT now() NOT NULL, "updated_at" timestamp DEFAULT now() NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS "metric_collection_schedule_slug_idx" ON "metric_collection_schedule" ("slug")`,
  `CREATE TABLE IF NOT EXISTS "metric_source_runs" ("id" text PRIMARY KEY NOT NULL, "slug" text NOT NULL, "metric_date" text NOT NULL, "source" text NOT NULL, "status" text NOT NULL, "date_basis" text DEFAULT 'collection' NOT NULL, "collected_at" timestamp, "row_count" integer DEFAULT 0 NOT NULL, "deleted_count" integer DEFAULT 0 NOT NULL, "cadence" text, "error" text, "created_at" timestamp DEFAULT now() NOT NULL, "updated_at" timestamp DEFAULT now() NOT NULL)`,
  `ALTER TABLE "metric_source_runs" ADD COLUMN IF NOT EXISTS "date_basis" text DEFAULT 'collection' NOT NULL`,
  `CREATE INDEX IF NOT EXISTS "metric_source_runs_slug_date_idx" ON "metric_source_runs" ("slug", "metric_date")`,
  `CREATE INDEX IF NOT EXISTS "metric_source_runs_slug_source_idx" ON "metric_source_runs" ("slug", "source")`,
  `CREATE INDEX IF NOT EXISTS "metric_source_runs_slug_source_basis_date_idx" ON "metric_source_runs" ("slug", "source", "date_basis", "metric_date")`,
];

let ensurePromise: Promise<void> | null = null;

export async function ensureMetricsStorage(): Promise<void> {
  if (!hasDatabase) return;
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

export function metricsStorageConfigured(): boolean {
  return hasDatabase;
}

export function stableId(...parts: Array<string | number | null | undefined>): string {
  return crypto
    .createHash("sha1")
    .update(parts.map((part) => (part == null ? "" : String(part))).join(" "))
    .digest("hex")
    .slice(0, 24);
}

function canonicalDimensions(dimensions?: Record<string, unknown> | null): {
  dimsKey: string;
  dims: Record<string, string> | null;
} {
  if (!dimensions || typeof dimensions !== "object") return { dimsKey: "", dims: null };
  const entries = Object.entries(dimensions)
    .filter(([, value]) => value != null && value !== "")
    .map(([key, value]) => [key, String(value)] as [string, string])
    .sort((a, b) => a[0].localeCompare(b[0]));
  if (!entries.length) return { dimsKey: "", dims: null };
  const dims: Record<string, string> = {};
  for (const [key, value] of entries) dims[key] = value;
  const logicalEntries = entries.filter(
    ([key]) => !isMetricMetadataDimensionKey(key),
  );
  return {
    dimsKey: logicalEntries.length ? JSON.stringify(logicalEntries) : "",
    dims,
  };
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    // Tolerate "1,234.5", "12.5%", "€96", "4.2x" → numeric core.
    const cleaned = trimmed.replace(/[\s,_]/g, "").replace(/[^0-9.+-]/g, "");
    if (!cleaned || !/[0-9]/.test(cleaned)) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

type SnapshotRow = typeof metricSnapshots.$inferInsert;
export const METRIC_SCOPE_EVIDENCE_DIMS_KEY = "__scope_evidence__";

function rowsFromMetrics(
  slug: string,
  source: string,
  metrics: RawMetric[],
  dateKey: string,
  collectedAt: string | null | undefined,
  runId: string | null,
  inheritedMetadata: MetricQualityMetadata = {},
): SnapshotRow[] {
  const now = new Date();
  const collected = toDate(collectedAt);
  const rows: SnapshotRow[] = [];
  for (const rawMetric of metrics) {
    const metric = applyMetricQualityMetadata(rawMetric, inheritedMetadata);
    if (!metric || typeof metric.name !== "string" || !metric.name) continue;
    // A supplied typo must never fall back to the snapshot day: doing so can
    // silently move historical data to today. Validate calendar reality, not
    // just the YYYY-MM-DD shape, before constructing any rows.
    const metricDate = resolveMetricDateForIngest(metric.date, dateKey);
    const { dimsKey, dims } = canonicalDimensions(metric.dimensions);
    const numeric = toNumber(metric.value);
    rows.push({
      id: `ms_${stableId(slug, metricDate, source, metric.name, dimsKey)}`,
      slug,
      metricDate,
      source,
      metricName: metric.name,
      value: numeric,
      valueText: numeric === null && metric.value != null ? String(metric.value).slice(0, 500) : null,
      dimensions: dims,
      dimsKey,
      grain: "day",
      collectedAt: collected,
      ingestRunId: runId,
      createdAt: now,
      updatedAt: now,
    });
  }
  return rows;
}

function scopeEvidenceRows(
  slug: string,
  source: string,
  scopes: ReadonlyArray<MetricRestatementScopeInput>,
  collectedAt: string | null | undefined,
  runId: string | null,
  partial: boolean,
): SnapshotRow[] {
  const now = new Date();
  const collected = toDate(collectedAt);
  return scopes.map((scope) => ({
    id: `ms_${stableId(
      slug,
      scope.metricDate,
      source,
      scope.metricName,
      METRIC_SCOPE_EVIDENCE_DIMS_KEY,
    )}`,
    slug,
    metricDate: scope.metricDate,
    source,
    metricName: scope.metricName,
    value: null,
    valueText: null,
    dimensions: {
      __scopeEvidence: partial ? "partial" : "complete",
      ...(partial ? { __quality: "partial" } : {}),
    },
    dimsKey: METRIC_SCOPE_EVIDENCE_DIMS_KEY,
    grain: "day",
    collectedAt: collected,
    ingestRunId: runId,
    createdAt: now,
    updatedAt: now,
  }));
}

async function upsertRows(rows: SnapshotRow[]): Promise<number> {
  if (!rows.length) return 0;
  // De-dupe within the batch (same logical key → one row) so a single
  // INSERT ... ON CONFLICT never tries to touch the same row twice.
  const byId = new Map<string, SnapshotRow>();
  for (const row of rows) {
    const id = row.id as string;
    const existing = byId.get(id);
    if (
      existing &&
      isDemoQualityMetadata(existing.dimensions) &&
      !isDemoQualityMetadata(row.dimensions)
    ) {
      byId.set(id, {
        ...row,
        dimensions: existing.dimensions,
        dimsKey: existing.dimsKey,
      });
      continue;
    }
    byId.set(id, row);
  }
  const unique = [...byId.values()];
  const database = getDb();
  const CHUNK = 500;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    await database
      .insert(metricSnapshots)
      .values(chunk)
      .onConflictDoUpdate({
        target: metricSnapshots.id,
        set: {
          value: drizzleSql`excluded."value"`,
          valueText: drizzleSql`excluded."value_text"`,
          dimensions: drizzleSql`excluded."dimensions"`,
          collectedAt: drizzleSql`excluded."collected_at"`,
          ingestRunId: drizzleSql`excluded."ingest_run_id"`,
          updatedAt: new Date(),
        },
      });
  }
  return unique.length;
}

export interface MetricRestatementScope {
  metricDate: string;
  metricName: string;
  keepIds: string[];
}

/**
 * Rows in a payload prove restatement of one metric on one date, not of every
 * metric from that source on that date. This matters for auxiliary feeds such
 * as GHL recentLead: their event dates can be older than the daily collection
 * range and must not make unrelated historical rollups eligible for deletion.
 *
 * Grouping by (metricDate, metricName) still converges a restated metric fully:
 * its aggregate and dimensional variants share the same scope, so variants no
 * longer emitted by the provider are removed.
 */
export function buildMetricRestatementScopes(
  rows: ReadonlyArray<{ id?: string | null; metricDate?: string | null; metricName?: string | null }>,
  explicitScopes: ReadonlyArray<MetricRestatementScopeInput> = [],
): MetricRestatementScope[] {
  const byDate = new Map<string, Map<string, Set<string>>>();
  const ensureScope = (metricDate: string, metricName: string): Set<string> => {
    let byName = byDate.get(metricDate);
    if (!byName) {
      byName = new Map();
      byDate.set(metricDate, byName);
    }
    let ids = byName.get(metricName);
    if (!ids) {
      ids = new Set();
      byName.set(metricName, ids);
    }
    return ids;
  };
  for (const scope of explicitScopes) {
    ensureScope(scope.metricDate, scope.metricName);
  }
  for (const row of rows) {
    if (!row.id || !row.metricDate || !row.metricName) continue;
    ensureScope(row.metricDate, row.metricName).add(row.id);
  }

  const scopes: MetricRestatementScope[] = [];
  for (const [metricDate, byName] of byDate) {
    for (const [metricName, ids] of byName) {
      scopes.push({ metricDate, metricName, keepIds: [...ids] });
    }
  }
  return scopes;
}

/**
 * Convergence (SAN-300): after re-ingesting a (slug, source), remove stale rows
 * only inside the exact (metric_date, metric_name) scopes the payload restated.
 * Must run AFTER upsertRows (so kept ids exist).
 */
async function deleteStaleRows(
  slug: string,
  source: string,
  rows: SnapshotRow[],
  explicitScopes: ReadonlyArray<MetricRestatementScopeInput> = [],
): Promise<Map<string, number>> {
  const scopes = buildMetricRestatementScopes(rows, explicitScopes);
  const counts = new Map(scopes.map((scope) => [
    `${scope.metricDate}\u0000${scope.metricName}`,
    0,
  ]));
  if (!scopes.length) return counts;
  const database = getDb();
  const CHUNK = 100;
  for (let index = 0; index < scopes.length; index += CHUNK) {
    const chunk = scopes.slice(index, index + CHUNK);
    const deleted = await database
      .delete(metricSnapshots)
      .where(and(
        eq(metricSnapshots.slug, slug),
        eq(metricSnapshots.source, source),
        or(...chunk.map((scope) => {
          const exactScope = and(
            eq(metricSnapshots.metricDate, scope.metricDate),
            eq(metricSnapshots.metricName, scope.metricName),
          );
          return scope.keepIds.length
            ? and(exactScope, notInArray(metricSnapshots.id, scope.keepIds))
            : exactScope;
        })),
      ))
      .returning({
        metricDate: metricSnapshots.metricDate,
        metricName: metricSnapshots.metricName,
      });
    for (const row of deleted) {
      const key = `${row.metricDate}\u0000${row.metricName}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * A partial restatement retains prior observations but makes their uncertainty
 * durable. Incoming rows already inherit `quality=partial`; this updates rows
 * omitted by an optional provider query inside the same exact scope. More
 * severe/demo evidence is never promoted to a milder status.
 */
async function degradePartialRestatementRows(
  slug: string,
  source: string,
  rows: SnapshotRow[],
  explicitScopes: ReadonlyArray<MetricRestatementScopeInput>,
): Promise<void> {
  const scopes = buildMetricRestatementScopes(rows, explicitScopes);
  if (!scopes.length) return;
  const database = getDb();
  const CHUNK = 100;
  for (let index = 0; index < scopes.length; index += CHUNK) {
    const chunk = scopes.slice(index, index + CHUNK);
    await database
      .update(metricSnapshots)
      .set({
        dimensions: drizzleSql`CASE
          WHEN lower(coalesce(${metricSnapshots.dimensions}->>'__quality', ${metricSnapshots.dimensions}->>'quality', '')) IN ('dirty', 'stale', 'missing', 'demo')
            OR lower(coalesce(${metricSnapshots.dimensions}->>'__provenance', ${metricSnapshots.dimensions}->>'provenance', '')) IN ('seed', 'demo')
            OR lower(coalesce(${metricSnapshots.dimensions}->>'__demo', ${metricSnapshots.dimensions}->>'demo', ${metricSnapshots.dimensions}->>'__seed', ${metricSnapshots.dimensions}->>'seed', '')) IN ('true', '1', 'yes')
          THEN ${metricSnapshots.dimensions}
          ELSE coalesce(${metricSnapshots.dimensions}, '{}'::jsonb) || '{"__quality":"partial"}'::jsonb
        END`,
        updatedAt: new Date(),
      })
      .where(and(
        eq(metricSnapshots.slug, slug),
        eq(metricSnapshots.source, source),
        or(...chunk.map((scope) => and(
          eq(metricSnapshots.metricDate, scope.metricDate),
          eq(metricSnapshots.metricName, scope.metricName),
        ))),
      ));
  }
}

/** Remove only the exact source/day pairs explicitly confirmed empty. */
async function deleteConnectedNoDataRows(
  slug: string,
  source: string,
  dates: string[],
): Promise<Map<string, number>> {
  const counts = new Map(dates.map((date) => [date, 0]));
  if (source.trim().toLowerCase() !== "yalc" || !dates.length) return counts;
  const database = getDb();
  const deleted = await database
    .delete(metricSnapshots)
    .where(
      and(
        eq(metricSnapshots.slug, slug),
        eq(metricSnapshots.source, source),
        inArray(metricSnapshots.metricDate, dates),
      ),
    )
    .returning({ metricDate: metricSnapshots.metricDate });
  for (const row of deleted) {
    const date = String(row.metricDate);
    counts.set(date, (counts.get(date) ?? 0) + 1);
  }
  return counts;
}

export type SourceRunStatus = "ok" | "partial" | "error" | "skipped" | typeof CONNECTED_NO_DATA_STATUS;
export type SourceRunDateBasis = "collection" | "provider";

export interface SourceRunInput {
  slug: string;
  metricDate: string;
  source: string;
  status: SourceRunStatus;
  dateBasis?: SourceRunDateBasis;
  rowCount?: number;
  deletedCount?: number;
  collectedAt?: string | Date | null;
  cadence?: string | null;
  error?: string | null;
}

/**
 * Upsert one collection-ledger row. `collection` powers execution health and
 * retains its legacy deterministic id; `provider` records an exact attempted
 * provider day so range-scoped reads never infer a backfill date via D-lag.
 */
export async function recordSourceRun(run: SourceRunInput): Promise<void> {
  if (!hasDatabase) return;
  if (!run.slug || !run.source || !isRealMetricDate(run.metricDate)) return;
  await ensureMetricsStorage();
  const database = getDb();
  const now = new Date();
  const dateBasis = run.dateBasis ?? "collection";
  // Preserve every existing collection-ledger id. Exact provider evidence gets
  // its own namespace so a same-day run cannot overwrite the health row.
  const id = dateBasis === "collection"
    ? `msr_${stableId(run.slug, run.metricDate, run.source)}`
    : `msr_${stableId(run.slug, run.metricDate, run.source, dateBasis)}`;
  const set = {
    status: run.status,
    dateBasis,
    collectedAt: toDate(run.collectedAt) ?? now,
    rowCount: run.rowCount ?? 0,
    deletedCount: run.deletedCount ?? 0,
    cadence: run.cadence ?? null,
    error: run.error ?? null,
    updatedAt: now,
  };
  await database
    .insert(metricSourceRuns)
    .values({ id, slug: run.slug, metricDate: run.metricDate, source: run.source, createdAt: now, ...set })
    .onConflictDoUpdate({ target: metricSourceRuns.id, set });
}

function sourceRunStatusForPayload(
  payload: SourcePayload | null | undefined,
  inheritedQuality?: string | null,
): SourceRunStatus {
  if (payload?.status === "error") return "error";
  if (payload?.status !== "ok") return "skipped";
  return canDeleteStaleSourcePayload(payload, inheritedQuality) ? "ok" : "partial";
}

function deletedCountForDate(
  counts: ReadonlyMap<string, number>,
  metricDate: string,
): number {
  let total = 0;
  for (const [key, count] of counts) {
    if (key.startsWith(`${metricDate}\u0000`)) total += count;
  }
  return total;
}

/** Record many ledger rows, best-effort — a ledger hiccup never fails ingest. */
async function recordSourceRuns(runs: SourceRunInput[]): Promise<void> {
  for (const run of runs) {
    try {
      await recordSourceRun(run);
    } catch {
      /* best-effort */
    }
  }
}

/** Mirror one source's metrics for a given date. Best-effort, idempotent. */
export async function ingestSourceMetrics(
  slug: string,
  source: string,
  metrics: RawMetric[],
  dateKey: string,
  opts: {
    collectedAt?: string | null;
    runId?: string | null;
    deleteStale?: boolean;
    provenance?: string | null;
    quality?: string | null;
    attemptedDates?: string[];
    restatedScopes?: MetricRestatementScopeInput[];
  } = {},
): Promise<IngestResult> {
  if (!hasDatabase) {
    return { ok: false, rows: 0, sources: [], skipped: source ? [source] : [], storage: STORAGE_NOT_CONFIGURED };
  }
  if (!slug || !source || !Array.isArray(metrics) || !isRealMetricDate(dateKey)) {
    return { ok: true, rows: 0, sources: [], skipped: source ? [source] : [], storage: { configured: true } };
  }
  const attemptedDates = normalizeAttemptedProviderDates(opts.attemptedDates);
  const explicitScopes = normalizeMetricRestatementScopeInputs(
    opts.restatedScopes,
    attemptedDates,
  );
  if (!metrics.length && !explicitScopes.length) {
    return { ok: true, rows: 0, sources: [], skipped: [source], storage: { configured: true } };
  }
  await ensureMetricsStorage();
  const recordedAt = toDate(opts.collectedAt)?.toISOString() ?? new Date().toISOString();
  const runId = opts.runId ?? `mri_${stableId(slug, dateKey, source, recordedAt)}`;
  const partial = String(opts.quality ?? "").trim().toLowerCase() === "partial";
  const metricRows = rowsFromMetrics(slug, source, metrics, dateKey, recordedAt, runId, opts);
  const rows = [
    ...metricRows,
    ...scopeEvidenceRows(slug, source, explicitScopes, recordedAt, runId, partial),
  ];
  const count = await upsertRows(rows);
  let deletedCounts = new Map<string, number>();
  if (partial) {
    await degradePartialRestatementRows(slug, source, rows, explicitScopes);
  } else if (opts.deleteStale) {
    deletedCounts = await deleteStaleRows(slug, source, rows, explicitScopes);
  }
  const deleted = [...deletedCounts.values()].reduce((sum, value) => sum + value, 0);
  try {
    const status: SourceRunStatus = partial ? "partial" : "ok";
    await recordSourceRun({
      slug,
      metricDate: dateKey,
      source,
      status,
      rowCount: new Set(metricRows.map((row) => row.id as string)).size,
      deletedCount: deleted,
      collectedAt: recordedAt,
    });
    for (const providerDate of attemptedDates) {
      await recordSourceRun({
        slug,
        metricDate: providerDate,
        source,
        status,
        dateBasis: "provider",
        rowCount: new Set(metricRows
          .filter((row) => row.metricDate === providerDate)
          .map((row) => row.id as string)).size,
        deletedCount: deletedCountForDate(deletedCounts, providerDate),
        collectedAt: recordedAt,
      });
    }
  } catch {
    /* ledger is best-effort */
  }
  return { ok: true, rows: count, sources: [source], skipped: [], deleted, storage: { configured: true } };
}

/** Mirror a full daily snapshot (`{ sources: { <source>: { status, metrics } } }`). */
export async function ingestDailySnapshot(
  slug: string,
  dateKey: string,
  daily: DailySnapshotInput,
  opts: { deleteStale?: boolean } = {},
): Promise<IngestResult> {
  if (!hasDatabase) {
    return { ok: false, rows: 0, sources: [], skipped: [], storage: STORAGE_NOT_CONFIGURED };
  }
  if (!slug || !isRealMetricDate(dateKey)) {
    return { ok: false, rows: 0, sources: [], skipped: [], storage: { configured: true } };
  }
  await ensureMetricsStorage();
  const sources = daily?.sources && typeof daily.sources === "object" ? daily.sources : {};
  const recordedAt = toDate(daily?.collectedAt)?.toISOString() ?? new Date().toISOString();
  const runId = `mri_${stableId(slug, dateKey, recordedAt)}`;
  const allRows: SnapshotRow[] = [];
  const used: string[] = [];
  const skipped: string[] = [];
  const ledger: SourceRunInput[] = [];
  const convergenceBySource = new Map<string, {
    rows: SnapshotRow[];
    scopes: MetricRestatementScopeInput[];
    partial: boolean;
  }>();
  const attemptedBySource = new Map<string, string[]>();
  const connectedNoDataBySource = new Map<string, { dates: string[]; collectedAt: string | null | undefined }>();
  for (const [source, payload] of Object.entries(sources)) {
    const metrics = payload?.metrics;
    const collectedAt = toDate(payload?.collectedAt)?.toISOString() ?? recordedAt;
    const attemptedDates = normalizeAttemptedProviderDates(payload?.attemptedDates);
    const explicitScopes = normalizeMetricRestatementScopeInputs(
      payload?.restatedScopes,
      attemptedDates,
    );
    attemptedBySource.set(source, attemptedDates);
    const restatedDates = connectedNoDataRestatementDates(source, payload);
    if (restatedDates.length) {
      used.push(source);
      connectedNoDataBySource.set(source, { dates: restatedDates, collectedAt });
      ledger.push({
        slug,
        metricDate: dateKey,
        source,
        status: canDeleteStaleSourcePayload(payload, daily.quality)
          ? CONNECTED_NO_DATA_STATUS
          : "partial",
        rowCount: 0,
        collectedAt,
      });
      continue;
    }
    if (
      payload?.status !== "ok"
      || !Array.isArray(metrics)
      || (!metrics.length && !explicitScopes.length)
    ) {
      skipped.push(source);
      const status = sourceRunStatusForPayload(payload, daily.quality);
      ledger.push({
        slug,
        metricDate: dateKey,
        source,
        status,
        rowCount: 0,
        collectedAt,
        error: payload?.error ?? null,
      });
      for (const providerDate of attemptedDates) {
        ledger.push({
          slug,
          metricDate: providerDate,
          source,
          status,
          dateBasis: "provider",
          rowCount: 0,
          collectedAt,
          error: payload?.error ?? null,
        });
      }
      continue;
    }
    used.push(source);
    const partial = !canDeleteStaleSourcePayload(payload, daily.quality);
    const metricRows = rowsFromMetrics(slug, source, metrics, dateKey, collectedAt, runId, {
      provenance: payload?.provenance ?? daily.provenance,
      quality: payload?.quality ?? daily.quality,
    });
    const srcRows = [
      ...metricRows,
      ...scopeEvidenceRows(slug, source, explicitScopes, collectedAt, runId, partial),
    ];
    allRows.push(...srcRows);
    convergenceBySource.set(source, { rows: srcRows, scopes: explicitScopes, partial });
    // Count distinct ids — what upsertRows actually writes — so the ledger
    // matches the DB even when a source emits duplicate logical keys.
    const written = new Set(metricRows.map((row) => row.id as string)).size;
    const status: SourceRunStatus = partial ? "partial" : "ok";
    ledger.push({ slug, metricDate: dateKey, source, status, rowCount: written, collectedAt });
    for (const providerDate of attemptedDates) {
      ledger.push({
        slug,
        metricDate: providerDate,
        source,
        status,
        dateBasis: "provider",
        rowCount: new Set(metricRows
          .filter((row) => row.metricDate === providerDate)
          .map((row) => row.id as string)).size,
        collectedAt,
      });
    }
  }
  const count = await upsertRows(allRows);
  // Convergence: only after the upsert, and only for sources actually present.
  // An errored/skipped source has no rows here, so its prior data is never wiped.
  let deleted = 0;
  for (const [source, convergence] of convergenceBySource) {
    if (convergence.partial) {
      await degradePartialRestatementRows(
        slug,
        source,
        convergence.rows,
        convergence.scopes,
      );
      continue;
    }
    if (!opts.deleteStale) continue;
    const counts = await deleteStaleRows(
      slug,
      source,
      convergence.rows,
      convergence.scopes,
    );
    const sourceDeleted = [...counts.values()].reduce((sum, value) => sum + value, 0);
    deleted += sourceDeleted;
    if (sourceDeleted) {
      const entry = ledger.find((run) =>
        run.source === source
        && run.dateBasis !== "provider"
        && run.status === "ok");
      if (entry) entry.deletedCount = sourceDeleted;
    }
    for (const providerDate of attemptedBySource.get(source) ?? []) {
      const entry = ledger.find((run) =>
        run.source === source
        && run.dateBasis === "provider"
        && run.metricDate === providerDate);
      if (entry) entry.deletedCount = deletedCountForDate(counts, providerDate);
    }
  }
  if (opts.deleteStale) {
    for (const [source, evidence] of connectedNoDataBySource) {
      const counts = await deleteConnectedNoDataRows(slug, source, evidence.dates);
      deleted += [...counts.values()].reduce((sum, value) => sum + value, 0);
      for (const date of evidence.dates) {
        ledger.push({
          slug,
          metricDate: date,
          source,
          status: CONNECTED_NO_DATA_STATUS,
          dateBasis: "provider",
          rowCount: 0,
          deletedCount: counts.get(date) ?? 0,
          collectedAt: evidence.collectedAt,
        });
      }
    }
  } else {
    for (const [source, evidence] of connectedNoDataBySource) {
      for (const date of evidence.dates) {
        ledger.push({
          slug,
          metricDate: date,
          source,
          status: CONNECTED_NO_DATA_STATUS,
          dateBasis: "provider",
          rowCount: 0,
          collectedAt: evidence.collectedAt,
        });
      }
    }
  }
  const connectedNoDataRuns = ledger.filter((run) => run.status === CONNECTED_NO_DATA_STATUS);
  await recordSourceRuns(ledger.filter((run) => run.status !== CONNECTED_NO_DATA_STATUS));
  // Unlike monitoring-only ledger rows, connected_no_data is part of the data
  // truth used by the UI. Do not report ingest success unless that evidence was
  // durably persisted; a collector retry is safe and idempotent.
  for (const run of connectedNoDataRuns) await recordSourceRun(run);
  return { ok: true, rows: count, sources: used, skipped, deleted, storage: { configured: true } };
}
