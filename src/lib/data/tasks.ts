import fs from "fs";
import path from "path";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { tasks as tasksTable } from "@/db/schema";
import { MC_TASKS_BACKEND, MC_TASKS_WORKSPACE } from "@/lib/config";
import { brandDir } from "@/lib/data/paths";
import { readJSON, writeJSON, listDir } from "@/lib/data/json-io";
import { getNextProjectId as getNextProjectIdFromJson } from "@/lib/data/projects";
import { setTaskStatus as syncTaskStatus } from "@/lib/data/pillar-task-sync";
import {
  attachDocumentToContentTask,
  createContentTask,
  findContentTaskByIdAcrossProjects,
  findContentTask,
  listContentTasks,
  maybePromoteContentTaskFromMedia,
  removeDocumentFromContentTask,
  setContentTaskStatus,
} from "@/lib/data/content-tasks";
import { findContentTaskById as findFlatContentTaskById, loadUnifiedContentTasks, upsertContentTask } from "@/lib/data/content-tasks-flat";
import { expandBriefPatch } from "@/lib/data/task-brief";
import { inferTaskExecutionContract } from "@/lib/data/task-execution-contract";
import type { ContentTask, ContentTaskStatus, Project, Task } from "@/types";

export interface ProjectWithTasks {
  project: Project;
  tasks: Task[];
}

export type UnifiedTaskKind = "project" | "content_task" | Task["type"];

export type UnifiedTaskRow = (
  Omit<Partial<Project>, "id" | "name" | "status" | "type"> &
  Omit<Partial<Task>, "id" | "name" | "status" | "type"> &
  Omit<Partial<ContentTask>, "id" | "name" | "status"> & {
  id: string;
  name: string;
  type: UnifiedTaskKind;
  status: string;
  parent_id: string | null;
  project_id?: string | null;
  parent_task_id?: string;
  parent_name?: string;
  depth: 0 | 1 | 2;
  children_count?: number;
  content_task_count?: number;
});

type DbTaskRow = typeof tasksTable.$inferSelect;

function useDbTasks() {
  return MC_TASKS_BACKEND === "db";
}

function dbDate(value?: Date | null): string | undefined {
  return value ? value.toISOString() : undefined;
}

function dbRowToTaskObject(row: DbTaskRow): UnifiedTaskRow {
  return {
    id: row.id,
    source_key: row.sourceKey,
    name: row.name,
    type: row.type,
    status: row.status,
    parent_id: row.parentId,
    parent_key: row.parentKey,
    project_id: row.type === "project" ? row.id : undefined,
    depth: row.parentId ? row.type === "content_task" ? 2 : 1 : 0,
    brief: row.brief || undefined,
    completion: row.completion || undefined,
    execution_notes: row.executionNotes || undefined,
    description: row.description || undefined,
    slug: row.slug || undefined,
    owner: row.owner || undefined,
    agent: row.agent || undefined,
    skill: row.skill || undefined,
    skills: Array.isArray(row.skills) ? row.skills as string[] : undefined,
    channel: row.channel || undefined,
    deliverable: row.deliverable || undefined,
    deliverable_file: row.deliverableFile || undefined,
    done_criteria: row.doneCriteria || undefined,
    depends_on: row.dependsOn || null,
    input_documents: row.inputDocuments || undefined,
    required_inputs: row.requiredInputs || undefined,
    output_documents: row.outputDocuments || undefined,
    pillar: row.pillar || undefined,
    section: row.section || undefined,
    strategy: row.strategy || undefined,
    phase: row.phase ?? undefined,
    category: row.category || undefined,
    objective: row.objective || undefined,
    approach: row.approach || undefined,
    archive_reason: row.archiveReason || undefined,
    blocked_by: row.blockedBy || undefined,
    tool: row.tool || undefined,
    idea_id: row.ideaId || undefined,
    pipeline_state: row.pipelineState || undefined,
    clarify_status: row.clarifyStatus || undefined,
    target_channels: Array.isArray(row.targetChannels) ? row.targetChannels as string[] : undefined,
    channel_phases: row.channelPhases || undefined,
    media_policy: row.mediaPolicy || undefined,
    scheduled_for: dbDate(row.scheduledFor),
    draft_statuses: row.draftStatuses || undefined,
    mc_chat_thread_id: row.mcChatThreadId || undefined,
    discord_thread_id: row.discordThreadId || undefined,
    output_files: row.outputFiles || undefined,
    documents: row.documents || undefined,
    attachments: row.attachments || undefined,
    idea_ids: row.ideaIds || undefined,
    legacy_extras: row.legacyExtras || undefined,
    created_at: dbDate(row.createdAt),
    updated_at: dbDate(row.updatedAt),
    completed_at: dbDate(row.completedAt),
    approved_at: dbDate(row.approvedAt),
    pending_media_at: dbDate(row.pendingMediaAt),
    published_at: dbDate(row.publishedAt),
    discarded_at: dbDate(row.discardedAt),
    deferred_at: dbDate(row.deferredAt),
    review_date: dbDate(row.reviewDate),
  } as UnifiedTaskRow;
}

