/**
 * GET /api/share/:token — Public unauthenticated doc fetch.
 *
 * Verifies the HMAC-signed share token, reads the doc from disk, and
 * returns its content as JSON. NO auth middleware — this is the public
 * read path. Security relies entirely on token unguessability.
 *
 * SAN-15 commented-snapshot behavior:
 *   If a `*.commented.<ext>` sibling exists next to the original doc,
 *   that file is served instead — it contains the same body plus an
 *   appended `## Comentarios` section materialized by the comments POST
 *   endpoint. The share token still works against the ORIGINAL path
 *   (no re-signing needed); switching to the commented sibling happens
 *   transparently. Tokens that already point at the commented path are
 *   honored as-is.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { withErrorHandler } from "@/lib/api-middleware";
import { getCommentedDocPath, isCommentedDocPath } from "@/lib/comments-file";
import { BASE } from "@/lib/data/paths";
import { verifyShareToken } from "@/lib/share-tokens";
import { resolveWorkspaceDocPath } from "@/lib/server/doc-paths";

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

  // If a commented sibling exists for this original doc, serve that
  // instead so the cliente sees previous comments and the appended
  // `## Comentarios` section. Idempotent on already-commented paths.
  let effectiveDocPath = payload.docPath;
  if (!isCommentedDocPath(payload.docPath)) {
    const candidateCommented = getCommentedDocPath(payload.docPath);
    try {
      const commentedAbs = path.resolve(BASE, candidateCommented);
      if (commentedAbs.startsWith(path.resolve(BASE, "brand") + path.sep) && fs.existsSync(commentedAbs)) {
        effectiveDocPath = candidateCommented;
      }
    } catch {
      // ignore — fall through and serve the original
    }
  }

  let resolved;
  try {
    resolved = resolveWorkspaceDocPath(BASE, effectiveDocPath, {
      slug: payload.slug,
      requireBrand: true,
    });
  } catch {
    return res.status(403).json({ error: "Forbidden" });
  }
  const absPath = resolved.absPath;

  // ?download=1 — stream raw file
  if (req.query.download === "1") {
    try {
      if (!resolved.exists || !fs.existsSync(absPath)) {
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
    if (!resolved.exists || !fs.existsSync(absPath)) {
      return res.status(404).json({ error: "Not found" });
    }
    const content = fs.readFileSync(absPath, "utf-8");
    return res.status(200).json({
      ok: true,
      slug: payload.slug,
      path: resolved.canonicalPath,
      requestedPath: payload.docPath,
      canonicalPath: resolved.canonicalPath,
      // True when the served file is the commented sibling (not the
      // original). Frontend can use this to label / opt out of the
      // appended `## Comentarios` section if it ever wants to.
      isCommentedView: effectiveDocPath !== payload.docPath,
      originalDocPath: payload.docPath,
      usedFallback: resolved.usedFallback,
      filename: path.basename(absPath),
      content,
      iat: payload.iat,
    });
  } catch {
    return res.status(404).json({ error: "Not found" });
  }
}

export default withErrorHandler(handler);
