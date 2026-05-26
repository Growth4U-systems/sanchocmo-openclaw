/**
 * GET /api/integrations/slack/list-channels?slug=X
 *
 * Returns the list of Slack channels accessible by the bot of brand {slug}.
 * Combines public channels (channels:read) and private channels where the
 * bot is a member (groups:read).
 *
 * Used by the Inputs tab → "📬 Canal de envío" dropdown.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";
import { readJSON } from "@/lib/data/json-io";

interface SlackChannel {
  id: string;
  name: string;
  is_private: boolean;
  is_member?: boolean;
  topic?: string;
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
  } catch { /* env file optional */ }
  return vars;
}

function getSlackToken(slug: string): string | null {
  const env = loadBrandEnv(slug);
  const upper = slug.toUpperCase();
  return env[`${upper}_SLACK_BOT_TOKEN`] || env.SLACK_BOT_TOKEN || process.env[`${upper}_SLACK_BOT_TOKEN`] || process.env.SLACK_BOT_TOKEN || null;
}

async function fetchSlack<T>(url: string, token: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!req.ctx?.isAdmin) return res.status(403).json({ error: "Forbidden" });
  const slug = req.query.slug as string;
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  // Verify slack is configured
  const integ = readJSON<Record<string, unknown>>(
    path.join(BASE, "brand", slug, "integrations.json"),
    {}
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const slack = ((integ.dataSources as any)?.slack || (integ.services as any)?.slack);
  if (!slack || slack.status !== "connected") {
    return res.status(200).json({ ok: false, error: "Slack not connected for this brand", channels: [] });
  }

  const token = getSlackToken(slug);
  if (!token) {
    return res.status(200).json({ ok: false, error: "Slack token not found in env", channels: [] });
  }

  // Fetch public + private separately so missing scopes only hide one bucket,
  // not break the whole call. Slack returns missing_scope if the bot lacks
  // `channels:read` (public) or `groups:read` (private).
  type SlackResp = { ok: boolean; channels?: SlackChannel[]; error?: string };
  const errors: string[] = [];

  const pub = await fetchSlack<SlackResp>(
    "https://slack.com/api/conversations.list?types=public_channel&exclude_archived=true&limit=200",
    token
  );
  const priv = await fetchSlack<SlackResp>(
    "https://slack.com/api/conversations.list?types=private_channel&exclude_archived=true&limit=200",
    token
  );

  if (pub && !pub.ok) errors.push(`public: ${pub.error}`);
  if (priv && !priv.ok) errors.push(`private: ${priv.error}`);

  const merged: SlackChannel[] = [];
  if (pub?.ok && pub.channels) merged.push(...pub.channels);
  if (priv?.ok && priv.channels) merged.push(...priv.channels);

  // If both buckets failed and we have nothing, surface error
  if (merged.length === 0 && errors.length > 0) {
    return res.status(200).json({
      ok: false,
      error: errors.join(" | ") + ". Añade los scopes faltantes en api.slack.com/apps → tu app → OAuth & Permissions → Scopes y reinstala el app.",
      channels: [],
    });
  }

  const channels = merged
    .map((c) => ({
      id: c.id,
      name: c.name,
      is_private: c.is_private,
      is_member: c.is_member,
    }))
    .sort((a, b) => {
      if (a.is_member !== b.is_member) return a.is_member ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  return res.status(200).json({
    ok: true,
    channels,
    count: channels.length,
    warnings: errors.length ? errors : undefined,
  });
}

export default compose(withErrorHandler, withAuth)(handler);
