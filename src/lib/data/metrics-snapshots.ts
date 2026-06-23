import crypto from "crypto";
import { and, eq, inArray, notInArray, sql as drizzleSql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/db/drizzle";
import { metricSnapshots, metricSourceRuns } from "@/db/schema";

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
}

export interface SourcePayload {
  status?: string;
  collectedAt?: string | null;
  metrics?: RawMetric[];
}

export interface DailySnapshotInput {
  slug?: string;
  collectedAt?: string | null;
  sources?: Record<string, SourcePayload>;
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
  `CREATE TABLE IF NOT EXISTS "metric_source_runs" ("id" text PRIMARY KEY NOT NULL, "slug" text NOT NULL, "metric_date" text NOT NULL, "source" text NOT NULL, "status" text NOT NULL, "collected_at" timestamp, "row_count" integer DEFAULT 0 NOT NULL, "deleted_count" integer DEFAULT 0 NOT NULL, "cadence" text, "error" text, "created_at" timestamp DEFAULT now() NOT NULL, "updated_at" timestamp DEFAULT now() NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS "metric_source_runs_slug_date_idx" ON "metric_source_runs" ("slug", "metric_date")`,
  `CREATE INDEX IF NOT EXISTS "metric_source_runs_slug_source_idx" ON "metric_source_runs" ("slug", "source")`,
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
  return { dimsKey: JSON.stringify(entries), dims };
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

function rowsFromMetrics(
  slug: string,
  source: string,
  metrics: RawMetric[],
  dateKey: string,
  collectedAt: string | null | undefined,
  runId: string | null,
): SnapshotRow[] {
  const now = new Date();
  const collected = toDate(collectedAt);
  const rows: SnapshotRow[] = [];
  for (const metric of metrics) {
    if (!metric || typeof metric.name !== "string" || !metric.name) continue;
    const metricDate = typeof metric.date === "string" && DATE_RE.test(metric.date) ? metric.date : dateKey;
    if (!DATE_RE.test(metricDate)) continue;
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

async function upsertRows(rows: SnapshotRow[]): Promise<number> {
  if (!rows.length) return 0;
  // De-dupe within the batch (same logical key → one row) so a single
  // INSERT ... ON CONFLICT never tries to touch the same row twice.
  const byId = new Map<string, SnapshotRow>();
  for (const row of rows) byId.set(row.id as string, row);
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

/**
 * Convergence (SAN-300): after re-ingesting a (slug, source), remove rows for the
 * exact metric_dates the payload restated whose id is not in the freshly-upserted
 * set. Scoped to those dates only, so legitimately-lagged GSC rows for OTHER dates
 * are never touched. Must run AFTER upsertRows (so kept ids exist). Returns the
 * number of stale rows removed.
 */
async function deleteStaleRows(slug: string, source: string, presentDates: string[], keepIds: string[]): Promise<number> {
  const dates = [...new Set(presentDates)];
  if (!dates.length || !keepIds.length) return 0;
  const database = getDb();
  const deleted = await database
    .delete(metricSnapshots)
    .where(
      and(
        eq(metricSnapshots.slug, slug),
        eq(metricSnapshots.source, source),
        inArray(metricSnapshots.metricDate, dates),
        notInArray(metricSnapshots.id, keepIds),
      ),
    )
    .returning({ id: metricSnapshots.id });
  return deleted.length;
}

export type SourceRunStatus = "ok" | "error" | "skipped";

export interface SourceRunInput {
  slug: string;
  metricDate: string;
  source: string;
  status: SourceRunStatus;
  rowCount?: number;
  deletedCount?: number;
  collectedAt?: string | Date | null;
  cadence?: string | null;
  error?: string | null;
}

/**
 * Upsert the collection-ledger row for one (slug, day, source) — the "one row
 * per tool per day" record powering health/monitoring (SAN-300). The day is the
 * collection date (dateKey), regardless of which metric_dates the payload wrote.
 */
export async function recordSourceRun(run: SourceRunInput): Promise<void> {
  if (!hasDatabase) return;
  if (!run.slug || !run.source || !DATE_RE.test(run.metricDate)) return;
  await ensureMetricsStorage();
  const database = getDb();
  const now = new Date();
  const id = `msr_${stableId(run.slug, run.metricDate, run.source)}`;
  const set = {
    status: run.status,
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
  opts: { collectedAt?: string | null; runId?: string | null; deleteStale?: boolean } = {},
): Promise<IngestResult> {
  if (!hasDatabase) {
    return { ok: false, rows: 0, sources: [], skipped: source ? [source] : [], storage: STORAGE_NOT_CONFIGURED };
  }
  if (!slug || !source || !Array.isArray(metrics) || !metrics.length || !DATE_RE.test(dateKey)) {
    return { ok: true, rows: 0, sources: [], skipped: source ? [source] : [], storage: { configured: true } };
  }
  await ensureMetricsStorage();
  const runId = opts.runId ?? `mri_${stableId(slug, dateKey, source, opts.collectedAt ?? "")}`;
  const rows = rowsFromMetrics(slug, source, metrics, dateKey, opts.collectedAt, runId);
  const count = await upsertRows(rows);
  let deleted = 0;
  if (opts.deleteStale) {
    deleted = await deleteStaleRows(
      slug,
      source,
      rows.map((row) => row.metricDate as string),
      rows.map((row) => row.id as string),
    );
  }
  try {
    await recordSourceRun({ slug, metricDate: dateKey, source, status: count ? "ok" : "skipped", rowCount: count, deletedCount: deleted, collectedAt: opts.collectedAt });
  } catch {
    /* ledger is best-effort */
  }
  return { ok: true, rows: count, sources: count ? [source] : [], skipped: count ? [] : [source], deleted, storage: { configured: true } };
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
  if (!slug || !DATE_RE.test(dateKey)) {
    return { ok: false, rows: 0, sources: [], skipped: [], storage: { configured: true } };
  }
  await ensureMetricsStorage();
  const sources = daily?.sources && typeof daily.sources === "object" ? daily.sources : {};
  const runId = `mri_${stableId(slug, dateKey, daily?.collectedAt ?? "")}`;
  const allRows: SnapshotRow[] = [];
  const used: string[] = [];
  const skipped: string[] = [];
  const ledger: SourceRunInput[] = [];
  const bySource = new Map<string, SnapshotRow[]>();
  for (const [source, payload] of Object.entries(sources)) {
    const metrics = payload?.metrics;
    const collectedAt = payload?.collectedAt ?? daily.collectedAt;
    if (payload?.status !== "ok" || !Array.isArray(metrics) || !metrics.length) {
      skipped.push(source);
      ledger.push({ slug, metricDate: dateKey, source, status: payload?.status === "error" ? "error" : "skipped", rowCount: 0, collectedAt });
      continue;
    }
    used.push(source);
    const srcRows = rowsFromMetrics(slug, source, metrics, dateKey, collectedAt, runId);
    allRows.push(...srcRows);
    bySource.set(source, srcRows);
    // Count distinct ids — what upsertRows actually writes — so the ledger
    // matches the DB even when a source emits duplicate logical keys.
    const written = new Set(srcRows.map((row) => row.id as string)).size;
    ledger.push({ slug, metricDate: dateKey, source, status: "ok", rowCount: written, collectedAt });
  }
  const count = await upsertRows(allRows);
  // Convergence: only after the upsert, and only for sources actually present.
  // An errored/skipped source has no rows here, so its prior data is never wiped.
  let deleted = 0;
  if (opts.deleteStale) {
    for (const [source, srcRows] of bySource) {
      const del = await deleteStaleRows(
        slug,
        source,
        srcRows.map((row) => row.metricDate as string),
        srcRows.map((row) => row.id as string),
      );
      deleted += del;
      if (del) {
        const entry = ledger.find((l) => l.source === source && l.status === "ok");
        if (entry) entry.deletedCount = del;
      }
    }
  }
  await recordSourceRuns(ledger);
  return { ok: true, rows: count, sources: used, skipped, deleted, storage: { configured: true } };
}
