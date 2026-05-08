"use client";

import { useRenderCarousel } from "@/hooks/useMedia";
import { SlotInput } from "@/components/media-editor/SlotInput";
import {
  useTemplateMeta,
  type TemplateMeta,
  type TemplateMetaSlot,
} from "@/components/media-editor/useTemplateMeta";
import { TemplatePreview } from "@/components/media-editor/TemplatePreview";

interface TemplateRenderBodyProps {
  slug: string;
  ideaId: string;
  channel: string;
  templateId: string;
  onClose: () => void;
}

/** Body completo (sidebar + preview) para el modo template-render: aplica
 *  una plantilla a un draft. Renderiza PNG/PDF y persist a media[]. */
export function TemplateRenderBody({
  slug,
  ideaId,
  channel,
  templateId,
  onClose,
}: TemplateRenderBodyProps) {
  const {
    meta,
    metaError,
    slotValues,
    setSlotValues,
    perSlideValues,
    setPerSlideValues,
    grouped,
  } = useTemplateMeta(slug, templateId);

  const render = useRenderCarousel();

  if (metaError) {
    return (
      <div className="p-6 text-sm text-red-600 bg-red-50 border-2 border-red-200 rounded-lg m-4">
        Error cargando meta.json del template: {metaError}
      </div>
    );
  }
  if (!meta) {
    return <p className="text-sm text-muted-foreground p-6">Cargando plantilla...</p>;
  }

  function handleRender() {
    if (!meta) return;
    render.mutate(
      { slug, ideaId, channel, templateId, slots: slotValues, perSlide: perSlideValues },
      { onSuccess: () => onClose() },
    );
  }

  return (
    <div className="grid grid-cols-[420px_1fr] flex-1 min-h-0">
      <div className="flex flex-col min-h-0 border-r border-[#E5E2DC] dark:border-[#313244] bg-white dark:bg-[#1E1E2E]">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[#E5E2DC] dark:border-[#313244] bg-[#FAFAF8] dark:bg-[#181825]">
          <span className="text-[11px] font-bold uppercase tracking-wider text-rust">
            ✏️ Campos
          </span>
          <span className="ml-auto text-[10px] text-muted-foreground">
            {meta.width}×{meta.height} · {meta.slideCount} slide{meta.slideCount > 1 ? "s" : ""}
          </span>
        </div>
        <SlotsForm
          meta={meta}
          grouped={grouped}
          slotValues={slotValues}
          setSlotValues={setSlotValues}
          perSlideValues={perSlideValues}
          setPerSlideValues={setPerSlideValues}
          intro={
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Rellena los campos. La preview se actualiza en directo. Al darle a
              <strong> Generar</strong>, se renderiza un PNG/PDF y se adjunta al
              draft.
            </p>
          }
          footer={
            <div className="px-3 py-3 border-t border-[#E5E2DC] dark:border-[#313244] bg-[#FAFAF8] dark:bg-[#181825] space-y-2">
              <button
                type="button"
                onClick={handleRender}
                disabled={render.isPending}
                className="w-full px-3 py-2 text-[12px] font-bold rounded-md bg-gradient-to-br from-[#6E4EF5] to-rust text-white disabled:opacity-50"
              >
                {render.isPending
                  ? `Renderizando ${meta.slideCount} slide${meta.slideCount > 1 ? "s" : ""}...`
                  : `✨ Generar y guardar en draft`}
              </button>
              {render.isError && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                  {render.error.message}
                </div>
              )}
            </div>
          }
        />
      </div>

      <TemplatePreview
        slug={slug}
        templateId={templateId}
        fileKey="template"
        slots={slotValues}
        perSlide={perSlideValues}
        title={meta.name}
      />
    </div>
  );
}

/** Inner reusable form — no fetch, just renders the slot fields. Exported so
 *  TemplateEditBody can reuse the same layout. */
export function SlotsForm({
  meta,
  grouped,
  slotValues,
  setSlotValues,
  perSlideValues,
  setPerSlideValues,
  footer,
  intro,
}: {
  meta: TemplateMeta;
  grouped: { global: TemplateMetaSlot[]; perSlide: TemplateMetaSlot[] };
  slotValues: Record<string, string>;
  setSlotValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  perSlideValues: Record<string, string[]>;
  setPerSlideValues: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  footer?: React.ReactNode;
  intro?: React.ReactNode;
}) {
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
