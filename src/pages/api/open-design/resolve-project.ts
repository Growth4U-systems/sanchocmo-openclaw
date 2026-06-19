/**
 * GET /api/open-design/resolve-project?slug=<brand>&scope=<rel-folder>
 *
 * Devuelve el project_id de Open Design para una subcarpeta del brand. Si no
 * existe (lazy-create), registra el folder como proyecto OD vía
 * POST /api/import/folder y persiste el mapping en
 * `~/.openclaw/workspace-maese-pedro/od-projects.json`.
 *
 * Sin `scope` (o vacío) → comportamiento legacy: el brand entero como proyecto.
 *
 * La lógica de resolución (mapping → daemon → import → designSystemId patch)
 * vive en `odResolveProject` (src/lib/open-design/client.ts) para que callers
 * server-side (p.ej. el render de carrusel vía OD) la reusen sin self-call HTTP.
 *
 * Response: { projectId, baseDir, webUrl, webBase, daemonUrl, scope }
 */

import type { NextApiRequest, NextApiResponse } from "next";
import {
  resolveOdConfig,
  odResolveProject,
  OdDaemonOfflineError,
} from "@/lib/open-design/client";

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

  let resolved;
  try {
    resolved = await odResolveProject(slug, scope, config);
  } catch (err) {
    if (err instanceof OdDaemonOfflineError) {
      res.status(503).json({ error: "OD daemon offline", message: err.message });
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    // Map the guard errors thrown by odResolveProject to the same HTTP codes
    // the route used before the extraction.
    if (message.startsWith("Forbidden")) {
      res.status(403).json({ error: message });
      return;
    }
    if (message.startsWith("scope not found")) {
      res.status(404).json({ error: message });
      return;
    }
    if (message.startsWith("scope must be a directory")) {
      res.status(400).json({ error: message });
      return;
    }
    res.status(503).json({ error: "OD daemon offline", message });
    return;
  }

  const { projectId, baseDir } = resolved;

  res.status(200).json({
    projectId,
    baseDir,
    scope,
    // `webUrl`: raíz del proyecto en la web app agéntica de OD.
    // `webBase`: origen público de OD (sin path), para construir links a la
    //   API del daemon (`<webBase>/api/projects/<id>/files/<path>`), que es la
    //   única ruta que sirve el contenido de un archivo. La forma web
    //   `/projects/<id>/files/<path>` NO existe en el daemon → 404.
    webUrl: `${config.webUrl}/projects/${projectId}`,
    webBase: config.webUrl,
    daemonUrl: config.daemonUrl,
  });
}
