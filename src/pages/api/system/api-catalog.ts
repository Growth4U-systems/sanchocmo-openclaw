import type { NextApiRequest, NextApiResponse } from "next";
import { readJSON } from "@/lib/data/json-io";
import path from "path";
import { BASE } from "@/lib/data/paths";

/**
 * GET /api/system/api-catalog
 * Returns the API catalog from the shared skills tree
 * (~/.openclaw/skills/, one level above BASE).
 */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
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
  const data = readJSON(catalogPath, { categories: {} });
  res.status(200).json(data);
}
