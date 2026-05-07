import fs from "fs";
import path from "path";
import { brandDir } from "@/lib/data/paths";
import { wrapHtmlDoc } from "@/lib/carousel/render";
import { parseTemplateMeta } from "@/lib/carousel/parse-meta";
import type { CarouselTemplate, RenderSlideInput } from "@/lib/carousel/types";

/**
 * Loader for file-backed carousel templates living under
 * `brand/{slug}/content/carousel-templates/{id}/`.
 *
 * Each template directory is one of two shapes:
 *
 *   Single-slide:
 *     meta.json
 *     template.html
 *
 *   Multi-slide:
 *     meta.json                  (declares slideCount)
 *     slide-cover.html
 *     slide-body.html            (rendered for slides 1..N-2)
 *     slide-cta.html
 *     slide-{n}.html             (optional: explicit override per slide index)
 *
 * `template.html` and `slide-*.html` are pure HTML with `{{variable}}`
 * substitution — Mustache-light, no logic. Available variables:
 *
 *   - {{slot.<key>}}         from `slots[<key>]`
 *   - {{per_slide.<key>}}    from `perSlide[<key>][slideIndex]`
 *   - {{slide_index}}        0-based
 *   - {{slide_number}}       1-based
 *   - {{slide_number_padded}} "01", "02", …
 *   - {{total_slides}}
 *   - {{brand.name|slug|primary|accent|logo|footer}}
 *
 * The brand's `[brand]-visual-generator` skill is what *writes* these files
 * — see workspace-sancho/skills/{brand}-visual-generator/SKILL.md for the
 * design loop. Mission Control just consumes them.
 */

export interface FileTemplateMeta {
  id: string;
  name: string;
  channel: string;
  description: string;
  slideCount: number;
  width: number;
  height: number;
  slots: CarouselTemplate["slots"];
  preview?: CarouselTemplate["preview"];
}

/** Templates live INSIDE the visual-identity pillar — they're a sub-output
 *  of that pillar, produced by the brand's `[brand]-visual-generator` skill
 *  during Foundation Layer 5. No system-wide defaults exist; if a brand
 *  hasn't completed visual-identity, no templates show up.
 */
const TEMPLATES_REL = path.join("brand-book", "visual-identity", "templates");

function templatesDir(slug: string): string {
  return path.join(brandDir(slug), TEMPLATES_REL);
}

/** List ids of every template directory under `brand/{slug}/content/carousel-templates/`. */
function listTemplateIds(slug: string): string[] {
  const root = templatesDir(slug);
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => e.name);
}

function readMeta(slug: string, id: string): FileTemplateMeta | null {
  const metaPath = path.join(templatesDir(slug), id, "meta.json");
  if (!fs.existsSync(metaPath)) return null;
  try {
    // Brand visual-generator skills emit either the canonical shape (slots
    // as array, camelCase) or a snake_case object form. parseTemplateMeta
    // accepts both and returns the canonical shape.
    return parseTemplateMeta(JSON.parse(fs.readFileSync(metaPath, "utf-8")), id);
  } catch {
    return null;
  }
}

function readSlideHtml(slug: string, id: string, slideIndex: number, totalSlides: number): string | null {
  const dir = path.join(templatesDir(slug), id);

  // 1. Explicit per-slide override always wins.
  const explicit = path.join(dir, `slide-${slideIndex + 1}.html`);
  if (fs.existsSync(explicit)) return fs.readFileSync(explicit, "utf-8");

  // 2. Multi-slide files: cover for first, cta for last, body for the rest.
  if (totalSlides > 1) {
    const role = slideIndex === 0 ? "cover" : slideIndex === totalSlides - 1 ? "cta" : "body";
    const rolePath = path.join(dir, `slide-${role}.html`);
    if (fs.existsSync(rolePath)) return fs.readFileSync(rolePath, "utf-8");
  }

  // 3. Single-slide: just `template.html`.
  const single = path.join(dir, "template.html");
  if (fs.existsSync(single)) return fs.readFileSync(single, "utf-8");

  return null;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!),
  );
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Build the {{var}} → value map for a given slide render. */
function buildSubstitutions(
  meta: FileTemplateMeta,
  input: RenderSlideInput,
): Record<string, string> {
  const out: Record<string, string> = {
    "slide_index": String(input.slideIndex),
    "slide_number": String(input.slideIndex + 1),
    "slide_number_padded": pad2(input.slideIndex + 1),
    "total_slides": String(input.totalSlides),
    "brand.name": input.brand.name || input.brand.slug,
    "brand.slug": input.brand.slug,
    "brand.primary": input.brand.primaryColor || "#032149",
    "brand.primary_dark": input.brand.primaryDarkColor || "#021530",
    "brand.primary_light": input.brand.primaryLightColor || "#1a3a6e",
    "brand.accent": input.brand.accentColor || "#0faec1",
    "brand.accent_dark": input.brand.accentDarkColor || "#0c8e9e",
    "brand.logo": input.brand.logoUrl || "",
    "brand.footer": input.brand.footerText || `@${input.brand.slug}`,
    "brand.font": input.brand.font || "Inter",
  };

  for (const slot of meta.slots) {
    if (slot.perSlide) {
      const value = input.perSlide[slot.key]?.[input.slideIndex] ?? "";
      out[`per_slide.${slot.key}`] = value;
      out[`slot.${slot.key}`] = value;  // alias so single-slide-style refs still work
    } else {
      out[`slot.${slot.key}`] = input.slots[slot.key] ?? "";
    }
  }
  return out;
}

