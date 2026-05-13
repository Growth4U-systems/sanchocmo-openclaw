import type { CarouselSlot } from "@/lib/carousel/types";
import type { FileTemplateMeta } from "@/lib/carousel/file-templates";

/**
 * Normalize a `meta.json` into the canonical FileTemplateMeta shape.
 *
 * The brand visual-generator skills currently emit meta.json with snake_case
 * keys and `slots` as an object keyed by slot id, while the rest of the
 * system expects camelCase fields and `slots` as an array. This parser
 * accepts either shape so the same files work on both sides.
 *
 * Tolerated input variations:
 *   - `template_id` ↔ `id`
 *   - `slides`      ↔ `slideCount`
 *   - `size: "1080x1350"` → width / height
 *   - `use_case`    ↔ `description`
 *   - `slots: { key: { per_slide, max_length, ... } }` → array form
 */
export function parseTemplateMeta(raw: unknown, idFallback?: string): FileTemplateMeta {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;

  const id = (typeof r.id === "string" && r.id) ||
             (typeof r.template_id === "string" && r.template_id) ||
             idFallback ||
             "unknown";

  const slideCount =
    typeof r.slideCount === "number" ? r.slideCount :
    typeof r.slides === "number" ? r.slides :
    1;

  let width = typeof r.width === "number" ? r.width : undefined;
  let height = typeof r.height === "number" ? r.height : undefined;
  if ((!width || !height) && typeof r.size === "string") {
    const m = r.size.match(/^\s*(\d+)\s*x\s*(\d+)\s*$/i);
    if (m) {
      width = parseInt(m[1], 10);
      height = parseInt(m[2], 10);
    }
  }

  const description =
    (typeof r.description === "string" && r.description) ||
    (typeof r.use_case === "string" && r.use_case) ||
    "";

  const channel = typeof r.channel === "string" ? r.channel : "linkedin";
  const name =
    (typeof r.name === "string" && r.name) ||
    (typeof r.template_id === "string" && r.template_id) ||
    id;

  const slots: CarouselSlot[] = normalizeSlots(r.slots);

  return {
    id,
    name,
    channel,
    description,
    slideCount,
    width: width ?? 1080,
    height: height ?? 1350,
    slots,
    preview: r.preview,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeSlots(input: any): CarouselSlot[] {
  if (Array.isArray(input)) {
    return input
      .filter((s) => s && typeof s === "object" && typeof s.key === "string")
      .map((s) => ({
        key: s.key,
        label: typeof s.label === "string" ? s.label : s.key,
        multiline: !!s.multiline,
        perSlide: !!(s.perSlide ?? s.per_slide),
        placeholder: typeof s.placeholder === "string" ? s.placeholder : undefined,
        maxLength: typeof (s.maxLength ?? s.max_length) === "number" ? (s.maxLength ?? s.max_length) : undefined,
      }));
  }
  if (input && typeof input === "object") {
    return Object.entries(input as Record<string, Record<string, unknown>>)
      .filter(([, def]) => def && typeof def === "object")
      // Skill-marked auto slots (e.g. slide_number) are populated by the
      // renderer itself — the user shouldn't see a form input for them.
      .filter(([, def]) => !(def as Record<string, unknown>).auto)
      .map(([key, def]) => {
        const d = def as Record<string, unknown>;
        const maxLen = d.maxLength ?? d.max_length;
        return {
          key,
          label: typeof d.label === "string" ? d.label : key,
          multiline: !!d.multiline,
          perSlide: !!(d.perSlide ?? d.per_slide),
          placeholder: typeof d.placeholder === "string" ? d.placeholder : undefined,
          maxLength: typeof maxLen === "number" ? maxLen : undefined,
        };
      });
  }
  return [];
}
