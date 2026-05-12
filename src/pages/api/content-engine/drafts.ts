/**
 * GET/POST/PUT /api/content-engine/drafts — Manage content drafts per idea
 *
 * Drafts are stored inside idea-queue.json as a `drafts[]` field per idea.
 * Each draft = one channel's version of the content.
 *
 * GET ?slug=X&ideaId=Y → returns drafts for an idea
 * POST { slug, ideaId, channel, content } → create a new draft
 * PUT { slug, ideaId, channel, content, status } → update draft content/status
 */

import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { withErrorHandler } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";

interface Draft {
  channel: string;
  content: string;
  status: "draft" | "edited" | "approved" | "published";
  iterations: { role: string; text: string; ts: string }[];
  created_at: string;
  updated_at: string;
}

function loadIdeas(slug: string): Record<string, unknown>[] {
  const filePath = path.join(BASE, "brand", slug, "content", "idea-queue.json");
  if (!fs.existsSync(filePath)) return [];
  try { return JSON.parse(fs.readFileSync(filePath, "utf-8")); } catch { return []; }
}

function saveIdeas(slug: string, ideas: Record<string, unknown>[]) {
  const filePath = path.join(BASE, "brand", slug, "content", "idea-queue.json");
  fs.writeFileSync(filePath, JSON.stringify(ideas, null, 2));
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const slug = (req.query.slug || req.body?.slug) as string;
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  if (req.method === "GET") {
    const ideaId = req.query.ideaId as string;
    if (!ideaId) return res.status(400).json({ error: "Missing ideaId" });
    const ideas = loadIdeas(slug);
    const idea = ideas.find(i => (i as { id: string }).id === ideaId);
    if (!idea) return res.status(404).json({ error: "Idea not found" });
    return res.status(200).json({ ok: true, drafts: (idea.drafts as Draft[]) || [] });
  }

  if (req.method === "POST") {
    const { ideaId, channel, content } = req.body;
    if (!ideaId || !channel) return res.status(400).json({ error: "Missing ideaId or channel" });
    const ideas = loadIdeas(slug);
    const idea = ideas.find(i => (i as { id: string }).id === ideaId);
    if (!idea) return res.status(404).json({ error: "Idea not found" });

    const drafts = ((idea.drafts as Draft[]) || []);
    const existing = drafts.find(d => d.channel === channel);
    if (existing) {
      existing.content = content || existing.content;
      existing.updated_at = new Date().toISOString();
    } else {
      drafts.push({
        channel,
        content: content || "",
        status: "draft",
        iterations: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
    idea.drafts = drafts;
    saveIdeas(slug, ideas);
    return res.status(201).json({ ok: true, drafts });
  }

  if (req.method === "PUT") {
    const { ideaId, channel, content, status, iteration } = req.body;
    if (!ideaId || !channel) return res.status(400).json({ error: "Missing ideaId or channel" });
    const ideas = loadIdeas(slug);
    const idea = ideas.find(i => (i as { id: string }).id === ideaId);
    if (!idea) return res.status(404).json({ error: "Idea not found" });

    const drafts = ((idea.drafts as Draft[]) || []);
    const draft = drafts.find(d => d.channel === channel);
    if (!draft) return res.status(404).json({ error: "Draft not found for channel: " + channel });

    if (content !== undefined) draft.content = content;
    if (status) draft.status = status;
    if (iteration) {
      draft.iterations.push({
        role: iteration.role || "user",
        text: iteration.text || "",
        ts: new Date().toISOString(),
      });
    }
    draft.updated_at = new Date().toISOString();
    idea.drafts = drafts;
    saveIdeas(slug, ideas);
    return res.status(200).json({ ok: true, draft });
  }

  res.status(405).json({ error: "Method not allowed" });
}

export default withErrorHandler(handler);
