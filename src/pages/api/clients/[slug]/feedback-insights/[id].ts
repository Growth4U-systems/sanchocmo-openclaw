/**
 * PATCH /api/clients/:slug/feedback-insights/:id — staff accept/dismiss an
 * insight. Accepting routes it (skill→exec-log, client→brand, form→backlog) and
 * marks it `applied`; dismissing marks it `dismissed`.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withAuth, withErrorHandler } from "@/lib/api-middleware";
import { getInsight, updateInsightStatus } from "@/lib/feedback-insights";
import { routeAcceptedInsight } from "@/lib/feedback-routing";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "PATCH") {
    res.setHeader("Allow", "PATCH");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const { slug, id } = req.query;
  const slugStr = Array.isArray(slug) ? slug[0] : slug;
  const idStr = Array.isArray(id) ? id[0] : id;
  if (!slugStr || !idStr) return res.status(400).json({ error: "Missing slug or id" });

  const ctx = req.ctx;
  if (ctx?.clientSlug) return res.status(403).json({ error: "Forbidden" });
  if (ctx?.allowedSlugs && !ctx.allowedSlugs.includes(slugStr)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const action = (req.body?.status as string) ?? "";
  if (action !== "accepted" && action !== "dismissed") {
    return res.status(400).json({ error: "status must be 'accepted' or 'dismissed'" });
  }

  const row = await getInsight(idStr, slugStr);
  if (!row) return res.status(404).json({ error: "Insight not found" });

  if (action === "dismissed") {
    const updated = await updateInsightStatus(idStr, slugStr, "dismissed");
    return res.status(200).json({ ok: true, insight: updated });
  }

  const routedRef = routeAcceptedInsight(row);
  const updated = await updateInsightStatus(idStr, slugStr, "applied", routedRef);
  return res.status(200).json({ ok: true, insight: updated, routedRef });
}

export default compose(withErrorHandler, withAuth)(handler);
