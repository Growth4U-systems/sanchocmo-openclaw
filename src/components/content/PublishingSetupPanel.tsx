"use client";

import { useQuery } from "@tanstack/react-query";
import type { ProviderInfo } from "@/lib/publishing/types";
import { ConnectPublishingButton } from "@/components/content/ConnectPublishingButton";
import { PublishingAccountInfo } from "@/components/content/PublishingAccountInfo";

/**
 * Setup row inside `Engine > Configuración`. Mirrors the pattern of
 * ImageGenSetupPanel and CarouselSetupPanel: icon + summary + action button.
 *
 * The action here is the same `ConnectPublishingButton` used by PublishBar
 * and the empty state of PostingCalendarTab — single source of truth for
 * "conectar herramienta de publishing".
 */
export function PublishingSetupPanel({ slug }: { slug: string }) {
  const { data, isLoading } = useQuery<{ providers: ProviderInfo[] }>({
    queryKey: ["publishing", "providers-all", slug],
    queryFn: async () => {
      const res = await fetch(`/api/publishing/providers?slug=${slug}`);
      if (!res.ok) throw new Error("Failed to load providers");
      return res.json();
    },
    staleTime: 30_000,
  });

  const configured = (data?.providers || []).filter((p) => p.configured);
  const summary = isLoading
    ? "Cargando…"
    : configured.length > 0
    ? `Conectado: ${configured.map((p) => p.name).join(", ")}`
    : "Sin conectar";

  return (
    <div
      className="rounded-sc-md border-[2px] px-4 py-3 mb-3"
      style={{
        background: "var(--sc-paper-3)",
        borderColor: "var(--sc-ink)",
        boxShadow: "var(--pop-xs)",
      }}
    >
      <div className="grid grid-cols-[36px_1fr_auto] gap-3 items-center">
        <span
          className="grid place-items-center w-9 h-9 rounded-md border-2 text-base"
          style={{ background: "var(--sc-paper-2)", borderColor: "var(--sc-ink)" }}
        >
          📡
        </span>
        <div className="min-w-0">
          <div className="font-semibold text-sm" style={{ color: "var(--sc-ink)" }}>
            Herramienta de publishing · cómo se programan los posts
          </div>
          <div className="text-xs" style={{ color: "var(--sc-fg-muted)" }}>
            <span style={{ color: configured.length > 0 ? "var(--sc-sage-700)" : "var(--sc-rust-700)" }}>
              {summary}
            </span>
            <span> · usado por el calendario y el editor del draft</span>
          </div>
        </div>
        <ConnectPublishingButton
          slug={slug}
          variant={configured.length > 0 ? "ghost" : "warning"}
        >
          {configured.length > 0 ? "Editar →" : "⚠️ Conectar"}
        </ConnectPublishingButton>
      </div>
      {configured.some((p) => p.id === "metricool") && (
        <div className="mt-3 pl-12">
          <PublishingAccountInfo slug={slug} variant="full" />
        </div>
      )}
    </div>
  );
}
