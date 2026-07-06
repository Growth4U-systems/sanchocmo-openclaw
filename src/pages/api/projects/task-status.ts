import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { compose, withErrorHandler, withAuth, canAccessSlug } from "@/lib/api-middleware";
import { setTaskStatus } from "@/lib/data/task-status-store";
import { BASE } from "@/lib/data/paths";
import { VALID_TASK_STATUSES } from "@/types";

/**
 * POST /api/projects/task-status
 *
 * Update task status in tasks.json. If the task has a `pillar` field, the
 * matching pillar in foundation-state.json is also updated.
 *
 * Strict vocabulary (2026-04-15): the `status` body param must be one of
 * the canonical `VALID_TASK_STATUSES` — or one of the accepted aliases
 * that the helper normalizes to them. Ambiguous values like "ready" are
 * explicitly rejected at the API layer with a 400 so callers get a clear
 * error instead of a silent drift to a weird status.
 *
 * Both writes go through the centralized `setTaskStatus` helper in
 * `lib/data/task-status-store.ts`.
 *
 * Body: { slug, taskId, status, sourceThread? }
 */

/** Aliases accepted by the API → normalized by the helper. */
const ACCEPTED_ALIASES: Record<string, string> = {
  done: "completed",
  complete: "completed",
  approved: "completed",
  finished: "completed",
  in_progress: "in-progress",
  inprogress: "in-progress",
  running: "in-progress",
  active: "in-progress",
  wip: "in-progress",
  pending: "todo",
  "not-started": "todo",
  not_started: "todo",
  new: "todo",
  discarded: "cancelled",
};

/** Values that are explicitly REJECTED as ambiguous. */
const REJECTED_STATUSES: Record<string, string> = {
  ready:
    "'ready' is ambiguous — use 'todo' if not started, or 'completed' if done.",
};

/**
 * Look up `deliverable_file` for a task by scanning project tasks.json files.
 * Returns string | string[] | null. Best-effort — if the task isn't found,
 * returns null and the caller should surface the error.
 */
function readTaskDeliverableFile(
  slug: string,
  taskId: string
): string | string[] | null {
  const projectsDir = path.join(BASE, "brand", slug, "projects");
  let dirs: fs.Dirent[];
  try {
    dirs = fs.readdirSync(projectsDir, { withFileTypes: true });
  } catch {
    return null;
  }
  const projectIdGuess = taskId.split("-").slice(0, 1).join("-");
  const ordered = [
    ...dirs.filter((d) => d.isDirectory() && d.name.startsWith(projectIdGuess + "-")),
    ...dirs.filter((d) => d.isDirectory() && !d.name.startsWith(projectIdGuess + "-")),
  ];
  for (const d of ordered) {
    const tasksPath = path.join(projectsDir, d.name, "tasks.json");
    try {
      const data = JSON.parse(fs.readFileSync(tasksPath, "utf-8"));
      const tasks = Array.isArray(data) ? data : data.tasks || [];
      const task = tasks.find((t: Record<string, unknown>) => t.id === taskId);
      if (task) {
        return (task.deliverable_file as string | string[] | undefined) ?? null;
      }
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Check that every path in `deliverable_file` exists on disk. Returns the
 * list of missing paths (empty if all exist).
 */
function checkDeliverableFilesExist(
  df: string | string[] | null
): { missing: string[]; checked: string[] } {
  const paths = Array.isArray(df) ? df : df ? [df] : [];
  const missing: string[] = [];
  for (const p of paths) {
    if (!p || p.trim() === "") continue;
    const rel = p.replace(/^\/+/, "");
    const abs = rel.startsWith(BASE) ? rel : path.join(BASE, rel);
    if (!fs.existsSync(abs)) missing.push(rel);
  }
  return { missing, checked: paths };
}

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

  if (!canAccessSlug(req.ctx, slug)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  // Vocabulary validation
  const lowered = String(status).toLowerCase();
  if (REJECTED_STATUSES[lowered]) {
    return res.status(400).json({
      error: `Status '${status}' rejected: ${REJECTED_STATUSES[lowered]}`,
      valid: VALID_TASK_STATUSES,
    });
  }
  const canonical =
    (VALID_TASK_STATUSES as readonly string[]).includes(lowered)
      ? lowered
      : ACCEPTED_ALIASES[lowered];
  if (!canonical) {
    return res.status(400).json({
      error: `Status '${status}' is not a valid task status.`,
      valid: VALID_TASK_STATUSES,
      accepted_aliases: Object.keys(ACCEPTED_ALIASES),
    });
  }

  // Execution-time gate (2026-04-15): cannot transition to `completed`
  // unless the task (a) has `deliverable_file` populated AND (b) the file(s)
  // actually exist on disk. If the skill produced a different/additional
  // file, use `task-update` with `fields: { status, deliverable_file }` to
  // set both in one call. This endpoint is status-only.
  if (canonical === "completed") {
    const df = readTaskDeliverableFile(slug, taskId);
    const hasDeliverable =
      (typeof df === "string" && df.trim() !== "") ||
      (Array.isArray(df) && df.length > 0);
    if (!hasDeliverable) {
      return res.status(400).json({
        error:
          `Cannot mark task '${taskId}' completed via task-status: the task ` +
          `has no 'deliverable_file'. Every completed task must point at a ` +
          `concrete file so the chat sidebar can link doc ↔ task without ` +
          `heuristics. Use POST /api/projects/task-update with ` +
          `fields: { status: "completed", deliverable_file: "<path>" } ` +
          `to set the deliverable and close in one call.`,
        missing: ["deliverable_file"],
      });
    }
    const existCheck = checkDeliverableFilesExist(df);
    if (existCheck.missing.length > 0) {
      return res.status(400).json({
        error:
          `Cannot mark task '${taskId}' completed: 'deliverable_file' points ` +
          `at ${existCheck.missing.length} file(s) that don't exist on disk. ` +
          `The skill must produce the file before the task can be closed.`,
        missing_files: existCheck.missing,
      });
    }
  }

  const result = setTaskStatus(slug, taskId, canonical);

  if (!result.ok) {
    const code = result.error?.includes("not found") ? 404 : 500;
    return res.status(code).json({ error: result.error || "sync failed" });
  }

  return res.status(200).json({
    ok: true,
    taskId,
    oldStatus: result.oldStatus,
    newStatus: result.newStatus,
    pillarChanged: result.pillarChanged,
  });
}

export default compose(withErrorHandler, withAuth)(handler);
