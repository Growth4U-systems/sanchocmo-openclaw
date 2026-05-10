"use client";

import { useQuery } from "@tanstack/react-query";
import type { PostMetricsSnapshot } from "@/lib/data/drafts";

interface PostMetricsLegacy {
  impressions: number;
  likes: number;
  clicks: number;
  engagement: number;
  network: string;
  url: string;
  measured_at: string;
}

/**
 * Engagement snapshot for a published post.
 *
 * Source priority:
 *   1. `metrics` prop — when the calendar event already carries the
 *      `publishing.metrics` snapshot from the draft frontmatter (the new
 *      flow). Fast: zero network calls.
 *   2. `/api/publishing/post-metrics` lookup against the daily metrics
 *      files (legacy fallback for drafts published before the cron started
 *      writing snapshots into the frontmatter).
 *
 * Both paths render the same UI. Renders nothing if no metrics found
 * unless `verbose` is set, in which case it shows the "still being
 * measured" message.
 */
export function PostMetricsBadge({
  slug,
  externalUrl,
  metrics,
  verbose = false,
}: {
  slug: string;
  externalUrl: string | null | undefined;
  metrics?: PostMetricsSnapshot;
  verbose?: boolean;
}) {
  const hasFrontmatter = !!metrics;

  const { data, isLoading } = useQuery<{ ok: true; found: boolean; metrics?: PostMetricsLegacy }>({
    queryKey: ["publishing", "post-metrics", slug, externalUrl],
    queryFn: async () => {
      const qs = new URLSearchParams({ slug, externalUrl: externalUrl! });
      const res = await fetch(`/api/publishing/post-metrics?${qs}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    // Skip the API hit when we already have fresh metrics in the frontmatter.
    enabled: !!externalUrl && !hasFrontmatter,
    staleTime: 5 * 60_000,
    retry: false,
  });

  if (!externalUrl) return null;

  // Normalize the two shapes into a common viewmodel.
  const view = metrics
    ? {
        impressions: metrics.impressions,
        likes: metrics.likes,
        clicks: metrics.clicks,
        engagement: metrics.engagement_pct,
        measured_at: metrics.measured_at,
      }
    : data?.found && data.metrics
      ? {
          impressions: data.metrics.impressions,
          likes: data.metrics.likes,
          clicks: data.metrics.clicks,
          engagement: data.metrics.engagement,
          measured_at: data.metrics.measured_at,
        }
      : null;

  if (!view) {
    if (isLoading) return null;
    if (!verbose) return null;
    return (
      <p className="text-[11px]" style={{ color: "var(--sc-fg-muted)" }}>
        ⏳ Sin métricas todavía. Las recoge el cron <code>metrics-collector</code> al pasar por aquí.
      </p>
    );
  }

  const measuredDate = new Date(view.measured_at).toLocaleDateString("es-ES", {
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
        <span className="font-mono text-[10px]" style={{ color: "var(--sc-fg-muted)" }} title={view.measured_at}>
          medido {measuredDate}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <Stat label="Impresiones" value={view.impressions} />
        <Stat label="Likes" value={view.likes} />
        <Stat label="Clicks" value={view.clicks} />
        <Stat label="Eng %" value={view.engagement.toFixed(1)} />
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
