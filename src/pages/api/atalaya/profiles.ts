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

  if (req.method === "GET") {
    const config = loadAtalayaConfig(slug);
    return res.status(200).json({ ok: true, followed_profiles: config.followed_profiles || [] });
  }

  if (req.method === "POST") {
    const { platform, url: profileUrl, category, name } = req.body;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config = loadAtalayaConfig(slug) as any;
    if (!config.followed_profiles) config.followed_profiles = {};
    if (!config.followed_profiles[platform]) config.followed_profiles[platform] = [];

    const id = "p-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);
    const profileName = name || (platform === "linkedin" ? profileUrl.split("/in/")[1]?.replace(/\/$/, "") || profileUrl : profileUrl);

    config.followed_profiles[platform].push({
      id,
      name: profileName,
      url: profileUrl,
      category: category || "Growth",
      active: true,
      added_at: new Date().toISOString(),
      posts_monitored: 0,
    });

    saveAtalayaConfig(slug, config);
    return res.status(200).json({ ok: true, id });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: `Method ${req.method} not allowed` });
}

export default compose(withErrorHandler, withAuth)(handler);
