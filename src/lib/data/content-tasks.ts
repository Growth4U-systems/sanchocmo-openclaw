import fs from "fs";
import path from "path";
import { BASE } from "@/lib/data/paths";
import type { DraftStatus } from "@/lib/data/drafts";
import {
  ContentTask,
  ContentTaskStatus,
  ContentTaskPipelineState,
  VALID_CONTENT_TASK_STATUSES,
  Task,
} from "@/types";

/**
 * ContentTask helpers.
 *
 * ContentTasks are nested under a parent Task with `type: "content"`. Each
 * approved idea becomes one ContentTask carrying its own thread, skill, and
 * documents (drafts). They live inside the parent's `content_tasks[]` array
 * in `tasks.json` — same file, no extra storage layer.
 *
 * Constraint enforced at every write: parent must have `type === "content"`.
 */

interface ProjectTasksFile {
  tasks: Record<string, unknown>[];
  filePath: string;
}

function projectsDir(slug: string): string {
  return path.join(BASE, "brand", slug, "projects");
}

function findProjectDirByTaskId(slug: string, taskId: string): string | null {
  const root = projectsDir(slug);
  if (!fs.existsSync(root)) return null;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const tasksPath = path.join(root, entry.name, "tasks.json");
    if (!fs.existsSync(tasksPath)) continue;
    try {
      const tasks = JSON.parse(fs.readFileSync(tasksPath, "utf-8")) as Record<string, unknown>[];
      if (tasks.some((t) => t.id === taskId)) return path.join(root, entry.name);
    } catch { /* skip malformed */ }
  }
  return null;
}

function loadProjectTasks(slug: string, taskId: string): ProjectTasksFile | null {
  const projDir = findProjectDirByTaskId(slug, taskId);
  if (!projDir) return null;
  const filePath = path.join(projDir, "tasks.json");
  try {
    const tasks = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Record<string, unknown>[];
    return { tasks, filePath };
  } catch {
    return null;
  }
}

function saveProjectTasks(file: ProjectTasksFile): void {
  fs.writeFileSync(file.filePath, JSON.stringify(file.tasks, null, 2));
}

/** Get the parent Task and assert it accepts ContentTasks. */
function requireContentParent(slug: string, parentTaskId: string): { file: ProjectTasksFile; parent: Record<string, unknown> } {
  const file = loadProjectTasks(slug, parentTaskId);
  if (!file) throw new Error(`Parent task ${parentTaskId} not found for slug ${slug}`);
  const parent = file.tasks.find((t) => t.id === parentTaskId);
  if (!parent) throw new Error(`Parent task ${parentTaskId} not found in tasks.json`);
  if (parent.type !== "content") {
    throw new Error(`ContentTask can only be nested under type=content tasks (parent ${parentTaskId} is type=${parent.type})`);
  }
  return { file, parent };
}

export function listContentTasks(slug: string, parentTaskId: string): ContentTask[] {
  const file = loadProjectTasks(slug, parentTaskId);
  if (!file) return [];
  const parent = file.tasks.find((t) => t.id === parentTaskId);
  return ((parent?.content_tasks as ContentTask[] | undefined) || []);
}

export function findContentTask(slug: string, parentTaskId: string, contentTaskId: string): ContentTask | null {
  return listContentTasks(slug, parentTaskId).find((c) => c.id === contentTaskId) || null;
}

export interface CreateContentTaskInput {
  parent_task_id: string;
  idea_id: string;
  name: string;
  skill: string;
  target_channels: string[];
  status?: ContentTaskStatus;
  pipeline_state?: ContentTaskPipelineState;
  documents?: ContentTask["documents"];
  mc_chat_thread_id?: string;
  owner?: string;
}

/**
 * Create (or return existing) ContentTask. Idempotent: if a ContentTask with
 * the same `idea_id` already exists under the parent, returns that one without
 * creating a duplicate.
 */
