import type { NextApiRequest, NextApiResponse } from "next";
import { compose, getSlug, withErrorHandler, withSlugAuth } from "@/lib/api-middleware";
import { yalcErrorResponse } from "@/lib/yalc/client";
import { provisionYalcBrain } from "@/lib/yalc/provision";

/**
 * POST /api/yalc/provision?slug=<brand>
 * Provision (or re-sync) the brand's YALC brain from Sancho — no CLI.
 * Body (optional): { website?, icpSummary?, docs?, autoCommit?, force? }.
 * When omitted, the brand's website from clients.json is used.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }
  const slug = getSlug(req);
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  const b = (req.body || {}) as {
    website?: string;
    icpSummary?: string;
    docs?: string | string[];
    autoCommit?: boolean;
    force?: boolean;
  };

  try {
    const result = await provisionYalcBrain(slug, {
      website: typeof b.website === "string" ? b.website : undefined,
      icpSummary: typeof b.icpSummary === "string" ? b.icpSummary : undefined,
      docs: b.docs,
      autoCommit: b.autoCommit,
      force: b.force,
    });
    return res.status(200).json(result);
  } catch (err) {
    const { status, body } = yalcErrorResponse(err);
    return res.status(status).json(body);
  }
}

export default compose(withErrorHandler, withSlugAuth)(handler);
