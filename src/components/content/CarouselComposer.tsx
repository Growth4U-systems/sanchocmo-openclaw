"use client";

import { useEffect, useMemo, useState } from "react";
import {
  useCarouselTemplates,
  useRenderCarousel,
  type CarouselTemplateInfo,
} from "@/hooks/useMedia";

/**
 * Picker + slot form for carousel templates. Renders inline in the Media
 * editor when the user toggles to carousel mode. The endpoint does the
 * Playwright rendering and attaches each slide PNG to the draft's `media[]`.
 */
export function CarouselComposer({
  slug,
  ideaId,
  channel,
}: {
  slug: string;
  ideaId: string;
  channel: string;
}) {
  const { data: templates, isLoading } = useCarouselTemplates(channel);
  const render = useRenderCarousel();
  const [selectedId, setSelectedId] = useState<string>("");
  const [slots, setSlots] = useState<Record<string, string>>({});
  const [perSlide, setPerSlide] = useState<Record<string, string[]>>({});

  const selected = useMemo(
    () => templates?.find((t) => t.id === selectedId) ?? null,
    [templates, selectedId],
  );

  // Reset form when template changes.
  useEffect(() => {
    if (!selected) return;
    setSlots({});
    const initialPer: Record<string, string[]> = {};
    for (const slot of selected.slots) {
      if (slot.perSlide) initialPer[slot.key] = Array(selected.slideCount).fill("");
    }
    setPerSlide(initialPer);
  }, [selected]);

  if (isLoading) {
    return <div className="text-xs text-muted-foreground">Cargando plantillas...</div>;
  }
  if (!templates || templates.length === 0) {
    return (
      <div className="text-xs text-muted-foreground">
        No hay plantillas de carrusel para el canal <code>{channel}</code> todavía.
      </div>
    );
  }

  function handleRender() {
    if (!selected) return;
    render.mutate(
      { slug, ideaId, channel, templateId: selected.id, slots, perSlide },
      {
        onSuccess: () => {
          setSlots({});
          setPerSlide({});
          setSelectedId("");
        },
      },
    );
  }

  return (
    <div className="border border-[#E8E2D9] rounded-lg p-3 space-y-3 bg-[#FAFAF8]">
      {/* Template picker — gallery of cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {templates.map((t) => (
          <TemplateCard
            key={t.id}
            template={t}
            selected={t.id === selectedId}
            onSelect={() => setSelectedId(t.id)}
          />
        ))}
      </div>

      {/* Slot form */}
      {selected && (
        <div className="space-y-3 border-t border-[#E8E2D9] pt-3">
          <h4 className="text-xs uppercase tracking-wide text-muted-foreground">
            Datos · {selected.name}
          </h4>

          {/* Global slots */}
          {selected.slots.filter((s) => !s.perSlide).map((slot) => (
            <div key={slot.key}>
              <label className="block text-[11px] text-muted-foreground mb-0.5">
                {slot.label}
                {slot.maxLength && (
                  <span className="ml-1 text-[10px]">({(slots[slot.key]?.length || 0)}/{slot.maxLength})</span>
                )}
              </label>
              {slot.multiline ? (
                <textarea
                  rows={2}
                  maxLength={slot.maxLength}
                  value={slots[slot.key] || ""}
                  onChange={(e) => setSlots((s) => ({ ...s, [slot.key]: e.target.value }))}
                  placeholder={slot.placeholder}
                  className="w-full border border-[#E8E2D9] rounded-md px-2 py-1.5 text-sm bg-white focus:outline-none focus:border-rust resize-y"
                />
              ) : (
                <input
                  maxLength={slot.maxLength}
                  value={slots[slot.key] || ""}
                  onChange={(e) => setSlots((s) => ({ ...s, [slot.key]: e.target.value }))}
                  placeholder={slot.placeholder}
                  className="w-full border border-[#E8E2D9] rounded-md px-2 py-1.5 text-sm bg-white focus:outline-none focus:border-rust"
                />
              )}
            </div>
          ))}

          {/* Per-slide slots, grouped by slide */}
          {selected.slideCount > 1 && (
            <div className="space-y-3">
              {Array.from({ length: selected.slideCount }).map((_, i) => (
                <div key={i} className="border border-[#E8E2D9] rounded-md p-2 bg-white">
                  <div className="text-[11px] font-bold text-[#2C3E50] mb-1.5">
                    Slide {i + 1}/{selected.slideCount}
                  </div>
                  {selected.slots.filter((s) => s.perSlide).map((slot) => {
                    const value = perSlide[slot.key]?.[i] || "";
                    function set(v: string) {
                      setPerSlide((p) => {
                        const arr = [...(p[slot.key] || Array(selected!.slideCount).fill(""))];
                        arr[i] = v;
                        return { ...p, [slot.key]: arr };
                      });
                    }
                    return (
                      <div key={slot.key} className="mb-2 last:mb-0">
                        <label className="block text-[10px] text-muted-foreground mb-0.5">
                          {slot.label}
                        </label>
                        {slot.multiline ? (
                          <textarea
                            rows={2}
                            maxLength={slot.maxLength}
                            value={value}
                            onChange={(e) => set(e.target.value)}
                            placeholder={slot.placeholder}
                            className="w-full border border-[#E8E2D9] rounded-md px-2 py-1 text-sm bg-white focus:outline-none focus:border-rust resize-y"
                          />
                        ) : (
                          <input
                            maxLength={slot.maxLength}
                            value={value}
                            onChange={(e) => set(e.target.value)}
                            placeholder={slot.placeholder}
                            className="w-full border border-[#E8E2D9] rounded-md px-2 py-1 text-sm bg-white focus:outline-none focus:border-rust"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setSelectedId("")}
              className="text-xs px-3 py-1.5 bg-white border border-[#E8E2D9] rounded-md hover:border-[#2C3E50] transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleRender}
              disabled={render.isPending}
              className="text-xs px-3 py-1.5 bg-gradient-to-br from-[#6E4EF5] to-rust text-white rounded-md font-medium disabled:opacity-50"
            >
              {render.isPending
                ? `Renderizando ${selected.slideCount} slide${selected.slideCount > 1 ? "s" : ""}...`
                : `🎨 Generar ${selected.slideCount} slide${selected.slideCount > 1 ? "s" : ""}`}
            </button>
          </div>

          {render.isError && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {render.error.message}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TemplateCard({
  template,
  selected,
  onSelect,
}: {
  template: CarouselTemplateInfo;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`text-left p-3 rounded-md border-2 transition-colors ${
        selected ? "border-rust bg-[#FCEFE6]" : "border-[#E8E2D9] bg-white hover:border-rust"
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="font-semibold text-sm text-[#2C3E50]">{template.name}</span>
        <span className="text-[10px] bg-[#F1F2F4] text-[#5C6470] px-1.5 py-0.5 rounded">
          {template.slideCount} slide{template.slideCount > 1 ? "s" : ""}
        </span>
      </div>
      <div className="text-xs text-muted-foreground">{template.description}</div>
      <div className="text-[10px] text-muted-foreground mt-1 font-mono">
        {template.width}×{template.height}
      </div>
    </button>
  );
}
