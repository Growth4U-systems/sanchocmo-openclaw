"use client";

import { useState } from "react";
import { ComicCard } from "@/components/shared/comic-card";
import { ModelPicker } from "@/components/admin/ModelPicker";
import {
  useModelCatalog,
  useDefaultModel,
  useSetDefaultModel,
  useSetAgentModel,
  useAgentsList,
} from "@/hooks/useModels";
import { cn } from "@/lib/utils";

function AuthKindBadge({ kind, configured }: { kind: string; configured: boolean }) {
  const label = !configured
    ? "sin auth"
    : kind === "oauth" || kind === "token"
      ? "sub"
      : kind === "env"
        ? "env key"
        : kind === "apiKey"
          ? "api key"
          : kind;
  const color = !configured
    ? "bg-muted text-muted-foreground"
    : kind === "oauth" || kind === "token"
      ? "bg-sage/20 text-sage"
      : "bg-rust/10 text-rust";
  return (
    <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase", color)}>
      {label}
    </span>
  );
}

function DefaultModelSection() {
  const { data: defaultModel, isLoading } = useDefaultModel();
  const { mutate, isPending, error } = useSetDefaultModel();
  const [draft, setDraft] = useState<string | null>(null);

  const current = defaultModel?.model ?? null;
  const value = draft !== null ? draft : current;
  const dirty = draft !== null && draft !== current;

  return (
    <ComicCard>
      <h3 className="font-heading text-lg text-navy mb-1">Default global</h3>
      <p className="text-xs text-muted-foreground mb-4">
        Modelo por defecto del chat (<code>agents.defaults.model.primary</code>).
        Aplica a cualquier agente que no tenga override propio.
      </p>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">cargando…</p>
      ) : (
        <div className="flex items-center gap-3 flex-wrap">
          <ModelPicker value={value} onChange={setDraft} />
          <button
            type="button"
            disabled={!dirty || isPending || !draft}
            onClick={() => draft && mutate(draft, { onSuccess: () => setDraft(null) })}
            className={cn(
              "px-3 py-1.5 rounded-md text-sm font-semibold border-2 border-ink",
              dirty && !isPending
                ? "bg-rust text-white hover:bg-rust/90"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
          >
            {isPending ? "Guardando…" : "Guardar"}
          </button>
          {dirty && (
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              cancelar
            </button>
          )}
        </div>
      )}
      {error && (
        <p className="mt-2 text-xs text-destructive">
          {error instanceof Error ? error.message : "Error"}
        </p>
      )}
    </ComicCard>
  );
}

