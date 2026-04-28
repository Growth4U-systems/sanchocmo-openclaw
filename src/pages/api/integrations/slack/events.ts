import type { NextApiRequest, NextApiResponse } from "next";
import { verifySlackSignature } from "@/lib/slack-signing";
import { findSlugByTeamId } from "@/lib/data/integrations";
import { postMessage } from "@/lib/slack-web-api";

// Slack Events API endpoint.
// To enable: api.slack.com/apps → Event Subscriptions →
//   Request URL: https://<host>/api/integrations/slack/events
//
// Slack will POST `url_verification` once when you set the URL. We must echo
// the challenge back. Subsequent events arrive as `event_callback`.
//
// Per-event handlers are stubs for now; expand as new Slack-driven flows
// are wired (mentions, message subscriptions, app_home_opened, etc.).

export const config = {
  api: { bodyParser: false }, // raw body needed for signature verification
};

function readRawBody(req: NextApiRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

interface SlackEventEnvelope {
  type?: string;
  challenge?: string;             // url_verification
  team_id?: string;
  api_app_id?: string;
  event?: SlackEvent;             // event_callback
  event_id?: string;
  event_time?: number;
}

interface SlackEvent {
  type?: string;
  user?: string;
  text?: string;
  channel?: string;
  ts?: string;
  bot_id?: string;
  thread_ts?: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const rawBody = await readRawBody(req);

  const sig = verifySlackSignature({
    timestamp: req.headers["x-slack-request-timestamp"] as string | undefined,
    signature: req.headers["x-slack-signature"] as string | undefined,
    rawBody,
  });
  if (!sig.valid) {
    console.warn("[slack/events] signature rejected:", sig.reason);
    return res.status(401).json({ error: "Invalid signature" });
  }

  let envelope: SlackEventEnvelope;
  try {
    envelope = JSON.parse(rawBody) as SlackEventEnvelope;
  } catch {
    return res.status(400).json({ error: "Invalid JSON" });
  }

  // 1. URL verification handshake: Slack sends this once when you save the
  //    Request URL in the Event Subscriptions panel.
  if (envelope.type === "url_verification" && envelope.challenge) {
    return res.status(200).json({ challenge: envelope.challenge });
  }

  // 2. Regular event callbacks. Ack 200 within 3s. Slack ignores response body.
  if (envelope.type === "event_callback" && envelope.event) {
    res.status(200).end();
    handleEvent(envelope).catch((err) => {
      console.error("[slack/events] handler error:", err);
    });
    return;
  }

  // Unknown envelope type — ack so Slack stops retrying.
  return res.status(200).end();
}

async function handleEvent(envelope: SlackEventEnvelope): Promise<void> {
  const ev = envelope.event!;
  const teamId = envelope.team_id || "";
  const slug = teamId ? findSlugByTeamId(teamId) : null;

  // Ignore messages posted by bots (including ourselves) to avoid loops.
  if (ev.bot_id) return;

  console.info("[slack/events]", {
    team_id: teamId,
    slug,
    type: ev.type,
    user: ev.user,
    channel: ev.channel,
    text_preview: ev.text?.slice(0, 80),
    thread_ts: ev.thread_ts,
  });

  if (ev.type === "app_mention") {
    await handleAppMention(ev, slug);
    return;
  }

  // TODO per-event handlers:
  //   ev.type === "message"            → if in a thread we own, hand to mc-chat
  //   ev.type === "app_home_opened"    → render Home tab
  //   ev.type === "channel_left"       → mark integration stale
}

async function handleAppMention(ev: SlackEvent, slug: string | null): Promise<void> {
  if (!slug) {
    console.warn("[slack/events] app_mention: no slug for team");
    return;
  }
  if (!ev.channel || !ev.user) return;

  // Strip the leading "<@BOT_USER_ID>" out of the text.
  const cleanText = (ev.text || "").replace(/<@[A-Z0-9]+>\s*/g, "").trim();

  // Forward the message to OpenClaw's gateway so Sancho can answer with the
  // same brain it uses on Discord. The gateway runs on 127.0.0.1:18789 inside
  // the container; for now we POST a hint and let the gateway pick it up.
  // If the gateway integration isn't ready yet, we still ack with a friendly
  // placeholder so the user knows we received the mention.
  let replyText: string;
  try {
    const gatewayRes = await fetch("http://127.0.0.1:18789/__openclaw__/slack/mention", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENCLAW_REMOTE_TOKEN || ""}`,
      },
      body: JSON.stringify({
        slug,
        channel: ev.channel,
        thread_ts: ev.thread_ts || ev.ts,
        user: ev.user,
        text: cleanText,
      }),
      signal: AbortSignal.timeout(2000),
    });
    if (gatewayRes.ok) {
      // Gateway will post the reply itself.
      return;
    }
    replyText = `:wave: Hola <@${ev.user}>, recibí tu mensaje pero el gateway de Sancho no respondió a tiempo. Lo tengo registrado.`;
  } catch {
    replyText = `:wave: Hola <@${ev.user}>, recibí tu mención. (Gateway de Sancho aún no enrutado a Slack — próximo PR.)`;
  }

  await postMessage(slug, {
    channel: ev.channel,
    thread_ts: ev.thread_ts || ev.ts,
    text: replyText,
  });
}
