import path from "path";
import { brandDir } from "@/lib/data/paths";
import { readJSON } from "@/lib/data/json-io";
import { getEffectiveContentConfig } from "@/lib/data/content-config-effective";
import type { BrandContext } from "@/lib/carousel/types";

interface DesignTokens {
  brand?: string;
  typography?: { families?: { heading?: { family?: string } } };
}

/**
 * Build the brand context the carousel templates render with. Pulls the
 * effective config so:
 *   - Colors come from `content/config.json` overrides first, then
 *     `design-tokens.json colors.primary.*`.
 *   - Logo URL prefers an explicit override, then falls through to the
 *     `/api/brand-asset/...` URL of `brand-book/visual-identity/logo-light.png`
 *     when that file exists. If neither, the templates fall back to their
 *     wordmark-style footer.
 *   - Footer text is override-only — there's no equivalent in design-tokens
 *     today, so until the user fills it (via the Setup panel or the
 *     content-engine-setup skill) the templates show the brand short name.
 */
export function loadBrandContext(slug: string): BrandContext {
  const tokensPath = path.join(brandDir(slug), "brand-book", "visual-identity", "design-tokens.json");
  const tokens = readJSON<DesignTokens>(tokensPath, {});
  const eff = getEffectiveContentConfig(slug).carousel;

  // Build absolute URLs for any logo asset path so Playwright can fetch it
  // when it has no document origin. `req` isn't available here, but the dev
  // server listens on localhost:3000 and prod uses MC_PUBLIC_URL.
  const baseUrl =
    process.env.MC_PUBLIC_URL ||
    process.env.NEXTAUTH_URL ||
    "http://localhost:3000";
  const rawLogo = eff.logo_url.value;
  const logoAbsoluteUrl = rawLogo
    ? rawLogo.startsWith("http")
      ? rawLogo
      : `${baseUrl.replace(/\/$/, "")}${rawLogo}`
    : null;

  const primary = eff.primary_color.value || "#032149";
  const accent = eff.accent_color.value || "#0faec1";

  return {
    slug,
    name: tokens.brand || slug,
    primaryColor: primary,
    primaryDarkColor: shiftLightness(primary, -0.15),
    primaryLightColor: shiftLightness(primary, 0.15),
    accentColor: accent,
    accentDarkColor: shiftLightness(accent, -0.15),
    logoUrl: logoAbsoluteUrl,
    font: tokens.typography?.families?.heading?.family || "Inter",
    footerText: eff.footer_text.value || undefined,
  };
}

/** Shift lightness of a hex color by `pct` (-1..+1). Used so templates can
 *  build multi-stop gradients from the brand's two declared colors without
 *  the design-tokens needing to spell every shade. */
function shiftLightness(hex: string, pct: number): string {
  if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const adjust = (c: number) => {
    if (pct >= 0) return Math.round(c + (255 - c) * pct);
    return Math.round(c * (1 + pct));
  };
  const toHex = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
  return `#${toHex(adjust(r))}${toHex(adjust(g))}${toHex(adjust(b))}`;
}
