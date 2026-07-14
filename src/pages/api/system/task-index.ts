/**
 * Backwards-compatible task-index route.
 *
 * New UI consumers use `/api/tasks?view=index`; this wrapper keeps older
 * callers on the same canonical read model and the same access controls.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { canAccessSlug, compose, withAuth, withErrorHandler } from "@/lib/api-middleware";
import { buildTaskIndex } from "@/lib/data/task-index";
import { listUnifiedTaskRowsAsync } from "@/lib/data/tasks";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const slug = (req.query.slug || req.ctx?.clientSlug) as string;
  if (!slug) return res.status(400).json({ error: "Missing slug" });
  if (!canAccessSlug(req.ctx, slug)) return res.status(403).json({ error: "Forbidden" });

  const rows = await listUnifiedTaskRowsAsync(slug);
  const { entries, stats } = buildTaskIndex(slug, rows);
  return res.status(200).json({ ok: true, slug, entries, stats });
}

export default compose(withErrorHandler, withAuth)(handler);
