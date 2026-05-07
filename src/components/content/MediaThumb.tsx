"use client";

import Image from "next/image";
import type { MediaAsset } from "@/lib/data/drafts";
import { cn } from "@/lib/utils";

interface MediaThumbProps {
  media: MediaAsset;
  isPrimary: boolean;
  onSetPrimary: () => void;
  onRemove: () => void;
  onClick?: () => void;
  size?: "sm" | "lg";
}

export function MediaThumb({
  media,
  isPrimary,
  onSetPrimary,
  onRemove,
  onClick,
  size = "sm",
}: MediaThumbProps) {
  const isPdf = media.type === "application/pdf";
  return (
    <div
      className={cn(
        "relative aspect-square rounded-lg overflow-hidden border bg-[#F0EDE8]",
        isPrimary ? "border-2 border-rust ring-2 ring-rust/20" : "border-[#E8E2D9]",
        onClick && !isPdf && "cursor-zoom-in",
      )}
      onClick={onClick && !isPdf ? onClick : undefined}
    >
      {isPdf ? (
        <a
          href={media.url}
          target="_blank"
          rel="noreferrer"
          className="absolute inset-0 grid place-items-center text-center bg-gradient-to-br from-[#1A2C42] to-[#0a1728] text-white p-2"
        >
          <div>
            <div className={size === "lg" ? "text-4xl mb-1" : "text-2xl mb-1"}>📄</div>
            <div className="text-[10px] font-bold uppercase tracking-wider">Carrusel PDF</div>
            <div className="text-[9px] opacity-70 mt-0.5">Click para ver</div>
          </div>
        </a>
      ) : (
        <>
          <Image
            src={media.url}
            alt={media.prompt || "Media asset"}
            fill
            sizes={size === "lg" ? "300px" : "120px"}
            className="object-cover"
            unoptimized
          />
          <div className="absolute top-1 left-1 flex gap-1">
            {isPrimary && (
              <span className="text-[9px] font-bold bg-rust text-white px-1.5 py-0.5 rounded">
                Principal
              </span>
            )}
            {media.source === "ai-generated" && (
              <span className="text-[9px] font-bold bg-black/70 text-white px-1.5 py-0.5 rounded">
                ✨ IA
              </span>
            )}
          </div>
          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent flex justify-between p-1 opacity-0 hover:opacity-100 transition-opacity">
            {!isPrimary ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSetPrimary();
                }}
                className="text-[10px] text-white bg-white/20 hover:bg-white/40 rounded px-1.5 py-0.5"
                title="Marcar como principal"
              >
                ⭐
              </button>
            ) : <span />}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="text-[10px] text-white bg-white/20 hover:bg-red-500 rounded px-1.5 py-0.5"
              title="Quitar"
            >
              ✕
            </button>
          </div>
        </>
      )}
    </div>
  );
}
