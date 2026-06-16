import type { NextApiRequest, NextApiResponse } from "next";
import { compose, getSlug, withErrorHandler, withSlugAuth } from "@/lib/api-middleware";
import { yalcErrorResponse } from "@/lib/yalc/client";
import { creatorReportForSlug, parseReportPeriod } from "@/lib/partnerships/report-service";

/**
 * Reporting por creator (SAN-81) — Metrics · Partnerships.
 *
 *   GET /api/partnerships/report?slug=…[&period=30|90]   (default 90)
 *     → CreatorReport: KPIs agregados del programa + filas por creator
 *       (posts live · clicks · signups · KYC · first_tx · CPA real vs
 *       break-even · ROI · feedback sugerido al quality score).
 *
 * Paridad UI = chat = MCP: este endpoint y la tool MCP `yalc_creator_report`
 * comparten `creatorReportForSlug` (leads de Yalc + performance store +
 * `buildCreatorReport`).
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }
  const slug = getSlug(req);
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  const period = parseReportPeriod(
    Array.isArray(req.query.period) ? req.query.period[0] : req.query.period,
  );

  try {
    const report = await creatorReportForSlug(slug, { periodDays: period });
    return res.status(200).json(report);
  } catch (err) {
    const out = yalcErrorResponse(err);
    return res.status(out.status).json(out.body);
  }
}

export default compose(withErrorHandler, withSlugAuth)(handler);
