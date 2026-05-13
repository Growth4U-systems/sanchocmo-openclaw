import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withErrorHandler, withSlugAuth } from "@/lib/api-middleware";
import {
  getMeetingIntelligenceConfig,
  saveMeetingIntelligenceConfig,
} from "@/lib/data/meeting-intelligence-db";
import {
  getMeetingIntelligenceCronStatus,
  syncMeetingIntelligenceCron,
} from "@/lib/data/meeting-intelligence-cron";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const slug = (req.query.slug as string) || req.body?.slug;
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  if (req.method === "GET") {
    const result = await getMeetingIntelligenceConfig(slug);
    const cron = result.config ? getMeetingIntelligenceCronStatus(slug, result.config.sync?.cronJobId) : null;
    return res.status(200).json({ ...result, cron });
  }

  if (req.method === "PUT" || req.method === "POST") {
    const result = await saveMeetingIntelligenceConfig(slug, req.body?.config || req.body || {});
    const cronResult = result.config ? syncMeetingIntelligenceCron(result.config) : null;
    return res.status(result.ok && cronResult?.ok !== false ? 200 : 503).json({ ...result, cron: cronResult?.cron || null });
  }

  res.setHeader("Allow", "GET, PUT, POST");
  return res.status(405).json({ error: `Method ${req.method} not allowed` });
}

export default compose(withErrorHandler, withSlugAuth)(handler);
