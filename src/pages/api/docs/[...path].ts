import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { withErrorHandler, withAuth, compose } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";
import { resolveWorkspaceDocPath } from "@/lib/server/doc-paths";

/**
 * GET /api/docs/:path
 * Reads a file from the workspace root (BASE).
 * docPath from foundation-state output_file already includes "brand/{slug}/..."
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  const pathParts = req.query.path;
  const docPath = Array.isArray(pathParts) ? pathParts.join("/") : pathParts;
  if (!docPath) return res.status(400).json({ error: "Missing path" });

  let resolved;
  try {
    resolved = resolveWorkspaceDocPath(BASE, docPath);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Forbidden";
    const status = message === "Forbidden" ? 403 : 400;
    return res.status(status).json({ error: message });
  }

  const fullPath = resolved.absPath;
  if (!fullPath.startsWith(path.resolve(BASE))) {
    return res.status(403).json({ error: "Forbidden" });
  }

  // Security: only allow .md and .html files to be written
  const ext = path.extname(fullPath);

  if (req.method === "GET") {
    // ?download=1 — stream raw file with Content-Disposition
    if (req.query.download === "1") {
      try {
        if (!resolved.exists) {
          return res.status(404).json({ ok: false, error: "Not found", path: resolved.canonicalPath });
        }
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
      if (!resolved.exists) {
        return res.status(404).json({ ok: false, error: "Not found", path: resolved.canonicalPath });
      }
      const content = fs.readFileSync(fullPath, "utf-8");
      const stat = fs.statSync(fullPath);
      // HTML-canonical sibling (SAN-149): stale when the .md source is
      // newer than its generated .html.
      let htmlSiblingStale = false;
      if (resolved.htmlSibling) {
        try {
          const siblingStat = fs.statSync(path.join(path.resolve(BASE), resolved.htmlSibling));
          htmlSiblingStale = stat.mtime.getTime() > siblingStat.mtime.getTime();
        } catch {
          // sibling vanished between resolve and stat — ignore
        }
      }
      res.status(200).json({
        ok: true,
        path: resolved.canonicalPath,
        requestedPath: resolved.requestedPath,
        canonicalPath: resolved.canonicalPath,
        usedFallback: resolved.usedFallback,
        htmlSibling: resolved.htmlSibling,
        htmlSiblingStale,
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
    if (!resolved.exists && resolved.requestedPath.endsWith("/current.md")) {
      return res.status(404).json({ error: "Not found" });
    }
    if (![".md", ".html"].includes(ext)) {
      return res.status(403).json({ error: "Only .md and .html files can be edited" });
    }
    const { content } = req.body;
    if (typeof content !== "string") {
      return res.status(400).json({ error: "Missing content" });
    }
    try {
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
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
