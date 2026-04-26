/**
 * GET/POST/PATCH /api/content-engine/ideas — CRUD for idea-queue.json
 *
 * GET ?slug=X → returns all ideas (filterable by status, pillar, channel)
 * POST { slug, idea } → append a new idea
 * PATCH { slug, ideaId, fields } → update idea fields (status, approved_at, etc.)
 */

import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { withErrorHandler } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";

interface Idea {
  id: string;
  pillar_id: string;
  content_type: string;
  target_channel: string;
  signal: {
    summary: string;
    source: string;
    url?: string;
    date: string;
  };
  angle_draft: string;
  pov_confidence: number;
  source_signals?: string[];
  created_at: string;
  status: "ready" | "approved" | "stale" | "archived" | "published";
  approved_at?: string;
  approved_via?: string;
  target_date?: string;
  project_task_id?: string;
}

function loadIdeas(slug: string): Idea[] {
  const filePath = path.join(BASE, "brand", slug, "content", "idea-queue.json");
  if (!fs.existsSync(filePath)) return [];
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return [];
  }
}

function saveIdeas(slug: string, ideas: Idea[]) {
  const filePath = path.join(BASE, "brand", slug, "content", "idea-queue.json");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(ideas, null, 2));
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const slug = (req.query.slug || req.body?.slug) as string;
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  if (req.method === "GET") {
    const ideas = loadIdeas(slug);
    const { status, pillar, channel } = req.query;
    let filtered = ideas;
    if (status) filtered = filtered.filter((i) => i.status === status);
    if (pillar) filtered = filtered.filter((i) => i.pillar_id === pillar);
    if (channel) filtered = filtered.filter((i) => i.target_channel === channel);

    // Counts by status
    const counts = {
      total: ideas.length,
      ready: ideas.filter((i) => i.status === "ready").length,
      approved: ideas.filter((i) => i.status === "approved").length,
      stale: ideas.filter((i) => i.status === "stale").length,
      archived: ideas.filter((i) => i.status === "archived").length,
      published: ideas.filter((i) => i.status === "published").length,
    };

    return res.status(200).json({ ok: true, ideas: filtered, counts });
  }

  if (req.method === "POST") {
    const { idea } = req.body;
    if (!idea) return res.status(400).json({ error: "Missing idea" });
    const ideas = loadIdeas(slug);
    const newIdea: Idea = {
      id: idea.id || `idea-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      pillar_id: idea.pillar_id || "",
      content_type: idea.content_type || "",
      target_channel: idea.target_channel || "",
      signal: idea.signal || { summary: "", source: "manual", date: new Date().toISOString().slice(0, 10) },
      angle_draft: idea.angle_draft || "",
      pov_confidence: idea.pov_confidence ?? 0.5,
      source_signals: idea.source_signals || [],
      created_at: new Date().toISOString(),
      status: "ready",
    };
    ideas.push(newIdea);
    saveIdeas(slug, ideas);
    return res.status(201).json({ ok: true, idea: newIdea });
  }

  if (req.method === "PATCH") {
    const { ideaId, fields } = req.body;
    if (!ideaId || !fields) return res.status(400).json({ error: "Missing ideaId or fields" });
    const ideas = loadIdeas(slug);
    const idea = ideas.find((i) => i.id === ideaId);
    if (!idea) return res.status(404).json({ error: "Idea not found" });

    const allowed = ["status", "approved_at", "approved_via", "target_date", "project_task_id", "angle_draft", "pillar_id", "target_channel", "content_type"];
    for (const [k, v] of Object.entries(fields)) {
      if (allowed.includes(k)) (idea as unknown as Record<string, unknown>)[k] = v;
    }
    saveIdeas(slug, ideas);
    return res.status(200).json({ ok: true, idea });
  }

  res.status(405).json({ error: "Method not allowed" });
}

export default withErrorHandler(handler);
