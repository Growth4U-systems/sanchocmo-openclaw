/**
 * GET /api/open-design/file?path=<absolute-path>
 *
 * Lee un archivo del repo upstream de Open Design (`/Users/ragi/open-design/`).
 * Devuelve `{ content, lastModified, size, path }`. Limita el acceso al repo
 * para evitar path traversal — solo archivos dentro de `OD_REPO_PATH`.
 *
 * Usado por el slide-over de la Open Design Library para mostrar SKILL.md,
 * DESIGN.md, prompt-templates README, craft guides .md, etc.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { promises as fs } from "fs";
import path from "path";
import { resolveOdConfig } from "@/lib/open-design/client";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const pathParam = req.query.path;
  const pathStr = Array.isArray(pathParam) ? pathParam[0] : pathParam;
  if (!pathStr) {
    res.status(400).json({ error: "path required" });
    return;
  }

  const { repoPath } = resolveOdConfig();
  const repoAbs = path.resolve(repoPath);
  const fullPath = path.resolve(pathStr);
  if (!fullPath.startsWith(repoAbs)) {
    res.status(403).json({ error: "Forbidden — path outside OD repo" });
    return;
  }

  let stat;
  try {
    stat = await fs.stat(fullPath);
  } catch {
    res.status(404).json({ error: "Not found" });
    return;
  }

  // Si es directorio, intentar resolver un README/SKILL.md/DESIGN.md/index.md
  let resolved = fullPath;
  if (stat.isDirectory()) {
    const candidates = ["SKILL.md", "DESIGN.md", "README.md", "index.md"];
    let found: string | null = null;
    for (const c of candidates) {
      const test = path.join(fullPath, c);
      try {
        const s = await fs.stat(test);
        if (s.isFile()) {
          found = test;
          stat = s;
          break;
        }
      } catch {
        /* try next */
      }
    }
    if (!found) {
      // Listar directorio
      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      res.status(200).json({
        path: fullPath,
        isDirectory: true,
        entries: entries.map((e) => ({ name: e.name, isFile: e.isFile(), isDirectory: e.isDirectory() })),
      });
      return;
    }
    resolved = found;
  }

  const content = await fs.readFile(resolved, "utf8");
  res.status(200).json({
    path: resolved,
    isDirectory: false,
    content,
    size: stat.size,
    lastModified: stat.mtime.toISOString(),
  });
}
