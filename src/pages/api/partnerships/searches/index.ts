import type { NextApiRequest, NextApiResponse } from "next";
import {
  compose,
  getSlug,
  withErrorHandler,
  withSlugAuth,
} from "@/lib/api-middleware";
import { yalcErrorResponse } from "@/lib/yalc/client";
import {
  createDiscoverySearch,
  DiscoveryPlanError,
  enqueueDiscoverySearchRun,
  listSearches,
  resumeQueuedDiscoverySearches,
  runDiscoverySearch,
  supportsLiveDiscovery,
  triggerDiscoveryRunner,
  updateRunnerState,
} from "@/lib/partnerships";
import {
  observeDiscoveryExecutionDispatch,
  observeDiscoveryExecutionEvent,
} from "@/lib/partnerships/discovery-execution-observer";

/**
 * Búsquedas de discovery (Partnerships · tab Encuentra) — SAN-79.
 *
 *   GET  /api/partnerships/searches?slug=…[&status=queued][&includeArchived=1]
 *     → { searches, count } (estado del runner incluido — lo consume la UI
 *       de Encuentra y el agente runner para encontrar trabajo encolado).
 *
 *   POST /api/partnerships/searches  { slug, plan, run?, threadId? }
 *     Crea la búsqueda (campaign type=Partnerships en Yalc + tarea Outreach
 *     madre) y ejecuta discovery sin bloquear el request. `run`:
 *       - ausente / "live" → job server-side para un plan solo Instagram.
 *       - "agent" o redes TikTok/YouTube → despacha el runner a Rocinante.
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
    const resumed = await resumeQueuedDiscoverySearches(slug);
    const statusFilter =
      typeof req.query.status === "string" ? req.query.status.trim() : "";
    const includeArchived =
      req.query.includeArchived === "1" || req.query.includeArchived === "true";
    const archivedOnly =
      req.query.archived === "1" || req.query.archived === "true";
    const searches = listSearches(slug).filter((search) => {
      const archived = Boolean(search.archivedAt);
      if (archivedOnly && !archived) return false;
      if (!archivedOnly && !includeArchived && archived) return false;
      return !statusFilter || search.runner.status === statusFilter;
    });
    return res.status(200).json({ searches, count: searches.length, resumed });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const body = (req.body || {}) as {
    plan?: unknown;
    run?: unknown;
    threadId?: unknown;
  };
  try {
    const created = await createDiscoverySearch({
      slug,
      plan: body.plan,
      // SAN-328: el hilo MC Chat donde la skill construyó el plan, para que la
      // tarjeta de Encuentra reabra esa misma sesión en vez de un hilo nuevo.
      threadId: typeof body.threadId === "string" ? body.threadId : null,
    });

    if (body.run === "fixtures" || body.run === true) {
      const run = await runDiscoverySearch({
        slug,
        searchId: created.search.id,
        fixtures: true,
      });
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
      await observeDiscoveryExecutionEvent(
        created.search,
        "execution.deferred",
        { route: "none" },
      );
      return res.status(201).json({
        ok: true,
        search: created.search,
        campaignId: created.campaignId,
        taskId: created.taskId,
      });
    }

    const canRunLive = supportsLiveDiscovery(created.search.plan);
    if ((body.run === undefined || body.run === "live") && canRunLive) {
      const search = enqueueDiscoverySearchRun({
        slug,
        searchId: created.search.id,
      });
      await observeDiscoveryExecutionEvent(search, "execution.enqueued", {
        route: "server_live",
        runnerMode: search.runner.mode,
        jobId: search.runner.jobId,
      });
      return res.status(201).json({
        ok: true,
        search,
        campaignId: created.campaignId,
        taskId: created.taskId,
        runner: {
          mode: "live",
          async: true,
          jobId: search.runner.jobId,
          status: search.runner.status,
        },
      });
    }

    // run:"agent" o plan con redes no cubiertas por live: despacha a Rocinante.
    // Best-effort: si el gateway está caído, queda como error recuperable.
    const dispatch = await triggerDiscoveryRunner({
      slug,
      searchId: created.search.id,
      title: created.search.title,
    });
    const search = updateRunnerState(slug, created.search.id, {
      status: dispatch.forwardedToGateway ? "queued" : "error",
      attempts: Math.max(0, created.search.runner.attempts ?? 0) + 1,
      error:
        dispatch.error ||
        (dispatch.forwardedToGateway
          ? null
          : "No se pudo avisar a Rocinante. Reintenta el discovery desde Encuentra."),
    });
    await observeDiscoveryExecutionDispatch(search, {
      route: "agent_legacy",
      forwarded: dispatch.forwardedToGateway,
      error: dispatch.error,
    });
    return res.status(201).json({
      ok: true,
      search,
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
