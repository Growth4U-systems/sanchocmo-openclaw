import fs from "fs";
import path from "path";
import { BASE, brandDir } from "@/lib/data/paths";

type EnvLike = Record<string, string | undefined>;

/**
 * Read a credential from the per-brand `.env` first (the convention used by
 * `/api/system/api-connect`: `{SLUG_UPPER}_{API_UPPER}_{KEY_UPPER}`), falling
 * back to the workspace-level `~/.openclaw/.env` (one level above BASE), and
 * finally to `process.env`. Returns `undefined` if not found anywhere.
 */
export function readBrandSecret(
  slug: string,
  apiId: string,
  key: string,
): string | undefined {
  const slugUpper = slug.replace(/-/g, "_").toUpperCase();
  const apiUpper = apiId.replace(/-/g, "_").toUpperCase();
  const keyUpper = key.toUpperCase();
  const scoped = `${slugUpper}_${apiUpper}_${keyUpper}`;
  const globalKey = `${apiUpper}_${keyUpper}`;

  const brandEnv = parseEnvFile(path.join(brandDir(slug), ".env"));
  if (brandEnv[scoped]) return brandEnv[scoped];
  if (brandEnv[globalKey]) return brandEnv[globalKey];

  const workspaceEnv = parseEnvFile(path.join(BASE, "..", ".env"));
  if (workspaceEnv[scoped]) return workspaceEnv[scoped];
  if (workspaceEnv[globalKey]) return workspaceEnv[globalKey];

  if (process.env[scoped]) return process.env[scoped];
  if (process.env[globalKey]) return process.env[globalKey];

  return undefined;
}

/**
 * Check whether a fully-qualified env var name (e.g. `GROWTH4U_METRICOOL_API_TOKEN`)
 * is reachable through the same precedence chain as `readBrandSecret`:
 * brand/.env → workspace/.env → process.env.
 *
 * Used by `/api/system/api-health` to verify that envVars listed in
 * `integrations.json` still exist before reporting an integration as
 * connected — otherwise a successful test from months ago keeps lying
 * after the env entry is dropped (migration, redeploy, manual edit).
 */
export function brandEnvHas(slug: string, envName: string): boolean {
  const brandEnv = parseEnvFile(path.join(brandDir(slug), ".env"));
  if (brandEnv[envName]) return true;

  const workspaceEnv = parseEnvFile(path.join(BASE, "..", ".env"));
  if (workspaceEnv[envName]) return true;

  if (process.env[envName]) return true;

  const fallbackName = unscopedBrandEnvName(slug, envName);
  if (fallbackName && fallbackName !== envName) {
    if (brandEnv[fallbackName]) return true;
    if (workspaceEnv[fallbackName]) return true;
    if (process.env[fallbackName]) return true;
  }

  return false;
}

/**
 * Build the environment a client-scoped runtime should receive.
 *
 * Global env values are loaded first (`process.env` + workspace `.env`), then
 * per-brand values override them. Scoped per-brand keys such as
 * `XHYP_FIRECRAWL_API_KEY` are also exposed as their flat runtime aliases
 * (`FIRECRAWL_API_KEY`) so existing tools that read standard env names still
 * honor the Local → Global precedence contract.
 */
export function buildBrandRuntimeEnv(
  slug: string,
  baseEnv: EnvLike = process.env,
): Record<string, string> {
  const workspaceEnv = parseEnvFile(path.join(BASE, "..", ".env"));
  const brandEnv = parseEnvFile(path.join(brandDir(slug), ".env"));
  const out: Record<string, string> = {};

  copyEnv(out, baseEnv);
  copyEnv(out, workspaceEnv);

  applyScopedAliases(out, baseEnv, slug);
  applyScopedAliases(out, workspaceEnv, slug);

  copyEnv(out, brandEnv);
  applyScopedAliases(out, brandEnv, slug);

  return out;
}

export function unscopedBrandEnvName(slug: string, envName: string): string | null {
  const prefix = `${normalizeEnvPart(slug)}_`;
  return envName.startsWith(prefix) ? envName.slice(prefix.length) : null;
}

function normalizeEnvPart(value: string): string {
  return value.replace(/-/g, "_").toUpperCase();
}

function copyEnv(target: Record<string, string>, source: EnvLike): void {
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === "string" && value !== "") target[key] = value;
  }
}

function applyScopedAliases(target: Record<string, string>, source: EnvLike, slug: string): void {
  const prefix = `${normalizeEnvPart(slug)}_`;
  for (const [key, value] of Object.entries(source)) {
    if (typeof value !== "string" || value === "" || !key.startsWith(prefix)) continue;
    const unscoped = key.slice(prefix.length);
    if (unscoped) target[unscoped] = value;
  }
}

function parseEnvFile(absPath: string): Record<string, string> {
  let content: string;
  try {
    content = fs.readFileSync(absPath, "utf-8");
  } catch {
    return {};
  }
  const out: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    out[trimmed.slice(0, eq)] = trimmed.slice(eq + 1).replace(/^"(.*)"$/, "$1");
  }
  return out;
}
