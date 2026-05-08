"use client";

import Image from "next/image";
import type { MediaAsset } from "@/lib/data/drafts";

interface ImagePreviewProps {
  media: MediaAsset;
}

export function ImagePreview({ media }: ImagePreviewProps) {
  const isPdf = media.type === "application/pdf";
  return (
    <div className="flex-1 bg-[#0a0a0a] flex items-center justify-center min-h-[60vh] relative">
      {isPdf ? (
        <a
          href={media.url}
          target="_blank"
          rel="noreferrer"
          className="text-white text-center p-8"
        >
          <div className="text-6xl mb-3">📄</div>
          <div className="text-sm font-bold uppercase tracking-wider">Carrusel PDF</div>
          <div className="text-xs opacity-70 mt-2 underline">Abrir en pestaña nueva ↗</div>
        </a>
      ) : (
        <Image
          src={media.url}
          alt={media.prompt || "Media asset"}
          fill
          sizes="(max-width: 1280px) 60vw, 800px"
          className="object-contain"
          unoptimized
        />
      )}
    </div>
  );
}
