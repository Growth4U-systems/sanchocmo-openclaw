import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withErrorHandler, withSlugAuth } from "@/lib/api-middleware";
import { readBrandSecret } from "@/lib/brand-env";

const NOTION_VERSION = "2022-06-28";

type NotionDatabaseResponse = {
  message?: string;
  properties?: Record<string, {
    id?: string;
    type?: string;
    relation?: {
      database_id?: string;
      type?: string;
    };
  }>;
};

// Resolve the per-client Notion token ({SLUG}_NOTION_API_KEY in brand/{slug}/.env),
// falling back to the workspace/global NOTION_API_KEY. Same precedence the rest of
// the connectors use (Slack, WordPress, Metricool).
function getNotionKey(slug: string) {
  return readBrandSecret(slug, "notion", "API_KEY") || "";
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const slug = String(req.query.slug || "").trim();
  const key = getNotionKey(slug);
  if (!key) return res.status(200).json({ ok: false, error: `Notion no conectado para "${slug}". Conectalo en Settings → APIs.`, properties: [] });

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
    id: prop.id || name,
    name,
    type: prop.type || "unknown",
    relationDatabaseId: prop.relation?.database_id || null,
    source: "notion",
  }));

  if (!properties.some((prop) => prop.name.toLowerCase() === "clients")) {
    const relationCandidate = properties.find((prop) =>
      prop.type === "relation" && /(client|system|empresa|company|g4u)/i.test(prop.name)
    ) || properties.find((prop) => prop.type === "relation");
    properties.unshift({
      id: relationCandidate?.id || "clients",
      name: "clients",
      type: "relation",
      relationDatabaseId: relationCandidate?.relationDatabaseId || null,
      source: "fallback",
    });
  }

  return res.status(200).json({ ok: true, properties });
}

export default compose(withErrorHandler, withSlugAuth)(handler);
