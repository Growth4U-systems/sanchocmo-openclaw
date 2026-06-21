import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { logActivity } from "@/lib/data/activity-log";
import { readJSON, writeJSON } from "@/lib/data/json-io";
import { BASE, EXEC_PATH, brandDir } from "@/lib/data/paths";
import { resolveTransport } from "@/lib/publish/registry";
import { resolvePublishTarget } from "@/lib/publish/target";
import type { PublishTarget } from "@/lib/publish/types";

interface IntegrationEntry {
  provider?: string;
  status?: string;
  config?: Record<string, unknown>;
  envVars?: string[];
  lastTestedAt?: string | null;
  lastError?: string | null;
  notes?: string | null;
}

interface IntegrationState {
  slug?: string;
  client?: string;
  updatedAt?: string;
  dataSources?: Record<string, IntegrationEntry>;
  systemOverrides?: Record<string, IntegrationEntry>;
  metricsSheet?: unknown;
  slack?: unknown;
}

interface IntegrationCatalog {
  found: boolean;
  path: string;
  catalog: unknown;
}

interface TestConnectionInput {
  clientSlug: string;
  source?: string;
  all?: boolean;
}

interface PublishMessageInput {
  clientSlug: string;
  cronKey?: string;
  transport?: string;
  channel?: string;
  title: string;
  body: string;
}

export function loadIntegrationCatalog(): IntegrationCatalog {
  const catalogPath = path.join(BASE, "..", "skills", "acquisition-metrics-plan", "schemas", "api-catalog.json");
  const catalog = readJSON(catalogPath, null);
  return { found: Boolean(catalog), path: catalogPath, catalog: catalog || { categories: {} } };
}

export function getMergedIntegrationStatus(clientSlug: string): Record<string, unknown> {
  const catalog = loadIntegrationCatalog().catalog as { categories?: Record<string, unknown> };
  const intData = readIntegrationState(clientSlug);

  const merged: Record<string, unknown> = {
    slug: clientSlug,
    dataSources: {} as Record<string, unknown>,
    systemOverrides: {} as Record<string, unknown>,
    updatedAt: intData.updatedAt || null,
  };

  for (const [, catData] of Object.entries(catalog.categories || {})) {
    if (!isRecord(catData)) continue;
    const apis = isRecord(catData.apis) ? catData.apis : {};
    for (const [apiId, apiMeta] of Object.entries(apis)) {
      if (!isRecord(apiMeta)) continue;
      const ownership = typeof apiMeta.ownership === "string" ? apiMeta.ownership : "system";
      const section = ownership === "system" ? "systemOverrides" : "dataSources";
      const clientEntry = intData.systemOverrides?.[apiId] || intData.dataSources?.[apiId] || {};
      (merged[section] as Record<string, unknown>)[apiId] = {
        provider: typeof apiMeta.provider === "string" ? apiMeta.provider : undefined,
        status: clientEntry.status || "not_configured",
        config: clientEntry.config || {},
        envVars: clientEntry.envVars || [],
        lastTestedAt: clientEntry.lastTestedAt || null,
        lastError: clientEntry.lastError || null,
        notes: clientEntry.notes || null,
      };
    }
  }

  return merged;
}

export function getSanitizedIntegrationStatus(clientSlug: string) {
  return sanitizeIntegrations(readIntegrationState(clientSlug));
}

export function sanitizeIntegrations(value: unknown) {
  const data = isRecord(value) ? value : {};
  return {
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : null,
    dataSources: sanitizeIntegrationSection(data.dataSources),
    systemOverrides: sanitizeIntegrationSection(data.systemOverrides),
    metricsSheet: sanitizeMetricsSheet(data.metricsSheet),
    slack: sanitizeSlackIntegration(data.slack),
  };
}

export function previewTestIntegrationConnection(input: TestConnectionInput) {
  const state = readIntegrationState(input.clientSlug);
  const targets = resolveTestTargets(state, input);
  return {
    clientSlug: input.clientSlug,
    source: input.source || null,
    all: Boolean(input.all),
    targets,
    targetCount: targets.length,
    willRunScript: targets.length > 0,
    scriptPath: integrationTestScriptPath(),
  };
}

