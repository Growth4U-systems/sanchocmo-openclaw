"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { MediaAsset } from "@/lib/data/drafts";
import {
  useGenerateImage,
  useRemoveMedia,
  useSetPrimaryMedia,
  useUploadMedia,
} from "@/hooks/useMedia";
import { useImageProviders } from "@/hooks/useContentConfig";
import { CarouselComposer } from "@/components/content/CarouselComposer";
import { cn } from "@/lib/utils";

const FALLBACK_RATIOS = [
  { value: "1.91:1", label: "1.91:1 (LinkedIn feed)" },
  { value: "1:1", label: "1:1 (cuadrado)" },
  { value: "9:16", label: "9:16 (vertical)" },
  { value: "16:9", label: "16:9 (paisaje)" },
];

export function MediaPanel({
  slug,
  ideaId,
  channel,
  media,
}: {
  slug: string;
  ideaId: string;
  channel: string;
  media: MediaAsset[];
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [showCarousel, setShowCarousel] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState(FALLBACK_RATIOS[0].value);
  const [providerId, setProviderId] = useState("");
  const [modelId, setModelId] = useState("");

  const upload = useUploadMedia();
  const generate = useGenerateImage();
  const setPrimary = useSetPrimaryMedia();
  const remove = useRemoveMedia();
  const providersQ = useImageProviders(slug);

  const config = providersQ.data?.config;
  const isFixed = config?.mode === "fixed";
  const configured = useMemo(
    () => (providersQ.data?.providers || []).filter((p) => p.configured),
    [providersQ.data],
  );

  // Resolve which provider should drive the modal each time it's opened.
  useEffect(() => {
    if (!showPrompt || !config || configured.length === 0) return;
    if (isFixed && config.provider) {
      setProviderId(config.provider);
      const provider = configured.find((p) => p.id === config.provider);
      const model = config.model || provider?.models.find((m) => m.default)?.id || provider?.models[0]?.id || "";
      setModelId(model);
    } else if (!providerId) {
      const first = configured[0];
      setProviderId(first.id);
      setModelId(first.models.find((m) => m.default)?.id || first.models[0]?.id || "");
    }
  }, [showPrompt, config, configured, isFixed, providerId]);

  const selectedProvider = configured.find((p) => p.id === providerId);
  const ratiosForProvider = selectedProvider?.capabilities.aspectRatios || FALLBACK_RATIOS.map((r) => r.value);
  const ratioOptions = useMemo(() => {
    return ratiosForProvider.map((r) => ({
      value: r,
      label: FALLBACK_RATIOS.find((f) => f.value === r)?.label || r,
    }));
  }, [ratiosForProvider]);

  // Keep aspectRatio in-bounds when provider changes.
  useEffect(() => {
    if (selectedProvider && !ratiosForProvider.includes(aspectRatio)) {
      setAspectRatio(ratiosForProvider[0]);
    }
  }, [selectedProvider, ratiosForProvider, aspectRatio]);

  const busy = upload.isPending || generate.isPending;
  const error = upload.error || generate.error || setPrimary.error || remove.error;

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    Array.from(files).forEach((file) => upload.mutate({ slug, ideaId, channel, file }));
  }

  function handleGenerate() {
    if (!prompt.trim()) return;
    generate.mutate(
      {
        slug,
        ideaId,
        channel,
        prompt: prompt.trim(),
        aspectRatio,
        providerId: providerId || undefined,
        model: modelId || undefined,
      },
      { onSuccess: () => setPrompt("") },
    );
  }

  return (
    <section className="bg-white border border-[#E8E2D9] rounded-[10px] overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#E8E2D9]">
        <span className="text-base">🖼️</span>
        <span className="font-semibold text-sm text-[#2C3E50]">Media</span>
        <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
          {media.length} {media.length === 1 ? "imagen" : "imágenes"}
        </span>
      </div>

      <div className="p-4 space-y-3">
        {/* Gallery */}
        <div className="grid grid-cols-4 gap-2">
          {media.map((m, i) => (
            <MediaThumb
              key={m.url}
              media={m}
              isPrimary={i === 0}
              onSetPrimary={() => setPrimary.mutate({ slug, ideaId, channel, url: m.url })}
              onRemove={() => remove.mutate({ slug, ideaId, channel, url: m.url })}
            />
          ))}
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={busy}
            className="aspect-square rounded-lg border-2 border-dashed border-[#D9D2C5] bg-[#FAFAF8] grid place-items-center text-2xl text-[#7F8C8D] hover:border-rust hover:text-rust transition-colors disabled:opacity-50"
            title="Subir imagen"
          >
            +
          </button>
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

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={busy}
            className="text-xs px-3 py-1.5 bg-white border border-[#E8E2D9] rounded-lg hover:border-[#2C3E50] transition-colors disabled:opacity-50"
          >
            📤 Subir imagen
          </button>
          <button
            type="button"
            onClick={() => { setShowPrompt((v) => !v); setShowCarousel(false); }}
            disabled={configured.length === 0}
            className="text-xs px-3 py-1.5 bg-gradient-to-br from-[#6E4EF5] to-rust text-white rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            title={configured.length === 0 ? "Conecta un provider de imagen primero" : undefined}
          >
            ✨ Generar con IA
          </button>
          <button
            type="button"
            onClick={() => { setShowCarousel((v) => !v); setShowPrompt(false); }}
            className="text-xs px-3 py-1.5 bg-white border border-[#E8E2D9] rounded-lg hover:border-rust transition-colors"
          >
            🎨 Carrusel / Plantilla
          </button>
          {configured.length === 0 && (
            <Link href={`/dashboard/${slug}/settings`} className="text-xs text-rust hover:underline">
              Conectar provider ↗
            </Link>
          )}
        </div>

        {showCarousel && (
          <CarouselComposer slug={slug} ideaId={ideaId} channel={channel} />
        )}

        {showPrompt && (
          <div className="border border-[#E8E2D9] rounded-lg p-3 space-y-2 bg-[#FAFAF8]">
            <label className="block text-[11px] text-muted-foreground">Prompt</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe la imagen que quieres generar..."
              rows={3}
              className="w-full border border-[#E8E2D9] rounded-md px-2 py-1.5 text-sm bg-white focus:outline-none focus:border-rust resize-y"
            />

            <div className="flex flex-wrap items-end gap-2">
              {/* Provider selector — solo si modo "ask" y hay >=2 configurados */}
              {!isFixed && configured.length > 1 && (
                <div className="flex flex-col">
                  <label className="text-[10px] text-muted-foreground mb-0.5">Provider</label>
                  <select
                    value={providerId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setProviderId(id);
                      const def = configured.find((p) => p.id === id)?.models.find((m) => m.default)?.id || "";
                      setModelId(def);
                    }}
                    className="border border-[#E8E2D9] rounded-md px-2 py-1 text-xs bg-white"
                  >
                    {configured.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Modelo — visible siempre que el provider tenga >=2 modelos y modo no sea fixed */}
              {!isFixed && selectedProvider && selectedProvider.models.length > 1 && (
                <div className="flex flex-col">
                  <label className="text-[10px] text-muted-foreground mb-0.5">Modelo</label>
                  <select
                    value={modelId}
                    onChange={(e) => setModelId(e.target.value)}
                    className="border border-[#E8E2D9] rounded-md px-2 py-1 text-xs bg-white"
                  >
                    {selectedProvider.models.map((m) => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex flex-col">
                <label className="text-[10px] text-muted-foreground mb-0.5">Aspect ratio</label>
                <select
                  value={aspectRatio}
                  onChange={(e) => setAspectRatio(e.target.value)}
                  className="border border-[#E8E2D9] rounded-md px-2 py-1 text-xs bg-white"
                >
                  {ratioOptions.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>

              <div className="flex-1" />
              <button
                type="button"
                onClick={handleGenerate}
                disabled={!prompt.trim() || generate.isPending}
                className="text-xs px-3 py-1.5 bg-gradient-to-br from-[#6E4EF5] to-rust text-white rounded-lg font-medium disabled:opacity-50"
              >
                {generate.isPending ? "Generando..." : "✨ Generar"}
              </button>
            </div>

            <p className="text-[10px] text-muted-foreground flex flex-wrap gap-x-3">
              <span>
                Provider: <strong>{selectedProvider?.name || "—"}</strong>
                {isFixed && <span className="ml-1">(fijado en Setup)</span>}
              </span>
              <span>
                Brand voice de <code>brand-book/visual-identity.md</code> aplicado.
              </span>
              <Link href={`/dashboard/${slug}/content-creation?tab=engine`} className="text-rust hover:underline ml-auto">
                Cambiar default ↗
              </Link>
            </p>
          </div>
        )}

        {error && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {error instanceof Error ? error.message : String(error)}
          </div>
        )}
      </div>
    </section>
  );
}

function MediaThumb({
  media,
  isPrimary,
  onSetPrimary,
  onRemove,
}: {
  media: MediaAsset;
  isPrimary: boolean;
  onSetPrimary: () => void;
  onRemove: () => void;
}) {
  const isPdf = media.type === "application/pdf";
  return (
    <div
      className={cn(
        "relative aspect-square rounded-lg overflow-hidden border bg-[#F0EDE8]",
        isPrimary ? "border-2 border-rust ring-2 ring-rust/20" : "border-[#E8E2D9]",
      )}
    >
      {isPdf ? (
        <a
          href={media.url}
          target="_blank"
          rel="noreferrer"
          className="absolute inset-0 grid place-items-center text-center bg-gradient-to-br from-[#1A2C42] to-[#0a1728] text-white p-2"
        >
          <div>
            <div className="text-2xl mb-1">📄</div>
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
            sizes="120px"
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
                onClick={onSetPrimary}
                className="text-[10px] text-white bg-white/20 hover:bg-white/40 rounded px-1.5 py-0.5"
                title="Marcar como principal"
              >
                ⭐
              </button>
            ) : <span />}
            <button
              type="button"
              onClick={onRemove}
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
