import fs from "fs";
import path from "path";
import { BASE, brandDir } from "@/lib/data/paths";

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

  return false;
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
