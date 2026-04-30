/**
 * POST /api/content-engine/generate-drafts
 *
 * Triggered automatically by `/api/content-engine/ideas` PATCH when an idea
 * transitions to `approved` (from Slack/Discord interactivity, MC UI, etc).
 *
 * What this endpoint does (synchronously, fast):
 *   1. Resolves the writer skill from `target_channel` (B1 mapping).
 *   2. Ensures the weekly content project + daily content Task exist, and
 *      adds the idea to the parent Task's `idea_ids[]`.
 *   3. Creates a `ContentTask` nested under the daily Task with
 *      `status: "Approved"` and `pipeline_state: "researching"`.
 *   4. For each target channel, creates an empty draft markdown file with
 *      YAML frontmatter at `brand/{slug}/content/drafts/{idea-id}/{channel}.md`.
 *      The body is a placeholder that the writer skill will overwrite.
 *   5. Attaches each draft path to the ContentTask's `documents[]`.
 *
 * What it does NOT do (yet — TODO):
 *   - Invoke Escudero Content end-to-end. The actual run of the writer skill
 *     (deep-research → Clarify → writing) is expected to happen via either:
 *       a) An Escudero cron/queue picking up ContentTasks in `Approved` +
 *          `pipeline_state: "researching"` state.
 *       b) A dedicated wrapper endpoint that wires this into the OpenClaw
 *          gateway (`openclaw cron run-once` or equivalent).
 *     Until that exists, drafts stay in `pending` until a human or future
 *     automation flips them.
 *
 * Body: { slug: string, ideaId: string }
 */

