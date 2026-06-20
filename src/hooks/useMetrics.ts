import { useQuery } from "@tanstack/react-query";
import type { DashboardDefinition } from "@/lib/metrics/dashboard-schema";
import type { SurfaceKey } from "@/lib/metrics/surfaces";

// Client-facing shapes returned by the read endpoints. Declared locally (type-only)
// so the client bundle never pulls in the server-only data modules (fs/drizzle).
export interface DashboardVersionMeta {
  version: number;
  date: string;
  trigger: string;
  changes?: string;
}

export interface DashboardRecord {
  configured: boolean;
  slug: string;
  version: number;
  definition: DashboardDefinition | null;
  versions: DashboardVersionMeta[];
}

export interface SurfaceSummaryEntry {
  surface: SurfaceKey;
  name: string;
  emoji: string;
  connected: boolean;
  sources: string[];
  metrics: Array<{ source: string; metric: string; value: number | null; date: string }>;
}

export interface SurfaceSummaryResult {
  configured: boolean;
  surfaces: SurfaceSummaryEntry[];
}

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

/** Active versioned dashboard definition — the render tree for the metrics tabs. */
export function useDashboardDefinition(slug: string | null) {
  return useQuery<DashboardRecord>({
    queryKey: ["metrics-dashboard", slug],
    queryFn: async () => {
      const res = await fetch(`/api/metrics/dashboard?slug=${slug}`);
      if (!res.ok) throw new Error("Failed to fetch dashboard definition");
      return res.json();
    },
    enabled: !!slug,
    staleTime: 60_000,
  });
}

/** Per-surface connection state + latest values from the metric_snapshots store. */
export function useSurfaceSummary(slug: string | null) {
  return useQuery<SurfaceSummaryResult>({
    queryKey: ["metrics-surfaces", slug],
    queryFn: async () => {
      const res = await fetch(`/api/metrics/timeseries?view=surfaces&slug=${slug}`);
      if (!res.ok) throw new Error("Failed to fetch surface summary");
      return res.json();
    },
    enabled: !!slug,
    staleTime: 60_000,
  });
}