async function listDbTaskRows(slug: string): Promise<UnifiedTaskRow[]> {
  const rows = await db
    .select()
    .from(tasksTable)
    .where(and(eq(tasksTable.workspaceSlug, MC_TASKS_WORKSPACE), eq(tasksTable.brandSlug, slug)));
  const mapped = rows.map(dbRowToTaskObject);
  const names = new Map(mapped.map((row) => [row.id, row.name]));
  const childrenCount = new Map<string, number>();
  const contentTaskCount = new Map<string, number>();
  for (const row of mapped) {
    if (!row.parent_id) continue;
    childrenCount.set(row.parent_id, (childrenCount.get(row.parent_id) || 0) + (row.type === "content_task" ? 0 : 1));
    if (row.type === "content_task") contentTaskCount.set(row.parent_id, (contentTaskCount.get(row.parent_id) || 0) + 1);
  }
  return mapped.map((row) => ({
    ...row,
    parent_name: row.parent_id ? names.get(row.parent_id) : undefined,
    children_count: childrenCount.get(row.id) || 0,
    content_task_count: contentTaskCount.get(row.id) || 0,
  }));
}

async function listDbProjectsWithTasks(slug: string): Promise<ProjectWithTasks[]> {
  const rows = await listDbTaskRows(slug);
  return rows
    .filter((row) => row.type === "project")
    .map((projectRow) => ({
      project: projectRow as unknown as Project,
      tasks: rows
        .filter((row) => row.parent_id === projectRow.id && row.type !== "content_task")
        .map((row) => row as unknown as Task),
    }));
}

async function getDbRow(slug: string, id: string): Promise<UnifiedTaskRow | null> {
  const rows = await db
    .select()
    .from(tasksTable)
    .where(and(eq(tasksTable.workspaceSlug, MC_TASKS_WORKSPACE), eq(tasksTable.brandSlug, slug), eq(tasksTable.id, id)))
    .limit(1);
  return rows[0] ? dbRowToTaskObject(rows[0]) : null;
}

function dbPatch(fields: Record<string, unknown>) {
  const expanded = expandBriefPatch(fields);
  const patch: Partial<typeof tasksTable.$inferInsert> = {};
  const map: Record<string, keyof typeof patch> = {
    name: "name",
    type: "type",
    status: "status",
    brief: "brief",
    completion: "completion",
    execution_notes: "executionNotes",
    description: "description",
    owner: "owner",
    agent: "agent",
    skill: "skill",
    skills: "skills",
    channel: "channel",
    deliverable: "deliverable",
    deliverable_file: "deliverableFile",
    done_criteria: "doneCriteria",
    depends_on: "dependsOn",
    input_documents: "inputDocuments",
    required_inputs: "requiredInputs",
    output_documents: "outputDocuments",
    pillar: "pillar",
    section: "section",
    strategy: "strategy",
    category: "category",
    approach: "approach",
    archive_reason: "archiveReason",
    blocked_by: "blockedBy",
    tool: "tool",
  };
  for (const [inputKey, dbKey] of Object.entries(map)) {
    if (inputKey in expanded) (patch as Record<string, unknown>)[dbKey] = expanded[inputKey];
  }
  if ("phase" in expanded) patch.phase = Number(expanded.phase);
  patch.updatedAt = new Date();
  return patch;
}

