import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";
import { listAgents, getAgentEffectiveModel } from "@/lib/data/openclaw-config";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }
  if (!req.ctx?.isAdmin) return res.status(403).json({ error: "Admin only" });

  try {
    const agents = listAgents();
    const out = agents.map((a) => ({
      id: a.id,
      name: (a.name as string) || a.id,
      workspace: (a.workspace as string) || null,
      model: getAgentEffectiveModel(a.id),
    }));
    return res.status(200).json({ ok: true, agents: out });
  } catch (e) {
    return res.status(500).json({
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

export default compose(withErrorHandler, withAuth)(handler);
