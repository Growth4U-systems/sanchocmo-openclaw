import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { readJSON, writeJSON } from "@/lib/data/json-io";
import { apiHealthFile, BASE } from "@/lib/data/paths";

// ── Env helpers ──────────────────────────────────────────────

const ENV_FILE = path.join(BASE, "..", ".env");

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

function getKey(envVars: Record<string, string>, k: string): string {
  return envVars[k] || process.env[k] || "";
}

// ── Types ────────────────────────────────────────────────────

export interface ServiceHealth {
  status: "ok" | "error" | "not-configured" | "unknown";
  lastCheck: string;
  details: Record<string, unknown>;
}

export interface HealthResult {
  checked: string[];
  results: Record<string, ServiceHealth>;
  lastCheck: string;
  error?: string;
}

// ── Health cache ─────────────────────────────────────────────

function loadApiHealth(): { lastCheck: string | null; services: Record<string, ServiceHealth> } {
  return readJSON(apiHealthFile(), { lastCheck: null, services: {} });
}

function saveApiHealth(data: { lastCheck: string | null; services: Record<string, ServiceHealth> }): void {
  data.lastCheck = new Date().toISOString();
  writeJSON(apiHealthFile(), data);
}

// ── Individual service checks ────────────────────────────────

const TIMEOUT_MS = 15_000;

async function httpCheck(url: string, headers: Record<string, string>, acceptCodes = [200]): Promise<{ ok: boolean; httpCode: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    return { ok: acceptCodes.includes(res.status), httpCode: res.status };
  } finally {
    clearTimeout(timer);
  }
}

