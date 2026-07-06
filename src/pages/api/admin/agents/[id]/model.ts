import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";
import { getModelCatalog, isModelAvailable, invalidateCatalogCache } from "@/lib/data/models-catalog";
import { getRuntime } from "@/lib/runtime";

interface RestartResult {
  ok?: boolean;
  method?: string;
  error?: string;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "PATCH" && req.method !== "PUT" && req.method !== "POST") {
    res.setHeader("Allow", "PATCH, PUT, POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }
  if (!req.ctx?.isAdmin) return res.status(403).json({ error: "Admin only" });

  const runtime = getRuntime();
  if (!runtime.capabilities.modelPicker || !runtime.capabilities.agentRegistry) {
    return res.status(501).json({
      error: `Runtime "${runtime.id}" does not support per-agent model selection through Sancho yet.`,
      runtime: runtime.id,
      capability: "modelPicker",
    });
  }

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
    const result = await runtime.control.setAgentModel(agentId, model ?? null);
    const effectiveModel = await runtime.control.getAgentEffectiveModel(agentId);
    const verified = model === null ? effectiveModel === null : effectiveModel === model;
    if (!verified) {
      return res.status(409).json({
        error:
          model === null
            ? `Runtime "${runtime.id}" did not clear the model override for agent "${agentId}". Effective model is "${effectiveModel ?? "inherit"}".`
            : `Runtime "${runtime.id}" did not apply model "${model}" to agent "${agentId}". Effective model is "${effectiveModel ?? "inherit"}".`,
        agentId,
        model,
        effectiveModel,
        verified: false,
      });
    }
    const restart = (await runtime.lifecycle.restart()) as RestartResult;
    invalidateCatalogCache();
    const responseWarning = [
      warning,
      restart.ok
        ? null
        : `Modelo guardado, pero no se pudo reiniciar el gateway (${restart.error || "timeout"}). Puede requerir restart/deploy para aplicarse al runtime.`,
    ].filter(Boolean).join(" ");
    return res.status(200).json({
      ok: true,
      agentId,
      model,
      effectiveModel,
      updated: result.updated,
      verified,
      restarted: restart.ok,
      restartMethod: restart.method,
      warning: responseWarning || undefined,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("not in agents.list")) {
      return res.status(404).json({ error: msg });
    }
    return res.status(500).json({ error: msg });
  }
}

export default compose(withErrorHandler, withAuth)(handler);
