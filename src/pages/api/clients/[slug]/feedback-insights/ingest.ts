/**
 * POST /api/clients/:slug/feedback-insights/ingest — Sansón posts categorized
 * feedback insights here. Service auth (SANCHO_INTERNAL_API_TOKEN), not a session.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withErrorHandler } from "@/lib/api-middleware";
import { requireInternalAuth } from "@/lib/sancho-internal-api";
import {
  FeedbackInsightValidationError,
  insertInsights,
  validateIngestPayload,
} from "@/lib/feedback-insights";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }
  if (!requireInternalAuth(req, res)) return;

  const { slug } = req.query;
  const slugStr = Array.isArray(slug) ? slug[0] : slug;
  if (!slugStr) return res.status(400).json({ error: "Missing slug" });

  try {
    const payload = validateIngestPayload(slugStr, req.body);
    const rows = await insertInsights(payload);
    return res.status(200).json({ ok: true, runId: payload.runId, count: rows.length });
  } catch (e) {
    if (e instanceof FeedbackInsightValidationError) {
      return res.status(400).json({ error: e.message });
    }
    throw e;
  }
}

export default compose(withErrorHandler)(handler);
