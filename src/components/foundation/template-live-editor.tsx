"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { parseTemplateMeta } from "@/lib/carousel/parse-meta";

/**
 * Live editor for a carousel template HTML. Two modes:
 *
 *   • Slots (default): one input per slot declared in `meta.json`. Edit the
 *     value and the iframe preview re-renders within ~250ms (debounced POST
 *     to /api/content-engine/template-preview-html). Nothing is persisted —
 *     these are just preview-time values so you can stress-test the layout.
 *
 *   • HTML (toggle "</> Código"): textarea with the raw template.html for
 *     power users who want to tweak the markup. Save persists to disk via
 *     PUT /api/docs/{path}.
 *
 * The component is mounted by `foundation.tsx` whenever the user opens a
 * file under `brand/{slug}/brand-book/visual-identity/templates/{id}/...`.
 */

interface SlotDef {
  key: string;
  label: string;
  multiline?: boolean;
  perSlide?: boolean;
  placeholder?: string;
  maxLength?: number;
}

interface MetaShape {
  id: string;
  name: string;
  slideCount: number;
  width: number;
  height: number;
  slots: SlotDef[];
}

interface TemplateLiveEditorProps {
  slug: string;
  templateId: string;
  /** "template" | "slide-cover" | "slide-body" | "slide-cta" — which file
   *  the user opened from Foundation. The preview tries to render that
   *  particular slide; if the user is on slide-cta, the slot for "cta_*"
   *  becomes prominent etc. */
  fileKey: "template" | "slide-cover" | "slide-body" | "slide-cta";
  /** Path to the template.html / slide-*.html file (`brand/{slug}/...`).
   *  Used by the "</> Código" mode for save. */
  htmlDocPath: string;
}

