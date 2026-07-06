/**
 * Carousel templates render slides as HTML strings (one per slide). The
 * server takes that HTML, hands it to Playwright at a fixed viewport size,
 * and screenshots a PNG per slide. The PNGs are uploaded to R2 and attached
 * to the draft's `media[]` (in slide order).
 *
 * Adding a template = drop a TS file in `templates/` and register it in
 * `templates.ts`. No UI changes needed.
 */

export interface CarouselSlot {
  key: string;
  label: string;
  multiline?: boolean;
  perSlide?: boolean;       // collect one value per slide instead of one global value
  placeholder?: string;
  maxLength?: number;
}

export interface BrandContext {
  slug: string;
  name?: string;
  primaryColor?: string;       // CSS color
  primaryDarkColor?: string;   // ~15% darker than primary, for gradient stops
  primaryLightColor?: string;  // ~15% lighter than primary
  accentColor?: string;
  accentDarkColor?: string;    // ~15% darker than accent
  logoUrl?: string | null;
  font?: string;
  footerText?: string;         // handle/CTA shown in slide footer (e.g. "@growth4u · Growth Systems")
}

export interface RenderSlideInput {
  /** Global slot values keyed by slot.key (always-string for simplicity in MVP). */
  slots: Record<string, string>;
  /** When a slot has `perSlide: true`, the value for slide `slideIndex` is in `perSlide[slot.key][slideIndex]`. */
  perSlide: Record<string, string[]>;
  slideIndex: number;
  totalSlides: number;
  brand: BrandContext;
}

/** Hint the UI needs to render a CSS-only thumbnail in the picker. The
 *  picker maps these into a stylized div — no Playwright round-trip — so the
 *  user sees the *shape* of the template instantly.
 *
 *  This is intentionally lossy. The real rendering still happens via the
 *  template's `render()` HTML at publish time. */
export interface CarouselTemplatePreview {
  /** Aspect for the thumbnail. Defaults to template width/height ratio. */
  ratio?: number;
  /** "navy gradient" → rust stripe etc. Picked so the thumbnail reflects
   *  the template's dominant treatment. */
  variant: "gradient-navy" | "white-card" | "split-cover";
  /** Tiny lines of content stacked from top to bottom. The picker styles
   *  each according to its kind. */
  lines: Array<{
    kind: "badge" | "title" | "text" | "footer";
    /** Width as percentage 0-100 of the thumbnail. */
    width?: number;
  }>;
}

export interface CarouselTemplate {
  id: string;
  name: string;
  channel: string;          // "linkedin" | "instagram" | "twitter" | ...
  description: string;
  slideCount: number;
  width: number;            // px
  height: number;           // px
  slots: CarouselSlot[];
  /** Optional UI hint for the template picker. Cheap CSS-only thumbnail. */
  preview?: CarouselTemplatePreview;
  render(input: RenderSlideInput): string;  // returns full <html>...</html>
}
