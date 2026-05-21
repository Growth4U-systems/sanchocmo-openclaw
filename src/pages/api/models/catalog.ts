import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";
import { getModelCatalog } from "@/lib/data/models-catalog";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  if (!req.ctx?.isAdmin) {
    return res.status(403).json({ error: "Admin only" });
  }

  const all = req.query.all === "1" || req.query.all === "true";
  const force = req.query.force === "1";
  const catalog = await getModelCatalog({ all, force });
  return res.status(200).json({ ok: true, ...catalog });
}

export default compose(withErrorHandler, withAuth)(handler);
