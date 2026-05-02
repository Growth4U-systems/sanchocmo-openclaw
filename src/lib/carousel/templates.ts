import { linkedinQuoteTemplate } from "@/lib/carousel/templates/linkedin-quote";
import { linkedin9SlideTemplate } from "@/lib/carousel/templates/linkedin-9-slide";
import { instagram3SlideTemplate } from "@/lib/carousel/templates/instagram-3-slide";
import { getContentConfig } from "@/lib/data/content-config";
import type { CarouselTemplate } from "@/lib/carousel/types";

/**
 * Built-in template library. To add a template, drop a TS file in
 * `templates/` exporting a `CarouselTemplate` and register it here. Per-brand
 * customization (logo, colors, enabled subset) is layered on top via
 * `brand/{slug}/content/config.json` — not by editing this list.
 */
const ALL_TEMPLATES: CarouselTemplate[] = [
  linkedinQuoteTemplate,
  linkedin9SlideTemplate,
  instagram3SlideTemplate,
];

export function listCarouselTemplates(opts?: { slug?: string; channel?: string }): CarouselTemplate[] {
  const ch = opts?.channel?.toLowerCase();
  let filtered = ch ? ALL_TEMPLATES.filter((t) => t.channel === ch) : ALL_TEMPLATES;

  // Brand can opt-out of templates (or pick a curated subset) via config.
  // `null` means "all enabled" — that's the default.
  if (opts?.slug) {
    const enabled = getContentConfig(opts.slug).carousel.enabled_templates;
    if (enabled) filtered = filtered.filter((t) => enabled.includes(t.id));
  }
  return filtered;
}

export function getCarouselTemplate(id: string): CarouselTemplate | null {
  return ALL_TEMPLATES.find((t) => t.id === id) ?? null;
}

/** Used by the Setup UI to show every template (even disabled ones) so the
 *  user can flip them on/off. Skips the per-brand filter. */
export function listAllCarouselTemplates(channel?: string): CarouselTemplate[] {
  if (!channel) return ALL_TEMPLATES;
  const ch = channel.toLowerCase();
  return ALL_TEMPLATES.filter((t) => t.channel === ch);
}
