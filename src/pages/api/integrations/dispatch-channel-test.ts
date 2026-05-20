/**
 * POST /api/integrations/dispatch-channel-test
 *
 * Used by the "Canal de envío" editor (InputsTab → DispatchChannelForm) to
 * verify Slack/Discord delivery actually works before relying on the
 * Editorial Dispatch cron. Posts a single, low-stakes test message into
 * the selected channel and surfaces Slack's error code verbatim with a
 * human-readable suggestion when known.
 *
 * Body:
 *   { slug: string, transport: "slack" | "discord", channel_id: string,
 *     channel_name?: string }
 *
 * Token resolution mirrors send-dispatch.ts (same fallback chain) so a
 * green test here means a green real dispatch:
 *   1. integrations.json → slack.bot_token_encrypted   (OAuth)
 *   2. brand/{slug}/.env → {SLUG}_SLACK_BOT_TOKEN or SLACK_BOT_TOKEN
 *   3. process.env → {SLUG}_SLACK_BOT_TOKEN or SLACK_BOT_TOKEN  (workspace-wide)
 *
 * Discord is reported as unsupported for now — the dispatch flow has
 * Discord coverage on the Editorial Dispatch agent side, but we don't yet
 * own a server-side `send-dispatch`-equivalent for Discord, so the smoke
 * test here would be misleading. UI greys the button instead.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";
import { getSlackBotToken } from "@/lib/data/integrations";

interface TestRequest {
  slug?: string;
  transport?: "slack" | "discord";
  channel_id?: string;
  channel_name?: string;
}

interface SlackPostResponse {
  ok: boolean;
  error?: string;
  needed?: string;
  provided?: string;
  ts?: string;
  channel?: string;
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

function resolveSlackToken(slug: string): { token: string | null; source: string } {
  // Same order as send-dispatch.ts. We track which tier wins for the
  // diagnostics surface so the operator can tell "OAuth not done" apart
  // from "no env var on the host" without having to grep three places.
  const slugUpper = slug.toUpperCase();
  try {
    const oauth = getSlackBotToken(slug);
    if (oauth) return { token: oauth, source: "integrations.json (OAuth)" };
  } catch { /* keep going */ }
  const env = loadBrandEnv(slug);
  const brandToken = env[`${slugUpper}_SLACK_BOT_TOKEN`] || env.SLACK_BOT_TOKEN;
  if (brandToken) return { token: brandToken, source: `brand/${slug}/.env` };
  const procToken = process.env[`${slugUpper}_SLACK_BOT_TOKEN`] || process.env.SLACK_BOT_TOKEN;
  if (procToken) return { token: procToken, source: "process.env (workspace-wide)" };
  return { token: null, source: "" };
}

interface DiagnosedError {
  http: number;
  error: string;
  suggest: string;
  raw: SlackPostResponse | { message: string } | null;
}

