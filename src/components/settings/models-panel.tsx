"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
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
  type CatalogProvider,
  type ModelCatalogResponse,
  type ProviderAuthRoute,
  type RichAgent,
} from "@/hooks/useModels";
import {
  routeLabel,
  routeClass,
  effectiveRoute,
  providerDisplayName,
  connectionLabel,
  connectionClass,
  maskAuthLabel,
} from "@/lib/provider-auth-display";
import { cn } from "@/lib/utils";

const LLM_PROVIDER_ORDER = ["anthropic", "codex", "openai-codex", "openrouter", "fireworks", "openai", "google"];

const RECOMMENDATIONS = [
  {
    workload: "Foundation, Brand Brain y estrategia",
    primary: ["anthropic/claude-opus-4-7", "anthropic/claude-opus-4-6"],
    fallback: "anthropic/claude-sonnet-4-6",
    route: "API Anthropic",
    note: "Máxima calidad, mejor seguimiento de contexto y outputs largos. Evitar Codex como default para el análisis final.",
  },
  {
    workload: "Research largo y síntesis",
    primary: ["anthropic/claude-opus-4-7", "anthropic/claude-opus-4-6"],
    fallback: "anthropic/claude-sonnet-4-6",
    route: "API Anthropic",
    note: "Usar Opus cuando importa criterio, estructura y profundidad. Sonnet queda como fallback de coste/latencia.",
  },
  {
    workload: "Content Engine y drafts",
    primary: ["anthropic/claude-sonnet-4-6"],
    fallback: "anthropic/claude-opus-4-6",
    route: "API Anthropic",
    note: "Sonnet suele dar buen balance para escritura. Subir a Opus para piezas fundacionales o revisión final.",
  },
  {
    workload: "Código, herramientas y agentes operativos",
    primary: ["codex/gpt-5.4"],
    fallback: "codex/gpt-5.4-mini",
    route: "Suscripción Codex",
    note: "Codex es la ruta natural para ejecución técnica y uso de la suscripción. No usarlo como sustituto de Opus en estrategia.",
  },
  {
    workload: "Clasificación rápida y bajo coste",
    primary: ["google/gemini-2.5-flash"],
    fallback: "codex/gpt-5.4-mini",
    route: "API/env",
    note: "Bueno para tareas rápidas, extracción y routing. No es el modelo principal para Foundation.",
  },
  {
    workload: "Open-weight vía Fireworks",
    primary: [
      "fireworks/accounts/fireworks/routers/kimi-k2p5-turbo",
      "fireworks/accounts/fireworks/models/kimi-k2p6",
    ],
    fallback: "fireworks/accounts/fireworks/models/gpt-oss-120b",
    route: "API Fireworks",
    note: "Ruta útil para modelos abiertos y alternativos cuando Anthropic/OpenRouter no convienen por coste, latencia o disponibilidad.",
  },
];

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

function authSourceLines(provider: CatalogProvider): string[] {
  return [
    ...provider.auth.subscriptionLabels.map((label) => `Suscripción: ${label}`),
    ...provider.auth.apiKeyLabels.map((label) => `API key: ${label}`),
    ...(provider.auth.envLabel ? [`Env: ${provider.auth.envLabel}`] : []),
    ...provider.auth.unsupportedSubscriptionLabels.map((label) => `No usada: ${label}`),
  ].map(maskAuthLabel);
}

