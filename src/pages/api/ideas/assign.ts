import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withErrorHandler, withAuth, canAccessSlug } from "@/lib/api-middleware";
import { loadIdeas, saveIdeas } from "@/lib/data/ideas";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const { slug, ideaId, addProjects, removeProjects } = req.body;
  if (!slug || !ideaId) {
    return res.status(400).json({ error: "Missing slug or ideaId" });
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

  if (!idea.project_ids) idea.project_ids = [];

  if (addProjects) {
    for (const pid of addProjects) {
      if (!idea.project_ids.includes(pid)) {
        idea.project_ids.push(pid);
      }
    }
  }

  if (removeProjects) {
    idea.project_ids = idea.project_ids.filter(
      (pid) => !removeProjects.includes(pid)
    );
  }

  idea.updated_at = new Date().toISOString();
  saveIdeas(slug, ideas);

  return res.status(200).json({ ok: true, ideaId, project_ids: idea.project_ids });
}

export default compose(withErrorHandler, withAuth)(handler);
