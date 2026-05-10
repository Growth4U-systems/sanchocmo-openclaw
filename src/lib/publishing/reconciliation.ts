import fs from "fs";
import path from "path";
import { BASE } from "@/lib/data/paths";
import { listDrafts, updateDraft, type Draft } from "@/lib/data/drafts";
import { findContentTaskByIdAcrossProjects, setChannelPhase } from "@/lib/data/content-tasks";
import { getProvider } from "@/lib/publishing/registry";

/**
 * Closes the gap between Metricool publishing a scheduled post and MC
 * realizing it. The PublishBar's `usePublishingStatus` only polls while the
 * draft editor is open — if no one's looking when Metricool fires, the draft
 * stays `scheduled` forever even though the post is live on LinkedIn.
 *
 * This helper scans drafts whose `publishing.status === "scheduled"` and
 * `scheduled_at` is in the past, then cross-references against the daily
 * `metrics-collector` output (`brand/{slug}/metrics/*.json`). A match
 * promotes the draft to `published` with the real `external_url` and
 * `published_at`.
 *
 * Match strategy (network + text prefix):
 *   - Network must equal the draft's channel (linkedin/twitter/...).
 *   - The first 80 chars of the draft body (after stripping markdown
 *     headers / blank lines) must appear in the captured post's `text`
 *     field. The collector stores `comment.slice(0, 80)` so prefix
 *     matching is reliable.
 *   - Tie-breaker: closest `created.dateTime` to `scheduled_at`.
 *
 * Cheap to call on every calendar GET: the early-out short-circuits when
 * no drafts are due reconciliation, so we only open metrics files when
 * something's actually pending.
 */

const NETWORK_BY_CHANNEL: Record<string, string> = {
  linkedin: "linkedin",
  twitter: "twitter",
  x: "twitter",
  instagram: "instagram",
  facebook: "facebook",
  tiktok: "tiktok",
  youtube: "youtube",
};

interface PostDetailDim {
  network?: string;
  url?: string;
  text?: string;
  likes?: number;
  engagement?: number;
}

interface PostDetail {
  name: string;
  value: number;
  date?: string;
  dimensions?: PostDetailDim;
}

interface MetricsFile {
  sources?: { metricool?: { metrics?: PostDetail[] } };
}

interface PendingDraft {
  ideaId: string;
  channel: string;
  draft: Draft;
}

function projectsDir(slug: string): string {
  return path.join(BASE, "brand", slug, "projects");
}

function metricsDir(slug: string): string {
  return path.join(BASE, "brand", slug, "metrics");
}

/** Strip markdown headers, blank lines, list markers — keep the first 80
 *  chars of "real" prose, which is what the metrics collector stored. */
function bodyPrefix(body: string): string {
  const cleaned = body
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && !l.startsWith(">"))
    .join("\n")
    .replace(/^[*\-]\s+/, "")
    .trim();
  return cleaned.slice(0, 80);
}

/** Walk all projects/tasks.json under the brand and collect ideaIds whose
 *  drafts could be in `scheduled` state. We don't need to read tasks.json
 *  for the actual reconciliation — just to enumerate ideaIds since drafts
 *  live as files keyed by idea_id, not by content_task_id. */
function collectIdeaIds(slug: string): string[] {
  const root = projectsDir(slug);
  if (!fs.existsSync(root)) return [];
  const ids = new Set<string>();
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const tasksPath = path.join(root, entry.name, "tasks.json");
    if (!fs.existsSync(tasksPath)) continue;
    try {
      const tasks = JSON.parse(fs.readFileSync(tasksPath, "utf-8")) as Array<{ content_tasks?: Array<{ idea_id?: string }> }>;
      for (const task of tasks) {
        for (const ct of task.content_tasks || []) {
          if (ct.idea_id) ids.add(ct.idea_id);
        }
      }
    } catch { /* skip */ }
  }
  return [...ids];
}

function findPendingDrafts(slug: string): PendingDraft[] {
  const now = Date.now();
  const out: PendingDraft[] = [];
  for (const ideaId of collectIdeaIds(slug)) {
    for (const draft of listDrafts(slug, ideaId)) {
      if (draft.meta.kind && draft.meta.kind !== "channel-draft") continue;
      const pub = draft.meta.publishing;
      if (!pub || pub.status !== "scheduled") continue;
      const sched = pub.scheduled_at ? Date.parse(pub.scheduled_at) : NaN;
      if (Number.isNaN(sched) || sched > now) continue;
      out.push({ ideaId, channel: draft.meta.channel, draft });
    }
  }
  return out;
}

