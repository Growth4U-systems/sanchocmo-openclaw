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

function parseModelAssignment(body: unknown): ModelAssignment | null {
  if (!body || typeof body !== "object") return null;
  const v = body as Record<string, unknown>;
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
  if (req.method === "GET") {
    if (!req.ctx?.isAdmin) return res.status(403).json({ error: "Admin only" });
    const assignment = await getRuntime().control.getDefaultModelAssignment();
    return res.status(200).json({
      ok: true,
      model: assignment?.primary ?? null,
      fallbacks: assignment?.fallbacks ?? [],
      assignment,
    });
  }
  if (req.method !== "PATCH" && req.method !== "PUT" && req.method !== "POST") {
    res.setHeader("Allow", "GET, PATCH, PUT, POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }
  if (!req.ctx?.isAdmin) return res.status(403).json({ error: "Admin only" });

  const assignment = parseModelAssignment(req.body);
  if (!assignment) {
    return res.status(400).json({ error: "Missing or invalid model assignment in body" });
  }

  let validationWarning: string | undefined;
  try {
    validationWarning = await validateModels(assignment);
  } catch (e) {
    return res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
  }

  try {
    await getRuntime().control.setDefaultModelAssignment(assignment);
    const restart = await getRuntime().lifecycle.restart() as {
      ok: boolean;
      method?: string;
      error?: string;
    };
    invalidateCatalogCache();
    const responseWarning = [
      validationWarning,
      restart.ok
        ? null
        : `Modelo guardado, pero no se pudo reiniciar el gateway (${restart.error || "timeout"}). Puede requerir restart/deploy para aplicarse al runtime.`,
    ].filter(Boolean).join(" ");
    return res.status(200).json({
      ok: true,
      model: assignment.primary,
      fallbacks: assignment.fallbacks,
      assignment,
      restarted: restart.ok,
      restartMethod: restart.method,
      warning: responseWarning || undefined,
    });
  } catch (e) {
    return res.status(500).json({
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

export default compose(withErrorHandler, withAuth)(handler);
