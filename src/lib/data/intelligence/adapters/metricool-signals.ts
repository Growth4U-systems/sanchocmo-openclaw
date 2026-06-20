// Metricool → `signals` adapter (SAN-271, Intelligence Engine).
//
// Reads a brand's PUBLISHED content (file-based per-channel drafts + the dims
// that live on their ContentTask) and writes normalized rows into the `signals`
// Neon table, so the detect engine (SAN-270) can QUERY content performance
// (percentiles / group-by dims) instead of scanning JSONs.
//
// - category "content", provider "metricool". One row per (post, metric).
// - The id is deterministic per (slug, category, provider, entity, metric, captured-DAY),
//   so a daily run is idempotent within the day and accumulates one row per day →
//   it builds the history the `trend` primitive needs (drafts only keep the latest
//   snapshot; older ones aren't retained on disk).
// - The dims (voz=`author`, formato=`content_type`, `pillar`) live on the
//   ContentTask, not the draft — this is the join SAN-271 owns.

import { createHash } from "node:crypto";

import { getDb, hasDatabase } from "@/db/drizzle";
import { signals } from "@/db/schema";
import { loadAllContentTasks } from "@/lib/data/content-tasks-flat";
import { listDrafts, type PostMetricsSnapshot } from "@/lib/data/drafts";

type SignalInsert = typeof signals.$inferInsert;

// The numeric metrics lifted from a Metricool snapshot, in stable order.
const METRICS: Array<{ key: keyof PostMetricsSnapshot; metric: string }> = [
  { key: "engagement_pct", metric: "engagement_pct" },
  { key: "impressions", metric: "impressions" },
  { key: "likes", metric: "likes" },
  { key: "clicks", metric: "clicks" },
  { key: "comments", metric: "comments" },
];

function stableId(...parts: Array<string | number | null | undefined>): string {
  const key = parts
    .filter((part) => part !== null && part !== undefined && part !== "")
    .map(String)
    .join(":");
  return createHash("sha1").update(key).digest("hex").slice(0, 24);
}

/** A published post + the dims to attribute it. Pure input — no IO. */
export interface PublishedPost {
  channel: string;
  /** Canonical URL once published, else a stable `${ideaId}:${channel}` fallback. */
  entityId: string;
  dims: Record<string, string | number | null>; // {author, content_type, pillar, channel}
  metrics: PostMetricsSnapshot;
}

/**
 * PURE: published posts → normalized `signals` rows (one per post × metric).
 * Skips unparseable snapshots and non-finite metric values. Deterministic ids.
 */
export function buildContentSignals(slug: string, posts: PublishedPost[]): SignalInsert[] {
  const rows: SignalInsert[] = [];
  for (const post of posts) {
    const capturedAt = new Date(post.metrics.measured_at);
    if (Number.isNaN(capturedAt.getTime())) continue;
    const capturedDay = post.metrics.measured_at.slice(0, 10); // bucket id by day
    for (const { key, metric } of METRICS) {
      const value = post.metrics[key];
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      rows.push({
        id: `sig_${stableId(slug, "content", "metricool", post.entityId, metric, capturedDay)}`,
        slug,
        category: "content",
        provider: "metricool",
        entityType: "post",
        entityId: post.entityId,
        dims: post.dims,
        metric,
        value,
        text: null,
        capturedAt,
      });
    }
  }
  return rows;
}

/** IO: collect this brand's published posts with their ContentTask dims. */
export function collectPublishedContent(slug: string): PublishedPost[] {
  const posts: PublishedPost[] = [];
  for (const task of loadAllContentTasks(slug)) {
    const base: Record<string, string | number | null> = {};
    if (task.author) base.author = task.author;
    if (task.content_type) base.content_type = task.content_type;
    if (task.pillar_id) base.pillar = task.pillar_id;
    for (const draft of listDrafts(slug, task.idea_id)) {
      const pub = draft.meta.publishing;
      const metrics = pub?.metrics;
      if (!metrics) continue;
      const channel = draft.meta.channel;
      const phase = task.channel_phases?.[channel];
      const published = phase === "published" || pub?.status === "published";
      if (!published) continue;
      const entityId = pub?.external_url || `${task.idea_id}:${channel}`;
      posts.push({ channel, entityId, dims: { ...base, channel }, metrics });
    }
  }
  return posts;
}

/** DB: idempotent upsert of signal rows. No-op when DATABASE_URL is unset. */
export async function upsertSignals(rows: SignalInsert[]): Promise<number> {
  if (!hasDatabase || rows.length === 0) return 0;
  const database = getDb();
  const now = new Date();
  for (const row of rows) {
    await database
      .insert(signals)
      .values({ ...row, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: signals.id,
        set: { value: row.value, dims: row.dims, capturedAt: row.capturedAt, updatedAt: now },
      });
  }
  return rows.length;
}

export interface RefreshResult {
  ok: boolean;
  slug: string;
  posts: number;
  signals: number;
  error?: string;
}

/** Runner: collect published content → normalized signals → upsert. Run daily. */
export async function refreshMetricoolSignals(slug: string): Promise<RefreshResult> {
  try {
    const posts = collectPublishedContent(slug);
    const rows = buildContentSignals(slug, posts);
    const written = await upsertSignals(rows);
    return { ok: true, slug, posts: posts.length, signals: written };
  } catch (error) {
    return {
      ok: false,
      slug,
      posts: 0,
      signals: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
