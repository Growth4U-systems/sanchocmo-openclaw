import fs from "fs";
import path from "path";
import { BASE, brandDir } from "@/lib/data/paths";
import { readJSON } from "@/lib/data/json-io";
import { applyTaskAnchors, type TaskCreateInput } from "@/lib/data/task-create-helpers";
import { instantiateSingletonTask } from "@/lib/data/task-blueprints";
import type { Project, Task } from "@/types";

export const MEETING_INTELLIGENCE_SETUP_TASK_NAME = "Implementar/configurar Meeting Intelligence";

type TasksFileShape = Task[] | { project_id?: string; tasks?: Task[] };

export interface MeetingIntelligenceSetupTaskInfo {
  project: Project;
  task: Task;
  projectDirName: string;
  legacyTaskCount: number;
  created: boolean;
}

interface ProjectRecord {
  project: Project;
  projectDirName: string;
  projectDirPath: string;
  tasksFilePath: string;
  tasksData: TasksFileShape;
  tasks: Task[];
}

function safeSlug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function readTasksFile(tasksFilePath: string): TasksFileShape {
  const data = readJSON<TasksFileShape | null>(tasksFilePath, null);
  if (!data) return { tasks: [] };
  return data;
}

function tasksFromData(data: TasksFileShape): Task[] {
  if (Array.isArray(data)) return data;
  return Array.isArray(data.tasks) ? data.tasks : [];
}

function writeTasksFile(record: ProjectRecord, tasks: Task[]) {
  const nextData = Array.isArray(record.tasksData)
    ? tasks
    : { ...record.tasksData, project_id: record.project.id, tasks };
  fs.writeFileSync(record.tasksFilePath, JSON.stringify(nextData, null, 2));
}

function loadProjectRecords(slug: string): ProjectRecord[] {
  const projectsDir = path.join(brandDir(slug), "projects");
  if (!fs.existsSync(projectsDir)) return [];

  return fs.readdirSync(projectsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^P[\d-]/.test(entry.name))
    .map((entry) => {
      const projectDirPath = path.join(projectsDir, entry.name);
      const projectPath = path.join(projectDirPath, "project.json");
      const tasksFilePath = path.join(projectDirPath, "tasks.json");
      const project = readJSON<Project | null>(projectPath, null);
      if (!project) return null;
      const tasksData = readTasksFile(tasksFilePath);
      return {
        project,
        projectDirName: entry.name,
        projectDirPath,
        tasksFilePath,
        tasksData,
        tasks: tasksFromData(tasksData),
      };
    })
    .filter(Boolean) as ProjectRecord[];
}

function foundationRank(record: ProjectRecord): number {
  const haystack = `${record.project.id} ${record.project.name} ${record.project.category || ""} ${record.project.strategy || ""}`.toLowerCase();
  if (haystack.includes("fast foundation")) return 0;
  if (haystack.includes("onboarding")) return 1;
  if (haystack.includes("full foundation")) return 2;
  if (record.project.category === "foundation") return 3;
  if (haystack.includes("foundation")) return 4;
  return 99;
}

function findFoundationProject(records: ProjectRecord[]): ProjectRecord | null {
  return records
    .filter((record) => foundationRank(record) < 99)
    .sort((a, b) => foundationRank(a) - foundationRank(b))[0] || null;
}

