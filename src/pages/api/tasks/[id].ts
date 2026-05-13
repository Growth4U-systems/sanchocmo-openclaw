import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withAuth, withErrorHandler } from "@/lib/api-middleware";
import { getTask, updateTask } from "@/lib/data/tasks";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const slug = (req.query.slug || req.body?.slug || req.ctx?.clientSlug) as string;
  const id = req.query.id as string;
  if (!slug || !id) return res.status(400).json({ error: "Missing slug or id" });
  if (req.ctx?.clientSlug && req.ctx.clientSlug !== slug) return res.status(403).json({ error: "Forbidden" });

  if (req.method === "GET") {
    const task = await getTask(slug, id);
    if (!task) return res.status(404).json({ error: "Task not found" });
    return res.status(200).json({ ok: true, task });
  }

  if (req.method === "PATCH") {
    const task = await updateTask(slug, id, req.body?.fields || req.body || {});
    return res.status(200).json({ ok: true, task });
  }

  res.setHeader("Allow", "GET, PATCH");
  return res.status(405).json({ error: `Method ${req.method} not allowed` });
}

export default compose(withErrorHandler, withAuth)(handler);
