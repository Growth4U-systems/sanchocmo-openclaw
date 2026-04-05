import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";
import { readJSON, writeJSON } from "@/lib/data/json-io";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const { slug, recommendationId, action, projectOverride } = req.body;
  if (!slug || !recommendationId || !action) {
    return res.status(400).json({ error: "Missing slug, recommendationId, or action" });
  }
  if (req.ctx?.clientSlug && req.ctx.clientSlug !== slug) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const recFile = path.join(BASE, "brand", slug, "monitoring", "pending-recommendations.json");
  if (!fs.existsSync(recFile)) {
    return res.status(404).json({ error: "No recommendations file" });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = readJSON<any>(recFile, { recommendations: [] });
  const rec = (data.recommendations || []).find((r: { id: string }) => r.id === recommendationId);
  if (!rec) {
    return res.status(404).json({ error: "Recommendation not found" });
  }

  const now = new Date().toISOString();

  if (action === "approve") {
    rec.status = "approved";
    rec.approved_at = now;
    rec.actioned_at = now;
  } else if (action === "dismiss") {
    rec.status = "dismissed";
    rec.actioned_at = now;
  } else if (action === "convert") {
    rec.status = "converted";
    rec.actioned_at = now;
    const projRef = projectOverride || rec.linked_project || rec.linkedProject;
    if (!projRef) {
      return res.status(400).json({ error: "No linked project \u2014 assign a project first" });
    }
    if (projectOverride) rec.linkedProject = projectOverride;

    const projectsDir = path.join(BASE, "brand", slug, "projects");
    try {
      const dirs = fs.readdirSync(projectsDir, { withFileTypes: true });
      const projDir = dirs.find((d) => d.isDirectory() && d.name.startsWith(projRef));
      if (projDir) {
        const tasksFile = path.join(projectsDir, projDir.name, "tasks.json");
        let tasks: Record<string, unknown>[] = [];
        try {
          const td = readJSON<Record<string, unknown>>(tasksFile, {});
          tasks = Array.isArray(td) ? td : ((td.tasks as Record<string, unknown>[]) || []);
        } catch { /* empty */ }
        const taskNum = tasks.length + 1;
        const taskId = `${projRef}-T${String(taskNum).padStart(2, "0")}`;
        tasks.push({
          id: taskId,
          name: rec.title,
          description: `${rec.rationale || rec.description || ""}\n\n**Accion sugerida:** ${rec.suggested_action || ""}`,
          status: "todo",
          source: "performance-analysis",
          created_at: now,
        });
        writeJSON(tasksFile, tasks);
        rec.converted_to_task = taskId;
      }
    } catch { /* empty */ }
  } else {
    return res.status(400).json({ error: "Invalid action. Use: approve, dismiss, convert" });
  }

  data.updated_at = now;
  writeJSON(recFile, data);
  return res.status(200).json({ ok: true, recommendation: rec });
}

export default compose(withErrorHandler, withAuth)(handler);
