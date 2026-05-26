import { MC_TASKS_BACKEND, type MissionControlTasksBackend } from "@/lib/config";
import { loadAllProjects } from "@/lib/data/projects";
import type { Project, Task } from "@/types";

export interface ProjectWithTasks {
  project: Project;
  tasks: Task[];
}

export interface TasksBackend {
  mode: MissionControlTasksBackend;
  listProjectsWithTasks(slug: string): ProjectWithTasks[];
}

const jsonBackend: TasksBackend = {
  mode: "json",
  listProjectsWithTasks(slug: string) {
    return loadAllProjects(slug);
  },
};

const dbShadowBackend: TasksBackend = {
  mode: "db-shadow",
  listProjectsWithTasks(slug: string) {
    // Shadow mode lands in Fase 3 once the Drizzle table and migration scripts
    // exist. Until then, JSON remains authoritative and this wrapper gives
    // call sites a stable seam to adopt.
    return jsonBackend.listProjectsWithTasks(slug);
  },
};

const dbBackend: TasksBackend = {
  mode: "db",
  listProjectsWithTasks(slug: string) {
    // DB reads are introduced in Fase 3. Keeping the fallback explicit avoids
    // a hard cutover before migration verification is green.
    return jsonBackend.listProjectsWithTasks(slug);
  },
};

export function getTasksBackend(): TasksBackend {
  if (MC_TASKS_BACKEND === "db") return dbBackend;
  if (MC_TASKS_BACKEND === "db-shadow") return dbShadowBackend;
  return jsonBackend;
}
