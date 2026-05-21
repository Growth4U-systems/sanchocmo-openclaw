import { execFile } from "child_process";
import { promisify } from "util";
import { EXEC_PATH } from "@/lib/data/paths";
import { listAgents } from "@/lib/data/openclaw-config";

const execFileAsync = promisify(execFile);

export interface CatalogProvider {
  id: string;
  configured: boolean;
  authKind: string;
  sourceLabel: string | null;
  modelCount: number;
}

export interface CatalogModel {
  id: string;
  name: string;
  provider: string;
  contextWindow?: number;
  reasoning?: boolean;
  input?: string[];
  curated: boolean;
  tags: string[];
}

export interface ModelCatalog {
  providers: CatalogProvider[];
  models: CatalogModel[];
  curated: string[];
  agentDir: string | null;
  generatedAt: number;
  complete: boolean;
}

export const CURATED_MODELS = [
  "codex/gpt-5.4",
  "codex/gpt-5.4-mini",
  "openai-codex/gpt-5.3-codex",
  "anthropic/claude-sonnet-4-6",
  "anthropic/claude-opus-4-6",
  "openrouter/openai/gpt-5.5",
  "google/gemini-2.5-flash",
];

const FAST_CACHE_TTL_MS = 5 * 60_000;
const FULL_CACHE_TTL_MS = 10 * 60_000;
const SHELL_TIMEOUT_MS = 45_000;

const cache: {
  fast?: { catalog: ModelCatalog; expiresAt: number };
  full?: { catalog: ModelCatalog; expiresAt: number };
} = {};

