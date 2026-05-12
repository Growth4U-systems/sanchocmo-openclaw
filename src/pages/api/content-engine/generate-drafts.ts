/**
 * POST /api/content-engine/generate-drafts — Generate draft templates per channel
 *
 * Takes an approved idea and creates channel-specific draft templates
 * based on the angle_draft + platform formatting rules.
 *
 * Body: { slug, ideaId }
 *
 * For now: generates structured templates from the angle_draft.
 * Future: calls Escudero Content to run Clarify + social-writer for
 * AI-generated drafts with predictions.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { withErrorHandler } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";

interface Draft {
  channel: string;
  content: string;
  status: "draft";
  iterations: never[];
  created_at: string;
  updated_at: string;
}

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

function generateLinkedInDraft(angle: string, signal: string, contentType: string): string {
  // LinkedIn: 1,300-2,000 chars. Personal narrative. Hook in first line.
  const hook = contentType === "Hot Take"
    ? `Esto va a ser impopular, pero hay que decirlo.\n\n`
    : contentType === "Proof Post"
    ? `Los datos no mienten.\n\n`
    : contentType === "Framework"
    ? `Llevo anos usando este framework. Funciona.\n\n`
    : contentType === "Case Study"
    ? `Esto paso de verdad. Y cambio como vemos el growth.\n\n`
    : `Hay algo que nadie esta hablando.\n\n`;

  return `${hook}${angle}\n\n---\n\n📰 Contexto: ${signal}\n\n¿Que opinas? Dejame tu comentario 👇`;
}

function generateTwitterDraft(angle: string, signal: string, contentType: string): string {
  // X/Twitter: 280 chars for tweet, or thread format
  const firstLine = angle.split(".")[0] + ".";
  if (contentType === "Framework") {
    return `🧵 Thread:\n\n1/ ${firstLine}\n\n2/ [desarrolla el primer punto]\n\n3/ [segundo punto]\n\n4/ [tercer punto]\n\n5/ La leccion: [conclusion]\n\nGuarda este thread si te fue util 🔖`;
  }
  // Short take
  return `${firstLine}\n\n${angle.length > 200 ? angle.slice(0, 200) + "..." : angle}`;
}

function generateBlogDraft(angle: string, signal: string, contentType: string): string {
  return `# [Titulo SEO — incluir keyword principal]\n\n## TL;DR\n\n${angle}\n\n## Contexto\n\n${signal}\n\n## Analisis\n\n[Desarrollar el argumento principal con datos y ejemplos]\n\n## Que significa esto para tu startup\n\n[Aplicacion practica]\n\n## Conclusion\n\n[Resumen + CTA]\n\n---\n\n*¿Quieres que analicemos tu caso? [Agenda una llamada diagnostica](link)*`;
}

function generateNewsletterDraft(angle: string, signal: string): string {
  return `## Esta semana en Growth\n\n${signal}\n\n### Mi take\n\n${angle}\n\n### Que puedes hacer con esto\n\n1. [Accion concreta 1]\n2. [Accion concreta 2]\n3. [Accion concreta 3]\n\n---\n\n*Si alguien te reenvio esto, [suscribete aqui](link)*`;
}

/** Get or create the weekly content project + daily task */
function ensureWeeklyProjectAndTask(slug: string): { projectId: string; taskId: string } {
  const now = new Date();
  const weekNum = Math.ceil(((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 86400000 + 1) / 7);
  const projectId = `P-Content-Semana-${weekNum}`;
  const dateStr = now.toISOString().slice(0, 10);
  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon...
  const taskNum = dayOfWeek === 0 ? 7 : dayOfWeek;
  const taskId = `${projectId}-T${String(taskNum).padStart(2, "0")}`;

  const projectsDir = path.join(BASE, "brand", slug, "projects");
  // Find or create project dir
  let projDir = "";
  try {
    const dirs = fs.readdirSync(projectsDir, { withFileTypes: true });
    const match = dirs.find(d => d.isDirectory() && d.name.startsWith(projectId));
    if (match) {
      projDir = path.join(projectsDir, match.name);
    }
  } catch { /* ignore */ }

  if (!projDir) {
    const dirName = projectId;
    projDir = path.join(projectsDir, dirName);
    fs.mkdirSync(projDir, { recursive: true });
    fs.writeFileSync(path.join(projDir, "project.json"), JSON.stringify({
      id: projectId, name: `Content Semana ${weekNum}`,
      description: `Contenido semanal — semana ${weekNum} de ${now.getFullYear()}`,
      status: "active", category: "content",
      created_at: now.toISOString(),
    }, null, 2));
    fs.writeFileSync(path.join(projDir, "tasks.json"), "[]");
  }

  // Find or create daily task
  const tasksPath = path.join(projDir, "tasks.json");
  let tasks: Record<string, unknown>[] = [];
  try { tasks = JSON.parse(fs.readFileSync(tasksPath, "utf-8")); } catch { /* ignore */ }

  if (!tasks.find(t => t.id === taskId)) {
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

    // Create chat thread file
    const chatDir = path.join(BASE, "brand", slug, "chat");
    fs.mkdirSync(chatDir, { recursive: true });
    const chatFile = path.join(chatDir, `${chatThreadId}.json`);
    if (!fs.existsSync(chatFile)) {
      fs.writeFileSync(chatFile, JSON.stringify({ messages: [], createdAt: now.toISOString() }, null, 2));
    }
  }

  // Add idea to the task's idea_ids
  const task = tasks.find(t => t.id === taskId) as Record<string, unknown>;

  return { projectId, taskId };
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

  const angle = idea.angle_draft || "";
  const signal = idea.signal?.summary || "";
  const contentType = idea.content_type || "Hot Take";
  const primaryChannel = idea.target_channel || "linkedin";

  // Determine which channels to generate for
  const channels: string[] = [];
  channels.push(primaryChannel);
  if (primaryChannel === "linkedin" && !channels.includes("twitter")) channels.push("twitter");
  if (primaryChannel === "twitter" && !channels.includes("linkedin")) channels.push("linkedin");
  if (primaryChannel === "blog") channels.push("linkedin");

  const now = new Date().toISOString();
  const drafts: Draft[] = [];

  for (const channel of channels) {
    // Skip if draft already exists for this channel
    if (idea.drafts?.some((d: { channel: string }) => d.channel === channel)) continue;

    let content = "";
    switch (channel) {
      case "linkedin":
        content = generateLinkedInDraft(angle, signal, contentType);
        break;
      case "twitter":
        content = generateTwitterDraft(angle, signal, contentType);
        break;
      case "blog":
        content = generateBlogDraft(angle, signal, contentType);
        break;
      case "newsletter":
        content = generateNewsletterDraft(angle, signal);
        break;
      default:
        content = `# ${channel}\n\n${angle}\n\nContexto: ${signal}`;
    }

    drafts.push({
      channel,
      content,
      status: "draft",
      iterations: [],
      created_at: now,
      updated_at: now,
    });
  }

  // Create/find weekly project + daily task
  const { projectId, taskId } = ensureWeeklyProjectAndTask(slug);
  idea.project_task_id = taskId;
  idea.project_id = projectId;

  // Merge with existing drafts
  idea.drafts = [...(idea.drafts || []), ...drafts];
  saveIdeas(slug, ideas);

  return res.status(200).json({
    ok: true,
    ideaId,
    draftsGenerated: drafts.length,
    channels: drafts.map(d => d.channel),
    projectId,
    taskId,
  });
}

export default withErrorHandler(handler);
