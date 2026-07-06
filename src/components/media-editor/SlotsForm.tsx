"use client";

import { SlotInput } from "@/components/media-editor/SlotInput";
import type {
  TemplateMeta,
  TemplateMetaSlot,
} from "@/components/media-editor/useTemplateMeta";

interface SlotsFormProps {
  meta: TemplateMeta;
  grouped: { global: TemplateMetaSlot[]; perSlide: TemplateMetaSlot[] };
  slotValues: Record<string, string>;
  setSlotValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  perSlideValues: Record<string, string[]>;
  setPerSlideValues: React.Dispatch<
    React.SetStateAction<Record<string, string[]>>
  >;
  intro?: React.ReactNode;
  footer?: React.ReactNode;
}

/** Inner reusable form — no fetch, just renders the slot fields. Used by
 *  TemplateEditBody (Foundation authors testing slot layouts). */
export function SlotsForm({
  meta,
  grouped,
  slotValues,
  setSlotValues,
  perSlideValues,
  setPerSlideValues,
  intro,
  footer,
}: SlotsFormProps) {
  return (
    <>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {intro}

        {grouped.global.length > 0 && (
          <fieldset className="space-y-3">
            <legend className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Campos globales
            </legend>
            {grouped.global.map((slot) => (
              <SlotInput
                key={slot.key}
                slot={slot}
                value={slotValues[slot.key] || ""}
                onChange={(v) => setSlotValues((s) => ({ ...s, [slot.key]: v }))}
              />
            ))}
          </fieldset>
        )}

        {grouped.perSlide.length > 0 && meta.slideCount > 1 && (
          <fieldset className="space-y-3 pt-3 border-t border-[#E5E2DC] dark:border-[#313244]">
            <legend className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Por slide ({meta.slideCount})
            </legend>
            {Array.from({ length: meta.slideCount }).map((_, slideIdx) => (
              <div
                key={slideIdx}
                className="rounded-md border border-[#E5E2DC] dark:border-[#313244] p-2.5 space-y-2"
              >
                <div className="text-[10px] font-bold uppercase tracking-wider text-rust">
                  Slide {slideIdx + 1}
                  {slideIdx === 0
                    ? " · cover"
                    : slideIdx === meta.slideCount - 1
                      ? " · cta"
                      : " · body"}
                </div>
                {grouped.perSlide.map((slot) => (
                  <SlotInput
                    key={`${slot.key}-${slideIdx}`}
                    slot={slot}
                    value={perSlideValues[slot.key]?.[slideIdx] || ""}
                    onChange={(v) =>
                      setPerSlideValues((p) => {
                        const arr = [...(p[slot.key] || [])];
                        arr[slideIdx] = v;
                        return { ...p, [slot.key]: arr };
                      })
                    }
                  />
                ))}
              </div>
            ))}
          </fieldset>
        )}
      </div>
      {footer}
    </>
  );
}
