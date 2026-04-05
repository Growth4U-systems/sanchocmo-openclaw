import { useQuery } from "@tanstack/react-query";

export function useMetricsPlan(slug: string | null) {
  return useQuery({
    queryKey: ["metrics-plan", slug],
    queryFn: async () => {
      const res = await fetch(`/api/metrics/plan?slug=${slug}`);
      if (!res.ok) throw new Error("Failed to fetch metrics plan");
      return res.json();
    },
    enabled: !!slug,
    staleTime: 60_000,
  });
}
