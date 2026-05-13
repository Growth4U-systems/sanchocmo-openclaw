import fs from "fs";
import path from "path";
import { sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { tasks } from "@/db/schema";

const root = process.cwd();
const workspaces = ["workspace-cervantes", "workspace-escudero", "workspace-main", "workspace-rocinante", "workspace-sancho"];

function readJSON(file: string, fallback: any) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}

function countJson() {
  const counts: Record<string, { projects: number; tasks: number; contentTasks: number }> = {};
  for (const workspace of workspaces) {
    const brandRoot = path.join(root, workspace, "brand");
    if (!fs.existsSync(brandRoot)) continue;
    for (const brandSlug of fs.readdirSync(brandRoot)) {
    const projectsRoot = path.join(brandRoot, brandSlug, "projects");
    if (!fs.existsSync(projectsRoot)) continue;
      const key = `${workspace}/${brandSlug}`;
      counts[key] ||= { projects: 0, tasks: 0, contentTasks: 0 };
      const contentTaskIds = new Set<string>();
      for (const projectDirName of fs.readdirSync(projectsRoot)) {
        const projectDir = path.join(projectsRoot, projectDirName);
        if (!fs.statSync(projectDir).isDirectory()) continue;
        if (!fs.existsSync(path.join(projectDir, "project.json"))) continue;
        counts[key].projects++;
        const raw = readJSON(path.join(projectDir, "tasks.json"), []);
        const projectTasks = Array.isArray(raw) ? raw : raw.tasks || [];
        counts[key].tasks += projectTasks.length;
        for (const task of projectTasks) {
          for (const ct of Array.isArray(task.content_tasks) ? task.content_tasks : []) {
            if (ct?.id) contentTaskIds.add(String(ct.id));
          }
        }
      }
      const flat = readJSON(path.join(brandRoot, brandSlug, "content", "content-tasks.json"), []);
      if (Array.isArray(flat)) {
        for (const ct of flat) {
          if (ct?.id) contentTaskIds.add(String(ct.id));
        }
      }
      counts[key].contentTasks = contentTaskIds.size;
    }
  }
  return counts;
}

async function main() {
  const jsonCounts = countJson();
  const rows = await db
    .select({
      workspaceSlug: tasks.workspaceSlug,
      brandSlug: tasks.brandSlug,
      type: tasks.type,
      count: sql<number>`count(*)::int`,
    })
    .from(tasks)
    .groupBy(tasks.workspaceSlug, tasks.brandSlug, tasks.type);

  const dbCounts: Record<string, { projects: number; tasks: number; contentTasks: number }> = {};
  for (const row of rows) {
    const key = `${row.workspaceSlug}/${row.brandSlug}`;
    dbCounts[key] ||= { projects: 0, tasks: 0, contentTasks: 0 };
    if (row.type === "project") dbCounts[key].projects += Number(row.count);
    else if (row.type === "content_task" || row.type === "content_subtask") dbCounts[key].contentTasks += Number(row.count);
    else dbCounts[key].tasks += Number(row.count);
  }

  const mismatches = [];
  for (const [scope, expected] of Object.entries(jsonCounts)) {
    const actual = dbCounts[scope] || { projects: 0, tasks: 0, contentTasks: 0 };
    if (
      expected.projects !== actual.projects ||
      expected.tasks !== actual.tasks ||
      expected.contentTasks !== actual.contentTasks
    ) {
      mismatches.push({ scope, expected, actual });
    }
  }

  console.log(JSON.stringify({ ok: mismatches.length === 0, mismatches, jsonCounts, dbCounts }, null, 2));
  if (mismatches.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
