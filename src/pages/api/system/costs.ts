import type { NextApiRequest, NextApiResponse } from "next";
import path from "path";
import { withAuth, withErrorHandler, compose } from "@/lib/api-middleware";
import { readJSON, listDir } from "@/lib/data/json-io";
import { BASE } from "@/lib/data/paths";

interface ClientCostsFile {
  period?: string;
  updatedAt?: string;
  total_cost_usd?: number;
  total_cost_eur?: number;
  turns?: number;
  sessions?: number;
  agents?: Record<string, {
    cost_usd?: number;
    cost_eur?: number;
    turns?: number;
    sessions?: number;
  }>;
}

interface GlobalCostsFile {
  period?: string;
  updatedAt?: string;
  total_cost_usd?: number;
  total_cost_eur?: number;
  total_sessions?: number;
  total_turns?: number;
  system?: {
    cost_usd?: number;
    cost_eur?: number;
    turns?: number;
    sessions?: number;
    agents?: Record<string, {
      cost_usd?: number;
      cost_eur?: number;
      turns?: number;
      sessions?: number;
    }>;
  };
  clients?: Record<string, {
    cost_usd?: number;
    cost_eur?: number;
    turns?: number;
    sessions?: number;
    agents?: Record<string, {
      cost_usd?: number;
      cost_eur?: number;
      turns?: number;
      sessions?: number;
    }>;
  }>;
}

function currentPeriod(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * GET /api/system/costs
 *
 * Returns current-period totals + per-client breakdown.
 *
 * Source preference:
 *  1. `workspace-sancho/memory/costs/global.json` — written by
 *     `scripts/cost-tracker.py`. It's the canonical totals (system + all
 *     attributed clients + unclassified). When the writer is running this
 *     is up-to-date.
 *  2. Fallback: aggregate per-client `brand/<slug>/costs.json` files.
 *     Less accurate (misses unclassified system cost) but works if global.json
 *     is missing or stale.
 *
 * The endpoint always returns the same response shape so the dashboard
 * doesn't need to care which source produced it.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  // Global cross-client totals — admin only.
  if (!req.ctx?.isAdmin) return res.status(403).json({ error: "Admin only" });

  const period = currentPeriod();
  const globalPath = path.join(BASE, "memory", "costs", "global.json");
  const global = readJSON<GlobalCostsFile | null>(globalPath, null);

  if (global && global.period === period) {
    const clientsObj: Record<string, { cost_usd: number; turns: number; sessions: number }> = {};
    for (const [slug, info] of Object.entries(global.clients || {})) {
      clientsObj[slug] = {
        cost_usd: info.cost_usd ?? 0,
        turns: info.turns ?? 0,
        sessions: info.sessions ?? 0,
      };
    }
    return res.status(200).json({
      period: global.period,
      updatedAt: global.updatedAt ?? null,
      total_cost_usd: global.total_cost_usd ?? 0,
      total_cost_eur: global.total_cost_eur ?? 0,
      total_turns: global.total_turns ?? 0,
      total_sessions: global.total_sessions ?? 0,
      system: { agents: global.system?.agents || {} },
      clients: clientsObj,
      source: "global",
    });
  }

  const brandRoot = path.join(BASE, "brand");
  const totals = { cost_usd: 0, cost_eur: 0, turns: 0, sessions: 0 };
  const clients: Record<string, { cost_usd: number; turns: number; sessions: number }> = {};
  const agents: Record<string, { cost_usd: number; turns: number; sessions: number }> = {};
  let latestUpdatedAt: string | undefined;

  for (const slug of listDir(brandRoot)) {
    const data = readJSON<ClientCostsFile | null>(
      path.join(brandRoot, slug, "costs.json"),
      null,
    );
    if (!data || data.period !== period) continue;

    const usd = data.total_cost_usd ?? 0;
    const eur = data.total_cost_eur ?? 0;
    const turns = data.turns ?? 0;
    const sessions = data.sessions ?? 0;

    totals.cost_usd += usd;
    totals.cost_eur += eur;
    totals.turns += turns;
    totals.sessions += sessions;
    clients[slug] = { cost_usd: usd, turns, sessions };

    if (data.updatedAt && (!latestUpdatedAt || data.updatedAt > latestUpdatedAt)) {
      latestUpdatedAt = data.updatedAt;
    }

    for (const [agent, info] of Object.entries(data.agents || {})) {
      const prev = agents[agent] || { cost_usd: 0, turns: 0, sessions: 0 };
      agents[agent] = {
        cost_usd: prev.cost_usd + (info.cost_usd ?? 0),
        turns: prev.turns + (info.turns ?? 0),
        sessions: prev.sessions + (info.sessions ?? 0),
      };
    }
  }

  res.status(200).json({
    period,
    updatedAt: latestUpdatedAt ?? null,
    total_cost_usd: totals.cost_usd,
    total_cost_eur: totals.cost_eur,
    total_turns: totals.turns,
    total_sessions: totals.sessions,
    system: { agents },
    clients,
    source: "per-client",
  });
}

export default compose(withErrorHandler, withAuth)(handler);
