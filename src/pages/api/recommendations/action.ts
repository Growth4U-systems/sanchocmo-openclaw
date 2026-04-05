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

  if (!req.ctx?.isAdmin) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const { slug: rSlug, id: recId, action, projectId } = req.body;
  if (!rSlug || !recId || !action) {
    return res.status(400).json({ error: "Missing slug, id, or action" });
  }

  const brandDir = path.join(BASE, "brand", rSlug);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function findAndUpdate(filePath: string, updateFn: (items: any[], idx: number) => void): boolean {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = readJSON<any>(filePath, []);
    const items: Record<string, unknown>[] = Array.isArray(raw) ? raw : (raw.ideas || raw.ideas_generated || raw.recommendations || []);
    const idx = items.findIndex((i) => (i.id || i.rec_id) === recId);
    if (idx === -1) return false;
    updateFn(items, idx);
    if (Array.isArray(raw)) {
      writeJSON(filePath, items);
    } else {
      writeJSON(filePath, raw);
    }
    return true;
  }

  const searchFiles = [
    path.join(brandDir, "atalaya", "profiles-pending.json"),
    path.join(brandDir, "atalaya", "competitors-pending.json"),
    path.join(brandDir, "atalaya", "ads-pending.json"),
    path.join(brandDir, "atalaya", "pending-ideas.json"),
    path.join(brandDir, "monitoring", "pending-recommendations.json"),
    path.join(brandDir, "trust-engine", "recommendations.json"),
  ];

  let found = false;
  for (const fp of searchFiles) {
    if (!fs.existsSync(fp)) continue;
    try {
      found = findAndUpdate(fp, (items, idx) => {
        const item = items[idx];
        if (action === "dismiss") {
          item.status = "dismissed";
          item.actioned_at = new Date().toISOString();
        } else if (action === "approve") {
          // Move to ideas.json
          const ideasPath = path.join(brandDir, "ideas.json");
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const ideas = readJSON<any>(ideasPath, { ideas: [] });
          if (!ideas.ideas) ideas.ideas = [];
          const isContact = item.type === "contact" || item.contact;
          const adapted = (item.adapted_idea || {}) as Record<string, unknown>;
          ideas.ideas.push({
            id: item.id || recId,
            type: isContact ? "contact" : "content",
            status: "new",
            title: item.title || adapted.title || "",
            description: item.description || adapted.description || "",
            source: item.source || "atalaya",
            list: isContact ? (item.contact?.target_channel || "outreach") : (item.content?.list || "keywords"),
            channels: item.content?.channels || adapted.recommended_channels || [],
            target_channel: item.contact?.target_channel || "",
            priority_score: item.priority === "high" ? 80 : item.priority === "medium" ? 50 : 20,
            created_at: new Date().toISOString(),
            notes: item.rationale || "",
          });
          writeJSON(ideasPath, ideas);
          item.status = "approved";
          item.actioned_at = new Date().toISOString();
          item.converted_to = "idea:" + (item.id || recId);
        } else if (action === "convert") {
          const pId = projectId || item.operational?.linked_project || item.linked_project || item.linkedProject;
          if (!pId) throw new Error("No project specified");
          const projectsDir = path.join(brandDir, "projects");
          const projDirs = fs.readdirSync(projectsDir).filter((d) => d.startsWith(pId));
          if (projDirs.length === 0) throw new Error("Project not found: " + pId);
          const tasksPath = path.join(projectsDir, projDirs[0], "tasks.json");
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let tasks: any[] = [];
          try {
            const td = readJSON(tasksPath, []);
            tasks = Array.isArray(td) ? td : ((td as Record<string, unknown>).tasks as unknown[]) || [];
          } catch { /* empty */ }
          const taskId = projDirs[0] + "-T" + String(tasks.length + 1).padStart(2, "0");
          tasks.push({
            id: taskId,
            name: item.title || "",
            description: (item.rationale || "") + (item.operational?.suggested_action ? "\n\n**Accion sugerida:** " + item.operational.suggested_action : ""),
            status: "todo",
            source: item.source || "recommendation",
            created_at: new Date().toISOString(),
          });
          writeJSON(tasksPath, tasks);
          item.status = "converted";
          item.actioned_at = new Date().toISOString();
          item.converted_to = "task:" + taskId;
          item.converted_to_task = taskId;
        }
      });
      if (found) break;
    } catch { /* empty */ }
  }

  if (found) {
    return res.status(200).json({ ok: true });
  } else {
    return res.status(404).json({ error: "Recommendation not found" });
  }
}

export default compose(withErrorHandler, withAuth)(handler);
