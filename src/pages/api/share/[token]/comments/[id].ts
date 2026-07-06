/**
 * PATCH/DELETE /api/share/:token/comments/:id — Mutate a single comment (SAN-15).
 *
 * Token-authenticated like POST/GET on /comments. The comment's (slug, docPath)
 * MUST match the verified token payload (translated to the commented sibling),
 * so a token only grants access to comments on the doc it points to — even if
 * the caller knows a foreign id.
 *
 * No identity auth: anyone with the share URL and a comment id can call PATCH
 * or DELETE. The browser-side enforces ownership via localStorage (the UI only
 * exposes Edit/Delete on comments the same browser posted), but the API does
 * NOT enforce this. The threat model is intentional: share tokens are
 * unguessable; comment ids are uuids; the worst-case griefer would need both
 * the token AND the id, which is essentially the same access surface as the
 * existing POST endpoint.
 *
 * Mutations are mirrored to the commented file on disk (the markdown block
 * gets updated or excised) so the file stays in sync with the DB.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import {
  CommentValidationError,
  deleteComment,
  updateComment,
  validateCommentPatch,
} from "@/lib/comments";
import {
  deleteCommentedFileIfEmpty,
  getCommentedDocPath,
  removeCommentFromFile,
  updateCommentInFile,
} from "@/lib/comments-file";
import { BASE } from "@/lib/data/paths";
import { verifyShareToken } from "@/lib/share-tokens";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { token, id } = req.query;
  const tokenStr = Array.isArray(token) ? token[0] : token;
  const idStr = Array.isArray(id) ? id[0] : id;
  if (!tokenStr) return res.status(400).json({ error: "Missing token" });
  if (!idStr) return res.status(400).json({ error: "Missing comment id" });

  const payload = verifyShareToken(tokenStr);
  if (!payload) {
    return res.status(403).json({ error: "Invalid or expired share token" });
  }

  const commentedDocPath = getCommentedDocPath(payload.docPath);

  if (req.method === "PATCH") {
    let patch;
    try {
      patch = validateCommentPatch(req.body);
    } catch (err) {
      if (err instanceof CommentValidationError) {
        return res.status(400).json({ error: err.message });
      }
      throw err;
    }
    let updated;
    try {
      updated = await updateComment(idStr, payload.slug, commentedDocPath, patch);
    } catch (err) {
      if (err instanceof CommentValidationError) {
        return res.status(400).json({ error: err.message });
      }
      throw err;
    }
    if (!updated) {
      return res.status(404).json({ error: "Comment not found" });
    }

    let fileWarning: string | null = null;
    try {
      updateCommentInFile(BASE, commentedDocPath, {
        id: updated.id,
        author: updated.author,
        createdAt: updated.createdAt,
        body: updated.body,
        anchorText: updated.anchorText,
        parentId: updated.parentId,
        resolved: updated.resolved,
      });
    } catch (e) {
      fileWarning = e instanceof Error ? e.message : "file update failed";
    }

    return res.status(200).json({
      ok: true,
      id: updated.id,
      body: updated.body,
      anchorText: updated.anchorText,
      anchorContext: updated.anchorContext,
      anchorDocOffset: updated.anchorDocOffset,
      parentId: updated.parentId,
      resolved: updated.resolved,
      resolvedAt: updated.resolvedAt ? updated.resolvedAt.toISOString() : null,
      resolvedBy: updated.resolvedBy,
      createdAt: updated.createdAt.toISOString(),
      ...(fileWarning ? { fileWarning } : {}),
    });
  }

  if (req.method === "DELETE") {
    // v2 (SAN-148): deleting a root cascades to its replies; every deleted
    // id gets its file block excised.
    const deletedIds = await deleteComment(idStr, payload.slug, commentedDocPath);
    if (deletedIds.length === 0) {
      return res.status(404).json({ error: "Comment not found" });
    }
    let fileWarning: string | null = null;
    let commentedFileDeleted = false;
    try {
      for (const deletedId of deletedIds) {
        removeCommentFromFile(BASE, commentedDocPath, deletedId);
      }
      // If this was the last comment for the doc, drop the sibling so
      // the share viewer falls back to serving the clean original
      // (and the displayed filename reverts).
      commentedFileDeleted = deleteCommentedFileIfEmpty(BASE, commentedDocPath);
    } catch (e) {
      fileWarning = e instanceof Error ? e.message : "file remove failed";
    }
    return res.status(200).json({
      ok: true,
      deletedIds,
      commentedFileDeleted,
      ...(fileWarning ? { fileWarning } : {}),
    });
  }

  res.setHeader("Allow", "PATCH, DELETE");
  return res.status(405).json({ error: `Method ${req.method} not allowed` });
}

export default withErrorHandler(handler);
