import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import { getThread, getStatusEntry } from "@/lib/data/mc-chat";

/**
 * GET /api/chat/thread/:threadId
 * Ported from mc-server.js:5301-5314
 * Gets thread messages and current status
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const threadId = req.query.threadId as string;
  if (!threadId) return res.status(400).json({ error: "Missing threadId" });

  const thread = getThread(decodeURIComponent(threadId));
  const statusEntry = getStatusEntry(decodeURIComponent(threadId));

  res.status(200).json({
    ok: true,
    threadId,
    messages: thread?.messages || [],
    status: statusEntry,
  });
}

export default withErrorHandler(handler);
