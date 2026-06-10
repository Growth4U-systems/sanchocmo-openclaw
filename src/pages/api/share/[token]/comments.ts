/**
 * POST/GET /api/share/:token/comments — Public comments on a shared doc (SAN-15).
 *
 * Token-authenticated: the share token encodes (slug, docPath); no separate
 * auth required. Anyone with the share URL can list existing comments and
 * post new ones. The email field is stored but NOT exposed in the public list
 * — only the authenticated client endpoint surfaces email for follow-up.
 *
 * Commented-snapshot model (SAN-15, decided 2026-05-28):
 *   Comments are anchored to the "commented" sibling of the original doc
 *   path (e.g. `current.md` → `current.commented.md`). On the first POST
 *   for a doc, Sancho copies the original to the commented sibling and
 *   anchors all subsequent comments there. The original stays clean.
 *   Each POST also appends the comment block to the commented file so
 *   the file IS a readable, git-friendly transcript of the feedback.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import {
  CommentValidationError,
  insertComment,
  loadDocComments,
  validateCommentInput,
} from "@/lib/comments";
import {
  appendCommentToFile,
  ensureCommentedFile,
  getCommentedDocPath,
} from "@/lib/comments-file";
import { BASE } from "@/lib/data/paths";
import { verifyShareToken } from "@/lib/share-tokens";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { token } = req.query;
  const tokenStr = Array.isArray(token) ? token[0] : token;
  if (!tokenStr) return res.status(400).json({ error: "Missing token" });

  const payload = verifyShareToken(tokenStr);
  if (!payload) {
    return res.status(403).json({ error: "Invalid or expired share token" });
  }

  // Comments always live on the commented sibling. If the token points
  // at the original doc, we transparently translate to the commented
  // sibling. If the token already points at the commented doc (some
  // future flow may issue tokens directly to it), the helper is
  // idempotent.
  const commentedDocPath = getCommentedDocPath(payload.docPath);

  if (req.method === "GET") {
    const rows = await loadDocComments(payload.slug, commentedDocPath);
    return res.status(200).json({
      ok: true,
      slug: payload.slug,
      docPath: commentedDocPath,
      originalDocPath: payload.docPath,
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

    // Materialize the commented file BEFORE inserting the DB row so
    // both halves stay consistent. If the disk-side op fails, the row
    // is never inserted.
    try {
      ensureCommentedFile(BASE, payload.docPath);
    } catch (e) {
      return res.status(500).json({
        error: e instanceof Error ? e.message : "Could not create commented file",
      });
    }

    const inserted = await insertComment({
      ...input,
      slug: payload.slug,
      docPath: commentedDocPath,
    });

    // Append the formatted block. Failure here is non-fatal for the
    // client UX (the comment is already in DB), but we surface it as a
    // soft warning so we don't paper over disk sync issues.
    let fileWarning: string | null = null;
    try {
      appendCommentToFile(BASE, commentedDocPath, {
        id: inserted.id,
        author: inserted.author,
        createdAt: inserted.createdAt,
        body: inserted.body,
        anchorText: inserted.anchorText,
      });
    } catch (e) {
      fileWarning = e instanceof Error ? e.message : "file append failed";
    }

    return res.status(201).json({
      ok: true,
      id: inserted.id,
      createdAt: inserted.createdAt.toISOString(),
      docPath: commentedDocPath,
      ...(fileWarning ? { fileWarning } : {}),
    });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: `Method ${req.method} not allowed` });
}

export default withErrorHandler(handler);
