/**
 * Reporting por creator · orquestación server-side (SAN-81).
 *
 * Una sola función para las tres superficies (paridad UI = chat = MCP):
 * la UI vía GET /api/partnerships/report y la tool MCP `yalc_creator_report`
 * llaman aquí — leads/deals desde Yalc (`yalcFetch`, fuente de verdad del
 * roster) + registros de performance del store local → `buildCreatorReport`.
 */

import { resolveYalcConfig, yalcFetch } from "@/lib/yalc/client";
import { buildCreatorReport } from "./creator-report";
import type { CreatorReport, ReportPeriodDays } from "./creator-report";
import { loadPerformance } from "./performance-store";
import type { PartnershipLead, PartnershipLeadsPayload } from "./types";

export interface CreatorReportServiceOptions {
  periodDays?: ReportPeriodDays;
  now?: Date;
  /** Exact UTC window used by the daily metrics collector. */
  exactRange?: { from: Date; to: Date };
  /** Explicit local/demo override. Production reporting excludes seed records. */
  includeDemo?: boolean;
  /** Headers extra hacia Yalc (p.ej. trace del MCP). */
  headers?: Record<string, string>;
}

export const REPORT_PERIODS: readonly ReportPeriodDays[] = [1, 7, 30, 90];
const DAY_MS = 86_400_000;

/** Normaliza el query/input al mismo preset diario del dashboard (default 90). */
export function parseReportPeriod(value: unknown): ReportPeriodDays {
  const num = typeof value === "string" ? Number(value.trim()) : value;
  return REPORT_PERIODS.includes(num as ReportPeriodDays)
    ? (num as ReportPeriodDays)
    : 90;
}

/** Last N complete UTC calendar days; today is intentionally excluded. */
export function completeUtcReportRange(
  periodDays: ReportPeriodDays,
  now = new Date(),
): { from: Date; to: Date } {
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid report reference date");
  const todayStart = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const toStart = todayStart - DAY_MS;
  const fromStart = toStart - (periodDays - 1) * DAY_MS;
  return {
    from: new Date(fromStart),
    to: new Date(toStart + DAY_MS - 1),
  };
}

export function filterReportPerformance(
  records: ReturnType<typeof loadPerformance>,
  includeDemo = false,
): ReturnType<typeof loadPerformance> {
  return includeDemo ? records : records.filter((record) => record.source !== "seed");
}

export async function creatorReportForSlug(
  slug: string,
  options: CreatorReportServiceOptions = {},
): Promise<CreatorReport> {
  const periodDays = options.periodDays ?? 90;
  const config = resolveYalcConfig(slug);
  const payload = (await yalcFetch(config, "/api/leads?type=Partnerships", {
    headers: options.headers,
  })) as PartnershipLeadsPayload;
  const leads: PartnershipLead[] = Array.isArray(payload?.leads) ? payload.leads : [];
  const includeDemo = options.includeDemo === true
    || process.env.PARTNERSHIPS_INCLUDE_DEMO_METRICS === "1";
  const records = filterReportPerformance(loadPerformance(slug), includeDemo);
  return buildCreatorReport(leads, records, {
    periodDays,
    now: options.now,
    exactRange: options.exactRange ?? completeUtcReportRange(periodDays, options.now),
  });
}
