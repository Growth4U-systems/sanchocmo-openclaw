/**
 * Trust Score de un cliente dentro de Sancho (SAN-194).
 *
 * Ruta fina sobre src/lib/trust-score/run.ts (SAN-309). Reglas:
 *   - GET (dashboard/portal): solo-lectura de cache, NUNCA corre — withSlugAuth.
 *   - POST (kickoff) / GET ?refresh=1 (cron): corre el modo COMPARE vía
 *     runTrustScore. Es caro (1-4 min, gasta créditos) y muta estado (pin, doc,
 *     métrica) → solo admin.
 * La misma lib la dispara el hook fire-and-forget del kickoff (pillar-status).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withErrorHandler, withMethod, withSlugAuth } from "@/lib/api-middleware";
import { runTrustScore, readTrustScoreCache } from "@/lib/trust-score/run";
import type { CompetitorInput } from "@/lib/trust-score/client";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const slug = (req.query.slug as string) || (req.method === "POST" ? req.body?.slug : null);
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  const refresh = req.query.refresh === "1" || req.body?.refresh === true;
  const queryUrl = (req.query.url as string) || req.body?.url || null;
  // Una corrida es cara (discovery + compare, 1-4 min, gasta créditos). Solo corremos en
  // un kickoff explícito (POST) o un refresh (cron con ?refresh=1). Un GET del dashboard
  // es solo lectura de cache: nunca dispara una corrida.
  const run = req.method === "POST" || refresh;

  // Las corridas (POST kickoff / GET refresh) son caras y mutan estado (pin, doc, métrica):
  // solo admin. El GET de solo-cache sigue con withSlugAuth (sirve al portal del cliente).
  if (run && !req.ctx?.isAdmin) {
    return res.status(403).json({ error: "Admin only para correr el Trust Score" });
  }

  // GET del dashboard: devolver el cache (fresco o viejo) sin correr nada.
  if (!run) {
    return res.status(200).json(readTrustScoreCache(slug) ?? { primary: null });
  }

  const provided: CompetitorInput[] | undefined = Array.isArray(req.body?.competitors)
    ? (req.body.competitors as CompetitorInput[])
    : undefined;

  const outcome = await runTrustScore(slug, { url: queryUrl, competitors: provided, refresh });
  if (!outcome.ok) return res.status(outcome.status).json({ error: outcome.error });
  return res.status(200).json(outcome.cache);
}

export default compose(withErrorHandler, withSlugAuth)(withMethod(["GET", "POST"], handler));