function chooseModel(data: ModelCatalogResponse | undefined, candidates: string[]): string {
  return candidates.find((id) => data?.models.some((m) => m.id === id)) || candidates[0];
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

function ProvidersSection() {
  const { data, isLoading } = useModelCatalog();
  if (isLoading) {
    return (
      <CollapsibleModelSection title="Rutas de modelos del workspace">
        <p className="text-sm text-muted-foreground">cargando providers…</p>
      </CollapsibleModelSection>
    );
  }
  const providers = data?.providers ?? [];
  const models = data?.models ?? [];
  const providerRows = providers
    .filter((p) => LLM_PROVIDER_ORDER.includes(p.id) || models.some((m) => m.provider === p.id && m.reasoning))
    .sort((a, b) => {
      const ai = LLM_PROVIDER_ORDER.indexOf(a.id);
      const bi = LLM_PROVIDER_ORDER.indexOf(b.id);
      if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      return a.id.localeCompare(b.id);
    });

  return (
    <CollapsibleModelSection
      title="Rutas de modelos del workspace"
      description={
        <>
        Estado real que reporta OpenClaw. Codex puede estar conectado por suscripción/OAuth;
        Anthropic/Opus debe ir por API key o por OpenRouter.
        </>
      }
    >
      <div className="overflow-x-auto rounded-lg border-2 border-ink shadow-comic-sm">
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr className="border-b-2 border-ink bg-navy/5">
              <th className="px-3 py-2 text-left font-heading text-xs uppercase text-navy">Provider</th>
              <th className="px-3 py-2 text-left font-heading text-xs uppercase text-navy">Estado</th>
              <th className="px-3 py-2 text-left font-heading text-xs uppercase text-navy">Reasoning</th>
              <th className="px-3 py-2 text-left font-heading text-xs uppercase text-navy">Suscripción</th>
              <th className="px-3 py-2 text-left font-heading text-xs uppercase text-navy">API / env</th>
              <th className="px-3 py-2 text-left font-heading text-xs uppercase text-navy">Usa ahora</th>
              <th className="px-3 py-2 text-left font-heading text-xs uppercase text-navy">Fuente / token</th>
              <th className="px-3 py-2 text-right font-heading text-xs uppercase text-navy">Acción</th>
            </tr>
          </thead>
          <tbody>
            {providerRows.map((p) => {
              const route = effectiveRoute(p);
              const reasoning = models.filter((m) => m.provider === p.id && m.reasoning);
              const shownReasoning = reasoning.slice(0, 2).map((m) => m.name || m.id).join(", ");
              const hiddenCount = Math.max(0, reasoning.length - 2);
              const sources = authSourceLines(p);
              return (
                <tr key={p.id} className="border-b border-border align-top last:border-b-0">
                  <td className="px-3 py-2">
                    <div className="font-mono font-semibold">{providerDisplayName(p.id)}</div>
                    <div className="text-[11px] text-muted-foreground">{p.id}</div>
                  </td>
                  <td className="px-3 py-2">
                    <span className={cn("rounded px-2 py-0.5 text-[10px] font-bold uppercase", connectionClass(route, p.configured))}>
                      {connectionLabel(route, p.configured)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {reasoning.length > 0 ? (
                      <span title={reasoning.map((m) => m.id).join("\n")}>
                        {shownReasoning}
                        {hiddenCount > 0 ? ` +${hiddenCount}` : ""}
                      </span>
                    ) : (
                      "sin modelos reasoning"
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {p.auth.subscriptionSupported ? (
                      <AuthRouteBadge
                        route="subscription"
                        configured={p.auth.hasSubscription}
                        title={p.auth.subscriptionLabels.join("\n")}
                      />
                    ) : p.auth.unsupportedSubscriptionLabels.length > 0 ? (
                      <span
                        title={p.auth.unsupportedSubscriptionLabels.join("\n")}
                        className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-800"
                      >
                        detectada, no runtime
                      </span>
                    ) : (
                      <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                        no aplica
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1.5">
                      <AuthRouteBadge
                        route="api"
                        configured={p.auth.hasApiKey}
                        title={p.auth.apiKeyLabels.join("\n")}
                      />
                      <AuthRouteBadge route="env" configured={p.auth.hasEnv} title={p.auth.envLabel} />
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-1">
                      <AuthRouteBadge route={route} configured={p.configured} title={p.sourceLabel} />
                      <span className="max-w-[240px] truncate text-[11px] text-muted-foreground" title={p.sourceLabel || undefined}>
                        {p.sourceLabel ? maskAuthLabel(p.sourceLabel) : "—"}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {sources.length > 0 ? (
                      <div className="flex max-w-[260px] flex-col gap-0.5 text-[11px] text-muted-foreground">
                        {sources.slice(0, 3).map((line) => (
                          <span key={line} className="truncate" title={sources.join("\n")}>
                            {line}
                          </span>
                        ))}
                        {sources.length > 3 ? (
                          <span title={sources.join("\n")}>+{sources.length - 3} más</span>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {["anthropic", "openrouter", "fireworks", "openai", "google"].includes(p.id) ? (
                      <Link
                        href="/dashboard/admin/settings?tab=apis"
                        className="text-[11px] font-semibold text-rust underline-offset-2 hover:underline"
                      >
                        Gestionar APIs
                      </Link>
                    ) : (
                      <code className="text-[10px] text-muted-foreground">openclaw auth</code>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </CollapsibleModelSection>
  );
}

function RecommendationsSection() {
  const { data, isLoading } = useModelCatalog();

  return (
    <CollapsibleModelSection
      title="Referencia de calidad por workload"
      description={
        <>
        Guía operativa para que Foundation y análisis críticos no caigan por accidente en el
        default global si ese default está optimizado para coste o ejecución técnica.
        </>
      }
    >
      {isLoading ? (
        <p className="text-sm text-muted-foreground">cargando recomendaciones…</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {RECOMMENDATIONS.map((item) => {
            const primary = chooseModel(data, item.primary);
            const provider = providerForModel(data, primary);
            const route = effectiveRoute(provider);
            return (
              <section key={item.workload} className="rounded-lg border border-border bg-background p-3">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <h4 className="font-heading text-sm text-navy">{item.workload}</h4>
                  <AuthRouteBadge
                    route={route}
                    configured={provider?.configured}
                    title={provider?.sourceLabel || item.route}
                  />
                </div>
                <div className="space-y-1 text-xs">
                  <div>
                    <span className="font-bold text-muted-foreground">Principal: </span>
                    <code>{primary}</code>
                  </div>
                  <div>
                    <span className="font-bold text-muted-foreground">Fallback: </span>
                    <code>{item.fallback}</code>
                  </div>
                  <div>
                    <span className="font-bold text-muted-foreground">Ruta esperada: </span>
                    {item.route}
                  </div>
                  <p className="pt-1 leading-relaxed text-muted-foreground">{item.note}</p>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </CollapsibleModelSection>
  );
}

export function ModelsPanel() {
  return (
    <div className="space-y-4">
      <RecommendationsSection />
      <DefaultModelSection />
      <CronModelsSection />
      <ProvidersSection />
    </div>
  );
}
