"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ProviderInfo } from "@/lib/publishing/types";
import { ApiConnectPanel } from "@/components/settings/api-connect-panel";
import { PublishingAccountInfo } from "@/components/content/PublishingAccountInfo";
import { ConfigRow } from "@/components/content/config/ConfigRow";
import { ConfigSheet } from "@/components/content/config/ConfigSheet";
import { EditButton } from "@/components/content/config/EditButton";

/**
 * "Herramienta de publishing" row en `Engine > Configuración § Producción`.
 * Resumen + Editar → ConfigSheet con ApiConnectPanel + PublishingAccountInfo.
 */
export function PublishingSetupPanel({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();

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
  const isConnected = configured.length > 0;
  const summary = isLoading
    ? "Cargando…"
    : isConnected
    ? `Conectado: ${configured.map((p) => p.name).join(", ")}`
    : "Sin conectar";

  const close = () => {
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["api-health"] });
    qc.invalidateQueries({ queryKey: ["publishProviders"] });
  };

  return (
    <>
      <ConfigRow
        icon="📡"
        title="Herramienta de publishing · cómo se programan los posts"
        sub={
          <>
            <span style={{ color: isConnected ? "var(--sc-sage-700)" : "var(--sc-rust-700)" }}>
              {summary}
            </span>
            <span> · usado por el calendario y el editor del draft</span>
          </>
        }
        right={
          <EditButton onClick={() => setOpen(true)} variant={isConnected ? "default" : "warning"}>
            {isConnected ? "Editar →" : "⚠️ Conectar"}
          </EditButton>
        }
        footer={
          isConnected && configured.some((p) => p.id === "metricool") ? (
            <PublishingAccountInfo slug={slug} variant="full" />
          ) : undefined
        }
      />

      <ConfigSheet open={open} onOpenChange={(o) => (o ? setOpen(true) : close())} icon="🔌" title="Conectar Metricool">
        <ApiConnectPanel slug={slug} apiId="metricool" onClose={close} />
        <div className="mt-4">
          <PublishingAccountInfo slug={slug} variant="full" />
        </div>
      </ConfigSheet>
    </>
  );
}
