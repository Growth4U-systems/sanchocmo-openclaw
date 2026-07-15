import type { NextApiRequest, NextApiResponse } from "next";
import {
  compose,
  withErrorHandler,
  withAuth,
} from "@/lib/api-middleware";
import {
  isHealthServiceFilter,
  runHealthChecks,
  type HealthServiceFilter,
} from "@/lib/health-check";

/**
 * GET /api/system/health-check-all?service=all|<serviceId>&slug=<client>
 * Runs health checks and persists results to api-health.json.
 * With `slug`, checks use that client's Local → Global credential precedence
 * and do not persist into the system-wide health cache.
 * Migrated from legacy mc-server.js proxy.
 */
export async function healthCheckHandler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  // These probes can consume provider quota, access account metadata and run
  // local diagnostic binaries. Tenant membership is not sufficient authority.
  if (!req.ctx?.isAdmin) {
    return res.status(403).json({ error: "Admin access required" });
  }

  if (Array.isArray(req.query.service) || Array.isArray(req.query.slug)) {
    return res.status(400).json({ error: "Invalid health check query" });
  }

  const rawService = typeof req.query.service === "string"
    ? req.query.service.trim()
    : "all";
  if (!isHealthServiceFilter(rawService)) {
    return res.status(400).json({ error: `Unknown service: ${rawService}` });
  }
  const service: HealthServiceFilter = rawService;

  const requestedSlug = typeof req.query.slug === "string"
    ? req.query.slug.trim()
    : "";
  if (requestedSlug && !/^[a-z0-9][a-z0-9-]*$/i.test(requestedSlug)) {
    return res.status(400).json({ error: "Invalid slug" });
  }

  const slug = requestedSlug || undefined;

  const result = await runHealthChecks(service, slug);

  if (result.error) {
    return res.status(400).json(result);
  }

  res.status(200).json(result);
}

export default compose(withErrorHandler, withAuth)(healthCheckHandler);
