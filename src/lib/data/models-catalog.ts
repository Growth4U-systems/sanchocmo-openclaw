import { execSync } from "child_process";
import { EXEC_PATH } from "@/lib/data/paths";

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
}

export interface ModelCatalog {
  providers: CatalogProvider[];
  models: CatalogModel[];
  curated: string[];
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

function shell(cmd: string, timeoutMs = 15_000): string {
  return execSync(cmd, {
    timeout: timeoutMs,
    encoding: "utf-8",
    env: { ...process.env, PATH: EXEC_PATH },
    stdio: ["ignore", "pipe", "pipe"],
  }).toString();
}

function listModels(): CatalogModel[] {
  const raw = shell("openclaw models list --json 2>/dev/null");
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  const models: CatalogModel[] = [];
  for (const line of lines) {
    if (!line.startsWith("{")) continue;
    try {
      const obj = JSON.parse(line) as Record<string, unknown>;
      if (typeof obj.id === "string" && typeof obj.provider === "string") {
        const canonicalId = `${obj.provider}/${obj.id}`;
        models.push({
          id: canonicalId,
          name: (obj.name as string) || (obj.id as string),
          provider: obj.provider as string,
          contextWindow: obj.contextWindow as number | undefined,
          reasoning: obj.reasoning as boolean | undefined,
          input: obj.input as string[] | undefined,
          curated: CURATED_MODELS.includes(canonicalId),
        });
      }
    } catch {
      // skip malformed line
    }
  }
  return models;
}

function authProviders(): CatalogProvider[] {
  const raw = shell("openclaw models auth status 2>/dev/null");
  const start = raw.indexOf("{");
  if (start < 0) return [];
  let json: { auth?: { providers?: unknown[] } };
  try {
    json = JSON.parse(raw.slice(start));
  } catch {
    return [];
  }
  const providers = json.auth?.providers as Array<Record<string, unknown>> | undefined;
  if (!providers) return [];
  return providers.map((p) => {
    const eff = (p.effective as Record<string, unknown>) || {};
    const env = (p.env as Record<string, unknown>) || {};
    const profiles = (p.profiles as Record<string, unknown>) || {};
    const labels = (profiles.labels as string[]) || [];
    return {
      id: (p.provider as string) || "",
      configured: (eff.kind as string) !== "missing",
      authKind: (eff.kind as string) || "missing",
      sourceLabel: (env.source as string) || labels[0] || null,
      modelCount: 0,
    };
  });
}

export function getModelCatalog(force = false): ModelCatalog {
  const now = Date.now();
  if (!force && cached && cached.expiresAt > now) {
    return cached.catalog;
  }
  const models = listModels();
  const providers = authProviders().map((p) => ({
    ...p,
    modelCount: models.filter((m) => m.provider === p.id).length,
  }));
  const catalog: ModelCatalog = {
    providers,
    models,
    curated: CURATED_MODELS,
    generatedAt: now,
  };
  cached = { catalog, expiresAt: now + CACHE_TTL_MS };
  return catalog;
}

export function isModelAvailable(catalog: ModelCatalog, modelId: string): {
  ok: boolean;
  reason?: string;
} {
  const model = catalog.models.find((m) => m.id === modelId);
  if (!model) return { ok: false, reason: `Model "${modelId}" not in catalog` };
  const provider = catalog.providers.find((p) => p.id === model.provider);
  if (!provider) return { ok: false, reason: `Provider "${model.provider}" not in catalog` };
  if (!provider.configured) return { ok: false, reason: `Provider "${model.provider}" not configured` };
  return { ok: true };
}

export function invalidateCatalogCache(): void {
  cached = null;
}
