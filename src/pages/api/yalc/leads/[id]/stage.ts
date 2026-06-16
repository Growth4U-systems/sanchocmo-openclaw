import type { NextApiRequest, NextApiResponse } from "next";
import { compose, getSlug, withErrorHandler, withSlugAuth } from "@/lib/api-middleware";
import { resolveYalcConfig, yalcErrorResponse, yalcFetch } from "@/lib/yalc/client";

// Proxy for YALC PATCH /api/leads/:id/stage — human-driven stage transition
// (shortlist / discard / restore / pipeline moves).
// Body: { lifecycleStatus: '<canonical status>', note?: string }
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "PATCH") {
    res.setHeader("Allow", "PATCH");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }
  const slug = getSlug(req);
  if (!slug) return res.status(400).json({ error: "Missing slug" });
  const leadId = req.query.id as string;
  if (!leadId) return res.status(400).json({ error: "Missing lead id" });

  try {
    return res.status(200).json(
      await yalcFetch(
        resolveYalcConfig(slug),
        `/api/leads/${encodeURIComponent(leadId)}/stage`,
        { method: "PATCH", body: req.body || {} },
      ),
    );
  } catch (err) {
    const out = yalcErrorResponse(err);
    return res.status(out.status).json(out.body);
  }
}

export default compose(withErrorHandler, withSlugAuth)(handler);
