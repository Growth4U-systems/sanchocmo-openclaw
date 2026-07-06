import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { compose, withErrorHandler, withAuth, canAccessSlug } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";
import { readJSON } from "@/lib/data/json-io";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const slugParam = req.ctx?.clientSlug || (req.query.slug as string) || null;
  if (!slugParam) {
    return res.status(400).json({ error: "Missing slug" });
  }
  if (!canAccessSlug(req.ctx, slugParam)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const monDir = path.join(BASE, "brand", slugParam, "monitoring");
  const result: Record<string, unknown> = {
    slug: slugParam,
    health_score: null,
    pending_recommendations: null,
    latest_weekly: null,
  };

  result.health_score = readJSON(path.join(monDir, "health-score.json"), null);
  result.pending_recommendations = readJSON(path.join(monDir, "pending-recommendations.json"), null);

  try {
    const weeklyDir = path.join(monDir, "weekly");
    const files = fs.readdirSync(weeklyDir).filter((f) => f.endsWith(".json")).sort().reverse();
    if (files.length > 0) {
      result.latest_weekly = readJSON(path.join(weeklyDir, files[0]), null);
    }
  } catch { /* empty */ }

  return res.status(200).json(result);
}

export default compose(withErrorHandler, withAuth)(handler);
