import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Idea } from "@/types";

export function useIdeas(slug: string | null, filters?: { project?: string; unassigned?: boolean }) {
  const params = new URLSearchParams();
  if (slug) params.set("slug", slug);
  if (filters?.project) params.set("project", filters.project);
  if (filters?.unassigned) params.set("unassigned", "true");

  return useQuery<Record<string, Idea[]>>({
    queryKey: ["ideas", slug, filters],
    queryFn: async () => {
      const res = await fetch(`/api/ideas?${params}`);
      if (!res.ok) throw new Error("Failed to fetch ideas");
      return res.json();
    },
    enabled: !!slug,
    staleTime: 30_000,
  });
}

export function useCreateIdea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { slug: string; idea: Partial<Idea> }) => {
      const res = await fetch("/api/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to create idea");
      return res.json();
    },
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ["ideas", v.slug] }); },
  });
}

export function useUpdateIdeaStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { slug: string; ideaId: string; status: string; approvedBy?: string }) => {
      const res = await fetch("/api/ideas/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to update idea status");
      return res.json();
    },
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ["ideas", v.slug] }); },
  });
}

export function useDeleteIdea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { slug: string; ideaId: string }) => {
      const res = await fetch("/api/ideas", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to delete idea");
      return res.json();
    },
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ["ideas", v.slug] }); },
  });
}
