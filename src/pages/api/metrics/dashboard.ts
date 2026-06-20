import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withErrorHandler, withAuth, canAccessSlug } from "@/lib/api-middleware";
import { getDashboardDefinition, saveDashboardDefinition } from "@/lib/data/metric-dashboard";

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
    const { definition, trigger, changeNote } = (req.body ?? {}) as {
      definition?: unknown; trigger?: unknown; changeNote?: unknown;
    };
    if (definition == null) {
      return res.status(400).json({ error: "Missing definition" });
    }
    try {
      const record = await saveDashboardDefinition(slug, definition, {
        trigger: typeof trigger === "string" ? trigger : "user-drag",
        changeNote: typeof changeNote === "string" ? changeNote : undefined,
      });
      return res.status(200).json(record);
    } catch (err) {
      return res.status(400).json({ error: err instanceof Error ? err.message : "Invalid definition" });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: `Method ${req.method} not allowed` });
}

export default compose(withErrorHandler, withAuth)(handler);
