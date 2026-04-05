import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import { getGatewayUrl } from "@/lib/data/mc-chat";

/**
 * POST /api/discord/thread-create
 * Ported from mc-server.js:5162-5197
 * Creates a Discord thread via the gateway plugin
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { guild, channel, name, message } = req.body;
  if (!guild || !channel || !name) {
    return res.status(400).json({ error: "Missing guild, channel, or name" });
  }

  try {
    const gwRes = await fetch(`${getGatewayUrl()}/mc-chat/create-discord-thread`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channelId: channel,
        name,
        initialMessage: message || "🔗 Thread sincronizado con Mission Control",
      }),
    });
    const threadData = await gwRes.json();

    if (threadData.ok && threadData.threadId) {
      res.status(200).json({ ok: true, threadId: threadData.threadId, channelId: channel });
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
