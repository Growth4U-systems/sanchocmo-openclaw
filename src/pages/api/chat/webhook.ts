import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import {
  getChatSecret,
  setStatusEntry,
  clearStatus,
  consumeCancelled,
  addMessage,
} from "@/lib/data/mc-chat";

/**
 * POST /api/chat/webhook (was /webhook/mc-chat/response)
 * Ported from mc-server.js:5001-5041
 * Receives bot responses from the gateway plugin
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Verify shared secret
  const secret = getChatSecret();
  if (secret && req.headers["x-mc-secret"] !== secret) {
    return res.status(403).json({ error: "Forbidden" });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
const { slug, threadId, text, agent, ts: _ts, role } = req.body;
  const tid = threadId || `${slug || "default"}:general`;

  // Status updates: cache for polling, don't store in messages
  if (role === "status") {
    setStatusEntry(tid, { text, agent, ts: Date.now() });
    return res.status(200).json({ ok: true });
  }

  // Bot response: clear status + store message (unless cancelled)
  clearStatus(tid);
  if (consumeCancelled(tid)) {
    console.log(`[mc-chat] Bot response discarded (cancelled): ${tid}`);
    return res.status(200).json({ ok: true, cancelled: true });
  }

  addMessage(tid, "bot", text, agent);
  console.log(`[mc-chat] Bot response → ${tid}: ${(text || "").slice(0, 60)}`);
  res.status(200).json({ ok: true, messageId: `mc-${Date.now()}` });
}

export default withErrorHandler(handler);
