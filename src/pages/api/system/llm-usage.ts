import type { NextApiRequest, NextApiResponse } from "next";
import path from "path";
import { withAuth, withErrorHandler, compose } from "@/lib/api-middleware";
import { readJSON } from "@/lib/data/json-io";
import { BASE } from "@/lib/data/paths";

interface LlmUsageFile {
  schema?: string;
  updated_at?: string;
  window?: {
    timezone?: string;
    days?: number;
    start?: string;
    end?: string;
  };
  sources?: Record<string, unknown>;
  totals?: Record<string, unknown>;
  days?: Record<string, unknown>;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!req.ctx?.isAdmin) return res.status(403).json({ error: "Admin only" });

  const usagePath = path.join(BASE, "memory", "costs", "llm-usage-daily.json");
  const data = readJSON<LlmUsageFile | null>(usagePath, null);
  const days = data?.days && typeof data.days === "object" ? data.days : {};
  const sortedDays = Object.keys(days).sort();
  const latestDay = sortedDays.length ? sortedDays[sortedDays.length - 1] : null;

  return res.status(200).json({
    available: !!data,
    path: "memory/costs/llm-usage-daily.json",
    latest_day: latestDay,
    ...(data || {}),
  });
}

export default compose(withErrorHandler, withAuth)(handler);
