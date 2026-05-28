/**
 * POST/GET /api/share/:token/comments — Public comments on a shared doc (SAN-15).
 *
 * Token-authenticated: the share token encodes (slug, docPath); no separate
 * auth required. Anyone with the share URL can list existing comments and
 * post new ones. The email field is stored but NOT exposed in the public list
 * — only the authenticated client endpoint surfaces email for follow-up.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import {
  CommentValidationError,
  insertComment,
  loadDocComments,
  validateCommentInput,
} from "@/lib/comments";
import { verifyShareToken } from "@/lib/share-tokens";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { token } = req.query;
  const tokenStr = Array.isArray(token) ? token[0] : token;
  if (!tokenStr) return res.status(400).json({ error: "Missing token" });

  const payload = verifyShareToken(tokenStr);
  if (!payload) {
    return res.status(403).json({ error: "Invalid or expired share token" });
  }

  if (req.method === "GET") {
    const rows = await loadDocComments(payload.slug, payload.docPath);
    return res.status(200).json({
      ok: true,
      slug: payload.slug,
      docPath: payload.docPath,
      comments: rows.map((c) => ({
        id: c.id,
        author: c.author,
        body: c.body,
        anchorText: c.anchorText,
        anchorContext: c.anchorContext,
        anchorDocOffset: c.anchorDocOffset,
        docVersion: c.docVersion,
        createdAt: c.createdAt.toISOString(),
      })),
    });
  }

  if (req.method === "POST") {
    let input;
    try {
      input = validateCommentInput(req.body);
    } catch (err) {
      if (err instanceof CommentValidationError) {
        return res.status(400).json({ error: err.message });
      }
      throw err;
    }
    const inserted = await insertComment({
      ...input,
      slug: payload.slug,
      docPath: payload.docPath,
    });
    return res.status(201).json({
      ok: true,
      id: inserted.id,
      createdAt: inserted.createdAt.toISOString(),
    });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: `Method ${req.method} not allowed` });
}

export default withErrorHandler(handler);
