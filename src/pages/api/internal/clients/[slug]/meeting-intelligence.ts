import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler, withMethod } from "@/lib/api-middleware";
import {
  getMeetingIntelligenceMeeting,
  getMeetingIntelligenceState,
} from "@/lib/data/meeting-intelligence-db";
import { withInternalAuth } from "@/lib/sancho-internal-api";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const slug = req.query.slug;
  const meetingId = req.query.meetingId;

  if (typeof slug !== "string") {
    return res.status(400).json({ error: "Missing slug" });
  }

  if (typeof meetingId === "string" && meetingId.trim()) {
    const result = await getMeetingIntelligenceMeeting(slug, meetingId);
    const status = result.detail
      ? 200
      : result.storage?.configured === false
        ? 503
        : 404;
    return res.status(status).json(result);
  }

  const state = await getMeetingIntelligenceState(slug);
  return res.status(state.ok ? 200 : 503).json(state);
}

export default withErrorHandler(withInternalAuth(withMethod(["GET"], handler)));
