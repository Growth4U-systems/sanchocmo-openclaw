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

  const slug = req.ctx?.clientSlug || (req.query.slug as string);
  if (!slug) {
    return res.status(400).json({ error: "Missing slug" });
  }

  const planFile = path.join(BASE, "brand", slug, "metrics-plan.json");
  const plan = readJSON(planFile, null);
  if (!plan) {
    return res.status(404).json({ error: "No metrics plan found" });
  }

  return res.status(200).json(plan);
}

export default compose(withErrorHandler, withAuth)(handler);
