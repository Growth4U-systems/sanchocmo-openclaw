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
import path from "path";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";
import { readJSON } from "@/lib/data/json-io";
import { resolveSlackBotToken } from "@/lib/slack-token";

interface SlackChannel {
  id: string;
  name: string;
  is_private: boolean;
  is_member?: boolean;
  topic?: string;
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

  const integ = readJSON<Record<string, unknown>>(
    path.join(BASE, "brand", slug, "integrations.json"),
    {}
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const slack = ((integ.dataSources as any)?.slack || (integ.services as any)?.slack);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const oauthSlack = (integ as any).slack;
  if (oauthSlack?.status !== "connected" && slack?.status !== "connected") {
    return res.status(200).json({ ok: false, error: "Slack not connected for this brand", channels: [] });
  }

  const { token } = resolveSlackBotToken(slug);
  if (!token) {
    return res.status(200).json({ ok: false, error: "Slack token not found. Connect Slack with OAuth or configure a legacy bot token.", channels: [] });
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
