import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb, hasDatabase } from "@/db/drizzle";
import { metricCollectionSchedule, metricSnapshots, metricSourceRuns } from "@/db/schema";
import { ensureMetricsStorage, stableId } from "@/lib/data/metrics-snapshots";
import {
  type Cadence,
  type CollectionSchedule,
  defaultScheduleFor,
  isDueToday,
  normalizeCadence,
} from "@/lib/metrics/collection-schedule";

/**
 * Data layer for the editable per-source cadence (metric_collection_schedule)
 * and reads of the collection ledger (metric_source_runs) — SAN-300. Cadence
 * defaults live in collection-schedule.ts; a stored row is an override.
 */

function scheduleId(slug: string, source: string): string {
  return `mcs_${stableId(slug, source)}`;
}

/** Sources known for a slug: snapshot data ∪ stored overrides ∪ collection runs.
 * Including run-only sources is essential: a provider whose first attempt
 * failed has no snapshot yet, but its error must still appear in health. */
export async function listScheduleSources(slug: string): Promise<string[]> {
  if (!hasDatabase) return [];
  await ensureMetricsStorage();
  const database = getDb();
  const [snapSources, schedRows, runSources] = await Promise.all([
    database.selectDistinct({ source: metricSnapshots.source }).from(metricSnapshots).where(eq(metricSnapshots.slug, slug)),
    database.select({ source: metricCollectionSchedule.source }).from(metricCollectionSchedule).where(eq(metricCollectionSchedule.slug, slug)),
    database.selectDistinct({ source: metricSourceRuns.source }).from(metricSourceRuns).where(eq(metricSourceRuns.slug, slug)),
  ]);
  const set = new Set<string>();
  for (const row of snapSources) set.add(row.source);
  for (const row of schedRows) set.add(row.source);
  for (const row of runSources) set.add(row.source);
  return [...set].sort();
}

function rowToSchedule(row: typeof metricCollectionSchedule.$inferSelect): CollectionSchedule {
  return {
    source: row.source,
    cadence: normalizeCadence(row.cadence),
    daysOfWeek: Array.isArray(row.daysOfWeek) ? row.daysOfWeek : [],
    cronExpr: row.cronExpr ?? null,
    enabled: row.enabled,
  };
}

/**
 * Resolved schedules (defaults merged with stored overrides) for the given
 * sources, or for all known sources when omitted.
 */
export async function getResolvedSchedules(slug: string, sources?: string[]): Promise<CollectionSchedule[]> {
  const list = sources ?? (await listScheduleSources(slug));
  if (!hasDatabase) return list.map((source) => defaultScheduleFor(source));
  await ensureMetricsStorage();
  const database = getDb();
  const rows = list.length
    ? await database
        .select()
        .from(metricCollectionSchedule)
        .where(and(eq(metricCollectionSchedule.slug, slug), inArray(metricCollectionSchedule.source, list)))
    : await database.select().from(metricCollectionSchedule).where(eq(metricCollectionSchedule.slug, slug));
  const stored = new Map(rows.map((row) => [row.source, rowToSchedule(row)]));
  const out = list.length ? list : rows.map((row) => row.source);
  return out.map((source) => stored.get(source) ?? defaultScheduleFor(source));
}

export interface SchedulePatch {
  cadence?: Cadence | string;
  daysOfWeek?: number[];
  cronExpr?: string | null;
  enabled?: boolean;
}

/** Upsert one source's cadence override. */
export async function setCollectionSchedule(slug: string, source: string, patch: SchedulePatch): Promise<CollectionSchedule> {
  if (!hasDatabase) throw new Error("DATABASE_URL not configured");
  if (!slug || !source) throw new Error("slug and source are required");
  await ensureMetricsStorage();
  const database = getDb();
  const base = defaultScheduleFor(source);
  const cadence = normalizeCadence(patch.cadence ?? base.cadence);
  let daysOfWeek = Array.isArray(patch.daysOfWeek)
    ? patch.daysOfWeek.filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
    : base.daysOfWeek;
  // A weekly/twice_weekly source with no day would never be due → default to
  // Monday, so the cadence is robust regardless of what the caller sent.
  if ((cadence === "weekly" || cadence === "twice_weekly") && daysOfWeek.length === 0) {
    daysOfWeek = [1];
  }
  const cronExpr = patch.cronExpr === undefined ? base.cronExpr : patch.cronExpr || null;
  const enabled = patch.enabled === undefined ? true : Boolean(patch.enabled);
  const now = new Date();
  const id = scheduleId(slug, source);
  await database
    .insert(metricCollectionSchedule)
    .values({ id, slug, source, cadence, daysOfWeek, cronExpr, enabled, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: metricCollectionSchedule.id,
      set: { cadence, daysOfWeek, cronExpr, enabled, updatedAt: now },
    });
  return { source, cadence, daysOfWeek, cronExpr, enabled };
}

/** Sources due for collection on `date` among `sources` (used by the collector). */
export async function getDueSources(slug: string, sources: string[], date: Date = new Date()): Promise<string[]> {
  const schedules = await getResolvedSchedules(slug, sources);
  return schedules.filter((schedule) => isDueToday(schedule, date)).map((schedule) => schedule.source);
}

export interface SourceRun {
  source: string;
  metricDate: string;
  status: string;
  rowCount: number;
  deletedCount: number;
  collectedAt: string | null;
  cadence: string | null;
  error: string | null;
}

export function selectLatestSourceRunRows<
  T extends { source: string; metricDate: string; collectedAt: Date | string | null },
>(rows: T[]): T[] {
  const sorted = [...rows].sort((left, right) => {
    const byDate = String(right.metricDate).localeCompare(String(left.metricDate));
    if (byDate) return byDate;
    const leftCollected = left.collectedAt ? new Date(left.collectedAt).getTime() : 0;
    const rightCollected = right.collectedAt ? new Date(right.collectedAt).getTime() : 0;
    return rightCollected - leftCollected;
  });
  const seen = new Set<string>();
  return sorted.filter((row) => {
    if (seen.has(row.source)) return false;
    seen.add(row.source);
    return true;
  });
}

/** Latest collection-ledger row per source for a slug (for health/monitoring). */
export async function getLatestSourceRuns(slug: string): Promise<SourceRun[]> {
  if (!hasDatabase) return [];
  await ensureMetricsStorage();
  const database = getDb();
  const rows = await database
    .select({
      source: metricSourceRuns.source,
      metricDate: metricSourceRuns.metricDate,
      status: metricSourceRuns.status,
      rowCount: metricSourceRuns.rowCount,
      deletedCount: metricSourceRuns.deletedCount,
      collectedAt: metricSourceRuns.collectedAt,
      cadence: metricSourceRuns.cadence,
      error: metricSourceRuns.error,
    })
    .from(metricSourceRuns)
    // Health is about the execution, not historical provider dates attempted by
    // a backfill. Provider evidence is consumed by range-scoped readers.
    .where(and(
      eq(metricSourceRuns.slug, slug),
      eq(metricSourceRuns.dateBasis, "collection"),
    ))
    .orderBy(desc(metricSourceRuns.metricDate), desc(metricSourceRuns.collectedAt));
  const out: SourceRun[] = [];
  for (const row of selectLatestSourceRunRows(rows)) {
    out.push({
      source: row.source,
      metricDate: String(row.metricDate),
      status: row.status,
      rowCount: row.rowCount,
      deletedCount: row.deletedCount,
      collectedAt: row.collectedAt ? new Date(row.collectedAt).toISOString() : null,
      cadence: row.cadence ?? null,
      error: row.error ?? null,
    });
  }
  return out;
}
