#!/usr/bin/env tsx
/**
 * One-off backfill: place a brand's logo at the canonical path
 * `brand/{slug}/brand-book/visual-identity/logo-light.png` (and optionally
 * `logo-dark.png`). When the script can't find any candidate, it stamps
 * `logo.missing: true` into `design-tokens.json` so downstream code knows
 * the absence is registered (not just unknown).
 *
 * Why this exists:
 *   The `visual-identity` skill always produced logos *somewhere* in the
 *   brand folder (mockups/, assets/, _archive/visual-identity-mockups/) but
 *   never to a stable filename. Mission Control's content engine and
 *   carousel renderer expect a single canonical path. This script reconciles
 *   what's on disk for existing brands, and the SKILL.md change makes new
 *   brands write to the canonical path from day one.
 *
 * Search order (first hit per "light" / "dark" wins):
 *   1. brand/{slug}/brand-book/visual-identity/logo-{variant}.png  (already canonical — no-op)
 *   2. brand/{slug}/brand-book/visual-identity/Logo-{Variant}.png  (case-insensitive)
 *   3. brand/{slug}/brand-identity/visual-identity/Logo-*.png
 *   4. brand/{slug}/brand-identity/visual-identity/assets/Logo-*.png
 *   5. brand/{slug}/_archive/visual-identity-mockups/Logo-*.png
 *   6. brand/{slug}/visual-identity/assets/Logo-*.png
 *
 * Variants:
 *   "light"  ← Logo-light.png, logo-light.png
 *   "dark"   ← Logo-dark.png, Logo-night.png  (the linkedin-pipeline repo
 *                shipped them as `Logo-night.png`; we accept that alias)
 *
 * Usage:
 *   tsx scripts/backfill-brand-logo.mts [--dry-run] [--slug=<slug>]
 *
 * Without --slug, processes every directory under workspace-sancho/brand/.
 */

import fs from "fs";
import path from "path";
import os from "os";

const BASE =
  process.env.MC_WORKSPACE ||
  path.join(os.homedir(), ".openclaw", "workspace-sancho");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const slugArg = args.find((a) => a.startsWith("--slug="))?.slice("--slug=".length);

const VARIANTS = [
  { name: "light", aliases: ["Logo-light.png", "logo-light.png", "LogoLight.png"] },
  { name: "dark", aliases: ["Logo-dark.png", "logo-dark.png", "Logo-night.png", "logo-night.png", "LogoDark.png"] },
] as const;

type Variant = typeof VARIANTS[number]["name"];

function brandDir(slug: string): string {
  return path.join(BASE, "brand", slug);
}

function canonicalLogoPath(slug: string, variant: Variant): string {
  return path.join(brandDir(slug), "brand-book", "visual-identity", `logo-${variant}.png`);
}

function findCandidate(slug: string, variant: Variant): string | null {
  const aliases = VARIANTS.find((v) => v.name === variant)!.aliases;
  const searchDirs = [
    path.join(brandDir(slug), "brand-book", "visual-identity"),
    path.join(brandDir(slug), "brand-identity", "visual-identity"),
    path.join(brandDir(slug), "brand-identity", "visual-identity", "assets"),
    path.join(brandDir(slug), "_archive", "visual-identity-mockups"),
    path.join(brandDir(slug), "visual-identity", "assets"),
    path.join(brandDir(slug), "visual-identity"),
  ];
  for (const dir of searchDirs) {
    for (const alias of aliases) {
      const abs = path.join(dir, alias);
      if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
        return abs;
      }
    }
  }
  return null;
}

interface DesignTokens {
  logo?: { missing?: boolean; reason?: string; full?: string; short?: string; [k: string]: unknown };
  [k: string]: unknown;
}

function readDesignTokens(slug: string): { abs: string; data: DesignTokens; existed: boolean } {
  const abs = path.join(brandDir(slug), "brand-book", "visual-identity", "design-tokens.json");
  if (!fs.existsSync(abs)) {
    return { abs, data: {}, existed: false };
  }
  try {
    return { abs, data: JSON.parse(fs.readFileSync(abs, "utf-8")) as DesignTokens, existed: true };
  } catch (e) {
    console.warn(`  ⚠ design-tokens.json no parseable, dejándolo intacto: ${(e as Error).message}`);
    return { abs, data: {}, existed: true };
  }
}

