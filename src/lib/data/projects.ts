import path from "path";
import { readJSON, writeJSON, listDir } from "./json-io";
import { brandDir, projectFile, tasksFile } from "./paths";
import type { Project, Task } from "@/types";

/**
 * Load all projects for a client by scanning brand/{slug}/projects/P*
 */
export function loadAllProjects(slug: string): { project: Project; tasks: Task[] }[] {
  const projectsDir = path.join(brandDir(slug), "projects");
  const dirs = listDir(projectsDir).filter((d) => d.startsWith("P"));
  const results: { project: Project; tasks: Task[] }[] = [];

  for (const dir of dirs) {
    const projPath = path.join(projectsDir, dir, "project.json");
    const tasksPath = path.join(projectsDir, dir, "tasks.json");
    const project = readJSON<Project | null>(projPath, null);
    if (!project) continue;

    // tasks.json viene en dos shapes históricos: array plano (P00 Foundation,
    // reseed) u objeto { tasks: [...] }. Soportar ambos — sin esto los
    // proyectos Foundation eran invisibles aquí (SAN-183 F5).
    const tasksData = readJSON<Task[] | { tasks?: Task[] }>(tasksPath, { tasks: [] });
    results.push({
      project,
      tasks: Array.isArray(tasksData) ? tasksData : tasksData.tasks || [],
    });
  }

  return results;
}

/**
 * Load a single project
 */
export function loadProject(slug: string, projectId: string): Project | null {
  return readJSON<Project | null>(projectFile(slug, projectId), null);
}

/**
 * Save a project
 */
export function saveProject(slug: string, projectId: string, project: Project): void {
  writeJSON(projectFile(slug, projectId), project);
}

/**
 * Load tasks for a project
 */
export function loadTasks(slug: string, projectId: string): Task[] {
  const data = readJSON<{ tasks: Task[] }>(tasksFile(slug, projectId), { tasks: [] });
  return data.tasks || [];
}

/**
 * Save tasks for a project
 */
export function saveTasks(slug: string, projectId: string, tasks: Task[]): void {
  writeJSON(tasksFile(slug, projectId), { project_id: projectId, tasks });
}

/**
 * Get next project ID for a client
 */
export function getNextProjectId(slug: string): string {
  const projectsDir = path.join(brandDir(slug), "projects");
  const dirs = listDir(projectsDir)
    .filter((d) => /^P\d+/.test(d))
    // Strip only the "P" prefix — stripping leading zeros too turned "P00"
    // into "" (NaN), so P00 was never counted and the next id collided with
    // it forever (every new project silently overwrote P00).
    .map((d) => parseInt(d.replace(/^P/, ""), 10))
    .filter((n) => !isNaN(n));

  const maxId = dirs.length > 0 ? Math.max(...dirs) : -1;
  const nextNum = maxId + 1;
  return `P${String(nextNum).padStart(2, "0")}`;
}
