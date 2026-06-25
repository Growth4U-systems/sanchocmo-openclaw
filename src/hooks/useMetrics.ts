import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

// ── Collection cadence + health (SAN-300) ───────────────────────────────────

export type Cadence = "daily" | "weekly" | "twice_weekly" | "custom";

export interface CollectionScheduleItem {
  source: string;
  cadence: Cadence;
  daysOfWeek: number[];
  cronExpr: string | null;
  enabled: boolean;
}

/** Editable per-source collection cadence (defaults merged with overrides). */
export function useCollectionSchedule(slug: string | null) {
  return useQuery<{ slug: string; schedules: CollectionScheduleItem[] }>({
    queryKey: ["metrics-schedule", slug],
    queryFn: async () => {
      const res = await fetch(`/api/metrics/schedule?slug=${slug}`);
      if (!res.ok) throw new Error("Failed to fetch collection schedule");
      return res.json();
    },
    enabled: !!slug,
    staleTime: 60_000,
  });
}

/** Upsert one source's cadence; refreshes the schedule + health queries. */
export function useUpdateCollectionSchedule(slug: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (patch: { source: string } & Partial<Omit<CollectionScheduleItem, "source">>) => {
      const res = await fetch(`/api/metrics/schedule?slug=${slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("Failed to update collection schedule");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["metrics-schedule", slug] });
      queryClient.invalidateQueries({ queryKey: ["metrics-health", slug] });
    },
  });
}

export interface SourceHealthItem {
  source: string;
  cadence: Cadence;
  enabled: boolean;
  lastMetricDate: string | null;
  lastCollectedAt: string | null;
  ageDays: number | null;
  dueToday: boolean;
  overdue: boolean;
  lastStatus: string | null;
  lastError: string | null;
  lastDeletedCount: number | null;
  /** Known instrumentation problem for this source (PR2 · SAN-319) — see KNOWN_DIRTY. */
  knownDirty: boolean;
  dirtyReason?: string;
}

export interface MetricsHealthResult {
  configured: boolean;
  slug: string;
  generatedAt: string;
  sources: SourceHealthItem[];
  cron: { degraded: boolean; reasons: string[] };
  overall: "ok" | "stale" | "no-data";
}

/** Per-source collection health + global cron signal. */
export function useMetricsHealth(slug: string | null) {
  return useQuery<MetricsHealthResult>({
    queryKey: ["metrics-health", slug],
    queryFn: async () => {
      const res = await fetch(`/api/metrics/health?slug=${slug}`);
      if (!res.ok) throw new Error("Failed to fetch metrics health");
      return res.json();
    },
    enabled: !!slug,
    staleTime: 60_000,
  });
}
