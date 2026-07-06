import type { NextApiRequest, NextApiResponse } from "next";
import { compose, getSlug, withErrorHandler, withSlugAuth } from "@/lib/api-middleware";
import { resolveYalcConfig, yalcErrorResponse, yalcFetch } from "@/lib/yalc/client";
import {
  assertCampaignLeadEditsUnlocked,
  expectedCampaignKindFromInput,
  yalcGuardErrorResponse,
} from "@/lib/yalc/campaign-guards";

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
    const config = resolveYalcConfig(slug);
    const body = (req.body || {}) as Record<string, unknown>;
    const campaignId = typeof body.campaignId === "string" ? body.campaignId.trim() : "";
    const expectedKind = expectedCampaignKindFromInput(body);
    if (campaignId && expectedKind === "b2b") {
      await assertCampaignLeadEditsUnlocked(config, campaignId, expectedKind);
    }
    return res.status(200).json(
      await yalcFetch(
        config,
        `/api/leads/${encodeURIComponent(leadId)}/stage`,
        { method: "PATCH", body },
      ),
    );
  } catch (err) {
    const guard = yalcGuardErrorResponse(err);
    if (guard) return res.status(guard.status).json(guard.body);
    const out = yalcErrorResponse(err);
    return res.status(out.status).json(out.body);
  }
}

export default compose(withErrorHandler, withSlugAuth)(handler);
