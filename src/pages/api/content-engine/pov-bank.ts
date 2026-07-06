/**
 * /api/content-engine/pov-bank
 *
 * Neon-backed POV Bank endpoint. JSON files are not the source of truth.
 * Add `?bootstrap=true` only for the explicit one-time import from legacy
 * `brand/{slug}/content/pov-bank.json`. Normal reads never consult JSON.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import {
  loadPovBankFromNeon,
  reconcileClarifyToPovBank,
  reconcileMeetingsToPovBank,
  savePovBankToNeon,
} from "@/lib/data/pov-bank";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const slug = (req.query.slug || req.body?.slug) as string;
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  if (req.method === "GET") {
    const result = await loadPovBankFromNeon(slug, {
      bootstrapFromLegacyJson: req.query.bootstrap === "true",
    });
    return res.status(result.configured ? 200 : 503).json({
      ok: result.configured,
      provider: "neon",
      configured: result.configured,
      seededFromLegacyJson: result.seededFromLegacyJson,
      povBank: result.povBank,
      error: result.error || null,
    });
  }

  if (req.method === "PUT") {
    const data = req.body?.povBank || req.body?.data;
    if (!data) return res.status(400).json({ error: "Missing povBank" });
    const saved = await savePovBankToNeon(slug, data, {
      trigger: req.body?.trigger || "api-put",
      changeNote: req.body?.changeNote || data._change_note || "Actualización vía API",
    });
    return res.status(200).json({ ok: true, provider: "neon", povBank: saved });
  }

  if (req.method === "POST") {
    const requested = req.body?.source || req.body?.sources || "all";
    const sources = Array.isArray(requested)
      ? requested
      : String(requested).split(",").map((source) => source.trim()).filter(Boolean);
    const runClarify = sources.includes("all") || sources.includes("clarify");
    const runMeetings = sources.includes("all") || sources.includes("meetings");
    const results = [];
    if (runClarify) results.push(await reconcileClarifyToPovBank(slug, { ideaId: req.body?.ideaId }));
    if (runMeetings) results.push(await reconcileMeetingsToPovBank(slug));
    const latest = await loadPovBankFromNeon(slug);
    return res.status(latest.configured ? 200 : 503).json({
      ok: latest.configured,
      provider: "neon",
      results,
      povBank: latest.povBank,
      error: latest.error || null,
    });
  }

  res.setHeader("Allow", "GET, PUT, POST");
  return res.status(405).json({ error: "Method not allowed" });
}

export default withErrorHandler(handler);
