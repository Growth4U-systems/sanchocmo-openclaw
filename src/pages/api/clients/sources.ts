import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withErrorHandler, withAuth, canAccessSlug } from "@/lib/api-middleware";
import { sourcesFile } from "@/lib/data/paths";
import { writeJSON } from "@/lib/data/json-io";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const slug = (req.query.slug as string) || req.body?.slug;
  if (!slug) {
    return res.status(400).json({ error: "Missing slug" });
  }

  if (!canAccessSlug(req.ctx, slug)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const filePath = sourcesFile(slug);
  const data = req.body.data || req.body;

  // Remove slug from data to avoid duplication
  delete data.slug;

  writeJSON(filePath, data);
  return res.status(200).json({ ok: true });
}

export default compose(withErrorHandler, withAuth)(handler);