function dbSourceKey(...parts: string[]) {
  return parts.map((part) => encodeURIComponent(part)).join("/");
}

function projectDirs(slug: string): string[] {
  return listDir(path.join(brandDir(slug), "projects")).filter((d) => d.startsWith("P"));
}

function resolveProjectDir(slug: string, projectId: string): string | null {
  const projectsRoot = path.join(brandDir(slug), "projects");
  for (const dir of projectDirs(slug)) {
    if (dir === projectId || dir.startsWith(`${projectId}-`)) return path.join(projectsRoot, dir);
  }
  return null;
}

function readProjectTasksFile(file: string): { raw: unknown; tasks: Task[] } {
  const raw = readJSON<unknown>(file, []);
  const tasks = Array.isArray(raw)
    ? raw as Task[]
    : Array.isArray((raw as { tasks?: unknown }).tasks)
      ? (raw as { tasks: Task[] }).tasks
      : [];
  return { raw, tasks };
}

function writeProjectTasksFile(file: string, raw: unknown, tasks: Task[]) {
  writeJSON(file, Array.isArray(raw) ? tasks : { ...(raw as Record<string, unknown>), tasks });
}

function listProjectsWithTasksJson(slug: string): ProjectWithTasks[] {
  const results: ProjectWithTasks[] = [];
  for (const dir of projectDirs(slug)) {
    const projDir = path.join(brandDir(slug), "projects", dir);
    const project = readJSON<Project | null>(path.join(projDir, "project.json"), null);
    if (!project) continue;
    const { tasks } = readProjectTasksFile(path.join(projDir, "tasks.json"));
    results.push({ project, tasks });
  }
  return results;
}

export async function listProjectsWithTasks(slug: string): Promise<ProjectWithTasks[]> {
  if (useDbTasks()) return listDbProjectsWithTasks(slug);
  return listProjectsWithTasksJson(slug);
}

export function listUnifiedTaskRows(slug: string): UnifiedTaskRow[] {
  if (useDbTasks()) {
    throw new Error("Use listUnifiedTaskRowsAsync when MC_TASKS_BACKEND=db");
  }
  const projects = listProjectsWithTasksJson(slug);
  const rows: UnifiedTaskRow[] = [];
  const seenContentTaskIds = new Set<string>();
  const childTaskById = new Map<string, { task: Task; project: Project; id: string }>();

  for (const entry of projects) {
    const { project, tasks } = entry;
    rows.push({
      ...project,
      type: "project",
      status: project.status,
      parent_id: null,
      project_id: project.id,
      depth: 0,
      children_count: tasks.length,
      content_task_count: tasks.reduce((sum, task) => sum + (task.content_tasks?.length || 0), 0),
    });

    for (const task of tasks) {
      const childId = canonicalChildTaskId(project.id, task.id);
      childTaskById.set(task.id, { task, project, id: childId });
      childTaskById.set(childId, { task, project, id: childId });
      rows.push({
        ...task,
        id: childId,
        type: task.type || task.batch_type || "execution",
        status: task.status,
        parent_id: project.id,
        project_id: project.id,
        parent_name: project.name,
        depth: 1,
        content_task_count: task.content_tasks?.length || 0,
      });

      for (const ct of task.content_tasks || []) {
        if (!ct.id) continue;
        seenContentTaskIds.add(ct.id);
        rows.push(contentTaskToRow(ct, {
          parentId: childId,
          projectId: project.id,
          parentName: task.name,
          depth: 2,
        }));
      }
    }
  }

  for (const ct of loadUnifiedContentTasks(slug)) {
    if (!ct.id || seenContentTaskIds.has(ct.id)) continue;
    const parent = ct.parent_task_id ? childTaskById.get(ct.parent_task_id) : undefined;
    rows.push(contentTaskToRow(ct, {
      parentId: parent?.id || ct.parent_task_id || null,
      projectId: parent?.project.id || (ct as unknown as { project_id?: string }).project_id || null,
      parentName: parent?.task.name,
      depth: parent ? 2 : 0,
    }));
  }

  return rows;
}