async function runOpenclaw(args: string[], extraEnv?: Record<string, string>): Promise<string> {
  const { stdout } = await execFileAsync("openclaw", args, {
    timeout: SHELL_TIMEOUT_MS,
    encoding: "utf-8",
    env: { ...process.env, ...extraEnv, PATH: EXEC_PATH },
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout;
}

function extractJson<T = unknown>(raw: string): T | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const first = trimmed.search(/[{[]/);
  if (first < 0) return null;
  try {
    return JSON.parse(trimmed.slice(first)) as T;
  } catch {
    return null;
  }
}

function pickPrimaryAgentDir(): string | null {
  try {
    const agents = listAgents();
    const preferred = agents.find((a) => a.id === "sancho" && typeof a.agentDir === "string");
    if (preferred && typeof preferred.agentDir === "string") return preferred.agentDir;
    const anyWithDir = agents.find((a) => typeof a.agentDir === "string");
    if (anyWithDir && typeof anyWithDir.agentDir === "string") return anyWithDir.agentDir;
  } catch {
    // fallthrough
  }
  return null;
}

interface RawModel {
  key?: string;
  name?: string;
  contextWindow?: number;
  reasoning?: boolean;
  input?: string | string[];
  tags?: string[];
}

interface AuthProviderEntry {
  provider: string;
  effective?: { kind?: string; detail?: string };
  env?: { source?: string; value?: string };
  profiles?: { count?: number; labels?: string[] };
}

interface RuntimeRoute {
  provider: string;
  runtime: string;
  authProvider: string;
  status: string;
}

interface AuthStatus {
  agentDir?: string;
  auth?: {
    providers?: AuthProviderEntry[];
    providersWithOAuth?: string[];
    runtimeAuthRoutes?: RuntimeRoute[];
  };
}

function toCatalogModel(m: RawModel): CatalogModel | null {
  if (typeof m.key !== "string" || !m.key.includes("/")) return null;
  const key = m.key;
  const slashIdx = key.indexOf("/");
  const provider = key.slice(0, slashIdx);
  return {
    id: key,
    name: m.name || key,
    provider,
    contextWindow: m.contextWindow,
    reasoning: m.reasoning,
    input: Array.isArray(m.input) ? m.input : m.input ? [m.input] : undefined,
    curated: CURATED_MODELS.includes(key),
    tags: m.tags || [],
  };
}

function isProviderConfigured(
  providerId: string,
  auth: AuthStatus | null
): { configured: boolean; kind: string; source: string | null } {
  if (!auth?.auth) return { configured: false, kind: "missing", source: null };

  const provs = auth.auth.providers || [];
  const direct = provs.find((p) => p.provider === providerId);
  if (direct?.effective?.kind && direct.effective.kind !== "missing") {
    return {
      configured: true,
      kind: direct.effective.kind,
      source: direct.env?.source || direct.profiles?.labels?.[0] || null,
    };
  }

  const routes = auth.auth.runtimeAuthRoutes || [];
  const route = routes.find(
    (r) => (r.runtime === providerId || r.authProvider === providerId) && r.status === "usable"
  );
  if (route) {
    return { configured: true, kind: "oauth", source: `via ${route.authProvider}` };
  }

  const oauthList = auth.auth.providersWithOAuth || [];
  const oauthHit = oauthList.find(
    (label) => label.startsWith(`${providerId} `) || label === providerId
  );
  if (oauthHit) {
    return { configured: true, kind: "oauth", source: oauthHit };
  }

  return { configured: false, kind: "missing", source: null };
}

function synthesizeCuratedEntries(existing: CatalogModel[]): CatalogModel[] {
  const ids = new Set(existing.map((m) => m.id));
  const out: CatalogModel[] = [];
  for (const id of CURATED_MODELS) {
    if (ids.has(id)) continue;
    const slashIdx = id.indexOf("/");
    if (slashIdx < 0) continue;
    out.push({
      id,
      name: id.slice(slashIdx + 1),
      provider: id.slice(0, slashIdx),
      curated: true,
      tags: [],
    });
  }
  return out;
}

async function buildCatalog(opts: { all: boolean }): Promise<ModelCatalog> {
  const agentDir = pickPrimaryAgentDir();
  const env = agentDir ? { OPENCLAW_AGENT_DIR: agentDir } : undefined;

  const modelsArgs = opts.all
    ? ["models", "list", "--all", "--json"]
    : ["models", "list", "--json"];

  const [modelsRaw, authRaw] = await Promise.all([
    runOpenclaw(modelsArgs, env).catch((e) => {
      console.warn("[models-catalog] models list failed:", e instanceof Error ? e.message : e);
      return "";
    }),
    runOpenclaw(["infer", "model", "auth", "status", "--json"], env).catch((e) => {
      console.warn("[models-catalog] auth status failed:", e instanceof Error ? e.message : e);
      return "";
    }),
  ]);

  const modelsParsed = extractJson<{ models?: RawModel[] }>(modelsRaw);
  const rawModels = (modelsParsed?.models || [])
    .map(toCatalogModel)
    .filter((m): m is CatalogModel => m !== null);
  const auth = extractJson<AuthStatus>(authRaw);

  const synthesized = synthesizeCuratedEntries(rawModels);
  const models = [...rawModels, ...synthesized];

  const providerIds = Array.from(new Set(models.map((m) => m.provider)));
  const providers: CatalogProvider[] = providerIds
    .map((id) => {
      const status = isProviderConfigured(id, auth);
      return {
        id,
        configured: status.configured,
        authKind: status.kind,
        sourceLabel: status.source,
        modelCount: models.filter((m) => m.provider === id).length,
      };
    })
    .sort((a, b) => {
      if (a.configured !== b.configured) return a.configured ? -1 : 1;
      return a.id.localeCompare(b.id);
    });

  return {
    providers,
    models,
    curated: CURATED_MODELS,
    agentDir,
    generatedAt: Date.now(),
    complete: opts.all,
  };
}

export async function getModelCatalog(
  opts: { all?: boolean; force?: boolean } = {}
): Promise<ModelCatalog> {
  const { all = false, force = false } = opts;
  const slot = all ? "full" : "fast";
  const now = Date.now();
  if (!force && cache[slot] && cache[slot]!.expiresAt > now) {
    return cache[slot]!.catalog;
  }
  const catalog = await buildCatalog({ all });
  const ttl = all ? FULL_CACHE_TTL_MS : FAST_CACHE_TTL_MS;
  cache[slot] = { catalog, expiresAt: now + ttl };
  return catalog;
}

export function isModelAvailable(
  catalog: ModelCatalog,
  modelId: string
): { ok: boolean; reason?: string } {
  const model = catalog.models.find((m) => m.id === modelId);
  if (!model) return { ok: false, reason: `Model "${modelId}" not in catalog` };
  const provider = catalog.providers.find((p) => p.id === model.provider);
  if (!provider) return { ok: false, reason: `Provider "${model.provider}" not in catalog` };
  if (!provider.configured)
    return { ok: false, reason: `Provider "${model.provider}" not configured` };
  return { ok: true };
}

export function invalidateCatalogCache(): void {
  cache.fast = undefined;
  cache.full = undefined;
}
