import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";
import { getRuntime } from "@/lib/runtime";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }
  if (!req.ctx?.isAdmin) return res.status(403).json({ error: "Admin only" });

  try {
    const agents = await getRuntime().control.listAgentsRich();
    return res.status(200).json({ ok: true, agents });
  } catch (e) {
    return res.status(500).json({
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

export default compose(withErrorHandler, withAuth)(handler);
