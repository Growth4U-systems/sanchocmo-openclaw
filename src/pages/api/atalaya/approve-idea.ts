import type { NextApiRequest, NextApiResponse } from "next";
import path from "path";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";
import { readJSON, writeJSON } from "@/lib/data/json-io";

const PENDING_FILES: Record<string, string> = {
  profiles: "profiles-pending.json",
  competitors: "competitors-pending.json",
  ads: "ads-pending.json",
  pending: "pending-ideas.json",
};

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  if (!req.ctx?.isAdmin) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const slug = (req.query.slug as string) || req.body.slug;
  if (!slug) {
    return res.status(400).json({ error: "Missing slug" });
  }

  const { ideaId, sourceType } = req.body;
  const pendingPath = path.join(BASE, "brand", slug, "atalaya", PENDING_FILES[sourceType] || "pending-ideas.json");
  const ideasPath = path.join(BASE, "brand", slug, "ideas.json");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawPending = readJSON<any>(pendingPath, []);
  let pending: Record<string, unknown>[] = Array.isArray(rawPending) ? rawPending : (rawPending.ideas_generated || []);

  const idea = pending.find((i) => i.id === ideaId);
  if (!idea) {
    return res.status(404).json({ error: "Idea not found" });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ideas = readJSON<any>(ideasPath, { ideas: [] });
  if (!ideas.ideas) ideas.ideas = [];

  const adapted = (idea.adapted_idea || {}) as Record<string, unknown>;
  ideas.ideas.push({
    id: idea.id,
    type: "content",
    status: "new",
    title: adapted.title || idea.title || "",
    description: adapted.description || "",
    category: idea.pattern_identified || "",
    source: "atalaya",
    channels_suggested: adapted.recommended_channels || [],
    priority_score: adapted.priority === "high" ? 80 : adapted.priority === "medium" ? 50 : 20,
    created_at: new Date().toISOString(),
    notes: "Fuente: " + (idea.source_name || "") + " (" + (idea.source_channel || "") + ")",
  });

  writeJSON(ideasPath, ideas);
  pending = pending.filter((i) => i.id !== ideaId);
  writeJSON(pendingPath, pending);

  return res.status(200).json({ ok: true });
}

export default compose(withErrorHandler, withAuth)(handler);
