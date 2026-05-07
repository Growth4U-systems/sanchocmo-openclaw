"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import type { MediaAsset } from "@/lib/data/drafts";
import {
  useGenerateImage,
  useRemoveMedia,
  useSetPrimaryMedia,
} from "@/hooks/useMedia";

interface MediaLightboxProps {
  slug: string;
  ideaId: string;
  channel: string;
  media: MediaAsset;
  isPrimary: boolean;
  onClose: () => void;
  onAfterRegenerate?: (newUrl: string) => void;
}

export function MediaLightbox({
  slug,
  ideaId,
  channel,
  media,
  isPrimary,
  onClose,
  onAfterRegenerate,
}: MediaLightboxProps) {
  const [prompt, setPrompt] = useState(media.prompt ?? "");
  const generate = useGenerateImage();
  const setPrimary = useSetPrimaryMedia();
  const remove = useRemoveMedia();

  // Reset prompt when the displayed media changes (different asset selected).
  useEffect(() => {
    setPrompt(media.prompt ?? "");
  }, [media.url, media.prompt]);

  // ESC closes the lightbox.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const isAi = media.source === "ai-generated";
  const isPdf = media.type === "application/pdf";
  const busy = generate.isPending || setPrimary.isPending || remove.isPending;

  function handleRegenerate() {
    if (!prompt.trim() || !isAi) return;
    const oldUrl = media.url;
    generate.mutate(
      {
        slug,
        ideaId,
        channel,
        prompt: prompt.trim(),
        aspectRatio: media.aspect_ratio,
      },
      {
        onSuccess: async (data) => {
          if (data.url) {
            // Promote new image to primary (if the previous one was primary)
            // and drop the old one so the user gets a clean swap.
            if (isPrimary) {
              await setPrimary.mutateAsync({ slug, ideaId, channel, url: data.url });
            }
            await remove.mutateAsync({ slug, ideaId, channel, url: oldUrl });
            onAfterRegenerate?.(data.url);
          }
        },
      },
    );
  }

  function handleSetPrimary() {
    setPrimary.mutate({ slug, ideaId, channel, url: media.url });
  }

  function handleRemove() {
    if (!confirm("¿Eliminar esta imagen?")) return;
    remove.mutate(
      { slug, ideaId, channel, url: media.url },
      { onSuccess: () => onClose() },
    );
  }

  const error = generate.error || setPrimary.error || remove.error;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[#FAFAF8] rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] flex overflow-hidden">
        {/* Image side */}
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

        {/* Sidebar */}
        <aside className="w-[360px] shrink-0 border-l border-[#E8E2D9] flex flex-col">
          <header className="flex items-center justify-between px-4 py-3 border-b border-[#E8E2D9]">
            <span className="font-semibold text-sm text-[#2C3E50]">
              {isAi ? "✨ Imagen IA" : "📤 Subida"}
              {isPrimary && (
                <span className="ml-2 text-[10px] font-bold bg-rust text-white px-1.5 py-0.5 rounded">
                  Principal
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="text-xl text-[#7F8C8D] hover:text-[#2C3E50] leading-none"
              aria-label="Cerrar"
              title="Cerrar (Esc)"
            >
              ✕
            </button>
          </header>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {isAi && !isPdf && (
              <div className="space-y-2">
                <label className="block text-[11px] text-muted-foreground">
                  Prompt
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={6}
                  className="w-full border border-[#E8E2D9] rounded-md px-2 py-1.5 text-sm bg-white focus:outline-none focus:border-rust resize-y"
                />
                <button
                  type="button"
                  onClick={handleRegenerate}
                  disabled={!prompt.trim() || busy || prompt.trim() === (media.prompt ?? "").trim()}
                  className="w-full text-xs px-3 py-2 bg-gradient-to-br from-[#6E4EF5] to-rust text-white rounded-lg font-medium disabled:opacity-50"
                  title={
                    prompt.trim() === (media.prompt ?? "").trim()
                      ? "Edita el prompt para regenerar"
                      : "Regenera la imagen con el prompt editado"
                  }
                >
                  {generate.isPending ? "Regenerando..." : "✨ Regenerar"}
                </button>
                <p className="text-[10px] text-muted-foreground">
                  Mantiene aspect ratio y provider de la imagen original. Al
                  acabar, sustituye esta imagen por la nueva.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              {!isPrimary && !isPdf && (
                <button
                  type="button"
                  onClick={handleSetPrimary}
                  disabled={busy}
                  className="text-xs px-3 py-2 bg-white border border-[#E8E2D9] rounded-lg hover:border-[#2C3E50] disabled:opacity-50"
                >
                  ⭐ Marcar principal
                </button>
              )}
              <button
                type="button"
                onClick={handleRemove}
                disabled={busy}
                className="text-xs px-3 py-2 bg-white border border-[#E8E2D9] rounded-lg hover:border-red-500 hover:text-red-600 disabled:opacity-50 col-span-1"
              >
                🗑 Borrar
              </button>
            </div>

            <dl className="text-[11px] text-[#5C6470] space-y-1 pt-3 border-t border-[#E8E2D9]">
              <div className="flex justify-between gap-2">
                <dt>Source</dt>
                <dd className="font-mono text-[#2C3E50]">{media.source}</dd>
              </div>
              {media.model && (
                <div className="flex justify-between gap-2">
                  <dt>Modelo</dt>
                  <dd className="font-mono text-[#2C3E50] truncate">{media.model}</dd>
                </div>
              )}
              {media.aspect_ratio && (
                <div className="flex justify-between gap-2">
                  <dt>Ratio</dt>
                  <dd className="font-mono text-[#2C3E50]">{media.aspect_ratio}</dd>
                </div>
              )}
              <div className="flex justify-between gap-2">
                <dt>Tipo</dt>
                <dd className="font-mono text-[#2C3E50]">{media.type}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Creada</dt>
                <dd className="font-mono text-[#2C3E50]">
                  {new Date(media.created_at).toLocaleString()}
                </dd>
              </div>
            </dl>

            {error && (
              <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                {error instanceof Error ? error.message : String(error)}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
