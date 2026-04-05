import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";

function resolveProjectDir(projectsDir: string, projectId: string): string | null {
  if (!projectId) return null;
  try {
    const dirs = fs.readdirSync(projectsDir, { withFileTypes: true });
    const match = dirs.find((d) => d.isDirectory() && d.name.startsWith(projectId + "-"));
    if (match) return path.join(projectsDir, match.name);
    const exact = dirs.find((d) => d.isDirectory() && d.name === projectId);
    if (exact) return path.join(projectsDir, exact.name);
  } catch {}
  return null;
}

/**
 * POST /api/projects/project-archive — Archive a project.
 * Body: { slug, projectId, reason? }
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const { slug, projectId, reason } = req.body;
  if (!slug || !projectId) {
    return res.status(400).json({ error: "Missing params" });
  }

  if (req.ctx?.clientSlug && req.ctx.clientSlug !== slug) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const projectsDir = path.join(BASE, "brand", slug, "projects");

  // Update project.json
  const projDir = resolveProjectDir(projectsDir, projectId);
  if (projDir) {
    const projFile = path.join(projDir, "project.json");
    try {
      const proj = JSON.parse(fs.readFileSync(projFile, "utf-8"));
      proj.status = "archived";
      proj.archived_at = new Date().toISOString().slice(0, 10);
      proj.archive_reason = reason || "Archivado por el cliente";
      fs.writeFileSync(projFile, JSON.stringify(proj, null, 2));
    } catch {}
  }

  // Append to strategic-plan/current.md if it exists
  const planFile = path.join(BASE, "brand", slug, "strategic-plan", "current.md");
  try {
    if (fs.existsSync(planFile)) {
      const plan = fs.readFileSync(planFile, "utf-8");
      const archiveEntry = `\n| ${projectId} | Archivado | ${reason || "Archivado por el cliente"} | ${new Date().toISOString().slice(0, 10)} |`;
      if (plan.includes("## Proyectos archivados")) {
        fs.writeFileSync(
          planFile,
          plan.replace("## Proyectos archivados", "## Proyectos archivados" + archiveEntry)
        );
      } else {
        fs.appendFileSync(
          planFile,
          "\n\n## Proyectos archivados\n\n| ID | Estado | Motivo | Fecha |\n|---|---|---|---|" +
            archiveEntry +
            "\n"
        );
      }
    }
  } catch {}

  return res.status(200).json({ ok: true, projectId, status: "archived", reason });
}

export default compose(withErrorHandler, withAuth)(handler);
