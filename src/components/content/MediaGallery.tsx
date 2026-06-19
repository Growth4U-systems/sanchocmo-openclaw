"use client";

import { useRef, useState } from "react";
import { useDraft } from "@/hooks/useDraft";
import {
  useRemoveMedia,
  useSetPrimaryMedia,
  useUploadMedia,
} from "@/hooks/useMedia";
import { MediaEditor } from "@/components/media-editor/MediaEditor";
import { MediaThumb } from "@/components/content/MediaThumb";
import { useSendMessage } from "@/hooks/useChat";
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
  contentTaskId: string;
  targetChannels: string[];
  initialChannel?: string;
}

export function MediaGallery({
  slug,
  ideaId,
  contentTaskId,
  targetChannels,
  initialChannel,
}: MediaGalleryProps) {
  const fallback = targetChannels[0] ?? "linkedin";
  const [activeChannel, setActiveChannel] = useState<string>(
    initialChannel && targetChannels.includes(initialChannel)
      ? initialChannel
      : fallback,
  );
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const fileInput = useRef<HTMLInputElement>(null);

  const { data: draft, isLoading } = useDraft(slug, ideaId, activeChannel);
  const media = draft?.meta.media ?? [];

  const upload = useUploadMedia();
  const setPrimary = useSetPrimaryMedia();
  const remove = useRemoveMedia();
  const sendMessage = useSendMessage();

  const chatThreadId = `${slug}:content:${contentTaskId.toLowerCase()}`;

  // Anti-double-fire (SAN-238 P4): the quick-action was firing TWICE — a rapid
  // double-click (or a re-render) could call `mutate` again before
  // `sendMessage.isPending` flipped, posting the prompt to the thread twice.
  // A synchronous ref guard closes that window: it's set the instant we
  // dispatch and only cleared on settle, so a second call within the same tick
  // is a no-op regardless of React render timing. `askedOnce` then keeps the
  // button as a one-shot per draft so it can't be spammed.
  const inFlightRef = useRef(false);
  const [askedOnce, setAskedOnce] = useState(false);

  function askSancho() {
    if (inFlightRef.current || sendMessage.isPending || askedOnce) return;
    inFlightRef.current = true;
    sendMessage.mutate(
      {
        threadId: chatThreadId,
        text: `Genérame media para este draft (canal: ${activeChannel}). Pregúntame qué formato necesito (carrusel, imagen, header...) y proponme los textos antes de renderizar.`,
      },
      {
        onSuccess: () => setAskedOnce(true),
        onSettled: () => {
          inFlightRef.current = false;
        },
      },
    );
  }

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
                  onClick={() => setActiveChannel(c)}
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
        <div className="px-4 py-4 border-t border-[#E8E2D9] bg-[#FCFAF7] flex items-stretch gap-3 flex-wrap">
          <button
            type="button"
            onClick={askSancho}
            disabled={sendMessage.isPending || askedOnce}
            className="flex-1 min-w-[280px] flex items-center gap-3 px-4 py-3 bg-gradient-to-br from-[#6E4EF5] to-rust text-white rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50 text-left"
            title="Sancho elige la plantilla (carrusel, header, etc.) y propone los textos"
          >
            <span className="text-2xl">✨</span>
            <span className="flex-1">
              <span className="block text-sm font-semibold">
                {sendMessage.isPending
                  ? "Pidiéndoselo a Sancho..."
                  : askedOnce
                    ? "Pedido a Sancho ✓"
                    : "Pedírselo a Sancho"}
              </span>
              <span className="block text-[11px] opacity-90 mt-0.5">
                {askedOnce
                  ? "Te responde en el chat con las opciones de formato."
                  : "Te pregunta el formato (carrusel, imagen, header) y lo construye con la plantilla de la marca."}
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={busy}
            className="flex items-center gap-3 px-4 py-3 bg-white border border-[#E8E2D9] rounded-lg hover:border-[#2C3E50] transition-colors disabled:opacity-50 text-left min-w-[200px]"
            title="Sube un archivo (PNG/JPG/WebP/GIF) que ya tengas hecho"
          >
            <span className="text-2xl">📤</span>
            <span className="flex-1">
              <span className="block text-sm font-semibold text-[#2C3E50]">
                Subir asset
              </span>
              <span className="block text-[11px] text-muted-foreground mt-0.5">
                Tienes el archivo ya hecho.
              </span>
            </span>
          </button>
        </div>

        {sendMessage.isError && (
          <div className="mx-4 mb-4 text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            No se pudo enviar el mensaje al chat: {sendMessage.error.message}
          </div>
        )}

        {error && (
          <div className="mx-4 mb-4 text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {error instanceof Error ? error.message : String(error)}
          </div>
        )}
      </section>

      {lightboxMedia && (() => {
        const idx = media.findIndex((m) => m.url === lightboxMedia.url);
        const total = media.length;
        const navigate = (delta: number) => {
          if (idx < 0 || total < 2) return;
          const next = (idx + delta + total) % total;
          setLightboxUrl(media[next].url);
        };
        const nav =
          total > 1
            ? {
                index: idx,
                total,
                onPrev: () => navigate(-1),
                onNext: () => navigate(1),
              }
            : undefined;
        return (
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
                    nav,
                  }
                : {
                    kind: "uploaded",
                    slug,
                    ideaId,
                    channel: activeChannel,
                    media: lightboxMedia,
                    isPrimary: lightboxIsPrimary,
                    nav,
                  }
            }
            onClose={() => setLightboxUrl(null)}
          />
        );
      })()}
    </div>
  );
}
