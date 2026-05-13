import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ComicCard } from "@/components/shared/comic-card";

interface SlackStatusResponse {
  status: "connected" | "disconnected" | "error";
  team_id?: string;
  team_name?: string;
  bot_user_id?: string;
  scope?: string;
  installed_at?: string;
  last_error?: string;
}

interface Props {
  slug: string;
}

export function SlackIntegrationCard({ slug }: Props) {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<SlackStatusResponse>({
    queryKey: ["slack-status", slug],
    queryFn: async () => {
      const res = await fetch(`/api/integrations/slack/status?slug=${encodeURIComponent(slug)}`);
      if (!res.ok) return { status: "disconnected" };
      return res.json();
    },
    enabled: Boolean(slug),
    staleTime: 15_000,
  });

  const disconnect = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/integrations/slack/disconnect?slug=${encodeURIComponent(slug)}`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("disconnect failed");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["slack-status", slug] }),
  });

  if (!slug) {
    return (
      <ComicCard className="p-4 mb-4">
        <h3 className="font-heading text-base text-navy mb-1">💬 Slack</h3>
        <p className="text-xs text-muted-foreground">Selecciona un cliente para conectar Slack.</p>
      </ComicCard>
    );
  }

  const connectUrl = `/api/integrations/slack/oauth/init?slug=${encodeURIComponent(slug)}`;
  const isConnected = data?.status === "connected";
  const installedDate = data?.installed_at
    ? new Date(data.installed_at).toLocaleString("es-ES", {
        day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
      })
    : null;

  return (
    <ComicCard className="p-4 mb-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-[220px]">
          <h3 className="font-heading text-base text-navy mb-1 flex items-center gap-2">
            💬 Slack
            {isConnected && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-green-600 text-white rounded">
                Conectado
              </span>
            )}
            {!isConnected && !isLoading && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-muted text-muted-foreground rounded">
                Sin conectar
              </span>
            )}
          </h3>
          <p className="text-xs text-muted-foreground">
            Conecta el workspace de Slack del cliente para recibir notificaciones, aprobar contenido y postear mensajes desde SanchoCMO.
          </p>

          {isConnected && (
            <div className="mt-2 text-xs space-y-0.5">
              <div>
                <span className="text-muted-foreground">Workspace:</span>{" "}
                <span className="font-bold">{data?.team_name || "—"}</span>
              </div>
              {installedDate && (
                <div>
                  <span className="text-muted-foreground">Conectado:</span>{" "}
                  <span>{installedDate}</span>
                </div>
              )}
              {data?.last_error && (
                <div className="text-red-600">
                  <span className="font-bold">Error:</span> {data.last_error}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2 flex-shrink-0">
          {!isConnected && (
            <a
              href={connectUrl}
              className="px-4 py-2 bg-gradient-to-br from-rust to-[#D4734F] text-white border-2 border-ink rounded-md text-[13px] font-bold shadow-comic cursor-pointer hover:shadow-comic-hover hover:-translate-x-px hover:-translate-y-px active:shadow-[1px_1px_0_var(--ink)] active:translate-x-px active:translate-y-px transition-all no-underline"
            >
              Conectar con Slack
            </a>
          )}
          {isConnected && (
            <>
              <a
                href={connectUrl}
                className="px-3 py-2 bg-background border-2 border-ink rounded-md text-[12px] font-bold cursor-pointer hover:bg-muted transition-colors no-underline"
              >
                Reconectar
              </a>
              <button
                onClick={() => {
                  if (confirm(`¿Desconectar Slack de "${slug}"? El bot dejará de recibir/postear hasta que se reconecte.`)) {
                    disconnect.mutate();
                  }
                }}
                disabled={disconnect.isPending}
                className="px-3 py-2 bg-background border-2 border-ink rounded-md text-[12px] font-bold cursor-pointer hover:bg-red-50 hover:border-red-500 transition-colors disabled:opacity-50"
              >
                {disconnect.isPending ? "Desconectando…" : "Desconectar"}
              </button>
            </>
          )}
        </div>
      </div>
    </ComicCard>
  );
}
