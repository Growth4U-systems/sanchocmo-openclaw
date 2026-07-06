import { useQuery } from "@tanstack/react-query";

interface GlobalStats {
  activeClients: number;
  totalPillars: number;
  approvedPillars: number;
  totalProjects: number;
  activeProjects: number;
  pendingTasks: number;
  totalIdeas: number;
}

interface ClientStats {
  slug: string;
  totalPillars: number;
  approvedPillars: number;
  totalProjects: number;
  activeProjects: number;
  pendingTasks: number;
  totalIdeas: number;
  brandSummary: {
    company_name: string;
    sector: string;
    description: string;
    north_star: string;
  };
}

export function useGlobalStats() {
  return useQuery<GlobalStats>({
    queryKey: ["dashboard", "stats", "global"],
    queryFn: async () => {
      const res = await fetch("/api/dashboard/stats");
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
    staleTime: 30_000,
  });
}

export function useClientStats(slug: string | null) {
  return useQuery<ClientStats>({
    queryKey: ["dashboard", "stats", slug],
    queryFn: async () => {
      const res = await fetch(`/api/dashboard/stats?slug=${slug}`);
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
    enabled: !!slug,
    staleTime: 30_000,
  });
}
