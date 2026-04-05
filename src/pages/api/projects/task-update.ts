import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";
import { BASE, foundationStateFile } from "@/lib/data/paths";
import { safeWriteJSON } from "@/lib/data/json-io";

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
      try {
        execSync("python3 scripts/regenerate.py", { cwd: BASE, timeout: 15000 });
      } catch (e) {
        console.error("[syncTaskToPillar] regenerate error:", (e as Error).message);
      }
    }
  } catch (e) {
    console.error("[syncTaskToPillar] error:", (e as Error).message);
  }
}

function regenerate(): void {
  try {
    execSync("python3 scripts/regenerate.py", { cwd: BASE, timeout: 15000 });
  } catch (e) {
    console.error("[task-update] regenerate error:", (e as Error).message);
  }
}

const ALLOWED_TASK_FIELDS = [
  "name",
  "description",
  "deliverable",
  "done_criteria",
  "depends_on",
  "owner",
  "channel",
  "status",
  "type",
  "skill",
  "idea_ids",
  "pillar",
  "section",
  "documents",
];

/**
 * POST /api/projects/task-update — Update task fields.
 * Body: { slug, taskId, fields, sourceThread? }
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { slug, taskId, fields, sourceThread: _sourceThread } = req.body;
  if (!slug || !taskId || !fields) {
    return res.status(400).json({ error: "Missing slug, taskId, or fields" });
  }

  if (req.ctx?.clientSlug && req.ctx.clientSlug !== slug) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const projectsDir = path.join(BASE, "brand", slug, "projects");
  const projectId = taskId.split("-").slice(0, 1).join("-");
  const projDir = resolveProjectDir(projectsDir, projectId);
  if (!projDir) {
    return res.status(404).json({ error: "Project not found" });
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
    return res.status(404).json({ error: "Task not found" });
  }

  const oldStatus = task.status;
  for (const [k, v] of Object.entries(fields as Record<string, unknown>)) {
    if (ALLOWED_TASK_FIELDS.includes(k)) task[k] = v;
  }
  if (fields.status === "completed" || fields.status === "done") {
    task.completed = new Date().toISOString().slice(0, 10);
  }

  const writeData = Array.isArray(tasksData)
    ? tasks
    : { ...(tasksData as Record<string, unknown>), tasks };
  fs.writeFileSync(tasksFilePath, JSON.stringify(writeData, null, 2));

  if (fields.status && fields.status !== oldStatus) {
    syncTaskToPillar(slug, task, fields.status as string);
    if ((task.type === "foundation" || task.batch_type === "foundation") && !task.pillar) {
      console.warn(
        `[syncTaskToPillar] Task ${taskId} is type=foundation but has no pillar field -- foundation-state.json will NOT be updated`
      );
    }
  }

  regenerate();

  return res.status(200).json({ ok: true, task });
}

export default compose(withErrorHandler, withAuth)(handler);