function PerAgentSection() {
  const { data: agentsData, isLoading } = useAgentsList();
  const { data: defaultModel } = useDefaultModel();
  const { mutate, isPending } = useSetAgentModel();
  const [pendingAgent, setPendingAgent] = useState<string | null>(null);

  if (isLoading) {
    return (
      <ComicCard>
        <h3 className="font-heading text-lg text-navy mb-1">Por agente</h3>
        <p className="text-sm text-muted-foreground">cargando agentes…</p>
      </ComicCard>
    );
  }

  const agents = agentsData?.agents || [];
  const globalDefault = defaultModel?.model ?? null;

  return (
    <ComicCard>
      <h3 className="font-heading text-lg text-navy mb-1">Por agente</h3>
      <p className="text-xs text-muted-foreground mb-4">
        Cada agente puede <strong>heredar el default global</strong> o tener un{" "}
        <strong>modelo propio</strong>. Los agentes sin registrar (sólo workspace en disco) aparecen
        debajo y se registran automáticamente al elegir un modelo.
      </p>
      {agents.length === 0 ? (
        <p className="text-sm text-muted-foreground">no hay agentes</p>
      ) : (
        <ul className="space-y-2">
          {agents.map((a) => {
            const busy = isPending && pendingAgent === a.id;
            const inheriting = a.overrideModel === null;
            const handleSave = (next: string | null) => {
              setPendingAgent(a.id);
              mutate(
                { agentId: a.id, model: next },
                { onSettled: () => setPendingAgent(null) }
              );
            };
            return (
              <li
                key={a.id}
                className={cn(
                  "flex items-center gap-3 rounded border-2 border-ink p-2",
                  !a.registered && "opacity-80"
                )}
              >
                <span className="flex items-center gap-1 w-40 truncate">
                  {a.emoji && <span>{a.emoji}</span>}
                  <span className="font-mono font-semibold text-sm truncate">{a.id}</span>
                  {a.isDefault && (
                    <span className="text-[10px] uppercase font-bold text-muted-foreground">
                      default
                    </span>
                  )}
                  {!a.registered && (
                    <span className="text-[10px] uppercase font-bold text-muted-foreground">
                      sin registrar
                    </span>
                  )}
                </span>

                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 text-xs cursor-pointer">
                    <input
                      type="radio"
                      name={`mode-${a.id}`}
                      checked={inheriting && a.registered}
                      disabled={busy || !a.registered}
                      onChange={() => handleSave(null)}
                    />
                    <span>
                      Heredar default
                      {globalDefault && (
                        <span className="text-muted-foreground font-mono">
                          {" "}
                          ({globalDefault})
                        </span>
                      )}
                    </span>
                  </label>
                  <label className="flex items-center gap-1 text-xs cursor-pointer">
                    <input
                      type="radio"
                      name={`mode-${a.id}`}
                      checked={!inheriting || !a.registered}
                      disabled={busy}
                      readOnly
                    />
                    <span>Modelo propio</span>
                  </label>
                </div>

                <ModelPicker
                  value={a.overrideModel}
                  allowInherit={false}
                  disabled={busy || (inheriting && a.registered)}
                  size="sm"
                  onChange={(next) => {
                    if (next) handleSave(next);
                  }}
                />

                {!inheriting && a.registered && (
                  <span className="text-[10px] uppercase font-bold text-rust">override</span>
                )}
                {busy && <span className="text-xs text-muted-foreground">guardando…</span>}
              </li>
            );
          })}
        </ul>
      )}
    </ComicCard>
  );
}

function ProvidersSection() {
  const { data, isLoading } = useModelCatalog();
  if (isLoading) {
    return (
      <ComicCard>
        <h3 className="font-heading text-lg text-navy mb-1">Providers</h3>
        <p className="text-sm text-muted-foreground">cargando providers…</p>
      </ComicCard>
    );
  }
  const providers = data?.providers ?? [];
  const configured = providers.filter((p) => p.configured);
  const missing = providers.filter((p) => !p.configured);

  return (
    <ComicCard>
      <h3 className="font-heading text-lg text-navy mb-1">Providers</h3>
      <p className="text-xs text-muted-foreground mb-4">
        Estado read-only. Para auth/logout usá la CLI desde tu terminal.
      </p>
      <div className="space-y-3">
        <div>
          <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1">
            Configurados ({configured.length})
          </p>
          <ul className="space-y-1">
            {configured.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-3 text-sm rounded border border-border px-2 py-1"
              >
                <span className="text-sage">✓</span>
                <span className="font-mono font-semibold w-40 truncate">{p.id}</span>
                <AuthKindBadge kind={p.authKind} configured={p.configured} />
                <span className="text-xs text-muted-foreground truncate flex-1">
                  {p.sourceLabel || "—"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {p.modelCount} {p.modelCount === 1 ? "modelo" : "modelos"}
                </span>
              </li>
            ))}
          </ul>
        </div>
        {missing.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              {missing.length} providers sin auth (click para ver cómo loguear)
            </summary>
            <ul className="mt-2 space-y-1">
              {missing.map((p) => (
                <li key={p.id} className="rounded border border-border px-2 py-2 text-xs">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-muted-foreground">✗</span>
                    <span className="font-mono font-semibold">{p.id}</span>
                    <AuthKindBadge kind={p.authKind} configured={p.configured} />
                  </div>
                  <code className="block bg-muted px-2 py-1 rounded text-[10px] break-all">
                    ssh -t sancho-cmo-staging &apos;docker exec -it sanchocmo openclaw models auth --agent sancho login --provider {p.id}&apos;
                  </code>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </ComicCard>
  );
}

export function ModelsPanel() {
  return (
    <div className="space-y-4">
      <DefaultModelSection />
      <PerAgentSection />
      <ProvidersSection />
    </div>
  );
}
