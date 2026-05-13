#!/usr/bin/env node
/**
 * One-shot migration: rewrite every `meta.json` under
 * `workspace-sancho/brand/*\/brand-book/visual-identity/templates/*\/` from
 * the legacy snake_case+object shape to the canonical FileTemplateMeta
 * shape (camelCase + slots array).
 *
 * Idempotent: if the file is already canonical, it's left untouched.
 * Run from repo root: `node scripts/migrate-template-meta.mjs`
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BRAND_ROOT = path.resolve(__dirname, "..", "workspace-sancho", "brand");

function listTemplateMetaFiles(brandRoot) {
  if (!fs.existsSync(brandRoot)) return [];
  const out = [];
  for (const slug of fs.readdirSync(brandRoot)) {
    const tplDir = path.join(
      brandRoot,
      slug,
      "brand-book",
      "visual-identity",
      "templates",
    );
    if (!fs.existsSync(tplDir)) continue;
    for (const id of fs.readdirSync(tplDir, { withFileTypes: true })) {
      if (!id.isDirectory() || id.name.startsWith(".")) continue;
      const meta = path.join(tplDir, id.name, "meta.json");
      if (fs.existsSync(meta)) out.push({ slug, id: id.name, meta });
    }
  }
  return out;
}

function normalizeSlots(input) {
  if (Array.isArray(input)) {
    return input
      .filter((s) => s && typeof s === "object" && typeof s.key === "string")
      .map((s) => ({
        key: s.key,
        label: typeof s.label === "string" ? s.label : s.key,
        ...(s.multiline ? { multiline: true } : {}),
        ...((s.perSlide ?? s.per_slide) ? { perSlide: true } : {}),
        ...(typeof s.placeholder === "string" ? { placeholder: s.placeholder } : {}),
        ...(typeof (s.maxLength ?? s.max_length) === "number"
          ? { maxLength: s.maxLength ?? s.max_length }
          : {}),
      }));
  }
  if (input && typeof input === "object") {
    return Object.entries(input)
      .filter(([, def]) => def && typeof def === "object")
      .filter(([, def]) => !def.auto)
      .map(([key, def]) => ({
        key,
        label: typeof def.label === "string" ? def.label : key,
        ...(def.multiline ? { multiline: true } : {}),
        ...((def.perSlide ?? def.per_slide) ? { perSlide: true } : {}),
        ...(typeof def.placeholder === "string" ? { placeholder: def.placeholder } : {}),
        ...(typeof (def.maxLength ?? def.max_length) === "number"
          ? { maxLength: def.maxLength ?? def.max_length }
          : {}),
      }));
  }
  return [];
}

function canonicalize(raw, idFallback) {
  const id = (typeof raw.id === "string" && raw.id) ||
             (typeof raw.template_id === "string" && raw.template_id) ||
             idFallback;
  let width = typeof raw.width === "number" ? raw.width : undefined;
  let height = typeof raw.height === "number" ? raw.height : undefined;
  if ((!width || !height) && typeof raw.size === "string") {
    const m = raw.size.match(/^\s*(\d+)\s*x\s*(\d+)\s*$/i);
    if (m) {
      width = parseInt(m[1], 10);
      height = parseInt(m[2], 10);
    }
  }
  const slideCount =
    typeof raw.slideCount === "number" ? raw.slideCount :
    typeof raw.slides === "number" ? raw.slides :
    1;
  return {
    id,
    name: (typeof raw.name === "string" && raw.name) || id,
    channel: typeof raw.channel === "string" ? raw.channel : "linkedin",
    description:
      (typeof raw.description === "string" && raw.description) ||
      (typeof raw.use_case === "string" && raw.use_case) ||
      "",
    slideCount,
    width: width ?? 1080,
    height: height ?? 1350,
    slots: normalizeSlots(raw.slots),
  };
}

function isAlreadyCanonical(raw) {
  return (
    typeof raw.id === "string" &&
    typeof raw.slideCount === "number" &&
    typeof raw.width === "number" &&
    typeof raw.height === "number" &&
    typeof raw.description === "string" &&
    typeof raw.name === "string" &&
    Array.isArray(raw.slots) &&
    !("template_id" in raw) &&
    !("slides" in raw) &&
    !("size" in raw) &&
    !("use_case" in raw)
  );
}

function main() {
  const files = listTemplateMetaFiles(BRAND_ROOT);
  if (files.length === 0) {
    console.log("No template meta.json files found under", BRAND_ROOT);
    return;
  }
  let changed = 0;
  let skipped = 0;
  for (const { slug, id, meta } of files) {
    const raw = JSON.parse(fs.readFileSync(meta, "utf-8"));
    if (isAlreadyCanonical(raw)) {
      skipped++;
      console.log(`✓ ${slug}/${id}  already canonical`);
      continue;
    }
    const canon = canonicalize(raw, id);
    fs.writeFileSync(meta, JSON.stringify(canon, null, 2) + "\n", "utf-8");
    changed++;
    console.log(`→ ${slug}/${id}  migrated (${canon.slots.length} slots)`);
  }
  console.log(`\nDone. ${changed} migrated, ${skipped} already canonical.`);
}

main();
