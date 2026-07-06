import fs from "fs";
import path from "path";
import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";
import { loadDraft, type MediaAsset, type PostMetricsSnapshot } from "@/lib/data/drafts";
import { loadIdeas } from "@/lib/data/ideas";
import { reconcileScheduledDrafts } from "@/lib/publishing/reconciliation";
import type { ContentTask, Idea } from "@/types";

/**
 * GET /api/content-engine/calendar?slug=X&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Feeds the Posting Calendar tab. Returns:
 *   - `scheduled`: per-channel drafts with `meta.publishing.scheduled_at` in
 *     the [from, to] range (any CT status — once scheduled, the post is in
 *     Metricool/equivalent).
 *   - `ready_queue`: per-channel drafts whose ContentTask.status === "Ready"
 *     and that have NOT been scheduled yet. These are draggable into a slot.
 *
 * The Calendar UI is the operational hub for posting. CTs in earlier states
 * (Approved/Draft/Pending Media) are NOT surfaced here — the user has to
 * formally promote them to Ready first via the kanban / draft editor.
 */

interface CalendarEvent {
  ideaId: string;
  contentTaskId: string;
  parentTaskId: string;
  channel: string;
  scheduled_at: string;
  status: "scheduled" | "publishing" | "published" | "failed" | "canceled";
  provider: string;
  external_url?: string | null;
  external_job_id?: string;
  title: string;
  hero_media_url?: string;
  body: string;
  media: MediaAsset[];
  /** Latest engagement snapshot from `publishing.metrics`, present when the
   *  cron has refreshed metrics for this post. */
  metrics?: PostMetricsSnapshot;
  /** True when status is still "scheduled" but `scheduled_at` is more than
   *  2 h in the past — Metricool likely published and reconciliation hasn't
   *  caught up. UI shows this as "⚠️ Sin confirmar" so the human investigates. */
  unconfirmed_drift?: boolean;
}

interface ReadyDraft {
  ideaId: string;
  contentTaskId: string;
  parentTaskId: string;
  channel: string;
  title: string;
  pillar_id?: string;
  ready_at: string;
  hero_media_url?: string;
  has_media: boolean;
  body: string;
  media: MediaAsset[];
  /** Per-channel media requirement, mirrored from `ContentTask.media_policy`.
   *  When `"required"`, the Ready Queue card disables the "Programar" action
   *  until media is attached. */
  media_policy?: "required" | "optional";
}

interface CalendarResponse {
  ok: true;
  scheduled: CalendarEvent[];
  ready_queue: ReadyDraft[];
}

function projectsDir(slug: string): string {
  return path.join(BASE, "brand", slug, "projects");
}

function inRange(iso: string, fromIso?: string, toIso?: string): boolean {
  if (!fromIso && !toIso) return true;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  if (fromIso) {
    const f = Date.parse(fromIso);
    if (!Number.isNaN(f) && t < f) return false;
  }
  if (toIso) {
    // Inclusive end-of-day
    const to = Date.parse(toIso);
    if (!Number.isNaN(to) && t > to + 24 * 60 * 60 * 1000 - 1) return false;
  }
  return true;
}