/** Load every metrics/*.json file with postDetail entries. Returns a flat
 *  list with file date for tie-breaking. We keep this as a single pass
 *  instead of opening files per draft. */
function loadAllPostDetails(slug: string): Array<{ fileDate: string; entry: PostDetail }> {
  const dir = metricsDir(slug);
  if (!fs.existsSync(dir)) return [];
  const out: Array<{ fileDate: string; entry: PostDetail }> = [];
  for (const file of fs.readdirSync(dir)) {
    if (!/^\d{4}-\d{2}-\d{2}\.json$/.test(file)) continue;
    let data: MetricsFile;
    try {
      data = JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8"));
    } catch {
      continue;
    }
    const fileDate = file.replace(".json", "");
    for (const entry of data.sources?.metricool?.metrics || []) {
      if (entry.name === "postDetail") out.push({ fileDate, entry });
    }
  }
  return out;
}

interface ReconcileMatch {
  url: string;
  publishedAt: string;
}

function findMatch(
  pending: PendingDraft,
  postDetails: Array<{ fileDate: string; entry: PostDetail }>,
): ReconcileMatch | null {
  const wantNetwork = NETWORK_BY_CHANNEL[pending.channel];
  if (!wantNetwork) return null;
  const prefix = bodyPrefix(pending.draft.body);
  if (prefix.length < 20) return null; // too short — too risky to match

  const candidates: Array<{ entry: PostDetail; fileDate: string; score: number }> = [];
  for (const { fileDate, entry } of postDetails) {
    const dim = entry.dimensions;
    if (!dim?.network || dim.network !== wantNetwork) continue;
    if (!dim.url || !dim.text) continue;
    // The collector stores `text: comment.slice(0,80)`. Our prefix is also
    // first 80 chars of body — they should match either fully or via
    // bidirectional includes (whichever is shorter).
    const a = prefix.toLowerCase();
    const b = dim.text.toLowerCase();
    if (!(a.includes(b.slice(0, 40)) || b.includes(a.slice(0, 40)))) continue;
    const sched = pending.draft.meta.publishing?.scheduled_at
      ? Date.parse(pending.draft.meta.publishing.scheduled_at)
      : NaN;
    const fileTs = Date.parse(`${fileDate}T00:00:00Z`);
    const score = Number.isNaN(sched) || Number.isNaN(fileTs) ? 0 : Math.abs(fileTs - sched);
    candidates.push({ entry, fileDate, score });
  }
  if (candidates.length === 0) return null;
  // Lowest score (closest in time) wins.
  candidates.sort((a, b) => a.score - b.score);
  const best = candidates[0];
  return {
    url: best.entry.dimensions!.url!,
    publishedAt: pending.draft.meta.publishing?.scheduled_at || best.fileDate,
  };
}

export interface ReconcileResult {
  scanned: number;
  reconciled: Array<{ ideaId: string; channel: string; url: string }>;
  /** Drafts whose `publishing.metrics` got refreshed this run. */
  metrics_refreshed: number;
}

/** Run reconciliation for a brand. Idempotent — drafts already `published`
 *  are skipped. Returns a summary so callers can log / show in UI.
 *
 *  Strategy per draft:
 *   1. If the draft has `external_job_id`, ask the provider directly via
 *      `getStatus(jobId)`. This is the authoritative path: Metricool
 *      returns the canonical published URL + timestamp keyed by the
 *      scheduler id we captured at publish time.
 *   2. If no `external_job_id` (legacy drafts or capture failure),
 *      fall back to text-prefix matching against the metrics-collector
 *      output. Imperfect but works for posts published before the id
 *      capture was hardened.
 */
