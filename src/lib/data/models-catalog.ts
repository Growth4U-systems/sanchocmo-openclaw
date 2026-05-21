import { execSync } from "child_process";
import { EXEC_PATH } from "@/lib/data/paths";
import { listAgents } from "@/lib/data/openclaw-config";

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

const CACHE_TTL_MS = 30_000;
let cached: { catalog: ModelCatalog; expiresAt: number } | null = null;

function shell(cmd: string, extraEnv?: Record<string, string>, timeoutMs = 20_000): string {
  return execSync(cmd, {
    timeout: timeoutMs,
    encoding: "utf-8",
    env: { ...process.env, ...extraEnv, PATH: EXEC_PATH },
    stdio: ["ignore", "pipe", "pipe"],
  }).toString();
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
  available?: boolean;
  missing?: boolean;
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

function listAllModels(env?: Record<string, string>): CatalogModel[] {
  const raw = shell("openclaw models list --all --json 2>/dev/null", env);
  const parsed = extractJson<{ models?: RawModel[] }>(raw);
  if (!parsed?.models) return [];
  return parsed.models
    .filter((m) => typeof m.key === "string" && m.key.includes("/"))
    .map((m) => {
      const key = m.key as string;
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
    });
}

function getAuthStatus(env?: Record<string, string>): AuthStatus | null {
  const raw = shell("openclaw infer model auth status --json 2>/dev/null", env);
  return extractJson<AuthStatus>(raw);
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
    return {
      configured: true,
      kind: "oauth",
      source: `via ${route.authProvider}`,
    };
  }

  const oauthList = auth.auth.providersWithOAuth || [];
  const oauthHit = oauthList.find((label) => label.startsWith(`${providerId} `) || label === providerId);
  if (oauthHit) {
    return { configured: true, kind: "oauth", source: oauthHit };
  }

  return { configured: false, kind: "missing", source: null };
}

export function getModelCatalog(force = false): ModelCatalog {
  const now = Date.now();
  if (!force && cached && cached.expiresAt > now) {
    return cached.catalog;
  }

  const agentDir = pickPrimaryAgentDir();
  const env = agentDir ? { OPENCLAW_AGENT_DIR: agentDir } : undefined;

  const models = listAllModels(env);
  const auth = getAuthStatus(env);

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

  const catalog: ModelCatalog = {
    providers,
    models,
    curated: CURATED_MODELS,
    agentDir,
    generatedAt: now,
  };
  cached = { catalog, expiresAt: now + CACHE_TTL_MS };
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
  cached = null;
}
