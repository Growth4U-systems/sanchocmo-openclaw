import fs from "fs";
import path from "path";
import { brandDir, projectFile, tasksFile } from "@/lib/data/paths";
import { readJSON, writeJSON, listDir } from "@/lib/data/json-io";
import { loadAllProjects, getNextProjectId as getNextProjectIdFromJson } from "@/lib/data/projects";
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
import type { ContentTask, ContentTaskStatus, Project, Task } from "@/types";

export interface ProjectWithTasks {
  project: Project;
  tasks: Task[];
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

export function listProjectsWithTasks(slug: string): ProjectWithTasks[] {
  return loadAllProjects(slug);
}

export function getChildren(slug: string, parentId: string): Task[] {
  const found = findTaskByIdAcrossBrand(slug, parentId);
  if (!found?.projectId) return [];
  const dir = resolveProjectDir(slug, found.projectId);
  if (!dir) return [];
  return readProjectTasksFile(path.join(dir, "tasks.json")).tasks;
}

export function getTask(slug: string, id: string): Project | Task | ContentTask | null {
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
  return null;
}

export function canonicalChildTaskId(projectId: string, taskId: string): string {
  if (taskId.startsWith(`${projectId}-`)) return taskId;
  if (/^T\d+/i.test(taskId)) return `${projectId}-${taskId}`;
  return taskId;
}

export function updateTask(slug: string, id: string, fields: Partial<Project & Task>): Project | Task {
  const found = findTaskByIdAcrossBrand(slug, id);
  if (!found || !found.projectDir) throw new Error(`Task not found: ${id}`);
  if (!found.parentTaskId && "strategy" in found.task) {
    const project = { ...(found.task as Project), ...fields, updated_at: new Date().toISOString() } as Project;
    writeJSON(path.join(found.projectDir, "project.json"), project);
    return project;
  }
  const file = path.join(found.projectDir, "tasks.json");
  const data = readProjectTasksFile(file);
  const idx = data.tasks.findIndex((t) => t.id === (found.task as Task).id || canonicalChildTaskId(found.projectId || "", t.id) === id);
  if (idx === -1) throw new Error(`Task not found: ${id}`);
  data.tasks[idx] = { ...data.tasks[idx], ...fields } as Task;
  writeProjectTasksFile(file, data.raw, data.tasks);
  return data.tasks[idx];
}

export function setTaskStatus(slug: string, id: string, status: string) {
  return syncTaskStatus(slug, id, status);
}

export function archiveTask(slug: string, id: string, reason = "Archivado desde Mission Control") {
  return updateTask(slug, id, { status: "archived", archive_reason: reason } as unknown as Partial<Project & Task>);
}

export function createTask(slug: string, input: Partial<Project & Task> & { parent_id?: string; type?: string }) {
  if (input.type === "project" || !input.parent_id) {
    const id = input.id || getNextProjectId(slug);
    const dir = path.join(brandDir(slug), "projects", input.slug || id);
    fs.mkdirSync(dir, { recursive: true });
    const project = {
      id,
      slug: input.slug || id,
      name: input.name || id,
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
