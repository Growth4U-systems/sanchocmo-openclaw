import type { NextApiRequest, NextApiResponse } from "next";
import { compose, getSlug, withErrorHandler, withSlugAuth } from "@/lib/api-middleware";
import { resolveYalcConfig, yalcErrorResponse, yalcFetch } from "@/lib/yalc/client";

// Proxy for YALC POST /api/qualify — creator quality score (0-100) with the
// 5-component breakdown (erVsTier, authenticity, sectorFit, audienceEs,
// consistency). Stateless: send metrics, get the score.
// Body: { handle?, network?, followers?, er?, tier?, audienceEsShare?,
//         authenticityScore?, sectorFitScore?, consistencyScore? }
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }
  const slug = getSlug(req);
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  try {
    return res.status(200).json(
      await yalcFetch(resolveYalcConfig(slug), "/api/qualify", {
        method: "POST",
        body: req.body || {},
      }),
    );
  } catch (err) {
    const out = yalcErrorResponse(err);
    return res.status(out.status).json(out.body);
  }
}

export default compose(withErrorHandler, withSlugAuth)(handler);
