"use client";

import { useEffect, useState } from "react";
import type { MediaAsset } from "@/lib/data/drafts";
import {
  useGenerateImage,
  useRemoveMedia,
  useSetPrimaryMedia,
} from "@/hooks/useMedia";
import { MediaMetadata } from "@/components/media-editor/MediaMetadata";

interface AiImageSidebarProps {
  slug: string;
  ideaId: string;
  channel: string;
  media: MediaAsset;
  isPrimary: boolean;
  onClose: () => void;
  onAfterRegenerate?: (newUrl: string) => void;
}

/** Sidebar para imágenes ai-generated: prompt editable, regenerar, primary, borrar. */
export function AiImageSidebar({
  slug,
  ideaId,
  channel,
  media,
  isPrimary,
  onClose,
  onAfterRegenerate,
}: AiImageSidebarProps) {
  const [prompt, setPrompt] = useState(media.prompt ?? "");
  const generate = useGenerateImage();
  const setPrimary = useSetPrimaryMedia();
  const remove = useRemoveMedia();

  useEffect(() => {
    setPrompt(media.prompt ?? "");
  }, [media.url, media.prompt]);

  const busy = generate.isPending || setPrimary.isPending || remove.isPending;
  const error = generate.error || setPrimary.error || remove.error;
  const isPdf = media.type === "application/pdf";
  const promptUnchanged = prompt.trim() === (media.prompt ?? "").trim();

  function handleRegenerate() {
    if (!prompt.trim()) return;
    const oldUrl = media.url;
    generate.mutate(
      { slug, ideaId, channel, prompt: prompt.trim(), aspectRatio: media.aspect_ratio },
      {
        onSuccess: async (data) => {
          if (!data.url) return;
          if (isPrimary) {
            await setPrimary.mutateAsync({ slug, ideaId, channel, url: data.url });
          }
          await remove.mutateAsync({ slug, ideaId, channel, url: oldUrl });
          onAfterRegenerate?.(data.url);
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

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {!isPdf && (
        <div className="space-y-2">
          <label className="block text-[11px] text-muted-foreground">Prompt</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={6}
            className="w-full border border-[#E8E2D9] rounded-md px-2 py-1.5 text-sm bg-white focus:outline-none focus:border-rust resize-y"
          />
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={!prompt.trim() || busy || promptUnchanged}
            className="w-full text-xs px-3 py-2 bg-gradient-to-br from-[#6E4EF5] to-rust text-white rounded-lg font-medium disabled:opacity-50"
            title={promptUnchanged ? "Edita el prompt para regenerar" : "Regenera con el prompt editado"}
          >
            {generate.isPending ? "Regenerando..." : "✨ Regenerar"}
          </button>
          <p className="text-[10px] text-muted-foreground">
            Mantiene aspect ratio y provider de la imagen original. Al acabar,
            sustituye esta imagen por la nueva.
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
          className="text-xs px-3 py-2 bg-white border border-[#E8E2D9] rounded-lg hover:border-red-500 hover:text-red-600 disabled:opacity-50"
        >
          🗑 Borrar
        </button>
      </div>

      <MediaMetadata media={media} />

      {error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error instanceof Error ? error.message : String(error)}
        </div>
      )}
    </div>
  );
}
