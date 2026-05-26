#!/usr/bin/env tsx
/**
 * Audit and optionally repair document paths in controlled Mission Control JSON.
 *
 * Usage:
 *   tsx scripts/audit-doc-paths.mts --check [--slug=growth4u]
 *   tsx scripts/audit-doc-paths.mts --fix [--slug=growth4u]
 */

import fs from "fs";
import path from "path";
import os from "os";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { normalizeBrandDocPath, stripBrandPrefix } = require("../src/lib/doc-paths.ts") as typeof import("../src/lib/doc-paths");
const { resolveWorkspaceDocPath } = require("../src/lib/server/doc-paths.ts") as typeof import("../src/lib/server/doc-paths");

const BASE = process.env.MC_WORKSPACE || path.join(os.homedir(), ".openclaw", "workspace-sancho");
const BRAND_DIR = path.join(BASE, "brand");
const args = process.argv.slice(2);
const FIX = args.includes("--fix");
const CHECK = args.includes("--check") || !FIX;
const SLUG_FILTER = args.find((arg) => arg.startsWith("--slug="))?.slice("--slug=".length);

const PATH_KEYS = new Set([
  "path",
  "docPath",
  "deliverable_file",
  "output_file",
  "file",
  "link",
]);

interface Issue {
  file: string;
  jsonPath: string;
  before: string;
  after: string;
  reason: string;
}

function listDirs(dir: string): string[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }
}

function readJson(file: string): unknown | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return null;
  }
}

function writeJson(file: string, data: unknown): void {
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
}

function isDocish(value: string): boolean {
  if (!value || value.startsWith("http://") || value.startsWith("https://")) return false;
  if (value.includes("\n") || value.includes("{")) return false;
  if (/\.(md|html|json|txt)$/i.test(value)) return true;
  if (/\/current\.md$/i.test(value)) return true;
  if (/\.current\.(md|html|json)$/i.test(value)) return true;
  return false;
}

function collectFiles(slug: string): string[] {
  const files: string[] = [];
  const brandRoot = path.join(BRAND_DIR, slug);
  const projectsRoot = path.join(brandRoot, "projects");

  for (const projectDir of listDirs(projectsRoot)) {
    for (const name of ["project.json", "tasks.json"]) {
      const file = path.join(projectsRoot, projectDir, name);
      if (fs.existsSync(file)) files.push(file);
    }
  }

  for (const rel of ["chat-config.json", path.join("content", "content-tasks.json")]) {
    const file = path.join(brandRoot, rel);
    if (fs.existsSync(file)) files.push(file);
  }

  return files;
}

function repairPath(slug: string, value: string): { value: string; reason: string } | null {
  if (!isDocish(value)) return null;

  let normalized: string;
  try {
    normalized = normalizeBrandDocPath(slug, value);
  } catch {
    return null;
  }

  let reason = "";
  if (normalized !== value && normalized.includes(`/brand/${slug}/`)) {
    reason = "duplicate brand prefix";
  }

  const resolved = resolveWorkspaceDocPath(BASE, normalized, { slug, requireBrand: true });
  if (!resolved.exists) return reason ? { value: normalized, reason } : null;

  const originalWasBrandScoped = value.replace(/^\/+/, "").startsWith("brand/");
  const next = originalWasBrandScoped
    ? resolved.canonicalPath
    : stripBrandPrefix(resolved.canonicalPath, slug);

  if (next !== value) {
    return {
      value: next,
      reason: resolved.usedFallback ? "current.md alias fallback" : reason || "normalized path",
    };
  }

  return null;
}

function visit(node: unknown, slug: string, file: string, jsonPath: string, issues: Issue[]): boolean {
  let dirty = false;

  if (Array.isArray(node)) {
    node.forEach((item, index) => {
      if (visit(item, slug, file, `${jsonPath}[${index}]`, issues)) dirty = true;
    });
    return dirty;
  }

  if (!node || typeof node !== "object") return false;

  const obj = node as Record<string, unknown>;
  for (const [key, value] of Object.entries(obj)) {
    const childPath = jsonPath ? `${jsonPath}.${key}` : key;

    if (typeof value === "string" && PATH_KEYS.has(key)) {
      const repaired = repairPath(slug, value);
      if (repaired) {
        issues.push({ file, jsonPath: childPath, before: value, after: repaired.value, reason: repaired.reason });
        if (FIX) obj[key] = repaired.value;
        dirty = true;
      }
      continue;
    }

    if (Array.isArray(value) && (key === "output_files" || key === "documents" || key === "attachments")) {
      value.forEach((item, index) => {
        if (typeof item === "string") {
          const repaired = repairPath(slug, item);
          if (repaired) {
            issues.push({ file, jsonPath: `${childPath}[${index}]`, before: item, after: repaired.value, reason: repaired.reason });
            if (FIX) value[index] = repaired.value;
            dirty = true;
          }
        } else if (visit(item, slug, file, `${childPath}[${index}]`, issues)) {
          dirty = true;
        }
      });
      continue;
    }

    if (visit(value, slug, file, childPath, issues)) dirty = true;
  }

  return dirty;
}

const slugs = listDirs(BRAND_DIR).filter((slug) => !SLUG_FILTER || slug === SLUG_FILTER);
const issues: Issue[] = [];
let changedFiles = 0;

for (const slug of slugs) {
  for (const file of collectFiles(slug)) {
    const data = readJson(file);
    if (!data) continue;
    const beforeCount = issues.length;
    const dirty = visit(data, slug, file, "", issues);
    if (FIX && dirty && issues.length > beforeCount) {
      writeJson(file, data);
      changedFiles += 1;
    }
  }
}

for (const issue of issues) {
  console.log(`${path.relative(BASE, issue.file)} ${issue.jsonPath}`);
  console.log(`  ${issue.reason}: ${issue.before} -> ${issue.after}`);
}

console.log(`${CHECK ? "Checked" : "Fixed"} ${slugs.length} slug(s). Issues: ${issues.length}. Files changed: ${changedFiles}.`);

if (CHECK && issues.length > 0) process.exit(1);
