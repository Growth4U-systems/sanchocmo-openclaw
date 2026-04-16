import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { withErrorHandler } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";

/**
 * GET /api/trust-engine/run-state?slug=X&niche=Y
 * Supports per-niche subdirectory (brand/{slug}/trust-engine/{niche}/)
 * Falls back to root (brand/{slug}/trust-engine/) for backwards compat.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const slug = req.query.slug as string;
  const niche = req.query.niche as string | undefined;
  if (!slug) return res.status(400).json({ error: "slug required" });

  const baseDir = path.join(BASE, "brand", slug, "trust-engine");
  // Try niche-specific dir first, then root
  const dirs = niche ? [path.join(baseDir, niche), baseDir] : [baseDir];

  for (const dir of dirs) {
    const fp = path.join(dir, "run-state.json");
    if (fs.existsSync(fp)) {
      try {
        const data = JSON.parse(fs.readFileSync(fp, "utf-8"));
        return res.status(200).json(data);
      } catch { /* continue */ }
    }
  }
  res.status(200).json({ modules: {} });
}

export default withErrorHandler(handler);