export function createContentTask(slug: string, input: CreateContentTaskInput): ContentTask {
  const { file, parent } = requireContentParent(slug, input.parent_task_id);
  const existing = ((parent.content_tasks as ContentTask[] | undefined) || []).find(
    (c) => c.idea_id === input.idea_id,
  );
  if (existing) return existing;

  const list = (parent.content_tasks as ContentTask[] | undefined) || [];
  const seq = String(list.length + 1).padStart(2, "0");
  const id = `${input.parent_task_id}-C${seq}`;

  const now = new Date().toISOString();
  // Canonical thread id matches the convention used by buildContentTaskThread
  // (`${slug}:content:${id.lower()}`) — the threadFile sanitizer turns that
  // into `content-{id.lower()}.json` on disk. Older code used `task-` here
  // by mistake, leaving a dead pointer; we always use `content-` now.
  const threadId = input.mc_chat_thread_id || `content-${id.toLowerCase()}`;
  const contentTask: ContentTask = {
    id,
    parent_task_id: input.parent_task_id,
    idea_id: input.idea_id,
    name: input.name,
    status: input.status || "Approved",
    pipeline_state: input.pipeline_state,
    skill: input.skill,
    target_channels: input.target_channels,
    documents: input.documents || [],
    mc_chat_thread_id: threadId,
    owner: input.owner || "Escudero Content",
    created_at: now,
    updated_at: now,
  };

  parent.content_tasks = [...list, contentTask];
  saveProjectTasks(file);

  // Pre-create the chat thread file so the index always finds it, even if the
  // user hasn't opened the chat yet. Empty state matches what mc-chat would
  // create on the first message.
  const chatDir = path.join(BASE, "brand", slug, "chat");
  fs.mkdirSync(chatDir, { recursive: true });
  const chatFile = path.join(chatDir, `${threadId}.json`);
  if (!fs.existsSync(chatFile)) {
    fs.writeFileSync(
      chatFile,
      JSON.stringify({ messages: [], createdAt: now }, null, 2),
    );
  }

  return contentTask;
}

/**
 * Update status (and optionally pipeline_state) of a ContentTask. Validates
 * the new status against the canonical list.
 */
export function setContentTaskStatus(
  slug: string,
  parentTaskId: string,
  contentTaskId: string,
  status: ContentTaskStatus,
  pipelineState?: ContentTaskPipelineState | null,
): ContentTask {
  if (!VALID_CONTENT_TASK_STATUSES.includes(status)) {
    throw new Error(`Invalid ContentTaskStatus: ${status}`);
  }
  const { file, parent } = requireContentParent(slug, parentTaskId);
  const list = (parent.content_tasks as ContentTask[] | undefined) || [];
  const ct = list.find((c) => c.id === contentTaskId);
  if (!ct) throw new Error(`ContentTask ${contentTaskId} not found under ${parentTaskId}`);

  ct.status = status;
  ct.updated_at = new Date().toISOString();
  if (pipelineState === null) delete ct.pipeline_state;
  else if (pipelineState !== undefined) ct.pipeline_state = pipelineState;

  // Terminal-state timestamps
  if (status === "Published" && !ct.published_at) ct.published_at = ct.updated_at;
  if (status === "Discarded" && !ct.discarded_at) ct.discarded_at = ct.updated_at;
  if (status === "Deferred" && !ct.deferred_at) ct.deferred_at = ct.updated_at;
  if (status === "Approved" && !ct.approved_at) ct.approved_at = ct.updated_at;

  saveProjectTasks(file);
  return ct;
}

/**
 * Map the aggregated draft status (from per-channel frontmatters) to the
 * canonical ContentTask (status, pipeline_state). Returns `null` when no
 * change is warranted: either the current state is already correct, the CT
 * is in a manual/terminal state that shouldn't be auto-managed, or the
 * aggregated value is missing.
 *
 * Pipeline-driven states reconcile from drafts:
 *   draft-aggregate → CT.status / pipeline_state
 *   pending          → Approved / researching
 *   researching      → Approved / researching
 *   clarify-needed   → Approved / clarify-needed
 *   drafting         → Approved / drafting
 *   draft            → Draft / null
 *   approved         → Review / null
 *   published        → Published / null
 *
 * Manual states (Media, Review, Ready, Discarded, Deferred) and the terminal
 * Published state are respected — once a human moves the CT past Draft, the
 * pipeline stops auto-managing it.
 */
