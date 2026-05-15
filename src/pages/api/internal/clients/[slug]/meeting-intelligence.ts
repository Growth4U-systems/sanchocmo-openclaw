import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler, withMethod } from "@/lib/api-middleware";
import { getMeetingIntelligenceState } from "@/lib/data/meeting-intelligence-db";
import { withInternalAuth } from "@/lib/sancho-internal-api";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const slug = req.query.slug;
  if (typeof slug !== "string") {
    return res.status(400).json({ error: "Missing slug" });
  }

  const state = await getMeetingIntelligenceState(slug);
  res.status(200).json(state);
}

export default withErrorHandler(withInternalAuth(withMethod(["GET"], handler)));
