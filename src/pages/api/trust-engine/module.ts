import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { withErrorHandler } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";

/**
 * GET /api/trust-engine/module?slug=X&file=recommendations.json
 * Ported from mc-server.js:6191-6201
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const slug = req.query.slug as string;
  const file = req.query.file as string;
  if (!slug) return res.status(400).json({ error: "slug required" });
  if (!file || file.includes("..")) return res.status(400).json({ error: "invalid file" });

  const teDir = path.join(BASE, "brand", slug, "trust-engine");
  try {
    const data = JSON.parse(fs.readFileSync(path.join(teDir, file), "utf-8"));
    res.status(200).json(data);
  } catch {
    res.status(404).json({ error: "not found" });
  }
}

export default withErrorHandler(handler);
