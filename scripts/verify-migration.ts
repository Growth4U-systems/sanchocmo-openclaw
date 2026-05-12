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
  const counts: Record<string, { projects: number; tasks: number; contentSubtasks: number }> = {};
  for (const workspace of workspaces) {
    const brandRoot = path.join(root, workspace, "brand");
    if (!fs.existsSync(brandRoot)) continue;
    for (const brandSlug of fs.readdirSync(brandRoot)) {
      const projectsRoot = path.join(brandRoot, brandSlug, "projects");
      if (!fs.existsSync(projectsRoot)) continue;
      counts[brandSlug] ||= { projects: 0, tasks: 0, contentSubtasks: 0 };
      for (const projectDirName of fs.readdirSync(projectsRoot)) {
        const projectDir = path.join(projectsRoot, projectDirName);
        if (!fs.statSync(projectDir).isDirectory()) continue;
        if (!fs.existsSync(path.join(projectDir, "project.json"))) continue;
        counts[brandSlug].projects++;
        const raw = readJSON(path.join(projectDir, "tasks.json"), []);
        const projectTasks = Array.isArray(raw) ? raw : raw.tasks || [];
        counts[brandSlug].tasks += projectTasks.length;
        counts[brandSlug].contentSubtasks += projectTasks.reduce(
          (sum: number, task: any) => sum + (Array.isArray(task.content_tasks) ? task.content_tasks.length : 0),
          0,
        );
      }
    }
  }
  return counts;
}

async function main() {
  const jsonCounts = countJson();
  const rows = await db
    .select({
      brandSlug: tasks.brandSlug,
      type: tasks.type,
      count: sql<number>`count(*)::int`,
    })
    .from(tasks)
    .groupBy(tasks.brandSlug, tasks.type);

  const dbCounts: Record<string, { projects: number; tasks: number; contentSubtasks: number }> = {};
  for (const row of rows) {
    dbCounts[row.brandSlug] ||= { projects: 0, tasks: 0, contentSubtasks: 0 };
    if (row.type === "project") dbCounts[row.brandSlug].projects += Number(row.count);
    else if (row.type === "content_subtask") dbCounts[row.brandSlug].contentSubtasks += Number(row.count);
    else dbCounts[row.brandSlug].tasks += Number(row.count);
  }

  const mismatches = [];
  for (const [brandSlug, expected] of Object.entries(jsonCounts)) {
    const actual = dbCounts[brandSlug] || { projects: 0, tasks: 0, contentSubtasks: 0 };
    if (
      expected.projects !== actual.projects ||
      expected.tasks !== actual.tasks ||
      expected.contentSubtasks !== actual.contentSubtasks
    ) {
      mismatches.push({ brandSlug, expected, actual });
    }
  }

  console.log(JSON.stringify({ ok: mismatches.length === 0, mismatches, jsonCounts, dbCounts }, null, 2));
  if (mismatches.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
