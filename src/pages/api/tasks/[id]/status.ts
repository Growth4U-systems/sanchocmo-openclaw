import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withAuth, withErrorHandler, canAccessSlug } from "@/lib/api-middleware";
import { setTaskStatus } from "@/lib/data/tasks";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }
  const slug = (req.query.slug || req.body?.slug || req.ctx?.clientSlug) as string;
  const id = req.query.id as string;
  const status = req.body?.status as string;
  if (!slug || !id || !status) return res.status(400).json({ error: "Missing slug, id or status" });
  if (!canAccessSlug(req.ctx, slug)) return res.status(403).json({ error: "Forbidden" });
  const result = await setTaskStatus(slug, id, status);
  if (!result.ok) {
    const error = "error" in result ? result.error : "Failed to update task status";
    return res.status(error?.includes("not found") ? 404 : 500).json({ error });
  }
  return res.status(200).json(result);
}

export default compose(withErrorHandler, withAuth)(handler);
