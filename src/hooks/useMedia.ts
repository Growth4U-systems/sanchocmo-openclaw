import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Draft } from "@/lib/data/drafts";

interface MediaResponse {
  ok: boolean;
  url?: string;
  draft?: Draft;
  error?: string;
}

function invalidateDraft(qc: ReturnType<typeof useQueryClient>, slug: string, ideaId: string, channel: string) {
  qc.invalidateQueries({ queryKey: ["draft", slug, ideaId, channel] });
  qc.invalidateQueries({ queryKey: ["drafts", slug, ideaId] });
}

export function useUploadMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { slug: string; ideaId: string; channel: string; file: File }) => {
      const fd = new FormData();
      fd.append("slug", vars.slug);
      fd.append("ideaId", vars.ideaId);
      fd.append("channel", vars.channel);
      fd.append("file", vars.file);
      const res = await fetch("/api/content-engine/upload-media", { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as MediaResponse;
      if (!res.ok || !data.ok) throw new Error(data.error || "Upload failed");
      return data;
    },
    onSuccess: (_d, v) => invalidateDraft(qc, v.slug, v.ideaId, v.channel),
  });
}

export function useGenerateImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      slug: string;
      ideaId: string;
      channel: string;
      prompt: string;
      aspectRatio?: string;
      providerId?: string;
      model?: string;
    }) => {
      const res = await fetch("/api/content-engine/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vars),
      });
      const data = (await res.json().catch(() => ({}))) as MediaResponse;
      if (!res.ok || !data.ok) throw new Error(data.error || "Generation failed");
      return data;
    },
    onSuccess: (_d, v) => invalidateDraft(qc, v.slug, v.ideaId, v.channel),
  });
}

export function useSetPrimaryMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { slug: string; ideaId: string; channel: string; url: string }) => {
      const res = await fetch("/api/content-engine/media", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...vars, primary: true }),
      });
      const data = (await res.json().catch(() => ({}))) as MediaResponse;
      if (!res.ok) throw new Error(data.error || "Failed to set primary");
      return data;
    },
    onSuccess: (_d, v) => invalidateDraft(qc, v.slug, v.ideaId, v.channel),
  });
}

export interface CarouselTemplateInfo {
  id: string;
  name: string;
  channel: string;
  description: string;
  slideCount: number;
  width: number;
  height: number;
  slots: Array<{
    key: string;
    label: string;
    multiline?: boolean;
    perSlide?: boolean;
    placeholder?: string;
    maxLength?: number;
  }>;
  preview?: {
    ratio?: number;
    variant: "gradient-navy" | "white-card" | "split-cover";
    lines: Array<{ kind: "badge" | "title" | "text" | "footer"; width?: number }>;
  } | null;
}

export function useCarouselTemplates(slug: string | null, channel: string | null) {
  return useQuery<CarouselTemplateInfo[]>({
    queryKey: ["carousel-templates", slug, channel],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (slug) params.set("slug", slug);
      if (channel) params.set("channel", channel);
      const res = await fetch(
        `/api/content-engine/carousel-templates?${params.toString()}`,
      );
      if (!res.ok) throw new Error("Failed to load templates");
      const data = (await res.json()) as { templates: CarouselTemplateInfo[] };
      return data.templates;
    },
    enabled: !!slug && !!channel,
    staleTime: 60_000,
  });
}

export function useRenderCarousel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      slug: string;
      ideaId: string;
      channel: string;
      templateId: string;
      slots: Record<string, string>;
      perSlide?: Record<string, string[]>;
    }) => {
      const res = await fetch("/api/content-engine/render-carousel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vars),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        urls?: string[];
        draft?: Draft;
        error?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error || "Carousel render failed");
      return data;
    },
    onSuccess: (_d, v) => invalidateDraft(qc, v.slug, v.ideaId, v.channel),
  });
}

export function useRemoveMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { slug: string; ideaId: string; channel: string; url: string }) => {
      const res = await fetch("/api/content-engine/media", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vars),
      });
      const data = (await res.json().catch(() => ({}))) as MediaResponse;
      if (!res.ok) throw new Error(data.error || "Failed to remove media");
      return data;
    },
    onSuccess: (_d, v) => invalidateDraft(qc, v.slug, v.ideaId, v.channel),
  });
}
