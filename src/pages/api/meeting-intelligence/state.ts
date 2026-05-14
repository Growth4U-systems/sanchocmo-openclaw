import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withErrorHandler, withSlugAuth } from "@/lib/api-middleware";
import { getMeetingIntelligenceState } from "@/lib/data/meeting-intelligence-db";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const slug = req.query.slug as string;
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  const state = await getMeetingIntelligenceState(slug);
  return res.status(200).json(state);
}

export default compose(withErrorHandler, withSlugAuth)(handler);
