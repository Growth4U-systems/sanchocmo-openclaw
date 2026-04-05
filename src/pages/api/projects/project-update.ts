import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
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

function regenerate(): void {
  try {
    execSync("python3 scripts/regenerate.py", { cwd: BASE, timeout: 15000 });
  } catch (e) {
    console.error("[project-update] regenerate error:", (e as Error).message);
  }
}

const ALLOWED_PROJECT_FIELDS = [
  "name",
  "description",
  "approach",
  "objective",
  "status",
  "review_date",
  "strategy",
];

/**
 * POST /api/projects/project-update — Update project.json fields.
 * Body: { slug, projectId, fields, sourceThread? }
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const { slug, projectId, fields } = req.body;
  if (!slug || !projectId || !fields) {
    return res.status(400).json({ error: "Missing params" });
  }

  if (req.ctx?.clientSlug && req.ctx.clientSlug !== slug) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const projectsDir = path.join(BASE, "brand", slug, "projects");
  const projDir = resolveProjectDir(projectsDir, projectId);
  if (!projDir) {
    return res.status(404).json({ error: "Project not found" });
  }

  const projFile = path.join(projDir, "project.json");
  let project: Record<string, unknown>;
  try {
    project = JSON.parse(fs.readFileSync(projFile, "utf-8"));
  } catch {
    return res.status(404).json({ error: "project.json not found" });
  }

  for (const [k, v] of Object.entries(fields as Record<string, unknown>)) {
    if (ALLOWED_PROJECT_FIELDS.includes(k)) project[k] = v;
  }
  fs.writeFileSync(projFile, JSON.stringify(project, null, 2));

  regenerate();

  return res.status(200).json({ ok: true, project });
}

export default compose(withErrorHandler, withAuth)(handler);
