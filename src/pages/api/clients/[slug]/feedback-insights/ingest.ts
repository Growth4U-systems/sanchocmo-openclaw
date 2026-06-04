/**
 * POST /api/clients/:slug/feedback-insights/ingest — Sansón posts categorized
 * feedback insights here. Service auth (SANCHO_INTERNAL_API_TOKEN), not a session.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withErrorHandler } from "@/lib/api-middleware";
import { requireInternalAuth } from "@/lib/sancho-internal-api";
import { addMessage } from "@/lib/data/mc-chat";
import { feedbackThreadId } from "@/lib/data/feedback-triage-trigger";
import {
  FeedbackInsightValidationError,
  insertInsights,
  validateIngestPayload,
} from "@/lib/feedback-insights";
import { buildFeedbackCardMessage, summarizeInsightCounts } from "@/lib/feedback-card";

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

    // Option C — chat-first awareness: post a summary card to the feedback
    // thread (per-category counts + deep-link to the Mejoras panel).
    // Best-effort: never fail ingest because the chat card couldn't post.
    try {
      const counts = summarizeInsightCounts(payload.insights);
      const base = process.env.NEXTAUTH_URL ?? "";
      const reviewUrl = base ? `${base}/dashboard/${slugStr}/intelligence#mejoras` : "";
      const card = buildFeedbackCardMessage(payload.docPath, counts, reviewUrl);
      addMessage(feedbackThreadId(slugStr, payload.docPath), "system", card);
    } catch {
      // chat card is non-critical to the ingest
    }

    return res.status(200).json({ ok: true, runId: payload.runId, count: rows.length });
  } catch (e) {
    if (e instanceof FeedbackInsightValidationError) {
      return res.status(400).json({ error: e.message });
    }
    throw e;
  }
}

export default compose(withErrorHandler)(handler);
