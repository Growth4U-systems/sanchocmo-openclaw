import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withAuth, withErrorHandler } from "@/lib/api-middleware";
import { archiveTask } from "@/lib/data/tasks";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }
  const slug = (req.query.slug || req.body?.slug || req.ctx?.clientSlug) as string;
  const id = req.query.id as string;
  if (!slug || !id) return res.status(400).json({ error: "Missing slug or id" });
  if (req.ctx?.clientSlug && req.ctx.clientSlug !== slug) return res.status(403).json({ error: "Forbidden" });
  const task = await archiveTask(slug, id, req.body?.reason);
  return res.status(200).json({ ok: true, task });
}

export default compose(withErrorHandler, withAuth)(handler);
