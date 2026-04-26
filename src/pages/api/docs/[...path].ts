import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { withErrorHandler, withAuth, compose } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";

/**
 * GET /api/docs/:path
 * Reads a file from the workspace root (BASE).
 * docPath from foundation-state output_file already includes "brand/{slug}/..."
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  const pathParts = req.query.path;
  const docPath = Array.isArray(pathParts) ? pathParts.join("/") : pathParts;
  if (!docPath) return res.status(400).json({ error: "Missing path" });

  const fullPath = path.resolve(path.join(BASE, docPath));
  if (!fullPath.startsWith(path.resolve(BASE))) {
    return res.status(403).json({ error: "Forbidden" });
  }

  // Security: only allow .md and .html files to be written
  const ext = path.extname(fullPath);

  if (req.method === "GET") {
    // ?download=1 — stream raw file with Content-Disposition
    if (req.query.download === "1") {
      try {
        const filename = path.basename(fullPath);
        const mimeType = ext === ".html" ? "text/html" : "text/markdown";
        res.setHeader("Content-Type", mimeType);
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        const stream = fs.createReadStream(fullPath);
        stream.pipe(res);
      } catch {
        res.status(404).json({ ok: false, error: "Not found" });
      }
      return;
    }
    try {
      const content = fs.readFileSync(fullPath, "utf-8");
      const stat = fs.statSync(fullPath);
      res.status(200).json({
        ok: true,
        path: docPath,
        content,
        lastModified: stat.mtime.toISOString(),
        size: stat.size,
      });
    } catch {
      res.status(404).json({ ok: false, error: "Not found" });
    }
    return;
  }

  if (req.method === "PUT") {
    if (![".md", ".html"].includes(ext)) {
      return res.status(403).json({ error: "Only .md and .html files can be edited" });
    }
    const { content } = req.body;
    if (typeof content !== "string") {
      return res.status(400).json({ error: "Missing content" });
    }
    try {
      fs.writeFileSync(fullPath, content, "utf-8");
      res.status(200).json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: "Write failed: " + (e instanceof Error ? e.message : "unknown") });
    }
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}

export default compose(withErrorHandler, withAuth)(handler);
