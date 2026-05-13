import type { NextApiRequest, NextApiResponse } from "next";
import path from "path";
import { compose, withErrorHandler, withSlugAuth } from "@/lib/api-middleware";
import { brandDir, integrationsFile } from "@/lib/data/paths";
import { readJSON } from "@/lib/data/json-io";

interface ChannelOption {
  transport: "discord" | "slack";
  id: string;
  name: string;
  configured: boolean;
}

interface ClientConfig {
  channels?: Record<string, string>;
}

interface IntegrationsConfig {
  dataSources?: Record<string, { status?: string; config?: Record<string, string> }>;
  services?: Record<string, { status?: string; config?: Record<string, string> }>;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const slug = req.query.slug as string;
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const clientConfig = readJSON<ClientConfig>(path.join(brandDir(slug), "client-config.json"), {});
  const integrations = readJSON<IntegrationsConfig>(integrationsFile(slug), {});
  const dataSources = integrations.dataSources || integrations.services || {};
  const slack = dataSources.slack;

  const channels: ChannelOption[] = Object.entries(clientConfig.channels || {}).map(([name, id]) => ({
    transport: "discord",
    id,
    name,
    configured: true,
  }));

  const slackDispatch = slack?.config?.DISPATCH_CHANNEL_ID;
  if (slackDispatch) {
    channels.push({
      transport: "slack",
      id: slackDispatch,
      name: slack.config?.DISPATCH_CHANNEL_NAME || "dispatch",
      configured: slack.status === "connected",
    });
  }

  return res.status(200).json({ ok: true, channels });
}

export default compose(withErrorHandler, withSlugAuth)(handler);
