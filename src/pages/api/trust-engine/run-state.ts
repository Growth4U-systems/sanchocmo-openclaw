import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { withErrorHandler } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";

/**
 * GET /api/trust-engine/run-state?slug=X
 * Ported from mc-server.js:6179-6188
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const slug = req.query.slug as string;
  if (!slug) return res.status(400).json({ error: "slug required" });

  const teDir = path.join(BASE, "brand", slug, "trust-engine");
  try {
    const data = JSON.parse(fs.readFileSync(path.join(teDir, "run-state.json"), "utf-8"));
    res.status(200).json(data);
  } catch {
    res.status(200).json({ modules: {} });
  }
}

export default withErrorHandler(handler);
