/**
 * GET /api/clients/:slug/comments — Authenticated comments list for a client (SAN-15).
 *
 * Lists all comments on docs of a client, grouped by `docPath`. Used by the
 * Intelligence section of the dashboard to show a "Comentarios recibidos"
 * thread. Includes `email` in the response (unlike the public endpoint) so
 * staff can follow up.
 *
 * Access control mirrors `/api/clients`:
 *   - admin (no ctx limits): all clients
 *   - team member with `allowedSlugs`: only if slug is in list
 *   - portal client with `clientSlug`: only their own slug
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withAuth, withErrorHandler } from "@/lib/api-middleware";
import { type CommentRow, loadDocComments } from "@/lib/comments";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const { slug } = req.query;
  const slugStr = Array.isArray(slug) ? slug[0] : slug;
  if (!slugStr) return res.status(400).json({ error: "Missing slug" });

  const ctx = req.ctx;
  if (ctx?.clientSlug && ctx.clientSlug !== slugStr) {
    return res.status(403).json({ error: "Forbidden" });
  }
  if (ctx?.allowedSlugs && !ctx.allowedSlugs.includes(slugStr)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const rows = await loadDocComments(slugStr);

  const byDoc = new Map<string, ReturnType<typeof toApiShape>[]>();
  for (const r of rows) {
    const list = byDoc.get(r.docPath) ?? [];
    list.push(toApiShape(r));
    byDoc.set(r.docPath, list);
  }

  return res.status(200).json({
    ok: true,
    slug: slugStr,
    total: rows.length,
    documents: Array.from(byDoc.entries()).map(([docPath, comments]) => ({
      docPath,
      count: comments.length,
      comments,
    })),
  });
}

function toApiShape(c: CommentRow) {
  return {
    id: c.id,
    author: c.author,
    email: c.email,
    body: c.body,
    anchorText: c.anchorText,
    anchorContext: c.anchorContext,
    anchorDocOffset: c.anchorDocOffset,
    docVersion: c.docVersion,
    createdAt: c.createdAt.toISOString(),
  };
}

export default compose(withErrorHandler, withAuth)(handler);