function pickTitle(idea: Idea | undefined, body: string, fallback: string): string {
  if (idea?.title?.trim()) return idea.title.trim();
  // First non-empty line of the draft body
  for (const raw of body.split("\n")) {
    const line = raw.trim().replace(/^#+\s*/, "");
    if (line.length >= 8) return line.length > 140 ? line.slice(0, 137) + "…" : line;
  }
  return fallback;
}

function pickHeroMediaUrl(media: Array<{ url?: string }> | undefined): string | undefined {
  if (!Array.isArray(media)) return undefined;
  const first = media.find((m) => typeof m?.url === "string" && m.url);
  return first?.url;
}

async function handler(req: NextApiRequest, res: NextApiResponse<CalendarResponse | { error: string }>) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const slug = (req.query.slug as string | undefined)?.trim();
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  const fromIso = (req.query.from as string | undefined) || undefined;
  const toIso = (req.query.to as string | undefined) || undefined;

  // Reconcile drafts whose `scheduled_at` is in the past with the provider
  // (Metricool) and metrics-collector output. This closes the gap where
  // Metricool publishes a scheduled post but MC stays on `scheduled`
  // because no one had the editor open. Cheap when nothing's pending —
  // see reconciliation.ts. The authoritative trigger is the metrics
  // cron via POST /api/publishing/reconcile; this is the on-demand
  // safety net so users see the right state when they open the tab.
  try {
    await reconcileScheduledDrafts(slug);
  } catch (e) {
    // Non-fatal: log and keep going so the calendar still loads.
    // eslint-disable-next-line no-console
    console.warn(`[calendar] reconciliation skipped: ${(e as Error).message}`);
  }

  // Build idea lookup once
  const ideas = loadIdeas(slug);
  const ideaById = new Map<string, Idea>(ideas.map((i) => [i.id, i]));

  const scheduled: CalendarEvent[] = [];
  const ready_queue: ReadyDraft[] = [];

  const root = projectsDir(slug);
  if (!fs.existsSync(root)) {
    return res.status(200).json({ ok: true, scheduled, ready_queue });
  }

  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const tasksPath = path.join(root, entry.name, "tasks.json");
    if (!fs.existsSync(tasksPath)) continue;

    let tasks: Array<{ id?: string; content_tasks?: ContentTask[] }> = [];
    try {
      // tasks.json comes in two shapes across the codebase: a bare array
      // (growth4u / newer create-project) and a wrapped object `{ tasks: [...] }`
      // (older Foundation projects, example/example P00). Match the defensive
      // pattern used in /api/projects/index.ts and /api/system/task-index.ts.
      const raw = JSON.parse(fs.readFileSync(tasksPath, "utf-8"));
      tasks = Array.isArray(raw) ? raw : Array.isArray(raw?.tasks) ? raw.tasks : [];
    } catch {
      continue; // Malformed file — skip silently
    }

    for (const task of tasks) {
      const cts = task.content_tasks;
      if (!Array.isArray(cts) || cts.length === 0) continue;
      if (!task.id) continue;
      const taskId: string = task.id;

      for (const ct of cts) {
        if (ct.status === "Discarded" || ct.status === "Deferred") continue;

        for (const channel of ct.target_channels || []) {
          const draft = loadDraft(slug, ct.idea_id, channel);
          if (!draft) continue;

          const idea = ideaById.get(ct.idea_id);
          const heroUrl = pickHeroMediaUrl(draft.meta.media);
          const baseTitle = pickTitle(idea, draft.body, ct.name || ct.id);
          const mediaList: MediaAsset[] = Array.isArray(draft.meta.media) ? draft.meta.media : [];

          const pub = draft.meta.publishing;
          const scheduledAt = pub?.scheduled_at;

          if (scheduledAt && inRange(scheduledAt, fromIso, toIso)) {
            // Source of truth for the terminal "published" state is the CT's
            // channel_phases entry — frontmatter only carries non-terminal
            // states (scheduled / publishing / failed / canceled).
            const isPublished = ct.channel_phases?.[channel] === "published";
            const effectiveStatus: CalendarEvent["status"] = isPublished
              ? "published"
              : pub?.status ?? "scheduled";
            // Watchdog: if we're still "scheduled" >2h past scheduled_at,
            // reconciliation hasn't caught up — surface it as a red badge
            // so the human knows to investigate Metricool directly.
            const driftMs = Date.now() - Date.parse(scheduledAt);
            const unconfirmed_drift =
              effectiveStatus === "scheduled" && !Number.isNaN(driftMs) && driftMs > 2 * 60 * 60 * 1000;
            scheduled.push({
              ideaId: ct.idea_id,
              contentTaskId: ct.id,
              parentTaskId: ct.parent_task_id ?? taskId,
              channel,
              scheduled_at: scheduledAt,
              status: effectiveStatus,
              provider: pub?.provider ?? "",
              external_url: pub?.external_url ?? null,
              external_job_id: pub?.external_job_id,
              title: baseTitle,
              hero_media_url: heroUrl,
              body: draft.body,
              media: mediaList,
              metrics: pub?.metrics,
              unconfirmed_drift,
            });
            continue;
          }

          // Ready Queue: only if CT is formally in Ready and NOT already scheduled
          if (ct.status === "Ready" && !scheduledAt) {
            ready_queue.push({
              ideaId: ct.idea_id,
              contentTaskId: ct.id,
              parentTaskId: ct.parent_task_id ?? taskId,
              channel,
              title: baseTitle,
              pillar_id: idea?.source_data && typeof (idea.source_data as { pillar_id?: string }).pillar_id === "string"
                ? (idea.source_data as { pillar_id: string }).pillar_id
                : undefined,
              ready_at: ct.updated_at || ct.approved_at || ct.created_at,
              hero_media_url: heroUrl,
              has_media: mediaList.length > 0,
              body: draft.body,
              media: mediaList,
              media_policy: ct.media_policy?.[channel] ?? draft.meta.media_policy,
            });
          }
        }
      }
    }
  }

  // Stable ordering for the UI
  scheduled.sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  ready_queue.sort((a, b) => b.ready_at.localeCompare(a.ready_at));

  return res.status(200).json({ ok: true, scheduled, ready_queue });
}

export default withErrorHandler(handler);
