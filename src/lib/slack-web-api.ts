import { getSlackBotToken } from "@/lib/data/integrations";

// Tiny Slack Web API helper. Wraps fetch with the decrypted bot token for a
// given client slug, so callers don't reach into integrations.json directly.

interface SlackPostMessageArgs {
  channel: string;
  text?: string;
  thread_ts?: string;
  blocks?: unknown[];
  unfurl_links?: boolean;
  unfurl_media?: boolean;
}

interface SlackResponse {
  ok: boolean;
  error?: string;
  ts?: string;
  channel?: string;
}

const BASE = "https://slack.com/api";

async function callSlack(
  slug: string,
  method: string,
  body: Record<string, unknown>
): Promise<SlackResponse> {
  const token = getSlackBotToken(slug);
  if (!token) {
    return { ok: false, error: `no_slack_integration_for_slug:${slug}` };
  }
  const res = await fetch(`${BASE}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  return (await res.json()) as SlackResponse;
}

export function postMessage(slug: string, args: SlackPostMessageArgs): Promise<SlackResponse> {
  return callSlack(slug, "chat.postMessage", args as unknown as Record<string, unknown>);
}

export function postEphemeral(
  slug: string,
  args: SlackPostMessageArgs & { user: string }
): Promise<SlackResponse> {
  return callSlack(slug, "chat.postEphemeral", args as unknown as Record<string, unknown>);
}

export function authTest(slug: string): Promise<SlackResponse> {
  return callSlack(slug, "auth.test", {});
}