export function inferContentTaskState(
  current: { status: ContentTaskStatus; pipeline_state?: ContentTaskPipelineState | null },
  aggregated: DraftStatus | null,
): { status: ContentTaskStatus; pipeline_state: ContentTaskPipelineState | null } | null {
  if (
    current.status === "Discarded" ||
    current.status === "Deferred" ||
    current.status === "Published" ||
    current.status === "Media" ||
    current.status === "Review" ||
    current.status === "Ready"
  ) {
    return null;
  }
  if (!aggregated) return null;

  let target: { status: ContentTaskStatus; pipeline_state: ContentTaskPipelineState | null };
  switch (aggregated) {
    case "pending":
    case "researching":
      target = { status: "Approved", pipeline_state: "researching" };
      break;
    case "clarify-needed":
      target = { status: "Approved", pipeline_state: "clarify-needed" };
      break;
    case "drafting":
      target = { status: "Approved", pipeline_state: "drafting" };
      break;
    case "draft":
      target = { status: "Draft", pipeline_state: null };
      break;
    case "approved":
      target = { status: "Review", pipeline_state: null };
      break;
    case "published":
      target = { status: "Published", pipeline_state: null };
      break;
    default:
      return null;
  }

  const currentPipeline = (current.pipeline_state ?? null) as ContentTaskPipelineState | null;
  if (target.status === current.status && target.pipeline_state === currentPipeline) {
    return null;
  }
  return target;
}

/**
 * Self-healing reconciliation: when the persisted ContentTask state in
 * tasks.json drifts from what the per-channel draft frontmatters reflect,
 * persist the corrected state. Designed to be called on read from API
 * endpoints — idempotent, cheap, and the only mechanism that closes the
 * loop between Escudero (writes drafts on disk) and the project tasks.json
 * (rendered by the UI). Returns the (possibly updated) ContentTask.
 */
export function reconcileContentTaskState(
  slug: string,
  ct: ContentTask,
  aggregated: DraftStatus | null,
): ContentTask {
  const inferred = inferContentTaskState(ct, aggregated);
  if (!inferred) return ct;
  return setContentTaskStatus(
    slug,
    ct.parent_task_id,
    ct.id,
    inferred.status,
    inferred.pipeline_state,
  );
}

/** Append a document reference to a ContentTask's `documents[]`. Idempotent by path. */
export function attachDocumentToContentTask(
  slug: string,
  parentTaskId: string,
  contentTaskId: string,
  doc: { path: string; name?: string; channel?: string },
): ContentTask {
  const { file, parent } = requireContentParent(slug, parentTaskId);
  const list = (parent.content_tasks as ContentTask[] | undefined) || [];
  const ct = list.find((c) => c.id === contentTaskId);
  if (!ct) throw new Error(`ContentTask ${contentTaskId} not found under ${parentTaskId}`);
  if (!ct.documents.some((d) => d.path === doc.path)) {
    ct.documents = [...ct.documents, doc];
    ct.updated_at = new Date().toISOString();
    saveProjectTasks(file);
  }
  return ct;
}

/** Remove a document reference from a ContentTask's `documents[]` by path. Idempotent. */
export function removeDocumentFromContentTask(
  slug: string,
  parentTaskId: string,
  contentTaskId: string,
  docPath: string,
): ContentTask {
  const { file, parent } = requireContentParent(slug, parentTaskId);
  const list = (parent.content_tasks as ContentTask[] | undefined) || [];
  const ct = list.find((c) => c.id === contentTaskId);
  if (!ct) throw new Error(`ContentTask ${contentTaskId} not found under ${parentTaskId}`);
  const before = ct.documents.length;
  ct.documents = ct.documents.filter((d) => d.path !== docPath);
  if (ct.documents.length !== before) {
    ct.updated_at = new Date().toISOString();
    saveProjectTasks(file);
  }
  return ct;
}

/**
 * Editable fields for a ContentTask via PATCH. `id`, `parent_task_id`,
 * `idea_id`, `created_at` and the lifecycle timestamps are read-only here —
 * status changes go through `setContentTaskStatus`.
 */
