import { loadBrandTemplates } from "@/lib/carousel/file-templates";
import { getContentConfig } from "@/lib/data/content-config";
import type { CarouselTemplate } from "@/lib/carousel/types";

/**
 * Templates are file-backed and per-brand:
 *
 *   - Source of truth: `brand/{slug}/content/carousel-templates/{id}/`.
 *   - Bootstrap: `workspace-sancho/skills/_shared/carousel-templates/{id}/`
 *     (the seed). The first time a brand's loader runs it copies any missing
 *     templates from the seed to the brand directory. After that, the brand's
 *     copies are independent — edits never leak back to the seed.
 *
 * To add a new official template that every brand should get: drop the
 * directory in the seed. To customize one brand only: edit the brand's copy.
 *
 * `slug` is required because there are no brand-agnostic templates anymore.
 * Calling these without a slug returns an empty list.
 */
function resolveTemplates(slug?: string): CarouselTemplate[] {
  if (!slug) return [];
  return loadBrandTemplates(slug);
}

export function listCarouselTemplates(opts?: { slug?: string; channel?: string }): CarouselTemplate[] {
  const all = resolveTemplates(opts?.slug);
  const ch = opts?.channel?.toLowerCase();
  let filtered = ch ? all.filter((t) => t.channel === ch) : all;

  // Brand can opt-out of templates (or pick a curated subset) via config.
  // `null` means "all enabled" — that's the default.
  if (opts?.slug) {
    const enabled = getContentConfig(opts.slug).carousel.enabled_templates;
    if (enabled) filtered = filtered.filter((t) => enabled.includes(t.id));
  }
  return filtered;
}

export function getCarouselTemplate(id: string, slug?: string): CarouselTemplate | null {
  return resolveTemplates(slug).find((t) => t.id === id) ?? null;
}

/** Used by the Setup UI to show every template (even disabled ones) so the
 *  user can flip them on/off. Skips the per-brand `enabled_templates` filter
 *  but still resolves brand overrides (so a brand-authored template appears
 *  with its real name/preview). */
export function listAllCarouselTemplates(channel?: string, slug?: string): CarouselTemplate[] {
  const all = resolveTemplates(slug);
  if (!channel) return all;
  const ch = channel.toLowerCase();
  return all.filter((t) => t.channel === ch);
}
