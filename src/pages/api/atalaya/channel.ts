import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";
import { loadAtalayaConfig, saveAtalayaConfig } from "@/lib/data/atalaya";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  if (!req.ctx?.isAdmin) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const slug = (req.query.slug as string) || req.body.slug;
  if (!slug) {
    return res.status(400).json({ error: "Missing slug" });
  }

  const { competitorSlug, channel, enabled } = req.body;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const config = loadAtalayaConfig(slug) as any;
  if (!config.competitor_overrides) config.competitor_overrides = {};
  if (!config.competitor_overrides[competitorSlug]) {
    config.competitor_overrides[competitorSlug] = {
      channels: [...(config.channels_to_monitor || [])],
    };
  }

  const chList: string[] = config.competitor_overrides[competitorSlug].channels;
  if (enabled && !chList.includes(channel)) chList.push(channel);
  if (!enabled) config.competitor_overrides[competitorSlug].channels = chList.filter((c) => c !== channel);

  saveAtalayaConfig(slug, config);
  return res.status(200).json({ ok: true });
}

export default compose(withErrorHandler, withAuth)(handler);
