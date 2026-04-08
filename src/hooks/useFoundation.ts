import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { FoundationState, PillarStatus } from "@/types";

export interface OtherDocEntry {
  name: string;
  path: string;
  fullPath: string;
}

export interface OtherDocGroup {
  folder: string;
  label: string;
  docs: OtherDocEntry[];
}

export function useFoundation(slug: string | null) {
  return useQuery<FoundationState>({
    queryKey: ["foundation", slug],
    queryFn: async () => {
      const res = await fetch(`/api/foundation/state?slug=${slug}`);
      if (!res.ok) throw new Error("Failed to fetch foundation state");
      return res.json();
    },
    enabled: !!slug,
    staleTime: 30_000,
  });
}

export function useOtherDocs(slug: string | null) {
  return useQuery<OtherDocGroup[]>({
    queryKey: ["other-docs", slug],
    queryFn: async () => {
      const res = await fetch(`/api/foundation/other-docs?slug=${slug}`);
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
      status: PillarStatus;
      comment?: string;
    }) => {
      const res = await fetch("/api/foundation/pillar-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, section, pillar, status, comment }),
      });
      if (!res.ok) throw new Error("Failed to update pillar status");
      return res.json();
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["foundation", vars.slug] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "stats", vars.slug] });
    },
  });
}
