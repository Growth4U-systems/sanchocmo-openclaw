import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import { markThreadRead } from "@/lib/data/mc-chat";

/**
 * POST /api/chat/mark-read
 * Marks a thread as read by updating the last-read timestamp.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { slug, threadId } = req.body;
  if (!slug || !threadId) return res.status(400).json({ error: "slug and threadId required" });

  // Extract shortId from full threadId (slug:shortId)
  const colonIdx = threadId.indexOf(":");
  const shortId = colonIdx >= 0 ? threadId.slice(colonIdx + 1) : threadId;
  // Sanitize same as threadFile() in mc-chat.ts
  const safeId = shortId.replace(/:/g, "-").replace(/[^a-zA-Z0-9\-_]/g, "");

  markThreadRead(slug, safeId);

  res.status(200).json({ ok: true });
}

export default withErrorHandler(handler);