export async function listUnifiedTaskRowsAsync(slug: string): Promise<UnifiedTaskRow[]> {
  if (useDbTasks()) return listDbTaskRows(slug);
  return listUnifiedTaskRows(slug);
}

function contentTaskToRow(
  ct: ContentTask,
  context: { parentId: string | null; projectId?: string | null; parentName?: string; depth: 0 | 1 | 2 },
): UnifiedTaskRow {
  return {
    ...ct,
    type: "content_task",
    status: ct.status,
    parent_id: context.parentId,
    parent_task_id: ct.parent_task_id || context.parentId || undefined,
    project_id: context.projectId || null,
    parent_name: context.parentName,
    channel: ct.target_channels?.join(", "),
    owner: ct.owner || "Escudero Content",
    agent: "dulcinea",
    skill: ct.skill,
    skills: ct.skill ? [ct.skill] : ["social-writer"],
    depth: context.depth,
    documents: ct.documents || [],
    output_documents: ct.documents || [],
  };
}

export function getChildren(slug: string, parentId: string): Task[] {
  const found = findTaskByIdAcrossBrand(slug, parentId);
  if (!found?.projectId) return [];
  const dir = resolveProjectDir(slug, found.projectId);
  if (!dir) return [];
  return readProjectTasksFile(path.join(dir, "tasks.json")).tasks;
}

export async function getTask(slug: string, id: string): Promise<Project | Task | ContentTask | null> {
  if (useDbTasks()) return getDbRow(slug, id) as Promise<Project | Task | ContentTask | null>;
  return findTaskByIdAcrossBrand(slug, id)?.task || null;
}

export function findTaskByIdAcrossBrand(
  slug: string,
  id: string,
): { task: Project | Task | ContentTask; projectId?: string; parentTaskId?: string; projectDir?: string } | null {
  for (const dir of projectDirs(slug)) {
    const projDir = path.join(brandDir(slug), "projects", dir);
    const project = readJSON<Project | null>(path.join(projDir, "project.json"), null);
    if (project && (project.id === id || dir === id)) return { task: project, projectId: project.id, projectDir: projDir };
    const { tasks } = readProjectTasksFile(path.join(projDir, "tasks.json"));
    for (const task of tasks) {
      const projectId = project?.id || dir;
      const canonicalId = canonicalChildTaskId(projectId, task.id);
      if (task.id === id || canonicalId === id) return { task, projectId, projectDir: projDir };
      for (const ct of task.content_tasks || []) {
        if (ct.id === id) return { task: ct, projectId, parentTaskId: task.id, projectDir: projDir };
      }
    }
  }
  const flat = findFlatContentTaskById(slug, id) || loadUnifiedContentTasks(slug).find((ct) => ct.id === id);
  if (flat) {
    const parent = flat.parent_task_id ? findTaskByIdAcrossBrand(slug, flat.parent_task_id) : null;
    return {
      task: flat,
      projectId: parent?.projectId || (flat as unknown as { project_id?: string }).project_id,
      parentTaskId: flat.parent_task_id,
      projectDir: parent?.projectDir,
    };
  }
  return null;
}

export function canonicalChildTaskId(projectId: string, taskId: string): string {
  if (taskId.startsWith(`${projectId}-`)) return taskId;
  if (/^T\d+/i.test(taskId)) return `${projectId}-${taskId}`;
  return taskId;
}

function isContentTaskRecord(task: Project | Task | ContentTask): task is ContentTask {
  return "idea_id" in task && "target_channels" in task;
}

