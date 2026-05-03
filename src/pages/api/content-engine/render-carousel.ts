import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import { uploadToR2 } from "@/lib/upload-r2";
import { attachMediaToDraft, buildMediaKey } from "@/lib/publishing/media-helpers";
import { loadDraft } from "@/lib/data/drafts";
import { getCarouselTemplate } from "@/lib/carousel/templates";
import { renderHtmlToPng, renderSlidesToPdf } from "@/lib/carousel/render";
import { loadBrandContext } from "@/lib/carousel/brand-context";

/**
 * POST /api/content-engine/render-carousel
 *   body: { slug, ideaId, channel, templateId, slots, perSlide? }
 *
 * For each slide of the template we produce a PNG (used for in-app preview
 * and gallery thumbs). For multi-slide templates we also produce a single
 * combined PDF — that's the asset Metricool sends to LinkedIn so the post
 * renders as a swipeable carousel instead of an image gallery.
 *
 * All assets are uploaded to R2 and appended (in slide order, PDF first
 * for multi-slide templates) to the draft's `media[]`.
 */

interface Body {
  slug?: string;
  ideaId?: string;
  channel?: string;
  templateId?: string;
  slots?: Record<string, string>;
  perSlide?: Record<string, string[]>;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const { slug, ideaId, channel, templateId, slots, perSlide } = (req.body || {}) as Body;
  if (!slug || !ideaId || !channel || !templateId) {
    return res.status(400).json({ error: "Missing slug, ideaId, channel or templateId" });
  }
  if (!loadDraft(slug, ideaId, channel)) {
    return res.status(404).json({ error: "Draft not found" });
  }
  const template = getCarouselTemplate(templateId, slug);
  if (!template) return res.status(400).json({ error: `Unknown template: ${templateId}` });
  if (template.channel !== channel.toLowerCase()) {
    return res.status(400).json({
      error: `Template ${template.id} is for ${template.channel}, not ${channel}`,
    });
  }

  const brand = loadBrandContext(slug);
  const safeSlots = slots || {};
  const safePerSlide = perSlide || {};

  // Render every slide HTML up-front so we can both screenshot each one and
  // concat them into a PDF without re-running the template render fn.
  const slideHtmls: string[] = [];
  for (let i = 0; i < template.slideCount; i++) {
    slideHtmls.push(
      template.render({
        slots: safeSlots,
        perSlide: safePerSlide,
        slideIndex: i,
        totalSlides: template.slideCount,
        brand,
      }),
    );
  }

  const urls: string[] = [];
  let lastDraft = null;
  const isCarousel = template.slideCount > 1;
  const nowIso = new Date().toISOString();
  const carouselTimestamp = Date.now();

  // For carousels: PDF goes in media[] FIRST so the channel-preview can pick
  // the next item (the cover PNG) as the visual cover, and so the Metricool
  // provider's `find(type === "application/pdf")` resolves to it directly.
  if (isCarousel) {
    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await renderSlidesToPdf(slideHtmls, {
        width: template.width,
        height: template.height,
      });
    } catch (e) {
      return res.status(500).json({
        error: `PDF render failed: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
    const pdfKey = `brand/${slug}/content/drafts/${ideaId}/${channel}-${template.id}-${carouselTimestamp}.pdf`;
    const pdfUrl = await uploadToR2(pdfBuffer, pdfKey, "application/pdf");
    urls.push(pdfUrl);
    lastDraft = attachMediaToDraft(slug, ideaId, channel, {
      url: pdfUrl,
      type: "application/pdf",
      source: "ai-generated",
      prompt: `${template.name} · carrusel ${template.slideCount} slides`,
      model: `template:${template.id}`,
      aspect_ratio: `${template.width}:${template.height}`,
      created_at: nowIso,
    });
  }

  for (let i = 0; i < slideHtmls.length; i++) {
    let buffer: Buffer;
    try {
      buffer = await renderHtmlToPng(slideHtmls[i], {
        width: template.width,
        height: template.height,
      });
    } catch (e) {
      return res.status(500).json({
        error: `Render failed on slide ${i + 1}: ${e instanceof Error ? e.message : String(e)}`,
      });
    }

    const filename = isCarousel
      ? `${channel}-${template.id}-slide-${i + 1}`
      : `${channel}-${template.id}`;
    const key = buildMediaKey(slug, ideaId, channel, "png", i)
      .replace(/-\d+\.png$/, `-${filename}.png`);
    const publicUrl = await uploadToR2(buffer, key, "image/png");
    urls.push(publicUrl);

    lastDraft = attachMediaToDraft(slug, ideaId, channel, {
      url: publicUrl,
      type: "image/png",
      source: "ai-generated",
      prompt: `${template.name} · slide ${i + 1}/${template.slideCount}`,
      model: `template:${template.id}`,
      aspect_ratio: `${template.width}:${template.height}`,
      created_at: nowIso,
    });
  }

  return res.status(200).json({ ok: true, urls, draft: lastDraft });
}

export default withErrorHandler(handler);
