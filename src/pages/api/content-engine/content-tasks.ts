/**
 * /api/content-engine/content-tasks
 *
 *   GET   ?slug=X&parentTaskId=Y            → list ContentTasks under a parent
 *   GET   ?slug=X&parentTaskId=Y&id=Z       → single ContentTask
 *   PATCH { slug, parentTaskId, id, status?, pipeline_state? }  → update status
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
} from "@/lib/data/content-tasks";
import { ContentTaskStatus, ContentTaskPipelineState, VALID_CONTENT_TASK_STATUSES } from "@/types";

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
      return res.status(200).json({ ok: true, contentTask: ct });
    }
    const list = listContentTasks(slug, parentTaskId);
    return res.status(200).json({ ok: true, contentTasks: list });
  }

  if (req.method === "PATCH") {
    const { parentTaskId, id, status, pipeline_state } = req.body || {};
    if (!parentTaskId || !id) return res.status(400).json({ error: "Missing parentTaskId or id" });
    if (status && !VALID_CONTENT_TASK_STATUSES.includes(status as ContentTaskStatus)) {
      return res.status(400).json({ error: `Invalid status: ${status}` });
    }
    try {
      const updated = status
        ? setContentTaskStatus(
            slug,
            parentTaskId,
            id,
            status as ContentTaskStatus,
            (pipeline_state ?? null) as ContentTaskPipelineState | null,
          )
        : findContentTask(slug, parentTaskId, id);
      if (!updated) return res.status(404).json({ error: "ContentTask not found" });
      return res.status(200).json({ ok: true, contentTask: updated });
    } catch (e) {
      return res.status(400).json({ error: (e as Error).message });
    }
  }

  res.setHeader("Allow", "GET, PATCH");
  return res.status(405).json({ error: "Method not allowed" });
}

export default withErrorHandler(handler);
