import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withAuth, withErrorHandler, canAccessSlug } from "@/lib/api-middleware";
import { getNextChildTaskId, getNextContentSubtaskId, getNextProjectId } from "@/lib/data/tasks";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }
  const slug = (req.query.slug || req.ctx?.clientSlug) as string;
  const kind = (req.query.kind || "project") as string;
  const parentId = req.query.parent_id as string | undefined;
  if (!slug) return res.status(400).json({ error: "Missing slug" });
  if (!canAccessSlug(req.ctx, slug)) return res.status(403).json({ error: "Forbidden" });

  const nextId = kind === "content_subtask"
    ? getNextContentSubtaskId(slug, parentId || "")
    : kind === "child"
      ? getNextChildTaskId(slug, parentId || "")
      : getNextProjectId(slug);
  return res.status(200).json({ ok: true, nextId });
}

export default compose(withErrorHandler, withAuth)(handler);
