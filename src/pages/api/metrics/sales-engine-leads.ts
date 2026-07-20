import fs from "fs";
import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withErrorHandler, withSlugAuth } from "@/lib/api-middleware";
import { integrationsFile } from "@/lib/data/paths";
import { readBrandSecret } from "@/lib/brand-env";
import { metricCalendarRangeError } from "@/lib/metrics/read-query";
import {
  parseSalesEngineBucket,
  parseSalesEngineStage,
} from "@/lib/metrics/sales-engine-drilldown";
import {
  fetchSalesEngineLeads,
  SalesEngineGhlError,
} from "@/lib/data/sales-engine-leads";

/**
 * GET /api/metrics/sales-engine-leads (SAN-326)
 *   ?slug=<slug>&stage=<leads|meetings|opportunities|won>&bucket=<bucket|total>
 *   &from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Live drill-down behind a "Motor de ventas" matrix cell: lists the GHL
 * records (contacts, appointments, opportunities, won deals) whose collapsed
 * acquisition channel maps to the requested bucket. `bucket` omitted or
 * `total` lists the whole stage. `won` is CRM stock — from/to are ignored.
 *
 * Queries GoHighLevel directly (no snapshots), so the list is as current as
 * the CRM; counts can differ slightly from persisted matrix cells until the
 * next collection. Failures from GHL surface as 502 with a clear message —
 * never the API key, and lead PII is never logged server-side.
 */

const MAX_RANGE_DAYS = 366;
const DAY_MS = 86_400_000;

interface GhlIntegrationEntry {
  status?: string;
  config?: Record<string, unknown>;
  [key: string]: unknown;
}

function readGhlConfig(slug: string): Record<string, unknown> {
  try {
    const raw = JSON.parse(fs.readFileSync(integrationsFile(slug), "utf-8")) as {
      dataSources?: Record<string, GhlIntegrationEntry>;
    };
    const entry = raw.dataSources?.ghl ?? raw.dataSources?.gohighlevel ?? {};
    return { ...(entry.config ?? entry) };
  } catch {
    return {};
  }
}

function configString(config: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = config[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return "";
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const slug = req.query.slug as string;
  if (!slug) return res.status(400).json({ error: "Missing slug" });
  const stage = parseSalesEngineStage(req.query.stage);
  if (!stage) {
    return res.status(400).json({
      error: "stage must be one of leads, meetings, opportunities or won",
    });
  }
  const parsedBucket = parseSalesEngineBucket(
    typeof req.query.bucket === "string" ? req.query.bucket : undefined,
  );
  if (!parsedBucket) {
    return res.status(400).json({ error: `Invalid bucket: ${req.query.bucket}` });
  }

  const from = typeof req.query.from === "string" ? req.query.from : undefined;
  const to = typeof req.query.to === "string" ? req.query.to : undefined;
  if (stage !== "won") {
    const dateError = metricCalendarRangeError({ from, to }, { requireBoth: true });
    if (dateError) return res.status(400).json({ error: dateError });
    const days = Math.floor(
      (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / DAY_MS,
    ) + 1;
    if (days > MAX_RANGE_DAYS) {
      return res.status(400).json({
        error: `range cannot exceed ${MAX_RANGE_DAYS} days`,
      });
    }
  }

  const config = readGhlConfig(slug);
  const locationId = configString(config, ["locationId", "LOCATION_ID", "location_id"])
    || readBrandSecret(slug, "ghl", "LOCATION_ID")
    || "";
  const apiKey = readBrandSecret(slug, "ghl", "API_KEY")
    || readBrandSecret(slug, "ghl", "PRIVATE_INTEGRATION_TOKEN")
    || readBrandSecret(slug, "ghl", "APIKEY")
    || readBrandSecret(slug, "gohighlevel", "API_KEY")
    || "";
  if (!locationId || !apiKey) {
    return res.status(400).json({
      configured: false,
      error: "GoHighLevel no está conectado para este cliente (falta API key o Location ID)",
    });
  }

  try {
    const result = await fetchSalesEngineLeads({
      stage,
      bucket: parsedBucket.bucket,
      from,
      to,
      locationId,
      apiKey,
      timezone: configString(config, ["timezone", "timeZone", "locationTimezone"]) || undefined,
    });
    return res.status(200).json({
      configured: true,
      slug,
      stage,
      bucket: result.bucket,
      from: stage === "won" ? null : from,
      to: stage === "won" ? null : to,
      rows: result.rows,
      total: result.total,
      truncated: result.truncated,
      source: "ghl-live",
    });
  } catch (error) {
    if (error instanceof SalesEngineGhlError) {
      // Provider failure: explain without leaking credentials or lead data.
      return res.status(502).json({ error: error.message });
    }
    throw error;
  }
}

export { handler as salesEngineLeadsHandler };
export default compose(withErrorHandler, withSlugAuth)(handler);
