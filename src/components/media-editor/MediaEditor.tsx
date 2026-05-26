"use client";

import { useEffect } from "react";
import type { MediaAsset } from "@/lib/data/drafts";
import { ImagePreview } from "@/components/media-editor/ImagePreview";
import { AiImageSidebar } from "@/components/media-editor/AiImageSidebar";
import { UploadedSidebar } from "@/components/media-editor/UploadedSidebar";
import { TemplateEditBody } from "@/components/media-editor/TemplateEditBody";

/** Navigation info for stepping through a sibling media[] array.
 *  Only applies to image kinds; template-edit ignores it. */
export interface MediaNav {
  index: number;          // 0-based position of the current asset
  total: number;          // siblings count (>= 2 for nav to make sense)
  onPrev: () => void;     // wrap-around or disabled at boundaries — caller decides
  onNext: () => void;
}

export type AssetDescriptor =
  | {
      kind: "ai-image";
      slug: string;
      ideaId: string;
      channel: string;
      media: MediaAsset;
      isPrimary: boolean;
      onAfterRegenerate?: (newUrl: string) => void;
      nav?: MediaNav;
    }
  | {
      kind: "uploaded";
      slug: string;
      ideaId: string;
      channel: string;
      media: MediaAsset;
      isPrimary: boolean;
      nav?: MediaNav;
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
 *  - Foundation → click "Editar" on a template doc → kind: "template-edit".
 *    For brand authors who maintain templates (slot test + HTML editor).
 *  - Content Editor → tab Media → click image thumbnail
 *    → kind: "ai-image" | "uploaded".
 *
 * Templates are NEVER exposed to redactors as a fillable form. When a
 * redactor wants media, they ask Sancho in chat; Sancho picks the right
 * template internally and renders via render-carousel.
 */
export function MediaEditor({ asset, onClose }: MediaEditorProps) {
  const nav =
    asset.kind === "ai-image" || asset.kind === "uploaded" ? asset.nav : undefined;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (!nav) return;
      // Don't intercept arrows while the user is typing in the sidebar
      // (prompt textarea, slot inputs, code editor).
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        nav.onPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        nav.onNext();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, nav]);

  const header = renderHeader(asset);

  return (
    <div
      // z-[1000] sits above DashboardLayout's sidebar/header (anything below
      // 1000) and the chat sidebar (`z-50`). The portal-friendly fixed inset
      // ensures we cover the whole viewport regardless of where the trigger
      // was rendered.
      className="fixed inset-0 z-[1000] bg-black/80 flex items-center justify-center p-4"
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
            <div className="relative flex-1 flex flex-col min-h-0">
              <ImagePreview media={asset.media} />
              {nav && nav.total > 1 && (
                <>
                  <NavArrow direction="prev" onClick={nav.onPrev} />
                  <NavArrow direction="next" onClick={nav.onNext} />
                </>
              )}
            </div>
          </div>
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
        {asset.nav && asset.nav.total > 1 && (
          <span className="text-[10px] text-muted-foreground font-mono ml-2">
            {asset.nav.index + 1} / {asset.nav.total}
          </span>
        )}
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

function NavArrow({
  direction,
  onClick,
}: {
  direction: "prev" | "next";
  onClick: () => void;
}) {
  const isPrev = direction === "prev";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={isPrev ? "Anterior" : "Siguiente"}
      title={`${isPrev ? "Anterior" : "Siguiente"} (${isPrev ? "←" : "→"})`}
      className={`absolute top-1/2 -translate-y-1/2 ${
        isPrev ? "left-3" : "right-3"
      } w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 text-white text-xl grid place-items-center transition-colors`}
    >
      {isPrev ? "‹" : "›"}
    </button>
  );
}
