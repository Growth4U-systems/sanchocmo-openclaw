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
  /** Set on ContentTask entries — refers to the parent Task that owns it. */
  parentTaskId?: string;
  /** Set on ContentTask entries. */
  ideaId?: string;
  /** Set on ContentTask entries. */
  targetChannels?: string[];
  /** Per-channel writer skill (one entry per target_channel). Useful when a
   *  ContentTask spans channels with different writer skills (e.g. blog →
   *  seo-content + linkedin → social-writer). */
  channelSkills?: { channel: string; skill: string }[];
  /** True for ContentTasks (so the UI can render them indented and link to
   *  the dedicated content-task route instead of the task route). */
  isContentTask?: boolean;
}

/** Mirrors generate-drafts writerSkillFor(). Kept inline to avoid pulling
 *  the whole API file just for the mapping. */
function writerSkillFor(channel: string): string {
  const c = (channel || "").toLowerCase();
  if (c === "linkedin" || c === "x" || c === "twitter") return "social-writer";
  if (c === "instagram" || c === "ig") return "instagram-content";
  if (c === "blog" || c === "seo") return "seo-content";
  if (c === "newsletter" || c === "email") return "newsletter";
  return "social-writer";
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

      const parentTaskId = (task.id || "") as string;

      entries.push({
        projectId,
        projectName,
        taskId: parentTaskId,
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

      // Nested ContentTasks (only for type=content tasks). Each becomes its
      // own entry so the index reflects the real unit of work — one
      // ContentTask per approved idea — not just the daily aggregate task.
      const contentTasks = Array.isArray(task.content_tasks)
        ? (task.content_tasks as Record<string, unknown>[])
        : [];
      for (const ct of contentTasks) {
        const ctId = (ct.id || "") as string;
        const ctSkill = (ct.skill || "") as string;
        const ctChannels = (ct.target_channels as string[] | undefined) || [];
        // First attached document is the canonical deliverable for the index.
        const docs = Array.isArray(ct.documents) ? (ct.documents as Record<string, unknown>[]) : [];
        const ctDf = docs.length > 0 ? `brand/${slug}/${docs[0].path}` : "";
        let ctDocExists = false;
        if (ctDf) {
          const absPath = ctDf.startsWith(BASE) ? ctDf : path.join(BASE, ctDf);
          ctDocExists = fs.existsSync(absPath);
        }

        // Thread id convention is `content-{ctId.lower()}` (matches what
        // buildContentTaskThread produces after the threadFile sanitizer).
        // Older ContentTasks stored `task-{ctId.lower()}` here by mistake —
        // we check the canonical name first, then fall back to the stored
        // value, so legacy data still resolves.
        const canonicalThread = `content-${ctId.toLowerCase()}`;
        const storedThread = ct.mc_chat_thread_id as string | undefined;
        let ctThread = canonicalThread;
        let ctChatFile = path.join(BASE, "brand", slug, "chat", `${canonicalThread}.json`);
        let ctThreadExists = fs.existsSync(ctChatFile);
        if (!ctThreadExists && storedThread && storedThread !== canonicalThread) {
          const altFile = path.join(BASE, "brand", slug, "chat", `${storedThread}.json`);
          if (fs.existsSync(altFile)) {
            ctThread = storedThread;
            ctChatFile = altFile;
            ctThreadExists = true;
          }
        }

        // Per-channel writer skill. The ContentTask only stores ONE skill
        // (the primary, derived from idea.target_channel), but a single
        // ContentTask can span channels with different writer skills (blog
        // → seo-content + linkedin → social-writer). Surface them all so
        // the index doesn't lie.
        const channelSkills = ctChannels.map((ch) => ({
          channel: ch,
          skill: writerSkillFor(ch),
        }));

        entries.push({
          projectId,
          projectName,
          taskId: ctId,
          taskName: (ct.name || "") as string,
          status: (ct.status || "New") as string,
          skill: ctSkill,
          skillOk: !!ctSkill && ctSkill !== "MISSING",
          deliverableFile: ctDf,
          docExists: ctDocExists,
          mcChatThreadId: ctThread,
          threadFileExists: ctThreadExists,
          pillar: null,
          type: "content-task",
          parentTaskId,
          ideaId: (ct.idea_id as string | undefined) || undefined,
          targetChannels: ctChannels.length ? ctChannels : undefined,
          channelSkills: channelSkills.length ? channelSkills : undefined,
          isContentTask: true,
        });
      }
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