function diagnoseSlackError(resp: SlackPostResponse): DiagnosedError {
  // Translate Slack's machine-readable error codes into a single
  // actionable sentence per case. Anything we don't recognise passes
  // through verbatim — better than swallowing a novel failure.
  const e = resp.error || "unknown_error";
  if (e === "invalid_auth" || e === "token_revoked" || e === "not_authed") {
    return {
      http: 401,
      error: e,
      suggest: "El bot token no es válido. Reinstalá la app en Slack (api.slack.com/apps → tu app → Install App → Reinstall to Workspace) y actualizá SLACK_BOT_TOKEN en el container.",
      raw: resp,
    };
  }
  if (e === "missing_scope") {
    const needed = resp.needed || "chat:write";
    return {
      http: 403,
      error: e,
      suggest: `Falta el scope "${needed}" en el bot token. OAuth & Permissions → Bot Token Scopes → Add → ${needed} → luego Reinstall to Workspace para regenerar el token.`,
      raw: resp,
    };
  }
  if (e === "not_in_channel" || e === "is_archived" || e === "channel_not_found") {
    return {
      http: 400,
      error: e,
      suggest: e === "not_in_channel"
        ? "El bot no es miembro del canal. En Slack ejecutá `/invite @<bot>` en ese canal, o agregá el scope chat:write.public al bot para postear en canales públicos sin invitación."
        : e === "is_archived"
          ? "El canal está archivado. Desarchivalo desde Slack o elegí otro canal."
          : "Channel ID no encontrado. ¿Cambió el canal o el bot no tiene channels:read?",
      raw: resp,
    };
  }
  if (e === "ratelimited") {
    return { http: 429, error: e, suggest: "Slack te está limitando. Probá de nuevo en unos segundos.", raw: resp };
  }
  return {
    http: 400,
    error: e,
    suggest: "Error de Slack sin diagnóstico específico. Ver `raw` para más contexto.",
    raw: resp,
  };
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!req.ctx?.isAdmin) return res.status(403).json({ error: "Forbidden" });

  const { slug, transport, channel_id, channel_name } = (req.body || {}) as TestRequest;
  if (!slug) return res.status(400).json({ error: "Missing slug" });
  if (!transport) return res.status(400).json({ error: "Missing transport" });
  if (!channel_id) return res.status(400).json({ error: "Missing channel_id" });

  if (transport === "discord") {
    return res.status(501).json({
      ok: false,
      error: "discord_not_supported",
      suggest: "El test endpoint todavía no cubre Discord. Editorial Dispatch sí postea a Discord vía el agent, pero la verificación previa solo está disponible para Slack.",
    });
  }

  if (transport !== "slack") {
    return res.status(400).json({ error: `Unknown transport: ${transport}` });
  }

  const { token, source } = resolveSlackToken(slug);
  if (!token) {
    return res.status(400).json({
      ok: false,
      error: "no_token",
      suggest: `No hay Slack bot token para ${slug}. Conectá Slack en Settings → APIs (OAuth), o agregá ${slug.toUpperCase()}_SLACK_BOT_TOKEN a brand/${slug}/.env, o definí SLACK_BOT_TOKEN como env var del host (workspace-wide).`,
    });
  }

  // Test payload — short, attributable, harmless. We include the channel
  // name in the text to make it obvious in the channel why this message
  // showed up. The blocks variant gives the operator a context line they
  // can hide-from-channel without losing the audit trail.
  const channelLabel = channel_name ? `#${channel_name}` : channel_id;
  const text = `🧪 Prueba de conexión desde Mission Control → ${channelLabel}`;
  const blocks = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `🧪 *Prueba de conexión* — Si ves este mensaje, el Editorial Dispatch puede postear en ${channelLabel}.`,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Disparada manualmente desde MC · cliente \`${slug}\` · token desde ${source}`,
        },
      ],
    },
  ];

  let slackResp: SlackPostResponse;
  try {
    const r = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        channel: channel_id,
        text,
        blocks,
        unfurl_links: false,
        unfurl_media: false,
      }),
    });
    slackResp = (await r.json()) as SlackPostResponse;
  } catch (e) {
    return res.status(502).json({
      ok: false,
      error: "network_error",
      suggest: "No se pudo contactar slack.com/api. Chequeá DNS / firewall del host.",
      raw: { message: (e as Error).message },
    });
  }

  if (!slackResp.ok) {
    const diag = diagnoseSlackError(slackResp);
    return res.status(diag.http).json({
      ok: false,
      transport: "slack",
      token_source: source,
      error: diag.error,
      suggest: diag.suggest,
      raw: diag.raw,
    });
  }

  return res.status(200).json({
    ok: true,
    transport: "slack",
    token_source: source,
    channel_id,
    channel_name: channel_name ?? null,
    ts: slackResp.ts ?? null,
    message: `Mensaje de prueba publicado en ${channelLabel}. Verificalo en Slack — podés borrarlo si no querés que quede.`,
  });
}

export default compose(withErrorHandler, withAuth)(handler);
