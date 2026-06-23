"use client";

import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { ComicCard } from "@/components/shared/comic-card";
import { ModelPicker } from "@/components/admin/ModelPicker";
import type { CronApi } from "@/components/cron/types";
import {
  useModelCatalog,
  useDefaultModel,
  useSetDefaultModel,
  useSetAgentModel,
  useSetCronModel,
  type ModelCatalogResponse,
  type ProviderAuthRoute,
  type RichAgent,
} from "@/hooks/useModels";
import { routeLabel, routeClass, effectiveRoute } from "@/lib/provider-auth-display";
import { cn } from "@/lib/utils";

/**
 * Reusable model-config sections. The per-agent model now lives on the agent
 * card (AgentsPanel) and crons under the Recurrentes tab — these are the shared
 * building blocks. Provider/auth routes live in the Conexiones tab (SAN-301).
 */

function AuthRouteBadge({
  route,
  configured = route !== "missing",
  title,
}: {
  route: ProviderAuthRoute | undefined;
  configured?: boolean;
  title?: string | null;
}) {
  const isConfigured = configured ?? (route !== undefined && route !== "missing");
  return (
    <span
      title={title || undefined}
      className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase", routeClass(route, isConfigured))}
    >
      {routeLabel(route)}
    </span>
  );
}

function providerForModel(data: ModelCatalogResponse | undefined, modelId: string | null) {
  if (!data || !modelId) return undefined;
  const model = data.models.find((m) => m.id === modelId);
  if (model) return data.providers.find((p) => p.id === model.provider);
  const providerId = modelId.split("/")[0];
  return data.providers.find((p) => p.id === providerId);
}

interface CronAssignment extends CronApi {
  groupSlug: string;
}

interface CollapsibleModelSectionProps {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}

function CollapsibleModelSection({
  title,
  description,
  children,
  defaultOpen = true,
}: CollapsibleModelSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <ComicCard className="overflow-hidden p-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-background/60"
      >
        <ChevronRight
          aria-hidden="true"
          className={cn(
            "mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-90"
          )}
        />
        <span className="min-w-0 flex-1">
          <span className="block font-heading text-lg text-navy">{title}</span>
          {description ? (
            <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
              {description}
            </span>
          ) : null}
        </span>
      </button>
      <div hidden={!open} className="border-t border-border px-5 pb-5 pt-4">
        {children}
      </div>
    </ComicCard>
  );
}

function useCronAssignments() {
  return useQuery<CronAssignment[]>({
    queryKey: ["model-assignments", "crons"],
    queryFn: async () => {
      const res = await fetch("/api/recurring-tasks");
      if (!res.ok) throw new Error(`Failed to fetch crons: ${res.status}`);
      const raw = (await res.json()) as Record<string, unknown>;
      const out: CronAssignment[] = [];
      for (const [groupSlug, value] of Object.entries(raw)) {
        if (!Array.isArray(value)) continue;
        if (groupSlug === "_available_templates") continue;
        for (const cron of value as CronApi[]) {
          out.push({ ...cron, groupSlug });
        }
      }
      out.sort((a, b) => {
        const group = a.groupSlug.localeCompare(b.groupSlug);
        if (group !== 0) return group;
        return (a.name || a.id).localeCompare(b.name || b.id);
      });
      return out;
    },
    staleTime: 30_000,
  });
}

export function DefaultModelSection() {
  const { data: defaultModel, isLoading } = useDefaultModel();
  const { mutate, isPending, error } = useSetDefaultModel();
  const [draft, setDraft] = useState<string | null>(null);

  const current = defaultModel?.model ?? null;
  const value = draft !== null ? draft : current;
  const dirty = draft !== null && draft !== current;

  return (
    <CollapsibleModelSection
      title="Modelo por defecto"
      description={
        <>
        Modelo por defecto del chat (<code>agents.defaults.model.primary</code>).
        Lo heredan los agentes que no tengan modelo propio.
        </>
      }
    >
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
    </CollapsibleModelSection>
  );
}

/**
 * Self-contained per-agent model control (inherit/own + picker + recommended +
 * route badge), rendered inside each agent card on the Agentes tab. Manages its
 * own draft/save state so each row is independent.
 */
