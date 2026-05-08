"use client";

import { useRef, useState } from "react";
import { useDraft } from "@/hooks/useDraft";
import {
  useRemoveMedia,
  useSetPrimaryMedia,
  useUploadMedia,
} from "@/hooks/useMedia";
import { TemplateRenderer } from "@/components/content/TemplateRenderer";
import { MediaEditor } from "@/components/media-editor/MediaEditor";
import { MediaThumb } from "@/components/content/MediaThumb";
import { cn } from "@/lib/utils";

const CHANNEL_LABELS: Record<string, string> = {
  linkedin: "LinkedIn",
  twitter: "X / Twitter",
  instagram: "Instagram",
  blog: "Blog",
  email: "Email",
  youtube: "YouTube",
  tiktok: "TikTok",
};

function channelLabel(channel: string): string {
  return CHANNEL_LABELS[channel] ?? channel;
}

interface MediaGalleryProps {
  slug: string;
  ideaId: string;
  targetChannels: string[];
  initialChannel?: string;
}

export function MediaGallery({
  slug,
  ideaId,
  targetChannels,
  initialChannel,
}: MediaGalleryProps) {
  const fallback = targetChannels[0] ?? "linkedin";
  const [activeChannel, setActiveChannel] = useState<string>(
    initialChannel && targetChannels.includes(initialChannel)
      ? initialChannel
      : fallback,
  );
  const [showCarousel, setShowCarousel] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const fileInput = useRef<HTMLInputElement>(null);

  const { data: draft, isLoading } = useDraft(slug, ideaId, activeChannel);
  const media = draft?.meta.media ?? [];

  const upload = useUploadMedia();
  const setPrimary = useSetPrimaryMedia();
  const remove = useRemoveMedia();

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    Array.from(files).forEach((file) =>
      upload.mutate({ slug, ideaId, channel: activeChannel, file }),
    );
  }

  const lightboxMedia = lightboxUrl
    ? media.find((m) => m.url === lightboxUrl) ?? null
    : null;
  const lightboxIsPrimary = lightboxMedia
    ? media[0]?.url === lightboxMedia.url
    : false;

  const error = upload.error || setPrimary.error || remove.error;
  const busy = upload.isPending;

  return (
    <div className="space-y-5">
      {/* Channel selector */}
      <section className="bg-white border border-[#E8E2D9] rounded-[10px] overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[#E8E2D9] flex items-center gap-2 flex-wrap">
          <span className="text-base">🖼️</span>
          <span className="font-semibold text-sm text-[#2C3E50]">Media</span>
          <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
            {media.length} {media.length === 1 ? "imagen" : "imágenes"}
          </span>
          <span className="text-[10px] text-[#7F8C8D] ml-auto">
            Canal:
          </span>
          <div className="flex flex-wrap gap-1">
            {targetChannels.length === 0 ? (
              <span className="text-[11px] text-[#7F8C8D] italic">Sin canales</span>
            ) : (
              targetChannels.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setActiveChannel(c);
                    setShowCarousel(false);
                  }}
                  className={cn(
                    "text-[11px] px-2.5 py-1 rounded-full border transition-colors",
                    activeChannel === c
                      ? "bg-[#2C3E50] text-white border-[#2C3E50]"
                      : "bg-white text-[#5C6470] border-[#E8E2D9] hover:border-[#2C3E50]",
                  )}
                >
                  {channelLabel(c)}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Gallery */}
        <div className="p-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-12 text-center">
              Cargando media…
            </p>
          ) : media.length === 0 ? (
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={busy}
              className="w-full aspect-[3/1] rounded-lg border-2 border-dashed border-[#D9D2C5] bg-[#FAFAF8] grid place-items-center text-sm text-[#7F8C8D] hover:border-rust hover:text-rust transition-colors disabled:opacity-50"
            >
              <span>
                + Sin media para <strong>{channelLabel(activeChannel)}</strong> ·
                click para subir
              </span>
            </button>
          ) : (
            <div className="grid grid-cols-3 lg:grid-cols-4 gap-3">
              {media.map((m, i) => (
                <MediaThumb
                  key={m.url}
                  media={m}
                  isPrimary={i === 0}
                  onSetPrimary={() =>
                    setPrimary.mutate({ slug, ideaId, channel: activeChannel, url: m.url })
                  }
                  onRemove={() =>
                    remove.mutate({ slug, ideaId, channel: activeChannel, url: m.url })
                  }
                  onClick={() => setLightboxUrl(m.url)}
                  size="lg"
                />
              ))}
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={busy}
                className="aspect-square rounded-lg border-2 border-dashed border-[#D9D2C5] bg-[#FAFAF8] grid place-items-center text-3xl text-[#7F8C8D] hover:border-rust hover:text-rust transition-colors disabled:opacity-50"
                title="Subir imagen"
              >
                +
              </button>
            </div>
          )}
        </div>

        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />

        {/* Action bar */}
        <div className="px-4 py-3 border-t border-[#E8E2D9] bg-[#FCFAF7] flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={busy}
            className="text-xs px-3 py-1.5 bg-white border border-[#E8E2D9] rounded-lg hover:border-[#2C3E50] transition-colors disabled:opacity-50"
            title="Sube un archivo (PNG/JPG/WebP/GIF) que ya tengas hecho"
          >
            📤 Subir asset
          </button>
          <button
            type="button"
            onClick={() => setShowCarousel((v) => !v)}
            className="text-xs px-3 py-1.5 bg-white border border-[#E8E2D9] rounded-lg hover:border-rust transition-colors"
            title="Renderiza una plantilla brandeada (carrusel, header, etc.) rellenando los slots"
          >
            🎨 Generar desde plantilla
          </button>
          <span className="text-[11px] text-[#7F8C8D] ml-auto">
            ¿Generar con IA libre? Pídeselo a Sancho en el chat →
          </span>
        </div>

        {error && (
          <div className="mx-4 mb-4 text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {error instanceof Error ? error.message : String(error)}
          </div>
        )}
      </section>

      {showCarousel && (
        <TemplateRenderer slug={slug} ideaId={ideaId} channel={activeChannel} />
      )}

      {lightboxMedia && (
        <MediaEditor
          asset={
            lightboxMedia.source === "ai-generated"
              ? {
                  kind: "ai-image",
                  slug,
                  ideaId,
                  channel: activeChannel,
                  media: lightboxMedia,
                  isPrimary: lightboxIsPrimary,
                  onAfterRegenerate: (newUrl) => setLightboxUrl(newUrl),
                }
              : {
                  kind: "uploaded",
                  slug,
                  ideaId,
                  channel: activeChannel,
                  media: lightboxMedia,
                  isPrimary: lightboxIsPrimary,
                }
          }
          onClose={() => setLightboxUrl(null)}
        />
      )}
    </div>
  );
}
