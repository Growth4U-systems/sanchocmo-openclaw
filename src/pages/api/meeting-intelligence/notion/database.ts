import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { compose, withErrorHandler, withSlugAuth } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";

const NOTION_VERSION = "2022-06-28";

type NotionDatabaseResponse = {
  message?: string;
  properties?: Record<string, { id?: string; type?: string }>;
};

function parseEnvFile(filePath: string): Record<string, string> {
  try {
    const vars: Record<string, string> = {};
    const content = fs.readFileSync(filePath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      vars[trimmed.slice(0, eq)] = trimmed.slice(eq + 1).replace(/^["']|["']$/g, "");
    }
    return vars;
  } catch {
    return {};
  }
}

function getNotionKey() {
  const root = path.join(BASE, "..");
  const envLocal = parseEnvFile(path.join(root, ".env.local"));
  const env = parseEnvFile(path.join(root, ".env"));
  return process.env.NOTION_API_KEY || envLocal.NOTION_API_KEY || env.NOTION_API_KEY || "";
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const key = getNotionKey();
  if (!key) return res.status(200).json({ ok: false, error: "NOTION_API_KEY not configured.", properties: [] });

  const databaseId = String(req.query.databaseId || "").trim();
  if (!databaseId) return res.status(400).json({ error: "Missing databaseId" });

  const response = await fetch(`https://api.notion.com/v1/databases/${encodeURIComponent(databaseId)}`, {
    headers: {
      Authorization: `Bearer ${key}`,
      "Notion-Version": NOTION_VERSION,
    },
  });

  const data = (await response.json()) as NotionDatabaseResponse;
  if (!response.ok) {
    return res.status(200).json({ ok: false, error: data.message || `HTTP ${response.status}`, properties: [] });
  }

  const properties = Object.entries(data.properties || {}).map(([name, prop]) => ({
    id: prop.id,
    name,
    type: prop.type,
  }));

  return res.status(200).json({ ok: true, properties });
}

export default compose(withErrorHandler, withSlugAuth)(handler);
