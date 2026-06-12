import type { NextApiRequest, NextApiResponse } from "next";
import { compose, getSlug, withErrorHandler, withSlugAuth } from "@/lib/api-middleware";
import { yalcErrorResponse } from "@/lib/yalc/client";
import { getSearch, runDiscoverySearch } from "@/lib/partnerships";

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
 *   → { ok, search, stats, leads, dropped }
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
  if (!getSearch(slug, searchId)) {
    return res.status(404).json({ error: `Discovery search not found: ${searchId}` });
  }

  const body = (req.body || {}) as { candidates?: unknown; fixtures?: unknown };
  try {
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
    if (err instanceof Error && /No candidates provided/i.test(err.message)) {
      return res.status(400).json({ error: err.message });
    }
    const out = yalcErrorResponse(err);
    return res.status(out.status).json(out.body);
  }
}

export default compose(withErrorHandler, withSlugAuth)(handler);
