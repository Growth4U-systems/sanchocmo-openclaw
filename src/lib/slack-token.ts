import fs from "fs";
import path from "path";
import { BASE } from "@/lib/data/paths";
import { getSlackBotToken } from "@/lib/data/integrations";

export interface SlackTokenResolution {
  token: string | null;
  source: string;
}

function loadBrandEnv(slug: string): Record<string, string> {
  const envPath = path.join(BASE, "brand", slug, ".env");
  const vars: Record<string, string> = {};
  try {
    const content = fs.readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      vars[trimmed.slice(0, eq)] = trimmed.slice(eq + 1).replace(/^["']|["']$/g, "");
    }
  } catch {
    // Optional legacy fallback.
  }
  return vars;
}

function slugEnvPrefix(slug: string): string {
  return slug.replace(/-/g, "_").toUpperCase();
}

export function resolveSlackBotToken(slug: string): SlackTokenResolution {
  try {
    const oauth = getSlackBotToken(slug);
    if (oauth) return { token: oauth, source: "integrations.json (OAuth)" };
  } catch {
    // Keep legacy fallbacks available if integrations.json is missing/bad.
  }

  const envPrefix = slugEnvPrefix(slug);
  const env = loadBrandEnv(slug);
  const brandToken = env[`${envPrefix}_SLACK_BOT_TOKEN`] || env.SLACK_BOT_TOKEN;
  if (brandToken) return { token: brandToken, source: `brand/${slug}/.env` };

  const processToken = process.env[`${envPrefix}_SLACK_BOT_TOKEN`] || process.env.SLACK_BOT_TOKEN;
  if (processToken) return { token: processToken, source: "process.env (workspace-wide)" };

  return { token: null, source: "" };
}
