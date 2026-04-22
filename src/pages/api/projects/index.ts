import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";

/**
 * GET /api/projects?slug=X — List all projects for a client.
 * Scans brand/{slug}/projects/ for P* directories, reads project.json + tasks.json.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const slug = (req.query.slug as string) || req.ctx?.clientSlug;
  if (!slug) {
    return res.status(400).json({ error: "Missing slug" });
  }

  // Portal clients can only access their own slug
  if (req.ctx?.clientSlug && req.ctx.clientSlug !== slug) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const projectsDir = path.join(BASE, "brand", slug, "projects");
  const results: Record<string, unknown>[] = [];

  try {
    const dirs = fs.readdirSync(projectsDir, { withFileTypes: true });
    for (const d of dirs) {
      if (!d.isDirectory() || !d.name.match(/^P\d+/)) continue;
      const dirPath = path.join(projectsDir, d.name);
      let project: Record<string, unknown> = {
        id: d.name.split("-")[0],
        slug: d.name,
        name: d.name,
        status: "todo",
      };
      let tasks: unknown[] = [];
      try {
        project = {
          ...project,
          ...JSON.parse(fs.readFileSync(path.join(dirPath, "project.json"), "utf-8")),
        };
      } catch {}
      if (!project.status) project.status = "todo";
      try {
        const td = JSON.parse(fs.readFileSync(path.join(dirPath, "tasks.json"), "utf-8"));
        tasks = Array.isArray(td) ? td : td.tasks || [];
      } catch {}
      results.push({ ...project, tasks });
    }
  } catch {}

  return res.status(200).json({ ok: true, slug, projects: results });
}

export default compose(withErrorHandler, withAuth)(handler);