function createOnboardingProject(slug: string): ProjectRecord {
  const projectsDir = path.join(brandDir(slug), "projects");
  fs.mkdirSync(projectsDir, { recursive: true });

  const baseDirName = "P00-Onboarding-Foundation-Onboarding";
  let dirName = baseDirName;
  let suffix = 2;
  while (fs.existsSync(path.join(projectsDir, dirName))) {
    dirName = `${baseDirName}-${suffix}`;
    suffix += 1;
  }

  const project: Project = {
    id: "P00-Onboarding",
    slug: dirName,
    name: "Foundation / Onboarding",
    strategy: "Foundation — Onboarding",
    status: "active",
    phase: -1,
    category: "foundation",
    created_at: new Date().toISOString(),
    review_date: null,
    description: "Tareas iniciales de setup operativo y contexto base para Mission Control.",
    approach: "Configurar las fuentes y rutas que Sancho necesita antes de ejecutar inteligencia sobre reuniones o documentos.",
  };

  const projectDirPath = path.join(projectsDir, dirName);
  const tasksFilePath = path.join(projectDirPath, "tasks.json");
  fs.mkdirSync(projectDirPath, { recursive: true });
  fs.writeFileSync(path.join(projectDirPath, "project.json"), JSON.stringify(project, null, 2));
  fs.writeFileSync(tasksFilePath, JSON.stringify({ project_id: project.id, tasks: [] }, null, 2));

  return {
    project,
    projectDirName: dirName,
    projectDirPath,
    tasksFilePath,
    tasksData: { project_id: project.id, tasks: [] },
    tasks: [],
  };
}

function taskPrefix(record: ProjectRecord): string {
  const prefixes = record.tasks
    .map((task) => task.id.match(/^(.*)-T\d+$/)?.[1])
    .filter(Boolean) as string[];
  if (prefixes.length > 0) return prefixes[0];
  const id = record.project.id.toLowerCase();
  if (id.includes("fast")) return "P00-FF";
  if (id.includes("full")) return "P00-FUL";
  if (id.includes("onboarding")) return "P00-ONB";
  return record.project.id;
}

function nextTaskId(record: ProjectRecord): string {
  const prefix = taskPrefix(record);
  const max = record.tasks.reduce((currentMax, task) => {
    const match = task.id.match(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-T(\\d+)$`));
    return match ? Math.max(currentMax, Number(match[1])) : currentMax;
  }, 0);
  return `${prefix}-T${String(max + 1).padStart(2, "0")}`;
}

function legacyTaskCount(records: ProjectRecord[]) {
  return records.flatMap((record) => record.tasks).filter((task) => {
    const name = task.name.toLowerCase();
    return name.includes("conectar reuniones") || (task.skill === "meeting-intelligence" && task.name !== MEETING_INTELLIGENCE_SETUP_TASK_NAME);
  }).length;
}

function findCanonicalTask(records: ProjectRecord[]): MeetingIntelligenceSetupTaskInfo | null {
  const legacyCount = legacyTaskCount(records);
  for (const record of records) {
    const task = record.tasks.find((item) => item.name === MEETING_INTELLIGENCE_SETUP_TASK_NAME);
    if (task) {
      return {
        project: record.project,
        task,
        projectDirName: record.projectDirName,
        legacyTaskCount: legacyCount,
        created: false,
      };
    }
  }
  return null;
}

function buildSetupTask(slug: string, taskId: string): TaskCreateInput {
  // Task contract from the declarative registry (config/pillar-manifest.json →
  // taskSets.meeting); placement (host project, dedupe, id) stays imperative.
  return instantiateSingletonTask("meeting", { slug, id: taskId });
}

export function getMeetingIntelligenceSetupTask(slug: string): MeetingIntelligenceSetupTaskInfo | null {
  return findCanonicalTask(loadProjectRecords(slug));
}

export function ensureMeetingIntelligenceSetupTask(slug: string): MeetingIntelligenceSetupTaskInfo {
  const records = loadProjectRecords(slug);
  const existing = findCanonicalTask(records);
  if (existing) return existing;

  const host = findFoundationProject(records) || createOnboardingProject(slug);
  const task = buildSetupTask(slug, nextTaskId(host));
  applyTaskAnchors(slug, task);

  const createdTask = task as unknown as Task;
  const nextTasks = [...host.tasks, createdTask];
  writeTasksFile(host, nextTasks);

  return {
    project: host.project,
    task: createdTask,
    projectDirName: host.projectDirName,
    legacyTaskCount: legacyTaskCount(records),
    created: true,
  };
}

export function meetingIntelligenceSetupReportPath(slug: string) {
  return path.join(BASE, "brand", safeSlug(slug), "intelligence", "setup.md");
}
