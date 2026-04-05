import type { NextApiRequest, NextApiResponse } from "next";
import { readJSON } from "@/lib/data/json-io";
import { apiHealthFile } from "@/lib/data/paths";

/**
 * GET /api/system/api-health
 * Ported from mc-server.js:8589
 * Returns cached api-health.json
 */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  res.setHeader("Access-Control-Allow-Origin", "*");
  const data = readJSON(apiHealthFile(), { lastCheck: null, services: {} });
  res.status(200).json(data);
}
