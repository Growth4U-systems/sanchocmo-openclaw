/**
 * POST /api/content-engine/generate-drafts
 *
 * Triggered automatically by `/api/content-engine/ideas` PATCH when an idea
 * transitions to `approved` (from Slack/Discord interactivity, MC UI, etc).
 *
 * This endpoint provisions the weekly content project, parent Task,
 * ContentTask, draft scaffolds and supporting docs, then best-effort triggers
 * the writer skill through the OpenClaw gateway.
 *
 * Body: { slug: string, ideaId: string }
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import { provisionApprovedContentIdea } from "@/lib/data/content-approval";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { slug, ideaId } = req.body;
  if (!slug || !ideaId) return res.status(400).json({ error: "Missing slug or ideaId" });

  try {
    const result = await provisionApprovedContentIdea(slug, ideaId, { triggerWriter: true });
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "Idea not found") return res.status(404).json({ error: message });
    if (message === "Idea must be approved before generating drafts") {
      return res.status(400).json({ error: message });
    }
    throw error;
  }
}

export default withErrorHandler(handler);