export async function updateTask(slug: string, id: string, fields: Record<string, unknown>): Promise<Project | Task | ContentTask> {
  if (useDbTasks()) {
    const patch = dbPatch(fields);
    await db
      .update(tasksTable)
      .set(patch)
      .where(and(eq(tasksTable.workspaceSlug, MC_TASKS_WORKSPACE), eq(tasksTable.brandSlug, slug), eq(tasksTable.id, id)));
    const updated = await getDbRow(slug, id);
    if (!updated) throw new Error(`Task not found: ${id}`);
    return updated as unknown as Project | Task | ContentTask;
  }
  const found = findTaskByIdAcrossBrand(slug, id);
  if (!found) throw new Error(`Task not found: ${id}`);
  const expandedFields = expandBriefPatch(fields);
  if (isContentTaskRecord(found.task)) {
    const updated = {
      ...found.task,
      ...expandedFields,
      updated_at: new Date().toISOString(),
    } as ContentTask;
    return upsertContentTask(slug, updated);
  }
  if (!found.projectDir) throw new Error(`Task not found: ${id}`);
  if (!found.parentTaskId && "strategy" in found.task) {
    const project = { ...(found.task as Project), ...expandedFields, updated_at: new Date().toISOString() } as Project;
    writeJSON(path.join(found.projectDir, "project.json"), project);
    return project;
  }
  const file = path.join(found.projectDir, "tasks.json");
  const data = readProjectTasksFile(file);
  const idx = data.tasks.findIndex((t) => t.id === (found.task as Task).id || canonicalChildTaskId(found.projectId || "", t.id) === id);
  if (idx === -1) throw new Error(`Task not found: ${id}`);
  data.tasks[idx] = { ...data.tasks[idx], ...expandedFields } as Task;
  writeProjectTasksFile(file, data.raw, data.tasks);
  return data.tasks[idx];
}

export async function setTaskStatus(slug: string, id: string, status: string) {
  if (useDbTasks()) {
    const task = await updateTask(slug, id, { status });
    return { ok: true, slug, task, newStatus: status };
  }
  const found = findTaskByIdAcrossBrand(slug, id);
  if (found && isContentTaskRecord(found.task)) {
    const updated = upsertContentTask(slug, {
      ...found.task,
      status: status as ContentTaskStatus,
      updated_at: new Date().toISOString(),
    });
    return { ok: true, slug, task: updated };
  }
  return syncTaskStatus(slug, id, status);
}

export async function archiveTask(slug: string, id: string, reason = "Archivado desde Mission Control") {
  return updateTask(slug, id, { status: "archived", archive_reason: reason });
}

