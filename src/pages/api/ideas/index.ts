import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";
import { loadIdeas, saveIdeas } from "@/lib/data/ideas";
import { loadClients } from "@/lib/data/clients";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const slugParam = req.ctx?.clientSlug || (req.query.slug as string) || null;
    const projectFilter = req.query.project as string | undefined;
    const unassigned = req.query.unassigned === "true";

    const result: Record<string, ReturnType<typeof loadIdeas>> = {};

    if (slugParam) {
      let ideas = loadIdeas(slugParam);
      if (projectFilter) {
        ideas = ideas.filter((i) => (i.project_ids || []).includes(projectFilter));
      } else if (unassigned) {
        ideas = ideas.filter((i) => !i.project_ids || i.project_ids.length === 0);
      }
      result[slugParam] = ideas;
    } else {
      const clients = loadClients();
      for (const c of clients) {
        if (c.slug) {
          let ideas = loadIdeas(c.slug);
          if (projectFilter) {
            ideas = ideas.filter((i) => (i.project_ids || []).includes(projectFilter));
          } else if (unassigned) {
            ideas = ideas.filter((i) => !i.project_ids || i.project_ids.length === 0);
          }
          result[c.slug] = ideas;
        }
      }
    }

    return res.status(200).json(result);
  }

  if (req.method === "POST") {
    const { slug } = req.body;
    let { idea } = req.body;
    if (!slug || !idea) {
      return res.status(400).json({ error: "Missing slug or idea" });
    }

    // Portal clients can only access their own slug
    if (req.ctx?.clientSlug && req.ctx.clientSlug !== slug) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const ideas = loadIdeas(slug);
    const existingIdx = idea.id ? ideas.findIndex((i) => i.id === idea.id) : -1;

    if (existingIdx >= 0) {
      idea.updated_at = new Date().toISOString();
      Object.assign(ideas[existingIdx], idea);
      idea = ideas[existingIdx];
    } else {
      idea.id = idea.id || crypto.randomUUID();
      idea.created_at = idea.created_at || new Date().toISOString();
      idea.status = idea.status || "pool";
      idea.project_ids = idea.project_ids || [];
      idea.pieces = idea.pieces || [];
      ideas.push(idea);
    }

    saveIdeas(slug, ideas);
    return res.status(200).json({ ok: true, idea });
  }

  if (req.method === "DELETE") {
    const { slug, ideaId } = req.body;
    if (!slug || !ideaId) {
      return res.status(400).json({ error: "Missing slug or ideaId" });
    }

    // Portal clients can only access their own slug
    if (req.ctx?.clientSlug && req.ctx.clientSlug !== slug) {
      return res.status(403).json({ error: "Forbidden" });
    }

    let ideas = loadIdeas(slug);
    const len = ideas.length;
    ideas = ideas.filter((i) => i.id !== ideaId);

    if (ideas.length === len) {
      return res.status(404).json({ error: "Idea not found" });
    }

    saveIdeas(slug, ideas);
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "GET, POST, DELETE");
  return res.status(405).json({ error: `Method ${req.method} not allowed` });
}

export default compose(withErrorHandler, withAuth)(handler);
