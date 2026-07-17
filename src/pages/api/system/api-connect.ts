import type { NextApiRequest, NextApiResponse } from "next";
import { execFileSync } from "child_process";
import path from "path";
import fs from "fs";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";
import { BASE, integrationsFile, brandDir } from "@/lib/data/paths";
import { readJSON, writeJSON } from "@/lib/data/json-io";
import { runHealthChecks, type ServiceHealth } from "@/lib/health-check";
import { resolveYalcConfig, yalcErrorResponse, yalcFetch } from "@/lib/yalc/client";
import {
  buildYalcSetupGuide,
  parseYalcProviderApiId,
  type YalcKnowledgePayload,
} from "@/lib/yalc/provider-catalog";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface IntegrationEntry {
  provider?: string;
  status?: string;
  lastTestedAt?: string;
  lastError?: string | null;
  notes?: string | null;
  envVars?: string[];
  config?: Record<string, string>;
  [key: string]: unknown;
}

interface IntegrationsData {
  dataSources?: Record<string, IntegrationEntry>;
  systemOverrides?: Record<string, IntegrationEntry>;
  updatedAt?: string;
}

interface GuideStep {
  title: string;
  instructions: string;
}

interface SetupGuide {
  difficulty: string;
  time: string;
  warning?: string;
  steps: GuideStep[];
}

interface CatalogApiEntry {
  ownership?: "system" | "client";
  provider?: string;
}

interface ApiCatalog {
  categories?: Record<string, { apis?: Record<string, CatalogApiEntry> }>;
}

interface YalcSaveResponse {
  status?: string;
  provider?: string;
  healthcheck?: {
    ok?: boolean;
    status?: string;
    detail?: string;
  };
}

interface YalcTestResponse {
  ok?: boolean;
  status?: string;
  detail?: string;
}

/* ------------------------------------------------------------------ */
/*  Handler                                                            */
/* ------------------------------------------------------------------ */

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    return handleGet(req, res);
  }
  if (req.method === "POST") {
    return handlePost(req, res);
  }
  return res.status(405).json({ error: "Method not allowed" });
}

/* ------------------------------------------------------------------ */
/*  GET — Read status + guide                                          */
/* ------------------------------------------------------------------ */

async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  const slug = req.query.slug as string;
  const apiId = req.query.apiId as string;

  if (!slug || !apiId) {
    return res.status(400).json({ error: "Missing slug or apiId" });
  }

  // Read integrations.json
  const integrations = readJSON<IntegrationsData>(integrationsFile(slug), {});
  const entry =
    integrations.dataSources?.[apiId] ||
    integrations.systemOverrides?.[apiId] ||
    null;

  // Determine status
  const status = entry?.status || "not_configured";
  const config: Record<string, string> = {};

  // Only return non-sensitive config values
  if (entry?.config) {
    for (const [k, v] of Object.entries(entry.config)) {
      config[k] = v;
    }
  }

  // Read setup guide. The shared skills tree lives one level above BASE
  // (BASE = ~/.openclaw/workspace-sancho → ~/.openclaw/skills/...).
  const guidesPath = path.join(
    BASE,
    "..",
    "skills",
    "acquisition-metrics-plan",
    "schemas",
    "setup-guides.json"
  );
  const allGuides = readJSON<Record<string, SetupGuide>>(guidesPath, {});
  let guide: SetupGuide | null = allGuides[apiId] || null;
  const yalcProvider = parseYalcProviderApiId(apiId);
  if (!guide && yalcProvider) {
    guide = await loadYalcSetupGuide(slug, yalcProvider);
  }

  return res.status(200).json({
    status,
    config,
    lastTestedAt: entry?.lastTestedAt || null,
    lastError: entry?.lastError || null,
    notes: entry?.notes || null,
    guide,
  });
}

