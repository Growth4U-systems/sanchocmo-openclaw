import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withErrorHandler, withSlugAuth } from "@/lib/api-middleware";
import {
  applyMeetingRecommendationAction,
  type RecommendationAction,
} from "@/lib/data/meeting-intelligence-db";

const actions: RecommendationAction[] = ["approve", "reject", "convert"];

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const slug = req.body?.slug || req.query.slug;
  const recommendationId = req.body?.recommendationId || req.body?.id;
  const action = req.body?.action;
  if (!slug || typeof slug !== "string") return res.status(400).json({ error: "Missing slug" });
  if (!recommendationId || typeof recommendationId !== "string") return res.status(400).json({ error: "Missing recommendationId" });
  if (!actions.includes(action)) return res.status(400).json({ error: "Invalid action" });

  const result = await applyMeetingRecommendationAction(slug, recommendationId, action);
  return res.status(result.ok ? 200 : 503).json(result);
}

export default compose(withErrorHandler, withSlugAuth)(handler);
