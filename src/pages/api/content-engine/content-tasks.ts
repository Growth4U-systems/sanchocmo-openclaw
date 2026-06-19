/**
 * /api/content-engine/content-tasks
 *
 *   GET    ?slug=X&parentTaskId=Y                                   → list
 *   GET    ?slug=X&parentTaskId=Y&id=Z                              → single
 *   PATCH  { slug, parentTaskId, id, status?, pipeline_state?, ... } → update status and/or fields
 *                                                                     (escape hatch — UI uses POST actions)
 *   POST   { slug, parentTaskId, id, action, ... }
 *     Actions:
 *       "attach-document" / "detach-document"          → manage CT.documents[]
 *       "approve-draft"                                → Draft → Pending Media
 *       "approve-media"                                → Pending Media (media-review) → Ready
 *       "publish"                                      → Ready → Published
 *       "discard"                                      → any active state → Discarded
 *       "defer"                                        → any active state → Deferred
 *
 * ContentTasks are nested under a parent Task with `type === "content"`.
 * Storage: parent's `content_tasks[]` field in `tasks.json`.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import {
  listContentTasks,
  findContentTask,
  findContentTaskByIdAcrossProjects,
  setContentTaskStatus,
  updateContentTask,
  attachDocumentToContentTask,
  removeDocumentFromContentTask,
  setChannelPhases,
  rollbackChannelPhasesToStatus,
  MediaGateError,
  ContentTaskUpdateInput,
} from "@/lib/data/content-tasks";
import { listDrafts } from "@/lib/data/drafts";
import { triggerFeedbackTriage } from "@/lib/data/feedback-triage-trigger";
import { publish as publishEvent } from "@/lib/data/events";
import {
  ChannelPhase,
  ContentTask,
  ContentTaskStatus,
  ContentTaskPipelineState,
  VALID_CHANNEL_PHASES,
  VALID_CONTENT_TASK_STATUSES,
} from "@/types";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const slug = (req.query.slug || req.body?.slug) as string;
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  // After every mutation, push a `content-task-updated` event so SSE clients
  // can invalidate their cache immediately. Falls through to the normal JSON
  // response — never observable by the caller.
  const respondAndEmit = (ct: ContentTask) => {
    if (ct.parent_task_id) {
      publishEvent({
        type: "content-task-updated",
        slug,
        parentTaskId: ct.parent_task_id,
        contentTaskId: ct.id,
      });
    }
    res.status(200).json({ ok: true, contentTask: ct });
  };

  if (req.method === "GET") {
    const parentTaskId = req.query.parentTaskId as string;
    const id = req.query.id as string | undefined;
    if (!parentTaskId) return res.status(400).json({ error: "Missing parentTaskId" });

    if (id) {
      // Primary lookup uses the caller-supplied parentTaskId. Fall back to a
      // brand-wide scan when that misses: the CT id itself encodes the parent
      // (`{parent}-C{n}`) so we can recover from a stale `project_task_id` on
      // the idea record (e.g. when a re-dispatched idea got its pointer moved
      // to a different daily task than the one its CT actually lives under).
      let ct = findContentTask(slug, parentTaskId, id);
      if (!ct) {
        const fallback = findContentTaskByIdAcrossProjects(slug, id);
        if (fallback) ct = fallback.ct;
      }
      if (!ct) return res.status(404).json({ error: "ContentTask not found" });
      return res.status(200).json({ ok: true, contentTask: ct });
    }
    return res.status(200).json({
      ok: true,
      contentTasks: listContentTasks(slug, parentTaskId),
    });
  }

  if (req.method === "PATCH") {
    const { parentTaskId, id, status, pipeline_state, channel_phases, ...rest } = req.body || {};
    if (!parentTaskId || !id) return res.status(400).json({ error: "Missing parentTaskId or id" });

    if (status !== undefined && !VALID_CONTENT_TASK_STATUSES.includes(status as ContentTaskStatus)) {
      return res.status(400).json({ error: `Invalid status: ${status}` });
    }
    if (channel_phases !== undefined) {
      if (typeof channel_phases !== "object" || channel_phases === null || Array.isArray(channel_phases)) {
        return res.status(400).json({ error: "channel_phases must be an object" });
      }
      for (const [, p] of Object.entries(channel_phases as Record<string, unknown>)) {
        if (typeof p !== "string" || !VALID_CHANNEL_PHASES.includes(p as ChannelPhase)) {
          return res.status(400).json({ error: `Invalid channel_phases value: ${String(p)}` });
        }
      }
    }
    const mediaPolicyRaw = (rest as Record<string, unknown>).media_policy;
    if (mediaPolicyRaw !== undefined) {
      if (typeof mediaPolicyRaw !== "object" || mediaPolicyRaw === null || Array.isArray(mediaPolicyRaw)) {
        return res.status(400).json({ error: "media_policy must be an object { channel: 'required'|'optional' }" });
      }
      for (const [, v] of Object.entries(mediaPolicyRaw as Record<string, unknown>)) {
        if (v !== "required" && v !== "optional") {
          return res.status(400).json({ error: `Invalid media_policy value: ${String(v)} (must be 'required' or 'optional')` });
        }
      }
    }

    // ── Fail-loud media gate escape (SAN-244) ────────────────────────────────
    // `media_status` is the explicit escape that lets a `media_policy="required"`
    // channel reach the dispatch-ready phase without media (ship text-only). The
    // gate itself lives in setChannelPhase(s) → assertMediaReady; here we only
    // validate the field on the way in. (SAN-238's research gate, when added,
    // slots in beside this block.)
    const mediaStatusRaw = (rest as Record<string, unknown>).media_status;
    if (mediaStatusRaw !== undefined && mediaStatusRaw !== "pending" && mediaStatusRaw !== "skipped") {
      return res.status(400).json({
        error: `Invalid media_status: ${String(mediaStatusRaw)} (must be 'pending' or 'skipped')`,
      });
    }

    try {
      let updated = findContentTask(slug, parentTaskId, id);
      if (!updated) return res.status(404).json({ error: "ContentTask not found" });
      const previousStatus = updated.status;

      // Apply generic field updates first (skill, name, target_channels, documents, ...)
      const fieldKeys: (keyof ContentTaskUpdateInput)[] = [
        "name", "skill", "target_channels", "documents",
        "mc_chat_thread_id", "owner",
        "scheduled_for", "clarify_status", "media_policy", "media_status", "author",
      ];
      const fields: ContentTaskUpdateInput = {};
      for (const k of fieldKeys) {
        if (k in rest && (rest as Record<string, unknown>)[k] !== undefined) {
          (fields as Record<string, unknown>)[k] = (rest as Record<string, unknown>)[k];
        }
      }
      if (Object.keys(fields).length > 0) {
        updated = updateContentTask(slug, parentTaskId, id, fields);
      }

      // Status / pipeline_state if provided. When status moves backward (revert),
      // also roll back any channel_phases entries more advanced than the new
      // status allows — keeps the per-channel detail coherent and prevents the
      // forward-only auto-promote from immediately undoing the revert.
      if (status !== undefined) {
        updated = setContentTaskStatus(
          slug,
          parentTaskId,
          id,
          status as ContentTaskStatus,
          (pipeline_state ?? null) as ContentTaskPipelineState | null,
        );
        const movedBackward =
          (VALID_CONTENT_TASK_STATUSES.indexOf(updated.status) <
            VALID_CONTENT_TASK_STATUSES.indexOf(previousStatus));
        if (movedBackward) {
          updated = rollbackChannelPhasesToStatus(slug, parentTaskId, id);
        }
      } else if (pipeline_state !== undefined) {
        updated = setContentTaskStatus(
          slug,
          parentTaskId,
          id,
          updated.status,
          pipeline_state as ContentTaskPipelineState | null,
        );
      }

      // channel_phases (partial merge). Auto-promotes CT.status forward only.
      if (channel_phases !== undefined) {
        updated = setChannelPhases(
          slug,
          parentTaskId,
          id,
          channel_phases as Record<string, ChannelPhase>,
        );
      }

      // Auto-fire feedback triage when a commented draft reaches the "draft" phase.
      // Best-effort and fire-and-forget: never fail the PATCH because triage
      // couldn't start. triggerFeedbackTriage no-ops if the draft has no comments.
      if (channel_phases !== undefined && Object.values(channel_phases).includes("draft")) {
        try {
          await triggerFeedbackTriage({
            slug,
            docPath: `brand/${slug}/content/drafts/${updated.idea_id}`,
            skillId: updated.skill ?? null,
            source: "auto",
          });
        } catch {
          // swallow — triage is non-critical to the content-task update
        }
      }

      return respondAndEmit(updated);
    } catch (e) {
      // Fail-loud media gate (SAN-244) surfaces as 409 Conflict — the CT is in a
      // state that conflicts with the requested phase advance (no real media).
      if (e instanceof MediaGateError) {
        return res.status(e.statusCode).json({ error: e.message });
      }
      return res.status(400).json({ error: (e as Error).message });
    }
  }

  if (req.method === "POST") {
    const { parentTaskId, id, action, document, path: docPath } = req.body || {};
    if (!parentTaskId || !id || !action) {
      return res.status(400).json({ error: "Missing parentTaskId, id or action" });
    }
    try {
      if (action === "attach-document") {
        if (!document?.path) return res.status(400).json({ error: "Missing document.path" });
        const updated = attachDocumentToContentTask(slug, parentTaskId, id, document);
        return respondAndEmit(updated);
      }
      if (action === "detach-document") {
        if (!docPath) return res.status(400).json({ error: "Missing path" });
        const updated = removeDocumentFromContentTask(slug, parentTaskId, id, docPath);
        return respondAndEmit(updated);
      }

      // State machine actions — each validates the source state and walks the
      // CT through the canonical transition. Returns 409 (Conflict) when the
      // CT isn't in an allowed source state.
      const ct = findContentTask(slug, parentTaskId, id);
      if (!ct) return res.status(404).json({ error: "ContentTask not found" });

      if (action === "approve-draft") {
        if (ct.status !== "Draft") {
          return res.status(409).json({
            error: `approve-draft requires status="Draft" (current: "${ct.status}")`,
          });
        }
        // Detect existing media so we land in the right pipeline_state. Media
        // can be present already if the user attached an image while reviewing
        // the text — no need to send them through generating-media in that case.
        // Channel drafts = files whose name matches a target_channel. Robust
        // to the agent rewriting `kind:` in the frontmatter (Sancho writes
        // `kind: draft` once a channel draft is finished — the previous
        // `kind === "channel-draft"` filter rejected everything in that case
        // and made approve-media falsely 409 with "no media attached").
        const channelSet = new Set(ct.target_channels || []);
        const drafts = listDrafts(slug, ct.idea_id).filter((d) => {
          const ch = d.meta.channel || d.relPath.split("/").pop()?.replace(".md", "") || "";
          return channelSet.has(ch);
        });
        const hasMedia = drafts.some((d) => (d.meta.media?.length ?? 0) > 0);
        const pipelineState: ContentTaskPipelineState = hasMedia ? "media-review" : "generating-media";
        const updated = setContentTaskStatus(slug, parentTaskId, id, "Pending Media", pipelineState);
        return respondAndEmit(updated);
      }

      if (action === "approve-media") {
        if (ct.status !== "Pending Media") {
          return res.status(409).json({
            error: `approve-media requires status="Pending Media" (current: "${ct.status}")`,
          });
        }
        // Don't let users skip media: require at least one asset on any draft.
        // Channel drafts = files whose name matches a target_channel. Robust
        // to the agent rewriting `kind:` in the frontmatter (Sancho writes
        // `kind: draft` once a channel draft is finished — the previous
        // `kind === "channel-draft"` filter rejected everything in that case
        // and made approve-media falsely 409 with "no media attached").
        const channelSet = new Set(ct.target_channels || []);
        const drafts = listDrafts(slug, ct.idea_id).filter((d) => {
          const ch = d.meta.channel || d.relPath.split("/").pop()?.replace(".md", "") || "";
          return channelSet.has(ch);
        });
        const hasMedia = drafts.some((d) => (d.meta.media?.length ?? 0) > 0);
        if (!hasMedia) {
          return res.status(409).json({
            error: "approve-media requires at least one media asset attached to the draft(s)",
          });
        }
        const updated = setContentTaskStatus(slug, parentTaskId, id, "Ready", null);
        return respondAndEmit(updated);
      }

      if (action === "publish") {
        if (ct.status !== "Ready") {
          return res.status(409).json({
            error: `publish requires status="Ready" (current: "${ct.status}")`,
          });
        }
        const updated = setContentTaskStatus(slug, parentTaskId, id, "Published", null);
        return respondAndEmit(updated);
      }

      if (action === "discard" || action === "defer") {
        if (ct.status === "Published" || ct.status === "Discarded" || ct.status === "Deferred") {
          return res.status(409).json({
            error: `${action} not allowed from terminal status "${ct.status}"`,
          });
        }
        const target: ContentTaskStatus = action === "discard" ? "Discarded" : "Deferred";
        const updated = setContentTaskStatus(slug, parentTaskId, id, target, null);
        return respondAndEmit(updated);
      }

      return res.status(400).json({ error: `Unknown action: ${action}` });
    } catch (e) {
      return res.status(400).json({ error: (e as Error).message });
    }
  }

  res.setHeader("Allow", "GET, PATCH, POST");
  return res.status(405).json({ error: "Method not allowed" });
}

export default withErrorHandler(handler);
