/**
 * GET /api/brand-assets/[slug]
 *
 * Lista todos los archivos visuales del brand: templates, mockups, exports, style-references,
 * logos, DESIGN.md y design-tokens.json (legacy si todavía existe). Cada item incluye su path
 * absoluto, tipo, tamaño, fecha y meta.json adyacente si existe.
 *
 * Lo consume "Mis assets" en la sección Media Creation: el grid muestra todo lo que Maese Pedro
 * (u otros) ha generado para que Sancho lo pueda reutilizar desde otras secciones.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { promises as fs } from "fs";
import path from "path";
import { brandDir } from "@/lib/data/paths";

interface BrandAssetFile {
  name: string;
  relativePath: string;
  size: number;
}

interface BrandAsset {
  id: string;
  kind: "template" | "mockup" | "logo" | "style-reference" | "export" | "design-md" | "tokens" | "preview" | "misc";
  name: string;
  path: string;
  relativePath: string;
  size?: number;
  modifiedAt?: string;
  meta?: Record<string, unknown>;
  /** For directory assets (templates, multi-file mockups), the relative path of the
   *  preferred preview entry HTML, if found. Resolved server-side for performance. */
  entryFile?: string;
  /** For directory assets, list of files inside (relative to brand root). */
  files?: BrandAssetFile[];
}

const KIND_DIRS: Array<{ subPath: string; kind: BrandAsset["kind"] }> = [
  { subPath: "brand-book/visual-identity/templates", kind: "template" },
  { subPath: "brand-book/visual-identity/mockups", kind: "mockup" },
  { subPath: "brand-book/visual-identity/style-references", kind: "style-reference" },
  { subPath: "brand-book/visual-identity/exports", kind: "export" },
  { subPath: "visual-identity/templates", kind: "template" }, // legacy fallback
  { subPath: "visual-identity/mockups", kind: "mockup" },
];

const SINGLE_FILES: Array<{ relPath: string; kind: BrandAsset["kind"]; namePrefix?: string }> = [
  { relPath: "brand-book/visual-identity/DESIGN.md", kind: "design-md", namePrefix: "DESIGN" },
  { relPath: "brand-book/visual-identity/design-tokens.json", kind: "tokens", namePrefix: "design-tokens" },
  { relPath: "brand-book/visual-identity/design-preview.html", kind: "preview", namePrefix: "design-preview" },
  { relPath: "brand-book/visual-identity/visual-identity-guide.html", kind: "preview", namePrefix: "visual-guide" },
  { relPath: "brand-book/visual-identity/visual-identity.current.md", kind: "design-md", namePrefix: "visual-identity (legacy)" },
  { relPath: "brand-book/visual-identity/logo-light.png", kind: "logo", namePrefix: "logo-light" },
  { relPath: "brand-book/visual-identity/logo-light.webp", kind: "logo", namePrefix: "logo-light" },
  { relPath: "brand-book/visual-identity/logo-dark.png", kind: "logo", namePrefix: "logo-dark" },
  { relPath: "brand-book/visual-identity/logo-dark.webp", kind: "logo", namePrefix: "logo-dark" },
];

async function readMetaIfPresent(dir: string): Promise<Record<string, unknown> | undefined> {
  try {
    const raw = await fs.readFile(path.join(dir, "meta.json"), "utf8");
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

async function listDirAsAssets(
  rootBrandDir: string,
  subPath: string,
  kind: BrandAsset["kind"],
): Promise<BrandAsset[]> {
  const absDir = path.join(rootBrandDir, subPath);
  let entries: import("fs").Dirent[];
  try {
    entries = await fs.readdir(absDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const out: BrandAsset[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith("_") || entry.name.startsWith(".")) continue;

    const entryPath = path.join(absDir, entry.name);
    const relPath = path.relative(rootBrandDir, entryPath);

    if (entry.isDirectory()) {
      // Para templates/<id>/, mockups, etc: el directorio entero ES el asset.
      // Listamos los archivos directos y elegimos un entry HTML para preview.
      const meta = await readMetaIfPresent(entryPath);
      let stat;
      try {
        stat = await fs.stat(entryPath);
      } catch {
        stat = undefined;
      }

      const files: BrandAssetFile[] = [];
      let entryFile: string | undefined;
      const ENTRY_PRIORITY = ["template.html", "slide-cover.html", "index.html", "preview.html"];
      try {
        const inner = await fs.readdir(entryPath, { withFileTypes: true });
        for (const f of inner) {
          if (!f.isFile()) continue;
          if (f.name.startsWith(".")) continue;
          const childPath = path.join(entryPath, f.name);
          const childRel = path.relative(rootBrandDir, childPath);
          let cstat;
          try {
            cstat = await fs.stat(childPath);
          } catch {
            continue;
          }
          files.push({ name: f.name, relativePath: childRel, size: cstat.size });
        }
        // Encontrar entry HTML por prioridad
        for (const candidate of ENTRY_PRIORITY) {
          const found = files.find((f) => f.name === candidate);
          if (found) { entryFile = found.relativePath; break; }
        }
        // Si no, primer .html disponible
        if (!entryFile) {
          const firstHtml = files.find((f) => f.name.endsWith(".html"));
          if (firstHtml) entryFile = firstHtml.relativePath;
        }
      } catch {
        // ignora si no podemos leer subdir
      }

      out.push({
        id: entry.name,
        kind,
        name: entry.name,
        path: entryPath,
        relativePath: relPath,
        modifiedAt: stat ? stat.mtime.toISOString() : undefined,
        meta,
        entryFile,
        files: files.sort((a, b) => a.name.localeCompare(b.name)),
      });
    } else if (entry.isFile()) {
      // Para style-references/, exports/: archivos sueltos
      let stat;
      try {
        stat = await fs.stat(entryPath);
      } catch {
        continue;
      }
      out.push({
        id: entry.name.replace(/\.[^.]+$/, ""),
        kind,
        name: entry.name,
        path: entryPath,
        relativePath: relPath,
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      });
    }
  }
  return out;
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

  const root = brandDir(slug);

  // Lista todos los directorios canónicos
  const fromDirs = (
    await Promise.all(KIND_DIRS.map(({ subPath, kind }) => listDirAsAssets(root, subPath, kind)))
  ).flat();

  // Single files (DESIGN.md, logos, etc.)
  const fromFiles: BrandAsset[] = [];
  for (const { relPath, kind, namePrefix } of SINGLE_FILES) {
    const absPath = path.join(root, relPath);
    try {
      const stat = await fs.stat(absPath);
      fromFiles.push({
        id: namePrefix ?? relPath,
        kind,
        name: namePrefix ?? path.basename(relPath),
        path: absPath,
        relativePath: relPath,
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      });
    } catch {
      // archivo no existe — skip
    }
  }

  const all = [...fromDirs, ...fromFiles].sort((a, b) => {
    return (b.modifiedAt ?? "").localeCompare(a.modifiedAt ?? "");
  });

  res.status(200).json({ slug, count: all.length, assets: all });
}