export function AgentModelControl({
  agent: a,
  globalDefault,
}: {
  agent: RichAgent;
  globalDefault: string | null;
}) {
  const { data: catalog } = useModelCatalog();
  const { mutate, isPending } = useSetAgentModel();
  const [ownModeDraft, setOwnModeDraft] = useState<boolean | undefined>(undefined);
  const [modelDraft, setModelDraft] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const busy = isPending;
  const inheriting = a.overrideModel === null;
  const backendModel =
    ownModeDraft === false ? globalDefault : a.resolvedModel || (inheriting ? globalDefault : a.overrideModel);
  const recommendedModel = a.recommendedModel || null;
  const ownMode = ownModeDraft ?? (!inheriting || !a.registered);
  const pickerValue =
    modelDraft || a.overrideModel || (ownMode ? recommendedModel : null) || backendModel || globalDefault;
  const displayModel = modelDraft || (ownMode ? pickerValue : backendModel) || null;
  const currentOwnModel = a.overrideModel || (ownMode ? pickerValue : null);
  const recommendedApplied = Boolean(
    recommendedModel && a.registered && !modelDraft && currentOwnModel === recommendedModel
  );
  const displayProvider = providerForModel(catalog, displayModel);
  const route = effectiveRoute(displayProvider);

  const clearModelDraft = () => setModelDraft(null);
  const handleSave = (next: string | null) => {
    setSaveError(null);
    setSaved(false);
    mutate(
      { agentId: a.id, model: next },
      {
        onSuccess: () => {
          clearModelDraft();
          setOwnModeDraft(next !== null);
          setSaved(true);
          window.setTimeout(() => setSaved(false), 2200);
        },
        onError: (err) => {
          clearModelDraft();
          setSaveError(err instanceof Error ? err.message : "No se pudo guardar el modelo");
        },
      }
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1 text-xs cursor-pointer">
          <input
            type="radio"
            name={`mode-${a.id}`}
            checked={!ownMode && inheriting && a.registered}
            disabled={busy || !a.registered}
            onChange={() => {
              setOwnModeDraft(false);
              clearModelDraft();
              handleSave(null);
            }}
          />
          <span>
            Heredar default
            {globalDefault && <span className="text-muted-foreground font-mono"> ({globalDefault})</span>}
          </span>
        </label>
        <label className="flex items-center gap-1 text-xs cursor-pointer">
          <input
            type="radio"
            name={`mode-${a.id}`}
            checked={ownMode}
            disabled={busy}
            onChange={() => {
              setOwnModeDraft(true);
              const nextModel = modelDraft || recommendedModel || pickerValue;
              if (nextModel) setModelDraft(nextModel);
              if ((inheriting || !a.registered) && nextModel) handleSave(nextModel);
            }}
          />
          <span>Modelo propio</span>
        </label>
      </div>

      <ModelPicker
        value={pickerValue}
        allowInherit={false}
        disabled={busy || (!ownMode && a.registered)}
        size="sm"
        onChange={(next) => {
          if (!next) return;
          setOwnModeDraft(true);
          setModelDraft(next);
          handleSave(next);
        }}
      />

      {!inheriting && a.registered && (
        <span className="text-[10px] uppercase font-bold text-rust">override</span>
      )}
      {recommendedModel && (
        <button
          type="button"
          disabled={busy || recommendedApplied}
          title={a.recommendedReason || undefined}
          onClick={() => {
            setOwnModeDraft(true);
            setModelDraft(recommendedModel);
            handleSave(recommendedModel);
          }}
          className={cn(
            "max-w-[220px] truncate rounded px-2 py-1 text-left text-[10px] font-bold uppercase",
            recommendedApplied ? "bg-sage/15 text-sage" : "bg-rust/10 text-rust hover:bg-rust/15",
            (busy || recommendedApplied) && "cursor-default"
          )}
        >
          {recommendedApplied ? "recomendado" : "aplicar recomendado"}{" "}
          <span className="font-mono normal-case">{recommendedModel}</span>
        </button>
      )}
      {busy && <span className="text-xs text-muted-foreground">guardando…</span>}
      {saved && !busy && <span className="text-xs font-semibold text-sage">guardado</span>}
      {saveError && (
        <span className="max-w-[220px] truncate text-xs font-semibold text-destructive" title={saveError}>
          no guardado: {saveError}
        </span>
      )}
      <span className="ml-auto flex items-center gap-2 text-xs">
        <span className="max-w-[190px] truncate font-mono text-muted-foreground" title={displayModel || undefined}>
          {displayModel || "sin modelo"}
        </span>
        <AuthRouteBadge route={route} configured={displayProvider?.configured} title={displayProvider?.sourceLabel} />
      </span>
    </div>
  );
}

export function CronModelsSection() {
  const { data: crons, isLoading, error } = useCronAssignments();
  const { data: catalog } = useModelCatalog();
  const { data: defaultModel } = useDefaultModel();
  const { mutate, isPending } = useSetCronModel(null);
  const [pendingCron, setPendingCron] = useState<string | null>(null);

  const globalDefault = defaultModel?.model ?? null;

  return (
    <CollapsibleModelSection
      title="Modelo por tarea recurrente"
      description={
        <>
        Crons de OpenClaw con modelo explícito o heredado del default global. Cambiar acá actualiza
        el modelo del cron en OpenClaw.
        </>
      }
    >
      {isLoading && <p className="text-sm text-muted-foreground">cargando crons…</p>}
      {error && (
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : "No se pudieron cargar los crons"}
        </p>
      )}

      {!isLoading && !error && (!crons || crons.length === 0) && (
        <p className="text-sm text-muted-foreground">no hay crons configurados</p>
      )}

      {!isLoading && !error && crons && crons.length > 0 && (
        <div className="overflow-x-auto rounded-lg border-2 border-ink shadow-comic-sm">
          <table className="w-full min-w-[920px] text-sm">
            <thead>
              <tr className="border-b-2 border-ink bg-navy/5">
                <th className="px-3 py-2 text-left font-heading text-xs uppercase text-navy">Cron</th>
                <th className="px-3 py-2 text-left font-heading text-xs uppercase text-navy">Scope</th>
                <th className="px-3 py-2 text-left font-heading text-xs uppercase text-navy">Agente</th>
                <th className="px-3 py-2 text-left font-heading text-xs uppercase text-navy">Modelo</th>
                <th className="px-3 py-2 text-left font-heading text-xs uppercase text-navy">Ruta</th>
                <th className="px-3 py-2 text-left font-heading text-xs uppercase text-navy">Estado</th>
              </tr>
            </thead>
            <tbody>
              {crons.map((cron) => {
                const explicitModel = cron.model && cron.model !== "—" ? cron.model : null;
                const resolvedModel = explicitModel || globalDefault;
                const provider = providerForModel(catalog, resolvedModel);
                const route = effectiveRoute(provider);
                const busy = isPending && pendingCron === cron.id;
                const editable = cron._source === "openclaw-cron" || cron._source === undefined;

                return (
                  <tr key={`${cron.groupSlug}:${cron.id}`} className="border-b border-border last:border-b-0">
                    <td className="px-3 py-2">
                      <div className="max-w-[260px] truncate font-semibold" title={cron.name || cron.id}>
                        {cron.name || cron.id}
                      </div>
                      <div className="max-w-[260px] truncate font-mono text-[11px] text-muted-foreground" title={cron.id}>
                        {cron.id}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <code className="text-xs">{cron.groupSlug === "_system" ? "sistema" : cron.groupSlug}</code>
                    </td>
                    <td className="px-3 py-2">
                      <code className="text-xs">{cron.agent || "sancho"}</code>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <ModelPicker
                          value={resolvedModel}
                          allowInherit={false}
                          disabled={busy || !editable}
                          size="sm"
                          onChange={(next) => {
                            if (!next) return;
                            setPendingCron(cron.id);
                            mutate(
                              { cronId: cron.id, model: next },
                              { onSettled: () => setPendingCron(null) }
                            );
                          }}
                        />
                        {!explicitModel && (
                          <span className="text-[10px] font-bold uppercase text-muted-foreground">
                            hereda
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <AuthRouteBadge
                        route={route}
                        configured={provider?.configured}
                        title={provider?.sourceLabel}
                      />
                    </td>
                    <td className="px-3 py-2">
                      {busy ? (
                        <span className="text-xs text-muted-foreground">guardando…</span>
                      ) : editable ? (
                        <span className="text-xs text-muted-foreground">
                          {cron.status === "paused" ? "pausado" : "activo"}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">local read-only</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </CollapsibleModelSection>
  );
}
