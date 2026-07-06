import type { NextApiRequest, NextApiResponse } from "next";
import { compose, getSlug, withErrorHandler, withSlugAuth } from "@/lib/api-middleware";
import { archiveSearch, getSearch } from "@/lib/partnerships";

/**
 * DELETE /api/partnerships/searches/{id}
 *
 * Soft-archives a discovery search. Candidates and campaign history stay
 * available, but Encuentra hides it from the active searches list.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "DELETE") {
    res.setHeader("Allow", "DELETE");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const slug = getSlug(req);
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  const searchId = typeof req.query.id === "string" ? req.query.id.trim() : "";
  if (!searchId) return res.status(400).json({ error: "Missing search id" });

  if (!getSearch(slug, searchId)) {
    return res.status(404).json({ error: `Discovery search not found: ${searchId}` });
  }

  const reason =
    typeof req.body?.reason === "string" && req.body.reason.trim()
      ? req.body.reason.trim()
      : "Archivada desde Encuentra";
  const search = archiveSearch(slug, searchId, reason);

  return res.status(200).json({ ok: true, search });
}

export default compose(withErrorHandler, withSlugAuth)(handler);
