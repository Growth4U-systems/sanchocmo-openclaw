/**
 * POST /api/projects/task-attach — Register a file as a task attachment.
 *
 * Appends an entry to `task.attachments[]` in the matching tasks.json.
 * The path must exist on disk AND live under `brand/{slug}/` for the given
 * slug — we don't allow arbitrary paths (prevents accidental cross-brand
 * leakage and path traversal).
 *
 * This endpoint is the single write-point for all 3 attachment channels:
 *   1. Discord plugin hook (source="discord")
 *   2. Skill execution wrapper (source="skill:<id>")
 *   3. Manual ops (source="manual")
 *
 * Body: { slug, taskId, path, type?, source?, label?, added_by? }
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

/** Best-effort MIME sniffing by extension. */
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
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg",
  };
  return map[ext];
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const { slug, taskId, path: attachmentPath, type, source, label, added_by } = req.body;
  if (!slug || !taskId || !attachmentPath) {
    return res.status(400).json({ error: "Missing slug, taskId, or path" });
  }

  if (req.ctx?.clientSlug && req.ctx.clientSlug !== slug) {
    return res.status(403).json({ error: "Forbidden" });
  }

  // --- Path safety ---
  // Reject path traversal and cross-brand leakage. Every attachment must live
  // under `brand/{slug}/`. Accept both brand-relative and workspace-relative
  // inputs; normalize to brand-relative for storage.
  const brandPrefix = `brand/${slug}/`;
  let normalized = String(attachmentPath).replace(/^\/+/, "");
  if (normalized.startsWith(BASE)) {
    normalized = normalized.slice(BASE.length).replace(/^\/+/, "");
  }
  if (!normalized.startsWith(brandPrefix)) {
    return res.status(400).json({
      error: `Path must live under 'brand/${slug}/'. Received: ${attachmentPath}`,
    });
  }
  if (normalized.includes("..")) {
    return res.status(400).json({ error: "Path traversal not allowed" });
  }

  // --- File existence ---
  const absPath = path.join(BASE, normalized);
  if (!fs.existsSync(absPath)) {
    return res.status(404).json({
      error: `File does not exist on disk: ${normalized}. Upload the file first, then call task-attach.`,
    });
  }

  // --- Locate task ---
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

  // --- Append attachment ---
  const attachment: TaskAttachment = {
    path: normalized,
    type: type || sniffMimeType(normalized),
    source: source || "manual",
    label: label || undefined,
    added_at: new Date().toISOString(),
    added_by: added_by || undefined,
  };

  const existing = Array.isArray(task.attachments) ? (task.attachments as TaskAttachment[]) : [];
  // Dedupe by path — if already registered, update metadata in place.
  const dedupedIdx = existing.findIndex((a) => a.path === normalized);
  if (dedupedIdx >= 0) {
    existing[dedupedIdx] = { ...existing[dedupedIdx], ...attachment };
  } else {
    existing.push(attachment);
  }
  task.attachments = existing;

  const writeData = Array.isArray(tasksData)
    ? tasks
    : { ...(tasksData as Record<string, unknown>), tasks };
  fs.writeFileSync(tasksFilePath, JSON.stringify(writeData, null, 2));

  return res.status(200).json({
    ok: true,
    taskId,
    attachment,
    attachmentsCount: existing.length,
  });
}

export default compose(withErrorHandler, withAuth)(handler);
