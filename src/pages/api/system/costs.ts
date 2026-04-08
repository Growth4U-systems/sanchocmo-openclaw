import type { NextApiRequest, NextApiResponse } from "next";
import { withAuth, withErrorHandler, compose } from "@/lib/api-middleware";
import { readJSON } from "@/lib/data/json-io";
import path from "path";
import { BASE } from "@/lib/data/paths";

/**
 * GET /api/system/costs
 * Returns global cost data from costs-global.json
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const data = readJSON(path.join(BASE, "costs-global.json"), null);
  if (!data) return res.status(200).json({ period: null, total_cost_usd: 0, total_cost_eur: 0, agents: {} });

  res.status(200).json(data);
}

export default compose(withErrorHandler, withAuth)(handler);
