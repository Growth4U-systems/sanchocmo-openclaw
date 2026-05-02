"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  useAllCarouselTemplates,
  useEffectiveContentConfig,
} from "@/hooks/useContentConfig";
import { CarouselSetupEditor } from "@/components/content/setup/CarouselSetupEditor";

/**
 * Row resumen de "Carrusel · branding & plantillas" en
 * `Engine > Configuración`. Mismo patrón que el row de Canal de envío:
 * preview ligero (color swatches + estado de logo + número de plantillas
 * habilitadas) + botón Editar → abre un slide-over con todos los campos
 * editables (CarouselSetupEditor).
 */
export function CarouselSetupPanel({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const config = useEffectiveContentConfig(slug);
  const templatesQ = useAllCarouselTemplates(slug);

  const eff = config.data?.effective.carousel;
  const bb = config.data?.brand_book;
  const enabledCount = (templatesQ.data || []).filter((t) => t.enabled).length;

  const logoChip =
    bb?.logo_status === "present"
      ? <span style={{ color: "var(--sc-sage-500)", fontWeight: 700 }}>logo ✓</span>
      : bb?.logo_status === "missing-registered"
        ? <span style={{ color: "var(--sc-fg-muted)" }}>logo: cliente sin marca</span>
        : <span style={{ color: "var(--sc-rust-500)" }}>logo pendiente</span>;

  return (
    <>
      <div
        className="rounded-sc-md border-[2px] grid grid-cols-[36px_1fr_auto] gap-3 items-center px-4 py-3 mb-3"
        style={{
          background: "var(--sc-paper-3)",
          borderColor: "var(--sc-ink)",
          boxShadow: "var(--pop-xs)",
        }}
      >
        <span
          className="grid place-items-center w-9 h-9 rounded-md border-2 text-base"
          style={{ background: "var(--sc-paper-2)", borderColor: "var(--sc-ink)" }}
        >
          🎨
        </span>
        <div className="min-w-0">
          <div className="font-semibold text-sm" style={{ color: "var(--sc-ink)" }}>
            Carrusel · branding & plantillas
          </div>
          <div className="text-xs flex flex-wrap items-center gap-x-2 gap-y-0.5" style={{ color: "var(--sc-fg-muted)" }}>
            {eff?.primary_color.value && (
              <span className="inline-flex items-center gap-1">
                <span
                  className="inline-block w-3 h-3 rounded border"
                  style={{ background: eff.primary_color.value, borderColor: "var(--sc-ink)" }}
                />
                <code className="text-[10px]" style={{ color: "var(--sc-fg-muted)" }}>{eff.primary_color.value}</code>
              </span>
            )}
            {eff?.accent_color.value && (
              <span className="inline-flex items-center gap-1">
                <span
                  className="inline-block w-3 h-3 rounded border"
                  style={{ background: eff.accent_color.value, borderColor: "var(--sc-ink)" }}
                />
                <code className="text-[10px]" style={{ color: "var(--sc-fg-muted)" }}>{eff.accent_color.value}</code>
              </span>
            )}
            <span>·</span>
            {logoChip}
            <span>·</span>
            <span>{enabledCount} plantilla{enabledCount === 1 ? "" : "s"} activa{enabledCount === 1 ? "" : "s"}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="font-heading uppercase text-[11px] tracking-wider px-2.5 py-1 rounded border-2 sc-pop-hover"
          style={{
            background: "var(--sc-paper-3)",
            borderColor: "var(--sc-ink)",
            boxShadow: "var(--pop-xs)",
          }}
        >
          Editar →
        </button>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          className="!w-[min(96vw,820px)] !max-w-[96vw] overflow-y-auto overflow-x-hidden"
          side="right"
        >
          <SheetHeader className="sticky top-0 z-10 bg-popover border-b">
            <SheetTitle>🎨 Carrusel · branding & plantillas</SheetTitle>
          </SheetHeader>
          <div className="px-4 py-5">
            <CarouselSetupEditor slug={slug} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
