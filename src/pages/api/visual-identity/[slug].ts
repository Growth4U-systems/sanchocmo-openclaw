/**
 * GET /api/visual-identity/[slug]
 *
 * Devuelve el DESIGN.md del brand parseado (paleta, tipografías, layout, do's/don'ts,
 * Sancho extensions: logo rules, social specs, illustration discipline). Si no hay DESIGN.md,
 * intenta el fallback legacy (design-tokens.json + visual-identity.current.md) para no romper
 * brands que aún no han migrado.
 *
 * Lo consume Visual Identity Hero en la sección Media Creation.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { promises as fs } from "fs";
import path from "path";
import { brandDir } from "@/lib/data/paths";
import { parseDesignMd, type ParsedDesignSystem } from "@/lib/open-design/design-md-parser";

interface VisualIdentityResponse {
  slug: string;
  source: "design-md" | "legacy-tokens" | "missing";
  designMdPath?: string;
  legacyTokensPath?: string;
  parsed?: ParsedDesignSystem;
  legacyTokens?: Record<string, unknown>;
  hasLogoLight?: boolean;
  hasLogoDark?: boolean;
  logoLightUrl?: string;
  logoDarkUrl?: string;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function findLogo(root: string, variant: "light" | "dark"): Promise<string | null> {
  for (const ext of ["png", "webp", "svg", "jpg"]) {
    const p = path.join(root, "brand-book", "visual-identity", `logo-${variant}.${ext}`);
    if (await fileExists(p)) return p;
  }
  return null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<VisualIdentityResponse | { error: string }>) {
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
  const designMdPath = path.join(root, "brand-book", "visual-identity", "DESIGN.md");
  const legacyTokensPath = path.join(root, "brand-book", "visual-identity", "design-tokens.json");

  const logoLight = await findLogo(root, "light");
  const logoDark = await findLogo(root, "dark");

  const hasLogoLight = !!logoLight;
  const hasLogoDark = !!logoDark;

  // Logo se sirve via /api/docs/[...path] que ya existe (sirve archivos del workspace).
  // Para simplicidad, exponemos URL relativa que la UI puede usar como <img src={url}>
  const logoLightUrl = logoLight
    ? `/api/brand-files/brand/${slug}/${path.relative(root, logoLight)}`
    : undefined;
  const logoDarkUrl = logoDark
    ? `/api/brand-files/brand/${slug}/${path.relative(root, logoDark)}`
    : undefined;

  // Source-of-truth: DESIGN.md
  if (await fileExists(designMdPath)) {
    const md = await fs.readFile(designMdPath, "utf8");
    const parsed = parseDesignMd(md);
    res.status(200).json({
      slug,
      source: "design-md",
      designMdPath,
      parsed,
      hasLogoLight,
      hasLogoDark,
      logoLightUrl,
      logoDarkUrl,
    });
    return;
  }

  // Fallback legacy
  if (await fileExists(legacyTokensPath)) {
    const raw = await fs.readFile(legacyTokensPath, "utf8");
    let legacyTokens: Record<string, unknown> = {};
    try {
      legacyTokens = JSON.parse(raw);
    } catch {
      // corrupto — mejor reportar como missing
    }
    res.status(200).json({
      slug,
      source: "legacy-tokens",
      legacyTokensPath,
      legacyTokens,
      hasLogoLight,
      hasLogoDark,
      logoLightUrl,
      logoDarkUrl,
    });
    return;
  }

  res.status(200).json({
    slug,
    source: "missing",
    hasLogoLight,
    hasLogoDark,
    logoLightUrl,
    logoDarkUrl,
  });
}
