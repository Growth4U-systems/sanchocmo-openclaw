/**
 * GET /api/share/:token — Public unauthenticated doc fetch.
 *
 * Verifies the HMAC-signed share token, reads the doc from disk, and
 * returns its content as JSON. NO auth middleware — this is the public
 * read path. Security relies entirely on token unguessability.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { withErrorHandler } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";
import { verifyShareToken } from "@/lib/share-tokens";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const { token } = req.query;
  const tokenStr = Array.isArray(token) ? token[0] : token;
  if (!tokenStr) {
    return res.status(400).json({ error: "Missing token" });
  }

  const payload = verifyShareToken(tokenStr);
  if (!payload) {
    return res.status(403).json({ error: "Invalid or expired share token" });
  }

  // Defense in depth: re-validate path is under brand/{slug}/
  if (!payload.docPath.startsWith(`brand/${payload.slug}/`)) {
    return res.status(403).json({ error: "Token payload mismatch" });
  }

  const absPath = path.resolve(path.join(BASE, payload.docPath));
  const safeBase = path.resolve(BASE);
  if (!absPath.startsWith(safeBase)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  // ?download=1 — stream raw file
  if (req.query.download === "1") {
    try {
      if (!fs.existsSync(absPath)) {
        return res.status(404).json({ error: "Not found" });
      }
      const ext = path.extname(absPath).toLowerCase();
      const mime =
        ext === ".html" ? "text/html"
          : ext === ".md" ? "text/markdown"
          : ext === ".pdf" ? "application/pdf"
          : ext === ".png" ? "image/png"
          : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg"
          : "application/octet-stream";
      res.setHeader("Content-Type", mime);
      res.setHeader("Content-Disposition", `attachment; filename="${path.basename(absPath)}"`);
      const stream = fs.createReadStream(absPath);
      stream.pipe(res);
      return;
    } catch {
      return res.status(404).json({ error: "Not found" });
    }
  }

  try {
    if (!fs.existsSync(absPath)) {
      return res.status(404).json({ error: "Not found" });
    }
    const content = fs.readFileSync(absPath, "utf-8");
    return res.status(200).json({
      ok: true,
      slug: payload.slug,
      path: payload.docPath,
      filename: path.basename(absPath),
      content,
      iat: payload.iat,
    });
  } catch {
    return res.status(404).json({ error: "Not found" });
  }
}

export default withErrorHandler(handler);
