/**
 * GET /api/integrations/communication-options?slug=X
 *
 * Aggregates all "Comunicación" transports connected for brand {slug} and
 * returns their channel lists in a single response. Used by the Inputs tab
 * "📬 Canal de envío" dropdowns to render transport + channel selectors
 * without having to make N separate calls.
 *
 * Also returns the currently configured dispatch channel from
 * content/configs/dispatch-channel.yml (or null if not yet configured).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import * as yaml from "js-yaml";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";
import { readJSON } from "@/lib/data/json-io";

interface ChannelOption { id: string; name: string; is_private?: boolean; is_member?: boolean }
interface TransportOption {
  transport: "slack" | "discord";
  label: string;
  emoji: string;
  channels: ChannelOption[];
  error?: string;
}
interface DispatchChannelConfig {
  transport?: "slack" | "discord";
  channel_id?: string;
  channel_name?: string;
  configured_at?: string;
  configured_by?: string;
}

async function fetchInternal<T>(req: NextApiRequest, urlPath: string): Promise<T | null> {
  // Build absolute URL using the same host as the incoming request so we
  // forward cookies and hit our own API. Avoids double-auth dance.
  const proto = (req.headers["x-forwarded-proto"] as string) || "http";
  const host = req.headers.host;
  const url = `${proto}://${host}${urlPath}`;
  try {
    const r = await fetch(url, {
      headers: { cookie: req.headers.cookie || "" },
    });
    if (!r.ok) return null;
    return (await r.json()) as T;
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

  const integ = readJSON<Record<string, unknown>>(
    path.join(BASE, "brand", slug, "integrations.json"),
    {}
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ds = (integ.dataSources as any) || (integ.services as any) || {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const oauthSlack = (integ as any).slack;
  const transports: TransportOption[] = [];

  // Slack
  if (oauthSlack?.status === "connected" || ds.slack?.status === "connected") {
    type R = { ok: boolean; channels: ChannelOption[]; error?: string };
    const r = await fetchInternal<R>(req, `/api/integrations/slack/list-channels?slug=${slug}`);
    transports.push({
      transport: "slack",
      label: `💬 Slack (${oauthSlack?.team_name || ds.slack?.config?.WORKSPACE || "workspace"})`,
      emoji: "💬",
      channels: r?.channels || [],
      error: r?.ok ? undefined : (r?.error || "Failed to fetch Slack channels"),
    });
  }

  // Discord
  if (ds.discord?.status === "connected") {
    type R = { ok: boolean; channels: ChannelOption[]; error?: string };
    const r = await fetchInternal<R>(req, `/api/integrations/discord/list-channels?slug=${slug}`);
    transports.push({
      transport: "discord",
      label: `🎮 Discord (server ${ds.discord.config?.GUILD_ID || "?"})`,
      emoji: "🎮",
      channels: r?.channels || [],
      error: r?.ok ? undefined : (r?.error || "Failed to fetch Discord channels"),
    });
  }

  // Current configured dispatch channel
  let current: DispatchChannelConfig | null = null;
  const dispatchPath = path.join(BASE, "brand", slug, "content", "configs", "dispatch-channel.yml");
  if (fs.existsSync(dispatchPath)) {
    try {
      current = yaml.load(fs.readFileSync(dispatchPath, "utf-8")) as DispatchChannelConfig;
    } catch { /* malformed */ }
  }

  return res.status(200).json({
    ok: true,
    transports,
    current,
  });
}

export default compose(withErrorHandler, withAuth)(handler);
