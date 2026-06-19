/**
 * Carousel render via the Open Design (OD) daemon — SAN-245.
 *
 * ⚠️ GATED. This backend is selected only when `CONTENT_RENDER_BACKEND=od`.
 * The default backend stays `playwright` (`render.ts`) until OD capacity is
 * confirmed on Staging (SAN-44). This path CANNOT be e2e-verified locally: it
 * needs the hosted OD daemon (its own Chromium) + an OD-capacity green-light.
 *
 * WHY THIS EXISTS
 * ---------------
 * The in-image Playwright render (`render.ts` → `chromium.launch()`) is broken
 * in Staging because the Docker image never installs Chromium. Rather than add
 * Chromium to our image, we converge carousel rendering on the OD daemon that
 * already runs in Staging with its own Chromium. OD takes the template HTML +
 * the approved slot values, fills them VERBATIM, and returns a self-contained
 * artifact we export to a swipeable PDF and per-slide PNGs.
 *
 * INTERFACE
 * ---------
 * Mirrors what `render.ts` gives the carousel endpoint, but at a higher level:
 * `render.ts` exposes per-slide `renderHtmlToPng` + `renderSlidesToPdf` because
 * Playwright screenshots each slide locally. OD instead generates the WHOLE
 * carousel in one agentic pass, so the natural unit here is the full carousel.
 * `renderCarouselViaOd` returns the SAME `{ urls, draft }` the endpoint already
 * produces, so the endpoint's backend switch can branch and return early
 * without reshaping its response. `render.ts` is kept untouched as the dev
 * fallback.
 *
 * FIDELITY GATE
 * -------------
 * We pass the approved copy and instruct OD to fill the template VERBATIM. We
 * then assert that copy appears in the generated HTML. If the agent rewrote the
 * copy (drift), we THROW instead of publishing altered copy — fail-loud.
 */

import {
  odResolveProject,
  odChat,
  odExport,
  odListProjectFiles,
  odReadProjectFile,
  odReadProjectFileBinary,
  resolveOdConfig,
} from "@/lib/open-design/client";
import type { OdClientConfig } from "@/lib/open-design/types";
import { templateFileRelPath } from "@/lib/carousel/file-templates";
import { uploadToR2 } from "@/lib/upload-r2";
import { attachMediaToDraft } from "@/lib/publishing/media-helpers";
import type { CarouselTemplate, BrandContext } from "@/lib/carousel/types";
import type { Draft } from "@/lib/data/drafts";

export interface RenderCarouselViaOdParams {
  slug: string;
  ideaId: string;
  channel: string;
  template: CarouselTemplate;
  /** Global slot values (one per template). */
  slots: Record<string, string>;
  /** Per-slide slot values (one array of length slideCount per perSlide slot). */
  perSlide: Record<string, string[]>;
  brand: BrandContext;
  /** Pre-rendered slide HTML (the template's own `render()` output, one per
   *  slide). Passed so the fidelity gate can compare OD's output against the
   *  exact copy our template would have produced, and so we have a local
   *  fallback reference for the verbatim assertion. */
  slideHtmls: string[];
}

export interface RenderCarouselViaOdResult {
  /** Public R2 URLs in attach order: PDF first (for multi-slide), then PNGs. */
  urls: string[];
  /** The draft after the last `attachMediaToDraft`, mirroring render-carousel. */
  draft: Draft | null;
}

/** Plain-text snippets of the approved copy, used for the fidelity assertion.
 *  We collect every non-empty slot + per-slide value the carousel was approved
 *  with; these MUST survive verbatim into OD's HTML. */
function collectApprovedCopy(params: RenderCarouselViaOdParams): string[] {
  const out: string[] = [];
  for (const v of Object.values(params.slots)) {
    if (typeof v === "string" && v.trim()) out.push(v.trim());
  }
  for (const arr of Object.values(params.perSlide)) {
    if (!Array.isArray(arr)) continue;
    for (const v of arr) {
      if (typeof v === "string" && v.trim()) out.push(v.trim());
    }
  }
  return out;
}

/** Normalize whitespace + decode the few HTML entities our template escaper
 *  emits, so the verbatim check compares meaning, not encoding. We are checking
 *  for copy DRIFT (the agent rewriting the sentence), not for `&amp;` vs `&`. */
