import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { withAuth, withErrorHandler, compose } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";

/**
 * GET /api/activity?slug=hospital-capilar&limit=15
 * Returns recent activity events for the activity bar.
 * Combines mc-data.js activity + cron run data.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const slug = (req.query.slug as string) || null;
  const limit = Math.min(parseInt(req.query.limit as string || "15", 10), 50);

  interface Event {
    id: string;
    message: string;
    timestamp: string;
    time: string;
    level: "ok" | "error" | "warning";
    isCron: boolean;
  }

  const events: Event[] = [];

  // Read activity from mc-data.js
  try {
    const mcDataPath = path.join(BASE, "mc-data.js");
    const raw = fs.readFileSync(mcDataPath, "utf-8");
    const jsonStart = raw.indexOf("{");
    const jsonEnd = raw.lastIndexOf("}");
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      const data = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
      const activity: { date: string; time?: string; text: string; raw?: string; client?: string }[] = data.activity || [];
      for (const e of activity) {
        if (slug && e.client !== slug) continue;
        const isCron = !!(e.raw && e.raw.startsWith("Cron run:"));
        const ts = e.date ? new Date(`${e.date}T${e.time || "00:00"}`).toISOString() : "";
        events.push({
          id: `act-${e.date}-${events.length}`,
          message: e.text || e.raw || "",
          timestamp: ts,
          time: e.time || "",
          level: (e.raw?.includes("falló") || e.raw?.includes("error")) ? "error" : "ok",
          isCron,
        });
      }
    }
  } catch { /* skip */ }

  // Sort descending and limit
  events.sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));
  const limited = events.slice(0, limit);

  res.status(200).json({ events: limited });
}

export default compose(withErrorHandler, withAuth)(handler);
