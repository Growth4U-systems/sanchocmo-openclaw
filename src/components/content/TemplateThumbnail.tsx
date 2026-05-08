"use client";

import { useMemo } from "react";
import type { CarouselTemplateInfo } from "@/hooks/useMedia";
import { TemplatePreview } from "@/components/media-editor/TemplatePreview";

interface TemplateThumbnailProps {
  template: CarouselTemplateInfo;
  slug: string;
  selected?: boolean;
  onSelect: () => void;
}

/** Card with a real iframe preview (placeholder values) for the picker.
 *  pointer-events:none on the iframe so the click goes to the wrapping
 *  button. Aspect ratio comes from the template's width/height. */
export function TemplateThumbnail({ template, slug, selected, onSelect }: TemplateThumbnailProps) {
  // Seed slot values with placeholders so the iframe shows a meaningful render.
  const { slots, perSlide } = useMemo(() => {
    const s: Record<string, string> = {};
    const p: Record<string, string[]> = {};
    for (const slot of template.slots ?? []) {
      const fallback = slot.placeholder || slot.label || "";
      if (slot.perSlide) {
        p[slot.key] = Array.from({ length: template.slideCount }, (_, i) =>
          template.slideCount > 1 ? `${fallback} (slide ${i + 1})` : fallback,
        );
      } else {
        s[slot.key] = fallback;
      }
    }
    return { slots: s, perSlide: p };
  }, [template]);

  const ratio = template.width / Math.max(template.height, 1);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`text-left rounded-md border-2 overflow-hidden transition-colors bg-white ${
        selected ? "border-rust" : "border-[#E8E2D9] hover:border-rust"
      }`}
    >
      <div
        className="relative w-full bg-[#F0EDE8] border-b border-[#E8E2D9] overflow-hidden"
        style={{ aspectRatio: `${ratio}` }}
      >
        <TemplatePreview
          slug={slug}
          templateId={template.id}
          fileKey="template"
          slots={slots}
          perSlide={perSlide}
          variant="thumbnail"
          title={template.name}
        />
      </div>
      <div className="p-3">
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="font-semibold text-sm text-[#2C3E50] truncate">{template.name}</span>
          <span className="text-[10px] bg-[#F1F2F4] text-[#5C6470] px-1.5 py-0.5 rounded shrink-0">
            {template.slideCount} slide{template.slideCount > 1 ? "s" : ""}
          </span>
        </div>
        <div className="text-xs text-muted-foreground line-clamp-2">{template.description}</div>
        <div className="text-[10px] text-muted-foreground mt-1 font-mono">
          {template.width}×{template.height}
        </div>
      </div>
    </button>
  );
}
