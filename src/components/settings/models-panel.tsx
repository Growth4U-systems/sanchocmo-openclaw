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
  useAgentsList,
  type CatalogProvider,
  type ModelCatalogResponse,
  type ProviderAuthRoute,
} from "@/hooks/useModels";
import { cn } from "@/lib/utils";

const LLM_PROVIDER_ORDER = ["anthropic", "codex", "openai-codex", "openrouter", "openai", "google"];

const RECOMMENDATIONS = [
  {
    workload: "Foundation, Brand Brain y estrategia",
    primary: ["anthropic/claude-opus-4-7", "anthropic/claude-opus-4-6"],
    fallback: "anthropic/claude-sonnet-4-6",
    route: "API Anthropic",
    note: "Máxima calidad, mejor seguimiento de contexto y outputs largos. Evitar Codex como default para el análisis final.",
  },
  {
    workload: "Research largo, Trust Engine y síntesis",
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
];

function routeLabel(route: ProviderAuthRoute | undefined): string {
  if (route === undefined) return "cargando";
  if (route === "subscription") return "sub";
  if (route === "api") return "api key";
  if (route === "env") return "env key";
  return "sin auth";
}

function routeClass(route: ProviderAuthRoute | undefined, configured = route !== "missing") {
  if (route === undefined) return "bg-muted text-muted-foreground";
  if (!configured || route === "missing") return "bg-muted text-muted-foreground";
  if (route === "subscription") return "bg-sage/20 text-sage";
  if (route === "api") return "bg-rust/10 text-rust";
  if (route === "env") return "bg-blue-500/10 text-blue-700";
  return "bg-muted text-muted-foreground";
}

function effectiveRoute(provider: CatalogProvider | undefined): ProviderAuthRoute | undefined {
  if (!provider) return undefined;
  if (!provider.auth) return provider.configured ? "api" : "missing";
  return provider.auth.effective !== "missing" ? provider.auth.effective : provider.auth.preferred;
}

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

function providerDisplayName(providerId: string): string {
  if (providerId === "anthropic") return "Anthropic";
  if (providerId === "codex") return "Codex";
  if (providerId === "openai-codex") return "Codex auth";
  if (providerId === "openrouter") return "OpenRouter";
  if (providerId === "openai") return "OpenAI";
  if (providerId === "google") return "Gemini";
  return providerId;
}

function providerForModel(data: ModelCatalogResponse | undefined, modelId: string | null) {
  if (!data || !modelId) return undefined;
  const model = data.models.find((m) => m.id === modelId);
  if (model) return data.providers.find((p) => p.id === model.provider);
  const providerId = modelId.split("/")[0];
  return data.providers.find((p) => p.id === providerId);
}

function chooseModel(data: ModelCatalogResponse | undefined, candidates: string[]): string {
  return candidates.find((id) => data?.models.some((m) => m.id === id)) || candidates[0];
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

function DefaultModelSection() {
  const { data: defaultModel, isLoading } = useDefaultModel();
  const { mutate, isPending, error } = useSetDefaultModel();
  const [draft, setDraft] = useState<string | null>(null);

  const current = defaultModel?.model ?? null;
  const value = draft !== null ? draft : current;
  const dirty = draft !== null && draft !== current;

  return (
    <CollapsibleModelSection
      title="Default global"
      description={
        <>
        Modelo por defecto del chat (<code>agents.defaults.model.primary</code>).
        Aplica a cualquier agente que no tenga override propio.
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

function PerAgentSection() {
  const { data: agentsData, isLoading } = useAgentsList();
  const { data: defaultModel } = useDefaultModel();
  const { data: catalog } = useModelCatalog();
  const { mutate, isPending } = useSetAgentModel();
  const [pendingAgent, setPendingAgent] = useState<string | null>(null);
  const [ownModeDrafts, setOwnModeDrafts] = useState<Record<string, boolean>>({});

  if (isLoading) {
    return (
      <CollapsibleModelSection title="Por agente">
        <p className="text-sm text-muted-foreground">cargando agentes…</p>
      </CollapsibleModelSection>
    );
  }

  const agents = agentsData?.agents || [];
  const globalDefault = defaultModel?.model ?? null;

  return (
    <CollapsibleModelSection
      title="Por agente"
      description={
        <>
        Cada agente puede <strong>heredar el default global</strong> o tener un{" "}
        <strong>modelo propio</strong>. Los agentes sin registrar (sólo workspace en disco) aparecen
        debajo y se registran automáticamente al elegir un modelo.
        </>
      }
    >
      {agents.length === 0 ? (
        <p className="text-sm text-muted-foreground">no hay agentes</p>
      ) : (
        <ul className="space-y-2">
          {agents.map((a) => {
            const busy = isPending && pendingAgent === a.id;
            const inheriting = a.overrideModel === null;
            const resolvedModel = a.resolvedModel || (inheriting ? globalDefault : a.overrideModel);
            const ownMode = ownModeDrafts[a.id] || !inheriting || !a.registered;
            const recommendedModel = a.recommendedModel || null;
            const pickerValue = a.overrideModel || (ownMode ? recommendedModel : null) || resolvedModel || globalDefault;
            const currentOwnModel = a.overrideModel || (ownMode ? pickerValue : null);
            const recommendedApplied = Boolean(recommendedModel && currentOwnModel === recommendedModel);
            const resolvedProvider = providerForModel(catalog, resolvedModel);
            const route = effectiveRoute(resolvedProvider);
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
                      checked={!ownMode && inheriting && a.registered}
                      disabled={busy || !a.registered}
                      onChange={() => {
                        setOwnModeDrafts((prev) => {
                          const next = { ...prev };
                          delete next[a.id];
                          return next;
                        });
                        handleSave(null);
                      }}
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
                      checked={ownMode}
                      disabled={busy}
                      onChange={() => {
                        setOwnModeDrafts((prev) => ({ ...prev, [a.id]: true }));
                        const nextModel = recommendedModel || pickerValue;
                        if (inheriting && a.registered && nextModel) {
                          handleSave(nextModel);
                        }
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
                    setOwnModeDrafts((prev) => ({ ...prev, [a.id]: true }));
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
                      setOwnModeDrafts((prev) => ({ ...prev, [a.id]: true }));
                      handleSave(recommendedModel);
                    }}
                    className={cn(
                      "max-w-[220px] truncate rounded px-2 py-1 text-left text-[10px] font-bold uppercase",
                      recommendedApplied
                        ? "bg-sage/15 text-sage"
                        : "bg-rust/10 text-rust hover:bg-rust/15",
                      (busy || recommendedApplied) && "cursor-default"
                    )}
                  >
                    {recommendedApplied ? "recomendado" : "aplicar recomendado"}{" "}
                    <span className="font-mono normal-case">{recommendedModel}</span>
                  </button>
                )}
                {busy && <span className="text-xs text-muted-foreground">guardando…</span>}
                <span className="ml-auto flex min-w-[180px] items-center justify-end gap-2 text-xs">
                  <span className="max-w-[190px] truncate font-mono text-muted-foreground" title={resolvedModel || undefined}>
                    {resolvedModel || "sin modelo"}
                  </span>
                  <AuthRouteBadge
                    route={route}
                    configured={resolvedProvider?.configured}
                    title={resolvedProvider?.sourceLabel}
                  />
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </CollapsibleModelSection>
  );
}

function CronModelsSection() {
  const { data: crons, isLoading, error } = useCronAssignments();
  const { data: catalog } = useModelCatalog();
  const { data: defaultModel } = useDefaultModel();
  const { mutate, isPending } = useSetCronModel(null);
  const [pendingCron, setPendingCron] = useState<string | null>(null);

  const globalDefault = defaultModel?.model ?? null;

  return (
    <CollapsibleModelSection
      title="Tareas recurrentes"
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
        Estado real que reporta OpenClaw. En esta app la suscripción se considera ruta válida
        para Codex; Anthropic/Opus debe ir por API key o por OpenRouter.
        </>
      }
    >
      <div className="overflow-x-auto rounded-lg border-2 border-ink shadow-comic-sm">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b-2 border-ink bg-navy/5">
              <th className="px-3 py-2 text-left font-heading text-xs uppercase text-navy">Provider</th>
              <th className="px-3 py-2 text-left font-heading text-xs uppercase text-navy">Reasoning</th>
              <th className="px-3 py-2 text-left font-heading text-xs uppercase text-navy">Suscripción</th>
              <th className="px-3 py-2 text-left font-heading text-xs uppercase text-navy">API / env</th>
              <th className="px-3 py-2 text-left font-heading text-xs uppercase text-navy">Ruta efectiva</th>
              <th className="px-3 py-2 text-right font-heading text-xs uppercase text-navy">Acción</th>
            </tr>
          </thead>
          <tbody>
            {providerRows.map((p) => {
              const route = effectiveRoute(p);
              const reasoning = models.filter((m) => m.provider === p.id && m.reasoning);
              const shownReasoning = reasoning.slice(0, 2).map((m) => m.name || m.id).join(", ");
              const hiddenCount = Math.max(0, reasoning.length - 2);
              return (
                <tr key={p.id} className="border-b border-border align-top last:border-b-0">
                  <td className="px-3 py-2">
                    <div className="font-mono font-semibold">{providerDisplayName(p.id)}</div>
                    <div className="text-[11px] text-muted-foreground">{p.id}</div>
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
                        {p.sourceLabel || "—"}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {["anthropic", "openrouter", "openai", "google"].includes(p.id) ? (
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
      <PerAgentSection />
      <CronModelsSection />
      <ProvidersSection />
    </div>
  );
}
