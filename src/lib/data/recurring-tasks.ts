import fs from "fs";
import path from "path";
import { readJSON, writeJSON, listDir, readText } from "./json-io";
import { recurringTasksFile, brandDir } from "./paths";
import type { RecurringTask, CronOutput } from "@/types";

export function loadRecurringTasks(slug: string): RecurringTask[] {
  const data = readJSON<{ tasks: RecurringTask[] } | RecurringTask[]>(
    recurringTasksFile(slug),
    { tasks: [] }
  );
  return Array.isArray(data) ? data : data.tasks || [];
}

export function saveRecurringTasks(slug: string, tasks: RecurringTask[]): void {
  writeJSON(recurringTasksFile(slug), { tasks });
}

/**
 * Load latest cron run outputs for a client
 */
export function loadCronRuns(slug: string): CronOutput[] {
  const tasksDir = path.join(brandDir(slug), "recurring-tasks");
  const outputs: CronOutput[] = [];

  for (const taskDir of listDir(tasksDir)) {
    const taskPath = path.join(tasksDir, taskDir);
    try {
      if (!fs.statSync(taskPath).isDirectory()) continue;
    } catch {
      continue;
    }

    // Find most recent output file
    const files = listDir(taskPath)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .reverse();

    if (files.length > 0) {
      const output = readJSON<CronOutput | null>(
        path.join(taskPath, files[0]),
        null
      );
      if (output) outputs.push(output);
    }
  }

  return outputs;
}

/**
 * Read script content for a recurring task
 */
export function readScript(slug: string, taskName: string): string | null {
  const base = path.join(brandDir(slug), "recurring-tasks", taskName);
  for (const ext of [".py", ".sh", ".js"]) {
    const content = readText(path.join(base, `script${ext}`));
    if (content) return content;
  }
  return null;
}

/**
 * Write script content for a recurring task
 */
export function writeScript(slug: string, taskName: string, content: string, ext: string): void {
  const dir = path.join(brandDir(slug), "recurring-tasks", taskName);
  fs.mkdirSync(dir, { recursive: true });

  const filePath = path.join(dir, `script${ext}`);

  // Backup existing
  if (fs.existsSync(filePath)) {
    fs.copyFileSync(filePath, filePath + ".bak");
  }

  fs.writeFileSync(filePath, content);
  if (ext === ".sh" || ext === ".py") {
    fs.chmodSync(filePath, 0o755);
  }
}
