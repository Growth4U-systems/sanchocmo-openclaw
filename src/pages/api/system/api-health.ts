import type { NextApiRequest, NextApiResponse } from "next";
import { readJSON } from "@/lib/data/json-io";
import { apiHealthFile, integrationsFile } from "@/lib/data/paths";

interface ServiceHealth {
  status: string;
  lastCheck: string | null;
  details?: Record<string, unknown>;
  error?: string;
}

interface ApiHealth {
  lastCheck: string | null;
  services: Record<string, ServiceHealth>;
}

interface IntegrationEntry {
  status?: string;
  lastTestedAt?: string;
  lastError?: string | null;
  notes?: string | null;
  envVars?: string[];
  config?: Record<string, string>;
}

interface IntegrationsData {
  dataSources?: Record<string, IntegrationEntry>;
  systemOverrides?: Record<string, IntegrationEntry>;
}

/**
 * Map an integrations.json entry into the ServiceHealth shape expected by
 * the APIs panel. integrations.json is the source of truth for per-client
 * connection state (it's written by /api/system/api-connect after the user
 * runs "Conectar y testear").
 */
function deriveFromIntegration(entry: IntegrationEntry): ServiceHealth {
  const lastCheck = entry.lastTestedAt || null;
  switch (entry.status) {
    case "connected":
      return { status: "ok", lastCheck, details: {} };
    case "error":
      return {
        status: "error",
        lastCheck,
        details: { error: entry.lastError || "Connection error" },
      };
    case "pending":
      return { status: "pending", lastCheck, details: {} };
    default:
      return { status: "not-configured", lastCheck, details: {} };
  }
}

/**
 * GET /api/system/api-health?slug=X
 *
 * Returns cached system-wide api-health.json, optionally overridden per-API
 * with the client-scoped state stored in brand/{slug}/integrations.json.
 * The override is what makes the panel reflect APIs whose credentials live
 * in brand/{slug}/.env (e.g. GROWTH4U_METRICOOL_API_TOKEN) — the cached
 * health file only knows about system-level keys.
 */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  res.setHeader("Access-Control-Allow-Origin", "*");
  const data = readJSON<ApiHealth>(apiHealthFile(), { lastCheck: null, services: {} });
  const services: Record<string, ServiceHealth> = { ...(data.services || {}) };

  const slug = typeof req.query.slug === "string" ? req.query.slug : "";
  if (slug) {
    const integrations = readJSON<IntegrationsData>(integrationsFile(slug), {});
    for (const entry of Object.entries(integrations.dataSources || {})) {
      services[entry[0]] = deriveFromIntegration(entry[1]);
    }
    for (const entry of Object.entries(integrations.systemOverrides || {})) {
      services[entry[0]] = deriveFromIntegration(entry[1]);
    }
  }

  res.status(200).json({ lastCheck: data.lastCheck, services });
}
