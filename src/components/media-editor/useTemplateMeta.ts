"use client";

import { useEffect, useMemo, useState } from "react";
import { parseTemplateMeta } from "@/lib/carousel/parse-meta";

export interface TemplateMetaSlot {
  key: string;
  label: string;
  multiline?: boolean;
  perSlide?: boolean;
  placeholder?: string;
  maxLength?: number;
}

export interface TemplateMeta {
  id: string;
  name: string;
  slideCount: number;
  width: number;
  height: number;
  slots: TemplateMetaSlot[];
}

interface UseTemplateMetaResult {
  meta: TemplateMeta | null;
  metaError: string | null;
  slotValues: Record<string, string>;
  setSlotValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  perSlideValues: Record<string, string[]>;
  setPerSlideValues: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  grouped: { global: TemplateMetaSlot[]; perSlide: TemplateMetaSlot[] };
}

/** Loads meta.json for a template and seeds slot/perSlide state with the
 *  declared placeholders. Used by TemplateSlotsSidebar and TemplateEditSidebar
 *  so both share the same fetch + init logic. */
export function useTemplateMeta(
  slug: string,
  templateId: string,
): UseTemplateMetaResult {
  const [meta, setMeta] = useState<TemplateMeta | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);

  useEffect(() => {
    const path = `brand/${slug}/brand-book/visual-identity/templates/${templateId}/meta.json`;
    fetch(`/api/docs/${path}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) throw new Error(d.error || "no meta");
        try {
          setMeta(parseTemplateMeta(JSON.parse(d.content), templateId) as TemplateMeta);
        } catch {
          setMetaError("meta.json no parseable");
        }
      })
      .catch((e) => setMetaError((e as Error).message));
  }, [slug, templateId]);

  const [slotValues, setSlotValues] = useState<Record<string, string>>({});
  const [perSlideValues, setPerSlideValues] = useState<Record<string, string[]>>({});

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

  const grouped = useMemo(() => {
    if (!meta) return { global: [] as TemplateMetaSlot[], perSlide: [] as TemplateMetaSlot[] };
    return {
      global: meta.slots.filter((s) => !s.perSlide),
      perSlide: meta.slots.filter((s) => s.perSlide),
    };
  }, [meta]);

  return {
    meta,
    metaError,
    slotValues,
    setSlotValues,
    perSlideValues,
    setPerSlideValues,
    grouped,
  };
}
