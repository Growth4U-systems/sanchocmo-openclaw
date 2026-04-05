import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { withErrorHandler } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";

/**
 * GET /api/chat/doc/:path
 * Ported from mc-server.js:5239-5263
 * Returns raw doc content for pinned docs in chat
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const pathParts = req.query.path;
  const docPath = Array.isArray(pathParts) ? pathParts.join("/") : pathParts;
  if (!docPath) return res.status(400).json({ error: "Missing path" });

  // Only allow reading from brand/ directory
  const fullPath = path.join(BASE, "brand", docPath);
  const resolved = path.resolve(fullPath);
  if (!resolved.startsWith(path.resolve(path.join(BASE, "brand")))) {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const content = fs.readFileSync(resolved, "utf-8");
    res.status(200).json({ ok: true, path: docPath, content });
  } catch {
    res.status(404).json({ ok: false, error: "Not found" });
  }
}

export default withErrorHandler(handler);
