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
  auth: ProviderAuthState;
}

export type ProviderAuthRoute = "subscription" | "api" | "env" | "missing";

export interface ProviderAuthState {
  effective: ProviderAuthRoute;
  preferred: ProviderAuthRoute;
  effectiveLabel: string | null;
  preferredLabel: string | null;
  subscriptionSupported: boolean;
  hasSubscription: boolean;
  hasApiKey: boolean;
  hasEnv: boolean;
  subscriptionLabels: string[];
  unsupportedSubscriptionLabels: string[];
  apiKeyLabels: string[];
  envLabel: string | null;
  authProviders: string[];
}

export interface CatalogModel {
  id: string;
  name: string;
  provider: string;
  contextWindow?: number;
  reasoning?: boolean;
  available?: boolean;
  missing?: boolean;
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

// Shortlist shown by default in the model picker (the rest is behind "todos").
// Kept explicit because `openclaw models list --all` can't enumerate provider
// catalogs when the engine runs on subscription/OAuth (no provider API keys), so
// the full registry is unreliable here — these always appear and are selectable.
export const CURATED_MODELS = [
  // Codex / OpenAI (subscription)
  "codex/gpt-5.5",
  "codex/gpt-5.4",
  "codex/gpt-5.4-mini",
  "openai-codex/gpt-5.3-codex",
  // Anthropic (subscription / API)
  "anthropic/claude-opus-4-8",
  "anthropic/claude-opus-4-7",
  "anthropic/claude-opus-4-6",
  "anthropic/claude-sonnet-4-6",
  // Google (native, env key)
  "google/gemini-2.5-flash",
  // OpenRouter (env key) — many providers behind one key
  "openrouter/openai/gpt-5.5",
  "openrouter/z-ai/glm-5.2",
  "openrouter/moonshotai/kimi-k2.7-code",
  "openrouter/qwen/qwen3.7-plus",
  "openrouter/qwen/qwen3.7-max",
  "openrouter/minimax/minimax-m3",
  "openrouter/google/gemini-3.5-flash",
  "openrouter/google/gemma-4-26b-a4b-it",
];

const CURATED_MODEL_METADATA: Record<string, Pick<CatalogModel, "contextWindow" | "tags">> = {
  "anthropic/claude-opus-4-8": {
    contextWindow: 1_000_000,
    tags: ["extended-context", "1m"],
  },
  "anthropic/claude-opus-4-7": {
    contextWindow: 1_000_000,
    tags: ["extended-context", "1m"],
  },
  "anthropic/claude-opus-4-6": {
    contextWindow: 1_000_000,
    tags: ["extended-context", "1m"],
  },
  "anthropic/claude-sonnet-4-6": {
    contextWindow: 1_000_000,
    tags: ["extended-context", "1m"],
  },
};

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
  available?: boolean;
  missing?: boolean;
  input?: string | string[];
  tags?: string[];
}

interface AuthProviderEntry {
  provider: string;
  effective?: { kind?: string; detail?: string };
  env?: { source?: string; value?: string };
  profiles?: {
    count?: number;
    oauth?: number;
    token?: number;
    apiKey?: number;
    labels?: string[];
  };
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
    oauth?: {
      profiles?: AuthProfile[];
      providers?: AuthProviderProfiles[];
    };
  };
}

interface AuthProfile {
  profileId?: string;
  provider?: string;
  type?: string;
  status?: string;
  source?: string;
  label?: string;
}

interface AuthProviderProfiles {
  provider?: string;
  status?: string;
  profiles?: AuthProfile[];
  effectiveProfiles?: AuthProfile[];
}

const PROVIDER_AUTH_ALIASES: Record<string, string[]> = {
  // OpenClaw model ids use `codex/...`, while auth status reports the
  // Codex subscription provider as `openai-codex`.
  codex: ["openai-codex"],
  // Anthropic model ids execute through the Claude CLI subscription profile
  // when that OAuth route is configured in OpenClaw.
  anthropic: ["claude-cli"],
};

const UNSUPPORTED_SUBSCRIPTION_ALIASES: Record<string, string[]> = {};

