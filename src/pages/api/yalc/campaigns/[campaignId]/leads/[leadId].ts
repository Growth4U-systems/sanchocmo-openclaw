import type { NextApiRequest, NextApiResponse } from "next";
import { compose, getSlug, withErrorHandler, withSlugAuth } from "@/lib/api-middleware";
import { resolveYalcConfig, yalcErrorResponse, yalcFetch } from "@/lib/yalc/client";

const ALLOWED_STATUSES = new Set(["Demo_Booked", "Deal_Created", "Closed_Won", "Closed_Lost"]);

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const slug = getSlug(req);
  if (!slug) return res.status(400).json({ error: "Missing slug" });
  const campaignId = req.query.campaignId as string;
  const leadId = req.query.leadId as string;
  if (!campaignId || !leadId) return res.status(400).json({ error: "Missing campaignId or leadId" });

  const config = resolveYalcConfig(slug);
  const path = `/api/campaigns/${encodeURIComponent(campaignId)}/leads/${encodeURIComponent(leadId)}`;

  try {
    if (req.method === "GET") {
      return res.status(200).json(await yalcFetch(config, path));
    }

    if (req.method === "PATCH") {
      const lifecycleStatus = String(req.body?.lifecycleStatus || "");
      if (!ALLOWED_STATUSES.has(lifecycleStatus)) {
        return res.status(400).json({
          error: `lifecycleStatus must be one of: ${Array.from(ALLOWED_STATUSES).join(", ")}`,
        });
      }
      return res.status(200).json(
        await yalcFetch(config, path, {
          method: "PATCH",
          body: { lifecycleStatus },
        }),
      );
    }

    res.setHeader("Allow", "GET, PATCH");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  } catch (err) {
    const out = yalcErrorResponse(err);
    return res.status(out.status).json(out.body);
  }
}

export default compose(withErrorHandler, withSlugAuth)(handler);
