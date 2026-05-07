"use client";

import Link from "next/link";
import type { MediaAsset } from "@/lib/data/drafts";

interface MediaSummaryWidgetProps {
  media: MediaAsset[];
  href: string;
}

export function MediaSummaryWidget({ media, href }: MediaSummaryWidgetProps) {
  const count = media.length;
  const primary = media[0];
  const primaryLabel = !primary
    ? null
    : primary.type === "application/pdf"
      ? "carrusel PDF"
      : primary.source === "ai-generated"
        ? "imagen IA"
        : "imagen subida";

  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-4 py-2.5 bg-white border border-[#E8E2D9] rounded-[10px] hover:border-rust transition-colors"
    >
      <span className="text-base">🖼️</span>
      <span className="font-semibold text-sm text-[#2C3E50]">Media</span>
      <span className="text-[11px] text-[#5C6470]">
        {count === 0
          ? "Sin imágenes"
          : `${count} ${count === 1 ? "imagen" : "imágenes"}`}
        {primaryLabel && (
          <>
            {" · "}
            <span className="text-[#7F8C8D]">principal: {primaryLabel}</span>
          </>
        )}
      </span>
      <span className="ml-auto text-xs text-rust hover:underline">
        {count === 0 ? "Añadir media →" : "Editar en Media →"}
      </span>
    </Link>
  );
}
