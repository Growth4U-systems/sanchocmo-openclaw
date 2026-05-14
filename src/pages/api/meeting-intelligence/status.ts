import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withErrorHandler, withSlugAuth } from "@/lib/api-middleware";
import { apiHealthFile, integrationsFile } from "@/lib/data/paths";
import { readJSON } from "@/lib/data/json-io";

interface ServiceStatus {
  status?: string;
  lastCheck?: string;
  details?: Record<string, unknown>;
}

interface ApiHealth {
  lastCheck?: string | null;
  services?: Record<string, ServiceStatus>;
}

interface IntegrationEntry {
  status?: string;
  config?: Record<string, unknown>;
}

interface IntegrationsConfig {
  dataSources?: Record<string, IntegrationEntry>;
  services?: Record<string, IntegrationEntry>;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const slug = req.query.slug as string;
  const data = readJSON<ApiHealth>(apiHealthFile(), { lastCheck: null, services: {} });
  const integrations = readJSON<IntegrationsConfig>(integrationsFile(slug), {});
  const brandServices = integrations.dataSources || integrations.services || {};
  const gog = data.services?.gog || { status: "unknown" };
  const notion = data.services?.notion || { status: "unknown" };
  const slack = data.services?.slack || { status: "unknown" };
  const discord = data.services?.discord || { status: "unknown" };
  const slackBrand = brandServices.slack;
  const discordBrand = brandServices.discord;
  const brandAwareStatus = (globalStatus: string | undefined, brand?: IntegrationEntry) => {
    if (!brand || brand.status !== "connected") return "not configured";
    return globalStatus && globalStatus !== "unknown" ? globalStatus : "connected";
  };

  return res.status(200).json({
    ok: true,
    lastCheck: data.lastCheck || null,
    services: {
      googleWorkspace: {
        id: "gog",
        label: "Google Workspace",
        status: gog.status || "unknown",
        lastCheck: gog.lastCheck || null,
        account: typeof gog.details?.account === "string" ? gog.details.account : null,
        details: gog.details || {},
      },
      notion: {
        id: "notion",
        label: "Notion",
        status: notion.status || "unknown",
        lastCheck: notion.lastCheck || null,
        botName: typeof notion.details?.botName === "string" ? notion.details.botName : null,
        details: notion.details || {},
      },
      slack: {
        id: "slack",
        label: "Slack",
        status: brandAwareStatus(slack.status, slackBrand),
        lastCheck: slack.lastCheck || null,
        account: typeof slack.details?.teamName === "string" ? slack.details.teamName : null,
        details: { ...(slack.details || {}), brandConfig: slackBrand?.config || {} },
      },
      discord: {
        id: "discord",
        label: "Discord",
        status: brandAwareStatus(discord.status, discordBrand),
        lastCheck: discord.lastCheck || null,
        account: typeof discord.details?.guildName === "string" ? discord.details.guildName : null,
        details: { ...(discord.details || {}), brandConfig: discordBrand?.config || {} },
      },
    },
  });
}

export default compose(withErrorHandler, withSlugAuth)(handler);
