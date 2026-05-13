import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { withAuth, withErrorHandler, compose } from "@/lib/api-middleware";
import { mcDataFile, BASE } from "@/lib/data/paths";

/**
 * GET /api/activity?slug=hospital-capilar&limit=15
 * Returns recent activity events for the activity bar.
 * Combines mc-data.js (system events) + live cron runs read directly from
 * brand/<slug>/recurring-tasks/ — so cron runs reflect current state without
 * waiting for regenerate.py to rebuild mc-data.js.
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
  const cronKeys = new Set<string>(); // dedupe key: slug:folder:date

  // 1) Live cron runs from brand/<slug>/recurring-tasks/<folder>/{YYYY-MM-DD}.json
  // Scan all brands if no slug is given (activity-bar can be global).
  const brandRoot = path.join(BASE, "brand");
  if (fs.existsSync(brandRoot)) {
    const cutoff = Date.now() - 14 * 86400000; // 14 days
    const brandDirs = slug
      ? [path.join(brandRoot, slug)]
      : fs.readdirSync(brandRoot).map((b) => path.join(brandRoot, b));
    for (const brandDir of brandDirs) {
      if (!fs.existsSync(brandDir) || !fs.statSync(brandDir).isDirectory()) continue;
      const brandSlug = path.basename(brandDir);
      const rtDir = path.join(brandDir, "recurring-tasks");
      if (!fs.existsSync(rtDir)) continue;
      for (const folder of fs.readdirSync(rtDir)) {
        const fdir = path.join(rtDir, folder);
        if (!fs.statSync(fdir).isDirectory()) continue;
        const files = fs.readdirSync(fdir).filter((f) => f.endsWith(".json")).sort().reverse().slice(0, 7);
        for (const file of files) {
          try {
            const data = JSON.parse(fs.readFileSync(path.join(fdir, file), "utf-8"));
            const runAtMs = data.runAtMs || (data.date ? new Date(data.date).getTime() : null);
            if (!runAtMs || runAtMs < cutoff) continue;
            const date = (data.date as string) || file.replace(".json", "");
            const status = data.status || "ok";
            const summary: string =
              (typeof data.last_finding === "string" && data.last_finding.trim()) ||
              (typeof data.summary === "string" && data.summary.trim().slice(0, 200)) ||
              (typeof data.content === "string" && data.content.replace(/\n/g, " ").slice(0, 200).trim()) ||
              `Cron ${folder} (${status})`;
            const message = `⏰ ${folder}: ${summary}`;
            cronKeys.add(`${brandSlug}:${folder}:${date}`);
            events.push({
              id: `cron-${brandSlug}-${folder}-${date}`,
              message,
              timestamp: new Date(runAtMs).toISOString(),
              time: new Date(runAtMs).toTimeString().slice(0, 5),
              level: status === "error" ? "error" : "ok",
              isCron: true,
            });
          } catch { /* skip malformed */ }
        }
      }
    }
  }

  // 2) System events + any cron events not present in (1) from mc-data.js (fallback).
  try {
    const mcDataPath = mcDataFile();
    const raw = fs.readFileSync(mcDataPath, "utf-8");
    const jsonStart = raw.indexOf("{");
    const jsonEnd = raw.lastIndexOf("}");
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      const data = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
      const activity: { date: string; time?: string; text: string; raw?: string; client?: string }[] = data.activity || [];
      for (const e of activity) {
        if (slug && e.client && e.client !== slug && e.client !== "system" && e.client !== "unknown") continue;
        const isCron = !!(e.raw && e.raw.startsWith("Cron run:"));
        if (isCron) {
          // Skip mc-data.js cron events when we already have live data for this slug+folder+date.
          const folder = e.raw!.replace(/^Cron run:\s*/, "").trim();
          const key = `${e.client || ""}:${folder}:${e.date}`;
          if (cronKeys.has(key)) continue;
        }
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

  events.sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));
  const limited = events.slice(0, limit);

  res.status(200).json({ events: limited });
}

export default compose(withErrorHandler, withAuth)(handler);
