/**
 * POST /api/content-engine/editorial-dispatch — Select ideas for today's slots
 *
 * Reads cadence-config.yml to determine today's slots (which channels need content).
 * Selects N candidate ideas per slot from idea-queue.json (recency-aware).
 * Creates the weekly project + daily task.
 * Marks selected ideas as "dispatched" with their slot assignment.
 *
 * Body: { slug }
 * Returns: { slots: [{ channel, candidates: Idea[] }], projectId, taskId }
 */

import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { withErrorHandler } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";

const CANDIDATES_PER_SLOT = 3;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadIdeas(slug: string): any[] {
  const f = path.join(BASE, "brand", slug, "content", "idea-queue.json");
  if (!fs.existsSync(f)) return [];
  try { return JSON.parse(fs.readFileSync(f, "utf-8")); } catch { return []; }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function saveIdeas(slug: string, ideas: any[]) {
  fs.writeFileSync(path.join(BASE, "brand", slug, "content", "idea-queue.json"), JSON.stringify(ideas, null, 2));
}

function loadCadence(slug: string): Record<string, unknown> | null {
  const f = path.join(BASE, "brand", slug, "content", "configs", "cadence-config.yml");
  if (!fs.existsSync(f)) return null;
  try { return yaml.load(fs.readFileSync(f, "utf-8")) as Record<string, unknown>; } catch { return null; }
}

function ensureWeeklyProjectAndTask(slug: string): { projectId: string; taskId: string } {
  const now = new Date();
  const weekNum = Math.ceil(((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 86400000 + 1) / 7);
  const projectId = `P-Content-Semana-${weekNum}`;
  const dateStr = now.toISOString().slice(0, 10);
  const dayOfWeek = now.getDay();
  const taskNum = dayOfWeek === 0 ? 7 : dayOfWeek;
  const taskId = `${projectId}-T${String(taskNum).padStart(2, "0")}`;

  const projectsDir = path.join(BASE, "brand", slug, "projects");
  let projDir = "";
  try {
    const dirs = fs.readdirSync(projectsDir, { withFileTypes: true });
    const match = dirs.find(d => d.isDirectory() && d.name.startsWith(projectId));
    if (match) projDir = path.join(projectsDir, match.name);
  } catch { /* ignore */ }

  if (!projDir) {
    projDir = path.join(projectsDir, projectId);
    fs.mkdirSync(projDir, { recursive: true });
    fs.writeFileSync(path.join(projDir, "project.json"), JSON.stringify({
      id: projectId, name: `Content Semana ${weekNum}`,
      description: `Contenido semanal — semana ${weekNum} de ${now.getFullYear()}`,
      status: "active", category: "content", created_at: now.toISOString(),
    }, null, 2));
    fs.writeFileSync(path.join(projDir, "tasks.json"), "[]");
  }

  const tasksPath = path.join(projDir, "tasks.json");
  let tasks: Record<string, unknown>[] = [];
  try { tasks = JSON.parse(fs.readFileSync(tasksPath, "utf-8")); } catch { /* ignore */ }

  if (!tasks.find(t => t.id === taskId)) {
    const chatThreadId = `task-${taskId.toLowerCase()}`;
    tasks.push({
      id: taskId, name: `Contenido ${dateStr}`,
      description: `Ideas de contenido para ${dateStr}`,
      type: "content", status: "in-progress", skill: "social-writer",
      deliverable_file: `brand/${slug}/content/published/${dateStr}.json`,
      mc_chat_thread_id: chatThreadId, discord_thread_id: null,
      owner: "Escudero Content", created_at: now.toISOString(), idea_ids: [],
    });
    fs.writeFileSync(tasksPath, JSON.stringify(tasks, null, 2));

    const chatDir = path.join(BASE, "brand", slug, "chat");
    fs.mkdirSync(chatDir, { recursive: true });
    const chatFile = path.join(chatDir, `${chatThreadId}.json`);
    if (!fs.existsSync(chatFile)) {
      fs.writeFileSync(chatFile, JSON.stringify({ messages: [], createdAt: now.toISOString() }, null, 2));
    }
  }

  return { projectId, taskId };
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { slug } = req.body;
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  // 1. Read cadence to determine today's slots
  const cadence = loadCadence(slug);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channels = (cadence?.channels || {}) as Record<string, any>;
  const now = new Date();
  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const today = dayNames[now.getDay()];

  const todaySlots: { channel: string; count: number }[] = [];
  for (const [ch, cfg] of Object.entries(channels)) {
    if (!cfg.active) continue;
    const bestDays: string[] = cfg.best_days || [];
    // Check if today is a publishing day for this channel
    if (bestDays.length === 0 || bestDays.includes(today)) {
      todaySlots.push({ channel: ch, count: 1 });
    }
  }

  if (todaySlots.length === 0) {
    return res.status(200).json({ ok: true, slots: [], message: "No slots for today according to cadence" });
  }

  // 2. Create project + task
  const { projectId, taskId } = ensureWeeklyProjectAndTask(slug);

  // 3. Select candidate ideas per slot
  const ideas = loadIdeas(slug);
  const readyIdeas = ideas.filter(i => i.status === "New");

  // Calculate recency score
  const scored = readyIdeas.map(idea => {
    const ageDays = (now.getTime() - new Date(idea.created_at).getTime()) / 86400000;
    const recencyScore = Math.exp(-ageDays / 5);
    return { ...idea, recencyScore, ageDays };
  }).filter(i => i.ageDays <= 14); // Stale policy

  const slots = todaySlots.map(slot => {
    // Find ideas that match this channel (or are adaptable)
    const channelMatch = scored.filter(i =>
      i.target_channel === slot.channel ||
      (slot.channel === "linkedin" && i.target_channel === "twitter") ||
      (slot.channel === "twitter" && i.target_channel === "linkedin")
    );
    // Sort by recency + confidence
    channelMatch.sort((a, b) => {
      const scoreA = a.recencyScore * 0.6 + (a.pov_confidence || 0.5) * 0.4;
      const scoreB = b.recencyScore * 0.6 + (b.pov_confidence || 0.5) * 0.4;
      return scoreB - scoreA;
    });
    const candidates = channelMatch.slice(0, CANDIDATES_PER_SLOT);
    return { channel: slot.channel, candidates };
  });

  // 4. Mark dispatched ideas
  for (const slot of slots) {
    for (const candidate of slot.candidates) {
      const idea = ideas.find(i => i.id === candidate.id);
      if (idea) {
        idea.dispatch_date = now.toISOString().slice(0, 10);
        idea.dispatch_slot = slot.channel;
        idea.project_task_id = taskId;
        idea.project_id = projectId;
      }
    }
  }

  // 5. Defer old ideas (stale → Deferred in canonical pipeline)
  for (const idea of ideas) {
    if (idea.status === "New") {
      const ageDays = (now.getTime() - new Date(idea.created_at).getTime()) / 86400000;
      if (ageDays > 14) idea.status = "Deferred";
    }
  }

  saveIdeas(slug, ideas);

  return res.status(200).json({
    ok: true,
    projectId,
    taskId,
    date: now.toISOString().slice(0, 10),
    slots: slots.map(s => ({
      channel: s.channel,
      candidateCount: s.candidates.length,
      candidates: s.candidates.map(c => ({
        id: c.id, pillar_id: c.pillar_id, content_type: c.content_type,
        angle_draft: c.angle_draft, pov_confidence: c.pov_confidence,
        signal_summary: c.signal?.summary,
      })),
    })),
  });
}

export default withErrorHandler(handler);
