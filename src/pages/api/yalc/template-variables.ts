import type { NextApiRequest, NextApiResponse } from "next";
import { compose, getSlug, withErrorHandler, withSlugAuth } from "@/lib/api-middleware";
import { resolveYalcConfig, yalcErrorResponse, yalcFetch } from "@/lib/yalc/client";

function campaignTypeParam(value: string | string[] | undefined): string {
  const single = Array.isArray(value) ? value[0] : value;
  return single === "B2B" ? "B2B" : "Partnerships";
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const slug = getSlug(req);
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  const type = campaignTypeParam(req.query.type);
  try {
    return res.status(200).json(
      await yalcFetch(
        resolveYalcConfig(slug),
        `/api/campaigns/template-variables?type=${encodeURIComponent(type)}`,
      ),
    );
  } catch (err) {
    const out = yalcErrorResponse(err);
    return res.status(out.status).json(out.body);
  }
}

export default compose(withErrorHandler, withSlugAuth)(handler);
