import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ContentConfig } from "@/lib/data/content-config";
import type {
  BrandBookSnapshot,
  EffectiveContentConfig,
} from "@/lib/data/content-config-effective";
import type { ImageProviderInfo } from "@/lib/image-gen/types";

export type { ContentConfig } from "@/lib/data/content-config";
export type { ConfigSource, EffectiveContentConfig } from "@/lib/data/content-config-effective";

export function useImageProviders(slug: string | null) {
  return useQuery<{ providers: ImageProviderInfo[]; config: ContentConfig["image_generation"] }>({
    queryKey: ["image-providers", slug],
    queryFn: async () => {
      const res = await fetch(`/api/content-engine/image-providers?slug=${slug}`);
      if (!res.ok) throw new Error("Failed to load image providers");
      return res.json();
    },
    enabled: !!slug,
    staleTime: 30_000,
  });
}

export function useContentConfig(slug: string | null) {
  return useQuery<ContentConfig>({
    queryKey: ["content-config", slug],
    queryFn: async () => {
      const res = await fetch(`/api/content-engine/setup-config?slug=${slug}`);
      if (!res.ok) throw new Error("Failed to load content config");
      const data = (await res.json()) as { config: ContentConfig };
      return data.config;
    },
    enabled: !!slug,
    staleTime: 30_000,
  });
}

interface SetupConfigResponse {
  config: ContentConfig;
  effective: EffectiveContentConfig;
  brand_book: BrandBookSnapshot;
}

/** Returns the override + the resolved (override → brand-book → default) view
 *  + a snapshot of what the brand-book actually contains. Used by the Setup
 *  panels to render the tri-state badge per field. */
export function useEffectiveContentConfig(slug: string | null) {
  return useQuery<SetupConfigResponse>({
    queryKey: ["content-config-effective", slug],
    queryFn: async () => {
      const res = await fetch(`/api/content-engine/setup-config?slug=${slug}`);
      if (!res.ok) throw new Error("Failed to load setup config");
      return res.json();
    },
    enabled: !!slug,
    staleTime: 30_000,
  });
}

export function useUpdateContentConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      slug: string;
      image_generation?: Partial<ContentConfig["image_generation"]>;
      carousel?: Partial<ContentConfig["carousel"]>;
    }) => {
      const res = await fetch("/api/content-engine/setup-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vars),
      });
      const data = (await res.json().catch(() => ({}))) as { config?: ContentConfig; error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to update");
      return data.config!;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["content-config", v.slug] });
      qc.invalidateQueries({ queryKey: ["content-config-effective", v.slug] });
      qc.invalidateQueries({ queryKey: ["image-providers", v.slug] });
      qc.invalidateQueries({ queryKey: ["carousel-templates"] });
      qc.invalidateQueries({ queryKey: ["carousel-templates-all", v.slug] });
    },
  });
}

interface CarouselTemplateAdminInfo {
  id: string;
  name: string;
  channel: string;
  description: string;
  slideCount: number;
  width: number;
  height: number;
  enabled: boolean;
  preview?: {
    ratio?: number;
    variant: "gradient-navy" | "white-card" | "split-cover";
    lines: Array<{ kind: "badge" | "title" | "text" | "footer"; width?: number }>;
  } | null;
}

export function useAllCarouselTemplates(slug: string | null) {
  return useQuery<CarouselTemplateAdminInfo[]>({
    queryKey: ["carousel-templates-all", slug],
    queryFn: async () => {
      const res = await fetch(`/api/content-engine/carousel-templates?slug=${slug}&all=1`);
      if (!res.ok) throw new Error("Failed to load templates");
      const data = (await res.json()) as { templates: CarouselTemplateAdminInfo[] };
      return data.templates;
    },
    enabled: !!slug,
    staleTime: 30_000,
  });
}
