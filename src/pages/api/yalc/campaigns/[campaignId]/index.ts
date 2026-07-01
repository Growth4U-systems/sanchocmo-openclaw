import type { NextApiRequest, NextApiResponse } from "next";
import { compose, getSlug, withErrorHandler, withSlugAuth } from "@/lib/api-middleware";
import { resolveYalcConfig, yalcErrorResponse, yalcFetch } from "@/lib/yalc/client";
import { normalizeYalcCampaign } from "@/lib/yalc/campaign-kind";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const slug = getSlug(req);
  if (!slug) return res.status(400).json({ error: "Missing slug" });
  const campaignId = req.query.campaignId as string;
  if (!campaignId) return res.status(400).json({ error: "Missing campaignId" });

  const config = resolveYalcConfig(slug);
  try {
    if (req.method === "GET") {
      const campaign = await yalcFetch<Record<string, unknown>>(
        config,
        `/api/campaigns/${encodeURIComponent(campaignId)}`,
      );
      return res.status(200).json(normalizeYalcCampaign(campaign));
    }

    if (req.method === "POST") {
      const action = String(req.body?.action || "");
      if (action !== "pause" && action !== "resume") {
        return res.status(400).json({ error: "action must be pause or resume" });
      }
      return res.status(200).json(
        await yalcFetch(config, `/api/campaigns/${encodeURIComponent(campaignId)}/${action}`, {
          method: "POST",
          body: {},
        }),
      );
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  } catch (err) {
    const out = yalcErrorResponse(err);
    return res.status(out.status).json(out.body);
  }
}

export default compose(withErrorHandler, withSlugAuth)(handler);
