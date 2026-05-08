"use client";

import { useEffect } from "react";
import type { MediaAsset } from "@/lib/data/drafts";
import { ImagePreview } from "@/components/media-editor/ImagePreview";
import { AiImageSidebar } from "@/components/media-editor/AiImageSidebar";
import { UploadedSidebar } from "@/components/media-editor/UploadedSidebar";
import { TemplateRenderBody } from "@/components/media-editor/TemplateRenderBody";
import { TemplateEditBody } from "@/components/media-editor/TemplateEditBody";

export type AssetDescriptor =
  | {
      kind: "ai-image";
      slug: string;
      ideaId: string;
      channel: string;
      media: MediaAsset;
      isPrimary: boolean;
      onAfterRegenerate?: (newUrl: string) => void;
    }
  | {
      kind: "uploaded";
      slug: string;
      ideaId: string;
      channel: string;
      media: MediaAsset;
      isPrimary: boolean;
    }
  | {
      kind: "template-render";
      slug: string;
      ideaId: string;
      channel: string;
      templateId: string;
    }
  | {
      kind: "template-edit";
      slug: string;
      templateId: string;
      fileKey: "template" | "slide-cover" | "slide-body" | "slide-cta";
      htmlDocPath: string;
    };

interface MediaEditorProps {
  asset: AssetDescriptor;
  onClose: () => void;
}

/**
 * Single canonical media editor. Modal full-screen with:
 *  - sidebar (420px, left)  — depends on asset.kind
 *  - preview (flex-1, right) — depends on asset.kind
 *
 * Used from two places:
 *  - Foundation → click "Editar" on a template doc → kind: "template-edit"
 *  - Content Editor → tab Media:
 *      · click on existing image thumbnail → kind: "ai-image" | "uploaded"
 *      · "Generar desde plantilla" → picker → kind: "template-render"
 */
export function MediaEditor({ asset, onClose }: MediaEditorProps) {
  // ESC closes; click on the overlay (outside the card) closes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const header = renderHeader(asset);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[#FAFAF8] rounded-xl shadow-2xl w-full max-w-[1400px] h-[92vh] flex flex-col overflow-hidden">
        <header className="flex items-center justify-between px-4 py-2.5 border-b border-[#E8E2D9] bg-white shrink-0">
          {header}
          <button
            type="button"
            onClick={onClose}
            className="text-xl text-[#7F8C8D] hover:text-[#2C3E50] leading-none ml-3"
            aria-label="Cerrar"
            title="Cerrar (Esc)"
          >
            ✕
          </button>
        </header>

        {asset.kind === "ai-image" || asset.kind === "uploaded" ? (
          <div className="grid grid-cols-[420px_1fr] flex-1 min-h-0">
            <aside className="flex flex-col min-h-0 border-r border-[#E8E2D9] bg-white">
              {asset.kind === "ai-image" ? (
                <AiImageSidebar
                  slug={asset.slug}
                  ideaId={asset.ideaId}
                  channel={asset.channel}
                  media={asset.media}
                  isPrimary={asset.isPrimary}
                  onClose={onClose}
                  onAfterRegenerate={asset.onAfterRegenerate}
                />
              ) : (
                <UploadedSidebar
                  slug={asset.slug}
                  ideaId={asset.ideaId}
                  channel={asset.channel}
                  media={asset.media}
                  isPrimary={asset.isPrimary}
                  onClose={onClose}
                />
              )}
            </aside>
            <ImagePreview media={asset.media} />
          </div>
        ) : asset.kind === "template-render" ? (
          <TemplateRenderBody
            slug={asset.slug}
            ideaId={asset.ideaId}
            channel={asset.channel}
            templateId={asset.templateId}
            onClose={onClose}
          />
        ) : (
          <TemplateEditBody
            slug={asset.slug}
            templateId={asset.templateId}
            fileKey={asset.fileKey}
            htmlDocPath={asset.htmlDocPath}
          />
        )}
      </div>
    </div>
  );
}

function renderHeader(asset: AssetDescriptor) {
  if (asset.kind === "ai-image" || asset.kind === "uploaded") {
    const isAi = asset.kind === "ai-image";
    return (
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-base">{isAi ? "✨" : "📤"}</span>
        <span className="font-semibold text-sm text-[#2C3E50] truncate">
          {isAi ? "Imagen IA" : "Asset subido"}
        </span>
        {asset.isPrimary && (
          <span className="text-[10px] font-bold bg-rust text-white px-1.5 py-0.5 rounded">
            Principal
          </span>
        )}
        <span className="text-[10px] text-muted-foreground font-mono ml-2">
          {asset.media.type}
        </span>
      </div>
    );
  }
  if (asset.kind === "template-render") {
    return (
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-base">🎨</span>
        <span className="font-semibold text-sm text-[#2C3E50] truncate">
          Plantilla · {asset.templateId}
        </span>
        <span className="text-[10px] text-muted-foreground ml-2">
          aplicar al canal <code>{asset.channel}</code>
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-base">✏️</span>
      <span className="font-semibold text-sm text-[#2C3E50] truncate">
        Editar plantilla · {asset.templateId}
      </span>
      <span className="text-[10px] text-muted-foreground font-mono ml-2 truncate">
        {asset.htmlDocPath.split("/").pop()}
      </span>
    </div>
  );
}
