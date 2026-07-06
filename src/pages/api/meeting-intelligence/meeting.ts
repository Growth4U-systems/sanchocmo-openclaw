import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withErrorHandler, withSlugAuth } from "@/lib/api-middleware";
import { getMeetingIntelligenceMeeting } from "@/lib/data/meeting-intelligence-db";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const slug = req.query.slug as string;
  const meetingId = req.query.meetingId as string;
  if (!slug) return res.status(400).json({ error: "Missing slug" });
  if (!meetingId) return res.status(400).json({ error: "Missing meetingId" });

  const result = await getMeetingIntelligenceMeeting(slug, meetingId);
  return res.status(result.detail ? 200 : result.storage?.configured === false ? 503 : 404).json(result);
}

export default compose(withErrorHandler, withSlugAuth)(handler);