async function httpCheckJson<T = unknown>(url: string, headers: Record<string, string>): Promise<{ ok: boolean; httpCode: number; data: T | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    const data = res.ok ? (await res.json()) as T : null;
    return { ok: res.ok, httpCode: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

async function httpPost(url: string, headers: Record<string, string>, body: unknown, acceptCodes = [200]): Promise<{ ok: boolean; httpCode: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return { ok: acceptCodes.includes(res.status), httpCode: res.status };
  } finally {
    clearTimeout(timer);
  }
}

function keyFormatCheck(key: string, minLength = 10): ServiceHealth {
  const now = new Date().toISOString();
  return {
    status: key.length > minLength ? "ok" : "error",
    lastCheck: now,
    details: { note: "Key present, no lightweight verify endpoint" },
  };
}

function notConfigured(envName: string): ServiceHealth {
  return {
    status: "not-configured",
    lastCheck: new Date().toISOString(),
    details: { error: `${envName} not set` },
  };
}

function ok(details: Record<string, unknown> = {}): ServiceHealth {
  return { status: "ok", lastCheck: new Date().toISOString(), details };
}

function error(msg: string, extra: Record<string, unknown> = {}): ServiceHealth {
  return { status: "error", lastCheck: new Date().toISOString(), details: { error: msg.slice(0, 200), ...extra } };
}

// ── Check service ────────────────────────────────────────────

async function checkService(serviceId: string, envVars: Record<string, string>): Promise<ServiceHealth> {
  const now = new Date().toISOString();

  try {
    switch (serviceId) {
      // ── LLM Providers (Bearer / API key header → /models) ──
      case "anthropic": {
        const key = getKey(envVars, "ANTHROPIC_API_KEY");
        if (!key) return notConfigured("ANTHROPIC_API_KEY");
        const r = await httpCheck("https://api.anthropic.com/v1/models", { "x-api-key": key, "anthropic-version": "2023-06-01" });
        return r.ok ? ok({ httpCode: r.httpCode }) : error(`HTTP ${r.httpCode}`, { httpCode: r.httpCode });
      }
      case "openrouter": {
        const key = getKey(envVars, "OPENROUTER_API_KEY");
        if (!key) return notConfigured("OPENROUTER_API_KEY");
        const r = await httpCheck("https://openrouter.ai/api/v1/models", { Authorization: `Bearer ${key}` });
        return r.ok ? ok({ httpCode: r.httpCode }) : error(`HTTP ${r.httpCode}`, { httpCode: r.httpCode });
      }
      case "openai": {
        const key = getKey(envVars, "OPENAI_API_KEY");
        if (!key) return notConfigured("OPENAI_API_KEY");
        const r = await httpCheck("https://api.openai.com/v1/models", { Authorization: `Bearer ${key}` });
        return r.ok ? ok({ httpCode: r.httpCode }) : error(`HTTP ${r.httpCode}`, { httpCode: r.httpCode });
      }
      case "gemini": {
        const key = getKey(envVars, "GEMINI_API_KEY");
        if (!key) return notConfigured("GEMINI_API_KEY");
        const r = await httpCheck(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`, {});
        return r.ok ? ok({ httpCode: r.httpCode }) : error(`HTTP ${r.httpCode}`, { httpCode: r.httpCode });
      }
      case "xai": {
        const key = getKey(envVars, "XAI_API_KEY");
        if (!key) return notConfigured("XAI_API_KEY");
        const r = await httpCheck("https://api.x.ai/v1/models", { Authorization: `Bearer ${key}` });
        return r.ok ? ok({ httpCode: r.httpCode }) : error(`HTTP ${r.httpCode}`, { httpCode: r.httpCode });
      }
      case "minimax": {
        const key = getKey(envVars, "MINIMAX_API_KEY");
        if (!key) return notConfigured("MINIMAX_API_KEY");
        return keyFormatCheck(key);
      }
      case "perplexity": {
        const key = getKey(envVars, "PERPLEXITY_API_KEY");
        if (!key) return notConfigured("PERPLEXITY_API_KEY");
        // Perplexity has no GET /models. Cheapest auth check: POST /chat/completions
        // with max_tokens=1 — costs ~1-3 tokens.
        const r = await httpPost(
          "https://api.perplexity.ai/chat/completions",
          { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          { model: "sonar", messages: [{ role: "user", content: "ping" }], max_tokens: 1 }
        );
        if (r.ok) return ok({ httpCode: r.httpCode });
        if (r.httpCode === 401) return error("invalid_auth (HTTP 401)", { httpCode: r.httpCode });
        return error(`HTTP ${r.httpCode}`, { httpCode: r.httpCode });
      }

      // ── Search & Data ──
      case "brave": {
        const key = getKey(envVars, "BRAVE_API_KEY") || getKey(envVars, "BRAVE_SEARCH_API_KEY");
        if (!key) return notConfigured("BRAVE_API_KEY");
        const r = await httpCheck("https://api.search.brave.com/res/v1/web/search?q=test&count=1", { "X-Subscription-Token": key });
        return r.ok ? ok({ httpCode: r.httpCode }) : error(`HTTP ${r.httpCode}`, { httpCode: r.httpCode });
      }
      case "serper": {
        const key = getKey(envVars, "SERPER_API_KEY");
        if (!key) return notConfigured("SERPER_API_KEY");
        const r = await httpPost("https://google.serper.dev/search", { "X-API-KEY": key }, { q: "test", num: 1 });
        return r.ok ? ok({ httpCode: r.httpCode }) : error(`HTTP ${r.httpCode}`, { httpCode: r.httpCode });
      }
      case "dataforseo": {
        const login = getKey(envVars, "DATAFORSEO_LOGIN");
        const password = getKey(envVars, "DATAFORSEO_PASSWORD");
        if (!login || !password) return notConfigured("DATAFORSEO_LOGIN/PASSWORD");
        const r = await httpCheck("https://api.dataforseo.com/v3/appendix/user_data", {
          Authorization: `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`,
        });
        return r.ok ? ok({ httpCode: r.httpCode, login }) : error(`HTTP ${r.httpCode}`, { httpCode: r.httpCode });
      }
      case "apify": {
        const key = getKey(envVars, "APIFY_TOKEN") || getKey(envVars, "APIFY_API_KEY");
        if (!key) return notConfigured("APIFY_TOKEN");
        const r = await httpCheckJson<{ data?: { username?: string; plan?: { name?: string } } }>(
          "https://api.apify.com/v2/users/me",
          { Authorization: `Bearer ${key}` },
        );
        if (r.ok && r.data?.data) {
          return ok({ username: r.data.data.username || "", plan: r.data.data.plan?.name || "" });
        }
        return error(r.ok ? "Unexpected response" : `HTTP ${r.httpCode}`, { httpCode: r.httpCode });
      }
      case "firecrawl": {
        const key = getKey(envVars, "FIRECRAWL_API_KEY");
        if (!key) return notConfigured("FIRECRAWL_API_KEY");
        const r = await httpPost("https://api.firecrawl.dev/v1/scrape", { Authorization: `Bearer ${key}` }, { url: "https://example.com" });
        return r.ok ? ok({ httpCode: r.httpCode }) : error(`HTTP ${r.httpCode}`, { httpCode: r.httpCode });
      }

      // ── Infrastructure ──
      case "notion": {
        const key = getKey(envVars, "NOTION_API_KEY");
        if (!key) return notConfigured("NOTION_API_KEY");
        const r = await httpCheckJson<{ id?: string; name?: string; bot?: { owner?: { user?: { name?: string } } }; code?: string; message?: string }>(
          "https://api.notion.com/v1/users/me",
          { Authorization: `Bearer ${key}`, "Notion-Version": "2022-06-28" },
        );
        if (r.ok && r.data?.id) {
          return ok({ botName: r.data.name || r.data.bot?.owner?.user?.name || "connected" });
        }
        if (r.data?.code) return error(r.data.message || r.data.code);
        return r.ok ? ok() : error(`HTTP ${r.httpCode}`, { httpCode: r.httpCode });
      }
      case "supabase": {
        const url = getKey(envVars, "SUPABASE_URL");
        const key = getKey(envVars, "SUPABASE_ANON_KEY");
        if (!url || !key) return notConfigured("SUPABASE_URL/ANON_KEY");
        const r = await httpCheck(`${url}/rest/v1/`, { apikey: key, Authorization: `Bearer ${key}` }, [200, 204]);
        const projectId = url.match(/https:\/\/(\w+)\./)?.[1] || "";
        return r.ok ? ok({ httpCode: r.httpCode, project: projectId }) : error(`HTTP ${r.httpCode}`, { httpCode: r.httpCode });
      }
      case "slack": {
        const key = getKey(envVars, "SLACK_BOT_TOKEN");
        if (!key) return notConfigured("SLACK_BOT_TOKEN");
        // Slack returns HTTP 200 even on invalid_auth — must check body.ok
        const r = await httpCheckJson<{ ok?: boolean; error?: string; team?: string; user?: string; team_id?: string }>(
          "https://slack.com/api/auth.test",
          { Authorization: `Bearer ${key}` }
        );
        if (!r.ok) return error(`HTTP ${r.httpCode}`, { httpCode: r.httpCode });
        if (r.data?.ok !== true) {
          return error(`Slack auth failed: ${r.data?.error || "unknown"}`, { httpCode: r.httpCode, slackError: r.data?.error });
        }
        return ok({ httpCode: r.httpCode, team: r.data.team || r.data.team_id, user: r.data.user });
      }
      case "discord": {
        const token = getKey(envVars, "DISCORD_BOT_TOKEN");
        if (!token) return notConfigured("DISCORD_BOT_TOKEN");
        // Discord returns 401 on invalid token, so HTTP code is enough.
        const r = await httpCheck("https://discord.com/api/v10/users/@me", { Authorization: `Bot ${token}` });
        return r.ok ? ok({ httpCode: r.httpCode }) : error(`HTTP ${r.httpCode}`, { httpCode: r.httpCode });
      }

      // ── Media & Generation ──
      case "fal": {
        const key = getKey(envVars, "FAL_API_KEY");
        if (!key) return notConfigured("FAL_API_KEY");
        return keyFormatCheck(key);
      }
      case "wavespeed": {
        const key = getKey(envVars, "WAVESPEED_API_KEY");
        if (!key) return notConfigured("WAVESPEED_API_KEY");
        return keyFormatCheck(key);
      }
      case "dumpling": {
        const key = getKey(envVars, "DUMPLING_API_KEY");
        if (!key) return notConfigured("DUMPLING_API_KEY");
        return keyFormatCheck(key);
      }
      case "nanobanana": {
        const key = getKey(envVars, "GEMINI_API_KEY");
        if (!key) return notConfigured("GEMINI_API_KEY (shared)");
        return ok({ note: "Uses Gemini API key (shared)", engine: "gemini-2.0-flash-exp" });
      }
      case "remotion": {
        try {
          const raw = execSync("npx remotion --version 2>&1 || echo \"not-found\"", { timeout: 15000, encoding: "utf-8" }).trim();
          const notFound = /not.found|command not found|ERR/i.test(raw);
          return notFound
            ? { status: "not-configured", lastCheck: now, details: { note: "Not installed locally" } }
            : ok({ version: raw.split("\n")[0], note: "Local install" });
        } catch {
          return { status: "not-configured", lastCheck: now, details: { note: "Not installed locally" } };
        }
      }

      // ── Outbound & Email ──
      case "instantly": {
        const key = getKey(envVars, "INSTANTLY_API_KEY");
        if (!key) return notConfigured("INSTANTLY_API_KEY");
        const r = await httpCheck(`https://api.instantly.ai/api/v1/account/list?api_key=${key}`, {});
        return r.ok ? ok({ httpCode: r.httpCode }) : error(`HTTP ${r.httpCode}`, { httpCode: r.httpCode });
      }

      // ── Analytics ──
      case "metricool": {
        const key = getKey(envVars, "METRICOOL_API_KEY");
        if (!key) return notConfigured("METRICOOL_API_KEY");
        return keyFormatCheck(key);
      }

      // ── Local tools ──
      case "gog": {
        try {
          const raw = execSync("/opt/homebrew/bin/gog gmail list \"is:unread\" 2>&1", { timeout: 20000, encoding: "utf-8" });
          const hasError = /error|unauthorized|invalid/i.test(raw) && !/subject/i.test(raw);
          return hasError
            ? error(raw.slice(0, 150))
            : ok({ account: "alfonso@growth4u.io", test: "gmail inbox" });
        } catch (e) {
          return error(e instanceof Error ? e.message : String(e));
        }
      }
      case "openclaw": {
        try {
          const raw = execSync("/opt/homebrew/bin/openclaw status 2>&1", { timeout: TIMEOUT_MS, encoding: "utf-8" });
          const running = /running/i.test(raw);
          const version = raw.match(/app\s+([\d.]+)/)?.[1] || "";
          const latest = raw.match(/npm latest\s+([\d.]+)/)?.[1] || "";
          return running
            ? ok({ gateway: "running", version, latest })
            : error("Gateway stopped", { gateway: "stopped", version, latest });
        } catch (e) {
          return error(e instanceof Error ? e.message : String(e));
        }
      }

      default:
        return { status: "unknown", lastCheck: now, details: { error: `Unknown service: ${serviceId}` } };
    }
  } catch (e) {
    return error(e instanceof Error ? e.message : String(e));
  }
}

// ── Run checks ───────────────────────────────────────────────

const ALL_SERVICES = [
  "anthropic", "openrouter", "openai", "gemini", "xai", "minimax",
  "brave", "apify", "firecrawl", "serper", "dataforseo",
  "notion", "supabase", "slack", "discord",
  "fal", "wavespeed", "dumpling", "nanobanana", "remotion",
  "instantly", "metricool",
  "gog", "openclaw",
];

export async function runHealthChecks(serviceFilter: string): Promise<HealthResult> {
  const health = loadApiHealth();
  const toCheck = serviceFilter === "all"
    ? ALL_SERVICES
    : ALL_SERVICES.includes(serviceFilter) ? [serviceFilter] : [];

  if (toCheck.length === 0) {
    return { checked: [], results: {}, lastCheck: health.lastCheck || "", error: `Unknown service: ${serviceFilter}` };
  }

  const envVars = parseEnv(readEnvFile());
  const results: Record<string, ServiceHealth> = {};

  for (const svc of toCheck) {
    results[svc] = await checkService(svc, envVars);
    health.services[svc] = results[svc];
  }

  saveApiHealth(health);
  return { checked: toCheck, results, lastCheck: health.lastCheck || "" };
}
