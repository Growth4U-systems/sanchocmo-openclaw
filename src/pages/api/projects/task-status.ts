import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";
import { BASE, foundationStateFile } from "@/lib/data/paths";
import { safeWriteJSON } from "@/lib/data/json-io";

/** Find project directory that starts with projectId prefix (e.g. "P01-" or exact match) */
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

const TASK_TO_PILLAR: Record<string, string> = {
  completed: "approved",
  done: "approved",
  "in-progress": "in-progress",
  todo: "not-started",
};

/** Sync foundation-state.json pillar status when a foundation task changes */
function syncTaskToPillar(slug: string, task: Record<string, unknown>, newStatus: string): void {
  if (!task.pillar) return;
  const pillarStatus = TASK_TO_PILLAR[newStatus];
  if (!pillarStatus) return;
  try {
    const stateFile = foundationStateFile(slug);
    if (!fs.existsSync(stateFile)) return;
    const state = JSON.parse(fs.readFileSync(stateFile, "utf-8"));
    const sections = state.sections || {};
    let changed = false;

    // Case 1: task has section + pillar -- update specific pillar
    if (task.section && sections[task.section as string]) {
      const pillars = sections[task.section as string].pillars || {};
      if (pillars[task.pillar as string] && pillars[task.pillar as string].status !== pillarStatus) {
        console.log(
          `[syncTaskToPillar] ${slug}: ${task.section}/${task.pillar} ${pillars[task.pillar as string].status} -> ${pillarStatus}`
        );
        pillars[task.pillar as string].status = pillarStatus;
        pillars[task.pillar as string].updated_at = new Date().toISOString();
        if (pillarStatus === "approved") pillars[task.pillar as string].approved_at = new Date().toISOString();
        changed = true;
      }
    }

    // Case 2: pillar name matches a section -- update all pillars in that section
    if (sections[task.pillar as string]) {
      const secPillars = sections[task.pillar as string].pillars || {};
      for (const [pName, pInfo] of Object.entries(secPillars)) {
        const info = pInfo as Record<string, unknown>;
        if (info.status !== pillarStatus) {
          console.log(
            `[syncTaskToPillar] ${slug}: ${task.pillar}/${pName} ${info.status} -> ${pillarStatus}`
          );
          info.status = pillarStatus;
          info.updated_at = new Date().toISOString();
          if (pillarStatus === "approved") info.approved_at = new Date().toISOString();
          changed = true;
        }
      }
    }

    if (changed) {
      safeWriteJSON(stateFile, state, (d: unknown) => {
        const obj = d as Record<string, unknown>;
        return !!obj.sections;
      });
    }
  } catch (e) {
    console.error("[syncTaskToPillar] error:", (e as Error).message);
  }
}

/**
 * POST /api/projects/task-status — Update task status in tasks.json.
 * Body: { slug, taskId, status, sourceThread? }
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { slug, taskId, status, sourceThread: _sourceThread } = req.body;
  if (!slug || !taskId || !status) {
    return res.status(400).json({ error: "Missing slug, taskId, or status" });
  }

  if (req.ctx?.clientSlug && req.ctx.clientSlug !== slug) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const projectsDir = path.join(BASE, "brand", slug, "projects");
  const projectId = taskId.split("-").slice(0, 1).join("-"); // P01 from P01-T01
  const projDir = resolveProjectDir(projectsDir, projectId);
  if (!projDir) {
    return res.status(404).json({ error: "Project not found: " + projectId });
  }

  const tasksFilePath = path.join(projDir, "tasks.json");
  let tasksData: unknown;
  try {
    tasksData = JSON.parse(fs.readFileSync(tasksFilePath, "utf-8"));
  } catch {
    return res.status(404).json({ error: "tasks.json not found" });
  }

  const tasks: Record<string, unknown>[] = Array.isArray(tasksData)
    ? tasksData
    : ((tasksData as Record<string, unknown>).tasks as Record<string, unknown>[]) || [];
  const task = tasks.find((t) => t.id === taskId);
  if (!task) {
    return res.status(404).json({ error: "Task not found: " + taskId });
  }

  const oldStatus = task.status;
  task.status = status;
  if (status === "completed" || status === "done") {
    task.completed = new Date().toISOString().slice(0, 10);
  }

  // Write back
  const writeData = Array.isArray(tasksData)
    ? tasks
    : { ...(tasksData as Record<string, unknown>), tasks };
  fs.writeFileSync(tasksFilePath, JSON.stringify(writeData, null, 2));

  // Sync foundation pillar if status changed
  if (oldStatus !== status) {
    syncTaskToPillar(slug, task, status);
    if ((task.type === "foundation" || task.batch_type === "foundation") && !task.pillar) {
      console.warn(
        `[syncTaskToPillar] Task ${taskId} is type=foundation but has no pillar field -- foundation-state.json will NOT be updated`
      );
    }
  }

  return res.status(200).json({ ok: true, taskId, oldStatus, newStatus: status });
}

export default compose(withErrorHandler, withAuth)(handler);
