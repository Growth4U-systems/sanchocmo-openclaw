import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withErrorHandler, withSlugAuth } from "@/lib/api-middleware";
import { apiHealthFile } from "@/lib/data/paths";
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

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const data = readJSON<ApiHealth>(apiHealthFile(), { lastCheck: null, services: {} });
  const gog = data.services?.gog || { status: "unknown" };
  const notion = data.services?.notion || { status: "unknown" };

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
    },
  });
}

export default compose(withErrorHandler, withSlugAuth)(handler);
