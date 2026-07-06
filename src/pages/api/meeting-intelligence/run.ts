import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withErrorHandler, withSlugAuth } from "@/lib/api-middleware";
import { createMeetingIntelligenceRun } from "@/lib/data/meeting-intelligence-db";
import { runMeetingIntelligenceSync } from "@/lib/data/meeting-intelligence-runner";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const slug = req.body?.slug || req.query.slug;
  if (!slug || typeof slug !== "string") return res.status(400).json({ error: "Missing slug" });

  if (req.body?.registerOnly === true) {
    const result = await createMeetingIntelligenceRun({
      slug,
      status: typeof req.body?.status === "string" ? req.body.status : "queued",
      trigger: typeof req.body?.trigger === "string" ? req.body.trigger : "agent",
      sourcesScanned: req.body?.sourcesScanned || req.body?.sources_scanned || null,
      metrics: req.body?.metrics || null,
      errors: req.body?.errors || null,
    });
    return res.status(result.ok ? 200 : 503).json(result);
  }

  const result = await runMeetingIntelligenceSync({
    slug,
    trigger: typeof req.body?.trigger === "string" ? req.body.trigger : "agent",
    limit: Number.isFinite(Number(req.body?.limit)) ? Number(req.body.limit) : undefined,
  });
  return res.status(result.ok ? 200 : 503).json(result);
}

export default compose(withErrorHandler, withSlugAuth)(handler);
