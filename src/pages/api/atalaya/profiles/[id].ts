import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";
import { loadAtalayaConfig, saveAtalayaConfig } from "@/lib/data/atalaya";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!req.ctx?.isAdmin) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const slug = (req.query.slug as string) || req.body?.slug;
  if (!slug) {
    return res.status(400).json({ error: "Missing slug" });
  }

  const profileId = req.query.id as string;

  if (req.method === "PUT") {
    const { platform, active, category } = req.body;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config = loadAtalayaConfig(slug) as any;
    const list = config.followed_profiles?.[platform] || [];
    const item = list.find((p: { id: string }) => p.id === profileId);
    if (!item) {
      return res.status(404).json({ error: "Profile not found" });
    }
    if (active !== undefined) item.active = active;
    if (category !== undefined) item.category = category;
    saveAtalayaConfig(slug, config);
    return res.status(200).json({ ok: true });
  }

  if (req.method === "DELETE") {
    const { platform } = req.body;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config = loadAtalayaConfig(slug) as any;
    if (config.followed_profiles?.[platform]) {
      config.followed_profiles[platform] = config.followed_profiles[platform].filter(
        (p: { id: string }) => p.id !== profileId
      );
      saveAtalayaConfig(slug, config);
    }
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "PUT, DELETE");
  return res.status(405).json({ error: `Method ${req.method} not allowed` });
}

export default compose(withErrorHandler, withAuth)(handler);
