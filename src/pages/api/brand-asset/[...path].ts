import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { withErrorHandler } from "@/lib/api-middleware";
import { brandDir } from "@/lib/data/paths";

/**
 * GET /api/brand-asset/{slug}/{relative-path}
 *
 * Serves binary files that live inside `brand/{slug}/brand-book/visual-identity/`.
 * Used by the carousel renderer (Playwright fetches the logo from this URL when
 * stitching slides) and by the Setup UI to preview the brand's logo.
 *
 * Sandboxing: the resolved absolute path MUST live inside the brand's
 * `brand-book/visual-identity/` directory. Anything else returns 403, even
 * if the slug is real.
 */

const ALLOWED_PREFIX = path.join("brand-book", "visual-identity") + path.sep;

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".gif": "image/gif",
};

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const parts = req.query.path;
  if (!Array.isArray(parts) || parts.length < 2) {
    return res.status(400).json({ error: "Path must be {slug}/{relative-path}" });
  }
  const [slug, ...rest] = parts;
  if (!slug || /[/\\]/.test(slug)) {
    return res.status(400).json({ error: "Invalid slug" });
  }
  const relPath = rest.join("/");
  if (!relPath || relPath.includes("..")) {
    return res.status(400).json({ error: "Invalid path" });
  }

  const baseDir = brandDir(slug);
  const absPath = path.resolve(baseDir, relPath);
  const relFromBase = path.relative(baseDir, absPath);

  // Sandbox: must stay under the brand dir AND under brand-book/visual-identity/.
  if (relFromBase.startsWith("..") || path.isAbsolute(relFromBase)) {
    return res.status(403).json({ error: "Path escapes brand directory" });
  }
  if (!relFromBase.startsWith(ALLOWED_PREFIX)) {
    return res.status(403).json({ error: "Only brand-book/visual-identity assets are served" });
  }

  if (!fs.existsSync(absPath)) {
    return res.status(404).json({ error: "Asset not found" });
  }
  const stat = fs.statSync(absPath);
  if (!stat.isFile()) return res.status(404).json({ error: "Not a file" });

  const ext = path.extname(absPath).toLowerCase();
  const mime = MIME_BY_EXT[ext] || "application/octet-stream";

  res.setHeader("Content-Type", mime);
  res.setHeader("Content-Length", String(stat.size));
  res.setHeader("Cache-Control", "private, max-age=300");
  fs.createReadStream(absPath).pipe(res);
}

export default withErrorHandler(handler);
