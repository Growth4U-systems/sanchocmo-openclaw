import { buildBrandRuntimeEnv } from "@/lib/brand-env";
import { integrationsFile } from "@/lib/data/paths";
import { readJSON } from "@/lib/data/json-io";

export interface YalcRuntimeConfig {
  baseUrl: string;
  token?: string;
  slug?: string;
  tenant?: string;
}

export class YalcClientError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "YalcClientError";
    this.status = status;
    this.body = body;
  }
}

function envPrefix(slug?: string): string | null {
  if (!slug) return null;
  const key = slug
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return key || null;
}

type YalcEnv = Record<string, string | undefined>;

interface StoredYalcIntegration {
  config?: Record<string, unknown>;
}

interface StoredIntegrations {
  dataSources?: Record<string, StoredYalcIntegration>;
  yalc?: StoredYalcIntegration;
}

function nonEmpty(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function storedYalcConfig(slug: string): Record<string, unknown> {
  const integrations = readJSON<StoredIntegrations>(integrationsFile(slug), {});
  const entry = integrations.dataSources?.yalc ?? integrations.yalc;
  return entry?.config && typeof entry.config === "object" ? entry.config : {};
}

export function resolveYalcConfigFromSources(
  slug: string | undefined,
  env: YalcEnv,
  stored: Record<string, unknown> = {},
): YalcRuntimeConfig {
  const prefix = envPrefix(slug);
  const baseUrl =
    nonEmpty(stored.BASE_URL) ||
    nonEmpty(stored.baseUrl) ||
    (prefix ? nonEmpty(env[`${prefix}_YALC_BASE_URL`]) : undefined) ||
    nonEmpty(env.YALC_BASE_URL) ||
    "http://localhost:3847";
  const token =
    (prefix ? nonEmpty(env[`${prefix}_YALC_API_TOKEN`]) : undefined) ||
    nonEmpty(env.YALC_API_TOKEN) ||
    undefined;
  const tenant = nonEmpty(stored.TENANT) || nonEmpty(stored.tenant) || slug;

  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    token,
    slug,
    tenant,
  };
}

export function resolveYalcConfig(slug?: string): YalcRuntimeConfig {
  const env = slug ? buildBrandRuntimeEnv(slug) : process.env;
  return resolveYalcConfigFromSources(
    slug,
    env,
    slug ? storedYalcConfig(slug) : {},
  );
}

export function publicYalcConfig(config: YalcRuntimeConfig) {
  return {
    baseUrl: config.baseUrl,
    auth: config.token ? "bearer" : "none",
  };
}

/**
 * Whether Outreach (YALC) is intentionally wired up for this install/brand.
 * `resolveYalcConfig` always returns a localhost fallback baseUrl, so a bare
 * default can't be told apart from a real config by the URL alone. We treat
 * an explicitly-set YALC_BASE_URL or YALC_API_TOKEN (brand-prefixed or global)
 * as the signal that the operator turned Outreach on. When false, the cockpit
 * shows a "set up Outreach" placeholder instead of a wall of unreachable errors.
 */
export function isYalcConfigured(slug?: string): boolean {
  const env = slug ? buildBrandRuntimeEnv(slug) : process.env;
  const stored = slug ? storedYalcConfig(slug) : {};
  const prefix = envPrefix(slug);
  const candidates = [
    stored.BASE_URL,
    stored.baseUrl,
    prefix ? env[`${prefix}_YALC_BASE_URL`] : undefined,
    env.YALC_BASE_URL,
    prefix ? env[`${prefix}_YALC_API_TOKEN`] : undefined,
    env.YALC_API_TOKEN,
  ];
  return candidates.some((v) => typeof v === "string" && v.trim() !== "");
}

export async function yalcFetch<T = unknown>(
  config: YalcRuntimeConfig,
  path: string,
  init: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  const url = new URL(path.startsWith("/") ? path : `/${path}`, config.baseUrl);
  // Scope every call to the brand's YALC tenant. Without this the cockpit
  // always hits the `default` tenant, so all brands share one brain/campaigns.
  const tenant = config.tenant || config.slug;
  if (tenant) url.searchParams.set("tenant", tenant);
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...init.headers,
  };
  if (config.token) headers.Authorization = `Bearer ${config.token}`;
  if (init.body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(url, {
    method: init.method || (init.body === undefined ? "GET" : "POST"),
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: init.signal,
  });

  const contentType = res.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await res.json()
    : await res.text();
  if (!res.ok) {
    const message =
      payload && typeof payload === "object" && "message" in payload
        ? String((payload as { message: unknown }).message)
        : payload && typeof payload === "object" && "error" in payload
          ? String((payload as { error: unknown }).error)
          : `YALC ${res.status} ${res.statusText}`;
    throw new YalcClientError(message, res.status, payload);
  }
  return payload as T;
}

export function yalcErrorResponse(err: unknown) {
  if (err instanceof YalcClientError) {
    return {
      status: err.status,
      body: { error: err.message, yalcStatus: err.status, detail: err.body },
    };
  }
  return {
    status: 502,
    body: { error: err instanceof Error ? err.message : "YALC unreachable" },
  };
}

export function countYalcRows(value: unknown): number | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  for (const key of ["campaigns", "leads", "items", "providers", "skills"]) {
    const rows = obj[key];
    if (Array.isArray(rows)) return rows.length;
  }
  if (typeof obj.total === "number") return obj.total;
  return null;
}
