"use client";

import { Loader2, Network, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface OutboundCampaignSetupOption {
  id: string;
  title: string;
  label: string;
  description: string;
  ecpStatus: string;
  ecpScore?: number;
  foundationSource: string;
  targetNeed: string;
  targetOutcome: string;
  anglePreviews: string[];
  accountDescription: string;
  declaredAccountDescription: string;
  roles: string[];
  unappliedCriteria?: string[];
  companyUniverseKey: string;
  recommended?: boolean;
}

export interface OutboundCampaignSetupChoices {
  ok: boolean;
  channel: "linkedin";
  objective: "start_conversations";
  prompt: string;
  batchSize: number;
  options: OutboundCampaignSetupOption[];
}

export function NewCampaignPanel({
  choices,
  selectedId,
  loading,
  starting,
  error,
  onSelect,
  onStart,
  onClose,
}: {
  choices?: OutboundCampaignSetupChoices;
  selectedId: string;
  loading: boolean;
  starting: boolean;
  error?: string | null;
  onSelect: (optionId: string) => void;
  onStart: () => void;
  onClose: () => void;
}) {
  return (
    <section className="rounded-lg border-2 border-ink bg-card" data-testid="outbound-campaign-setup">
      <header className="flex items-start gap-3 border-b border-border px-4 py-3 sm:px-5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-cyan-600/30 bg-cyan-50 text-cyan-800">
          <Network className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-lg text-navy">Nueva campaña por LinkedIn</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Elige el problema del target. Foundation definirá los ángulos y Sancho buscará las personas.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar nueva campaña"
          title="Cerrar"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>

      <div className="px-4 py-4 sm:px-5">
        {loading && (
          <div className="flex min-h-28 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Leyendo targets y posicionamiento de Foundation…
          </div>
        )}

        {!loading && error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {!loading && choices && (
          <div className="divide-y divide-border border-y border-border" role="radiogroup" aria-label="Target de la campaña">
            {choices.options.map((option) => {
              const selected = selectedId === option.id;
              return (
                <label
                  key={option.id}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 px-2 py-3 transition-colors hover:bg-muted/40 sm:px-3",
                    selected && "bg-rust/5",
                  )}
                >
                  <input
                    type="radio"
                    name="outbound-audience"
                    value={option.id}
                    checked={selected}
                    onChange={() => onSelect(option.id)}
                    className="mt-1 h-4 w-4 shrink-0 accent-rust"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">{option.title}</span>
                      {option.recommended && (
                        <span className="rounded border border-sage/40 bg-sage/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-sage">
                          Recomendada
                        </span>
                      )}
                      {typeof option.ecpScore === "number" && (
                        <span className="text-[10px] font-semibold uppercase text-muted-foreground">
                          Foundation {option.ecpScore.toFixed(1)}
                        </span>
                      )}
                    </span>
                    <span className="mt-1 block break-words text-xs leading-relaxed text-foreground">
                      {option.targetNeed}
                    </span>
                    <span className="mt-1 block break-words text-xs leading-relaxed text-muted-foreground">
                      <strong className="font-semibold text-foreground">Resultado:</strong> {option.targetOutcome}
                    </span>
                    <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                      {option.accountDescription} · {option.roles.join(", ")}
                    </span>
                    <span className="mt-1 block text-[11px] text-muted-foreground">
                      Ángulos disponibles: {option.anglePreviews.join(" · ")}
                    </span>
                    {option.unappliedCriteria && option.unappliedCriteria.length > 0 && (
                      <span className="mt-1 block text-xs text-yellow-900">
                        No verificable en esta fase: {option.unappliedCriteria.join(" · ")}
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        )}

        {!loading && choices && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <p className="min-w-[220px] flex-1 text-xs text-muted-foreground">
              Hasta {choices.batchSize.toLocaleString("es-ES")} contactos · 3 variantes compartidas · nada se envía sin aprobación.
            </p>
            <button
              type="button"
              onClick={onClose}
              disabled={starting}
              className="h-10 rounded-md border border-border bg-background px-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onStart}
              disabled={starting || !selectedId}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-rust bg-rust px-4 text-sm font-semibold text-white transition-colors hover:bg-rust/90 disabled:opacity-50"
              data-testid="outbound-campaign-start"
            >
              {starting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}
              {starting ? "Preparando…" : "Buscar y preparar"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