/* ------------------------------------------------------------------ */
/*  POST — Save credentials + test connection                          */
/* ------------------------------------------------------------------ */

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  const { slug, apiId, config, secrets, testOnly } = req.body || {};

  if (typeof slug !== "string" || !slug || typeof apiId !== "string" || !apiId) {
    return res.status(400).json({ error: "Missing slug or apiId" });
  }

  const yalcProvider = parseYalcProviderApiId(apiId);
  if (yalcProvider) {
    return handleYalcProviderPost(req, res, {
      slug,
      apiId,
      provider: yalcProvider,
      config,
      secrets,
      testOnly,
    });
  }

  if (!testOnly) {
    // Load or create integrations.json
    const intPath = integrationsFile(slug);
    const integrations = readJSON<IntegrationsData>(intPath, { dataSources: {} });

    if (!integrations.dataSources) {
      integrations.dataSources = {};
    }
    if (!integrations.dataSources[apiId]) {
      integrations.dataSources[apiId] = {};
    }

    // Save non-sensitive config to integrations.json
    if (config && typeof config === "object") {
      integrations.dataSources[apiId].config = {
        ...(integrations.dataSources[apiId].config || {}),
        ...config,
      };
    }

    integrations.dataSources[apiId].status = "pending";
    integrations.dataSources[apiId].provider = integrations.dataSources[apiId].provider || apiId;
    writeJSON(intPath, integrations);

    // Save secrets to brand/{slug}/.env
    if (secrets && typeof secrets === "object" && Object.keys(secrets).length > 0) {
      const slugUpper = slug.replace(/-/g, "_").toUpperCase();
      const apiUpper = apiId.replace(/-/g, "_").toUpperCase();
      const envPath = path.join(brandDir(slug), ".env");
      const envVars = new Set(integrations.dataSources[apiId].envVars || []);

      // Read existing .env content
      let envContent = "";
      try {
        envContent = fs.readFileSync(envPath, "utf-8");
      } catch {
        // File doesn't exist yet, that's fine
      }

      // Update/add each secret
      for (const [key, value] of Object.entries(secrets)) {
        const envKey = `${slugUpper}_${apiUpper}_${key.toUpperCase()}`;
        const envLine = `${envKey}=${serializeEnvValue(String(value))}`;
        envVars.add(envKey);

        // Check if key already exists in .env
        const regex = new RegExp(`^${envKey}=.*$`, "m");
        if (regex.test(envContent)) {
          envContent = envContent.replace(regex, envLine);
        } else {
          envContent = envContent.trimEnd() + "\n" + envLine + "\n";
        }
      }

      // Ensure directory exists
      const dir = path.dirname(envPath);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(envPath, envContent);

      integrations.dataSources[apiId].envVars = Array.from(envVars).sort();
      writeJSON(intPath, integrations);
    }
  }

  const catalogApi = loadCatalogApi(apiId);
  if (catalogApi?.ownership === "system") {
    const healthResult = await runHealthChecks(apiId, slug);
    const serviceHealth = healthResult.results[apiId];
    if (!healthResult.error && serviceHealth) {
      writeHealthCheckIntegrationState(slug, apiId, serviceHealth);
      return res.status(200).json({
        ok: serviceHealth.status === "ok",
        testResult: {
          status: serviceHealth.status === "ok" ? "connected" : "error",
          output: serviceHealth.status === "ok" ? "Health check OK" : undefined,
          error: serviceHealth.status === "ok" ? undefined : healthErrorMessage(serviceHealth),
        },
      });
    }
  }

  // Run test script. Same shared-skills tree as setup-guides above.
  const scriptDir = path.join(BASE, "..", "skills", "acquisition-metrics-plan", "scripts");
  const testScript = path.join(scriptDir, "test-connection.js");

  let testResult: { status: string; output?: string; error?: string };

  try {
    const output = execFileSync(
      process.execPath,
      [testScript, "--slug", slug, "--source", apiId],
      {
        cwd: scriptDir,
        timeout: 30_000,
        encoding: "utf-8",
        env: { ...process.env, MC_WORKSPACE: BASE, PATH: process.env.PATH },
      }
    );

    // Re-read integrations.json after test (script may have updated it)
    const updatedIntegrations = readJSON<IntegrationsData>(integrationsFile(slug), {});
    const updatedEntry =
      updatedIntegrations.dataSources?.[apiId] ||
      updatedIntegrations.systemOverrides?.[apiId] ||
      null;

    if (updatedEntry?.status === "connected") {
      testResult = {
        status: "connected",
        output: output.trim() || undefined,
      };
    } else {
      const error = updatedEntry?.lastError || "Connection test did not confirm the provider";
      writeConnectionTestFailure(slug, apiId, error);
      testResult = { status: "error", error };
    }
  } catch (err: unknown) {
    const execErr = err as { stderr?: string; stdout?: string; message?: string };
    const errorMsg = execErr.stderr || execErr.stdout || execErr.message || "Test failed";

    // Re-read integrations.json after failed test too
    const updatedIntegrations = readJSON<IntegrationsData>(integrationsFile(slug), {});
    const updatedEntry =
      updatedIntegrations.dataSources?.[apiId] ||
      updatedIntegrations.systemOverrides?.[apiId] ||
      null;

    const error = updatedEntry?.lastError || errorMsg.toString().trim() || "Connection test failed";
    writeConnectionTestFailure(slug, apiId, error);
    testResult = { status: "error", error };
  }

  return res.status(200).json({
    ok: testResult.status === "connected",
    testResult,
  });
}

