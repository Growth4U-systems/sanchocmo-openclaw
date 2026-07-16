import type { NextApiRequest, NextApiResponse } from "next";
import {
  compose,
  getSlug,
  withErrorHandler,
  withSlugAuth,
} from "@/lib/api-middleware";
import { yalcErrorResponse } from "@/lib/yalc/client";
import {
  enqueueDiscoverySearchRun,
  DiscoveryRetryConflictError,
  DiscoveryStoreValidationError,
  getSearch,
  isValidDiscoverySearchId,
  requestDiscoverySearchRun,
  runDiscoverySearch,
} from "@/lib/partnerships";
import { observeDiscoveryExecutionEvent } from "@/lib/partnerships/discovery-execution-observer";
import {
  DiscoveryDurableAuthorityError,
  isDiscoveryLedgerAuthoritative,
  resolveDiscoveryExecutionPolicy,
} from "@/lib/partnerships/discovery-execution-policy";

/**
 * POST /api/partnerships/searches/{id}/run — ejecutar el runner (SAN-79).
 *
 * Camino determinista de ingestión compartido por los dos modos:
 *  - Agentic (real): la skill `discovery-search-runner` scrapea con
 *    mcp__scrapecreators__* según el plan y POSTea aquí
 *    `{ slug, candidates: [...] }` (contrato RawDiscoveryCandidate, alias
 *    tolerados). Este endpoint normaliza, puntúa con calc-creator-core
 *    (qualify-enrich) e inserta en la campaign de Yalc, donde
 *    `resolveEntryStatus` decide Sourced/Disqualified según el
 *    qualification_mode de la campaign.
 *  - Fixtures: `{ slug, fixtures: true }` usa los 9 creators fake del mockup
 *    sin llamar a ScrapeCreators (tests + verificador).
 *
 * Si el body trae `{ async: true }` sin `candidates`, encola el runner
 * server-side y responde 202 inmediatamente. Con `candidates` se conserva el
 * camino inline para el agente que ya scrapeó y solo necesita ingestar.
 *
 *   → { ok, search, stats, leads, dropped } | 202 { ok, search, runner }
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }
  const slug = getSlug(req);
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  const searchId = typeof req.query.id === "string" ? req.query.id.trim() : "";
  if (!searchId) return res.status(400).json({ error: "Missing search id" });
  if (!isValidDiscoverySearchId(searchId)) {
    return res.status(400).json({
      error: "Invalid discovery search id",
      code: "DISCOVERY_SEARCH_ID_INVALID",
    });
  }
  let existing;
  try {
    existing = getSearch(slug, searchId);
  } catch (error) {
    if (error instanceof DiscoveryStoreValidationError) {
      return res.status(409).json({
        error: "Discovery search receipt identity is invalid",
        code: "DISCOVERY_SEARCH_RECEIPT_INVALID",
      });
    }
    throw error;
  }
  if (!existing) {
    return res
      .status(404)
      .json({ error: `Discovery search not found: ${searchId}` });
  }
  if (existing.archivedAt) {
    return res.status(409).json({ error: "Esta búsqueda está archivada." });
  }

  const body = (req.body || {}) as {
    async?: unknown;
    candidates?: unknown;
    fixtures?: unknown;
  };
  try {
    const executionPolicy = resolveDiscoveryExecutionPolicy(slug);
    if (
      isDiscoveryLedgerAuthoritative(existing) ||
      (executionPolicy.enabled && executionPolicy.mode === "canary")
    ) {
      if (existing.executionIntent === "none") {
        return res.status(409).json({
          error:
            "Esta búsqueda fue creada como solo borrador; crea un nuevo comando confirmado para ejecutarla.",
          code: "DISCOVERY_CANARY_DEFERRED",
        });
      }
      if (body.candidates !== undefined) {
        return res.status(409).json({
          error:
            "El piloto durable no acepta callbacks inline de candidatos; crea una búsqueda Instagram server-side.",
          code: "DISCOVERY_CANARY_INLINE_DISABLED",
        });
      }
      if (body.fixtures === true && existing.executionIntent !== "fixtures") {
        return res.status(409).json({
          error:
            "El modo fixtures debe quedar fijado al crear el comando durable.",
          code: "DISCOVERY_CANARY_INTENT_CONFLICT",
        });
      }
      const search = await requestDiscoverySearchRun({
        slug,
        searchId,
        fixtures: existing.executionIntent === "fixtures",
      });
      return res.status(search.runner.status === "done" ? 200 : 202).json({
        ok: true,
        search,
        runner: {
          async: true,
          mode: "durable",
          jobId: search.runner.jobId,
          status: search.runner.status,
        },
      });
    }

    if (body.async === true && body.candidates === undefined) {
      const search = enqueueDiscoverySearchRun({
        slug,
        searchId,
        fixtures: body.fixtures === true,
      });
      await observeDiscoveryExecutionEvent(search, "execution.enqueued", {
        route: "retry_api",
        runnerMode: search.runner.mode,
        jobId: search.runner.jobId,
      });
      return res.status(202).json({
        ok: true,
        search,
        runner: {
          async: true,
          jobId: search.runner.jobId,
          status: search.runner.status,
          mode: search.runner.mode,
        },
      });
    }

    const result = await runDiscoverySearch({
      slug,
      searchId,
      candidates: body.candidates,
      fixtures: body.fixtures === true,
    });
    return res.status(200).json({
      ok: true,
      search: result.search,
      stats: result.stats,
      leads: result.inserted,
      dropped: result.dropped,
    });
  } catch (err) {
    if (err instanceof DiscoveryRetryConflictError) {
      return res
        .status(err.status)
        .json({ error: err.message, code: err.code });
    }
    if (err instanceof DiscoveryDurableAuthorityError) {
      return res
        .status(err.status)
        .json({ error: err.message, code: err.code });
    }
    if (err instanceof Error && /No candidates provided/i.test(err.message)) {
      return res.status(400).json({ error: err.message });
    }
    const out = yalcErrorResponse(err);
    return res.status(out.status).json(out.body);
  }
}

export default compose(withErrorHandler, withSlugAuth)(handler);
