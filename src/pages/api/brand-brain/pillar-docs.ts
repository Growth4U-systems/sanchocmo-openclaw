import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { assembleBrandBrainState, brandExists } from "@/lib/data/brand-brain-assembler";
import { withErrorHandler, withAuth, compose } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";

/**
 * GET /api/brand-brain/pillar-docs?slug=X&section=Y&pillar=Z
 * Returns sub-content for a pillar, split into:
 *   - subfolders: deep-dive directories with their own files
 *   - versions: historical vN.md files
 *
 * Listing hygiene (SAN-149):
 *   - `.commented.*` siblings (feedback transcripts, SAN-15/148) are hidden.
 *   - md/html canonical pairs collapse into ONE md entry with `hasHtml` —
 *     the viewer resolves it to the canonical HTML.
 *   - bare `current.<ext>` is hidden when a named `{x}.current.<ext>` exists
 *     (legacy alias of the same doc, SAN-103).
 */

const VERSION_RE = /^v\d+\.md$/;
const IGNORED_DIRS = new Set(["_archive", "_qa", "_system"]);
const COMMENTED_RE = /\.commented\.(md|html)$/i;

interface DocEntry { name: string; fullPath: string; kind?: "md" | "html"; hasHtml?: boolean }
interface SubfolderEntry { name: string; mainDoc: string; files: DocEntry[]; versions: DocEntry[] }

function listDocFiles(dir: string): string[] {
  return fs.readdirSync(dir).filter((f) => {
    const stat = fs.statSync(path.join(dir, f));
    return stat.isFile() && (f.endsWith(".md") || f.endsWith(".html")) && !COMMENTED_RE.test(f);
  });
}

/** Prefer the `.current.md` source as a folder's main doc, then any `.current.*`. */
function pickMainFile(files: string[]): string {
  return (
    files.find((f) => f.includes(".current.") && f.endsWith(".md")) ||
    files.find((f) => f.includes(".current.")) ||
    ""
  );
}

/**
 * Files that should not appear as separate rows next to `mainFile`:
 * the main doc itself, its html-canonical sibling, and the legacy bare
 * `current.<ext>` alias when a named canonical doc exists.
 */
function isShadowOfMain(fileName: string, mainFile: string, siblings: Set<string>): boolean {
  if (fileName === mainFile) return true;
  if (mainFile.endsWith(".md") && fileName === mainFile.replace(/\.md$/, ".html")) return true;
  if (/^current\.(md|html)$/i.test(fileName) && [...siblings].some((s) => /\.current\.(md|html)$/i.test(s))) {
    return true;
  }
  return false;
}

/** Build a DocEntry, collapsing md/html canonical pairs into the md row. */
function buildEntry(fileName: string, siblings: Set<string>, fullPath: string): DocEntry | null {
  const isHtml = fileName.endsWith(".html");
  if (isHtml && siblings.has(fileName.replace(/\.html$/, ".md"))) return null;
  const entry: DocEntry = {
    name: fileName.replace(/\.(md|html)$/, "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    fullPath,
    kind: isHtml ? "html" : "md",
  };
  if (!isHtml && siblings.has(fileName.replace(/\.md$/, ".html"))) entry.hasHtml = true;
  return entry;
}

function scanDir(dir: string, baseResolve: string): { subfolders: SubfolderEntry[]; versions: DocEntry[]; otherFiles: DocEntry[] } {
  const subfolders: SubfolderEntry[] = [];
  const versions: DocEntry[] = [];
  const otherFiles: DocEntry[] = [];

  if (!fs.existsSync(dir)) return { subfolders, versions, otherFiles };

  const allFiles = listDocFiles(dir);
  const allSet = new Set(allFiles);
  const mainFile = pickMainFile(allFiles);

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".") || IGNORED_DIRS.has(entry.name)) continue;

    if (entry.isDirectory()) {
      const subDir = path.join(dir, entry.name);
      const subFiles = listDocFiles(subDir);

      // Special case: directories that ONLY contain other directories (like
      // `templates/` which holds `blog-post/`, `linkedin-quote/`, …) are
      // expanded one extra level so each nested template surfaces as its
      // own subfolder row.
      if (subFiles.length === 0) {
        const nestedDirs = fs.readdirSync(subDir, { withFileTypes: true })
          .filter((e) => e.isDirectory() && !e.name.startsWith(".") && !IGNORED_DIRS.has(e.name));
        for (const nested of nestedDirs) {
          const nestedDir = path.join(subDir, nested.name);
          const nestedFiles = listDocFiles(nestedDir);
          if (nestedFiles.length === 0) continue;
          const nestedSet = new Set(nestedFiles);

          const nestedMain =
            nestedFiles.find((f) => f === "template.html") ||
            nestedFiles.find((f) => f === "slide-cover.html") ||
            pickMainFile(nestedFiles) ||
            nestedFiles[0];

          const nestedVersions: DocEntry[] = [];
          const nestedOther: DocEntry[] = [];
          for (const nf of nestedFiles) {
            if (isShadowOfMain(nf, nestedMain, nestedSet)) continue;
            const rel = path.relative(baseResolve, path.join(nestedDir, nf));
            if (VERSION_RE.test(nf)) {
              nestedVersions.push({ name: nf.replace(/\.md$/, ""), fullPath: rel });
            } else {
              const doc = buildEntry(nf, nestedSet, rel);
              if (doc) nestedOther.push(doc);
            }
          }

          const prettyChild = nested.name.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
          subfolders.push({
            name: `${entry.name} / ${prettyChild}`,
            mainDoc: path.relative(baseResolve, path.join(nestedDir, nestedMain)),
            files: nestedOther,
            versions: nestedVersions,
          });
        }
        continue;
      }

      const subSet = new Set(subFiles);
      const subCurrent = pickMainFile(subFiles) || subFiles[0];
      const subVersions: DocEntry[] = [];
      const subOther: DocEntry[] = [];

      for (const sf of subFiles) {
        if (isShadowOfMain(sf, subCurrent, subSet)) continue;
        const relPath = path.relative(baseResolve, path.join(subDir, sf));
        if (VERSION_RE.test(sf)) {
          subVersions.push({ name: sf.replace(/\.md$/, ""), fullPath: relPath });
        } else {
          const doc = buildEntry(sf, subSet, relPath);
          if (doc) subOther.push(doc);
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
    } else if (entry.isFile() && allSet.has(entry.name)) {
      if (isShadowOfMain(entry.name, mainFile, allSet)) continue;
      const relPath = path.relative(baseResolve, path.join(dir, entry.name));
      if (VERSION_RE.test(entry.name)) {
        versions.push({ name: entry.name.replace(/\.md$/, ""), fullPath: relPath });
      } else {
        const doc = buildEntry(entry.name, allSet, relPath);
        if (doc) otherFiles.push(doc);
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

  if (!brandExists(slug)) return res.status(404).json({ error: "Not found" });

  const state = assembleBrandBrainState(slug);
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
