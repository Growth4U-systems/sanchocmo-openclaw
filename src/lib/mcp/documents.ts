import fs from "fs";
import path from "path";
import { BASE, brandDir } from "@/lib/data/paths";
import { cleanDocPath, normalizeBrandDocPath, stripBrandPrefix } from "@/lib/doc-paths";
import { resolveWorkspaceDocPath } from "@/lib/server/doc-paths";

export type McpDocumentExtension = "md" | "html";

export interface McpDocumentSummary {
  path: string;
  title: string;
  extension: McpDocumentExtension;
  size: number;
  updatedAt: string;
}

export interface McpDocumentDetail extends McpDocumentSummary {
  requestedPath: string;
  canonicalPath: string;
  usedFallback: boolean;
  content: string;
  truncated: boolean;
}

const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 200;
const DEFAULT_MAX_CHARS = 60_000;
const MAX_MAX_CHARS = 200_000;
const MAX_WALK_FILES = 5_000;
const DEFAULT_EXTENSIONS: McpDocumentExtension[] = ["md", "html"];
const SKIPPED_DIRS = new Set(["chat", "_archive", "_system"]);

export function listMcpDocuments(
  brandSlug: string,
  options: {
    pathPrefix?: string;
    query?: string;
    extensions?: McpDocumentExtension[];
    limit?: number;
  } = {},
): { documents: McpDocumentSummary[]; count: number; limit: number } {
  const slug = normalizeBrandSlug(brandSlug);
  const root = brandDir(slug);
  if (!isDirectory(root)) {
    throw new Error(`Brand not found: ${slug}`);
  }

  const limit = clampNumber(options.limit, DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT);
  const extensions = normalizeExtensions(options.extensions);
  const prefix = normalizePathPrefix(slug, options.pathPrefix);
  const query = options.query?.trim().toLowerCase() || null;

  const documents: McpDocumentSummary[] = [];
  for (const hit of walkDocumentFiles(root, slug, extensions)) {
    const brandRelativePath = stripBrandPrefix(hit.path, slug);
    if (prefix && !matchesPathPrefix(brandRelativePath, prefix)) continue;
    if (query && !hit.path.toLowerCase().includes(query) && !hit.title.toLowerCase().includes(query)) continue;
    documents.push(hit);
    if (documents.length >= limit) break;
  }

  return { documents, count: documents.length, limit };
}

export function getMcpDocument(
  brandSlug: string,
  docPath: string,
  options: { maxChars?: number } = {},
): McpDocumentDetail {
  const slug = normalizeBrandSlug(brandSlug);
  const requestedPath = cleanDocPath(docPath);
  const normalizedPath = normalizeBrandDocPath(slug, requestedPath);
  const resolved = resolveWorkspaceDocPath(BASE, normalizedPath, { slug, requireBrand: true });

  if (!resolved.exists) {
    throw new Error(`Document not found: ${resolved.canonicalPath}`);
  }
  if (!resolved.canonicalPath.startsWith(`brand/${slug}/`)) {
    throw new Error("Document path belongs to a different brand");
  }

  const extension = extensionFromPath(resolved.canonicalPath);
  if (!extension) {
    throw new Error("Unsupported document extension; only .md and .html are readable through MCP");
  }

  const stat = fs.statSync(resolved.absPath);
  const raw = fs.readFileSync(resolved.absPath, "utf8");
  const maxChars = clampNumber(options.maxChars, DEFAULT_MAX_CHARS, MAX_MAX_CHARS);
  const truncated = raw.length > maxChars;
  const content = truncated ? raw.slice(0, maxChars) : raw;

  return {
    path: resolved.canonicalPath,
    requestedPath: resolved.requestedPath,
    canonicalPath: resolved.canonicalPath,
    usedFallback: resolved.usedFallback,
    title: titleFromPath(resolved.canonicalPath),
    extension,
    size: stat.size,
    updatedAt: stat.mtime.toISOString(),
    content,
    truncated,
  };
}

function* walkDocumentFiles(
  root: string,
  brandSlug: string,
  extensions: Set<McpDocumentExtension>,
): Generator<McpDocumentSummary> {
  const stack = [root];
  let seen = 0;

  while (stack.length > 0 && seen < MAX_WALK_FILES) {
    const dir = stack.pop();
    if (!dir) continue;

    const entries = safeReadDir(dir);
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name.startsWith("_")) continue;
      const absPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIPPED_DIRS.has(entry.name)) continue;
        stack.push(absPath);
        continue;
      }
      if (!entry.isFile()) continue;

      seen += 1;
      const extension = extensionFromPath(entry.name);
      if (!extension || !extensions.has(extension)) continue;

      const relPath = path.relative(BASE, absPath).split(path.sep).join("/");
      if (!relPath.startsWith(`brand/${brandSlug}/`)) continue;

      const stat = fs.statSync(absPath);
      yield {
        path: relPath,
        title: titleFromPath(relPath),
        extension,
        size: stat.size,
        updatedAt: stat.mtime.toISOString(),
      };
    }
  }
}

function normalizeBrandSlug(input: string): string {
  const slug = String(input || "").trim();
  if (!slug) throw new Error("brandSlug is required");
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(slug)) {
    throw new Error("brandSlug must be a simple slug");
  }
  return slug;
}

function normalizeExtensions(value: McpDocumentExtension[] | undefined): Set<McpDocumentExtension> {
  const extensions = value?.length ? value : DEFAULT_EXTENSIONS;
  return new Set(extensions);
}

function normalizePathPrefix(slug: string, input: string | undefined): string | null {
  if (!input) return null;
  const cleaned = cleanDocPath(input);
  if (cleaned === `brand/${slug}`) return null;
  return stripBrandPrefix(normalizeBrandDocPath(slug, cleaned), slug);
}

function matchesPathPrefix(documentPath: string, prefix: string): boolean {
  return documentPath === prefix || documentPath.startsWith(`${prefix}/`);
}

function extensionFromPath(value: string): McpDocumentExtension | null {
  const ext = path.extname(value).replace(/^\./, "").toLowerCase();
  return ext === "md" || ext === "html" ? ext : null;
}

function titleFromPath(value: string): string {
  const basename = path.basename(value).replace(/\.(md|html)$/i, "");
  if (basename === "current") {
    const parent = path.basename(path.dirname(value));
    return titleize(parent || basename);
  }
  return titleize(basename);
}

function titleize(value: string): string {
  return value
    .replace(/\.current$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function clampNumber(value: number | undefined, defaultValue: number, maxValue: number): number {
  if (!Number.isFinite(value)) return defaultValue;
  return Math.max(1, Math.min(maxValue, Number(value)));
}

function isDirectory(value: string): boolean {
  try {
    return fs.statSync(value).isDirectory();
  } catch {
    return false;
  }
}

function safeReadDir(value: string): fs.Dirent[] {
  try {
    return fs.readdirSync(value, { withFileTypes: true });
  } catch {
    return [];
  }
}
