import type { NextApiRequest, NextApiResponse } from "next";
import path from "path";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";
import { readJSON } from "@/lib/data/json-io";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  // Shared skills tree lives at ~/.openclaw/skills/, one level above BASE.
  const catalogPath = path.join(BASE, "..", "skills", "acquisition-metrics-plan", "schemas", "api-catalog.json");
  const catalog = readJSON(catalogPath, null);
  if (!catalog) {
    return res.status(500).json({ error: "Failed to load catalog" });
  }

  return res.status(200).json(catalog);
}

export default compose(withErrorHandler, withAuth)(handler);
