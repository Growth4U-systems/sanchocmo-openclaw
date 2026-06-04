/**
 * GET /api/clients/:slug/feedback-insights — staff-only list of feedback
 * insights for a client, grouped by category. Mirrors the access control of
 * /api/clients/:slug/comments but excludes portal clients (internal data).
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withAuth, withErrorHandler } from "@/lib/api-middleware";
import { groupInsightsByCategory, loadInsights } from "@/lib/feedback-insights";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const { slug } = req.query;
  const slugStr = Array.isArray(slug) ? slug[0] : slug;
  if (!slugStr) return res.status(400).json({ error: "Missing slug" });

  const ctx = req.ctx;
  if (ctx?.clientSlug) return res.status(403).json({ error: "Forbidden" });
  if (ctx?.allowedSlugs && !ctx.allowedSlugs.includes(slugStr)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const rows = await loadInsights(slugStr);
  return res.status(200).json({
    ok: true,
    slug: slugStr,
    total: rows.length,
    byCategory: groupInsightsByCategory(rows),
  });
}

export default compose(withErrorHandler, withAuth)(handler);
