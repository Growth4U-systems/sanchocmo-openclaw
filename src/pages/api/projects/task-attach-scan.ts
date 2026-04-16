/**
 * POST /api/projects/task-attach-scan — Scan a task's dirs and auto-register
 * any files that aren't already in `task.attachments[]`.
 *
 * Why this exists: the chat sidebar calls this every time a task thread
 * opens (and via the 🔄 refresh button) so attachments always reflect what
 * actually exists on disk. This is the "lazy auto-sync" pattern — the
 * alternative (skill-side protocol) would require every skill to call
 * task-attach which is fragile. Instead we scan the ground truth.
 *
 * Scanned directories (all optional):
 *   - `brand/{slug}/projects/{projDir}/T{NN}/`
 *   - `brand/{slug}/projects/{projDir}/tasks/{taskId}/`
 *   - `brand/{slug}/projects/{projDir}/tasks/T{NN}/`
 *
 * Dedupe rule: if a file's path is already in `attachments[]`, leave it
 * alone (metadata is not touched). Otherwise append a new entry with
 * source=`filesystem-scan` and sniffed MIME type.
 *
 * Body: { slug, taskId }
 * Returns: { ok, added: TaskAttachment[], total: number }
 */

import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";
import type { TaskAttachment } from "@/types";

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

function sniffMimeType(filePath: string): string | undefined {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    ".md": "text/markdown",
    ".txt": "text/plain",
    ".json": "application/json",
    ".csv": "text/csv",
    ".html": "text/html",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".pdf": "application/pdf",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
  };
  return map[ext];
}

/** Walk candidate task dirs and return brand-relative file paths. */
function scanTaskDirs(
  slug: string,
  projDir: string,
  taskId: string
): string[] {
  const taskNum = taskId.match(/-T(\d+)$/i)?.[1] || taskId.split("-").pop() || "";
  const candidates = [
    path.join(projDir, `T${taskNum}`),
    path.join(projDir, "tasks", taskId),
    path.join(projDir, "tasks", `T${taskNum}`),
  ];
  const out: string[] = [];
  for (const dir of candidates) {
    if (!fs.existsSync(dir)) continue;
    let stat: fs.Stats;
    try { stat = fs.statSync(dir); } catch { continue; }
    if (!stat.isDirectory()) continue;
    try {
      for (const f of fs.readdirSync(dir)) {
        if (f.startsWith(".")) continue;
        const abs = path.join(dir, f);
        try {
          if (!fs.statSync(abs).isFile()) continue;
        } catch {
          continue;
        }
        const rel = path.relative(BASE, abs);
        out.push(rel);
      }
    } catch { /* empty */ }
  }
  return out;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const { slug, taskId } = req.body;
  if (!slug || !taskId) {
    return res.status(400).json({ error: "Missing slug or taskId" });
  }

  if (req.ctx?.clientSlug && req.ctx.clientSlug !== slug) {
    return res.status(403).json({ error: "Forbidden" });
  }

  // Locate task
  const projectsDir = path.join(BASE, "brand", slug, "projects");
  const projectIdGuess = taskId.split("-").slice(0, 1).join("-");
  const projDir = resolveProjectDir(projectsDir, projectIdGuess);
  if (!projDir) {
    return res.status(404).json({ error: `Project not found for taskId: ${taskId}` });
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
    return res.status(404).json({ error: `Task not found: ${taskId}` });
  }

  // Scan dirs
  const scanned = scanTaskDirs(slug, projDir, taskId);

  // Dedupe against existing attachments
  const existing = Array.isArray(task.attachments) ? (task.attachments as TaskAttachment[]) : [];
  const existingPaths = new Set(existing.map((a) => a.path));

  const added: TaskAttachment[] = [];
  const now = new Date().toISOString();
  for (const rel of scanned) {
    if (existingPaths.has(rel)) continue;
    const entry: TaskAttachment = {
      path: rel,
      type: sniffMimeType(rel),
      source: "filesystem-scan",
      added_at: now,
    };
    existing.push(entry);
    added.push(entry);
    existingPaths.add(rel);
  }

  // Only write if we added something
  if (added.length > 0) {
    task.attachments = existing;
    const writeData = Array.isArray(tasksData)
      ? tasks
      : { ...(tasksData as Record<string, unknown>), tasks };
    fs.writeFileSync(tasksFilePath, JSON.stringify(writeData, null, 2));
  }

  return res.status(200).json({
    ok: true,
    taskId,
    added,
    total: existing.length,
  });
}

export default compose(withErrorHandler, withAuth)(handler);
