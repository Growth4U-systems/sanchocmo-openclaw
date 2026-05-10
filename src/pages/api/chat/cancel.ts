import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import { markCancelled, clearStatus, clearProgress, getGatewayUrl, getChatSecret } from "@/lib/data/mc-chat";

/**
 * POST /api/chat/cancel
 * Ported from mc-server.js:5046-5076
 * Cancels a running agent and discards its response
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { slug, threadId } = req.body;
  const tid = threadId || slug;

  markCancelled(tid);
  clearStatus(tid);
  clearProgress(tid);
  console.log(`[mc-chat] Cancelling thread: ${tid}`);

  // Send /stop to gateway
  try {
    const secret = getChatSecret();
    await fetch(`${getGatewayUrl()}/mc-chat/inbound`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { "X-MC-Secret": secret } : {}),
      },
      body: JSON.stringify({ slug, threadId, text: "/stop", userName: "Admin", isAdmin: true }),
    });
  } catch (err) {
    console.error(`[mc-chat] Gateway /stop failed: ${err instanceof Error ? err.message : err}`);
  }

  res.status(200).json({ ok: true });
}

export default withErrorHandler(handler);
