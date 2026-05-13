/**
 * GET /api/content-engine/signals — Read research signals
 *
 * GET ?slug=X&date=YYYY-MM-DD → returns signals for a specific date
 * GET ?slug=X&days=7 → returns signals for the last N days
 * GET ?slug=X → returns today's signals
 */

import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { withErrorHandler } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const slug = req.query.slug as string;
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  const signalsDir = path.join(BASE, "brand", slug, "content", "research-signals");
  if (!fs.existsSync(signalsDir)) {
    return res.status(200).json({ ok: true, signals: [], dates: [] });
  }

  const days = parseInt(req.query.days as string) || 1;
  const targetDate = req.query.date as string || null;

  // Collect all signal files
  const files = fs.readdirSync(signalsDir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse();

  // Filter by date range
  const now = new Date();
  const cutoff = new Date(now.getTime() - days * 86_400_000);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const relevantFiles = targetDate
    ? files.filter((f) => f.startsWith(targetDate))
    : files.filter((f) => f.slice(0, 10) >= cutoffStr);

  const allSignals: unknown[] = [];
  const dates = new Set<string>();

  for (const f of relevantFiles.slice(0, 50)) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(signalsDir, f), "utf-8"));
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        allSignals.push({ ...item, _file: f });
      }
      dates.add(f.slice(0, 10));
    } catch { /* skip corrupt files */ }
  }

  return res.status(200).json({
    ok: true,
    signals: allSignals,
    dates: Array.from(dates).sort().reverse(),
    fileCount: relevantFiles.length,
  });
}

export default withErrorHandler(handler);
