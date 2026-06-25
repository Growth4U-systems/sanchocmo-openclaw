import type { NextApiRequest, NextApiResponse } from "next";
import { compose, getSlug, withErrorHandler, withSlugAuth } from "@/lib/api-middleware";
import { yalcErrorResponse } from "@/lib/yalc/client";
import {
  createDiscoverySearch,
  DiscoveryPlanError,
  listSearches,
  runDiscoverySearch,
} from "@/lib/partnerships";

/**
 * Búsquedas de discovery (Partnerships · tab Encuentra) — SAN-79.
 *
 *   GET  /api/partnerships/searches?slug=…[&status=queued]
 *     → { searches, count } (estado del runner incluido — lo consume la UI
 *       de Encuentra y el agente runner para encontrar trabajo encolado).
 *
 *   POST /api/partnerships/searches  { slug, plan, run? }
 *     Crea la búsqueda: campaign type=Partnerships en Yalc + tarea Outreach
 *     madre + runner encolado. `plan` = JSON de discovery-plan-builder
 *     (title/sectors/networks/tiers/audienceEsMinPct/targetVolume/signals/
 *     templates). Con `run: "fixtures"` ejecuta el runner inline con los 9
 *     creators fake del mockup (sin ScrapeCreators) — camino del verificador.
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

  const body = (req.body || {}) as { plan?: unknown; run?: unknown; threadId?: unknown };
  try {
    const created = await createDiscoverySearch({
      slug,
      plan: body.plan,
      // SAN-328: el hilo MC Chat donde la skill construyó el plan, para que la
      // tarjeta de Encuentra reabra esa misma sesión en vez de un hilo nuevo.
      threadId: typeof body.threadId === "string" ? body.threadId : null,
    });

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

    return res.status(201).json({
      ok: true,
      search: created.search,
      campaignId: created.campaignId,
      taskId: created.taskId,
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
