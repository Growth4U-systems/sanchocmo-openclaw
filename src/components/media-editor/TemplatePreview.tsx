"use client";

import { useEffect, useRef, useState } from "react";

interface TemplatePreviewProps {
  slug: string;
  templateId: string;
  fileKey: "template" | "slide-cover" | "slide-body" | "slide-cta";
  slots: Record<string, string>;
  perSlide: Record<string, string[]>;
  /** Visual style of the iframe wrapper. */
  variant?: "card" | "thumbnail";
  title?: string;
}

/**
 * Iframe with debounced (~250ms) live preview of a template, driven by
 * /api/content-engine/template-preview-html. Reused by:
 *  - TemplateEditBody in MediaEditor (Foundation authors editing slots/HTML)
 *  - TemplateViewer in Foundation (read-only, large)
 */
export function TemplatePreview({
  slug,
  templateId,
  fileKey,
  slots,
  perSlide,
  variant = "card",
  title,
}: TemplatePreviewProps) {
  const [html, setHtml] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [errored, setErrored] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/content-engine/template-preview-html", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug, id: templateId, file: fileKey, slots, perSlide }),
        });
        if (!res.ok) throw new Error(`preview ${res.status}`);
        setHtml(await res.text());
        setErrored(false);
      } catch {
        setErrored(true);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [slug, templateId, fileKey, slots, perSlide]);

  if (variant === "thumbnail") {
    return (
      <div className="relative w-full h-full bg-white">
        <iframe
          srcDoc={errored ? "" : html}
          className="absolute inset-0 w-full h-full pointer-events-none"
          sandbox="allow-same-origin"
          title={title ?? templateId}
        />
        {loading && !html && (
          <div className="absolute inset-0 grid place-items-center text-[10px] text-muted-foreground">
            …
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-0 bg-[#fafafa] dark:bg-[#181825] h-full">
      <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground bg-[#FAFAF8] dark:bg-[#181825] border-b border-[#E5E2DC] dark:border-[#313244] flex items-center justify-between shrink-0">
        <span>Preview · {title ?? templateId}</span>
        {loading && <span className="text-rust">●</span>}
      </div>
      <div className="flex-1 overflow-auto p-4">
        <iframe
          srcDoc={html}
          className="w-full h-full border border-[#E5E2DC] rounded-lg bg-white"
          sandbox="allow-same-origin"
          title={title ?? templateId}
        />
      </div>
    </div>
  );
}
