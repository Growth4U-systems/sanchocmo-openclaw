import type { NextApiRequest, NextApiResponse } from "next";
import { readJSON } from "@/lib/data/json-io";
import path from "path";
import { BASE } from "@/lib/data/paths";
import { resolveYalcConfig, yalcFetch } from "@/lib/yalc/client";
import {
  mergeYalcProvidersIntoCatalog,
  type ApiCatalog,
  type YalcKnowledgePayload,
} from "@/lib/yalc/provider-catalog";

/**
 * GET /api/system/api-catalog
 * Returns the API catalog from the shared skills tree
 * (~/.openclaw/skills/, one level above BASE).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const catalogPath = path.join(
    BASE,
    "..",
    "skills",
    "acquisition-metrics-plan",
    "schemas",
    "api-catalog.json"
  );
  let data = readJSON<ApiCatalog>(catalogPath, { categories: {} });

  const slug = typeof req.query.slug === "string" ? req.query.slug : "";
  if (slug) {
    try {
      const knowledge = await yalcFetch<YalcKnowledgePayload>(
        resolveYalcConfig(slug),
        "/api/keys/knowledge",
      );
      data = mergeYalcProvidersIntoCatalog(data, knowledge);
    } catch {
      // YALC is optional for the generic API settings panel. If it is down or
      // not configured, keep returning Sancho's static catalog.
    }
  }

  res.status(200).json(data);
}