export default compose(withErrorHandler, withAuth)(handler);

function loadCatalogApi(apiId: string): CatalogApiEntry | null {
  const catalogPath = path.join(
    BASE,
    "..",
    "skills",
    "acquisition-metrics-plan",
    "schemas",
    "api-catalog.json",
  );
  const catalog = readJSON<ApiCatalog>(catalogPath, { categories: {} });
  for (const cat of Object.values(catalog.categories || {})) {
    const api = cat.apis?.[apiId];
    if (api) return api;
  }
  return null;
}

function writeHealthCheckIntegrationState(slug: string, apiId: string, health: ServiceHealth) {
  const intPath = integrationsFile(slug);
  const integrations = readJSON<IntegrationsData>(intPath, { dataSources: {} });
  if (!integrations.dataSources) integrations.dataSources = {};
  const prev = integrations.dataSources[apiId] || {};
  integrations.dataSources[apiId] = {
    ...prev,
    provider: prev.provider || apiId,
    status: health.status === "ok" ? "connected" : "error",
    lastTestedAt: health.lastCheck,
    lastError: health.status === "ok" ? null : healthErrorMessage(health),
  };
  integrations.updatedAt = new Date().toISOString();
  writeJSON(intPath, integrations);
}

function healthErrorMessage(health: ServiceHealth): string {
  const raw = health.details?.error;
  return typeof raw === "string" && raw ? raw : health.status;
}

function serializeEnvValue(value: string): string {
  if (/^[A-Za-z0-9_./:@+=,-]+$/.test(value)) return value;
  return JSON.stringify(value);
}

async function loadYalcSetupGuide(slug: string, providerId: string): Promise<SetupGuide | null> {
  try {
    const knowledge = await yalcFetch<YalcKnowledgePayload>(
      resolveYalcConfig(slug),
      "/api/keys/knowledge",
    );
    const provider = (knowledge.providers || []).find((item) => item.id === providerId) || null;
    return buildYalcSetupGuide(provider);
  } catch {
    return null;
  }
}

