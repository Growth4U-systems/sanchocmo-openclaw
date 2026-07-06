import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";
import { getModelCatalog, isModelAvailable, invalidateCatalogCache } from "@/lib/data/models-catalog";
import { getRuntime } from "@/lib/runtime";

interface RestartResult {
  ok?: boolean;
  method?: string;
  error?: string;
}

function unsupportedRuntime(res: NextApiResponse, runtimeId: string) {
  return res.status(501).json({
    error: `Runtime "${runtimeId}" does not support model selection through Sancho yet.`,
    runtime: runtimeId,
    capability: "modelPicker",
  });
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const runtime = getRuntime();
  if (req.method === "GET") {
    if (!req.ctx?.isAdmin) return res.status(403).json({ error: "Admin only" });
    if (!runtime.capabilities.modelPicker) return unsupportedRuntime(res, runtime.id);
    return res.status(200).json({ ok: true, model: await runtime.control.getDefaultModel() });
  }
  if (req.method !== "PATCH" && req.method !== "PUT" && req.method !== "POST") {
    res.setHeader("Allow", "GET, PATCH, PUT, POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }
  if (!req.ctx?.isAdmin) return res.status(403).json({ error: "Admin only" });
  if (!runtime.capabilities.modelPicker) return unsupportedRuntime(res, runtime.id);

  const { model } = (req.body || {}) as { model?: string };
  if (!model || typeof model !== "string") {
    return res.status(400).json({ error: "Missing or invalid 'model' in body" });
  }

  const catalog = await getModelCatalog();
  const check = isModelAvailable(catalog, model);
  if (!check.ok) {
    return res.status(400).json({ error: check.reason });
  }

  try {
    await runtime.control.ensureModelInAllowlist(model);
    await runtime.control.setDefaultModel(model);
    const restart = (await runtime.lifecycle.restart()) as RestartResult;
    invalidateCatalogCache();
    const warning = [
      check.warning,
      restart.ok
        ? null
        : `Modelo guardado, pero no se pudo reiniciar el gateway (${restart.error || "timeout"}). Puede requerir restart/deploy para aplicarse al runtime.`,
    ].filter(Boolean).join(" ");
    return res.status(200).json({
      ok: true,
      model,
      restarted: restart.ok,
      restartMethod: restart.method,
      warning: warning || undefined,
    });
  } catch (e) {
    return res.status(500).json({
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

export default compose(withErrorHandler, withAuth)(handler);
