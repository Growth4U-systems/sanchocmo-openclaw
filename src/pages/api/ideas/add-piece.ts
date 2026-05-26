import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";
import { compose, withErrorHandler, withAuth, canAccessSlug } from "@/lib/api-middleware";
import { loadIdeas, saveIdeas } from "@/lib/data/ideas";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const { slug, ideaId, piece } = req.body;
  if (!slug || !ideaId || !piece) {
    return res.status(400).json({ error: "Missing slug, ideaId, or piece" });
  }

  // Portal clients can only access their own slug
  if (!canAccessSlug(req.ctx, slug)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const ideas = loadIdeas(slug);
  const idea = ideas.find((i) => i.id === ideaId);
  if (!idea) {
    return res.status(404).json({ error: "Idea not found" });
  }

  if (!idea.pieces) idea.pieces = [];

  piece.id = piece.id || crypto.randomUUID();
  piece.created_at = piece.created_at || new Date().toISOString();
  piece.status = piece.status || "draft";

  idea.pieces.push(piece);
  idea.updated_at = new Date().toISOString();
  saveIdeas(slug, ideas);

  return res.status(200).json({ ok: true, ideaId, piece });
}

export default compose(withErrorHandler, withAuth)(handler);