import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { withErrorHandler } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";
import { createContentTask, attachDocumentToContentTask } from "@/lib/data/content-tasks";
import { createEmptyDraft, draftRelPath } from "@/lib/data/drafts";
import { triggerWriter } from "@/lib/data/writer-trigger";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadIdeas(slug: string): any[] {
  const filePath = path.join(BASE, "brand", slug, "content", "idea-queue.json");
  if (!fs.existsSync(filePath)) return [];
  try { return JSON.parse(fs.readFileSync(filePath, "utf-8")); } catch { return []; }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function saveIdeas(slug: string, ideas: any[]) {
  const filePath = path.join(BASE, "brand", slug, "content", "idea-queue.json");
  fs.writeFileSync(filePath, JSON.stringify(ideas, null, 2));
}

/** Resolve writer skill from target_channel. Mirrors social-writer/SKILL.md mapping. */
function writerSkillFor(channel: string): string {
  const c = (channel || "").toLowerCase();
  if (c === "linkedin" || c === "x" || c === "twitter") return "social-writer";
  if (c === "instagram" || c === "ig") return "instagram-content";
  if (c === "blog" || c === "seo") return "seo-content";
  if (c === "newsletter" || c === "email") return "newsletter";
  return "social-writer";
}

/**
 * Channels to produce drafts for. Mirrors the cadence-config-derived rules
 * (single primary plus a sensible companion).
 */
function expandChannels(primary: string): string[] {
  const channels = [primary];
  if (primary === "linkedin" && !channels.includes("twitter")) channels.push("twitter");
  if (primary === "twitter" && !channels.includes("linkedin")) channels.push("linkedin");
  if (primary === "blog" && !channels.includes("linkedin")) channels.push("linkedin");
  return channels;
}

/** Get or create the weekly content project + daily task, attaching ideaId to the task. */
function ensureWeeklyProjectAndTask(slug: string, ideaId: string): { projectId: string; taskId: string } {
  const now = new Date();
  const weekNum = Math.ceil(((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 86400000 + 1) / 7);
  const projectId = `P-Content-Semana-${weekNum}`;
  const dateStr = now.toISOString().slice(0, 10);
  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon...
  const taskNum = dayOfWeek === 0 ? 7 : dayOfWeek;
  const taskId = `${projectId}-T${String(taskNum).padStart(2, "0")}`;

  const projectsDir = path.join(BASE, "brand", slug, "projects");
  let projDir = "";
  try {
    const dirs = fs.readdirSync(projectsDir, { withFileTypes: true });
    const match = dirs.find((d) => d.isDirectory() && d.name.startsWith(projectId));
    if (match) projDir = path.join(projectsDir, match.name);
  } catch { /* ignore */ }

  if (!projDir) {
    projDir = path.join(projectsDir, projectId);
    fs.mkdirSync(projDir, { recursive: true });
    fs.writeFileSync(path.join(projDir, "project.json"), JSON.stringify({
      id: projectId, name: `Content Semana ${weekNum}`,
      description: `Contenido semanal — semana ${weekNum} de ${now.getFullYear()}`,
      status: "active", category: "content",
      created_at: now.toISOString(),
    }, null, 2));
    fs.writeFileSync(path.join(projDir, "tasks.json"), "[]");
  }

  const tasksPath = path.join(projDir, "tasks.json");
  let tasks: Record<string, unknown>[] = [];
  try { tasks = JSON.parse(fs.readFileSync(tasksPath, "utf-8")); } catch { /* ignore */ }

  if (!tasks.find((t) => t.id === taskId)) {
    const chatThreadId = `task-${taskId.toLowerCase()}`;
    tasks.push({
      id: taskId,
      name: `Contenido ${dateStr}`,
      description: `Ideas de contenido aprobadas para ${dateStr}`,
      type: "content",
      status: "in-progress",
      skill: "social-writer",
      deliverable_file: `brand/${slug}/content/published/${dateStr}.json`,
      mc_chat_thread_id: chatThreadId,
      discord_thread_id: null,
      owner: "Escudero Content",
      created_at: now.toISOString(),
      idea_ids: [],
    });
    fs.writeFileSync(tasksPath, JSON.stringify(tasks, null, 2));

    const chatDir = path.join(BASE, "brand", slug, "chat");
    fs.mkdirSync(chatDir, { recursive: true });
    const chatFile = path.join(chatDir, `${chatThreadId}.json`);
    if (!fs.existsSync(chatFile)) {
      fs.writeFileSync(chatFile, JSON.stringify({ messages: [], createdAt: now.toISOString() }, null, 2));
    }
  }

  // Add idea to the task's idea_ids (dedupe — generate-drafts can re-run on
  // re-approval and we don't want duplicate ids piling up).
  const task = tasks.find((t) => t.id === taskId) as Record<string, unknown> | undefined;
  if (task) {
    const ideaIds = Array.isArray(task.idea_ids) ? (task.idea_ids as string[]) : [];
    if (!ideaIds.includes(ideaId)) {
      task.idea_ids = [...ideaIds, ideaId];
      fs.writeFileSync(tasksPath, JSON.stringify(tasks, null, 2));
    }
  }

  return { projectId, taskId };
}

function starterBody(channel: string, angleDraft: string, signal: string): string {
  return `# ${channel} draft\n\n## Ángulo aprobado\n\n${angleDraft}\n\n## Signal\n\n${signal}\n\n---\n\n_Pendiente: Escudero Content ejecutará deep-research → Clarify → writer y reemplazará este placeholder con el draft real._\n`;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { slug, ideaId } = req.body;
  if (!slug || !ideaId) return res.status(400).json({ error: "Missing slug or ideaId" });

  const ideas = loadIdeas(slug);
  const idea = ideas.find((i) => i.id === ideaId);
  if (!idea) return res.status(404).json({ error: "Idea not found" });
  if (idea.status !== "approved") {
    return res.status(400).json({ error: "Idea must be approved before generating drafts" });
  }

  const primaryChannel = idea.target_channel || "linkedin";
  const channels = expandChannels(primaryChannel);
  const skill = writerSkillFor(primaryChannel);

  // 1. Ensure weekly project + daily task (also adds ideaId to task.idea_ids).
  const { projectId, taskId } = ensureWeeklyProjectAndTask(slug, ideaId);

  // 2. Create ContentTask under the daily task. Idempotent — returns existing
  //    if this idea was already provisioned (e.g. on re-approval).
  const contentTask = createContentTask(slug, {
    parent_task_id: taskId,
    idea_id: ideaId,
    name: (idea.title as string) || `Idea ${ideaId}`,
    skill,
    target_channels: channels,
    status: "Approved",
    pipeline_state: "researching",
  });

  // 3. Create one draft markdown file per channel and attach to ContentTask.
  const angle = (idea.angle_draft as string) || "";
  const signal = (idea.signal?.summary as string) || "";
  const provisioned: string[] = [];

  for (const channel of channels) {
    createEmptyDraft(
      slug,
      ideaId,
      channel,
      {
        idea_id: ideaId,
        channel,
        content_task_id: contentTask.id,
        parent_task_id: taskId,
        status: "pending",
        iteration: 0,
        clarify_status: "pending",
      },
      starterBody(channel, angle, signal),
    );
    attachDocumentToContentTask(slug, taskId, contentTask.id, {
      path: draftRelPath(ideaId, channel),
      name: channel.charAt(0).toUpperCase() + channel.slice(1),
      channel,
    });
    provisioned.push(channel);
  }

  // 4. Mirror project_id / project_task_id / content_task_id back to the idea
  //    so the Idea Bank can link directly to the Content Task and its drafts.
  idea.project_task_id = taskId;
  idea.project_id = projectId;
  idea.content_task_id = contentTask.id;
  idea.content_task_channels = channels;
  saveIdeas(slug, ideas);

  // 5. Lanzar la skill de escritura. Posteamos al thread del ContentTask vía
  //    el gateway de OpenClaw para que Escudero Content corra deep-research →
  //    Clarify → writer y sobreescriba los .md. Best-effort: si el gateway no
  //    responde, los drafts quedan pendientes y se pueden disparar a mano
  //    desde el chat del ContentTask.
  const trigger = await triggerWriter({
    slug,
    contentTaskId: contentTask.id,
    parentTaskId: taskId,
    ideaId,
    channels,
    skill,
    instruction: "",
    kind: "initial",
  });

  return res.status(200).json({
    ok: true,
    ideaId,
    contentTaskId: contentTask.id,
    projectId,
    taskId,
    channelsProvisioned: provisioned,
    skill,
    writerTriggered: trigger.forwardedToGateway,
    writerError: trigger.error,
  });
}

export default withErrorHandler(handler);
