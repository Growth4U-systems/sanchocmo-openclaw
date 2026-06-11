import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { withErrorHandler, withAuth, compose } from "@/lib/api-middleware";
import { brandDir } from "@/lib/data/paths";

/**
 * GET /api/brand-brain/other-docs?slug=X
 * Returns non-pillar documents grouped by folder. Pillars are returned via
 * /api/brand-brain/state; this endpoint surfaces auxiliary docs (presentations,
 * playbooks, campaigns, etc.) so the unified Brand Brain tree can render them.
 */

const FOUNDATION_FOLDERS = new Set([
  "company-brief", "market-and-us", "go-to-market",
  "brand-book", "metrics-setup", "strategic-plan",
  "fast-foundation",
]);

const IGNORED_FOLDERS = new Set([
  "projects", "chat", "atalaya", "idea-generation",
  "recurring-tasks", "monitoring", "metrics", "daily-pulse",
  "trust-engine", "leads", "_archive", "_system",
]);

const IGNORED_FILES = new Set([
  "foundation-state.json", "ideas.json", "costs.json",
  "integrations.json", "sources.json", "mc-data.js",
]);

interface DocEntry {
  name: string;
  path: string;
  fullPath: string;
  /** HTML-canonical sibling exists for this .md (SAN-149) */
  hasHtml?: boolean;
}

/**
 * HTML-canonical pairs (SAN-149): when a folder holds both `foo.md` and
 * `foo.html`, emit a single entry for the `.md` (the source — the viewer
 * resolves it to the canonical HTML) flagged with `hasHtml`.
 */
function buildDocEntry(
  fileName: string,
  siblings: Set<string>,
  brandSlug: string,
  relPath: string,
): DocEntry | null {
  const ext = path.extname(fileName);
  if (![".md", ".html"].includes(ext)) return null;
  if (ext === ".html" && siblings.has(fileName.replace(/\.html$/, ".md"))) return null;

  const entry: DocEntry = {
    name: fileName.replace(/\.(md|html)$/, "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    path: path.join(relPath, fileName),
    fullPath: `brand/${brandSlug}/${path.join(relPath, fileName)}`,
  };
  if (ext === ".md" && siblings.has(fileName.replace(/\.md$/, ".html"))) {
    entry.hasHtml = true;
  }
  return entry;
}

interface DocGroup {
  folder: string;
  label: string;
  docs: DocEntry[];
}

function labelFromFolder(folder: string): string {
  return folder
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function scanDir(dir: string, brandSlug: string, relBase: string): DocGroup[] {
  const groups: DocGroup[] = [];
  const rootDocs: DocEntry[] = [];

  if (!fs.existsSync(dir)) return groups;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const rootFiles = new Set(entries.filter((e) => e.isFile()).map((e) => e.name));

  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name.startsWith("_")) continue;

    if (entry.isDirectory()) {
      if (FOUNDATION_FOLDERS.has(entry.name) || IGNORED_FOLDERS.has(entry.name)) continue;

      const subDir = path.join(dir, entry.name);
      const docs = collectDocs(subDir, brandSlug, path.join(relBase, entry.name));
      if (docs.length > 0) {
        groups.push({
          folder: entry.name,
          label: labelFromFolder(entry.name),
          docs,
        });
      }
    } else if (entry.isFile()) {
      if (IGNORED_FILES.has(entry.name)) continue;
      const doc = buildDocEntry(entry.name, rootFiles, brandSlug, relBase);
      if (doc) rootDocs.push(doc);
    }
  }

  if (rootDocs.length > 0) {
    groups.unshift({ folder: "_root", label: "General", docs: rootDocs });
  }

  return groups;
}

function collectDocs(dir: string, brandSlug: string, relPath: string): DocEntry[] {
  const docs: DocEntry[] = [];
  if (!fs.existsSync(dir)) return docs;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const fileNames = new Set(entries.filter((e) => e.isFile()).map((e) => e.name));
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name.startsWith("_")) continue;

    if (entry.isFile()) {
      const doc = buildDocEntry(entry.name, fileNames, brandSlug, relPath);
      if (doc) docs.push(doc);
    } else if (entry.isDirectory()) {
      docs.push(...collectDocs(path.join(dir, entry.name), brandSlug, path.join(relPath, entry.name)));
    }
  }
  return docs;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const slug = req.query.slug as string;
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  const dir = brandDir(slug);
  if (!fs.existsSync(dir)) return res.status(404).json({ error: "Brand not found" });

  const groups = scanDir(dir, slug, "");
  res.status(200).json({ ok: true, groups });
}

export default compose(withErrorHandler, withAuth)(handler);
