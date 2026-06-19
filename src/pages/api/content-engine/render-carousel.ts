import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import { uploadToR2 } from "@/lib/upload-r2";
import { attachMediaToDraft, buildMediaKey } from "@/lib/publishing/media-helpers";
import { loadDraft } from "@/lib/data/drafts";
import { getCarouselTemplate } from "@/lib/carousel/templates";
import { renderHtmlToPng, renderSlidesToPdf } from "@/lib/carousel/render";
import { renderCarouselViaOd } from "@/lib/carousel/render-od";
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

  // Anti-pattern detection — common mistake observed in the wild: the
  // caller flattens per-slide values into `slots` with positional keys
  // like `slide_1_title`, `slide_2_title`, `slide_3_text`, ... instead
  // of using the `perSlide` map. Returning a generic "key missing"
  // would force the agent to figure out the right shape on its own;
  // we recognize the shape and tell them exactly what to do.
  // Map from canonical per-slide key (e.g. "slide_title") to the list of
  // flat keys we saw in `slots` (e.g. ["slide_1_title", "slide_2_title"]).
  // The canonical key is what the caller should use in `perSlide`. We try
  // both the exact form (matches an actual perSlide-marked slot in the
  // template meta) and a `slide_<rest>` fallback.
  const declaredPerSlideKeys = new Set(
    template.slots.filter((s) => s.perSlide).map((s) => s.key),
  );
  const flattened = new Map<string, string[]>(); // canonicalKey → [found keys]
  for (const key of Object.keys(safeSlots)) {
    const m = key.match(/^slide[_-]?(\d+)[_-]?(.+)$/i);
    if (!m) continue;
    const rest = m[2];
    const guess = declaredPerSlideKeys.has(`slide_${rest}`)
      ? `slide_${rest}`
      : declaredPerSlideKeys.has(rest)
        ? rest
        : `slide_${rest}`;
    if (!flattened.has(guess)) flattened.set(guess, []);
    flattened.get(guess)!.push(key);
  }
  if (flattened.size > 0) {
    return res.status(400).json({
      error: `Anti-pattern detected: per-slide values flattened into "slots".`,
      details: [...flattened.entries()].map(([canonical, keys]) => {
        const preview = keys.slice(0, 3).join(", ") + (keys.length > 3 ? ", …" : "");
        return (
          `Found ${keys.length} keys in slots (${preview}) that look like per-slide ` +
          `values. Move them to ` +
          `perSlide["${canonical}"] = ["", val1, val2, …] with length ${template.slideCount}.`
        );
      }),
      hint:
        `"slots" is for GLOBAL values (one per template — e.g. cover_title, ` +
        `cta_headline). "perSlide" is for PER-SLIDE values (one array per slot ` +
        `with exactly ${template.slideCount} elements). Use "" for slides that ` +
        `don't apply (e.g. body-only slot has "" at index 0 / cover and last / CTA).`,
    });
  }

  // Validate perSlide against meta. Catches the common agent mistake of
  // forgetting to populate per_slide.<key> arrays for the body slides,
  // which silently renders frames with empty text and stores them in
  // media[]. We refuse early with an explicit error listing the missing
  // keys instead of producing blank PNGs.
  const perSlideSlots = template.slots.filter((s) => s.perSlide);
  const perSlideErrors: string[] = [];
  for (const slot of perSlideSlots) {
    const arr = safePerSlide[slot.key];
    if (!Array.isArray(arr)) {
      perSlideErrors.push(
        `Missing perSlide["${slot.key}"]: expected an array of length ${template.slideCount}.`,
      );
    } else if (arr.length !== template.slideCount) {
      perSlideErrors.push(
        `perSlide["${slot.key}"] has length ${arr.length}, expected ${template.slideCount}.`,
      );
    }
  }
  if (perSlideErrors.length > 0) {
    return res.status(400).json({
      error: `Invalid perSlide payload for template "${template.id}".`,
      details: perSlideErrors,
      hint:
        `Each slot with perSlide:true in the template meta needs an array ` +
        `of exactly ${template.slideCount} string values (one per slide). ` +
        `Use "" for slides that don't use the value (e.g. cover/CTA when ` +
        `the slot only applies to body slides). See ` +
        `_system/media-persistence-protocol.md and the content-image SKILL.`,
      expected: {
        perSlide: Object.fromEntries(
          perSlideSlots.map((s) => [s.key, `string[${template.slideCount}]`]),
        ),
      },
    });
  }

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

  // Backend switch (SAN-245). DEFAULT is "playwright" (render.ts) so nothing
  // changes until OD render capacity is confirmed on Staging (SAN-44). Set
  // CONTENT_RENDER_BACKEND=od on the daemon-equipped Staging environment to
  // route rendering through the Open Design daemon (which has its own Chromium)
  // instead of relying on Chromium being present in our Docker image — it isn't.
  // The OD path is NOT e2e-verifiable locally; see render-od.ts.
  const backend = process.env.CONTENT_RENDER_BACKEND ?? "playwright";
  if (backend === "od") {
    try {
      const result = await renderCarouselViaOd({
        slug,
        ideaId,
        channel,
        template,
        slots: safeSlots,
        perSlide: safePerSlide,
        brand,
        slideHtmls,
      });
      return res.status(200).json({ ok: true, urls: result.urls, draft: result.draft });
    } catch (e) {
      return res.status(502).json({
        error: `OD render failed: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  // ── Default backend: in-process Playwright (render.ts) ──────────────────
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
