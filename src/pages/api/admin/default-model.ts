import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";
import { getModelCatalog, isModelAvailable, invalidateCatalogCache } from "@/lib/data/models-catalog";
import {
  ensureModelInAllowlist,
  setDefaultPrimaryModel,
  getDefaultPrimaryModel,
} from "@/lib/data/openclaw-config";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    if (!req.ctx?.isAdmin) return res.status(403).json({ error: "Admin only" });
    return res.status(200).json({ ok: true, model: getDefaultPrimaryModel() });
  }
  if (req.method !== "PATCH" && req.method !== "PUT" && req.method !== "POST") {
    res.setHeader("Allow", "GET, PATCH, PUT, POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }
  if (!req.ctx?.isAdmin) return res.status(403).json({ error: "Admin only" });

  const { model } = (req.body || {}) as { model?: string };
  if (!model || typeof model !== "string") {
    return res.status(400).json({ error: "Missing or invalid 'model' in body" });
  }

  const catalog = getModelCatalog();
  const check = isModelAvailable(catalog, model);
  if (!check.ok) {
    return res.status(400).json({ error: check.reason });
  }

  try {
    ensureModelInAllowlist(model);
    setDefaultPrimaryModel(model);
    invalidateCatalogCache();
    return res.status(200).json({ ok: true, model });
  } catch (e) {
    return res.status(500).json({
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

export default compose(withErrorHandler, withAuth)(handler);
