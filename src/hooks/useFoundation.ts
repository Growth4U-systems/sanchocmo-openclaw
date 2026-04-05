import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { FoundationState, PillarStatus } from "@/types";

export function useFoundation(slug: string | null) {
  return useQuery<FoundationState>({
    queryKey: ["foundation", slug],
    queryFn: async () => {
      const res = await fetch(`/api/docs/brand/${slug}/foundation-state.json`);
      if (!res.ok) throw new Error("Failed to fetch foundation state");
      const data = await res.json();
      // The docs endpoint returns { ok, path, content } — content is the raw JSON string
      return typeof data.content === "string" ? JSON.parse(data.content) : data;
    },
    enabled: !!slug,
    staleTime: 30_000,
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
