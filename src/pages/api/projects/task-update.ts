import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { compose, withErrorHandler, withAuth, canAccessSlug } from "@/lib/api-middleware";
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

// SAN-183 F5: syncTaskToPillar murió — el status de un pilar ES el status de
// su task 1:1; ya no hay foundation-state.json que sincronizar.

const ALLOWED_TASK_FIELDS = [
  "name",
  "description",
  "deliverable",
  "deliverable_file",
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
  "mc_chat_thread_id",
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

  if (!canAccessSlug(req.ctx, slug)) {
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

  const _oldStatus = task.status;
  for (const [k, v] of Object.entries(fields as Record<string, unknown>)) {
    if (ALLOWED_TASK_FIELDS.includes(k)) task[k] = v;
  }

  // Execution-time gate (2026-04-15): a task cannot be marked `completed`
  // unless (a) `deliverable_file` is populated AND (b) the file(s) exist on
  // disk. Every completed task must point at a concrete file so the chat
  // sidebar and downstream surfaces can link from task → doc without
  // heuristics. If the skill ran and produced a file, the closing call must
  // include `deliverable_file` in `fields`.
  if (fields.status === "completed" || fields.status === "done") {
    const df = task.deliverable_file as string | string[] | undefined;
    const hasDeliverable =
      (typeof df === "string" && df.trim() !== "") ||
      (Array.isArray(df) && df.length > 0);
    if (!hasDeliverable) {
      return res.status(400).json({
        error:
          `Cannot mark task '${taskId}' completed without 'deliverable_file'. ` +
          `Every completed task must point at a concrete file so the chat ` +
          `sidebar can link doc ↔ task without retro-active heuristics. ` +
          `Either include 'deliverable_file' in the update body, or fix the ` +
          `skill that executed the task to write back the path it produced.`,
        missing: ["deliverable_file"],
      });
    }
    // Check every declared path exists on disk.
    const paths = Array.isArray(df) ? df : [df as string];
    const missingFiles: string[] = [];
    for (const p of paths) {
      if (!p || p.trim() === "") continue;
      const rel = p.replace(/^\/+/, "");
      const abs = rel.startsWith(BASE) ? rel : path.join(BASE, rel);
      if (!fs.existsSync(abs)) missingFiles.push(rel);
    }
    if (missingFiles.length > 0) {
      return res.status(400).json({
        error:
          `Cannot mark task '${taskId}' completed: 'deliverable_file' points ` +
          `at ${missingFiles.length} file(s) that don't exist on disk.`,
        missing_files: missingFiles,
      });
    }
    task.completed = new Date().toISOString().slice(0, 10);
  }

  const writeData = Array.isArray(tasksData)
    ? tasks
    : { ...(tasksData as Record<string, unknown>), tasks };
  fs.writeFileSync(tasksFilePath, JSON.stringify(writeData, null, 2));

  return res.status(200).json({ ok: true, task });
}

export default compose(withErrorHandler, withAuth)(handler);
