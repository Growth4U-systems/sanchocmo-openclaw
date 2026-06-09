import fs from "fs";
import path from "path";
import { BASE } from "@/lib/data/paths";
import { getSlackBotToken } from "@/lib/data/integrations";
import type { Transport, PublishTarget, PublishMessage, PublishResult } from "./types";

// Token lookup order (kept identical to the previous send-dispatch inline copy
// so the admin UI's "Slack connected" state matches what publishing can use):
//   1) integrations.json slack.bot_token_encrypted (OAuth callback)
//   2) brand/<slug>/.env  ({SLUG_UPPER}_SLACK_BOT_TOKEN | SLACK_BOT_TOKEN)
//   3) process.env        ({SLUG_UPPER}_SLACK_BOT_TOKEN | SLACK_BOT_TOKEN)
function loadBrandEnv(slug: string): Record<string, string> {
  const envPath = path.join(BASE, "brand", slug, ".env");
  const vars: Record<string, string> = {};
  try {
    for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      vars[trimmed.slice(0, eq)] = trimmed.slice(eq + 1).replace(/^["']|["']$/g, "");
    }
  } catch { /* optional */ }
  return vars;
}

export function resolveSlackToken(slug: string): string | null {
  const slugUpper = slug.toUpperCase();
  let token: string | null = null;
  try { token = getSlackBotToken(slug); } catch { token = null; }
  if (token) return token;
  const env = loadBrandEnv(slug);
  return (
    env[`${slugUpper}_SLACK_BOT_TOKEN`] ||
    env.SLACK_BOT_TOKEN ||
    process.env[`${slugUpper}_SLACK_BOT_TOKEN`] ||
    process.env.SLACK_BOT_TOKEN ||
    null
  );
}

export async function postToSlack(
  token: string,
  channelId: string,
  text: string,
  blocks: unknown[] = [],
  threadTs?: string,
): Promise<{ ok: boolean; error?: string; ts?: string }> {
  const body: Record<string, unknown> = {
    channel: channelId,
    text,
    unfurl_links: false,
    unfurl_media: false,
  };
  if (blocks.length) body.blocks = blocks;
  if (threadTs) body.thread_ts = threadTs;
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as { ok: boolean; error?: string; ts?: string };
}

export class SlackTransport implements Transport {
  name = "slack";

  async isConfigured(slug: string): Promise<boolean> {
    return !!resolveSlackToken(slug);
  }

  async publish(slug: string, target: PublishTarget, msg: PublishMessage): Promise<PublishResult> {
    const token = resolveSlackToken(slug);
    if (!token) {
      return { ok: false, error: `Slack bot token not configured for ${slug}` };
    }
    const root = await postToSlack(token, target.channel, msg.title);
    if (!root.ok) return { ok: false, error: root.error || "slack root post failed" };
    const thread = await postToSlack(token, target.channel, msg.body, [], root.ts);
    return {
      ok: thread.ok,
      rootId: root.ts,
      threadId: thread.ok ? thread.ts : undefined,
      error: thread.ok ? undefined : thread.error,
    };
  }
}
