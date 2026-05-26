/**
 * GET /api/brand-files/<rel-path-inside-brand-root>
 *
 * Sirve archivos del brand (binarios incluidos: png/webp/svg/jpg) directamente con su
 * content-type correcto, para usar en <img src>. Complementa /api/docs/ que solo sirve
 * markdown/HTML wrappeados en JSON.
 *
 * Path resolution: BASE/<rel-path>. Ejemplo:
 *   /api/brand-files/brand/growth4u/brand-book/visual-identity/logo-light.webp
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { promises as fs } from "fs";
import path from "path";
import { BASE } from "@/lib/data/paths";

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf",
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const pathParts = req.query.path;
  const relPath = Array.isArray(pathParts) ? pathParts.join("/") : pathParts;
  if (!relPath) {
    res.status(400).json({ error: "Missing path" });
    return;
  }

  const fullPath = path.resolve(path.join(BASE, relPath));
  // Path traversal guard
  if (!fullPath.startsWith(path.resolve(BASE))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  let stat;
  try {
    stat = await fs.stat(fullPath);
  } catch {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (!stat.isFile()) {
    res.status(400).json({ error: "Not a file" });
    return;
  }

  const ext = path.extname(fullPath).toLowerCase();
  const mime = MIME_TYPES[ext] ?? "application/octet-stream";

  res.setHeader("Content-Type", mime);
  res.setHeader("Content-Length", String(stat.size));
  res.setHeader("Cache-Control", "public, max-age=300");

  if (req.query.download === "1") {
    res.setHeader("Content-Disposition", `attachment; filename="${path.basename(fullPath)}"`);
  }

  try {
    const buffer = await fs.readFile(fullPath);
    res.status(200).end(buffer);
  } catch {
    res.status(500).json({ error: "Read failed" });
  }
}
