/**
 * GET /api/system/cron-status?ids=a,b,c — cheap live status for polling.
 *
 * Reads the agent sessions store + jobs-state.json and returns whether each
 * id is currently running. Designed for the 5-second adaptive polling cycle:
 * lightweight (no brand attribution, no prompt payload, no recurring-tasks
 * disk scan) and cacheable for ~1s per process.
 *
 * Admin-only — same gate as cron-run. Brand users see live updates via the
 * fuller /api/recurring-tasks polling at 20s.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";
import { getLiveStatuses, type LiveStatus } from "@/lib/data/openclaw-crons";

let _cache: { ts: number; key: string; value: Record<string, LiveStatus> } | null = null;
const CACHE_MS = 1_000;

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  if (!req.ctx?.isAdmin) {
    return res.status(403).json({ error: "Admin only" });
  }

  const raw = (req.query.ids as string) || "";
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (ids.length === 0) {
    return res.status(200).json({ statuses: {} });
  }

  // Per-process 1s cache: many cards polling at the same cadence collapse to
  // a single sessions.json read.
  const key = ids.slice().sort().join(",");
  const now = Date.now();
  if (_cache && _cache.key === key && now - _cache.ts < CACHE_MS) {
    return res.status(200).json({ statuses: _cache.value });
  }

  const statuses = getLiveStatuses(ids);
  _cache = { ts: now, key, value: statuses };
  return res.status(200).json({ statuses });
}

export default compose(withErrorHandler, withAuth)(handler);
