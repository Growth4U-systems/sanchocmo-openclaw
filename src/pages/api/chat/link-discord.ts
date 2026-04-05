import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import { getThread, saveThread } from "@/lib/data/mc-chat";

/**
 * POST /api/chat/link-discord
 * Ported from mc-server.js:5136-5158
 * Links a Discord thread to an MC chat thread
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { threadId, discordThreadId, discordChannelId } = req.body;
  if (!threadId || !discordThreadId || !discordChannelId) {
    return res.status(400).json({
      error: "Missing threadId, discordThreadId, or discordChannelId",
    });
  }

  const thread = getThread(threadId);
  thread.discordThreadId = discordThreadId;
  thread.discordChannelId = discordChannelId;
  saveThread(threadId, thread);

  res.status(200).json({ ok: true, threadId, discordThreadId, discordChannelId });
}

export default withErrorHandler(handler);
