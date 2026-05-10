"use client";

import { useEffect, useState } from "react";
import { SlotsForm } from "@/components/media-editor/SlotsForm";
import { TemplatePreview } from "@/components/media-editor/TemplatePreview";
import { useTemplateMeta } from "@/components/media-editor/useTemplateMeta";

interface TemplateEditBodyProps {
  slug: string;
  templateId: string;
  fileKey: "template" | "slide-cover" | "slide-body" | "slide-cta";
  htmlDocPath: string;
}

/** Body completo (sidebar + preview) para el modo template-edit: edición
 *  de la plantilla en sí. Sidebar tiene tabs Campos / Código. Preview live. */
export function TemplateEditBody({
  slug,
  templateId,
  fileKey,
  htmlDocPath,
}: TemplateEditBodyProps) {
  const {
    meta,
    metaError,
    slotValues,
    setSlotValues,
    perSlideValues,
    setPerSlideValues,
    grouped,
  } = useTemplateMeta(slug, templateId);

  const [showCode, setShowCode] = useState(false);
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [htmlDraft, setHtmlDraft] = useState<string>("");
  const [savingHtml, setSavingHtml] = useState(false);

  useEffect(() => {
    if (!showCode || htmlContent !== null) return;
    fetch(`/api/docs/${htmlDocPath}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && d.content) {
          setHtmlContent(d.content);
          setHtmlDraft(d.content);
        }
      })
      .catch(() => {});
  }, [showCode, htmlContent, htmlDocPath]);

  async function handleSaveHtml() {
    if (htmlContent === null || htmlDraft === htmlContent) return;
    setSavingHtml(true);
    try {
      const res = await fetch(`/api/docs/${htmlDocPath}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: htmlDraft }),
      });
      if (!res.ok) throw new Error("Save failed");
      setHtmlContent(htmlDraft);
      // Bump slot identity to refresh preview against the new on-disk HTML.
      setSlotValues((s) => ({ ...s }));
    } finally {
      setSavingHtml(false);
    }
  }

  if (metaError) {
    return (
      <div className="p-6 text-sm text-red-600 bg-red-50 border-2 border-red-200 rounded-lg m-4">
        Error cargando meta.json del template: {metaError}
      </div>
    );
  }
  if (!meta) {
    return <p className="text-sm text-muted-foreground p-6">Cargando plantilla...</p>;
  }

  const isHtmlDirty = htmlContent !== null && htmlDraft !== htmlContent;

  return (
    <div className="grid grid-cols-[420px_1fr] flex-1 min-h-0">
      <div className="flex flex-col min-h-0 border-r border-[#E5E2DC] dark:border-[#313244] bg-white dark:bg-[#1E1E2E]">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[#E5E2DC] dark:border-[#313244] bg-[#FAFAF8] dark:bg-[#181825]">
          <button
            type="button"
            onClick={() => setShowCode(false)}
            className={`px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider rounded-md transition-colors ${
              !showCode
                ? "bg-rust text-white"
                : "bg-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            ✏️ Campos
          </button>
          <button
            type="button"
            onClick={() => setShowCode(true)}
            className={`px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider rounded-md transition-colors ${
              showCode
                ? "bg-rust text-white"
                : "bg-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {"</>"} Código
          </button>
          <span className="ml-auto text-[10px] text-muted-foreground">
            {meta.width}×{meta.height} · {meta.slideCount} slide{meta.slideCount > 1 ? "s" : ""}
          </span>
        </div>

        {!showCode ? (
          <SlotsForm
            meta={meta}
            grouped={grouped}
            slotValues={slotValues}
            setSlotValues={setSlotValues}
            perSlideValues={perSlideValues}
            setPerSlideValues={setPerSlideValues}
            intro={
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Edita los textos y los ves al instante en la preview de la
                derecha. Estos valores son <strong>solo para probar</strong> —
                no se guardan, son para que veas cómo encaja cada longitud de
                texto.
              </p>
            }
          />
        ) : (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground bg-[#FAFAF8] dark:bg-[#181825] border-b border-[#E5E2DC] dark:border-[#313244] flex items-center justify-between">
              <span>{htmlDocPath.split("/").pop()}</span>
              {isHtmlDirty && <span className="text-rust">● sin guardar</span>}
            </div>
            <textarea
              value={htmlDraft}
              onChange={(e) => setHtmlDraft(e.target.value)}
              className="flex-1 w-full font-mono text-[12px] leading-relaxed p-3 bg-[#1e1e2e] text-[#cdd6f4] border-0 focus:outline-none resize-none"
              spellCheck={false}
              disabled={htmlContent === null}
            />
            <div className="px-3 py-2 border-t border-[#E5E2DC] dark:border-[#313244] bg-[#FAFAF8] dark:bg-[#181825]">
              <button
                type="button"
                onClick={handleSaveHtml}
                disabled={!isHtmlDirty || savingHtml}
                className={`w-full px-3 py-1.5 text-[12px] font-bold rounded-md transition-colors ${
                  isHtmlDirty
                    ? "bg-rust text-white hover:bg-rust/90"
                    : "bg-[#E5E2DC] dark:bg-[#313244] text-muted-foreground cursor-not-allowed"
                }`}
              >
                {savingHtml ? "Guardando..." : isHtmlDirty ? "💾 Guardar HTML" : "💾 Guardado"}
              </button>
            </div>
          </div>
        )}
      </div>

      <TemplatePreview
        slug={slug}
        templateId={templateId}
        fileKey={fileKey}
        slots={slotValues}
        perSlide={perSlideValues}
        title={meta.name}
      />
    </div>
  );
}
