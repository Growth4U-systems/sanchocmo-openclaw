/**
 * Competidores del Trust Score — fijar el set SIN correr el analyzer (SAN-309).
 *
 * POST: fija `metrics/trust-score-competitors.json` con `source:"defined"` (humano).
 *   Lo usa el kickoff para definir los competidores REALES del cliente; la corrida
 *   (auto-arranque tras el company-brief, o el cron) los reutiliza en vez de
 *   auto-descubrir. Barato: no llama al analyzer, no gasta créditos.
 * GET: devuelve el set fijado (inspección).
 *
 * Admin only (igual que correr el Trust Score): muta estado del cliente.
 * Body POST: { slug, competitors: [{ url, name? }] }.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withAuth, withErrorHandler } from "@/lib/api-middleware";
import { pinCompetitors, readPinnedCompetitors } from "@/lib/trust-score/competitors";
import type { CompetitorInput } from "@/lib/trust-score/client";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!req.ctx?.isAdmin) return res.status(403).json({ error: "Admin only" });

  const slug = (req.query.slug as string) || req.body?.slug;
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  if (req.method === "GET") {
    return res.status(200).json(readPinnedCompetitors(slug) ?? { competitors: [], source: null });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const competitors: CompetitorInput[] = Array.isArray(req.body?.competitors)
    ? (req.body.competitors as CompetitorInput[]).filter((c) => c?.url)
    : [];
  if (!competitors.length) {
    return res
      .status(400)
      .json({ error: "Pasá competitors: [{ url, name? }] con al menos un url" });
  }

  const pinned = pinCompetitors(slug, competitors, "defined");
  return res.status(200).json(pinned);
}

export default compose(withErrorHandler, withAuth)(handler);
