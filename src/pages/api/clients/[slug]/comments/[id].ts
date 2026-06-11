/**
 * PATCH /api/clients/:slug/comments/:id — Agent-side comment mutation (SAN-148).
 *
 * Service auth only (`Authorization: Bearer $SANCHO_INTERNAL_API_TOKEN`).
 * Used by the review-comments skill to close the loop after applying a
 * revision:
 *
 *   Body: {
 *     docPath: string,        // original or .commented path of the doc
 *     resolved?: boolean,     // resolve/reopen the root thread
 *     replyBody?: string,     // optional signed reply ("Aplicado: ...")
 *     replyAuthor?: string,   // display name, e.g. "Maese Pedro (agente)"
 *   }
 *
 * Both mutations mirror to the `.commented` file like the public endpoints.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import {
  CommentValidationError,
  insertComment,
  updateComment,
} from "@/lib/comments";
import {
  appendCommentToFile,
  getCommentedDocPath,
  updateCommentInFile,
} from "@/lib/comments-file";
import { BASE } from "@/lib/data/paths";
import { requireInternalAuth } from "@/lib/sancho-internal-api";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "PATCH") {
    res.setHeader("Allow", "PATCH");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }
  if (!requireInternalAuth(req, res)) return;

  const { slug, id } = req.query;
  const slugStr = Array.isArray(slug) ? slug[0] : slug;
  const idStr = Array.isArray(id) ? id[0] : id;
  if (!slugStr) return res.status(400).json({ error: "Missing slug" });
  if (!idStr) return res.status(400).json({ error: "Missing comment id" });

  const docPathRaw = req.body?.docPath;
  if (!docPathRaw || typeof docPathRaw !== "string") {
    return res.status(400).json({ error: "docPath required" });
  }
  const commentedDocPath = getCommentedDocPath(docPathRaw);

  const resolved = req.body?.resolved;
  const replyBody = typeof req.body?.replyBody === "string" ? req.body.replyBody.trim() : "";
  const replyAuthor =
    typeof req.body?.replyAuthor === "string" && req.body.replyAuthor.trim()
      ? req.body.replyAuthor.trim()
      : "Sancho";

  if (resolved === undefined && !replyBody) {
    return res.status(400).json({ error: "Nothing to do: pass resolved and/or replyBody" });
  }

  try {
    let reply = null;
    if (replyBody) {
      reply = await insertComment({
        slug: slugStr,
        docPath: commentedDocPath,
        author: replyAuthor,
        body: replyBody,
        parentId: idStr,
      });
      try {
        appendCommentToFile(BASE, commentedDocPath, {
          id: reply.id,
          author: reply.author,
          createdAt: reply.createdAt,
          body: reply.body,
          parentId: reply.parentId,
        });
      } catch {
        // file mirror is best-effort for the agent lane
      }
    }

    let updated = null;
    if (typeof resolved === "boolean") {
      updated = await updateComment(idStr, slugStr, commentedDocPath, {
        resolved,
        resolvedAt: resolved ? new Date() : null,
        resolvedBy: resolved ? replyAuthor : null,
      });
      if (!updated) {
        return res.status(404).json({ error: "Comment not found" });
      }
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
      } catch {
        // file mirror is best-effort for the agent lane
      }
    }

    return res.status(200).json({
      ok: true,
      id: idStr,
      resolved: updated ? updated.resolved : undefined,
      replyId: reply ? reply.id : undefined,
    });
  } catch (e) {
    if (e instanceof CommentValidationError) {
      return res.status(400).json({ error: e.message });
    }
    throw e;
  }
}

export default withErrorHandler(handler);