const SUBSCRIPTION_RUNTIME_PROVIDERS = new Set(["anthropic", "claude-cli", "codex", "openai-codex"]);
const ANTHROPIC_API_KEY_RE = /=token:sk-ant-api/i;

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((v): v is string => typeof v === "string" && v.length > 0)));
}

function authProviderIdsForModelProvider(providerId: string): string[] {
  return uniqueStrings([providerId, ...(PROVIDER_AUTH_ALIASES[providerId] || [])]);
}

function unsupportedSubscriptionProviderIdsForModelProvider(providerId: string): string[] {
  return uniqueStrings(UNSUPPORTED_SUBSCRIPTION_ALIASES[providerId] || []);
}

function supportsSubscriptionRuntime(authProviders: string[]): boolean {
  return authProviders.some((provider) => SUBSCRIPTION_RUNTIME_PROVIDERS.has(provider));
}

function authRouteForProfileType(type: string | undefined): ProviderAuthRoute {
  if (type === "oauth") return "subscription";
  if (type === "token" || type === "apiKey") return "api";
  return "missing";
}

function authRouteForEffectiveKind(kind: string | undefined): ProviderAuthRoute {
  if (!kind || kind === "missing") return "missing";
  if (kind === "oauth") return "subscription";
  if (kind === "token" || kind === "apiKey") return "api";
  if (kind === "env") return "env";
  // `profiles` is a container, not an auth route. Resolve it from the actual
  // profile labels/counts below so OAuth subscriptions do not appear as API keys.
  if (kind === "profiles") return "missing";
  return "api";
}

function isAnthropicProvider(providerId: string): boolean {
  return providerId === "anthropic";
}

function isApiCredentialLabel(providerId: string, label: string): boolean {
  if (isAnthropicProvider(providerId)) {
    return ANTHROPIC_API_KEY_RE.test(label) || /=apiKey:/i.test(label);
  }
  return /=token:|=apiKey:/i.test(label);
}

function isUnsupportedSubscriptionCredentialLabel(_providerId: string, _label: string): boolean {
  return false;
}

function authKindForRoute(route: ProviderAuthRoute): string {
  if (route === "subscription") return "oauth";
  if (route === "api") return "apiKey";
  if (route === "env") return "env";
  return "missing";
}

function envCredentialLabel(entry: AuthProviderEntry | undefined): string | null {
  if (!entry) return null;
  const source = entry.env?.source || null;
  const value = entry.env?.value || entry.effective?.detail || null;
  if (source && value && source !== value) return `${source} · ${value}`;
  return source || value;
}

function inferReasoningCapability(id: string, explicit?: boolean): boolean | undefined {
  if (typeof explicit === "boolean") return explicit;
  const key = id.toLowerCase();
  if (CURATED_MODELS.includes(id)) return true;
  return (
    /^codex\/gpt-5/.test(key) ||
    /^openai-codex\/gpt-5/.test(key) ||
    /^openai\/gpt-5/.test(key) ||
    /(^|\/)claude-(opus|sonnet)-4/.test(key) ||
    /(^|\/)gemini-2\.5/.test(key)
  );
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
    contextWindow: CURATED_MODEL_METADATA[key]?.contextWindow ?? m.contextWindow,
    reasoning: inferReasoningCapability(key, m.reasoning),
    available: m.available,
    missing: m.missing,
    input: Array.isArray(m.input) ? m.input : m.input ? [m.input] : undefined,
    curated: CURATED_MODELS.includes(key),
    tags: uniqueStrings([...(m.tags || []), ...(CURATED_MODEL_METADATA[key]?.tags || [])]),
  };
}

