import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withErrorHandler, withSlugAuth } from "@/lib/api-middleware";
import { signState } from "@/lib/encryption";

// Default scopes for SanchoCMO bot. Override via SLACK_BOT_SCOPES env var if needed.
const DEFAULT_SCOPES = [
  "chat:write",
  "chat:write.public",
  "channels:read",
  "channels:history",
  "groups:read",
  "groups:history",
  "app_mentions:read",
  "files:read",
  "files:write",
  "im:write",
  "mpim:write",
  "users:read",
  "commands",
  "incoming-webhook",
].join(",");

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const slug = req.query.slug as string;

  const clientId = process.env.SLACK_CLIENT_ID;
  const redirectUri = process.env.SLACK_REDIRECT_URI;
  const scopes = process.env.SLACK_BOT_SCOPES || DEFAULT_SCOPES;

  if (!clientId || !redirectUri) {
    return res.status(500).json({
      error: "Slack OAuth not configured. Set SLACK_CLIENT_ID and SLACK_REDIRECT_URI.",
    });
  }

  const state = signState(slug);

  const authUrl = new URL("https://slack.com/oauth/v2/authorize");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("scope", scopes);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", state);

  if (req.query.format === "json") {
    return res.status(200).json({ url: authUrl.toString() });
  }

  res.redirect(302, authUrl.toString());
}

export default compose(withErrorHandler, withSlugAuth)(handler);
