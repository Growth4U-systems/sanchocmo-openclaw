/**
 * GET /api/integrations/discord/list-channels?slug=X
 *
 * Returns the text channels of the Discord server (guild) configured
 * for brand {slug}. Reads GUILD_ID from integrations.json.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";
import { readJSON } from "@/lib/data/json-io";

interface DiscordChannel {
  id: string;
  name: string;
  type: number; // 0 = text, 5 = announcement, 15 = forum, etc.
  parent_id?: string | null;
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
  } catch { /* optional */ }
  return vars;
}

function getDiscordToken(slug: string): string | null {
  const env = loadBrandEnv(slug);
  const upper = slug.toUpperCase();
  return env[`${upper}_DISCORD_BOT_TOKEN`] || env.DISCORD_BOT_TOKEN || process.env[`${upper}_DISCORD_BOT_TOKEN`] || process.env.DISCORD_BOT_TOKEN || null;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!req.ctx?.isAdmin) return res.status(403).json({ error: "Forbidden" });
  const slug = req.query.slug as string;
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  const integ = readJSON<Record<string, unknown>>(
    path.join(BASE, "brand", slug, "integrations.json"),
    {}
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const discord = ((integ.dataSources as any)?.discord || (integ.services as any)?.discord);
  if (!discord || discord.status !== "connected") {
    return res.status(200).json({ ok: false, error: "Discord not connected for this brand", channels: [] });
  }
  const guildId = discord.config?.GUILD_ID || discord.config?.guildId;
  if (!guildId) {
    return res.status(200).json({ ok: false, error: "GUILD_ID not configured", channels: [] });
  }

  const token = getDiscordToken(slug);
  if (!token) {
    return res.status(200).json({ ok: false, error: "Discord token not found in env", channels: [] });
  }

  try {
    const r = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
      headers: { Authorization: `Bot ${token}` },
    });
    if (!r.ok) {
      const body = await r.text();
      return res.status(200).json({ ok: false, error: `HTTP ${r.status}: ${body.slice(0, 200)}`, channels: [] });
    }
    const all = (await r.json()) as DiscordChannel[];
    // Filter text-like channels (type 0 = text, 5 = announcement, 15 = forum)
    const textTypes = new Set([0, 5, 15]);
    const channels = all
      .filter((c) => textTypes.has(c.type))
      .map((c) => ({
        id: c.id,
        name: c.name,
        is_private: false,
        type: c.type,
        parent_id: c.parent_id,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return res.status(200).json({ ok: true, channels, count: channels.length, guild_id: guildId });
  } catch (e) {
    return res.status(200).json({ ok: false, error: (e as Error).message, channels: [] });
  }
}

export default compose(withErrorHandler, withAuth)(handler);
