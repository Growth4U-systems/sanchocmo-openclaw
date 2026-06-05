import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { compose, withErrorHandler, withAuth, canAccessSlug } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";
import { loadIdeas, saveIdeas } from "@/lib/data/ideas";
import {
  applyTaskAnchors,
  TaskAnchorError,
  type TaskCreateInput,
} from "@/lib/data/task-create-helpers";

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

function createNewProject(projectsDir: string, name: string): string {
  let maxId = 0;
  try {
    const dirs = fs.readdirSync(projectsDir, { withFileTypes: true });
    for (const d of dirs) {
      const m = d.name.match(/^P(\d+)/);
      if (m) maxId = Math.max(maxId, parseInt(m[1], 10));
    }
  } catch { /* empty */ }
  const projRef = `P${String(maxId + 1).padStart(2, "0")}`;
  const dirName = `${projRef}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "").slice(0, 60)}`;
  const newDir = path.join(projectsDir, dirName);
  fs.mkdirSync(newDir, { recursive: true });
  fs.writeFileSync(path.join(newDir, "project.json"), JSON.stringify({
    id: projRef,
    slug: dirName,
    name,
    status: "active",
    created_at: new Date().toISOString(),
    source: "idea-bank",
  }, null, 2));
  fs.writeFileSync(path.join(newDir, "tasks.json"), "[]");
  return projRef;
}

/**
 * POST /api/projects/create-batch — Create batch task from ideas.
 * Body: { slug, projectId, name, batchType?, ideaIds, skill, deliverable_file }
 * projectId can be "__NEW__" to create a new project on the fly (uses task name as project name).
 *
 * REQUIRED anchors: `skill` and `deliverable_file` — enforced via
 * `applyTaskAnchors`. See src/lib/data/task-create-helpers.ts for rationale.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const { slug, name, batchType, ideaIds, skill, deliverable_file } = req.body;
  let { projectId } = req.body;
  if (!slug || !projectId || !name || !ideaIds || !ideaIds.length) {
    return res.status(400).json({ error: "Missing slug, projectId, name, or ideaIds" });
  }

  if (!canAccessSlug(req.ctx, slug)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  // Support __NEW__ to create a project on the fly
  const projDir = path.join(BASE, "brand", slug, "projects");
  if (projectId === "__NEW__") {
    projectId = createNewProject(projDir, name);
  }

  const resolvedDir = resolveProjectDir(projDir, projectId);
  if (!resolvedDir) {
    return res.status(404).json({ error: "Project not found: " + projectId });
  }

  // Load tasks and generate next task ID
  const tasksFilePath = path.join(resolvedDir, "tasks.json");
  let tasks: Record<string, unknown>[] = [];
  try {
    tasks = JSON.parse(fs.readFileSync(tasksFilePath, "utf-8"));
  } catch {}
  const maxNum = tasks.reduce((m: number, t: Record<string, unknown>) => {
    const match = (t.id as string).match(/-T(\d+)$/);
    return match ? Math.max(m, parseInt(match[1])) : m;
  }, 0);
  const taskId = `${projectId}-T${String(maxNum + 1).padStart(2, "0")}`;

  // Create the batch task. Every task must be born with the 3 anchors:
  // skill + deliverable_file + mc_chat_thread_id. See task-create-helpers.ts.
  const batchTask: TaskCreateInput = {
    id: taskId,
    name,
    description: `Batch con ${ideaIds.length} ideas`,
    batch_type: batchType || "mixed",
    idea_ids: ideaIds,
    created_by: "manual",
    status: "todo",
    channel: batchType === "outreach" ? "prospecting" : "content",
    owner: "Sancho",
    skill,
    deliverable_file,
  };
  try {
    applyTaskAnchors(slug, batchTask);
  } catch (err) {
    if (err instanceof TaskAnchorError) {
      return res.status(400).json({ error: err.message, missing: err.missing });
    }
    throw err;
  }
  tasks.push(batchTask as Record<string, unknown>);
  fs.writeFileSync(tasksFilePath, JSON.stringify(tasks, null, 2));

  // Update ideas: set status to 'assigned' and link batch_id
  const ideas = loadIdeas(slug);
  for (const idea of ideas) {
    if (ideaIds.includes(idea.id)) {
      idea.status = "assigned";
      idea.updated_at = new Date().toISOString();
      // Also set task_id on pieces that belong to this project
      if (idea.pieces) {
        for (const p of idea.pieces) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const piece = p as any;
          if (!piece.task_id) piece.task_id = taskId;
        }
      }
    }
  }
  saveIdeas(slug, ideas);

  return res.status(200).json({ ok: true, task: batchTask, assignedCount: ideaIds.length });
}

export default compose(withErrorHandler, withAuth)(handler);
