import type { NextApiRequest, NextApiResponse } from "next";
import {
  canAccessSlug,
  compose,
  withAuth,
  withErrorHandler,
} from "@/lib/api-middleware";
import { getThread, saveThread } from "@/lib/data/mc-chat";
import { parseThreadId } from "@/lib/thread-id";

/**
 * POST /api/chat/link-discord
 * Ported from mc-server.js:5136-5158
 * Links a Discord thread to an MC chat thread
 */
export async function linkDiscordHandler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const threadId = typeof req.body?.threadId === "string" ? req.body.threadId.trim() : "";
  const discordThreadId = typeof req.body?.discordThreadId === "string"
    ? req.body.discordThreadId.trim()
    : "";
  const discordChannelId = typeof req.body?.discordChannelId === "string"
    ? req.body.discordChannelId.trim()
    : "";
  if (!threadId || !discordThreadId || !discordChannelId) {
    return res.status(400).json({
      error: "Missing threadId, discordThreadId, or discordChannelId",
    });
  }
  const parsed = parseThreadId(threadId);
  if (!parsed) return res.status(400).json({ error: "Invalid threadId" });
  if (!canAccessSlug(req.ctx, parsed.slug)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  if (discordThreadId.length > 256 || discordChannelId.length > 256) {
    return res.status(400).json({ error: "Invalid Discord identifier" });
  }

  const thread = getThread(threadId);
  thread.discordThreadId = discordThreadId;
  thread.discordChannelId = discordChannelId;
  saveThread(threadId, thread);

  res.status(200).json({ ok: true, threadId, discordThreadId, discordChannelId });
}

export default compose(withErrorHandler, withAuth)(linkDiscordHandler);