export function TemplateLiveEditor({
  slug,
  templateId,
  fileKey,
  htmlDocPath,
}: TemplateLiveEditorProps) {
  // ── Meta ────────────────────────────────────────────────────────
  const [meta, setMeta] = useState<MetaShape | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  useEffect(() => {
    const metaPath = `brand/${slug}/brand-book/visual-identity/templates/${templateId}/meta.json`;
    fetch(`/api/docs/${metaPath}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) throw new Error(d.error || "no meta");
        try {
          // parseTemplateMeta normalizes both the canonical and the
          // snake_case/object shape that some skill-emitted meta.json
          // files use, so the rest of the component can assume the
          // array form regardless of source.
          setMeta(parseTemplateMeta(JSON.parse(d.content), templateId));
        } catch {
          setMetaError("meta.json no parseable");
        }
      })
      .catch((e) => setMetaError(e.message));
  }, [slug, templateId]);

  // ── Slot values + per-slide values ──────────────────────────────
  const [slotValues, setSlotValues] = useState<Record<string, string>>({});
  const [perSlideValues, setPerSlideValues] = useState<Record<string, string[]>>({});
  // Initialize from meta placeholders the first time meta arrives.
  useEffect(() => {
    if (!meta) return;
    const initSlots: Record<string, string> = {};
    const initPerSlide: Record<string, string[]> = {};
    for (const s of meta.slots) {
      const fallback = s.placeholder || s.label || "";
      if (s.perSlide) {
        initPerSlide[s.key] = Array.from({ length: meta.slideCount }, (_, i) =>
          meta.slideCount > 1 ? `${fallback} (slide ${i + 1})` : fallback,
        );
      } else {
        initSlots[s.key] = fallback;
      }
    }
    setSlotValues(initSlots);
    setPerSlideValues(initPerSlide);
  }, [meta]);

  // ── Live preview (debounced fetch → srcDoc) ─────────────────────
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!meta) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const res = await fetch("/api/content-engine/template-preview-html", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slug,
            id: templateId,
            file: fileKey,
            slots: slotValues,
            perSlide: perSlideValues,
          }),
        });
        const html = await res.text();
        setPreviewHtml(html);
      } catch {
        /* keep previous preview */
      } finally {
        setPreviewLoading(false);
      }
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [slug, templateId, fileKey, slotValues, perSlideValues, meta]);

  // ── HTML mode ──────────────────────────────────────────────────
  const [showCode, setShowCode] = useState(false);
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [htmlDraft, setHtmlDraft] = useState<string>("");
  const [savingHtml, setSavingHtml] = useState(false);
  // Lazy-load the HTML when the user toggles into "code" mode.
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
      // Re-trigger preview by nudging slotValues identity; the iframe will
      // get a new POST with the same slots but the on-disk template HTML
      // changed, so the substitution result is fresh.
      setSlotValues((s) => ({ ...s }));
    } finally {
      setSavingHtml(false);
    }
  }

  // ── Slot organization ──────────────────────────────────────────
  // For multi-slide templates we group slots by "scope": global, per-slide.
  const grouped = useMemo(() => {
    if (!meta) return { global: [] as SlotDef[], perSlide: [] as SlotDef[] };
    return {
      global: meta.slots.filter((s) => !s.perSlide),
      perSlide: meta.slots.filter((s) => s.perSlide),
    };
  }, [meta]);

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

  const isHtmlDirty = htmlContent !== null && htmlDraft !== htmlContent;

  return (
    <div
      className="grid grid-cols-[420px_1fr] gap-0 border border-[#E5E2DC] dark:border-[#313244] rounded-lg overflow-hidden"
      style={{ height: "calc(100vh - 180px)" }}
    >
      {/* ─────── LEFT: slots form OR HTML editor ─────── */}
      <div className="flex flex-col min-h-0 border-r border-[#E5E2DC] dark:border-[#313244] bg-white dark:bg-[#1E1E2E]">
        {/* Tab bar */}
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

        {/* Body */}
        {!showCode ? (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Edita los textos y los ves al instante en la preview de la derecha. Estos valores
              son <strong>solo para probar</strong> — no se guardan, son para que veas cómo encaja
              cada longitud de texto.
            </p>

            {grouped.global.length > 0 && (
              <fieldset className="space-y-3">
                <legend className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Campos globales
                </legend>
                {grouped.global.map((slot) => (
                  <SlotInput
                    key={slot.key}
                    slot={slot}
                    value={slotValues[slot.key] || ""}
                    onChange={(v) => setSlotValues((s) => ({ ...s, [slot.key]: v }))}
                  />
                ))}
              </fieldset>
            )}

            {grouped.perSlide.length > 0 && meta.slideCount > 1 && (
              <fieldset className="space-y-3 pt-3 border-t border-[#E5E2DC] dark:border-[#313244]">
                <legend className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Por slide ({meta.slideCount})
                </legend>
                {Array.from({ length: meta.slideCount }).map((_, slideIdx) => (
                  <div
                    key={slideIdx}
                    className="rounded-md border border-[#E5E2DC] dark:border-[#313244] p-2.5 space-y-2"
                  >
                    <div className="text-[10px] font-bold uppercase tracking-wider text-rust">
                      Slide {slideIdx + 1}
                      {slideIdx === 0 ? " · cover" : slideIdx === meta.slideCount - 1 ? " · cta" : " · body"}
                    </div>
                    {grouped.perSlide.map((slot) => (
                      <SlotInput
                        key={`${slot.key}-${slideIdx}`}
                        slot={slot}
                        value={perSlideValues[slot.key]?.[slideIdx] || ""}
                        onChange={(v) =>
                          setPerSlideValues((p) => {
                            const arr = [...(p[slot.key] || [])];
                            arr[slideIdx] = v;
                            return { ...p, [slot.key]: arr };
                          })
                        }
                      />
                    ))}
                  </div>
                ))}
              </fieldset>
            )}
          </div>
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

      {/* ─────── RIGHT: live preview iframe ─────── */}
      <div className="flex flex-col min-h-0 bg-[#fafafa] dark:bg-[#181825]">
        <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground bg-[#FAFAF8] dark:bg-[#181825] border-b border-[#E5E2DC] dark:border-[#313244] flex items-center justify-between">
          <span>Preview · {meta.name}</span>
          {previewLoading && <span className="text-rust">●</span>}
        </div>
        <div className="flex-1 overflow-auto p-4">
          <iframe
            srcDoc={previewHtml}
            className="w-full h-full border border-[#E5E2DC] rounded-lg bg-white"
            sandbox="allow-same-origin"
            title={meta.name}
          />
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Slot input — multiline → textarea, otherwise → text input
// ────────────────────────────────────────────────────────────────────
function SlotInput({
  slot,
  value,
  onChange,
}: {
  slot: SlotDef;
  value: string;
  onChange: (v: string) => void;
}) {
  const counter = slot.maxLength ? `${value.length}/${slot.maxLength}` : null;
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <label className="text-[11px] font-semibold text-foreground">{slot.label}</label>
        {counter && (
          <span className="text-[10px] font-mono text-muted-foreground">{counter}</span>
        )}
      </div>
      {slot.multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={slot.maxLength}
          placeholder={slot.placeholder}
          rows={2}
          className="w-full px-2 py-1.5 text-sm border border-[#E5E2DC] dark:border-[#313244] rounded-md bg-white dark:bg-[#181825] focus:outline-none focus:border-rust resize-y"
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={slot.maxLength}
          placeholder={slot.placeholder}
          className="w-full px-2 py-1.5 text-sm border border-[#E5E2DC] dark:border-[#313244] rounded-md bg-white dark:bg-[#181825] focus:outline-none focus:border-rust"
        />
      )}
    </div>
  );
}
