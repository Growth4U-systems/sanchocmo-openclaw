import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withErrorHandler, withAuth, canAccessSlug } from "@/lib/api-middleware";
import { getDashboardDefinition } from "@/lib/data/metric-dashboard";

/**
 * Read the versioned dashboard DEFINITION for a client (Métricas v2 PR-5a).
 * Thin wrapper over `getDashboardDefinition` — the same data the MCP tool
 * `sancho_get_metrics_dashboard` returns — so the metrics UI renders its tabs,
 * surfaces and North Star from the definition. Degrades to `{ configured: false }`
 * without DATABASE_URL. PR-5b adds POST (save) on the same route.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const slug = req.ctx?.clientSlug || (req.query.slug as string);
  if (!slug) {
    return res.status(400).json({ error: "Missing slug" });
  }
  if (!canAccessSlug(req.ctx, slug)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const record = await getDashboardDefinition(slug);
  return res.status(200).json(record);
}

export default compose(withErrorHandler, withAuth)(handler);
