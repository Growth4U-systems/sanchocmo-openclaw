/**
 * POST /api/clients/:slug/analyze-feedback — staff button: fire the
 * feedback-triage run for a specific doc (covers docs that aren't auto-fired).
 * Body: { docPath: string, skillId?: string }.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withAuth, withErrorHandler } from "@/lib/api-middleware";
import { triggerFeedbackTriage } from "@/lib/data/feedback-triage-trigger";

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
  const skillId = (req.body?.skillId as string) ?? null;
  if (!docPath || typeof docPath !== "string") {
    return res.status(400).json({ error: "docPath required" });
  }

  const result = await triggerFeedbackTriage({ slug: slugStr, docPath, skillId, source: "manual" });
  return res.status(200).json({ ok: true, ...result });
}

export default compose(withErrorHandler, withAuth)(handler);
