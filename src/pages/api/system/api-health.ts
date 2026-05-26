import type { NextApiRequest, NextApiResponse } from "next";
import { readJSON } from "@/lib/data/json-io";
import { apiHealthFile, integrationsFile } from "@/lib/data/paths";
import { brandEnvHas } from "@/lib/brand-env";
import { getProvider, getProviderConfigStatus } from "@/lib/publishing/registry";

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
 * the APIs panel. integrations.json's `status` field is a cache of the last
 * "Conectar y testear" result — by itself it goes stale when env vars are
 * rotated, brand .env files get re-created, or migrations move things around.
 *
 * Two cross-checks bring the panel back in line with reality:
 *  1. For known publishing providers we defer to the publishing registry's
 *     `inspect()`, which runs the same runtime check the publishing panel
 *     uses (env var present + config parseable). Without this, the inner
 *     connectors table can show "Conectado" while the outer publishing row
 *     says "Sin conectar" for the same brand.
 *  2. For everything else, when status is "connected" we verify each
 *     `envVars` entry is still reachable through brand/.env, workspace/.env,
 *     or process.env. If any are missing we downgrade to "error" so the
 *     user is prompted to reconnect instead of seeing a green light.
 */
function deriveFromIntegration(
  entry: IntegrationEntry,
  slug: string,
  apiId: string,
): ServiceHealth {
  const lastCheck = entry.lastTestedAt || null;

  const provider = getProvider(apiId);
  if (provider) {
    const status = getProviderConfigStatus(slug, provider);
    if (status.configured) return { status: "ok", lastCheck, details: {} };
    return {
      status: "error",
      lastCheck,
      details: { error: status.missing || "Credenciales faltantes" },
    };
  }

  switch (entry.status) {
    case "connected": {
      const missing = (entry.envVars || []).filter((name) => !brandEnvHas(slug, name));
      if (missing.length > 0) {
        return {
          status: "error",
          lastCheck,
          details: { error: `Credenciales faltantes: ${missing.join(", ")}` },
        };
      }
      return { status: "ok", lastCheck, details: {} };
    }
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
    for (const [apiId, entry] of Object.entries(integrations.dataSources || {})) {
      services[apiId] = deriveFromIntegration(entry, slug, apiId);
    }
    for (const [apiId, entry] of Object.entries(integrations.systemOverrides || {})) {
      services[apiId] = deriveFromIntegration(entry, slug, apiId);
    }
  }

  res.status(200).json({ lastCheck: data.lastCheck, services });
}
