/**
 * POST /api/clients/:slug/review-comments — staff button / manual trigger:
 * ask the doc's AUTHOR agent to review the open client comments on a doc
 * (SAN-148). Body: { docPath: string }.
 *
 * Mirrors analyze-feedback.ts (Sansón triage) but dispatches the
 * review-comments skill to the agent resolved by doc-owner.ts.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withAuth, withErrorHandler } from "@/lib/api-middleware";
import { triggerReviewComments } from "@/lib/data/review-comments-trigger";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
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

  const docPath = req.body?.docPath as string;
  if (!docPath || typeof docPath !== "string") {
    return res.status(400).json({ error: "docPath required" });
  }

  const result = await triggerReviewComments({ slug: slugStr, docPath, source: "manual" });
  return res.status(200).json({ ok: true, ...result });
}

export default compose(withErrorHandler, withAuth)(handler);
