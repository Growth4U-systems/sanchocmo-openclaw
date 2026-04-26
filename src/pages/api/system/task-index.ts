/**
 * GET /api/system/task-index?slug=X — Complete index of task → doc → skill → thread
 *
 * Returns every task across all projects for a client with the status
 * of each anchor (deliverable_file exists on disk? skill? thread file?).
 * Used by Settings page to show the full index, and by any page that
 * needs to verify data integrity.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { withErrorHandler } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";

interface TaskIndexEntry {
  projectId: string;
  projectName: string;
  taskId: string;
  taskName: string;
  status: string;
  skill: string;
  skillOk: boolean;
  deliverableFile: string;
  docExists: boolean;
  mcChatThreadId: string;
  threadFileExists: boolean;
  pillar: string | null;
  type: string;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const slug = req.query.slug as string;
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  const projectsDir = path.join(BASE, "brand", slug, "projects");
  if (!fs.existsSync(projectsDir)) {
    return res.status(200).json({ ok: true, entries: [], stats: { total: 0 } });
  }

  const entries: TaskIndexEntry[] = [];
  const projDirs = fs.readdirSync(projectsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  for (const projDirName of projDirs) {
    const projDir = path.join(projectsDir, projDirName);
    let projectId = projDirName;
    let projectName = projDirName;

    // Read project.json
    try {
      const pj = JSON.parse(fs.readFileSync(path.join(projDir, "project.json"), "utf-8"));
      projectId = pj.id || projDirName;
      projectName = pj.name || projDirName;
    } catch { /* ignore */ }

    // Read tasks.json
    let tasks: Record<string, unknown>[] = [];
    try {
      const td = JSON.parse(fs.readFileSync(path.join(projDir, "tasks.json"), "utf-8"));
      tasks = Array.isArray(td) ? td : (td.tasks || []);
    } catch { continue; }

    for (const task of tasks) {
      const df = (task.deliverable_file || "") as string;
      const thread = (task.mc_chat_thread_id || "") as string;
      const skill = (task.skill || "") as string;

      // Check doc exists on disk
      let docExists = false;
      if (df) {
        const absPath = df.startsWith(BASE) ? df : path.join(BASE, df);
        docExists = fs.existsSync(absPath);
      }

      // Check thread file exists
      let threadFileExists = false;
      if (thread) {
        const chatFile = path.join(BASE, "brand", slug, "chat", `${thread}.json`);
        threadFileExists = fs.existsSync(chatFile);
      }

      entries.push({
        projectId,
        projectName,
        taskId: (task.id || "") as string,
        taskName: (task.name || "") as string,
        status: (task.status || "todo") as string,
        skill,
        skillOk: !!skill && skill !== "MISSING",
        deliverableFile: df,
        docExists,
        mcChatThreadId: thread,
        threadFileExists,
        pillar: (task.pillar || null) as string | null,
        type: (task.type || "") as string,
      });
    }
  }

  const stats = {
    total: entries.length,
    docOk: entries.filter(e => e.docExists).length,
    docMissing: entries.filter(e => !e.docExists).length,
    docPlaceholder: entries.filter(e => e.deliverableFile.includes("/tasks/") && e.deliverableFile.endsWith("/deliverable.md")).length,
    skillOk: entries.filter(e => e.skillOk).length,
    threadOk: entries.filter(e => e.threadFileExists).length,
    byStatus: {
      completed: entries.filter(e => e.status === "completed").length,
      "in-progress": entries.filter(e => e.status === "in-progress").length,
      todo: entries.filter(e => e.status === "todo").length,
      blocked: entries.filter(e => e.status === "blocked").length,
    },
  };

  return res.status(200).json({ ok: true, entries, stats });
}

export default withErrorHandler(handler);
