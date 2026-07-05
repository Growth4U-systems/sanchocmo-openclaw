import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import {
  listAgentRunEvents,
  listAgentRunsForThread,
} from "@/lib/data/agent-runs";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const threadId = typeof req.query.threadId === "string" ? req.query.threadId.trim() : "";
  if (!threadId) {
    return res.status(400).json({ error: "Missing threadId" });
  }

  const runs = listAgentRunsForThread(threadId).map((run) => ({
    ...run,
    events: listAgentRunEvents(run.id),
  }));
  return res.status(200).json({ ok: true, threadId, runs });
}

export default withErrorHandler(handler);
