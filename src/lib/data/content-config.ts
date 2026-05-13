import path from "path";
import { brandDir } from "@/lib/data/paths";
import { readJSON, writeJSON } from "@/lib/data/json-io";

/**
 * Per-brand Content Engine configuration. Lives at
 * `brand/{slug}/content/config.json`. Currently scopes:
 *   - image_generation: which provider/model the user wants by default and
 *     whether MC should ask each time.
 *
 * New sections (publishing defaults, copy-tone, etc.) can be added without
 * a migration: missing fields fall back to `getContentConfig`'s defaults.
 */

export type ImageGenMode = "ask" | "fixed";

/** Per-brand carousel customization. Overrides what `loadBrandContext`
 *  reads from `design-tokens.json` so a brand can ship a different look on
 *  social posts than on its website (common when the website palette is too
 *  busy for square cards). `null` on color overrides means "fall through to
 *  design-tokens.json"; `null` on enabled_templates means "all". */
export interface CarouselConfig {
  logo_url: string | null;
  footer_text: string | null;        // handle/CTA in slide footer
  primary_color: string | null;
  accent_color: string | null;
  enabled_templates: string[] | null;
}

export interface ContentConfig {
  image_generation: {
    mode: ImageGenMode;          // "ask" → show dropdown; "fixed" → use provider/model below
    provider: string | null;     // ImageProvider id ("nanobanana" | "replicate" | ...)
    model: string | null;        // canonical model id within that provider
  };
  carousel: CarouselConfig;
}

const DEFAULTS: ContentConfig = {
  image_generation: {
    mode: "ask",
    provider: null,
    model: null,
  },
  carousel: {
    logo_url: null,
    footer_text: null,
    primary_color: null,
    accent_color: null,
    enabled_templates: null,
  },
};

function configPath(slug: string): string {
  return path.join(brandDir(slug), "content", "config.json");
}

export function getContentConfig(slug: string): ContentConfig {
  const raw = readJSON<Partial<ContentConfig>>(configPath(slug), {});
  return {
    image_generation: {
      mode: raw.image_generation?.mode ?? DEFAULTS.image_generation.mode,
      provider: raw.image_generation?.provider ?? DEFAULTS.image_generation.provider,
      model: raw.image_generation?.model ?? DEFAULTS.image_generation.model,
    },
    carousel: {
      logo_url: raw.carousel?.logo_url ?? DEFAULTS.carousel.logo_url,
      footer_text: raw.carousel?.footer_text ?? DEFAULTS.carousel.footer_text,
      primary_color: raw.carousel?.primary_color ?? DEFAULTS.carousel.primary_color,
      accent_color: raw.carousel?.accent_color ?? DEFAULTS.carousel.accent_color,
      enabled_templates: raw.carousel?.enabled_templates ?? DEFAULTS.carousel.enabled_templates,
    },
  };
}

export function updateContentConfig(slug: string, patch: Partial<ContentConfig>): ContentConfig {
  const current = getContentConfig(slug);
  const next: ContentConfig = {
    image_generation: {
      ...current.image_generation,
      ...(patch.image_generation || {}),
    },
    carousel: {
      ...current.carousel,
      ...(patch.carousel || {}),
    },
  };
  writeJSON(configPath(slug), next);
  return next;
}
