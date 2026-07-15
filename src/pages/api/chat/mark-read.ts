import type { NextApiRequest, NextApiResponse } from "next";
import {
  canAccessSlug,
  compose,
  withAuth,
  withErrorHandler,
} from "@/lib/api-middleware";
import { markThreadRead } from "@/lib/data/mc-chat";
import { parseThreadId, sanitizeShortId } from "@/lib/thread-id";

/**
 * POST /api/chat/mark-read
 * Marks a thread as read by updating the last-read timestamp.
 */
export async function markReadHandler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const slug = typeof req.body?.slug === "string" ? req.body.slug.trim() : "";
  const threadId = typeof req.body?.threadId === "string" ? req.body.threadId.trim() : "";
  if (!slug || !threadId) return res.status(400).json({ error: "slug and threadId required" });
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(slug)) {
    return res.status(400).json({ error: "Invalid slug" });
  }
  if (!canAccessSlug(req.ctx, slug)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  // Extract shortId from full threadId (slug:shortId) and sanitize to the same
  // on-disk form threadFile() uses — shared via thread-id.ts so they can't drift.
  const parsed = threadId.includes(":") ? parseThreadId(threadId) : null;
  if (threadId.includes(":") && !parsed) {
    return res.status(400).json({ error: "Invalid threadId" });
  }
  if (parsed && parsed.slug !== slug) {
    return res.status(400).json({ error: "Thread does not belong to slug" });
  }
  const shortId = parsed?.shortId ?? threadId;
  const safeId = sanitizeShortId(shortId);
  if (!safeId) return res.status(400).json({ error: "Invalid threadId" });

  markThreadRead(slug, safeId);

  res.status(200).json({ ok: true });
}

export default compose(withErrorHandler, withAuth)(markReadHandler);
