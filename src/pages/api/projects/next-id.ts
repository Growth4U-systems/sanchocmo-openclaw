import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { compose, withErrorHandler, withAuth, canAccessSlug } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";

/**
 * GET /api/projects/next-id?slug=X — Compute next project ID by scanning P{XX} directories.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const slug = (req.query.slug as string) || req.ctx?.clientSlug;
  if (!slug) {
    return res.status(400).json({ error: "Missing slug" });
  }

  if (!canAccessSlug(req.ctx, slug)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const projectsDir = path.join(BASE, "brand", slug, "projects");
  let maxId = 0;
  try {
    const dirs = fs.readdirSync(projectsDir, { withFileTypes: true });
    for (const d of dirs) {
      const match = d.name.match(/^P(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxId) maxId = num;
      }
    }
  } catch {}

  const nextId = maxId + 1;
  return res.status(200).json({
    ok: true,
    slug,
    next_id: nextId,
    next_project: `P${String(nextId).padStart(2, "0")}`,
  });
}

export default compose(withErrorHandler, withAuth)(handler);
