/**
 * /api/content-engine/content-tasks
 *
 *   GET    ?slug=X&parentTaskId=Y                                   → list
 *   GET    ?slug=X&parentTaskId=Y&id=Z                              → single
 *   PATCH  { slug, parentTaskId, id, status?, pipeline_state?, ... } → update status and/or fields
 *   POST   { slug, parentTaskId, id, action: "attach-document" | "detach-document", document?, path? }
 *
 * ContentTasks are nested under a parent Task with `type === "content"`.
 * Storage: parent's `content_tasks[]` field in `tasks.json`.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import {
  listContentTasks,
  findContentTask,
  setContentTaskStatus,
  updateContentTask,
  attachDocumentToContentTask,
  removeDocumentFromContentTask,
  ContentTaskUpdateInput,
} from "@/lib/data/content-tasks";
import { getDraftStatuses } from "@/lib/data/drafts";
import { ContentTaskStatus, ContentTaskPipelineState, VALID_CONTENT_TASK_STATUSES, type ContentTask } from "@/types";

function withDraftStatuses(slug: string, ct: ContentTask): ContentTask & { draft_statuses: Record<string, string> } {
  return {
    ...ct,
    draft_statuses: getDraftStatuses(slug, ct.idea_id, ct.target_channels || []),
  };
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const slug = (req.query.slug || req.body?.slug) as string;
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  if (req.method === "GET") {
    const parentTaskId = req.query.parentTaskId as string;
    const id = req.query.id as string | undefined;
    if (!parentTaskId) return res.status(400).json({ error: "Missing parentTaskId" });

    if (id) {
      const ct = findContentTask(slug, parentTaskId, id);
      if (!ct) return res.status(404).json({ error: "ContentTask not found" });
      return res.status(200).json({ ok: true, contentTask: withDraftStatuses(slug, ct) });
    }
    const list = listContentTasks(slug, parentTaskId);
    return res.status(200).json({
      ok: true,
      contentTasks: list.map((ct) => withDraftStatuses(slug, ct)),
    });
  }

  if (req.method === "PATCH") {
    const { parentTaskId, id, status, pipeline_state, ...rest } = req.body || {};
    if (!parentTaskId || !id) return res.status(400).json({ error: "Missing parentTaskId or id" });

    if (status !== undefined && !VALID_CONTENT_TASK_STATUSES.includes(status as ContentTaskStatus)) {
      return res.status(400).json({ error: `Invalid status: ${status}` });
    }

    try {
      let updated = findContentTask(slug, parentTaskId, id);
      if (!updated) return res.status(404).json({ error: "ContentTask not found" });

      // Apply generic field updates first (skill, name, target_channels, documents, ...)
      const fieldKeys: (keyof ContentTaskUpdateInput)[] = [
        "name", "skill", "target_channels", "documents",
        "mc_chat_thread_id", "discord_thread_id", "owner",
        "scheduled_for", "clarify_status",
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

      // Then status/pipeline_state if provided
      if (status !== undefined) {
        updated = setContentTaskStatus(
          slug,
          parentTaskId,
          id,
          status as ContentTaskStatus,
          (pipeline_state ?? null) as ContentTaskPipelineState | null,
        );
      } else if (pipeline_state !== undefined) {
        // Pipeline-state-only update without changing status: re-apply current status
        updated = setContentTaskStatus(
          slug,
          parentTaskId,
          id,
          updated.status,
          pipeline_state as ContentTaskPipelineState | null,
        );
      }

      return res.status(200).json({ ok: true, contentTask: updated });
    } catch (e) {
      return res.status(400).json({ error: (e as Error).message });
    }
  }

  if (req.method === "POST") {
    const { parentTaskId, id, action, document, path } = req.body || {};
    if (!parentTaskId || !id || !action) {
      return res.status(400).json({ error: "Missing parentTaskId, id or action" });
    }
    try {
      if (action === "attach-document") {
        if (!document?.path) return res.status(400).json({ error: "Missing document.path" });
        const updated = attachDocumentToContentTask(slug, parentTaskId, id, document);
        return res.status(200).json({ ok: true, contentTask: updated });
      }
      if (action === "detach-document") {
        if (!path) return res.status(400).json({ error: "Missing path" });
        const updated = removeDocumentFromContentTask(slug, parentTaskId, id, path);
        return res.status(200).json({ ok: true, contentTask: updated });
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
