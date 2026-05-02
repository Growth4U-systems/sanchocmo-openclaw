import fs from "fs";
import path from "path";
import { brandDir } from "@/lib/data/paths";
import { readJSON } from "@/lib/data/json-io";
import { getContentConfig, type ContentConfig } from "@/lib/data/content-config";

/**
 * Resolves carousel-related config fields against three sources, in order:
 *
 *   1. **override** — value explicitly written to `brand/{slug}/content/config.json`
 *   2. **brand-book** — derived from `brand-book/visual-identity/design-tokens.json`
 *      and the existence of `brand-book/visual-identity/logo-light.png`
 *   3. **default** — null / sensible fallback
 *
 * Returns each field tagged with its `source` so the UI can render the
 * "✓ Brand-book / ✏️ Custom / ⚠ Falta" tri-state and the user only ever
 * inputs values that aren't already known.
 */

export type ConfigSource = "override" | "brand-book" | "default";

export interface Resolved<T> {
  value: T;
  source: ConfigSource;
}

export interface EffectiveCarouselConfig {
  logo_url: Resolved<string | null>;
  footer_text: Resolved<string | null>;
  primary_color: Resolved<string | null>;
  accent_color: Resolved<string | null>;
  enabled_templates: Resolved<string[] | null>;
}

export interface EffectiveContentConfig {
  image_generation: ContentConfig["image_generation"];  // sin layering — el override es directo
  carousel: EffectiveCarouselConfig;
}

/** Status of the logo asset for a brand, distinguishing three real-world cases:
 *  - `present`: the canonical PNG exists on disk → URL is served.
 *  - `missing-registered`: visual-identity skill ran AND failed to find a logo
 *    (cliente sin asset). Persisted as `logo.missing: true` in design-tokens.json
 *    so we don't re-ask the question downstream.
 *  - `pending`: visual-identity skill hasn't run yet (or the brand-book is
 *    incomplete). Different UX: "lanza visual-identity" vs "el cliente no tiene logo".
 */
export type LogoStatus = "present" | "missing-registered" | "pending";

export interface BrandBookSnapshot {
  brand_name: string | null;
  primary_color: string | null;
  accent_color: string | null;
  logo_status: LogoStatus;
  logo_asset_url: string | null;
  logo_missing_reason: string | null;
  /** @deprecated kept for back-compat with the original setup-config UI. */
  logo_asset_present: boolean;
  typography: { heading: string | null; body: string | null };
}

interface DesignTokens {
  brand?: string;
  colors?: {
    primary?: Record<string, { value?: string }>;
  };
  typography?: {
    families?: { heading?: { family?: string }; body?: { family?: string } };
  };
  logo?: {
    full?: string;
    short?: string;
    missing?: boolean;
    reason?: string;
  };
}

const LOGO_LIGHT_REL = "brand-book/visual-identity/logo-light.png";

/** Read the brand-book + check the on-disk logo asset and produce a snapshot
 *  the UI can compare against the override layer. Pure read; no side effects.
 *
 *  Logo resolution distinguishes three states (see `LogoStatus`):
 *    1. `present` — file exists on disk, return its served URL.
 *    2. `missing-registered` — design-tokens.json says `logo.missing: true`
 *       (the visual-identity skill ran and explicitly recorded that the
 *       client doesn't have a logo). UI shows "registered as missing".
 *    3. `pending` — neither the file nor the missing flag exists. The
 *       upstream skill hasn't recorded anything; UI prompts to run it.
 */
export function readBrandBookSnapshot(slug: string): BrandBookSnapshot {
  const tokensPath = path.join(brandDir(slug), "brand-book", "visual-identity", "design-tokens.json");
  const tokens = readJSON<DesignTokens>(tokensPath, {});
  const palette = tokens.colors?.primary || {};

  // Heuristics that match how loadBrandContext picked colors before this
  // refactor — keeps the visual output identical when nothing's overridden.
  const primary =
    palette.navy?.value ||
    palette.dark?.value ||
    Object.values(palette)[0]?.value ||
    null;
  const accent =
    palette.teal?.value ||
    palette.electric?.value ||
    palette.purple?.value ||
    Object.values(palette).slice(1, 2)[0]?.value ||
    null;

  const logoAbs = path.join(brandDir(slug), LOGO_LIGHT_REL);
  const logoOnDisk = fs.existsSync(logoAbs);
  const logoFlaggedMissing = tokens.logo?.missing === true;

  let logoStatus: LogoStatus;
  let logoUrl: string | null;
  let logoReason: string | null;
  if (logoOnDisk) {
    logoStatus = "present";
    logoUrl = `/api/brand-asset/${slug}/${LOGO_LIGHT_REL}`;
    logoReason = null;
  } else if (logoFlaggedMissing) {
    logoStatus = "missing-registered";
    logoUrl = null;
    logoReason = tokens.logo?.reason || null;
  } else {
    logoStatus = "pending";
    logoUrl = null;
    logoReason = null;
  }

  return {
    brand_name: tokens.brand || null,
    primary_color: primary,
    accent_color: accent,
    logo_status: logoStatus,
    logo_asset_url: logoUrl,
    logo_missing_reason: logoReason,
    logo_asset_present: logoOnDisk,
    typography: {
      heading: tokens.typography?.families?.heading?.family || null,
      body: tokens.typography?.families?.body?.family || null,
    },
  };
}

export function getEffectiveContentConfig(slug: string): EffectiveContentConfig {
  const cfg = getContentConfig(slug);
  const bb = readBrandBookSnapshot(slug);

  return {
    image_generation: cfg.image_generation,
    carousel: {
      logo_url: resolve(cfg.carousel.logo_url, bb.logo_asset_url),
      footer_text: resolve<string | null>(cfg.carousel.footer_text, null),
      primary_color: resolve(cfg.carousel.primary_color, bb.primary_color),
      accent_color: resolve(cfg.carousel.accent_color, bb.accent_color),
      enabled_templates: resolve<string[] | null>(cfg.carousel.enabled_templates, null),
    },
  };
}

function resolve<T>(override: T | null | undefined, brandBook: T | null | undefined): Resolved<T | null> {
  if (override !== null && override !== undefined && !(Array.isArray(override) && override.length === 0)) {
    return { value: override as T, source: "override" };
  }
  if (brandBook !== null && brandBook !== undefined) {
    return { value: brandBook as T, source: "brand-book" };
  }
  return { value: null, source: "default" };
}
