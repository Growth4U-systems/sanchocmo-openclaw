import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { BrandBrainState, TaskStatus } from "@/types";

export interface OtherDocEntry {
  name: string;
  path: string;
  fullPath: string;
  /** HTML-canonical sibling exists for this .md (SAN-149) */
  hasHtml?: boolean;
}

export interface OtherDocGroup {
  folder: string;
  label: string;
  docs: OtherDocEntry[];
}

export function useBrandBrain(slug: string | null) {
  return useQuery<BrandBrainState>({
    queryKey: ["brand-brain", slug],
    queryFn: async () => {
      const res = await fetch(`/api/brand-brain/state?slug=${slug}`);
      if (!res.ok) throw new Error("Failed to fetch brand brain state");
      return res.json();
    },
    enabled: !!slug,
    staleTime: 30_000,
  });
}

export function useBrandBrainOtherDocs(slug: string | null) {
  return useQuery<OtherDocGroup[]>({
    queryKey: ["brand-brain-other-docs", slug],
    queryFn: async () => {
      const res = await fetch(`/api/brand-brain/other-docs?slug=${slug}`);
      if (!res.ok) throw new Error("Failed to fetch other docs");
      const data = await res.json();
      return data.groups || [];
    },
    enabled: !!slug,
    staleTime: 60_000,
  });
}

export function useUpdatePillarStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      slug,
      section,
      pillar,
      status,
      comment,
    }: {
      slug: string;
      section: string;
      pillar: string;
      status: TaskStatus;
      comment?: string;
    }) => {
      const res = await fetch("/api/brand-brain/pillar-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, section, pillar, status, comment }),
      });
      if (!res.ok) throw new Error("Failed to update pillar status");
      return res.json();
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["brand-brain", vars.slug] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "stats", vars.slug] });
    },
  });
}
