import { resolveSlackBotToken } from "@/lib/slack-token";
import type { Transport, PublishTarget, PublishMessage, PublishResult } from "./types";

// Token lookup order (kept identical to the previous send-dispatch inline copy
// so the admin UI's "Slack connected" state matches what publishing can use):
//   1) integrations.json slack.bot_token_encrypted (OAuth callback)
//   2) brand/<slug>/.env  ({SLUG_UPPER}_SLACK_BOT_TOKEN | SLACK_BOT_TOKEN)
//   3) process.env        ({SLUG_UPPER}_SLACK_BOT_TOKEN | SLACK_BOT_TOKEN)
export function resolveSlackToken(slug: string): string | null {
  return resolveSlackBotToken(slug).token;
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
