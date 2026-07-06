import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";
import { getRuntime } from "@/lib/runtime";


async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  if (!req.ctx?.isAdmin) {
    return res.status(403).json({ error: "Admin only" });
  }

  const runtime = getRuntime();
  if (!runtime.capabilities.cron) {
    return res.status(501).json({
      error: `Runtime "${runtime.id}" does not support cron toggles through Sancho yet.`,
      runtime: runtime.id,
      capability: "cron",
    });
  }

  const { cronId, enable } = req.body;
  if (!cronId) {
    return res.status(400).json({ error: "Missing cronId" });
  }

  try {
    await runtime.control.runCommand(["cron", enable ? "enable" : "disable", cronId], { timeoutMs: 10000 });
    return res.status(200).json({ ok: true, cronId, enabled: enable });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
}

export default compose(withErrorHandler, withAuth)(handler);
