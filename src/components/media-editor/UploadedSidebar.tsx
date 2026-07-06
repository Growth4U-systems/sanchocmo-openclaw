"use client";

import type { MediaAsset } from "@/lib/data/drafts";
import { useRemoveMedia, useSetPrimaryMedia } from "@/hooks/useMedia";
import { MediaMetadata } from "@/components/media-editor/MediaMetadata";

interface UploadedSidebarProps {
  slug: string;
  ideaId: string;
  channel: string;
  media: MediaAsset;
  isPrimary: boolean;
  onClose: () => void;
}

/** Sidebar para imágenes uploaded o PDFs: solo metadata + primary/borrar. */
export function UploadedSidebar({
  slug,
  ideaId,
  channel,
  media,
  isPrimary,
  onClose,
}: UploadedSidebarProps) {
  const setPrimary = useSetPrimaryMedia();
  const remove = useRemoveMedia();
  const busy = setPrimary.isPending || remove.isPending;
  const error = setPrimary.error || remove.error;
  const isPdf = media.type === "application/pdf";

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
      <p className="text-[11px] text-muted-foreground">
        Asset subido manualmente. Para regenerar con IA, bórralo y pídele a
        Sancho una imagen nueva en el chat.
      </p>

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
