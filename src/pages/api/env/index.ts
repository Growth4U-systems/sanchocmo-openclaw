import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";

const ENV_FILE = path.join(BASE, "..", ".env");
const OPENCLAW_ROOT = path.join(BASE, "..");
const ANTHROPIC_PROFILE_ID = "anthropic:default";
const ANTHROPIC_TOKEN_REF = { source: "env", provider: "default", id: "ANTHROPIC_API_KEY" };

const SERVICE_ENV_MAP: Record<string, { key: string; label: string; placeholder: string }[]> = {
  anthropic: [{ key: "ANTHROPIC_API_KEY", label: "API Key", placeholder: "sk-ant-..." }],
  openrouter: [{ key: "OPENROUTER_API_KEY", label: "API Key", placeholder: "sk-or-..." }],
  openai: [{ key: "OPENAI_API_KEY", label: "API Key", placeholder: "sk-..." }],
  gemini: [{ key: "GEMINI_API_KEY", label: "API Key", placeholder: "AIza..." }],
  xai: [{ key: "XAI_API_KEY", label: "API Key", placeholder: "xai-..." }],
  minimax: [{ key: "MINIMAX_API_KEY", label: "API Key", placeholder: "eyJ..." }],
  brave: [{ key: "BRAVE_API_KEY", label: "API Key", placeholder: "BSA..." }],
  apify: [{ key: "APIFY_API_KEY", label: "API Key", placeholder: "apify_api_..." }],
  firecrawl: [{ key: "FIRECRAWL_API_KEY", label: "API Key", placeholder: "fc-..." }],
  serper: [{ key: "SERPER_API_KEY", label: "API Key", placeholder: "" }],
  dataforseo: [
    { key: "DATAFORSEO_LOGIN", label: "Login (email)", placeholder: "you@email.com" },
    { key: "DATAFORSEO_PASSWORD", label: "Password", placeholder: "" },
  ],
  notion: [{ key: "NOTION_API_KEY", label: "Integration Token", placeholder: "ntn_..." }],
  supabase: [
    { key: "SUPABASE_URL", label: "Project URL", placeholder: "https://xxx.supabase.co" },
    { key: "SUPABASE_ANON_KEY", label: "Anon Key", placeholder: "eyJ..." },
  ],
  fal: [{ key: "FAL_API_KEY", label: "API Key", placeholder: "" }],
  wavespeed: [{ key: "WAVESPEED_API_KEY", label: "API Key", placeholder: "" }],
  dumpling: [{ key: "DUMPLING_API_KEY", label: "API Key", placeholder: "" }],
  slack: [{ key: "SLACK_BOT_TOKEN", label: "Bot Token", placeholder: "xoxb-..." }],
  instantly: [{ key: "INSTANTLY_API_KEY", label: "API Key", placeholder: "" }],
  metricool: [{ key: "METRICOOL_API_KEY", label: "API Key", placeholder: "" }],
};

function maskKey(val: string): string {
  if (!val) return "";
  if (val.length < 12) return "\u2022\u2022\u2022\u2022";
  const prefixLength = val.startsWith("sk-ant-api") ? 16 : 12;
  return `${val.slice(0, Math.min(prefixLength, val.length - 4))}...${val.slice(-4)}`;
}

function readEnvFile(): string {
  try { return fs.readFileSync(ENV_FILE, "utf-8"); } catch { return ""; }
}

function parseEnv(content: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    vars[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return vars;
}

function setEnvVars(updates: Record<string, string>): void {
  const content = readEnvFile();
  const lines = content.split("\n");

  for (const [key, value] of Object.entries(updates)) {
    let found = false;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith(key + "=")) {
        lines[i] = `${key}=${value}`;
        found = true;
        break;
      }
    }
    if (!found) lines.push(`${key}=${value}`);
  }

  fs.writeFileSync(ENV_FILE, lines.join("\n"), "utf-8");
  // Also set in current process env
  for (const [key, value] of Object.entries(updates)) {
    process.env[key] = value;
  }
}

function readJsonFile<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function writeJsonFile(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", "utf-8");
}

function listAgentDirs(): string[] {
  const roots = [
    path.join(OPENCLAW_ROOT, ".openclaw", "agents"),
    path.join(OPENCLAW_ROOT, "agents"),
  ];
  const dirs: string[] = [];
  for (const root of roots) {
    try {
      for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
        dirs.push(path.join(root, entry.name, "agent"));
      }
    } catch {
      // Missing agent roots are valid on fresh installs.
    }
  }
  return dirs;
}

