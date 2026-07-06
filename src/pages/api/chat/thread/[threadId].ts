import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import { getThread, getStatusEntry, getPendingProgress } from "@/lib/data/mc-chat";

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

  // Suppress status that's been superseded by a newer non-user message — protects
  // against a race where the webhook receives the bot reply between client polls
  // and clearStatus has fired but addMessage hasn't been read yet.
  let liveStatus = statusEntry;
  const STATUS_TTL_MS = 10 * 60 * 1000;
  if (liveStatus && Date.now() - liveStatus.ts > STATUS_TTL_MS) {
    liveStatus = null;
  }
  if (statusEntry && thread?.messages?.length) {
    let lastNonUserTs = 0;
    for (let i = thread.messages.length - 1; i >= 0; i--) {
      const m = thread.messages[i];
      if (m.role !== "user" && m.role !== "system" && typeof m.ts === "number") {
        lastNonUserTs = m.ts;
        break;
      }
    }
    if (lastNonUserTs >= statusEntry.ts) liveStatus = null;
  }

  const pendingProgress = getPendingProgress(decodeURIComponent(threadId));

  res.status(200).json({
    ok: true,
    threadId,
    messages: thread?.messages || [],
    status: liveStatus,
    pendingProgress,
  });
}

export default withErrorHandler(handler);
