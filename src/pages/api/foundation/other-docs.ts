import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { withErrorHandler, withAuth, compose } from "@/lib/api-middleware";
import { brandDir } from "@/lib/data/paths";

/**
 * GET /api/foundation/other-docs?slug=X
 * Returns non-foundation documents grouped by folder.
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
  path: string;       // relative to brand dir (for display)
  fullPath: string;    // relative to BASE (for API calls)
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
      const ext = path.extname(entry.name);
      if (![".md", ".html"].includes(ext)) continue;

      rootDocs.push({
        name: entry.name.replace(/\.(md|html)$/, "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        path: path.join(relBase, entry.name),
        fullPath: `brand/${brandSlug}/${path.join(relBase, entry.name)}`,
      });
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
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name.startsWith("_")) continue;

    if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (![".md", ".html"].includes(ext)) continue;
      docs.push({
        name: entry.name.replace(/\.(md|html)$/, "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        path: path.join(relPath, entry.name),
        fullPath: `brand/${brandSlug}/${path.join(relPath, entry.name)}`,
      });
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
