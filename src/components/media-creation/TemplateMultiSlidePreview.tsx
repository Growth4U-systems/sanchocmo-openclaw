"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  slug: string;
  templateId: string;
  slideCount: number;
  width?: number;
  height?: number;
}

export function TemplateMultiSlidePreview({ slug, templateId, slideCount, width = 1080, height = 1350 }: Props) {
  const aspectRatio = `${width} / ${height}`;
  const total = Math.max(1, slideCount);
  const indices = Array.from({ length: total }, (_, i) => i);

  return (
    <div className="flex flex-col gap-3 p-3 bg-muted/10">
      {indices.map((i) => (
        <SlideFrame
          key={i}
          slug={slug}
          templateId={templateId}
          slideIndex={i}
          total={total}
          aspectRatio={aspectRatio}
        />
      ))}
    </div>
  );
}

function SlideFrame({
  slug,
  templateId,
  slideIndex,
  total,
  aspectRatio,
}: {
  slug: string;
  templateId: string;
  slideIndex: number;
  total: number;
  aspectRatio: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(slideIndex < 2);

  useEffect(() => {
    if (visible || !ref.current) return;
    const el = ref.current;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisible(true);
            obs.disconnect();
            break;
          }
        }
      },
      { rootMargin: "200px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [visible]);

  const src = `/api/content-engine/template-preview-html?slug=${encodeURIComponent(slug)}&id=${encodeURIComponent(templateId)}&slide=${slideIndex}`;
  const display = slideIndex + 1;

  return (
    <div ref={ref} className="relative">
      <div className="absolute top-2 left-2 z-10 text-[10px] font-mono text-white bg-black/60 px-1.5 py-0.5 rounded">
        {display}/{total}
      </div>
      <div
        className="w-full bg-white rounded-md overflow-hidden border border-border shadow-sm"
        style={{ aspectRatio }}
      >
        {visible ? (
          <iframe
            src={src}
            sandbox="allow-scripts"
            loading="lazy"
            className="w-full h-full bg-white"
            title={`${templateId} slide ${display}`}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
            Slide {display}…
          </div>
        )}
      </div>
    </div>
  );
}