function writeDesignTokensMissing(slug: string, reason: string): { wrote: boolean; reason: string } {
  const { abs, data, existed } = readDesignTokens(slug);
  if (!existed) {
    return { wrote: false, reason: "design-tokens.json no existe (skip flag)" };
  }
  const current = data.logo || {};
  if (current.missing === true) {
    return { wrote: false, reason: "logo.missing ya estaba a true" };
  }
  data.logo = { ...current, missing: true, reason };
  if (!dryRun) {
    fs.writeFileSync(abs, JSON.stringify(data, null, 2) + "\n");
  }
  return { wrote: true, reason };
}

function clearDesignTokensMissing(slug: string): boolean {
  const { abs, data, existed } = readDesignTokens(slug);
  if (!existed || !data.logo?.missing) return false;
  delete data.logo.missing;
  delete data.logo.reason;
  if (!dryRun) {
    fs.writeFileSync(abs, JSON.stringify(data, null, 2) + "\n");
  }
  return true;
}

function processSlug(slug: string): void {
  console.log(`\n▶ ${slug}`);
  let placedAny = false;

  for (const variant of VARIANTS) {
    const canonical = canonicalLogoPath(slug, variant.name);
    if (fs.existsSync(canonical)) {
      console.log(`  ✓ logo-${variant.name}.png ya está en su sitio`);
      placedAny = true;
      continue;
    }
    const candidate = findCandidate(slug, variant.name);
    if (!candidate) {
      console.log(`  − logo-${variant.name}.png no encontrado en candidatos`);
      continue;
    }
    if (dryRun) {
      console.log(`  [dry-run] copiaría ${path.relative(brandDir(slug), candidate)} → ${path.relative(brandDir(slug), canonical)}`);
    } else {
      fs.mkdirSync(path.dirname(canonical), { recursive: true });
      fs.copyFileSync(candidate, canonical);
      console.log(`  ✓ ${path.relative(brandDir(slug), candidate)} → ${path.relative(brandDir(slug), canonical)}`);
    }
    placedAny = true;
  }

  // Mantener `logo.missing` consistente con la realidad on-disk.
  if (placedAny) {
    const cleared = clearDesignTokensMissing(slug);
    if (cleared) console.log(`  ✓ logo.missing limpiado en design-tokens.json`);
  } else {
    const lightCanonical = canonicalLogoPath(slug, "light");
    if (!fs.existsSync(lightCanonical)) {
      const { wrote, reason } = writeDesignTokensMissing(
        slug,
        "no se encontró logo en mockups/ ni assets/ ni _archive/ — pendiente de aporte del cliente",
      );
      if (wrote) console.log(`  ✓ logo.missing=true escrito en design-tokens.json (${reason})`);
      else console.log(`  − ${reason}`);
    }
  }
}

function main(): void {
  if (!fs.existsSync(BASE)) {
    console.error(`✗ MC_WORKSPACE no existe: ${BASE}`);
    process.exit(1);
  }
  const brandsRoot = path.join(BASE, "brand");
  if (!fs.existsSync(brandsRoot)) {
    console.error(`✗ ${brandsRoot} no existe`);
    process.exit(1);
  }

  const slugs = slugArg
    ? [slugArg]
    : fs
        .readdirSync(brandsRoot, { withFileTypes: true })
        .filter((e) => e.isDirectory() && !e.name.startsWith("."))
        .map((e) => e.name)
        .sort();

  console.log(`Backfill brand logo${dryRun ? " (DRY RUN)" : ""}`);
  console.log(`Workspace: ${BASE}`);
  console.log(`Slugs: ${slugs.join(", ")}`);

  for (const slug of slugs) {
    if (!fs.existsSync(brandDir(slug))) {
      console.log(`\n▶ ${slug}: no existe, skip`);
      continue;
    }
    processSlug(slug);
  }
  console.log("");
}

main();
