import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";
import { readJSON, writeJSON } from "@/lib/data/json-io";
import { loadIdeas, saveIdeas } from "@/lib/data/ideas";
import {
  applyTaskAnchors,
  TaskAnchorError,
  type TaskCreateInput,
} from "@/lib/data/task-create-helpers";
import { getTaskDefault } from "@/lib/data/task-blueprints";

/**
 * POST /api/projects/create-execution-tasks — Auto-generate execution tasks with ideas.
 * Called by a research/tool skill after completing its research phase.
 *
 * Body: {
 *   slug,
 *   projectId,
 *   sourceTaskId,       // T01 that generated these
 *   tasks: [{
 *     name,              // Specific title: "Contactar influencers fitness en España"
 *     type,              // "content" | "outreach"
 *     skill?,            // "seo-content" | "outreach-sequence-builder" (auto-defaulted)
 *     deliverable_file,  // REQUIRED — concrete output path. Enforced via applyTaskAnchors.
 *     channel?,          // "web" | "linkedin" | etc.
 *     ideas: [{
 *       title,
 *       description?,
 *       type?,          // "content" | "contact"
 *       source?,
 *       priority_score?,
 *       channels?,
 *       list?,
 *       ...extra
 *     }]
 *   }]
 * }
 */

function resolveProjectDir(projectsDir: string, projectId: string): string | null {
  try {
    const dirs = fs.readdirSync(projectsDir, { withFileTypes: true });
    const match = dirs.find((d) => d.isDirectory() && d.name.startsWith(projectId + "-"));
    if (match) return path.join(projectsDir, match.name);
    const exact = dirs.find((d) => d.isDirectory() && d.name === projectId);
    if (exact) return path.join(projectsDir, exact.name);
  } catch {}
  return null;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const { slug, projectId, sourceTaskId, tasks: taskDefs } = req.body;
  if (!slug || !projectId || !taskDefs || !Array.isArray(taskDefs) || taskDefs.length === 0) {
    return res.status(400).json({ error: "Missing slug, projectId, or tasks" });
  }

  const projectsDir = path.join(BASE, "brand", slug, "projects");
  const projDir = resolveProjectDir(projectsDir, projectId);
  if (!projDir) {
    return res.status(404).json({ error: "Project not found: " + projectId });
  }

  // Load existing tasks
  const tasksPath = path.join(projDir, "tasks.json");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let existingTasks: any[] = [];
  try {
    const td = readJSON(tasksPath, []);
    existingTasks = Array.isArray(td) ? td : ((td as Record<string, unknown>).tasks as unknown[]) || [];
  } catch { /* empty */ }

  // Find max task number
  const maxNum = existingTasks.reduce((m: number, t: Record<string, unknown>) => {
    const match = (String(t.id || "")).match(/-T(\d+)$/);
    return match ? Math.max(m, parseInt(match[1])) : m;
  }, 0);

  const now = new Date().toISOString();
  const createdTasks: Record<string, unknown>[] = [];
  const allNewIdeas: Record<string, unknown>[] = [];
  let taskCounter = maxNum;

  for (const def of taskDefs) {
    taskCounter++;
    const taskId = `${projectId}-T${String(taskCounter).padStart(2, "0")}`;
    // Defaults (skill/channel/agent/idea type+list) per task type, from the
    // declarative registry (config/pillar-manifest.json → taskDefaults.byType).
    const d = getTaskDefault(def.type === "outreach" ? "outreach" : "content");

    // Create ideas for this task
    const ideaIds: string[] = [];
    for (const ideaDef of (def.ideas || [])) {
      const ideaId = crypto.randomUUID();
      ideaIds.push(ideaId);
      allNewIdeas.push({
        id: ideaId,
        type: ideaDef.type || d.ideaType,
        status: "new",
        title: ideaDef.title || "",
        description: ideaDef.description || "",
        source: ideaDef.source || "tool",
        list: ideaDef.list || d.ideaList,
        channels: ideaDef.channels || [],
        target_channel: ideaDef.target_channel || "",
        priority_score: ideaDef.priority_score || 50,
        project_ids: [projectId],
        task_id: taskId,
        created_at: now,
        notes: ideaDef.notes || "",
        ...ideaDef.extra,
      });
    }

    const task: TaskCreateInput = {
      id: taskId,
      name: def.name || `Tarea ${taskCounter}`,
      description: def.description || "",
      type: def.type || "content",
      skill: def.skill || d.skill,
      channel: def.channel || d.channel,
      agent: d.agent,
      status: "todo",
      owner: "Sancho",
      idea_ids: ideaIds,
      source_task: sourceTaskId || null,
      created_at: now,
      deliverable_file: def.deliverable_file,
    };
    try {
      applyTaskAnchors(slug, task);
    } catch (err) {
      if (err instanceof TaskAnchorError) {
        return res.status(400).json({
          error: `Task definition #${taskCounter - maxNum} invalid: ${err.message}`,
          missing: err.missing,
        });
      }
      throw err;
    }
    existingTasks.push(task);
    createdTasks.push(task);
  }

  // Save tasks
  writeJSON(tasksPath, existingTasks);

  // Save ideas to ideas.json
  if (allNewIdeas.length > 0) {
    const ideas = loadIdeas(slug);
    for (const newIdea of allNewIdeas) {
      ideas.push(newIdea as never);
    }
    saveIdeas(slug, ideas);
  }

  return res.status(200).json({
    ok: true,
    projectId,
    tasksCreated: createdTasks.length,
    ideasCreated: allNewIdeas.length,
    tasks: createdTasks.map((t) => ({ id: t.id, name: t.name })),
  });
}

export default compose(withErrorHandler, withAuth)(handler);
