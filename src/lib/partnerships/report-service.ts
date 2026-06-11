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
  /** Headers extra hacia Yalc (p.ej. trace del MCP). */
  headers?: Record<string, string>;
}

export const REPORT_PERIODS: readonly ReportPeriodDays[] = [30, 90];

/** Normaliza el query/input de periodo ("30"|"90"|30|90) → 30|90 (default 90). */
export function parseReportPeriod(value: unknown): ReportPeriodDays {
  const num = typeof value === "string" ? Number(value.trim()) : value;
  return num === 30 ? 30 : 90;
}

export async function creatorReportForSlug(
  slug: string,
  options: CreatorReportServiceOptions = {},
): Promise<CreatorReport> {
  const config = resolveYalcConfig(slug);
  const payload = (await yalcFetch(config, "/api/leads?type=Partnerships", {
    headers: options.headers,
  })) as PartnershipLeadsPayload;
  const leads: PartnershipLead[] = Array.isArray(payload?.leads) ? payload.leads : [];
  const records = loadPerformance(slug);
  return buildCreatorReport(leads, records, {
    periodDays: options.periodDays ?? 90,
    now: options.now,
  });
}
