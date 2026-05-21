import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";
import { getModelCatalog, isModelAvailable, invalidateCatalogCache } from "@/lib/data/models-catalog";
import { ensureModelInAllowlist, setCronModel } from "@/lib/data/openclaw-config";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "PATCH" && req.method !== "PUT" && req.method !== "POST") {
    res.setHeader("Allow", "PATCH, PUT, POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }
  if (!req.ctx?.isAdmin) return res.status(403).json({ error: "Admin only" });

  const cronId = req.query.id as string;
  if (!cronId) return res.status(400).json({ error: "Missing cron id" });

  const { model } = (req.body || {}) as { model?: string };
  if (!model || typeof model !== "string") {
    return res.status(400).json({ error: "Missing or invalid 'model' in body" });
  }

  const catalog = getModelCatalog();
  const check = isModelAvailable(catalog, model);
  if (!check.ok) return res.status(400).json({ error: check.reason });

  try {
    ensureModelInAllowlist(model);
    setCronModel(cronId, model);
    invalidateCatalogCache();
    return res.status(200).json({ ok: true, cronId, model });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ error: msg });
  }
}

export default compose(withErrorHandler, withAuth)(handler);
