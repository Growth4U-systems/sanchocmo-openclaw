import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import { runMeetingIntelligenceSync } from "@/lib/data/meeting-intelligence-runner";

function isLocalRequest(req: NextApiRequest) {
  const remote = req.socket.remoteAddress || "";
  return remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1";
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }
  if (!isLocalRequest(req)) {
    return res.status(403).json({ error: "Meeting Intelligence cron runner is local-only." });
  }

  const slug = req.body?.slug || req.query.slug;
  if (!slug || typeof slug !== "string") return res.status(400).json({ error: "Missing slug" });

  const result = await runMeetingIntelligenceSync({
    slug,
    trigger: typeof req.body?.trigger === "string" ? req.body.trigger : "cron",
    limit: Number.isFinite(Number(req.body?.limit)) ? Number(req.body.limit) : undefined,
  });
  return res.status(result.ok ? 200 : 503).json(result);
}

export default withErrorHandler(handler);
