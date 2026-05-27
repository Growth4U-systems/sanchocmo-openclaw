import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";
import { getModelCatalog, isModelAvailable, invalidateCatalogCache } from "@/lib/data/models-catalog";
import { ensureModelInAllowlist, setAgentModel } from "@/lib/data/openclaw-config";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "PATCH" && req.method !== "PUT" && req.method !== "POST") {
    res.setHeader("Allow", "PATCH, PUT, POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }
  if (!req.ctx?.isAdmin) return res.status(403).json({ error: "Admin only" });

  const agentId = req.query.id as string;
  if (!agentId) return res.status(400).json({ error: "Missing agent id" });

  const body = (req.body || {}) as { model?: string | null };
  const model = body.model;

  if (model !== null && typeof model !== "string") {
    return res.status(400).json({
      error: "'model' must be a string or null (null = inherit default)",
    });
  }

  let warning: string | undefined;
  if (typeof model === "string") {
    const catalog = await getModelCatalog();
    const check = isModelAvailable(catalog, model);
    if (!check.ok) return res.status(400).json({ error: check.reason });
    warning = check.warning;
  }

  try {
    if (typeof model === "string") {
      ensureModelInAllowlist(model);
    }
    setAgentModel(agentId, model ?? null);
    invalidateCatalogCache();
    return res.status(200).json({ ok: true, agentId, model, warning });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("not in agents.list")) {
      return res.status(404).json({ error: msg });
    }
    return res.status(500).json({ error: msg });
  }
}

export default compose(withErrorHandler, withAuth)(handler);
