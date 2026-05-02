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

  return {
    slug,
    name: tokens.brand || slug,
    primaryColor: eff.primary_color.value || undefined,
    accentColor: eff.accent_color.value || undefined,
    logoUrl: logoAbsoluteUrl,
    font: tokens.typography?.families?.heading?.family || "Inter",
    footerText: eff.footer_text.value || undefined,
  };
}
