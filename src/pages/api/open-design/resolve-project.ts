/**
 * GET /api/open-design/resolve-project?slug=<brand>&scope=<rel-folder>
 *
 * Ensures an Open Design project exists for a brand folder/scope, persists
 * the local mapping and returns the OD web URL. This is the UI path; the MCP
 * has a read-only resolver plus a separate confirmed import tool.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import {
  OdDaemonOfflineError,
  resolveOdConfig,
} from "@/lib/open-design/client";
import { ensureOpenDesignProject } from "@/lib/open-design/actions";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const slugParam = req.query.slug;
  const slug = Array.isArray(slugParam) ? slugParam[0] : slugParam;
  if (!slug) {
    res.status(400).json({ error: "slug required" });
    return;
  }

  const scopeParam = req.query.scope;
  const scope = (Array.isArray(scopeParam) ? scopeParam[0] : scopeParam) ?? "";
  const config = resolveOdConfig();

  try {
    const result = await ensureOpenDesignProject(slug, scope, { config });
    res.status(200).json({
      projectId: result.projectId,
      baseDir: result.baseDir,
      scope: result.scope,
      webUrl: result.webUrl,
      daemonUrl: result.daemonUrl,
    });
  } catch (err) {
    if (err instanceof OdDaemonOfflineError) {
      res.status(503).json({ error: "OD daemon offline", message: err.message });
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("outside") ? 403 : message.includes("not found") ? 404 : 400;
    res.status(status).json({ error: message });
  }
}
