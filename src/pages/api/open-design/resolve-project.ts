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
 * Response: { projectId, baseDir, webUrl, daemonUrl, scope }
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import {
  resolveOdConfig,
  odFindProjectByBaseDir,
  odImportFolder,
  odListProjects,
  odPatchProject,
} from "@/lib/open-design/client";
import { brandDir } from "@/lib/data/paths";

const MAPPING_FILE = path.join(
  process.env.OPENCLAW_HOME ?? path.join(os.homedir(), ".openclaw"),
  "workspace-maese-pedro",
  "od-projects.json",
);

interface MappingShape {
  // mapping[slug][scope] = projectId. scope "" = brand root.
  [slug: string]: Record<string, string>;
}

async function readMapping(): Promise<MappingShape> {
  try {
    const raw = await fs.readFile(MAPPING_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writeMapping(mapping: MappingShape): Promise<void> {
  await fs.mkdir(path.dirname(MAPPING_FILE), { recursive: true });
  await fs.writeFile(MAPPING_FILE, JSON.stringify(mapping, null, 2) + "\n", "utf8");
}

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
  const root = brandDir(slug);
  const targetDir = scope ? path.join(root, scope) : root;

  // Verificar que el targetDir existe (path traversal guard)
  const absTarget = path.resolve(targetDir);
  if (!absTarget.startsWith(path.resolve(root))) {
    res.status(403).json({ error: "Forbidden — scope outside brand dir" });
    return;
  }
  try {
    const stat = await fs.stat(absTarget);
    if (!stat.isDirectory()) {
      res.status(400).json({ error: "scope must be a directory" });
      return;
    }
  } catch {
    res.status(404).json({ error: `scope not found: ${scope}` });
    return;
  }

  // Resolver projectId: mapping → daemon → import si falta.
  // En cualquier caso, asegurar que el proyecto tiene `designSystemId = <slug>`
  // para que el editor agentic use el DESIGN.md del cliente automáticamente.
  const mapping = await readMapping();
  let projectId: string | undefined = mapping[slug]?.[scope];
  let projectRecord: { id: string; designSystemId: string | null } | undefined;

  // Listar projects (validar mapping + capturar designSystemId actual)
  try {
    const projects = await odListProjects(config);
    if (projectId) {
      const found = projects.find((p) => p.id === projectId);
      if (!found) {
        projectId = undefined; // huérfano — re-import
      } else {
        projectRecord = { id: found.id, designSystemId: found.designSystemId ?? null };
      }
    }
    // Si no hay mapping, buscar por baseDir
    if (!projectId) {
      const existing = projects.find((p) => p.metadata?.baseDir === absTarget);
      if (existing) {
        projectId = existing.id;
        projectRecord = { id: existing.id, designSystemId: existing.designSystemId ?? null };
      }
    }
  } catch (err) {
    res.status(503).json({
      error: "OD daemon offline",
      message: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  // Si sigue sin existir, importar
  if (!projectId) {
    try {
      const result = await odImportFolder({ baseDir: absTarget }, config);
      projectId = result.project.id;
      projectRecord = { id: result.project.id, designSystemId: result.project.designSystemId ?? null };
    } catch (err) {
      res.status(503).json({
        error: "OD daemon offline",
        message: err instanceof Error ? err.message : String(err),
      });
      return;
    }
  }

  // Persistir mapping (si el projectId ahora existe pero no estaba mapeado)
  if (mapping[slug]?.[scope] !== projectId) {
    if (!mapping[slug]) mapping[slug] = {};
    mapping[slug][scope] = projectId;
    await writeMapping(mapping);
  }

  // Asegurar designSystemId = slug para que OD use el DESIGN.md del brand.
  // Solo si el design system "<slug>" existe en el catálogo de OD
  // (i.e. en /Users/ragi/open-design/design-systems/<slug>/DESIGN.md).
  // Si no existe, el patch dará error y lo ignoramos silenciosamente.
  if (projectRecord && projectRecord.designSystemId !== slug) {
    try {
      await odPatchProject(projectId, { designSystemId: slug }, config);
    } catch (err) {
      // No fallamos: el editor sigue abriendo, solo sin design system.
      console.warn(`[resolve-project] could not set designSystemId="${slug}":`, err);
    }
  }

  res.status(200).json({
    projectId,
    baseDir: absTarget,
    scope,
    webUrl: `${config.webUrl}/projects/${projectId}`,
    daemonUrl: config.daemonUrl,
  });
}
