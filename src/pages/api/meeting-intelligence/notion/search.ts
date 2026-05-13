import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { compose, withErrorHandler, withSlugAuth } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";

const NOTION_VERSION = "2022-06-28";

type RichText = { plain_text?: string };
type NotionTitleProperty = { type?: string; title?: RichText[] };
type NotionSearchResult = {
  id?: string;
  object?: string;
  title?: RichText[];
  properties?: Record<string, NotionTitleProperty>;
  url?: string;
  last_edited_time?: string;
};
type NotionSearchResponse = {
  message?: string;
  results?: NotionSearchResult[];
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

function richTextPlain(items: RichText[] | undefined): string {
  return (items || []).map((item) => item.plain_text || "").join("").trim();
}

function resultTitle(result: NotionSearchResult): string {
  if (result.object === "database") return richTextPlain(result.title) || "Untitled database";
  const props = result.properties || {};
  for (const value of Object.values(props)) {
    if (value?.type === "title") return richTextPlain(value.title) || "Untitled page";
  }
  return "Untitled page";
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const key = getNotionKey();
  if (!key) return res.status(200).json({ ok: false, error: "NOTION_API_KEY not configured.", results: [] });

  const query = String(req.query.q || "").trim();
  const object = String(req.query.object || "database") === "page" ? "page" : "database";

  const response = await fetch("https://api.notion.com/v1/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "Notion-Version": NOTION_VERSION,
    },
    body: JSON.stringify({
      query,
      page_size: 25,
      filter: { property: "object", value: object },
      sort: { direction: "descending", timestamp: "last_edited_time" },
    }),
  });

  const data = (await response.json()) as NotionSearchResponse;
  if (!response.ok) {
    return res.status(200).json({ ok: false, error: data.message || `HTTP ${response.status}`, results: [] });
  }

  const results = (data.results || []).map((result) => ({
    id: result.id,
    name: resultTitle(result),
    object: result.object,
    url: result.url,
    lastEditedTime: result.last_edited_time || null,
  }));

  return res.status(200).json({ ok: true, results });
}

export default compose(withErrorHandler, withSlugAuth)(handler);