export function testIntegrationConnection(input: TestConnectionInput) {
  const state = readIntegrationState(input.clientSlug);
  const targets = resolveTestTargets(state, input);
  if (targets.length === 0) {
    throw new Error("No integration sources to test. Provide source or all=true with configured sources.");
  }

  const results: Record<string, { status: string; error?: string }> = {};
  for (const source of targets) {
    results[source] = runConnectionTest(input.clientSlug, source);
  }

  const latest = readIntegrationState(input.clientSlug);
  latest.updatedAt = new Date().toISOString();
  fs.mkdirSync(brandDir(input.clientSlug), { recursive: true });
  writeIntegrationState(input.clientSlug, latest);

  return {
    ok: Object.values(results).every((entry) => entry.status !== "error"),
    clientSlug: input.clientSlug,
    results,
  };
}

export function previewPublishIntegrationMessage(input: PublishMessageInput) {
  const target = resolveMessageTarget(input);
  return {
    clientSlug: input.clientSlug,
    cronKey: input.cronKey || null,
    target,
    message: {
      title: input.title,
      bodyChars: input.body.length,
    },
    willPublish: true,
  };
}

export async function publishIntegrationMessage(input: PublishMessageInput) {
  let target: PublishTarget;
  try {
    target = resolveMessageTarget(input);
  } catch (err) {
    if (input.cronKey) {
      logPublishSkipped(input.clientSlug, input.cronKey);
      return { ok: true, skipped: true, reason: "no_publish_channel", cronKey: input.cronKey };
    }
    throw err;
  }

  const result = await resolveTransport(target.transport).publish(input.clientSlug, target, {
    title: input.title,
    body: input.body,
  });

  if (result.rootId) {
    try {
      logActivity(input.clientSlug, {
        type: "publish",
        text: `Publicado via ${target.transport}${input.cronKey ? ` (${input.cronKey})` : ""}${result.ok ? "" : " - parcial (fallo el hilo)"}`,
        icon: "publish",
        accent: result.ok ? "navy" : "rust",
        meta: {
          transport: target.transport,
          channel: target.channel,
          cronKey: input.cronKey,
          rootId: result.rootId,
          partial: !result.ok,
        },
      });
    } catch (err) {
      console.error("[publish] activity log failed:", (err as Error).message);
    }
  }

  return { ...result, transport: target.transport, channel: target.channel };
}

function readIntegrationState(clientSlug: string): IntegrationState {
  return readJSON<IntegrationState>(path.join(brandDir(clientSlug), "integrations.json"), {
    slug: clientSlug,
    client: clientSlug,
    dataSources: {},
    systemOverrides: {},
  });
}

function writeIntegrationState(clientSlug: string, state: IntegrationState): void {
  writeJSON(path.join(brandDir(clientSlug), "integrations.json"), state);
}

function resolveTestTargets(state: IntegrationState, input: TestConnectionInput): string[] {
  if (input.source) return [input.source];
  if (!input.all) return [];
  const allSources = { ...(state.dataSources || {}), ...(state.systemOverrides || {}) };
  return Object.entries(allSources)
    .filter(([, entry]) => entry.status !== "not_configured")
    .map(([source]) => source)
    .sort();
}

function runConnectionTest(clientSlug: string, source: string): { status: string; error?: string } {
  const testScript = integrationTestScriptPath();
  const intPath = path.join(brandDir(clientSlug), "integrations.json");
  let state = readIntegrationState(clientSlug);

  try {
    execFileSync("node", [testScript, "--slug", clientSlug, "--source", source], {
      cwd: BASE,
      timeout: 30_000,
      encoding: "utf-8",
      env: { ...process.env, MC_WORKSPACE: BASE, PATH: EXEC_PATH },
    });
    try {
      state = readJSON(intPath, state);
    } catch {
      // Keep previous state.
    }
    const entry = state.dataSources?.[source] || state.systemOverrides?.[source] || {};
    return { status: entry.status || "connected" };
  } catch (err) {
    const realError = extractTestError(err);
    try {
      state = readJSON(intPath, state);
    } catch {
      // Keep previous state.
    }
    const section: "systemOverrides" | "dataSources" = state.systemOverrides?.[source]
      ? "systemOverrides"
      : "dataSources";
    if (!state[section]) state[section] = {};
    if (!state[section]?.[source]) state[section]![source] = { provider: source, status: "error" };
    state[section]![source].lastError = realError;
    state[section]![source].status = "error";
    writeIntegrationState(clientSlug, state);
    return { status: "error", error: realError };
  }
}

