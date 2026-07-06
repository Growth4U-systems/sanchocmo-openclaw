"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Live preview of a carousel template — embeds the real HTML the renderer
 * would produce, scaled down to a card-sized thumbnail via CSS transform.
 *
 * Why iframe + scale instead of CSS mock or Playwright PNG:
 *   - Pixel-accurate to what's published. No drift between preview and real.
 *   - Cheap: same-origin HTML fetch, ~50-150ms in dev. No Playwright spin-up.
 *   - Self-updating: edit the template's HTML and the preview reflects it on
 *     reload, without invalidating any caches.
 *
 * The fallback (when `slug` or template id is missing, or for the brief
 * moment before the iframe loads) is a neutral box with the dimensions —
 * not the CSS-only mock we used to ship; that one was misleading.
 */

export function TemplateThumbnail({
  slug,
  templateId,
  width,
  height,
}: {
  slug: string;
  templateId: string;
  width: number;
  height: number;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const [loaded, setLoaded] = useState(false);

  // Compute the scale every time the wrapper resizes so the thumbnail looks
  // the same in mobile, desktop, and inside the slide-over.
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const update = () => {
      const w = wrapper.clientWidth;
      if (w > 0) setScale(w / width);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(wrapper);
    return () => ro.disconnect();
  }, [width]);

  const aspect = `${width} / ${height}`;
  const previewSrc = `/api/content-engine/template-preview-html?slug=${encodeURIComponent(slug)}&id=${encodeURIComponent(templateId)}`;

  return (
    <div
      ref={wrapperRef}
      className="w-full rounded border-2 relative overflow-hidden"
      style={{
        aspectRatio: aspect,
        borderColor: "var(--sc-ink)",
        boxShadow: "var(--pop-xs)",
        background: "var(--sc-paper-2)",
      }}
    >
      {/* Skeleton placeholder while the iframe loads. Faded out once loaded. */}
      <div
        className="absolute inset-0 grid place-items-center text-[10px] font-mono transition-opacity"
        style={{
          color: "var(--sc-fg-muted)",
          opacity: loaded ? 0 : 1,
        }}
      >
        {width}×{height}
      </div>

      <iframe
        src={previewSrc}
        title={`Preview ${templateId}`}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        sandbox="allow-same-origin"
        scrolling="no"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: `${width}px`,
          height: `${height}px`,
          border: 0,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          pointerEvents: "none",
          opacity: loaded ? 1 : 0,
          transition: "opacity 200ms ease",
        }}
      />
    </div>
  );
}
