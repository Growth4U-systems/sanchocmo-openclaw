"use client";

import { useQuery } from "@tanstack/react-query";

interface Brand {
  id: string;
  name: string | null;
  networks: Array<{ network: string; handle?: string | null; connected: boolean }>;
}

const NET_EMOJI: Record<string, string> = {
  linkedin: "💼",
  twitter: "𝕏",
  instagram: "📷",
  facebook: "📘",
  tiktok: "🎵",
  youtube: "📺",
};

/**
 * SAN-162 — lists the Metricool brands the user can publish from, each with its
 * `blogId`. The operator copies a blogId into a voice's `metricool_profile_id`
 * when adding a founder-led voice, so each voice publishes from its own brand.
 * Silent on error / empty so it never breaks the surrounding section.
 */
export function MetricoolBrandsList({ slug }: { slug: string }) {
  const { data } = useQuery<{ ok: true; brands: Brand[] } | { ok: false; error: string }>({
    queryKey: ["publishing", "metricool-brands", slug],
    queryFn: async () => {
      const res = await fetch(`/api/publishing/metricool-brands?slug=${slug}`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        return { ok: false as const, error: d.error || `HTTP ${res.status}` };
      }
      return res.json();
    },
    staleTime: 5 * 60_000,
    retry: false,
  });

  if (!data || !("brands" in data) || data.brands.length === 0) return null;

  return (
    <details className="mt-2 text-[12px]">
      <summary className="cursor-pointer font-semibold text-muted-foreground">
        🔌 Cuentas Metricool disponibles ({data.brands.length}) — el <code>blogId</code> es el{" "}
        <code>metricool_profile_id</code> de la voz
      </summary>
      <ul className="mt-1.5 space-y-1">
        {data.brands.map((b) => {
          const nets = b.networks.filter((n) => n.connected);
          return (
            <li
              key={b.id}
              className="flex items-center gap-2 flex-wrap border-2 border-ink/20 rounded px-2 py-1 bg-muted/20"
            >
              <span className="font-bold">{b.name || `Brand ${b.id}`}</span>
              <code className="text-[11px] bg-card border border-ink/30 rounded px-1.5">blogId {b.id}</code>
              {nets.length > 0 && (
                <span className="text-muted-foreground">
                  {nets.map((n) => NET_EMOJI[n.network] || "·").join(" ")}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </details>
  );
}
