import type { NextApiRequest, NextApiResponse } from "next";
import { execSync } from "child_process";
import { BASE } from "@/lib/data/paths";

/**
 * GET /api/system/health-check?service=all|<serviceId>
 * Ported from mc-server.js:8574
 * Runs health checks via the legacy runHealthChecks function
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const service = (req.query.service as string) || "all";

  try {
    // Delegate to the legacy health check script
    const result = execSync(
      `/opt/homebrew/bin/openclaw health-check ${service} --json 2>/dev/null || echo '{"error":"unavailable"}'`,
      { timeout: 30000, encoding: "utf-8", cwd: BASE }
    );
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).json(JSON.parse(result));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Health check failed";
    res.status(500).json({ error: message });
  }
}