async function handleYalcProviderPost(
  _req: NextApiRequest,
  res: NextApiResponse,
  input: {
    slug: string;
    apiId: string;
    provider: string;
    config?: unknown;
    secrets?: unknown;
    testOnly?: unknown;
  },
) {
  const runtime = resolveYalcConfig(input.slug);

  try {
    if (input.testOnly) {
      const result = await yalcFetch<YalcTestResponse>(
        runtime,
        `/api/keys/test/${encodeURIComponent(input.provider)}`,
        { method: "POST" },
      );
      const ok = result.ok === true;
      writeYalcIntegrationState(input.slug, input.apiId, input.provider, {
        status: ok ? "connected" : "error",
        lastError: ok ? null : result.detail || result.status || "YALC health check failed",
      });
      return res.status(200).json({
        ok,
        testResult: {
          status: ok ? "connected" : "error",
          output: ok ? result.detail || result.status : undefined,
          error: ok ? undefined : result.detail || result.status || "YALC health check failed",
        },
      });
    }

    const env = collectYalcEnv(input.config, input.secrets);
    if (Object.keys(env).length === 0) {
      return res.status(400).json({ error: "Missing YALC provider credentials" });
    }

    const result = await yalcFetch<YalcSaveResponse>(runtime, "/api/keys/save", {
      body: { provider: input.provider, env },
    });

    // "configured" only confirms persistence inside YALC. A provider is
    // connected only when YALC's own health check explicitly succeeds.
    const ok = result.healthcheck?.ok === true;
    const detail = ok
      ? result.healthcheck?.detail || result.healthcheck?.status || result.status || "YALC provider connected"
      : result.healthcheck?.detail ||
        result.healthcheck?.status ||
        "YALC provider was saved, but its health check was not confirmed";

    writeYalcIntegrationState(input.slug, input.apiId, input.provider, {
      status: ok ? "connected" : "error",
      lastError: ok ? null : detail,
    });

    return res.status(200).json({
      ok,
      testResult: {
        status: ok ? "connected" : "error",
        output: ok ? detail : undefined,
        error: ok ? undefined : detail,
      },
    });
  } catch (err) {
    const out = yalcErrorResponse(err);
    writeYalcIntegrationState(input.slug, input.apiId, input.provider, {
      status: "error",
      lastError: out.body.error,
    });
    return res.status(out.status).json(out.body);
  }
}

function collectYalcEnv(config: unknown, secrets: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const source of [config, secrets]) {
    if (!source || typeof source !== "object" || Array.isArray(source)) continue;
    for (const [key, value] of Object.entries(source)) {
      if (!/^[A-Z][A-Z0-9_]*$/.test(key)) continue;
      if (typeof value === "string" && value.trim()) {
        out[key] = value;
      }
    }
  }
  return out;
}

function writeYalcIntegrationState(
  slug: string,
  apiId: string,
  provider: string,
  patch: Pick<IntegrationEntry, "status" | "lastError">,
) {
  const intPath = integrationsFile(slug);
  const integrations = readJSON<IntegrationsData>(intPath, { dataSources: {} });
  if (!integrations.dataSources) integrations.dataSources = {};

  const prev = integrations.dataSources[apiId] || {};
  integrations.dataSources[apiId] = {
    ...prev,
    provider,
    status: patch.status,
    lastTestedAt: new Date().toISOString(),
    lastError: patch.lastError ?? null,
    notes: "Credenciales sincronizadas desde Sancho hacia YALC.",
    config: {
      ...(prev.config || {}),
      provider,
    },
    envVars: [],
    yalcProvider: provider,
  };
  integrations.updatedAt = new Date().toISOString();
  writeJSON(intPath, integrations);
}

function writeConnectionTestFailure(slug: string, apiId: string, error: string) {
  const intPath = integrationsFile(slug);
  const integrations = readJSON<IntegrationsData>(intPath, { dataSources: {} });
  const section = integrations.dataSources?.[apiId]
    ? "dataSources"
    : integrations.systemOverrides?.[apiId]
      ? "systemOverrides"
      : "dataSources";
  if (!integrations[section]) integrations[section] = {};
  const prev = integrations[section]?.[apiId] || {};
  integrations[section]![apiId] = {
    ...prev,
    provider: prev.provider || apiId,
    status: "error",
    lastTestedAt: new Date().toISOString(),
    lastError: error,
  };
  integrations.updatedAt = new Date().toISOString();
  writeJSON(intPath, integrations);
}
