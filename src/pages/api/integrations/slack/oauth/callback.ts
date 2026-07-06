import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withErrorHandler } from "@/lib/api-middleware";
import { encryptToken, verifyState } from "@/lib/encryption";
import { saveSlackIntegration } from "@/lib/data/integrations";
import type { SlackIntegration } from "@/types";

interface SlackOAuthResponse {
  ok: boolean;
  error?: string;
  access_token?: string;       // Bot token (xoxb-...)
  scope?: string;
  bot_user_id?: string;
  team?: { id: string; name: string };
  authed_user?: { id: string };
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { code, state, error: slackError } = req.query as Record<string, string>;

  if (slackError) {
    res.redirect(
      302,
      `/dashboard/admin/settings?tab=apis&slack_error=${encodeURIComponent(slackError)}`
    );
    return;
  }

  if (!code || !state) {
    return res.status(400).json({ error: "Missing code or state" });
  }

  const verified = verifyState(state);
  if (!verified) {
    return res.status(400).json({ error: "Invalid state (CSRF check failed)" });
  }
  const slug = verified.slug;

  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  const redirectUri = process.env.SLACK_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return res.status(500).json({ error: "Slack OAuth not configured" });
  }

  // Exchange code for bot token
  const tokenRes = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }).toString(),
  });

  const tokenData = (await tokenRes.json()) as SlackOAuthResponse;

  if (!tokenData.ok || !tokenData.access_token || !tokenData.team) {
    console.error("[slack/oauth/callback] Token exchange failed:", tokenData);
    res.redirect(
      302,
      `/dashboard/admin/settings?tab=apis&slack_error=${encodeURIComponent(tokenData.error || "token_exchange_failed")}`
    );
    return;
  }

  const accessToken = tokenData.access_token;
  const team = tokenData.team;

  const slack: SlackIntegration = {
    status: "connected",
    team_id: team.id,
    team_name: team.name,
    bot_user_id: tokenData.bot_user_id || "",
    bot_token_encrypted: encryptToken(accessToken),
    scope: tokenData.scope || "",
    authed_user_id: tokenData.authed_user?.id || "",
    installed_at: new Date().toISOString(),
  };

  saveSlackIntegration(slug, slack);

  res.redirect(
    302,
    `/dashboard/admin/settings?tab=apis&slack_connected=1&slug=${encodeURIComponent(slug)}`
  );
}

export default compose(withErrorHandler)(handler);