/** Strip conditional blocks of the form
 *    <!-- if:slot.foo -->...<!-- /if:slot.foo -->
 *  whose key resolves to an empty string. Used so templates can embed
 *  optional regions (a character image, a sub-heading) without resorting to
 *  JavaScript or weird CSS. Nesting is NOT supported — the syntax is
 *  intentionally flat to keep the loader simple. */
function preProcessConditionals(html: string, vars: Record<string, string>): string {
  return html.replace(
    /<!--\s*if:([a-zA-Z0-9_.]+)\s*-->([\s\S]*?)<!--\s*\/if:\1\s*-->/g,
    (_full, key: string, inner: string) => {
      const value = vars[key];
      return value && value.trim().length > 0 ? inner : "";
    },
  );
}

/** Substitute `{{key}}` placeholders. Defaults to HTML-escaping every value
 *  to keep templates safe against slot content with `<`, `&`, etc. For URLs
 *  used in `src`/`href` attributes, prefer the `{{key|attr}}` modifier — it
 *  uses the looser attribute-safe escape (only `"`/`'`/`<` get escaped, `&`
 *  passes through so query params don't break). */
function applySubstitutions(html: string, vars: Record<string, string>): string {
  return html.replace(/\{\{\s*([a-zA-Z0-9_.]+)(\s*\|\s*([a-z]+))?\s*\}\}/g, (full, key: string, _modBlock, mod?: string) => {
    if (!(key in vars)) return full;  // leave unknown placeholders intact
    const v = vars[key];
    if (mod === "raw") return v;
    if (mod === "attr") return v.replace(/[<"']/g, (c) => ({ "<": "&lt;", '"': "&quot;", "'": "&#39;" }[c]!));
    return escapeHtml(v);
  });
}

/** Wrap the resolved fragment in the standard HTML doc (Inter font etc.) so
 *  `renderHtmlToPng` / `renderSlidesToPdf` can render it. */
function wrap(html: string): string {
  // Heuristic: if the author already wrote a full document, leave it alone.
  if (/<\s*html[^>]*>/i.test(html)) return html;
  return wrapHtmlDoc(html);
}

/** Build a CarouselTemplate from a directory, compatible with the in-code
 *  template interface so the rest of the system doesn't need to branch. */
function buildTemplate(slug: string, meta: FileTemplateMeta): CarouselTemplate {
  return {
    id: meta.id,
    name: meta.name,
    channel: meta.channel,
    description: meta.description,
    slideCount: meta.slideCount,
    width: meta.width,
    height: meta.height,
    slots: meta.slots,
    preview: meta.preview,
    render(input) {
      const html = readSlideHtml(slug, meta.id, input.slideIndex, input.totalSlides);
      if (!html) {
        return wrapHtmlDoc(
          `<div style="padding:40px;color:red;font-family:monospace">
            Missing template files for ${meta.id} (slide ${input.slideIndex + 1}/${input.totalSlides}).
            Expected one of: slide-${input.slideIndex + 1}.html, slide-cover/body/cta.html, template.html
          </div>`,
        );
      }
      const vars = buildSubstitutions(meta, input);
      const stripped = preProcessConditionals(html, vars);
      return wrap(applySubstitutions(stripped, vars));
    },
  };
}

/** Load every template the brand's `[brand]-visual-generator` skill has
 *  produced under `brand-book/visual-identity/templates/`. Returns empty if
 *  the brand hasn't completed visual-identity yet — UI shows an empty state
 *  pointing to the skill. */
export function loadBrandTemplates(slug: string): CarouselTemplate[] {
  return listTemplateIds(slug)
    .map((id) => readMeta(slug, id))
    .filter((m): m is FileTemplateMeta => !!m)
    .map((meta) => buildTemplate(slug, meta));
}

/** Brand-relative path to a template file (template.html, meta.json,
 *  slide-cover.html, …). Used by the UI to deep-link into the Foundation
 *  doc-tree where the file actually lives. */
export function templateFileRelPath(templateId: string, fileName = "template.html"): string {
  return path.join(TEMPLATES_REL, templateId, fileName);
}
