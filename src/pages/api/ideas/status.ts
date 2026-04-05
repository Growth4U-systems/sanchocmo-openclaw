import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";
import { loadIdeas, saveIdeas } from "@/lib/data/ideas";
import { readJSON, writeJSON } from "@/lib/data/json-io";
import { notificationsFile } from "@/lib/data/paths";

interface Notification {
  id: string;
  type: string;
  ideaId: string;
  ideaTitle: string;
  ideaType: string;
  channels: string[];
  approvedBy: string;
  timestamp: string;
  sent: boolean;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const { slug, ideaId, status, approvedBy } = req.body;
  if (!slug || !ideaId || !status) {
    return res.status(400).json({ error: "Missing slug, ideaId, or status" });
  }

  // Portal clients can only access their own slug
  if (req.ctx?.clientSlug && req.ctx.clientSlug !== slug) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const ideas = loadIdeas(slug);
  const idea = ideas.find((i) => i.id === ideaId);
  if (!idea) {
    return res.status(404).json({ error: "Idea not found" });
  }

  const oldStatus = idea.status;
  idea.status = status;

  if (status === "approved") {
    idea.approved_at = new Date().toISOString();
    idea.approved_by = approvedBy || null;
  }

  saveIdeas(slug, ideas);

  // Write to notification queue on approve
  if (status === "approved") {
    const notifsPath = notificationsFile(slug);
    const notifs = readJSON<Notification[]>(notifsPath, []);
    notifs.push({
      id: crypto.randomUUID(),
      type: "idea_approved",
      ideaId: idea.id,
      ideaTitle: idea.title,
      ideaType: idea.type,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      channels: (idea as any).channels || ((idea as any).target_channel ? [(idea as any).target_channel] : []),
      approvedBy: approvedBy || "admin",
      timestamp: new Date().toISOString(),
      sent: false,
    });
    writeJSON(notifsPath, notifs);
  }

  return res.status(200).json({ ok: true, ideaId, oldStatus, newStatus: status });
}

export default compose(withErrorHandler, withAuth)(handler);