function uniqueRealPaths(files: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const file of files) {
    let key = file;
    try {
      key = fs.realpathSync(file);
    } catch {
      // Keep the original path for files that do not exist yet.
    }
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(file);
  }
  return result;
}

function ensureAnthropicApiProfile(): void {
  const configFile = path.join(OPENCLAW_ROOT, ".openclaw", "openclaw.json");

  const config = readJsonFile(configFile, {}) as {
    auth?: {
      profiles?: Record<string, { provider?: string; mode?: string }>;
      order?: Record<string, string[]>;
    };
  };

  const auth = config.auth || {};
  const profiles = auth.profiles || {};
  profiles[ANTHROPIC_PROFILE_ID] = { provider: "anthropic", mode: "token" };
  auth.profiles = profiles;
  auth.order = {
    ...(auth.order || {}),
    anthropic: [ANTHROPIC_PROFILE_ID],
  };
  config.auth = auth;
  writeJsonFile(configFile, config);

  const authProfileFiles = uniqueRealPaths([
    path.join(OPENCLAW_ROOT, ".openclaw", "shared", "auth-profiles.json"),
    ...listAgentDirs().map((dir) => path.join(dir, "auth-profiles.json")),
  ]);
  for (const file of authProfileFiles) {
    const store = readJsonFile(file, { version: 1, profiles: {} }) as {
      version?: number;
      profiles?: Record<string, unknown>;
    };
    store.version = store.version || 1;
    store.profiles = store.profiles || {};
    store.profiles[ANTHROPIC_PROFILE_ID] = {
      type: "token",
      provider: "anthropic",
      tokenRef: ANTHROPIC_TOKEN_REF,
    };
    writeJsonFile(file, store);
    try { fs.chmodSync(file, 0o600); } catch {}
  }

  const authStateFiles = uniqueRealPaths(listAgentDirs().map((dir) => path.join(dir, "auth-state.json")));
  for (const file of authStateFiles) {
    if (!fs.existsSync(file)) continue;
    const state = readJsonFile(file, { version: 1 }) as {
      version?: number;
      lastGood?: Record<string, string>;
      usageStats?: Record<string, unknown>;
    };
    state.version = state.version || 1;
    state.lastGood = { ...(state.lastGood || {}), anthropic: ANTHROPIC_PROFILE_ID };
    if (state.usageStats) {
      for (const key of Object.keys(state.usageStats)) {
        if (key.startsWith("anthropic:")) delete state.usageStats[key];
      }
    }
    writeJsonFile(file, state);
  }
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!req.ctx?.isAdmin) {
    return res.status(403).json({ error: "Admin only" });
  }

  if (req.method === "GET") {
    const serviceId = req.query.service as string | undefined;
    const envVars = parseEnv(readEnvFile());
    const result: Record<string, unknown> = {};

    if (serviceId && SERVICE_ENV_MAP[serviceId]) {
      for (const field of SERVICE_ENV_MAP[serviceId]) {
        result[field.key] = {
          label: field.label,
          placeholder: field.placeholder,
          masked: maskKey(envVars[field.key] || ""),
          hasValue: !!(envVars[field.key]),
        };
      }
    } else {
      for (const [svc, fields] of Object.entries(SERVICE_ENV_MAP)) {
        result[svc] = fields.map((f) => ({
          key: f.key,
          label: f.label,
          masked: maskKey(envVars[f.key] || ""),
          hasValue: !!(envVars[f.key]),
        }));
      }
    }

    return res.status(200).json(result);
  }

  if (req.method === "POST") {
    const { service, vars } = req.body;
    if (!service || !vars || typeof vars !== "object") {
      return res.status(400).json({ error: "Missing service or vars" });
    }

    const allowed = SERVICE_ENV_MAP[service];
    if (!allowed) {
      return res.status(400).json({ error: `Unknown service: ${service}` });
    }

    const allowedKeys = new Set(allowed.map((f) => f.key));
    const updates: Record<string, string> = {};
    for (const [k, v] of Object.entries(vars)) {
      if (!allowedKeys.has(k)) continue;
      if (typeof v === "string" && v.trim()) updates[k] = v.trim();
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No valid vars to save" });
    }

    setEnvVars(updates);
    if (updates.ANTHROPIC_API_KEY) {
      ensureAnthropicApiProfile();
    }

    return res.status(200).json({ ok: true, saved: Object.keys(updates) });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: `Method ${req.method} not allowed` });
}

export default compose(withErrorHandler, withAuth)(handler);
