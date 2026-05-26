import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withErrorHandler, withAuth, canAccessSlug } from "@/lib/api-middleware";
import { loadIdeas, saveIdeas } from "@/lib/data/ideas";

/**
 * POST /api/projects/run-outreach-pipeline — Run enrichment pipeline on outreach contacts.
 * Body: { slug, projectId?, taskId, ideaIds }
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const { slug, taskId, ideaIds } = req.body;
  if (!slug || !taskId || !ideaIds || !ideaIds.length) {
    return res.status(400).json({ error: "Missing slug, taskId, or ideaIds" });
  }

  if (!canAccessSlug(req.ctx, slug)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  // Update pipeline_status on each idea to 'finding_dm' (first step)
  const ideas = loadIdeas(slug);
  let queued = 0;
  for (const idea of ideas) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec = idea as any;
    if (
      ideaIds.includes(idea.id) &&
      (!rec.pipeline_status || rec.pipeline_status === "pending")
    ) {
      rec.pipeline_status = "finding_dm";
      rec.pipeline_started_at = new Date().toISOString();
      queued++;
    }
  }
  saveIdeas(slug, ideas);

  // TODO: In the future, this will trigger actual skill execution:
  // 1. Run decision-maker-finder skill for each company
  // 2. Run contact-enrichment skill for each decision maker
  // 3. Run outreach-sequence-builder for the batch
  // For now, we just set the initial status and the agent handles the rest via chat

  return res.status(200).json({ ok: true, queued, taskId });
}

export default compose(withErrorHandler, withAuth)(handler);
