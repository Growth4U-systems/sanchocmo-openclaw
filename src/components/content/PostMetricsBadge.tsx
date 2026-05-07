"use client";

import { useQuery } from "@tanstack/react-query";

interface PostMetrics {
  impressions: number;
  likes: number;
  clicks: number;
  engagement: number;
  network: string;
  url: string;
  measured_at: string;
}

/**
 * Engagement snapshot for a published post. Reads from the daily Metricool
 * metrics files via `/api/publishing/post-metrics`. The metrics-collector
 * cron writes those files; this component is just a viewer.
 *
 * Renders nothing if the post hasn't been measured yet (e.g. published
 * minutes ago and the cron hasn't run since). Surfaces "sin métricas
 * todavía — el cron diario las recoge" only when explicitly told to via
 * `verbose`.
 */
export function PostMetricsBadge({
  slug,
  externalUrl,
  verbose = false,
}: {
  slug: string;
  externalUrl: string | null | undefined;
  verbose?: boolean;
}) {
  const { data, isLoading } = useQuery<{ ok: true; found: boolean; metrics?: PostMetrics }>({
    queryKey: ["publishing", "post-metrics", slug, externalUrl],
    queryFn: async () => {
      const qs = new URLSearchParams({ slug, externalUrl: externalUrl! });
      const res = await fetch(`/api/publishing/post-metrics?${qs}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    enabled: !!externalUrl,
    staleTime: 5 * 60_000,
    retry: false,
  });

  if (!externalUrl) return null;
  if (isLoading) return null;
  if (!data?.found || !data.metrics) {
    if (!verbose) return null;
    return (
      <p className="text-[11px]" style={{ color: "var(--sc-fg-muted)" }}>
        ⏳ Sin métricas todavía. Las recoge el cron <code>metrics-collector</code> al pasar por aquí.
      </p>
    );
  }

  const m = data.metrics;
  const measuredDate = new Date(m.measured_at).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
  });

  return (
    <div
      className="rounded-sc-md border-2 px-3 py-2"
      style={{ background: "var(--sc-paper-2)", borderColor: "var(--sc-ink)" }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-heading uppercase text-[10px] tracking-wider" style={{ color: "var(--sc-fg-muted)" }}>
          Engagement (Metricool)
        </span>
        <span className="font-mono text-[10px]" style={{ color: "var(--sc-fg-muted)" }} title={m.measured_at}>
          medido {measuredDate}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <Stat label="Impresiones" value={m.impressions} />
        <Stat label="Likes" value={m.likes} />
        <Stat label="Clicks" value={m.clicks} />
        <Stat label="Eng %" value={m.engagement.toFixed(1)} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="text-center">
      <div className="font-heading text-[16px] font-bold" style={{ color: "var(--sc-ink)" }}>
        {typeof value === "number" ? formatNumber(value) : value}
      </div>
      <div className="text-[9px] uppercase tracking-wider" style={{ color: "var(--sc-fg-muted)" }}>
        {label}
      </div>
    </div>
  );
}

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
