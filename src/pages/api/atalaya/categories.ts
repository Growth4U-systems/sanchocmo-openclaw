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

  const { action, category } = req.body;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const config = loadAtalayaConfig(slug) as any;
  if (!config.categories) config.categories = ["Growth", "Founder", "SEO", "AI", "Marketing"];

  if (action === "add" && category && !config.categories.includes(category)) {
    config.categories.push(category);
  } else if (action === "remove" && category) {
    config.categories = config.categories.filter((c: string) => c !== category);
  }

  saveAtalayaConfig(slug, config);
  return res.status(200).json({ ok: true, categories: config.categories });
}

export default compose(withErrorHandler, withAuth)(handler);
