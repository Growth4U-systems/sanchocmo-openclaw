import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withErrorHandler, withAuth, canAccessSlug } from "@/lib/api-middleware";
import { revertDashboardDefinition } from "@/lib/data/metric-dashboard";

/**
 * Revert the dashboard definition to a prior version (Métricas v2 PR-5b).
 * Append-only: `revertDashboardDefinition` copies the target snapshot into a NEW
 * version (trigger "revert"), so history is never destroyed and the change is
 * auditable. Mirrors the MCP tool `sancho_revert_metrics_dashboard`.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const slug = req.ctx?.clientSlug || (req.query.slug as string);
  if (!slug) {
    return res.status(400).json({ error: "Missing slug" });
  }
  if (!canAccessSlug(req.ctx, slug)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const toVersion = Number((req.body ?? {}).toVersion);
  if (!Number.isInteger(toVersion)) {
    return res.status(400).json({ error: "Missing or invalid toVersion" });
  }

  try {
    const changeNote = typeof (req.body ?? {}).changeNote === "string" ? (req.body as { changeNote: string }).changeNote : undefined;
    const record = await revertDashboardDefinition(slug, toVersion, { changeNote });
    return res.status(200).json(record);
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : "Revert failed" });
  }
}

export default compose(withErrorHandler, withAuth)(handler);
