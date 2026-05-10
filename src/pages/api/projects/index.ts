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
      // Accept both P{nn} and P-{name} prefixes (e.g. P14, P-Content-Semana-18)
      if (!d.isDirectory() || !d.name.match(/^P[\d-]/)) continue;
      const dirPath = path.join(projectsDir, d.name);
      // For "P-Content-Semana-18" the dir name is itself the canonical id;
      // for "P14-Content-Engine" the canonical id is "P14" (set in project.json).
      // The split("-")[0] works for the latter; we fix the former by reading
      // project.json#id below (which overrides this initial guess).
      let project: Record<string, unknown> = {
        id: d.name.startsWith("P-") ? d.name : d.name.split("-")[0],
        slug: d.name,
        name: d.name,
      };
      let tasks: unknown[] = [];
      try {
        project = {
          ...project,
          ...JSON.parse(fs.readFileSync(path.join(dirPath, "project.json"), "utf-8")),
        };
      } catch {}
      try {
        const td = JSON.parse(fs.readFileSync(path.join(dirPath, "tasks.json"), "utf-8"));
        tasks = Array.isArray(td) ? td : td.tasks || [];
      } catch {}
      // Per-channel state lives on `ct.channel_phases` (in tasks.json) since
      // the draft `meta.status` refactor; no enrichment needed here.
      results.push({ ...project, tasks });
    }
  } catch {}

  return res.status(200).json({ ok: true, slug, projects: results });
}

export default compose(withErrorHandler, withAuth)(handler);
