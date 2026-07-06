import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import { withErrorHandler } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";
import { resolveWorkspaceDocPath } from "@/lib/server/doc-paths";

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

  const parts = docPath.replace(/^\/+/, "").split("/").filter(Boolean);
  const slug = parts[0] === "brand" ? parts[1] : parts[0];
  const brandPath = parts[0] === "brand" ? docPath : `brand/${docPath}`;

  let resolved;
  try {
    resolved = resolveWorkspaceDocPath(BASE, brandPath, { slug, requireBrand: true });
  } catch {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    if (!resolved.exists) {
      return res.status(404).json({ ok: false, error: "Not found", path: resolved.canonicalPath });
    }
    const content = fs.readFileSync(resolved.absPath, "utf-8");
    res.status(200).json({
      ok: true,
      path: resolved.canonicalPath.replace(/^brand\//, ""),
      canonicalPath: resolved.canonicalPath,
      requestedPath: docPath,
      usedFallback: resolved.usedFallback,
      content,
    });
  } catch {
    res.status(404).json({ ok: false, error: "Not found" });
  }
}

export default withErrorHandler(handler);