export type ContentTaskUpdateInput = Partial<
  Pick<
    ContentTask,
    | "name"
    | "skill"
    | "target_channels"
    | "documents"
    | "mc_chat_thread_id"
    | "discord_thread_id"
    | "owner"
    | "scheduled_for"
    | "clarify_status"
  >
>;

const UPDATABLE_FIELDS: readonly (keyof ContentTaskUpdateInput)[] = [
  "name",
  "skill",
  "target_channels",
  "documents",
  "mc_chat_thread_id",
  "discord_thread_id",
  "owner",
  "scheduled_for",
  "clarify_status",
] as const;

/**
 * Generic field update for a ContentTask. Whitelists writable fields so the
 * caller can't overwrite identity (`id`, `parent_task_id`, `idea_id`) or
 * status timestamps. Status itself flows through `setContentTaskStatus`.
 */
export function updateContentTask(
  slug: string,
  parentTaskId: string,
  contentTaskId: string,
  fields: ContentTaskUpdateInput,
): ContentTask {
  const { file, parent } = requireContentParent(slug, parentTaskId);
  const list = (parent.content_tasks as ContentTask[] | undefined) || [];
  const ct = list.find((c) => c.id === contentTaskId);
  if (!ct) throw new Error(`ContentTask ${contentTaskId} not found under ${parentTaskId}`);

  let dirty = false;
  for (const key of UPDATABLE_FIELDS) {
    if (key in fields && fields[key] !== undefined) {
      (ct as unknown as Record<string, unknown>)[key] = fields[key];
      dirty = true;
    }
  }
  if (dirty) {
    ct.updated_at = new Date().toISOString();
    saveProjectTasks(file);
  }
  return ct;
}

/**
 * Find a ContentTask by its id, scanning all projects of the brand. Useful
 * for entry points that only know `contentTaskId` (drafts, retry triggers,
 * deep-linked URLs) and need to recover the parent context.
 */
export function findContentTaskByIdAcrossProjects(
  slug: string,
  contentTaskId: string,
): { ct: ContentTask; parentTaskId: string; projectDir: string } | null {
  const root = projectsDir(slug);
  if (!fs.existsSync(root)) return null;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const tasksPath = path.join(root, entry.name, "tasks.json");
    if (!fs.existsSync(tasksPath)) continue;
    let tasks: Record<string, unknown>[];
    try {
      tasks = JSON.parse(fs.readFileSync(tasksPath, "utf-8"));
    } catch { continue; }
    for (const t of tasks) {
      const cts = (t.content_tasks as ContentTask[] | undefined) || [];
      const match = cts.find((c) => c.id === contentTaskId);
      if (match) {
        return {
          ct: match,
          parentTaskId: t.id as string,
          projectDir: path.join(root, entry.name),
        };
      }
    }
  }
  return null;
}

/**
 * Promote the ContentTask's status reactively based on the per-channel draft
 * statuses (read from the `.md` frontmatters). Called after any draft is
 * saved (PATCH /api/content-engine/drafts or iterate-draft) so the kanban
 * column reflects reality without manual user action.
 *
 * Promotion rules (least-advanced channel wins):
 *   - all `published`           → CT.status = "Published"
 *   - all in [approved+]        → CT.status = "Ready"
 *   - all in [draft+]           → CT.status = "Review"
 *   - all in [drafting+]        → CT.status = "Draft"
 *   - else                      → leave CT.status untouched
 *
 * No-op if the CT is currently in a terminal state (Discarded/Deferred).
 */
