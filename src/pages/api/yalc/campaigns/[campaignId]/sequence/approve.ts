import type { NextApiRequest, NextApiResponse } from "next";
import { compose, getSlug, withErrorHandler, withSlugAuth } from "@/lib/api-middleware";
import { resolveYalcConfig, yalcErrorResponse, yalcFetch } from "@/lib/yalc/client";

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
    return res.status(200).json(
      await yalcFetch(
        resolveYalcConfig(slug),
        `/api/campaigns/${encodeURIComponent(campaignId)}/sequence/approve`,
        { method: "POST", body: req.body || {} },
      ),
    );
  } catch (err) {
    const out = yalcErrorResponse(err);
    return res.status(out.status).json(out.body);
  }
}

export default compose(withErrorHandler, withSlugAuth)(handler);
