import type { NextApiRequest, NextApiResponse } from "next";
import { compose, getSlug, withErrorHandler, withSlugAuth } from "@/lib/api-middleware";
import { resolveYalcConfig, yalcErrorResponse, yalcFetch } from "@/lib/yalc/client";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const slug = getSlug(req);
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  const jobId = Array.isArray(req.query.jobId) ? req.query.jobId[0] : req.query.jobId;
  if (!jobId) return res.status(400).json({ error: "Missing jobId" });

  try {
    const config = resolveYalcConfig(slug);
    const job = await yalcFetch(config, `/api/jobs/${encodeURIComponent(jobId)}`);
    return res.status(200).json(job);
  } catch (err) {
    const out = yalcErrorResponse(err);
    return res.status(out.status).json(out.body);
  }
}

export default compose(withErrorHandler, withSlugAuth)(handler);
