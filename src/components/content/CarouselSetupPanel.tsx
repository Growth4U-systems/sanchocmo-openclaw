"use client";

import { useState } from "react";
import {
  useAllCarouselTemplates,
  useEffectiveContentConfig,
} from "@/hooks/useContentConfig";
import { CarouselSetupEditor } from "@/components/content/setup/CarouselSetupEditor";
import { ConfigRow } from "@/components/content/config/ConfigRow";
import { ConfigSheet } from "@/components/content/config/ConfigSheet";
import { EditButton } from "@/components/content/config/EditButton";

/**
 * "Carrusel · branding & plantillas" row en
 * `Engine > Configuración § Producción`. Preview ligero (color swatches +
 * estado de logo + nº plantillas habilitadas) + Editar → ConfigSheet.
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

  const sub = (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
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
    </span>
  );

  return (
    <>
      <ConfigRow
        icon="🎨"
        title="Carrusel · branding & plantillas"
        sub={sub}
        right={<EditButton onClick={() => setOpen(true)} />}
      />

      <ConfigSheet open={open} onOpenChange={setOpen} icon="🎨" title="Carrusel · branding & plantillas">
        <CarouselSetupEditor slug={slug} />
      </ConfigSheet>
    </>
  );
}
