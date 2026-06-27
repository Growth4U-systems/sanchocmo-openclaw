import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withErrorHandler, withSlugAuth } from "@/lib/api-middleware";
import { loadIntegrations, saveSlackIntegration } from "@/lib/data/integrations";
import { authTest } from "@/lib/slack-web-api";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const slug = req.query.slug as string;
  const data = loadIntegrations(slug);
  let slack = data.slack;

  if (!slack) {
    return res.status(200).json({ status: "disconnected" });
  }

  if (req.query.refresh === "1") {
    const result = await authTest(slug);
    if (result.ok) {
      slack = { ...slack, status: "connected", last_error: undefined };
    } else {
      slack = { ...slack, status: "error", last_error: result.error || "auth_test_failed" };
    }
    saveSlackIntegration(slug, slack);
  }

  // Never return the encrypted (or decrypted) token via this endpoint
  return res.status(200).json({
    status: slack.status,
    team_id: slack.team_id,
    team_name: slack.team_name,
    bot_user_id: slack.bot_user_id,
    scope: slack.scope,
    installed_at: slack.installed_at,
    last_error: slack.last_error,
  });
}

export default compose(withErrorHandler, withSlugAuth)(handler);
