import type { NextApiRequest, NextApiResponse } from "next";
import {
  canAccessSlug,
  compose,
  withAuth,
  withErrorHandler,
} from "@/lib/api-middleware";
import { listThreadsForSlug } from "@/lib/data/mc-chat";

/**
 * GET /api/chat/threads/:slug
 * Ported from mc-server.js:5267-5297
 * Lists all chat threads for a client
 */
export async function threadsHandler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const slug = typeof req.query.slug === "string" ? req.query.slug : "";
  if (!slug) return res.status(400).json({ error: "Missing slug" });
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(slug)) {
    return res.status(400).json({ error: "Invalid slug" });
  }
  if (!canAccessSlug(req.ctx, slug)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const threads = listThreadsForSlug(slug);
  res.status(200).json({ ok: true, slug, threads });
}

export default compose(withErrorHandler, withAuth)(threadsHandler);
