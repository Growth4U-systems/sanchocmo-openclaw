import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import { getCarouselTemplate } from "@/lib/carousel/templates";
import { loadBrandContext } from "@/lib/carousel/brand-context";

/**
 * Render the real HTML the template would produce for a given slide.
 *
 *   GET  ?slug=X&id=Y[&slide=N|&file=slide-cover|...]
 *      → uses each slot's `placeholder` from meta.json. Used by the panel
 *        thumbnails (no slot data available client-side).
 *
 *   POST { slug, id, file?, slots, perSlide }
 *      → uses the slot values supplied in the body. Used by the live
 *        editor in Foundation > Visual Identity > template — every keystroke
 *        produces a fresh preview without persisting anything.
 *
 * Same code path otherwise: tokens like `{{slot.title}}`, `{{brand.primary}}`,
 * etc. get substituted, conditionals (`<!-- if:slot.x -->`) collapsed.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const slug = (req.query.slug || req.body?.slug) as string;
  const id = (req.query.id || req.body?.id) as string;
  const slideParam = (req.query.slide || req.body?.slide) as string | undefined;
  const fileParam = (req.query.file || req.body?.file) as string | undefined;
  if (!slug || !id) return res.status(400).json({ error: "Missing slug or id" });

  const template = getCarouselTemplate(id, slug);
  if (!template) return res.status(404).json({ error: `Unknown template: ${id}` });

  // Resolve slide index. Filename takes precedence over the explicit param.
  let slideIndex = Math.max(0, Math.min(template.slideCount - 1, Number(slideParam ?? 0) || 0));
  if (fileParam === "slide-cover") slideIndex = 0;
  else if (fileParam === "slide-cta") slideIndex = template.slideCount - 1;
  else if (fileParam === "slide-body") slideIndex = Math.min(1, template.slideCount - 1);
  const brand = loadBrandContext(slug);

  // POST-supplied slot values take precedence; otherwise we fill from each
  // slot's declared placeholder so the preview always renders something.
  const overrideSlots = (req.body?.slots ?? {}) as Record<string, string>;
  const overridePerSlide = (req.body?.perSlide ?? {}) as Record<string, string[]>;
  const slots: Record<string, string> = {};
  const perSlide: Record<string, string[]> = {};
  for (const slot of template.slots) {
    const placeholder = slot.placeholder || slot.label || "";
    if (slot.perSlide) {
      const incoming = overridePerSlide[slot.key];
      perSlide[slot.key] = Array.from({ length: template.slideCount }, (_, i) => {
        const override = incoming?.[i];
        if (override !== undefined && override !== "") return override;
        return template.slideCount > 1 ? `${placeholder} (slide ${i + 1})` : placeholder;
      });
    } else {
      const override = overrideSlots[slot.key];
      slots[slot.key] = override !== undefined && override !== "" ? override : placeholder;
    }
  }

  const html = template.render({
    slots,
    perSlide,
    slideIndex,
    totalSlides: template.slideCount,
    brand,
  });

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  // Cache for the lifetime of the dev session — preview is cheap and the
  // template HTML doesn't change without a redeploy or a brand re-author.
  res.setHeader("Cache-Control", "private, max-age=300");
  // Allow same-origin iframe embedding (default behavior, made explicit).
  res.setHeader("Content-Security-Policy", "frame-ancestors 'self'");
  return res.status(200).send(html);
}

export default withErrorHandler(handler);
