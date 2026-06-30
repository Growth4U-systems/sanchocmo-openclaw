import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";
import { parseEnvContent, upsertEnvContent, removeKeysFromEnvContent } from "@/lib/env-file";

const ENV_FILE = path.join(BASE, "..", ".env");

const SERVICE_ENV_MAP: Record<
  string,
  { key: string; label: string; placeholder: string; help?: string }[]
> = {
  anthropic: [{ key: "ANTHROPIC_API_KEY", label: "API Key", placeholder: "sk-ant-..." }],
  // Subscription/OAuth route for the motor. Modal-only service id (the runtime
  // table opens it for the "Anthropic · Suscripción" row); shares the `anthropic`
  // provider for health/console. The token is pasted, not logged in via OAuth in
  // the app — generate it with `claude setup-token` / `openclaw models auth login`.
  "anthropic-oauth": [
    {
      key: "ANTHROPIC_OAUTH_TOKEN",
      label: "Token de suscripción (OAuth)",
      placeholder: "sk-ant-oat-...",
      help: "Pega el token `sk-ant-oat…` de tu suscripción Claude (Max). Los pasos para generarlo están arriba.",
    },
  ],
  openrouter: [{ key: "OPENROUTER_API_KEY", label: "API Key", placeholder: "sk-or-..." }],
  fireworks: [{ key: "FIREWORKS_API_KEY", label: "API Key", placeholder: "fw-..." }],
  openai: [{ key: "OPENAI_API_KEY", label: "API Key", placeholder: "sk-..." }],
  gemini: [{ key: "GEMINI_API_KEY", label: "API Key", placeholder: "AIza..." }],
  xai: [{ key: "XAI_API_KEY", label: "API Key", placeholder: "xai-..." }],
  minimax: [{ key: "MINIMAX_API_KEY", label: "API Key", placeholder: "eyJ..." }],
  brave: [{ key: "BRAVE_API_KEY", label: "API Key", placeholder: "BSA..." }],
  apify: [{ key: "APIFY_API_KEY", label: "API Key", placeholder: "apify_api_..." }],
  scrapecreators: [
    {
      key: "SCRAPECREATORS_API_KEY",
      label: "API Key",
      placeholder: "sc_...",
      help: "ScrapeCreators se usa desde Partnerships discovery para perfiles sociales y ad-library. Pégala aquí como key de sistema.",
    },
  ],
  firecrawl: [{ key: "FIRECRAWL_API_KEY", label: "API Key", placeholder: "fc-..." }],
  serper: [{ key: "SERPER_API_KEY", label: "API Key", placeholder: "" }],
  dataforseo: [
    { key: "DATAFORSEO_LOGIN", label: "Login (email)", placeholder: "you@email.com" },
    { key: "DATAFORSEO_PASSWORD", label: "Password", placeholder: "" },
  ],
  notion: [{ key: "NOTION_API_KEY", label: "Integration Token", placeholder: "ntn_..." }],
  fal: [{ key: "FAL_API_KEY", label: "API Key", placeholder: "" }],
  wavespeed: [{ key: "WAVESPEED_API_KEY", label: "API Key", placeholder: "" }],
  dumpling: [{ key: "DUMPLING_API_KEY", label: "API Key", placeholder: "" }],
  slack: [{ key: "SLACK_BOT_TOKEN", label: "Bot Token", placeholder: "xoxb-..." }],
  instantly: [{ key: "INSTANTLY_API_KEY", label: "API Key", placeholder: "" }],
  metricool: [{ key: "METRICOOL_API_KEY", label: "API Key", placeholder: "" }],
  // Cloudflare R2 (SAN-184) — object storage for media/uploads. Keys match the
  // exact env var names read by src/lib/upload-r2.ts, so saving here makes
  // uploadToR2() work with no code change (POST /api/env live-updates process.env).
  r2: [
    {
      key: "CLOUDFLARE_ACCOUNT_ID",
      label: "Account ID",
      placeholder: "32-char hex",
      help: "Cloudflare dashboard → R2 → Overview. Es el Account ID que sale a la derecha (también en la URL del panel).",
    },
    {
      key: "R2_UPLOAD_IMAGE_ACCESS_KEY_ID",
      label: "Access Key ID",
      placeholder: "",
      help: "Cloudflare → R2 → Manage R2 API Tokens → Create API token (permiso Object Read & Write). Copia el Access Key ID.",
    },
    {
      key: "R2_UPLOAD_IMAGE_SECRET_ACCESS_KEY",
      label: "Secret Access Key",
      placeholder: "",
      help: "Se muestra UNA sola vez al crear el token, junto al Access Key ID. Si lo perdiste, crea un token nuevo.",
    },
    {
      key: "R2_UPLOAD_IMAGE_BUCKET_NAME",
      label: "Bucket",
      placeholder: "sancho",
      help: "Nombre del bucket R2 donde se guardan las subidas (Cloudflare → R2 → tu bucket). Por defecto: sancho.",
    },
    {
      key: "R2_PUBLIC_URL",
      label: "Public URL",
      placeholder: "https://pub-xxxx.r2.dev",
      help: "URL pública del bucket. Actívala en R2 → Settings → Public access (r2.dev) o usa tu dominio conectado. Sin barra final.",
    },
  ],
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
  return parseEnvContent(content);
}

function setEnvVars(updates: Record<string, string>): void {
  fs.writeFileSync(ENV_FILE, upsertEnvContent(readEnvFile(), updates), "utf-8");
  // Also set in current process env
  for (const [key, value] of Object.entries(updates)) {
    process.env[key] = value;
  }
}

function removeEnvVars(keys: string[]): void {
  fs.writeFileSync(ENV_FILE, removeKeysFromEnvContent(readEnvFile(), keys), "utf-8");
  // Also drop from the current process env
  for (const key of keys) delete process.env[key];
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
          help: field.help,
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

    return res.status(200).json({ ok: true, saved: Object.keys(updates) });
  }

  if (req.method === "DELETE") {
    const service = (req.query.service as string) || (req.body?.service as string);
    if (!service) {
      return res.status(400).json({ error: "Missing service" });
    }

    const allowed = SERVICE_ENV_MAP[service];
    if (!allowed) {
      return res.status(400).json({ error: `Unknown service: ${service}` });
    }

    const keys = allowed.map((f) => f.key);
    removeEnvVars(keys);

    return res.status(200).json({ ok: true, removed: keys });
  }

  res.setHeader("Allow", "GET, POST, DELETE");
  return res.status(405).json({ error: `Method ${req.method} not allowed` });
}

export default compose(withErrorHandler, withAuth)(handler);
