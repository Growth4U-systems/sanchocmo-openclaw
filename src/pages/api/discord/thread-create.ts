import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import { getRuntime } from "@/lib/runtime";

/**
 * POST /api/discord/thread-create
 * Ported from mc-server.js:5162-5197
 * Creates a Discord thread via the active runtime when supported.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { guild, channel, name, message } = req.body;
  if (!guild || !channel || !name) {
    return res.status(400).json({ error: "Missing guild, channel, or name" });
  }

  try {
    const createThread = getRuntime().messaging.createChannelThread;
    if (!createThread) {
      return res.status(501).json({ error: "Active runtime does not support Discord thread creation" });
    }

    const threadData = await createThread({
      channelId: channel,
      name,
      initialMessage: message || "🔗 Thread sincronizado con Mission Control",
    });
    const data = threadData && typeof threadData === "object" ? threadData as Record<string, unknown> : {};

    if (data.ok && typeof data.threadId === "string") {
      res.status(200).json({ ok: true, threadId: data.threadId, channelId: channel });
    } else {
      res.status(500).json({ error: "Thread creation failed", details: threadData });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[mc-server] Discord thread creation error:", msg);
    res.status(500).json({ error: msg });
  }
}

export default withErrorHandler(handler);
