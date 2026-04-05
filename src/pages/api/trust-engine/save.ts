import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { withAuth, withErrorHandler, compose } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";

/**
 * POST /api/trust-engine/save
 * Ported from mc-server.js:7197+
 * Updates an item in recommendations/keywords/influencers JSON
 * Body: { slug, file, itemId, updates }
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { slug, file, itemId, updates } = req.body;
  if (!slug || !file || file.includes("..")) {
    return res.status(400).json({ error: "Missing slug or invalid file" });
  }

  const teDir = path.join(BASE, "brand", slug, "trust-engine");
  const filePath = path.join(teDir, file);

  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));

    if (itemId && Array.isArray(data)) {
      const item = data.find((d: { id?: string }) => d.id === itemId);
      if (item) Object.assign(item, updates);
    } else if (itemId && typeof data === "object") {
      // Object with nested arrays
      for (const key of Object.keys(data)) {
        if (Array.isArray(data[key])) {
          const item = data[key].find((d: { id?: string }) => d.id === itemId);
          if (item) Object.assign(item, updates);
        }
      }
    } else if (updates && typeof data === "object") {
      Object.assign(data, updates);
    }

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    res.status(200).json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Save failed";
    res.status(500).json({ error: msg });
  }
}

export default compose(withErrorHandler, withAuth)(handler);
