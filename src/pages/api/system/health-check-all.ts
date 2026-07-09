import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";
import { runHealthChecks } from "@/lib/health-check";

/**
 * GET /api/system/health-check-all?service=all|<serviceId>&slug=<client>
 * Runs health checks and persists results to api-health.json.
 * With `slug`, checks use that client's Local → Global credential precedence
 * and do not persist into the system-wide health cache.
 * Migrated from legacy mc-server.js proxy.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const service = (req.query.service as string) || "all";
  const slug = typeof req.query.slug === "string" ? req.query.slug : undefined;
  const result = await runHealthChecks(service, slug);

  if (result.error) {
    return res.status(400).json(result);
  }

  res.status(200).json(result);
}

export default compose(withErrorHandler, withAuth)(handler);
