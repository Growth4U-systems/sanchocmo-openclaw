import fs from "fs";
import path from "path";
import { BASE } from "@/lib/data/paths";
import {
  listAllContentTasks,
  setChannelPhase,
  maybePromoteContentTaskFromMedia,
  promoteStatusFromAggregate,
} from "@/lib/data/content-tasks";
import { listDrafts } from "@/lib/data/drafts";
import { getStatusEntry, getThread } from "@/lib/data/mc-chat";
import { logActivity } from "@/lib/data/activity-log";
import { publish as publishEvent } from "@/lib/data/events";
import {
  detectDesyncs,
  type CtArtifacts,
  type DesyncReport,
} from "@/lib/content/desync-detector";
import type { ContentTask } from "@/types";

/**
 * Content-pipeline reconciler (SAN-153) — the deterministic safety net for
 * phases the writer agent forgot to report via curl.
 *
 * Mirrors `lib/publishing/reconciliation.ts`: sweep, compare against
 * observable evidence, fix forward-only, report the rest. Three properties
 * the design depends on:
 *
 * 1. FORWARD-ONLY + MTIME GUARD. Promotions only fire on evidence written
 *    AFTER the last CT action (draft mtime > ct.updated_at). Without that
 *    guard a manual revert would be silently undone 30 minutes later — the
 *    exact self-healing bug this codebase already removed once (see the
 *    comment in content-tasks.ts above the channel_phases helpers).
 * 2. NEVER while the agent works: skip on live status entry, recent thread
 *    activity, or recent CT update (grace window). `getStatusEntry` is
 *    in-memory to the Next process — valid because this reconciler runs as
 *    an API route of that same process; the thread/CT grace is the backstop.
 * 3. ONLY this module writes. GETs that want desyncs read the persisted
 *    `reconcile-state.json` from the last run — never compute-and-write.
 */

export interface PromotedEntry {
  contentTaskId: string;
  parentTaskId: string;
  ideaId: string;
  channel?: string;
  rule: "R1" | "R4" | "R5";
  from: string;
  to: string;
}

export interface SkippedEntry {
  contentTaskId: string;
  reason:
    | "terminal-status"
    | "status-new"
    | "agent-active"
    | "recent-thread-activity"
    | "recent-ct-update";
}

export interface ContentReconcileResult {
  ok: true;
  slug: string;
  scanned: number;
  promoted: PromotedEntry[];
  desyncs: DesyncReport[];
  skipped: SkippedEntry[];
  ran_at: string;
  duration_ms: number;
}

const DEFAULT_GRACE_MIN = 30;

function reconcileStatePath(slug: string): string {
  return path.join(BASE, "brand", slug, "content", "reconcile-state.json");
}

/** Last persisted run, or null if the reconciler never ran for this brand. */
export function readReconcileState(slug: string): ContentReconcileResult | null {
  const file = reconcileStatePath(slug);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as ContentReconcileResult;
  } catch {
    return null;
  }
}

function buildThreadId(slug: string, ct: ContentTask): string {
  return `${slug}:content:${ct.id.toLowerCase()}`;
}

function draftChannelOf(relPath: string, metaChannel?: string): string {
  return relPath.split("/").pop()?.replace(/\.md$/, "") || metaChannel || "";
}

