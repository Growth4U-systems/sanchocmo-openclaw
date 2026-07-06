import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";

type Action = "approve" | "dismiss" | "convert";

type RecordItem = {
  id?: string;
  rec_id?: string;
  status?: string;
  actioned_at?: string;
  converted_to?: string;
  converted_to_task?: string;
  title?: string;
  description?: string;
  type?: string;
  source?: string;
  priority?: string;
  rationale?: string;
  idea_ids?: string[];
  suggested_project?: string;
  task_type?: string;
  contact?: unknown;
  adapted_idea?: { title?: string; description?: string };
  linked_project?: string;
  linkedProject?: string;
  operational?: { linked_project?: string; suggested_action?: string };
};

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

function findAndUpdate(
  filePath: string,
  recId: string,
  updateFn: (items: RecordItem[], idx: number) => void,
): boolean {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  const items: RecordItem[] = Array.isArray(raw)
    ? raw
    : raw.ideas || raw.ideas_generated || raw.recommendations || [];
  const idx = items.findIndex((i) => (i.id || i.rec_id) === recId);
  if (idx === -1) return false;
  updateFn(items, idx);
  if (Array.isArray(raw)) {
    fs.writeFileSync(filePath, JSON.stringify(items, null, 2));
  } else {
    fs.writeFileSync(filePath, JSON.stringify(raw, null, 2));
  }
  return true;
}

function applyApprove(brandDir: string, item: RecordItem, recId: string, projectId: string | undefined) {
  const isGroupedTask = item.idea_ids && item.idea_ids.length > 0;

  if (isGroupedTask) {
    const pId = projectId || item.suggested_project || "";
    const projsDir = path.join(brandDir, "projects");
    let targetProjDir: string | null = null;
    let targetProjId = pId;

    if (pId) {
      targetProjDir = resolveProjectDir(projsDir, pId);
    }
    if (!targetProjDir) {
      const projDirs = fs.existsSync(projsDir)
        ? fs
            .readdirSync(projsDir)
            .filter((d) => d.startsWith("P") && fs.statSync(path.join(projsDir, d)).isDirectory())
        : [];
      if (projDirs.length > 0) {
        targetProjDir = path.join(projsDir, projDirs[0]);
        targetProjId = projDirs[0].split("-")[0];
      }
    }
    if (!targetProjDir) return;

    const tasksFile = path.join(targetProjDir, "tasks.json");
    let tasks: Array<{ id?: string; [k: string]: unknown }> = [];
    try {
      tasks = JSON.parse(fs.readFileSync(tasksFile, "utf-8"));
    } catch {}
    if (!Array.isArray(tasks)) tasks = [];
    const maxNum = tasks.reduce((m, t) => {
      const match = (t.id || "").match(/-T(\d+)$/);
      return match ? Math.max(m, parseInt(match[1])) : m;
    }, 0);
    const taskId = targetProjId + "-T" + String(maxNum + 1).padStart(2, "0");
    tasks.push({
      id: taskId,
      name: item.title || "",
      description: item.description || "",
      type: item.task_type || "content",
      idea_ids: item.idea_ids,
      status: "todo",
      owner: "Sancho",
      created_at: new Date().toISOString(),
    });
    fs.writeFileSync(tasksFile, JSON.stringify(tasks, null, 2));
    item.converted_to = "task:" + taskId;

    try {
      const ideasPath = path.join(brandDir, "ideas.json");
      const ideasData = JSON.parse(fs.readFileSync(ideasPath, "utf-8")) as {
        ideas?: Array<{ id: string; status?: string; updated_at?: string }>;
      };
      for (const idea of ideasData.ideas || []) {
        if (item.idea_ids?.includes(idea.id)) {
          idea.status = "assigned";
          idea.updated_at = new Date().toISOString();
        }
      }
      fs.writeFileSync(ideasPath, JSON.stringify(ideasData, null, 2));
    } catch {}
  } else {
    const ideasPath = path.join(brandDir, "ideas.json");
    let ideas: {
      ideas?: Array<Record<string, unknown>>;
    } = { ideas: [] };
    try {
      ideas = JSON.parse(fs.readFileSync(ideasPath, "utf-8"));
    } catch {}
    if (!ideas.ideas) ideas.ideas = [];
    const isContact = item.type === "contact" || item.contact !== undefined;
    ideas.ideas.push({
      id: item.id || recId,
      type: isContact ? "contact" : "content",
      status: "new",
      title: item.title || item.adapted_idea?.title || "",
      description: item.description || item.adapted_idea?.description || "",
      source: item.source || "recommendation",
      priority_score:
        item.priority === "high" ? 80 : item.priority === "medium" ? 50 : 20,
      created_at: new Date().toISOString(),
      notes: item.rationale || "",
    });
    fs.writeFileSync(ideasPath, JSON.stringify(ideas, null, 2));
  }

  item.status = "approved";
  item.actioned_at = new Date().toISOString();
}

function applyConvert(brandDir: string, item: RecordItem, projectId: string | undefined) {
  const pId =
    projectId ||
    item.operational?.linked_project ||
    item.linked_project ||
    item.linkedProject;
  if (!pId) throw new Error("No project specified");
  const projectsDir = path.join(brandDir, "projects");
  const projDirs = fs.readdirSync(projectsDir).filter((d) => d.startsWith(pId));
  if (projDirs.length === 0) throw new Error("Project not found: " + pId);
  const tasksPath = path.join(projectsDir, projDirs[0], "tasks.json");
  let tasks: Array<Record<string, unknown>> = [];
  try {
    const raw = JSON.parse(fs.readFileSync(tasksPath, "utf-8"));
    tasks = Array.isArray(raw) ? raw : raw.tasks || [];
  } catch {}
  const taskId = projDirs[0] + "-T" + String(tasks.length + 1).padStart(2, "0");
  tasks.push({
    id: taskId,
    name: item.title || "",
    description:
      (item.rationale || "") +
      (item.operational?.suggested_action
        ? "\n\n**Accion sugerida:** " + item.operational.suggested_action
        : ""),
    status: "todo",
    source: item.source || "recommendation",
    created_at: new Date().toISOString(),
  });
  fs.writeFileSync(tasksPath, JSON.stringify(tasks, null, 2));
  item.status = "converted";
  item.actioned_at = new Date().toISOString();
  item.converted_to = "task:" + taskId;
  item.converted_to_task = taskId;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }
  if (!req.ctx?.isAdmin) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const { slug, id: recId, action, projectId } = (req.body || {}) as {
    slug?: string;
    id?: string;
    action?: Action;
    projectId?: string;
  };
  if (!slug || !recId || !action) {
    return res.status(400).json({ error: "Missing slug, id or action" });
  }

  const brandDir = path.join(BASE, "brand", slug);
  const searchFiles = [
    path.join(brandDir, "recommendations.json"),
    path.join(brandDir, "monitoring", "pending-recommendations.json"),
  ];

  let found = false;
  for (const fp of searchFiles) {
    if (!fs.existsSync(fp)) continue;
    try {
      found = findAndUpdate(fp, recId, (items, idx) => {
        const item = items[idx];
        if (action === "dismiss") {
          item.status = "dismissed";
          item.actioned_at = new Date().toISOString();
        } else if (action === "approve") {
          applyApprove(brandDir, item, recId, projectId);
        } else if (action === "convert") {
          applyConvert(brandDir, item, projectId);
        }
      });
      if (found) break;
    } catch {}
  }

  if (!found) {
    return res.status(404).json({ error: "Recommendation not found" });
  }
  return res.status(200).json({ ok: true });
}

export default compose(withErrorHandler, withAuth)(handler);
