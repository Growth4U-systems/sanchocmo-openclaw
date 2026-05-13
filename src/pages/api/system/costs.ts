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

function currentPeriod(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * GET /api/system/costs
 *
 * Aggregates the current-period cost data on demand from every
 * `brand/<slug>/costs.json` file. The legacy `memory/costs/global.json`
 * used to be the source of truth, but its Python writer stopped
 * maintaining it while the per-client files kept being populated — so
 * the dashboard ended up rendering zeros even when real costs existed.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const period = currentPeriod();
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
  });
}

export default compose(withErrorHandler, withAuth)(handler);
