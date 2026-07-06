import type { NextApiRequest, NextApiResponse } from "next";
import { compose, getSlug, withErrorHandler, withSlugAuth } from "@/lib/api-middleware";
import { resolveYalcConfig, yalcErrorResponse, yalcFetch } from "@/lib/yalc/client";
import {
  assertCampaignLeadEditsUnlocked,
  expectedCampaignKindFromInput,
  yalcGuardErrorResponse,
} from "@/lib/yalc/campaign-guards";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }
  const slug = getSlug(req);
  if (!slug) return res.status(400).json({ error: "Missing slug" });
  const campaignId = req.query.campaignId as string;
  if (!campaignId) return res.status(400).json({ error: "Missing campaignId" });

  try {
    const config = resolveYalcConfig(slug);
    const body = (req.body || {}) as Record<string, unknown>;
    await assertCampaignLeadEditsUnlocked(config, campaignId, expectedCampaignKindFromInput(body));
    return res.status(200).json(
      await yalcFetch(
        config,
        `/api/campaigns/${encodeURIComponent(campaignId)}/leads/enrich`,
        { method: "POST", body },
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
