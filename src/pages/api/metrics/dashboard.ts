import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withErrorHandler, withAuth, canAccessSlug } from "@/lib/api-middleware";
import { getDashboardDefinition, saveDashboardDefinition } from "@/lib/data/metric-dashboard";
import type { SurfaceKey } from "@/lib/metrics/surfaces";

/**
 * The versioned dashboard DEFINITION for a client (Métricas v2 PR-5a/PR-5b).
 * - GET  → `getDashboardDefinition` (definition + versions), same data the MCP
 *          tool `sancho_get_metrics_dashboard` returns.
 * - POST → `saveDashboardDefinition` (validates via Zod, bumps version) for UI
 *          edits like the server-side drag-and-drop order. Conexiones/credentials
 *          are NOT touched here — they stay in the settings APIs panel.
 * Degrades to `{ configured: false }` without DATABASE_URL.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  const slug = req.ctx?.clientSlug || (req.query.slug as string);
  if (!slug) {
    return res.status(400).json({ error: "Missing slug" });
  }
  if (!canAccessSlug(req.ctx, slug)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  if (req.method === "GET") {
    return res.status(200).json(await getDashboardDefinition(slug));
  }

  if (req.method === "POST") {
    const body = (req.body ?? {}) as { definition?: unknown; surfacesOrder?: unknown; trigger?: unknown; changeNote?: unknown };
    const trigger = typeof body.trigger === "string" ? body.trigger : "user-drag";
    const changeNote = typeof body.changeNote === "string" ? body.changeNote : undefined;

    // Targeted surface reorder: apply onto the LATEST definition server-side so a
    // stale client (e.g. an intervening Merlin/chat edit, or an in-flight earlier
    // drag) can't clobber other changes by replacing the whole definition.
    if (Array.isArray(body.surfacesOrder)) {
      const keys = body.surfacesOrder.filter((k): k is string => typeof k === "string");
      try {
        const current = await getDashboardDefinition(slug);
        if (!current.configured || !current.definition) {
          return res.status(200).json(current); // no DB → nothing to persist
        }
        const def = current.definition;
        const prev = new Map((def.surfaces || []).map((r) => [r.surface, r]));
        const reordered = keys
          .filter((k) => prev.has(k as SurfaceKey))
          .map((k, i) => ({ surface: k as SurfaceKey, visible: prev.get(k as SurfaceKey)?.visible ?? true, order: i }));
        const extra = (def.surfaces || [])
          .filter((r) => !keys.includes(r.surface))
          .map((r, i) => ({ ...r, order: reordered.length + i }));
        const record = await saveDashboardDefinition(slug, { ...def, surfaces: [...reordered, ...extra] }, { trigger, changeNote });
        return res.status(200).json(record);
      } catch (err) {
        return res.status(400).json({ error: err instanceof Error ? err.message : "Reorder failed" });
      }
    }

    if (body.definition == null) {
      return res.status(400).json({ error: "Missing definition or surfacesOrder" });
    }
    try {
      const record = await saveDashboardDefinition(slug, body.definition, { trigger, changeNote });
      return res.status(200).json(record);
    } catch (err) {
      return res.status(400).json({ error: err instanceof Error ? err.message : "Invalid definition" });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: `Method ${req.method} not allowed` });
}

export default compose(withErrorHandler, withAuth)(handler);
