import type { NextApiRequest, NextApiResponse } from "next";
import { compose, getSlug, withErrorHandler, withSlugAuth } from "@/lib/api-middleware";
import { yalcErrorResponse } from "@/lib/yalc/client";
import {
  createDiscoverySearch,
  DiscoveryPlanError,
  listSearches,
  runDiscoverySearch,
  triggerDiscoveryRunner,
} from "@/lib/partnerships";

/**
 * Búsquedas de discovery (Partnerships · tab Encuentra) — SAN-79.
 *
 *   GET  /api/partnerships/searches?slug=…[&status=queued]
 *     → { searches, count } (estado del runner incluido — lo consume la UI
 *       de Encuentra y el agente runner para encontrar trabajo encolado).
 *
 *   POST /api/partnerships/searches  { slug, plan, run?, threadId? }
 *     Crea la búsqueda (campaign type=Partnerships en Yalc + tarea Outreach
 *     madre) y, POR DEFECTO, despacha a Rocinante para ejecutar el discovery
 *     REAL (scraping). `plan` = JSON de discovery-plan-builder. `run`:
 *       - ausente / "agent" → despacha el runner a Rocinante (discovery real).
 *       - "fixtures" (o true) → runner inline con los 9 creators fake (verifier).
 *       - "none" / false      → solo crea, runner queued (sin despachar).
 *     → { ok, search, campaignId, taskId[, runner] }
 *
 * Paridad UI = chat = MCP: la skill llama a este endpoint; la tool MCP
 * `yalc_create_search` comparte `createDiscoverySearch`/`runDiscoverySearch`.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  const slug = getSlug(req);
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  if (req.method === "GET") {
    const statusFilter = typeof req.query.status === "string" ? req.query.status.trim() : "";
    const searches = listSearches(slug).filter(
      (search) => !statusFilter || search.runner.status === statusFilter,
    );
    return res.status(200).json({ searches, count: searches.length });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const body = (req.body || {}) as { plan?: unknown; run?: unknown };
  try {
    const created = await createDiscoverySearch({ slug, plan: body.plan });

    if (body.run === "fixtures" || body.run === true) {
      const run = await runDiscoverySearch({ slug, searchId: created.search.id, fixtures: true });
      return res.status(201).json({
        ok: true,
        search: run.search,
        campaignId: created.campaignId,
        taskId: created.taskId,
        runner: { mode: "fixtures", stats: run.stats },
      });
    }

    // run:"none"/false → solo crea, runner queued (sin despachar) — opt-out.
    if (body.run === "none" || body.run === false) {
      return res.status(201).json({
        ok: true,
        search: created.search,
        campaignId: created.campaignId,
        taskId: created.taskId,
      });
    }

    // Por defecto (ausente o run:"agent"): despacha a Rocinante para el discovery
    // REAL. Best-effort — si el gateway está caído, la búsqueda sigue queued
    // (recuperable a mano); NO fallamos la creación.
    const dispatch = await triggerDiscoveryRunner({
      slug,
      searchId: created.search.id,
      title: created.search.title,
    });
    return res.status(201).json({
      ok: true,
      search: created.search,
      campaignId: created.campaignId,
      taskId: created.taskId,
      runner: {
        mode: "agent",
        dispatched: dispatch.forwardedToGateway,
        threadId: dispatch.threadId,
        error: dispatch.error,
      },
    });
  } catch (err) {
    if (err instanceof DiscoveryPlanError) {
      return res.status(400).json({ error: err.message });
    }
    const out = yalcErrorResponse(err);
    return res.status(out.status).json(out.body);
  }
}

export default compose(withErrorHandler, withSlugAuth)(handler);
