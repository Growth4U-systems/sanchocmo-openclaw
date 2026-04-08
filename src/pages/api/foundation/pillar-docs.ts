import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { withErrorHandler, withAuth, compose } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";

/**
 * GET /api/foundation/pillar-docs?slug=X&section=Y&pillar=Z
 * Returns sub-content for a pillar, split into:
 *   - subfolders: deep-dive directories with their own files
 *   - versions: historical vN.md files
 *
 * Also supports: ?dir=relative/path to scan a specific subfolder
 */

const VERSION_RE = /^v\d+\.md$/;
const IGNORED_DIRS = new Set(["_archive", "_qa", "_system"]);

interface DocEntry { name: string; fullPath: string }
interface SubfolderEntry { name: string; mainDoc: string; files: DocEntry[]; versions: DocEntry[] }

function scanDir(dir: string, baseResolve: string): { subfolders: SubfolderEntry[]; versions: DocEntry[]; otherFiles: DocEntry[] } {
  const subfolders: SubfolderEntry[] = [];
  const versions: DocEntry[] = [];
  const otherFiles: DocEntry[] = [];

  if (!fs.existsSync(dir)) return { subfolders, versions, otherFiles };

  // Find the "main" file — the .current.md
  const allFiles = fs.readdirSync(dir).filter((f) => {
    const stat = fs.statSync(path.join(dir, f));
    return stat.isFile() && (f.endsWith(".md") || f.endsWith(".html"));
  });
  const mainFile = allFiles.find((f) => f.includes(".current.")) || "";

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".") || IGNORED_DIRS.has(entry.name)) continue;

    if (entry.isDirectory()) {
      const subDir = path.join(dir, entry.name);
      const subFiles = fs.readdirSync(subDir).filter((f) => {
        const s = fs.statSync(path.join(subDir, f));
        return s.isFile() && (f.endsWith(".md") || f.endsWith(".html"));
      });
      if (subFiles.length === 0) continue;

      const subCurrent = subFiles.find((f) => f.includes(".current.")) || subFiles[0];
      const subVersions: DocEntry[] = [];
      const subOther: DocEntry[] = [];

      for (const sf of subFiles) {
        if (sf === subCurrent) continue;
        const relPath = path.relative(baseResolve, path.join(subDir, sf));
        if (VERSION_RE.test(sf)) {
          subVersions.push({ name: sf.replace(/\.md$/, ""), fullPath: relPath });
        } else {
          subOther.push({
            name: sf.replace(/\.(md|html)$/, "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
            fullPath: relPath,
          });
        }
      }

      subVersions.sort((a, b) => {
        const na = parseInt(a.name.replace("v", ""), 10);
        const nb = parseInt(b.name.replace("v", ""), 10);
        return na - nb;
      });

      subfolders.push({
        name: entry.name.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        mainDoc: path.relative(baseResolve, path.join(subDir, subCurrent)),
        files: subOther,
        versions: subVersions,
      });
    } else if (entry.isFile() && entry.name !== mainFile) {
      const relPath = path.relative(baseResolve, path.join(dir, entry.name));
      if (VERSION_RE.test(entry.name)) {
        versions.push({ name: entry.name.replace(/\.md$/, ""), fullPath: relPath });
      } else if (entry.name.endsWith(".md") || entry.name.endsWith(".html")) {
        // Skip json and non-doc files
        otherFiles.push({
          name: entry.name.replace(/\.(md|html)$/, "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
          fullPath: relPath,
        });
      }
    }
  }

  versions.sort((a, b) => {
    const na = parseInt(a.name.replace("v", ""), 10);
    const nb = parseInt(b.name.replace("v", ""), 10);
    return na - nb;
  });

  return { subfolders, versions, otherFiles };
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const slug = req.query.slug as string;
  const section = req.query.section as string;
  const pillar = req.query.pillar as string;
  if (!slug || !section || !pillar) return res.status(400).json({ error: "Missing params" });

  const stateFile = path.join(BASE, "brand", slug, "foundation-state.json");
  if (!fs.existsSync(stateFile)) return res.status(404).json({ error: "Not found" });

  const state = JSON.parse(fs.readFileSync(stateFile, "utf-8"));
  const pillarInfo = state.sections?.[section]?.pillars?.[pillar];
  if (!pillarInfo?.output_file) return res.json({ ok: true, subfolders: [], versions: [], otherFiles: [] });

  const outputFullPath = path.resolve(path.join(BASE, pillarInfo.output_file));
  const pillarDir = path.dirname(outputFullPath);
  const baseResolve = path.resolve(BASE);

  if (!pillarDir.startsWith(baseResolve) || !fs.existsSync(pillarDir)) {
    return res.json({ ok: true, subfolders: [], versions: [], otherFiles: [] });
  }

  const result = scanDir(pillarDir, baseResolve);
  res.json({ ok: true, ...result });
}

export default compose(withErrorHandler, withAuth)(handler);
