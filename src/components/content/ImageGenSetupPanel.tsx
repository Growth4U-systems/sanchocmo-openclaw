"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useImageProviders } from "@/hooks/useContentConfig";
import { ImageGenSetupEditor } from "@/components/content/setup/ImageGenSetupEditor";

/**
 * Row resumen de "Generación de imagen" en `Engine > Configuración`. Sigue
 * el patrón del row "Canal de envío" en ConfigurationPipeline: icono +
 * resumen de un vistazo + botón Editar que abre un slide-over con el
 * contenido editable real.
 *
 * No renderiza el editor inline — la edición ocurre dentro del Sheet.
 */
export function ImageGenSetupPanel({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const { data } = useImageProviders(slug);

  const configuredCount = data?.providers.filter((p) => p.configured).length ?? 0;
  const mode = data?.config.mode || "ask";
  const fixedProviderName =
    mode === "fixed" && data?.config.provider
      ? data.providers.find((p) => p.id === data.config.provider)?.name
      : null;

  const summary =
    mode === "fixed" && fixedProviderName
      ? `Fijado: ${fixedProviderName}`
      : mode === "ask"
        ? "Modo: preguntar cada vez"
        : "Sin configurar";

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
          🖼️
        </span>
        <div className="min-w-0">
          <div className="font-semibold text-sm" style={{ color: "var(--sc-ink)" }}>
            Generación de imagen · qué provider usa
          </div>
          <div className="text-xs" style={{ color: "var(--sc-fg-muted)" }}>
            <span style={{ color: "var(--sc-navy-500)" }}>{summary}</span>
            <span> · {configuredCount} provider{configuredCount === 1 ? "" : "s"} conectado{configuredCount === 1 ? "" : "s"}</span>
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
          className="!w-[min(96vw,720px)] !max-w-[96vw] overflow-y-auto overflow-x-hidden"
          side="right"
        >
          <SheetHeader className="sticky top-0 z-10 bg-popover border-b">
            <SheetTitle>🖼️ Generación de imagen</SheetTitle>
          </SheetHeader>
          <div className="px-4 py-5">
            <ImageGenSetupEditor slug={slug} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
