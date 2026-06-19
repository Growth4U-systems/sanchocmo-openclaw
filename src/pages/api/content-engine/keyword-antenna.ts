/**
 * GET/POST /api/content-engine/keyword-antenna — the keyword-antenna skill's HTTP face (SAN-260).
 *
 * GET  ?slug=X[&pillarId&minPriority&mode&limit] → list enriched seo opportunities
 * POST { slug, action: "score" | "promote", candidates: [...] }
 *   - "score"   → preview only (scored candidates, no write)
 *   - "promote" → score + append enriched seo Ideas to idea-queue
 *
 * Why a dedicated endpoint (not the generic /ideas POST): the generic POST
 * whitelists idea fields and would drop the enriched `seo` block. This routes
 * through the SAME shared data layer (`@/lib/data/keyword-antenna`) the MCP tools
 * use, so the Ideas the skill creates match `sancho_run_keyword_antenna`'s.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import {
  scoreKeyword,
  dedupeCandidates,
  promoteKeywordsToIdeas,
  listKeywordOpportunities,
  type KeywordCandidate,
  type DiscoveryMode,
} from "@/lib/data/keyword-antenna";

export default withErrorHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method === "GET") {
    const slug = String(req.query.slug || "");
    if (!slug) return res.status(400).json({ error: "Missing slug" });
    const ideas = listKeywordOpportunities(slug, {
      pillarId: req.query.pillarId ? String(req.query.pillarId) : undefined,
      minPriority: req.query.minPriority ? Number(req.query.minPriority) : undefined,
      mode: req.query.mode ? (String(req.query.mode) as DiscoveryMode) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    return res.status(200).json({ ok: true, count: ideas.length, ideas });
  }

  if (req.method === "POST") {
    const { slug, action, candidates } = (req.body || {}) as {
      slug?: string;
      action?: string;
      candidates?: KeywordCandidate[];
    };
    if (!slug) return res.status(400).json({ error: "Missing slug" });
    if (!Array.isArray(candidates) || candidates.length === 0) {
      return res.status(400).json({ error: "Missing candidates[]" });
    }
    const scored = dedupeCandidates(candidates).map((c) => scoreKeyword(c));
    if (action === "score") {
      return res.status(200).json({ ok: true, action: "score", scored });
    }
    if (action === "promote") {
      const promote = promoteKeywordsToIdeas(slug, scored);
      return res.status(200).json({ ok: true, action: "promote", ...promote });
    }
    return res.status(400).json({ error: 'action must be "score" or "promote"' });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
});
