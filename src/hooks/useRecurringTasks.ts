import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export function useRecurringTasks(slug: string | null) {
  return useQuery({
    queryKey: ["recurring-tasks", slug],
    queryFn: async () => {
      const res = await fetch(`/api/recurring-tasks?slug=${slug}`);
      if (!res.ok) throw new Error("Failed to fetch recurring tasks");
      return res.json();
    },
    enabled: !!slug,
    staleTime: 30_000,
  });
}

export function useCronRuns(slug: string | null, limit = 5) {
  return useQuery({
    queryKey: ["cron-runs", slug, limit],
    queryFn: async () => {
      const res = await fetch(`/api/cron-runs?slug=${slug}&limit=${limit}`);
      if (!res.ok) throw new Error("Failed to fetch cron runs");
      return res.json();
    },
    enabled: !!slug,
    staleTime: 30_000,
  });
}

export function useToggleRecurringTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { slug: string; taskId: string }) => {
      const res = await fetch("/api/recurring-tasks/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to toggle task");
      return res.json();
    },
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ["recurring-tasks", v.slug] }); },
  });
}
