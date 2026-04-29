import fs from "fs";
import path from "path";
import { BASE } from "@/lib/data/paths";
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
    mc_chat_thread_id: input.mc_chat_thread_id || `task-${id.toLowerCase()}`,
    owner: input.owner || "Escudero Content",
    created_at: now,
    updated_at: now,
  };

  parent.content_tasks = [...list, contentTask];
  saveProjectTasks(file);
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