export async function createTask(slug: string, input: Partial<Project & Task> & { parent_id?: string; type?: string }) {
  if (useDbTasks()) {
    const now = new Date();
    const type = input.type || (!input.parent_id ? "project" : "execution");
    const id = input.id || (type === "project"
      ? await getNextProjectId(slug)
      : await getNextChildTaskId(slug, input.parent_id || ""));
    const parentRows = input.parent_id
      ? await db.select().from(tasksTable).where(and(
          eq(tasksTable.workspaceSlug, MC_TASKS_WORKSPACE),
          eq(tasksTable.brandSlug, slug),
          eq(tasksTable.id, input.parent_id),
        )).limit(1)
      : [];
    const parent = parentRows[0];
    const contract = inferTaskExecutionContract(
      {
        ...input,
        id,
        type,
        brand_slug: slug,
        owner: input.owner,
        agent: (input as { agent?: string }).agent,
        skills: (input as { skills?: unknown }).skills,
        input_documents: (input as { input_documents?: unknown }).input_documents,
        required_inputs: (input as { required_inputs?: unknown }).required_inputs,
        output_documents: (input as { output_documents?: unknown }).output_documents,
      },
      { brandSlug: slug },
    );
    const row = {
      sourceKey: dbSourceKey(MC_TASKS_WORKSPACE, slug, type === "project" ? "project" : type === "content_task" ? "content_task" : "task", id),
      id,
      workspaceSlug: MC_TASKS_WORKSPACE,
      brandSlug: slug,
      parentId: input.parent_id || null,
      parentKey: parent?.sourceKey || null,
      type,
      status: input.status || "todo",
      name: input.name || id,
      brief: input.brief || input.description || "",
      completion: input.completion || input.done_criteria || input.deliverable || "",
      executionNotes: input.execution_notes || input.approach || "",
      description: input.description || null,
      owner: input.owner || "Sancho",
      agent: contract.agent,
      skill: contract.skill || null,
      skills: contract.skills,
      channel: input.channel || null,
      deliverable: input.deliverable || null,
      doneCriteria: input.done_criteria || null,
      dependsOn: input.depends_on || null,
      inputDocuments: contract.inputDocuments,
      requiredInputs: contract.requiredInputs,
      outputDocuments: contract.outputDocuments,
      createdAt: now,
      updatedAt: now,
      outputFiles: input.output_files || [],
      documents: input.documents || [],
      attachments: input.attachments || [],
    } satisfies typeof tasksTable.$inferInsert;
    await db.insert(tasksTable).values(row).onConflictDoUpdate({
      target: tasksTable.sourceKey,
      set: { ...row, updatedAt: now },
    });
    return (await getDbRow(slug, id)) as unknown as Project | Task | ContentTask;
  }
  if (input.type === "project" || !input.parent_id) {
    const id = input.id || getNextProjectId(slug);
    const dir = path.join(brandDir(slug), "projects", input.slug || id);
    fs.mkdirSync(dir, { recursive: true });
    const project = {
      id,
      slug: input.slug || id,
      name: input.name || id,
      brief: input.brief || input.description || "",
      completion: input.completion || input.done_criteria || input.deliverable || "",
      execution_notes: input.execution_notes || input.approach || "",
      strategy: input.strategy || "",
      status: input.status || "todo",
      phase: input.phase ?? 0,
      category: input.category || "",
      created_at: new Date().toISOString(),
      review_date: null,
      ...input,
    } as Project;
    writeJSON(path.join(dir, "project.json"), project);
    writeJSON(path.join(dir, "tasks.json"), []);
    return project;
  }
  const found = findTaskByIdAcrossBrand(slug, input.parent_id);
  if (!found?.projectDir) throw new Error(`Parent task not found: ${input.parent_id}`);
  const file = path.join(found.projectDir, "tasks.json");
  const data = readProjectTasksFile(file);
  const task = {
    id: input.id || getNextChildTaskId(slug, found.projectId || input.parent_id),
    name: input.name || "Nueva tarea",
    brief: input.brief || input.description || "",
    completion: input.completion || input.done_criteria || input.deliverable || "",
    execution_notes: input.execution_notes || input.approach || "",
    description: input.description || "",
    deliverable: input.deliverable || "",
    done_criteria: input.done_criteria || "",
    depends_on: input.depends_on || null,
    owner: input.owner || "Sancho",
    status: input.status || "todo",
    channel: input.channel || "execution",
    type: input.type || "execution",
    skill: input.skill || "",
    output_files: input.output_files || [],
  } as Task;
  data.tasks.push(task);
  writeProjectTasksFile(file, data.raw, data.tasks);
  return task;
}

export function getNextProjectId(slug: string): string {
  return getNextProjectIdFromJson(slug);
}

export function getNextChildTaskId(slug: string, parentId: string): string {
  const children = getChildren(slug, parentId);
  const max = children.reduce((acc, task) => {
    const match = task.id.match(/T(\d+)$/i);
    return match ? Math.max(acc, Number(match[1])) : acc;
  }, 0);
  return `${parentId}-T${String(max + 1).padStart(2, "0")}`;
}

export function getNextContentSubtaskId(slug: string, parentId: string): string {
  const max = listContentTasks(slug, parentId).reduce((acc, task) => {
    const match = task.id.match(/C(\d+)$/i);
    return match ? Math.max(acc, Number(match[1])) : acc;
  }, 0);
  return `${parentId}-C${String(max + 1).padStart(2, "0")}`;
}

export {
  attachDocumentToContentTask,
  createContentTask,
  findContentTask,
  findContentTaskByIdAcrossProjects,
  listContentTasks,
  maybePromoteContentTaskFromMedia,
  removeDocumentFromContentTask,
  setContentTaskStatus,
};
export type { ContentTaskStatus };
