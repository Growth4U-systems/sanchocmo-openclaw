import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withAuth, withErrorHandler } from "@/lib/api-middleware";
import { createTask, listProjectsWithTasks } from "@/lib/data/tasks";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const slug = (req.query.slug || req.body?.slug || req.ctx?.clientSlug) as string;
  if (!slug) return res.status(400).json({ error: "Missing slug" });
  if (req.ctx?.clientSlug && req.ctx.clientSlug !== slug) return res.status(403).json({ error: "Forbidden" });

  if (req.method === "GET") {
    const include = req.query.include as string | undefined;
    const type = req.query.type as string | undefined;
    const projects = listProjectsWithTasks(slug);
    if (type === "project" || include === "children") {
      return res.status(200).json({ ok: true, slug, projects });
    }
    return res.status(200).json({
      ok: true,
      slug,
      tasks: projects.flatMap((entry) => [
        { ...entry.project, type: "project", parent_id: null },
        ...entry.tasks.map((task) => ({ ...task, parent_id: entry.project.id })),
      ]),
    });
  }

  if (req.method === "POST") {
    const task = createTask(slug, req.body || {});
    return res.status(201).json({ ok: true, task });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: `Method ${req.method} not allowed` });
}

export default compose(withErrorHandler, withAuth)(handler);
