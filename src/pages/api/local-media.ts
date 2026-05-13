import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { brandDir } from "@/lib/data/paths";
import { withErrorHandler } from "@/lib/api-middleware";

/**
 * GET /api/local-media?slug=growth4u&path=content/drafts/{ideaId}/media/slide-XX.png
 *
 * Streams a binary file from the brand workspace directly to the browser.
 * Fallback path for environments where the public R2 subdomain isn't
 * reachable (ISP / VPN / firewall blocking *.r2.dev).
 *
 * The `path` is brand-relative — i.e. starts UNDER `brand/{slug}/`. We
 * resolve it against `brandDir(slug)` and then guard against any traversal
 * (`..`, absolute paths, etc.) by ensuring the resolved real path stays
 * inside the brand directory.
 */

const ALLOWED_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".pdf",
]);

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
};

async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).end();
    return;
  }

  const slug = (req.query.slug as string | undefined)?.trim();
  const relPath = (req.query.path as string | undefined)?.trim();
  if (!slug || !relPath) {
    res.status(400).json({ error: "Missing slug or path" });
    return;
  }
  if (!/^[a-z0-9_-]+$/i.test(slug)) {
    res.status(400).json({ error: "Invalid slug" });
    return;
  }

  const root = path.resolve(brandDir(slug));
  const requested = path.resolve(root, relPath);
  // Anti-traversal: resolved path must stay inside the brand dir.
  if (!requested.startsWith(root + path.sep) && requested !== root) {
    res.status(403).json({ error: "Path escapes brand directory" });
    return;
  }

  const ext = path.extname(requested).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    res.status(415).json({ error: "Unsupported media type" });
    return;
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(requested);
  } catch {
    res.status(404).json({ error: "File not found" });
    return;
  }
  if (!stat.isFile()) {
    res.status(404).json({ error: "Not a file" });
    return;
  }

  res.setHeader("Content-Type", MIME[ext] || "application/octet-stream");
  res.setHeader("Content-Length", String(stat.size));
  // Short cache so re-renders pick up replacements quickly.
  res.setHeader("Cache-Control", "public, max-age=60");
  fs.createReadStream(requested).pipe(res);
}

export const config = { api: { responseLimit: false } };
export default withErrorHandler(handler);
