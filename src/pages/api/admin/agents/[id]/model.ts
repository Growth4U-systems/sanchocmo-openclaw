import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";
import { getModelCatalog, isModelAvailable, invalidateCatalogCache } from "@/lib/data/models-catalog";
import { getRuntime } from "@/lib/runtime";

interface ModelAssignment {
  primary: string;
  fallbacks: string[];
}

function normalizeFallbacks(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
}

function parseModelAssignment(body: unknown): ModelAssignment | null | "inherit" {
  if (!body || typeof body !== "object") return null;
  const v = body as Record<string, unknown>;
  if (v.model === null) return "inherit";
  const raw = v.model && typeof v.model === "object" ? v.model as Record<string, unknown> : v;
  const primary = typeof raw.primary === "string"
    ? raw.primary
    : typeof v.model === "string"
      ? v.model
      : null;
  if (!primary) return null;
  return {
    primary,
    fallbacks: normalizeFallbacks(raw.fallbacks ?? v.fallbacks),
  };
}

async function validateModels(assignment: ModelAssignment): Promise<string | undefined> {
  const catalog = await getModelCatalog();
  const warnings: string[] = [];
  for (const model of [assignment.primary, ...assignment.fallbacks]) {
    const check = isModelAvailable(catalog, model);
    if (!check.ok) throw new Error(check.reason);
    if (check.warning) warnings.push(check.warning);
  }
  return Array.from(new Set(warnings)).join(" ") || undefined;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "PATCH" && req.method !== "PUT" && req.method !== "POST") {
    res.setHeader("Allow", "PATCH, PUT, POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }
  if (!req.ctx?.isAdmin) return res.status(403).json({ error: "Admin only" });

  const agentId = req.query.id as string;
  if (!agentId) return res.status(400).json({ error: "Missing agent id" });

  const parsed = parseModelAssignment(req.body);
  if (!parsed) {
    return res.status(400).json({
      error: "'model' must be a string, { primary, fallbacks }, or null (null = inherit default)",
    });
  }

  let warning: string | undefined;
  if (parsed !== "inherit") {
    try {
      warning = await validateModels(parsed);
    } catch (e) {
      return res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    }
  }

  try {
    const model = parsed === "inherit" ? null : parsed;
    const result = await getRuntime().control.setAgentModel(agentId, model);
    const effectiveModel = await getRuntime().control.getAgentEffectiveModel(agentId);
    const effectiveAssignment = await getRuntime().control.getAgentModelAssignment(agentId);
    const verified = model === null
      ? effectiveAssignment === null
      : effectiveAssignment?.primary === model.primary &&
        JSON.stringify(effectiveAssignment.fallbacks) === JSON.stringify(model.fallbacks);
    if (!verified) {
      return res.status(409).json({
        error:
          model === null
            ? `OpenClaw did not clear the model override for agent "${agentId}". Effective model is "${effectiveModel ?? "inherit"}".`
            : `OpenClaw did not apply model "${model.primary}" to agent "${agentId}". Effective model is "${effectiveModel ?? "inherit"}".`,
        agentId,
        model,
        fallbacks: model?.fallbacks ?? [],
        effectiveModel,
        effectiveFallbacks: effectiveAssignment?.fallbacks ?? [],
        verified: false,
      });
    }
    const restart = await getRuntime().lifecycle.restart() as {
      ok: boolean;
      method?: string;
      error?: string;
    };
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
      model: model?.primary ?? null,
      fallbacks: model?.fallbacks ?? [],
      effectiveModel,
      effectiveFallbacks: effectiveAssignment?.fallbacks ?? [],
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
