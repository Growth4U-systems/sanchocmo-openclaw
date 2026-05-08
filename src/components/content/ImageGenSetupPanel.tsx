"use client";

import { useState } from "react";
import { useImageProviders } from "@/hooks/useContentConfig";
import { ImageGenSetupEditor } from "@/components/content/setup/ImageGenSetupEditor";
import { ConfigRow } from "@/components/content/config/ConfigRow";
import { ConfigSheet } from "@/components/content/config/ConfigSheet";
import { EditButton } from "@/components/content/config/EditButton";

/**
 * "Generación de imagen" row en `Engine > Configuración § Producción`.
 * Resumen + Editar → ConfigSheet con ImageGenSetupEditor.
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
      <ConfigRow
        icon="🖼️"
        title="Generación de imagen · qué provider usa"
        sub={
          <>
            <span style={{ color: "var(--sc-navy-500)" }}>{summary}</span>
            <span> · {configuredCount} provider{configuredCount === 1 ? "" : "s"} conectado{configuredCount === 1 ? "" : "s"}</span>
          </>
        }
        right={<EditButton onClick={() => setOpen(true)} />}
      />

      <ConfigSheet open={open} onOpenChange={setOpen} icon="🖼️" title="Generación de imagen">
        <ImageGenSetupEditor slug={slug} />
      </ConfigSheet>
    </>
  );
}
