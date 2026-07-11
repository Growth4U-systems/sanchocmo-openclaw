import fs from "node:fs";
import path from "node:path";

function normalizeEnvPart(value) {
  return String(value || "").replace(/-/g, "_").toUpperCase();
}

function parseEnvFile(filePath) {
  try {
    const out = {};
    const content = fs.readFileSync(filePath, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq);
      let value = trimmed.slice(eq + 1);
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function copyEnv(target, source) {
  for (const [key, value] of Object.entries(source || {})) {
    if (typeof value === "string" && value !== "") target[key] = value;
  }
}

function applyScopedAliases(target, source, slug) {
  const prefix = `${normalizeEnvPart(slug)}_`;
  for (const [key, value] of Object.entries(source || {})) {
    if (typeof value !== "string" || value === "" || !key.startsWith(prefix)) continue;
    const flat = key.slice(prefix.length);
    if (flat) target[flat] = value;
  }
}

export function resolveWorkspaceDir(env = process.env) {
  if (env.MC_WORKSPACE) return env.MC_WORKSPACE;
  const home = env.OPENCLAW_HOME || path.join(env.HOME || "/root", ".openclaw");
  return path.join(home, "workspace-sancho");
}

export function buildBrandRuntimeEnv(slug, opts = {}) {
  const env = opts.env || process.env;
  const workspaceDir = opts.workspaceDir || resolveWorkspaceDir(env);
  const workspaceEnv = parseEnvFile(path.join(workspaceDir, "..", ".env"));
  const brandEnv = parseEnvFile(path.join(workspaceDir, "brand", slug, ".env"));
  const out = {};

  copyEnv(out, env);
  copyEnv(out, workspaceEnv);

  applyScopedAliases(out, env, slug);
  applyScopedAliases(out, workspaceEnv, slug);

  copyEnv(out, brandEnv);
  applyScopedAliases(out, brandEnv, slug);

  return out;
}

export function applyBrandEnvToProcess(slug, opts = {}) {
  const target = opts.targetEnv || process.env;
  const next = buildBrandRuntimeEnv(slug, { env: target, workspaceDir: opts.workspaceDir });
  const previous = new Map();

  for (const [key, value] of Object.entries(next)) {
    previous.set(key, Object.prototype.hasOwnProperty.call(target, key) ? target[key] : undefined);
    target[key] = value;
  }

  return () => {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) delete target[key];
      else target[key] = value;
    }
  };
}

export function applyRuntimeEnvToProcess(values, opts = {}) {
  const target = opts.targetEnv || process.env;
  const previous = new Map();

  for (const [key, value] of Object.entries(values || {})) {
    if (typeof value !== "string") continue;
    previous.set(key, Object.prototype.hasOwnProperty.call(target, key) ? target[key] : undefined);
    target[key] = value;
  }

  return () => {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) delete target[key];
      else target[key] = value;
    }
  };
}
