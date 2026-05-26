import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withAuth, withErrorHandler, canAccessSlug } from "@/lib/api-middleware";
import { createTask, listProjectsWithTasks, listUnifiedTaskRowsAsync } from "@/lib/data/tasks";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const slug = (req.query.slug || req.body?.slug || req.ctx?.clientSlug) as string;
  if (!slug) return res.status(400).json({ error: "Missing slug" });
  if (!canAccessSlug(req.ctx, slug)) return res.status(403).json({ error: "Forbidden" });

  if (req.method === "GET") {
    const include = req.query.include as string | undefined;
    const type = req.query.type as string | undefined;
    const projects = await listProjectsWithTasks(slug);
    if (type === "project" || include === "children") {
      return res.status(200).json({ ok: true, slug, projects });
    }
    const rows = await listUnifiedTaskRowsAsync(slug);
    if (type) {
      const normalizedType = type === "content_subtask" ? "content_task" : type;
      return res.status(200).json({
        ok: true,
        slug,
        tasks: rows.filter((task) => task.type === normalizedType),
      });
    }
    return res.status(200).json({
      ok: true,
      slug,
      tasks: rows,
    });
  }

  if (req.method === "POST") {
    const task = await createTask(slug, req.body || {});
    return res.status(201).json({ ok: true, task });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: `Method ${req.method} not allowed` });
}

export default compose(withErrorHandler, withAuth)(handler);
