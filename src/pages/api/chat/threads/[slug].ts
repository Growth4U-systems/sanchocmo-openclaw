import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import { listThreadsForSlug } from "@/lib/data/mc-chat";

/**
 * GET /api/chat/threads/:slug
 * Ported from mc-server.js:5267-5297
 * Lists all chat threads for a client
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const slug = req.query.slug as string;
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  const threads = listThreadsForSlug(slug);
  res.status(200).json({ ok: true, slug, threads });
}

export default withErrorHandler(handler);