export function maybePromoteContentTaskFromDrafts(
  slug: string,
  contentTaskId: string,
): ContentTask | null {
  const found = findContentTaskByIdAcrossProjects(slug, contentTaskId);
  if (!found) return null;
  const { ct, parentTaskId } = found;
  if (ct.status === "Discarded" || ct.status === "Deferred") return ct;

  // Read every channel's frontmatter status. Lazy require to avoid a
  // circular import at module load (drafts.ts ↔ content-tasks.ts).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getDraftStatuses } = require("./drafts") as typeof import("./drafts");
  const statuses = getDraftStatuses(slug, ct.idea_id, ct.target_channels || []);

  const RANK: Record<string, number> = {
    pending: 0, researching: 1, "clarify-needed": 1,
    drafting: 2, draft: 3, approved: 4, published: 5,
  };
  const values = Object.values(statuses);
  if (values.length === 0) return ct;
  const min = values.reduce((acc, s) => (RANK[s] ?? 0) < (RANK[acc] ?? 0) ? s : acc, values[0]);

  let target: ContentTaskStatus | null = null;
  if (min === "published") target = "Published";
  else if (min === "approved") target = "Ready";
  else if (min === "draft") target = "Review";
  else if (min === "drafting") target = "Draft";

  if (target && ct.status !== target) {
    return setContentTaskStatus(slug, parentTaskId, contentTaskId, target);
  }
  return ct;
}

/**
 * Promote a ContentTask into the `Media` lane the moment a draft picks up
 * its first media asset (image, carousel PDF, etc.). Mirrors
 * `maybePromoteContentTaskFromDrafts` but reacts to media[] changes instead
 * of draft.status changes.
 *
 * Behavior matrix:
 *   - CT in {Draft, Approved}    → has media on any channel → bump to "Media"
 *   - CT in {Media}              → no media anywhere → revert to whatever
 *                                   `maybePromoteContentTaskFromDrafts` would
 *                                   choose (typically "Draft" or "Review")
 *   - CT in {Review, Ready,
 *            Published, Discarded,
 *            Deferred, New}      → no auto change. Past Media is human-driven.
 *
 * Called from `attachMediaToDraft` and the DELETE media endpoint.
 */
export function maybePromoteContentTaskFromMedia(
  slug: string,
  contentTaskId: string,
): ContentTask | null {
  const found = findContentTaskByIdAcrossProjects(slug, contentTaskId);
  if (!found) return null;
  const { ct, parentTaskId } = found;

  // Only auto-manage Draft, Approved, and Media. Everything else is human-driven.
  if (ct.status !== "Draft" && ct.status !== "Approved" && ct.status !== "Media") {
    return ct;
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { listDrafts } = require("./drafts") as typeof import("./drafts");
  const drafts = listDrafts(slug, ct.idea_id);
  const channelDrafts = drafts.filter(
    (d) => (d.meta.kind ?? "channel-draft") === "channel-draft",
  );
  const hasMedia = channelDrafts.some((d) => (d.meta.media?.length ?? 0) > 0);

  if (hasMedia && ct.status !== "Media") {
    return setContentTaskStatus(slug, parentTaskId, contentTaskId, "Media");
  }
  if (!hasMedia && ct.status === "Media") {
    // No media anywhere → revert based on the aggregate draft.status.
    // We bypass `inferContentTaskState` (which treats Media as terminal) and
    // map directly to the simplest sensible state.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getDraftStatuses } = require("./drafts") as typeof import("./drafts");
    const statuses = getDraftStatuses(slug, ct.idea_id, ct.target_channels || []);
    const RANK: Record<string, number> = {
      pending: 0, researching: 1, "clarify-needed": 1,
      drafting: 2, draft: 3, approved: 4, published: 5,
    };
    const values = Object.values(statuses);
    if (values.length === 0) return ct;
    const min = values.reduce((acc, s) => (RANK[s] ?? 0) < (RANK[acc] ?? 0) ? s : acc, values[0]);
    let target: ContentTaskStatus = "Draft";
    if (min === "approved") target = "Review";
    else if (min === "draft") target = "Draft";
    else if (min === "drafting") target = "Draft";
    return setContentTaskStatus(slug, parentTaskId, contentTaskId, target);
  }
  return ct;
}

/**
 * Helper used by external callers to look up the parent task type. Useful
 * before invoking other helpers that assume content type.
 */
export function getParentTaskType(slug: string, parentTaskId: string): Task["type"] | null {
  const file = loadProjectTasks(slug, parentTaskId);
  if (!file) return null;
  const parent = file.tasks.find((t) => t.id === parentTaskId);
  return (parent?.type as Task["type"]) || null;
}
