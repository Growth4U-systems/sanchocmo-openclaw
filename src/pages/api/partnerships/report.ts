import type { NextApiRequest, NextApiResponse } from "next";
import { compose, getSlug, withErrorHandler, withSlugAuth } from "@/lib/api-middleware";
import { yalcErrorResponse } from "@/lib/yalc/client";
import { creatorReportForSlug, parseReportPeriod } from "@/lib/partnerships/report-service";

/**
 * Reporting por creator (SAN-81) — Metrics · Partnerships.
 *
 *   GET /api/partnerships/report?slug=…[&period=1|7|30|90]   (default 90)
 *   GET /api/partnerships/report?slug=…&from=YYYY-MM-DD&to=YYYY-MM-DD
 *     `from`/`to` are an exact single UTC day for the metrics collector.
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
  const from = Array.isArray(req.query.from) ? req.query.from[0] : req.query.from;
  const to = Array.isArray(req.query.to) ? req.query.to[0] : req.query.to;
  const hasExactRange = from !== undefined || to !== undefined;
  if (hasExactRange) {
    if (!isIsoDay(from) || !isIsoDay(to) || from !== to) {
      return res.status(400).json({
        error: "from and to must be the same valid YYYY-MM-DD UTC day",
      });
    }
  }

  try {
    const report = await creatorReportForSlug(slug, {
      periodDays: hasExactRange ? 1 : period,
      ...(hasExactRange
        ? {
            exactRange: {
              from: new Date(`${from}T00:00:00.000Z`),
              to: new Date(`${to}T23:59:59.999Z`),
            },
          }
        : {}),
    });
    return res.status(200).json(report);
  } catch (err) {
    const out = yalcErrorResponse(err);
    return res.status(out.status).json(out.body);
  }
}

function isIsoDay(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export default compose(withErrorHandler, withSlugAuth)(handler);