function normalizeForFidelity(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Build the deterministic, verbatim fill prompt. We do NOT ask OD to write
 * copy — the copy is already approved. We hand OD the template contract (meta)
 * plus the exact values and tell it to fill the template and stack the slides
 * into a single self-contained index.html, using only DESIGN.md tokens.
 */
function buildFillPrompt(params: RenderCarouselViaOdParams): string {
  const { template } = params;
  const meta = {
    id: template.id,
    name: template.name,
    channel: template.channel,
    slideCount: template.slideCount,
    width: template.width,
    height: template.height,
    slots: template.slots, // contract: key, label, perSlide, maxLength, …
  };
  const values = {
    slots: params.slots,
    perSlide: params.perSlide,
  };
  return [
    `You are filling an APPROVED carousel template with APPROVED copy. Do NOT`,
    `rewrite, paraphrase, translate, shorten, or "improve" any copy. Use every`,
    `value EXACTLY as given (verbatim), including punctuation and casing.`,
    ``,
    `Template contract (meta.json):`,
    "```json",
    JSON.stringify(meta, null, 2),
    "```",
    ``,
    `Values to place into the template:`,
    `- "slots" are GLOBAL (one value per template, keyed by slot key).`,
    `- "perSlide" are PER-SLIDE arrays (index i = slide i, length ${template.slideCount}).`,
    "```json",
    JSON.stringify(values, null, 2),
    "```",
    ``,
    `Output requirements:`,
    `1. A SINGLE self-contained index.html with all ${template.slideCount} slides`,
    `   stacked vertically, each sized exactly ${template.width}×${template.height}px.`,
    `2. Use ONLY DESIGN.md tokens (colors, type, spacing) — no external assets,`,
    `   no remote images. Inline SVG / data: URIs / CSS gradients only.`,
    `3. Add a stable \`data-od-id\` to each slide's root element.`,
    `4. Place the copy VERBATIM. If a value would overflow, adjust layout/size`,
    `   — never the text.`,
  ].join("\n");
}

/**
 * Render a carousel through the OD daemon and attach the resulting assets to
 * the draft. Returns the same `{ urls, draft }` shape as the Playwright path.
 *
 * Flow:
 *   1. Resolve the OD project for this brand's template folder.
 *   2. Chat (SSE) with a deterministic verbatim fill prompt → artifactId.
 *   3. Fidelity gate: assert approved copy appears verbatim in the artifact HTML.
 *   4. Export PDF (swipeable carousel) + recover per-slide PNGs.
 *   5. Upload everything to R2 and attach to the draft (PDF first for carousels).
 */
export async function renderCarouselViaOd(
  params: RenderCarouselViaOdParams,
  config: OdClientConfig = resolveOdConfig(),
): Promise<RenderCarouselViaOdResult> {
  const { slug, ideaId, channel, template } = params;

  // 1. Resolve the OD project for THIS template's folder. The template files
  //    (meta.json + slide-*.html + DESIGN.md tokens) live under the brand's
  //    visual-identity pillar, which is exactly the scope we register with OD.
  //    `templateFileRelPath(id, "")` → "brand-book/visual-identity/templates/<id>".
  const scope = templateFileRelPath(template.id, "").replace(/\/$/, "");
  const { projectId } = await odResolveProject(slug, scope, config);

  // 2. Generate the carousel in one agentic pass. We pass the template contract
  //    via `context.template` so OD's validator routes to html-to-image checks
  //    (see extractStrategyHint in client.ts), and we keep the prompt verbatim.
  const prompt = buildFillPrompt(params);
  const events = await odChat(
    {
      projectId,
      designSystemId: slug,
      prompt,
      context: {
        brandSlug: slug,
        template: {
          id: template.id,
          generation_strategy: "html-to-image",
          output_format: "png",
        },
        // The exact values, also in context, so the model has them structured
        // even if it summarizes the prompt body.
        slots: params.slots,
        perSlide: params.perSlide,
      },
    },
    config,
  );

  let artifactId: string | undefined;
  let errorMessage: string | undefined;
  for await (const event of events) {
    if (event.type === "artifact_created") artifactId = event.artifactId;
    else if (event.type === "done") artifactId = event.artifactId ?? artifactId;
    else if (event.type === "error") errorMessage = event.message;
  }
  if (errorMessage) {
    throw new Error(`OD carousel generation failed: ${errorMessage}`);
  }
  if (!artifactId) {
    throw new Error("OD carousel generation finished without an artifactId");
  }

  // 3. FIDELITY GATE — assert the approved copy survived verbatim. If OD
  //    rewrote the copy we throw rather than publish altered copy (fail-loud).
  const files = await odListProjectFiles(projectId, config);
  const htmlFile =
    files.find((f) => f.type === "file" && f.path.endsWith("index.html")) ??
    files.find((f) => f.type === "file" && f.path.endsWith(".html"));
  if (!htmlFile) {
    throw new Error("OD artifact has no HTML file — cannot verify fidelity");
  }
  const html = await odReadProjectFile(projectId, htmlFile.path, config);
  if (!html) {
    throw new Error(`Could not read OD artifact HTML at ${htmlFile.path}`);
  }
  const haystack = normalizeForFidelity(html);
  const missing = collectApprovedCopy(params).filter(
    (snippet) => !haystack.includes(normalizeForFidelity(snippet)),
  );
  if (missing.length > 0) {
    throw new Error(
      `Fidelity gate failed: ${missing.length} approved copy value(s) are not ` +
        `present verbatim in the OD artifact — the agent likely rewrote copy. ` +
        `Refusing to publish altered copy. Missing (first 3): ` +
        missing.slice(0, 3).map((m) => JSON.stringify(m.slice(0, 60))).join(", "),
    );
  }

  // 4. Export the swipeable PDF, then recover the per-slide PNGs OD rendered.
  //
  //    ⚠️ SCOPING (SAN-245). OD projects are REUSED per template folder — the
  //    resolve maps slug+template → a PERSISTENT projectId, so the project dir
  //    can already contain stale `.pdf`/`.png` files from PRIOR exports plus the
  //    template's own source/thumbnail PNGs. Picking "the first PDF + every PNG"
  //    would wrongly attach those to THIS draft. We scope to the assets THIS
  //    export produced with two independent guards used together:
  //
  //      (b) FRESHNESS — `OdProjectFile.mtime` (epoch ms) lets us keep only
  //          files written at/after `exportStartedAt`. We capture that BEFORE
  //          `odExport`. `mtime` is optional in the daemon payload, so files
  //          lacking it are treated as "unknown age" and kept as candidates.
  //      (c) EXACT COUNT — independent of (b): a carousel MUST yield exactly
  //          `slideCount` PNGs + exactly 1 PDF; a single MUST yield exactly 1
  //          PNG + 0 PDFs. A mismatch means stale residue leaked in (or the
  //          export under-produced) → we THROW (fail-loud) rather than attach a
  //          wrong set. This is the gate that catches what (b) can't.
  //
  //    `odExport` returns only `{ ok, path? }` (at most ONE path, the PDF
  //    destination), not the PNG set, so strategy (a) can't scope all assets on
  //    its own — we rely on (b)+(c).
  //
  //    RESIDUAL RISK: if two exports of the SAME template land within the same
  //    coarse mtime tick AND both leave the same count, (b)+(c) can't tell them
  //    apart by metadata alone. That can only be confirmed on Staging e2e (this
  //    path needs the hosted OD daemon). Until then this is the most specific
  //    scoping the OD API exposes.
  const isCarousel = template.slideCount > 1;
  const expectedPngs = template.slideCount;
  const expectedPdfs = isCarousel ? 1 : 0;

  // Small backward tolerance: guards against coarse mtime granularity / minor
  // clock skew between this process and the daemon's filesystem. Wide enough to
  // never drop a file the export just wrote, narrow enough to exclude older runs.
  const MTIME_TOLERANCE_MS = 5_000;
  const exportStartedAt = Date.now() - MTIME_TOLERANCE_MS;

  await odExport({ artifactId, format: "pdf" }, config);

  // Re-list after export so the PDF/PNGs the daemon just wrote are visible.
  const afterExport = await odListProjectFiles(projectId, config);

  // (b) Freshness filter. Keep files written at/after the export started; keep
  // files with an unknown mtime (the count assertion below still guards those).
  const isFresh = (f: { mtime?: number }): boolean =>
    typeof f.mtime !== "number" || f.mtime >= exportStartedAt;

  const freshPdfs = afterExport.filter(
    (f) => f.type === "file" && f.path.toLowerCase().endsWith(".pdf") && isFresh(f),
  );
  const freshPngs = afterExport
    .filter(
      (f) => f.type === "file" && f.path.toLowerCase().endsWith(".png") && isFresh(f),
    )
    // Stable order so slide-1, slide-2, … attach in sequence. OD typically
    // names them with a numeric suffix; lexical sort with numeric awareness.
    .sort((a, b) =>
      a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: "base" }),
    );

  // (c) EXACT-COUNT assertions — fail-loud. These run on the freshness-scoped
  // set, so they catch both stale residue (too many) and a short export (too
  // few). Never silently attach a wrong set.
  if (freshPngs.length !== expectedPngs) {
    throw new Error(
      `OD export PNG count mismatch: expected exactly ${expectedPngs} ` +
        `(template "${template.id}" slideCount=${template.slideCount}) but found ` +
        `${freshPngs.length} fresh PNG(s) in project ${projectId}. Refusing to ` +
        `attach a wrong asset set (stale exports or template source files may ` +
        `be leaking in). Fresh PNGs: ${freshPngs.map((f) => f.path).join(", ") || "(none)"}`,
    );
  }
  if (freshPdfs.length !== expectedPdfs) {
    throw new Error(
      `OD export PDF count mismatch: expected exactly ${expectedPdfs} ` +
        `(${isCarousel ? "multi-slide carousel needs the swipeable PDF" : "single image needs no PDF"}) ` +
        `but found ${freshPdfs.length} fresh PDF(s) in project ${projectId}. ` +
        `Refusing to attach a wrong asset set. Fresh PDFs: ` +
        `${freshPdfs.map((f) => f.path).join(", ") || "(none)"}`,
    );
  }

  const pdfFile = isCarousel ? freshPdfs[0] : undefined;
  const pngFiles = freshPngs;

  const urls: string[] = [];
  let lastDraft: Draft | null = null;
  const nowIso = new Date().toISOString();
  const ts = Date.now();

  // PDF first so the channel-preview cover-picks the next item (cover PNG) and
  // the Metricool provider's `find(type === "application/pdf")` resolves to it.
  if (isCarousel && pdfFile) {
    const pdfBuffer = await odReadProjectFileBinary(projectId, pdfFile.path, config);
    const pdfKey = `brand/${slug}/content/drafts/${ideaId}/${channel}-${template.id}-${ts}.pdf`;
    const pdfUrl = await uploadToR2(pdfBuffer, pdfKey, "application/pdf");
    urls.push(pdfUrl);
    lastDraft = attachMediaToDraft(slug, ideaId, channel, {
      url: pdfUrl,
      type: "application/pdf",
      source: "ai-generated",
      prompt: `${template.name} · carrusel ${template.slideCount} slides (OD)`,
      model: `template:${template.id}:od`,
      aspect_ratio: `${template.width}:${template.height}`,
      created_at: nowIso,
    });
  }

  for (let i = 0; i < pngFiles.length; i++) {
    const pngBuffer = await odReadProjectFileBinary(projectId, pngFiles[i].path, config);
    const filename = isCarousel
      ? `${channel}-${template.id}-slide-${i + 1}`
      : `${channel}-${template.id}`;
    const key = `brand/${slug}/content/drafts/${ideaId}/${filename}-${ts}.png`;
    const pngUrl = await uploadToR2(pngBuffer, key, "image/png");
    urls.push(pngUrl);
    lastDraft = attachMediaToDraft(slug, ideaId, channel, {
      url: pngUrl,
      type: "image/png",
      source: "ai-generated",
      prompt: `${template.name} · slide ${i + 1}/${template.slideCount} (OD)`,
      model: `template:${template.id}:od`,
      aspect_ratio: `${template.width}:${template.height}`,
      created_at: nowIso,
    });
  }

  return { urls, draft: lastDraft };
}
