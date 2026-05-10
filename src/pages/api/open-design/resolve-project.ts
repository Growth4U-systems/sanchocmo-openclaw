/**
 * GET /api/open-design/resolve-project?slug=<brand>
 *
 * Devuelve el project_id de Open Design correspondiente al brand y la URL del
 * web app para embeber en iframe. Si el brand no está registrado, lo registra
 * automáticamente vía POST /api/import/folder.
 *
 * Response: { projectId, webUrl, baseDir }
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { resolveOdConfig, odFindProjectByBaseDir, odImportFolder } from "@/lib/open-design/client";
import { brandDir } from "@/lib/data/paths";

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

  const config = resolveOdConfig();
  const baseDir = brandDir(slug);

  let project;
  try {
    project = await odFindProjectByBaseDir(baseDir, config);
    if (!project) {
      const result = await odImportFolder({ baseDir }, config);
      project = result.project;
    }
  } catch (err) {
    res.status(503).json({
      error: "OD daemon offline",
      message: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  res.status(200).json({
    projectId: project.id,
    baseDir: project.metadata?.baseDir ?? baseDir,
    webUrl: `${config.webUrl}/projects/${project.id}`,
    daemonUrl: config.daemonUrl,
  });
}
