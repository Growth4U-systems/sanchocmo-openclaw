"use client";

import { useState } from "react";
import { useCarouselTemplates } from "@/hooks/useMedia";
import { MediaEditor } from "@/components/media-editor/MediaEditor";
import { TemplateThumbnail } from "@/components/content/TemplateThumbnail";

interface TemplateRendererProps {
  slug: string;
  ideaId: string;
  channel: string;
}

/**
 * Picker that lists templates available for the current channel and opens
 * the canonical MediaEditor (kind: template-render) on selection. Replaces
 * the older `CarouselComposer`.
 */
export function TemplateRenderer({ slug, ideaId, channel }: TemplateRendererProps) {
  const { data: templates, isLoading } = useCarouselTemplates(slug, channel);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (isLoading) {
    return <div className="text-xs text-muted-foreground">Cargando plantillas...</div>;
  }

  if (!templates || templates.length === 0) {
    return (
      <div className="border border-[#FCD34D] bg-[#FFFBEB] rounded-lg px-4 py-3 text-sm text-[#92400E] space-y-2">
        <p>
          <strong>
            Esta brand aún no tiene plantillas para <code>{channel}</code>.
          </strong>
        </p>
        <p className="text-xs">
          Las plantillas las produce la skill <code>{slug}-visual-generator</code>{" "}
          en su task del proyecto <code>P14-Content-Engine</code>. Pídele a
          Sancho en el chat que la ejecute para crear plantillas brand
          (carruseles, headers, ad creatives) reusables en cualquier draft.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="border border-[#E8E2D9] rounded-lg p-3 bg-[#FAFAF8]">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {templates.map((t) => (
            <TemplateThumbnail
              key={t.id}
              template={t}
              slug={slug}
              selected={t.id === selectedId}
              onSelect={() => setSelectedId(t.id)}
            />
          ))}
        </div>
      </div>

      {selectedId && (
        <MediaEditor
          asset={{ kind: "template-render", slug, ideaId, channel, templateId: selectedId }}
          onClose={() => setSelectedId(null)}
        />
      )}
    </>
  );
}