function resolveMessageTarget(input: PublishMessageInput): PublishTarget {
  if (input.cronKey) return resolvePublishTarget(input.clientSlug, input.cronKey);
  if (input.transport && input.channel) return { transport: input.transport, channel: input.channel };
  throw new Error("Provide cronKey, or transport + channel");
}

function logPublishSkipped(clientSlug: string, cronKey: string): void {
  try {
    logActivity(clientSlug, {
      type: "publish",
      text: `Publicacion omitida - sin canal configurado para "${cronKey}"`,
      icon: "skip",
      accent: "sun",
      meta: { cronKey, skipped: true, reason: "no_publish_channel" },
    });
  } catch (err) {
    console.error("[publish] skip-log failed:", (err as Error).message);
  }
}

function integrationTestScriptPath(): string {
  return path.join(BASE, "..", "skills", "acquisition-metrics-plan", "scripts", "test-connection.js");
}

function extractTestError(err: unknown): string {
  const record = isRecord(err) ? err : {};
  const stdout = typeof record.stdout === "string" || Buffer.isBuffer(record.stdout) ? String(record.stdout) : "";
  const stderr = typeof record.stderr === "string" || Buffer.isBuffer(record.stderr) ? String(record.stderr) : "";
  const errorMatch = stdout.match(/Error\s+[\u2014-]\s+(.+)/);
  return errorMatch
    ? errorMatch[1].trim()
    : (stderr.slice(0, 200) || stdout.slice(-200) || (err instanceof Error ? err.message : "").slice(0, 200));
}

function sanitizeIntegrationSection(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([id, entry]) => [id, sanitizeIntegrationEntry(entry)]),
  );
}

function sanitizeIntegrationEntry(value: unknown) {
  const entry = isRecord(value) ? value : {};
  const configKeys = isRecord(entry.config) ? Object.keys(entry.config).sort() : [];
  const envVars = Array.isArray(entry.envVars) ? entry.envVars.filter((item) => typeof item === "string") : [];
  return pickDefined({
    provider: typeof entry.provider === "string" ? entry.provider : undefined,
    status: typeof entry.status === "string" ? entry.status : "not_configured",
    configKeys,
    envVars,
    lastTestedAt: typeof entry.lastTestedAt === "string" ? entry.lastTestedAt : undefined,
    lastError: typeof entry.lastError === "string" ? entry.lastError : undefined,
    notes: typeof entry.notes === "string" ? entry.notes : undefined,
  });
}

function sanitizeMetricsSheet(value: unknown) {
  if (!isRecord(value)) return undefined;
  return pickDefined({
    spreadsheetId: typeof value.spreadsheetId === "string" ? value.spreadsheetId : undefined,
    folderId: typeof value.folderId === "string" ? value.folderId : undefined,
    url: typeof value.url === "string" ? value.url : undefined,
  });
}

function sanitizeSlackIntegration(value: unknown) {
  if (!isRecord(value)) return undefined;
  return pickDefined({
    status: typeof value.status === "string" ? value.status : undefined,
    team_id: typeof value.team_id === "string" ? value.team_id : undefined,
    team_name: typeof value.team_name === "string" ? value.team_name : undefined,
    bot_user_id: typeof value.bot_user_id === "string" ? value.bot_user_id : undefined,
    scope: typeof value.scope === "string" ? value.scope : undefined,
    authed_user_id: typeof value.authed_user_id === "string" ? value.authed_user_id : undefined,
    installed_at: typeof value.installed_at === "string" ? value.installed_at : undefined,
    last_error: typeof value.last_error === "string" ? value.last_error : undefined,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function pickDefined(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined));
}
