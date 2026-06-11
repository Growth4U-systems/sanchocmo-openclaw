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

import crypto from "crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import {
  CommentValidationError,
  insertComment,
  isHoneypotTripped,
  loadDocComments,
  validateCommentInput,
  type CommentRow,
} from "@/lib/comments";
import {
  appendCommentToFile,
  ensureCommentedFile,
  getCommentedDocPath,
} from "@/lib/comments-file";
import { BASE } from "@/lib/data/paths";
import { notifyNewComment } from "@/lib/data/review-comments-trigger";
import { verifyShareToken } from "@/lib/share-tokens";

/** Public projection of a comment row — email is NEVER exposed here. */
export function publicComment(c: CommentRow) {
  return {
    id: c.id,
    author: c.author,
    body: c.body,
    anchorText: c.anchorText,
    anchorContext: c.anchorContext,
    anchorDocOffset: c.anchorDocOffset,
    anchorPrefix: c.anchorPrefix,
    anchorSuffix: c.anchorSuffix,
    parentId: c.parentId,
    resolved: c.resolved,
    resolvedAt: c.resolvedAt ? c.resolvedAt.toISOString() : null,
    resolvedBy: c.resolvedBy,
    docVersion: c.docVersion,
    createdAt: c.createdAt.toISOString(),
  };
}

// ── Soft per-IP rate limit (anti-abuse, SAN-148) ──────────────────────
// In-memory sliding window: cheap second line of defense behind the
// unguessable token + honeypot. Resets on redeploy — that's fine.
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_POSTS = 10;
const postTimestamps = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (postTimestamps.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX_POSTS) {
    postTimestamps.set(ip, recent);
    return true;
  }
  recent.push(now);
  postTimestamps.set(ip, recent);
  return false;
}

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
    const openOnly = req.query.open === "1";
    const rows = await loadDocComments(payload.slug, commentedDocPath, { openOnly });
    return res.status(200).json({
      ok: true,
      slug: payload.slug,
      docPath: commentedDocPath,
      originalDocPath: payload.docPath,
      comments: rows.map(publicComment),
    });
  }

  if (req.method === "POST") {
    // Honeypot (SAN-148): bots that fill the hidden `website` field get a
    // fake success and nothing is stored. Checked before any other work.
    if (isHoneypotTripped(req.body)) {
      return res.status(201).json({
        ok: true,
        id: `cmt_${crypto.randomUUID()}`,
        createdAt: new Date().toISOString(),
        docPath: commentedDocPath,
      });
    }

    const ip =
      (typeof req.headers["x-forwarded-for"] === "string"
        ? req.headers["x-forwarded-for"].split(",")[0].trim()
        : null) ||
      req.socket?.remoteAddress ||
      "unknown";
    if (rateLimited(ip)) {
      return res.status(429).json({ error: "Too many comments, slow down" });
    }

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

    let inserted;
    try {
      inserted = await insertComment({
        ...input,
        slug: payload.slug,
        docPath: commentedDocPath,
      });
    } catch (err) {
      if (err instanceof CommentValidationError) {
        return res.status(400).json({ error: err.message });
      }
      throw err;
    }

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
        parentId: inserted.parentId,
      });
    } catch (e) {
      fileWarning = e instanceof Error ? e.message : "file append failed";
    }

    // Agentic loop (SAN-148): surface the new ROOT comment in the doc's MC
    // thread and arm the debounced review dispatch. Fire-and-forget.
    if (!inserted.parentId) {
      notifyNewComment(payload.slug, payload.docPath, {
        id: inserted.id,
        author: inserted.author,
        body: inserted.body,
        anchorText: inserted.anchorText,
      }).catch(() => {});
    }

    return res.status(201).json({
      ok: true,
      id: inserted.id,
      parentId: inserted.parentId,
      createdAt: inserted.createdAt.toISOString(),
      docPath: commentedDocPath,
      ...(fileWarning ? { fileWarning } : {}),
    });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: `Method ${req.method} not allowed` });
}

export default withErrorHandler(handler);