export async function reconcileContentTasks(slug: string): Promise<ContentReconcileResult> {
  const startedAt = Date.now();
  const graceMs =
    Number(process.env.CONTENT_RECONCILE_GRACE_MIN || DEFAULT_GRACE_MIN) * 60_000;
  const stalledHours = Number(process.env.CONTENT_WRITER_STALLED_HOURS || 4);

  const promoted: PromotedEntry[] = [];
  const desyncs: DesyncReport[] = [];
  const skipped: SkippedEntry[] = [];

  const all = listAllContentTasks(slug);
  for (const { ct, parentTaskId } of all) {
    if (["Published", "Discarded", "Deferred"].includes(ct.status)) {
      skipped.push({ contentTaskId: ct.id, reason: "terminal-status" });
      continue;
    }
    if (ct.status === "New") {
      skipped.push({ contentTaskId: ct.id, reason: "status-new" });
      continue;
    }

    const threadId = buildThreadId(slug, ct);
    if (getStatusEntry(threadId)) {
      skipped.push({ contentTaskId: ct.id, reason: "agent-active" });
      continue;
    }
    const threadUpdatedAt = getThread(threadId).updatedAt ?? null;
    const now = Date.now();
    if (threadUpdatedAt && now - threadUpdatedAt < graceMs) {
      skipped.push({ contentTaskId: ct.id, reason: "recent-thread-activity" });
      continue;
    }
    const ctUpdatedMs = Date.parse(ct.updated_at ?? "");
    if (Number.isFinite(ctUpdatedMs) && now - ctUpdatedMs < graceMs) {
      skipped.push({ contentTaskId: ct.id, reason: "recent-ct-update" });
      continue;
    }

    const drafts = listDrafts(slug, ct.idea_id);
    const draftMtimes: Record<string, number> = {};
    for (const d of drafts) {
      try {
        draftMtimes[draftChannelOf(d.relPath, d.meta.channel)] = fs.statSync(d.absPath).mtimeMs;
      } catch { /* file vanished mid-scan — leave unknown, never promotable */ }
    }

    const artifacts: CtArtifacts = {
      ct,
      parentTaskId,
      drafts,
      draftMtimes,
      threadUpdatedAt,
      agentActive: false, // already checked above
      now,
    };

    const reports = detectDesyncs(artifacts, { stalledHours });

    for (const r of reports) {
      if (!r.promotable) {
        desyncs.push(r);
        continue;
      }
      try {
        const entry = applyPromotion(slug, parentTaskId, ct, r);
        if (entry) {
          promoted.push(entry);
          logActivity(slug, {
            type: "transition",
            text: `Reconciler ${entry.rule}: ${entry.contentTaskId}${entry.channel ? ` [${entry.channel}]` : ""} ${entry.from} → ${entry.to}`,
            icon: "🔁",
            accent: "navy",
            meta: { ...entry, actor: "reconciler" },
          });
          publishEvent({
            type: "content-task-updated",
            slug,
            parentTaskId,
            contentTaskId: ct.id,
          });
        }
      } catch (e) {
        // A failed promotion (e.g. media gate) downgrades to a visible desync.
        desyncs.push({
          ...r,
          promotable: false,
          suggested_action: "review",
          detail: `${r.detail} (promoción falló: ${e instanceof Error ? e.message : String(e)})`,
        });
      }
    }
  }

  const result: ContentReconcileResult = {
    ok: true,
    slug,
    scanned: all.length,
    promoted,
    desyncs,
    skipped,
    ran_at: new Date().toISOString(),
    duration_ms: Date.now() - startedAt,
  };

  const stateFile = reconcileStatePath(slug);
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify(result, null, 2));
  return result;
}

function applyPromotion(
  slug: string,
  parentTaskId: string,
  ct: ContentTask,
  r: DesyncReport,
): PromotedEntry | null {
  const base = { contentTaskId: ct.id, parentTaskId, ideaId: ct.idea_id };
  switch (r.kind) {
    case "draft-on-disk-phase-stale": {
      if (!r.channel || !r.expected?.phase) return null;
      setChannelPhase(slug, parentTaskId, ct.id, r.channel, r.expected.phase);
      return {
        ...base,
        channel: r.channel,
        rule: "R1",
        from: r.observed.phase || "?",
        to: r.expected.phase,
      };
    }
    case "media-attached-state-stale": {
      const updated = maybePromoteContentTaskFromMedia(slug, ct.id);
      if (!updated || updated.pipeline_state === ct.pipeline_state) return null;
      return {
        ...base,
        rule: "R4",
        from: `${ct.status}/${ct.pipeline_state}`,
        to: `${updated.status}/${updated.pipeline_state}`,
      };
    }
    case "status-behind-aggregate": {
      const updated = promoteStatusFromAggregate(slug, parentTaskId, ct.id);
      if (!updated || updated.status === ct.status) return null;
      return { ...base, rule: "R5", from: ct.status, to: updated.status };
    }
    default:
      return null;
  }
}
