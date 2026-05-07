"use client";

import { useQuery } from "@tanstack/react-query";

interface AccountInfo {
  brand_name: string | null;
  brand_id: string;
  networks: Array<{ network: string; handle?: string | null; connected: boolean }>;
}

const NETWORK_VISUAL: Record<string, { emoji: string; label: string }> = {
  linkedin:  { emoji: "💼", label: "LinkedIn" },
  twitter:   { emoji: "🐦", label: "X" },
  instagram: { emoji: "📷", label: "Instagram" },
  facebook:  { emoji: "📘", label: "Facebook" },
  tiktok:    { emoji: "🎵", label: "TikTok" },
  youtube:   { emoji: "📺", label: "YouTube" },
};

/**
 * Shared "publishing on this Metricool brand" badge. Reused in:
 *  - Calendar tab header
 *  - ScheduleConfirmModal (under provider selector)
 *  - PublishingSetupPanel (Engine setup row)
 *  - ConnectPublishingButton slide-over (footer of the connect panel)
 *
 * Renders a one-line summary by default. Pass `variant="full"` for the
 * expanded list of networks with handles.
 *
 * Silent on error/loading — the surrounding UI shouldn't crash because the
 * Metricool API is flaky. Empty state fades gracefully.
 */
export function PublishingAccountInfo({
  slug,
  variant = "compact",
}: {
  slug: string;
  variant?: "compact" | "full";
}) {
  const { data, isLoading, isError } = useQuery<{ ok: true; info: AccountInfo } | { ok: false; error: string }>({
    queryKey: ["publishing", "account-info", slug],
    queryFn: async () => {
      const res = await fetch(`/api/publishing/account-info?slug=${slug}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return { ok: false as const, error: data.error || `HTTP ${res.status}` };
      }
      return res.json();
    },
    staleTime: 5 * 60_000,
    retry: false,
  });

  if (isLoading || isError || !data) return null;
  if (!("info" in data)) {
    if (variant === "full") {
      return (
        <p className="text-[11px]" style={{ color: "var(--sc-fg-muted)" }}>
          No se pudo leer la cuenta de Metricool: {("error" in data && data.error) || "desconocido"}
        </p>
      );
    }
    return null;
  }

  const info = data.info;
  const connected = info.networks.filter((n) => n.connected);

  if (variant === "compact") {
    return (
      <span
        className="inline-flex items-center gap-1.5 font-mono text-[11px] px-2 py-0.5 rounded-sc-pill border whitespace-nowrap"
        style={{ background: "var(--sc-paper-3)", borderColor: "var(--sc-ink)", color: "var(--sc-ink)" }}
        title={`Brand: ${info.brand_name || info.brand_id}\nRedes: ${connected.map((n) => n.network).join(", ") || "ninguna"}`}
      >
        📡 {info.brand_name || `Blog ${info.brand_id}`}
        {connected.length > 0 && (
          <span style={{ color: "var(--sc-fg-muted)" }}>
            · {connected.map((n) => NETWORK_VISUAL[n.network]?.emoji || "·").join("")}
          </span>
        )}
      </span>
    );
  }

  // Full variant — used inside slide-overs / setup row
  return (
    <div
      className="rounded-sc-md border-2 px-3 py-2"
      style={{ background: "var(--sc-paper-2)", borderColor: "var(--sc-ink)" }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className="font-heading uppercase text-[10px] tracking-wider" style={{ color: "var(--sc-fg-muted)" }}>
          Cuenta Metricool conectada
        </span>
        <span
          className="font-heading text-[12px] font-bold"
          style={{ color: "var(--sc-ink)" }}
        >
          {info.brand_name || `Blog ${info.brand_id}`}
        </span>
      </div>
      {connected.length === 0 ? (
        <p className="text-[11px]" style={{ color: "var(--sc-rust-700)" }}>
          ⚠ Ninguna red social conectada en esta cuenta. Vincúlalas desde Metricool antes de programar.
        </p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {connected.map((n) => {
            const v = NETWORK_VISUAL[n.network] || { emoji: "·", label: n.network };
            return (
              <li key={n.network} className="text-[12px] flex items-center gap-1.5" style={{ color: "var(--sc-ink)" }}>
                <span>{v.emoji}</span>
                <span className="font-medium">{v.label}</span>
                {n.handle && <span style={{ color: "var(--sc-fg-muted)" }}>· {n.handle}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