export async function reconcileScheduledDrafts(slug: string): Promise<ReconcileResult> {
  const pending = findPendingDrafts(slug);
  const reconciled: ReconcileResult["reconciled"] = [];

  // ── Pass 1: scheduled → published (status reconciliation) ────────────
  if (pending.length > 0) {
    const posts = loadAllPostDetails(slug);

    for (const p of pending) {
      let url: string | null = null;
      let publishedAt: string | null = null;

      // Path 1: provider getStatus by id (authoritative).
      const pub = p.draft.meta.publishing;
      if (pub?.provider && pub.external_job_id) {
        const provider = getProvider(pub.provider);
        if (provider?.getStatus) {
          try {
            const st = await provider.getStatus(slug, pub.external_job_id);
            if (st.status === "published" && (st.publishedAt || st.externalUrl)) {
              url = st.externalUrl ?? null;
              publishedAt = st.publishedAt ?? pub.scheduled_at ?? null;
            }
          } catch (e) {
            // eslint-disable-next-line no-console
            console.warn(`[reconcile] getStatus failed for ${p.ideaId}/${p.channel}: ${(e as Error).message}`);
          }
        }
      }

      // Path 2: fallback to metrics text matching.
      if (!url) {
        const match = findMatch(p, posts);
        if (match) {
          url = match.url;
          publishedAt = match.publishedAt;
        }
      }

      if (!url) continue;

      try {
        updateDraft(slug, p.ideaId, p.channel, {
          meta: {
            publishing: {
              ...(p.draft.meta.publishing || { status: "published", provider: "metricool" }),
              status: "published",
              published_at: publishedAt || pub?.scheduled_at || null,
              external_url: url,
              error: null,
            },
          },
        });
        // Mark the channel as published on the parent CT — auto-promotes
        // ct.status to "Published" once every channel reports published.
        if (p.draft.meta.content_task_id) {
          try {
            const found = findContentTaskByIdAcrossProjects(slug, p.draft.meta.content_task_id);
            if (found?.parentTaskId) {
              setChannelPhase(slug, found.parentTaskId, p.draft.meta.content_task_id, p.channel, "published");
            }
          } catch { /* non-fatal */ }
        }
        reconciled.push({ ideaId: p.ideaId, channel: p.channel, url });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn(`[reconcile] update failed for ${p.ideaId}/${p.channel}: ${(e as Error).message}`);
      }
    }
  }

  // ── Pass 2: refresh engagement for ALL published drafts ───────────────
  // Even drafts that were already `published` get their metrics updated
  // each run — engagement keeps growing for days/weeks after a post lives.
  // Drafts reconciled in Pass 1 are included automatically (we re-load
  // them after the update).
  const metrics_refreshed = await refreshMetricsForPublished(slug);

  return { scanned: pending.length, reconciled, metrics_refreshed };
}

/** Refresh `publishing.metrics` on every `published` draft for this brand.
 *  Groups by provider and asks the provider in one batched call. Returns
 *  the number of drafts whose metrics were updated. */
async function refreshMetricsForPublished(slug: string): Promise<number> {
  // Re-collect all drafts to pick up Pass 1's promotions.
  const root = projectsDir(slug);
  if (!fs.existsSync(root)) return 0;

  interface PublishedDraft {
    ideaId: string;
    channel: string;
    draft: Draft;
  }
  const published: PublishedDraft[] = [];
  for (const ideaId of collectIdeaIds(slug)) {
    for (const draft of listDrafts(slug, ideaId)) {
      if (draft.meta.kind && draft.meta.kind !== "channel-draft") continue;
      const pub = draft.meta.publishing;
      if (!pub || pub.status !== "published") continue;
      if (!pub.external_url) continue;
      published.push({ ideaId, channel: draft.meta.channel, draft });
    }
  }
  if (published.length === 0) return 0;

  // Group by provider — each provider gets one batched call.
  const byProvider = new Map<string, PublishedDraft[]>();
  for (const p of published) {
    const id = p.draft.meta.publishing?.provider;
    if (!id) continue;
    const list = byProvider.get(id) || [];
    list.push(p);
    byProvider.set(id, list);
  }

  let refreshed = 0;
  for (const [providerId, drafts] of byProvider) {
    const provider = getProvider(providerId);
    if (!provider?.fetchPostMetrics) continue;
    try {
      const inputs = drafts.map((p) => ({
        channel: p.channel,
        externalUrl: p.draft.meta.publishing!.external_url!,
        publishedAt: p.draft.meta.publishing!.published_at ?? null,
      }));
      const snapshots = await provider.fetchPostMetrics(slug, inputs);
      for (const p of drafts) {
        const snap = snapshots.get(p.draft.meta.publishing!.external_url!);
        if (!snap) continue;
        try {
          updateDraft(slug, p.ideaId, p.channel, {
            meta: {
              publishing: {
                ...(p.draft.meta.publishing as object as import("@/lib/data/drafts").PublishingMeta),
                metrics: snap,
              },
            },
          });
          refreshed++;
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn(`[reconcile] metrics update failed for ${p.ideaId}/${p.channel}: ${(e as Error).message}`);
        }
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(`[reconcile] fetchPostMetrics failed (${providerId}): ${(e as Error).message}`);
    }
  }
  return refreshed;
}