export function summarizeProviderAuth(
  providerId: string,
  auth: AuthStatus | null
): ProviderAuthState {
  const authProviders = authProviderIdsForModelProvider(providerId);
  const unsupportedSubscriptionProviders =
    unsupportedSubscriptionProviderIdsForModelProvider(providerId);
  const subscriptionSupported = supportsSubscriptionRuntime(authProviders);
  const empty: ProviderAuthState = {
    effective: "missing",
    preferred: "missing",
    effectiveLabel: null,
    preferredLabel: null,
    subscriptionSupported,
    hasSubscription: false,
    hasApiKey: false,
    hasEnv: false,
    subscriptionLabels: [],
    unsupportedSubscriptionLabels: [],
    apiKeyLabels: [],
    envLabel: null,
    authProviders,
  };
  if (!auth?.auth) return empty;

  const provs = auth.auth.providers || [];
  const providerEntries = provs.filter((p) => authProviders.includes(p.provider));
  const direct = provs.find((p) => p.provider === providerId);
  const effectiveEntry = direct || providerEntries[0] || null;
  const oauthProviders = auth.auth.oauth?.providers || [];
  const oauthProfiles = auth.auth.oauth?.profiles || [];
  const directEffectiveProfiles =
    oauthProviders.find((p) => p.provider === effectiveEntry?.provider)?.effectiveProfiles || [];
  const directEffectiveProfile = directEffectiveProfiles[0];
  const directEffectiveProfileRoute = authRouteForProfileType(directEffectiveProfile?.type);
  const directEffectiveRoute =
    directEffectiveProfileRoute === "subscription" && !subscriptionSupported
      ? "missing"
      : directEffectiveProfileRoute;

  const subscriptionLabels = uniqueStrings([
    ...(subscriptionSupported
      ? oauthProfiles
          .filter((p) => authProviders.includes(p.provider || "") && p.type === "oauth")
          .map((p) => p.label || p.profileId)
      : []),
    ...(subscriptionSupported
      ? providerEntries.flatMap((p) =>
          (p.profiles?.labels || []).filter((label) => /=OAuth\b/i.test(label))
        )
      : []),
    ...(subscriptionSupported
      ? (auth.auth.providersWithOAuth || []).filter((label) =>
          authProviders.some((id) => label === id || label.startsWith(`${id} `))
        )
      : []),
  ]);

  const unsupportedSubscriptionLabels = uniqueStrings([
    ...oauthProfiles
      .filter((p) => unsupportedSubscriptionProviders.includes(p.provider || "") && p.type === "oauth")
      .map((p) => p.label || p.profileId),
    ...(auth.auth.providersWithOAuth || []).filter((label) =>
      unsupportedSubscriptionProviders.some((id) => label === id || label.startsWith(`${id} `))
    ),
    ...providerEntries.flatMap((p) =>
      (p.profiles?.labels || []).filter((label) =>
        isUnsupportedSubscriptionCredentialLabel(providerId, label)
      )
    ),
  ]);

  const apiKeyLabels = uniqueStrings([
    ...providerEntries.flatMap((p) =>
      (p.profiles?.labels || []).filter((label) => isApiCredentialLabel(providerId, label))
    ),
    ...providerEntries.flatMap((p) => {
      if ((p.profiles?.token || 0) > 0 || (p.profiles?.apiKey || 0) > 0) {
        return (p.profiles?.labels || [])
          .filter((label) => !/=OAuth\b/i.test(label))
          .filter((label) => isApiCredentialLabel(providerId, label));
      }
      return [];
    }),
  ]);

  const envEntry = providerEntries.find((p) => p.env?.source || p.effective?.kind === "env");
  const envLabel = envCredentialLabel(envEntry);
  const hasEnv = Boolean(envEntry);
  const runtimeRoute = subscriptionSupported
    ? (auth.auth.runtimeAuthRoutes || []).find(
        (r) =>
          r.status === "usable" &&
          (authProviders.includes(r.runtime) || authProviders.includes(r.authProvider))
      )
    : undefined;

  const hasSubscription = subscriptionLabels.length > 0 || Boolean(runtimeRoute);
  const hasApiKey = apiKeyLabels.length > 0;

  let effective = directEffectiveRoute;
  let effectiveLabel = directEffectiveProfile?.label || directEffectiveProfile?.profileId || null;
  if (isAnthropicProvider(providerId) && hasSubscription) {
    effective = "subscription";
    effectiveLabel = subscriptionLabels[0] || (runtimeRoute ? `via ${runtimeRoute.authProvider}` : null);
  }
  if (isAnthropicProvider(providerId) && effective === "api" && !hasApiKey && !hasEnv) {
    effective = "missing";
    effectiveLabel = null;
  }

  if (effective === "missing" && effectiveEntry) {
    effective = authRouteForEffectiveKind(effectiveEntry.effective?.kind);
    if (effective === "subscription" && !subscriptionSupported) {
      effective = "missing";
    }
    if (isAnthropicProvider(providerId) && effective === "api" && !hasApiKey && !hasEnv) {
      effective = "missing";
    }
    effectiveLabel =
      envCredentialLabel(effectiveEntry) ||
      apiKeyLabels[0] ||
      unsupportedSubscriptionLabels[0] ||
      effectiveEntry.effective?.detail ||
      effectiveEntry.provider;
  }

  if (effective === "missing" && runtimeRoute) {
    effective = "subscription";
    effectiveLabel = `via ${runtimeRoute.authProvider}`;
  }

  if (effective === "missing" && hasSubscription) {
    effective = "subscription";
    effectiveLabel = subscriptionLabels[0] || null;
  } else if (effective === "missing" && hasApiKey) {
    effective = "api";
    effectiveLabel = apiKeyLabels[0] || null;
  } else if (effective === "missing" && hasEnv) {
    effective = "env";
    effectiveLabel = envLabel;
  }

  const preferred: ProviderAuthRoute = hasSubscription
    ? "subscription"
    : hasApiKey
      ? "api"
      : hasEnv
        ? "env"
        : "missing";

  const preferredLabel =
    preferred === "subscription"
      ? subscriptionLabels[0] || (runtimeRoute ? `via ${runtimeRoute.authProvider}` : null)
      : preferred === "api"
        ? apiKeyLabels[0] || null
        : preferred === "env"
          ? envLabel
          : null;

  return {
    effective,
    preferred,
    effectiveLabel,
    preferredLabel,
    subscriptionSupported,
    hasSubscription,
    hasApiKey,
    hasEnv,
    subscriptionLabels,
    unsupportedSubscriptionLabels,
    apiKeyLabels,
    envLabel,
    authProviders,
  };
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
      contextWindow: CURATED_MODEL_METADATA[id]?.contextWindow,
      reasoning: inferReasoningCapability(id),
      curated: true,
      tags: CURATED_MODEL_METADATA[id]?.tags || [],
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
      const status = summarizeProviderAuth(id, auth);
      const configured = status.effective !== "missing" || status.preferred !== "missing";
      const effectiveRoute = status.effective !== "missing" ? status.effective : status.preferred;
      return {
        id,
        configured,
        authKind: authKindForRoute(effectiveRoute),
        sourceLabel: status.effectiveLabel || status.preferredLabel,
        modelCount: models.filter((m) => m.provider === id).length,
        auth: status,
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
): { ok: boolean; reason?: string; warning?: string } {
  const model = catalog.models.find((m) => m.id === modelId);
  if (!model) return { ok: false, reason: `Model "${modelId}" not in catalog` };
  // openclaw itself does not validate model ids on `models set` / `config
  // patch` — it stores whatever string it's given and only fails when an agent
  // turn actually runs. So this is the layer that has to reject obviously
  // unusable selections. `missing` is openclaw's explicit "not in my registry"
  // flag from `models list --all`; never persist one of those.
  if (model.missing === true) {
    return { ok: false, reason: `Model "${modelId}" is reported missing by openclaw` };
  }
  const provider = catalog.providers.find((p) => p.id === model.provider);
  if (!provider) return { ok: false, reason: `Provider "${model.provider}" not in catalog` };
  // A configured-but-unauthed provider is the silent-failure case the picker
  // is most prone to: the id is valid, the save succeeds, but the model never
  // responds at runtime. Allow the write (auth can be added afterwards) but
  // surface a warning the API/UI can show instead of failing opaquely later.
  if (!provider.configured) {
    return {
      ok: true,
      warning: `Provider "${model.provider}" sin auth configurada — el modelo no responderá hasta cargar credenciales.`,
    };
  }
  return { ok: true };
}

export function invalidateCatalogCache(): void {
  cache.fast = undefined;
  cache.full = undefined;
}
