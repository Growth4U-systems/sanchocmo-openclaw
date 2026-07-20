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
  fetchSalesEngineCountsCached,
  fetchSalesEngineLeads,
  SalesEngineGhlError,
} from "@/lib/data/sales-engine-leads";

/**
 * GET /api/metrics/sales-engine-leads (SAN-326)
 *
 * List mode (default) — the drill-down behind one matrix cell:
 *   ?slug=<slug>&stage=<leads|meetings|opportunities|won>&bucket=<bucket|total>
 *   &from=YYYY-MM-DD&to=YYYY-MM-DD
 * Lists the GHL records (contacts, appointments, opportunities, won deals)
 * whose collapsed acquisition channel maps to the requested bucket. `bucket`
 * omitted or `total` lists the whole stage. `won` is CRM stock — from/to are
 * ignored.
 *
 * Counts mode — the whole "Motor de ventas" matrix in ONE call:
 *   ?slug=<slug>&view=counts&from=YYYY-MM-DD&to=YYYY-MM-DD
 * → { configured, from, to, stages: [{ stage, buckets, total, truncated }],
 *     wonValue: { buckets, total, truncated }, truncated }
 * Computed live from GHL with the SAME scans as the lists, so a matrix cell
 * always equals the length of the drill-down list it opens. `truncated: true`
 * means a safety cap made the numbers lower bounds (UI shows "≥N"). Counts are
 * cached in-process ~60 s per slug+window; lists stay uncached. When GHL is
 * not connected, counts mode answers 200 `configured:false` (the matrix shows
 * its connect state) while list mode keeps its 400.
 *
 * Both modes query GoHighLevel directly (no snapshots). Failures from GHL
 * surface as 502 with a clear message — never the API key, and lead PII is
 * never logged server-side.
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

function resolveGhlCredentials(slug: string): {
  config: Record<string, unknown>;
  locationId: string;
  apiKey: string;
} {
  const config = readGhlConfig(slug);
  const locationId = configString(config, ["locationId", "LOCATION_ID", "location_id"])
    || readBrandSecret(slug, "ghl", "LOCATION_ID")
    || "";
  const apiKey = readBrandSecret(slug, "ghl", "API_KEY")
    || readBrandSecret(slug, "ghl", "PRIVATE_INTEGRATION_TOKEN")
    || readBrandSecret(slug, "ghl", "APIKEY")
    || readBrandSecret(slug, "gohighlevel", "API_KEY")
    || "";
  return { config, locationId, apiKey };
}

const NOT_CONNECTED_MESSAGE =
  "GoHighLevel no está conectado para este cliente (falta API key o Location ID)";

function rangeDays(from: string, to: string): number {
  return Math.floor(
    (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / DAY_MS,
  ) + 1;
}

async function handleCounts(req: NextApiRequest, res: NextApiResponse, slug: string) {
  const from = typeof req.query.from === "string" ? req.query.from : undefined;
  const to = typeof req.query.to === "string" ? req.query.to : undefined;
  const dateError = metricCalendarRangeError({ from, to }, { requireBoth: true });
  if (dateError) return res.status(400).json({ error: dateError });
  if (rangeDays(from!, to!) > MAX_RANGE_DAYS) {
    return res.status(400).json({ error: `range cannot exceed ${MAX_RANGE_DAYS} days` });
  }

  const { config, locationId, apiKey } = resolveGhlCredentials(slug);
  if (!locationId || !apiKey) {
    // 200 (not 400): "GHL sin conectar" is a normal matrix state, not a caller
    // error — the UI renders its connect prompt from `configured:false`.
    return res.status(200).json({
      configured: false,
      slug,
      from,
      to,
      error: NOT_CONNECTED_MESSAGE,
    });
  }

  try {
    const result = await fetchSalesEngineCountsCached(
      `${slug}|${locationId}|${from}|${to}`,
      {
        from: from!,
        to: to!,
        locationId,
        apiKey,
        timezone: configString(config, ["timezone", "timeZone", "locationTimezone"]) || undefined,
      },
    );
    return res.status(200).json({
      configured: true,
      slug,
      from,
      to,
      stages: result.stages,
      wonValue: result.wonValue,
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

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const slug = req.query.slug as string;
  if (!slug) return res.status(400).json({ error: "Missing slug" });
  const view = typeof req.query.view === "string" ? req.query.view : "list";
  if (view !== "list" && view !== "counts") {
    return res.status(400).json({ error: "view must be list or counts" });
  }
  if (view === "counts") return handleCounts(req, res, slug);

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
    if (rangeDays(from!, to!) > MAX_RANGE_DAYS) {
      return res.status(400).json({
        error: `range cannot exceed ${MAX_RANGE_DAYS} days`,
      });
    }
  }

  const { config, locationId, apiKey } = resolveGhlCredentials(slug);
  if (!locationId || !apiKey) {
    return res.status(400).json({
      configured: false,
      error: NOT_CONNECTED_MESSAGE,
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
