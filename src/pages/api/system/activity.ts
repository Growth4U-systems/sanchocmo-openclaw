import type { NextApiRequest, NextApiResponse } from "next";
import path from "path";
import { withAuth, withErrorHandler, compose } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";

interface McData {
  activity?: { date: string; time?: string; text: string; raw?: string; client?: string }[];
}

/**
 * GET /api/system/activity?slug=hospital-capilar
 * Returns activity events from mc-data.js
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const slugParam = (req.query.slug as string) || null;

  // mc-data.js exports MC_DATA — read it as JSON (it's actually "const MC_DATA = {...}")
  const mcDataPath = path.join(BASE, "mc-data.js");
  let activity: McData["activity"] = [];

  try {
    const fs = await import("fs");
    const raw = fs.readFileSync(mcDataPath, "utf-8");
    // Extract the JSON object from "const MC_DATA = {...};"
    const jsonStart = raw.indexOf("{");
    const jsonEnd = raw.lastIndexOf("}");
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      const data: McData = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
      activity = data.activity || [];
    }
  } catch {
    // If mc-data.js can't be parsed, return empty
  }

  // Filter out cron entries (those come from /api/cron-runs)
  activity = activity.filter((e) => !(e.raw && e.raw.startsWith("Cron run:")));

  if (slugParam) {
    activity = activity.filter((e) => e.client === slugParam);
  }

  res.status(200).json(activity);
}

export default compose(withErrorHandler, withAuth)(handler);
