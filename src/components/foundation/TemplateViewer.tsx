"use client";

import { useState } from "react";
import { MediaEditor } from "@/components/media-editor/MediaEditor";
import { TemplatePreview } from "@/components/media-editor/TemplatePreview";
import { useTemplateMeta } from "@/components/media-editor/useTemplateMeta";

interface TemplateViewerProps {
  slug: string;
  templateId: string;
  fileKey: "template" | "slide-cover" | "slide-body" | "slide-cta";
  htmlDocPath: string;
}

/** Foundation read-only viewer for a template doc. Shows the rendered preview
 *  (with placeholder values from meta.json) plus a header with dimensions and
 *  an "Editar" button that opens the canonical MediaEditor in edit mode. */
export function TemplateViewer({
  slug,
  templateId,
  fileKey,
  htmlDocPath,
}: TemplateViewerProps) {
  const { meta, metaError, slotValues, perSlideValues } = useTemplateMeta(slug, templateId);
  const [editing, setEditing] = useState(false);

  if (metaError) {
    return (
      <div className="p-6 text-sm text-red-600 bg-red-50 border-2 border-red-200 rounded-lg">
        Error cargando meta.json del template: {metaError}
      </div>
    );
  }
  if (!meta) {
    return <p className="text-sm text-muted-foreground p-6">Cargando plantilla...</p>;
  }

  return (
    <>
      <div
        className="flex flex-col border border-[#E5E2DC] dark:border-[#313244] rounded-lg overflow-hidden bg-white"
        style={{ height: "calc(100vh - 180px)" }}
      >
        <header className="flex items-center justify-between px-4 py-2.5 border-b border-[#E5E2DC] dark:border-[#313244] bg-[#FAFAF8] dark:bg-[#181825] shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-base">🎨</span>
            <span className="font-semibold text-sm text-[#2C3E50] truncate">
              {meta.name}
            </span>
            <span className="text-[10px] text-muted-foreground ml-2">
              {meta.width}×{meta.height} · {meta.slideCount} slide
              {meta.slideCount > 1 ? "s" : ""}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-xs px-3 py-1.5 bg-rust text-white rounded-md font-medium hover:opacity-90 transition-opacity"
              title="Edita esta plantilla en el Media Editor"
            >
              ✏️ Editar
            </button>
            <a
              href={`/api/docs/${htmlDocPath}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs px-3 py-1.5 bg-white border border-[#E8E2D9] rounded-md hover:border-[#2C3E50]"
              title="Descarga el HTML"
            >
              📥 HTML
            </a>
          </div>
        </header>

        <TemplatePreview
          slug={slug}
          templateId={templateId}
          fileKey={fileKey}
          slots={slotValues}
          perSlide={perSlideValues}
          title={meta.name}
        />
      </div>

      {editing && (
        <MediaEditor
          asset={{ kind: "template-edit", slug, templateId, fileKey, htmlDocPath }}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  );
}
