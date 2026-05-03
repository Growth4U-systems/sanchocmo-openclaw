import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import { getCarouselTemplate } from "@/lib/carousel/templates";
import { loadBrandContext } from "@/lib/carousel/brand-context";

/**
 * GET /api/content-engine/template-preview-html?slug=X&id=Y[&slide=N]
 *
 * Returns the *real* HTML the template would produce for slide `N` (default 0)
 * with placeholder slot values (taken from each slot's `placeholder` field
 * in `meta.json`, falling back to the slot label).
 *
 * The Setup UI loads this via an `<iframe>` scaled down with CSS transform —
 * cheaper than spinning up Playwright per preview, and shows the *exact*
 * thing the user is going to publish, not a CSS-only approximation.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const slug = req.query.slug as string;
  const id = req.query.id as string;
  const slideParam = req.query.slide as string | undefined;
  if (!slug || !id) return res.status(400).json({ error: "Missing slug or id" });

  const template = getCarouselTemplate(id, slug);
  if (!template) return res.status(404).json({ error: `Unknown template: ${id}` });

  const slideIndex = Math.max(0, Math.min(template.slideCount - 1, Number(slideParam ?? 0) || 0));
  const brand = loadBrandContext(slug);

  // Build placeholder slot values: prefer the slot's declared placeholder,
  // then fall back to the label. For per-slide slots, build an array sized
  // to the slideCount so every slide has something to render.
  const slots: Record<string, string> = {};
  const perSlide: Record<string, string[]> = {};
  for (const slot of template.slots) {
    const placeholder = slot.placeholder || slot.label || "";
    if (slot.perSlide) {
      perSlide[slot.key] = Array.from({ length: template.slideCount }, (_, i) =>
        template.slideCount > 1 ? `${placeholder} (slide ${i + 1})` : placeholder,
      );
    } else {
      slots[slot.key] = placeholder;
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
