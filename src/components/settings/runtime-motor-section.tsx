"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ComicCard } from "@/components/shared/comic-card";
import { ModelPicker } from "@/components/admin/ModelPicker";
import {
  useModelCatalog,
  useDefaultModel,
  useSetDefaultModel,
  type CatalogModel,
  type CatalogProvider,
} from "@/hooks/useModels";
import { RUNTIME_PROVIDERS, consoleUrlFor, consoleLabelFor, type RuntimeProvider } from "@/lib/provider-console";
import { routeLabel, routeClass, effectiveRoute, maskAuthLabel } from "@/lib/provider-auth-display";
import { cn } from "@/lib/utils";

interface RuntimeMotorSectionProps {
  /** Opens the parent panel's "Key sistema" slider for a gateway provider. */
  onOpenSystemKey: (apiId: string, provider: string) => void;
}

/** First usable model id for a runtime provider, biased by its preferred list. */
function pickEngineModel(rp: RuntimeProvider, models: CatalogModel[]): string | null {
  for (const id of rp.preferredModels) {
    if (models.some((m) => m.id === id && m.missing !== true)) return id;
  }
  const owned = models.filter((m) => rp.catalogIds.includes(m.provider) && m.missing !== true);
  const curated = owned.find((m) => m.curated);
  return curated?.id || owned[0]?.id || null;
}

function findProvider(rp: RuntimeProvider, providers: CatalogProvider[]): CatalogProvider | undefined {
  for (const id of rp.catalogIds) {
    const hit = providers.find((p) => p.id === id);
    if (hit) return hit;
  }
  return undefined;
}

export function RuntimeMotorSection({ onOpenSystemKey }: RuntimeMotorSectionProps) {
  const { data: catalog, isLoading } = useModelCatalog();
  const { data: defaultModel } = useDefaultModel();
  const { mutate: setDefault, isPending, error } = useSetDefaultModel();
  const [draft, setDraft] = useState<string | null>(null);

  const providers = useMemo(() => catalog?.providers ?? [], [catalog]);
  const models = useMemo(() => catalog?.models ?? [], [catalog]);

  // The model catalog only knows whether a credential is *present* (route), not
  // whether the provider *accepts* it. api-health actually pings the provider, so
  // a present-but-rejected system key surfaces here as status "error" — without
  // this, a broken engine key would look healthy in the table.
  const { data: health } = useQuery<{
    services?: Record<string, { status?: string; error?: string; details?: { error?: string } }>;
  }>({
    queryKey: ["api-health", ""],
    queryFn: async () => {
      const res = await fetch("/api/system/api-health");
      if (!res.ok) return { services: {} };
      return res.json();
    },
    staleTime: 30_000,
  });
  const services = useMemo(() => health?.services ?? {}, [health]);

  const current = defaultModel?.model ?? null;
  const pickerValue = draft !== null ? draft : current;
  const dirty = draft !== null && draft !== current;
  const currentProviderId = current ? current.split("/")[0] : null;

  const rows = useMemo(
    () =>
      RUNTIME_PROVIDERS.map((rp) => {
        const provider = findProvider(rp, providers);
        const route = effectiveRoute(provider);
        const configured = provider?.configured ?? false;
        const engineModel = pickEngineModel(rp, models);
        const isEngine = currentProviderId !== null && rp.catalogIds.includes(currentProviderId);
        const usingModel = isEngine ? current : engineModel;
        const svc = services[rp.apiId];
        const healthError =
          svc?.status === "error" ? svc.details?.error || svc.error || "credencial rechazada" : null;
        return { rp, provider, route, configured, engineModel, isEngine, usingModel, healthError };
      }),
    [providers, models, current, currentProviderId, services],
  );

  const saveModel = (model: string) =>
    setDefault(model, { onSuccess: () => setDraft(null) });

  return (
    <div className="space-y-4">
      {/* Engine selector */}
      <ComicCard className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="font-heading text-base text-navy">🚂 Motor principal del chat</h3>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <ModelPicker value={pickerValue} onChange={setDraft} />
            <button
              type="button"
              disabled={!dirty || isPending || !draft}
              onClick={() => draft && saveModel(draft)}
              className={cn(
                "px-3 py-1.5 rounded-md text-sm font-semibold border-2 border-ink",
                dirty && !isPending
                  ? "bg-rust text-white hover:bg-rust/90"
                  : "bg-muted text-muted-foreground cursor-not-allowed",
              )}
            >
              {isPending ? "Guardando…" : "Guardar motor"}
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
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Cambia el <strong>motor del chat</strong> (<code>agents.defaults.model.primary</code>) — puedes elegir otra
          API, no solo Anthropic. Si eliges un proveedor <strong>sin auth</strong>, se guarda igual pero el modelo no
          responderá hasta cargar su key (botón <strong>Key sistema</strong>) o su suscripción.
        </p>
        {error && (
          <p className="mt-2 text-xs text-destructive">
            {error instanceof Error ? error.message : "No se pudo cambiar el motor"}
          </p>
        )}
      </ComicCard>

      {/* Runtime providers table */}
      <div className="overflow-x-auto rounded-lg border-2 border-ink shadow-comic-sm">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b-2 border-ink bg-navy/5">
              <th className="px-3 py-2 text-left font-heading text-xs uppercase text-navy">Provider</th>
              <th className="px-3 py-2 text-left font-heading text-xs uppercase text-navy">Ruta</th>
              <th className="px-3 py-2 text-left font-heading text-xs uppercase text-navy">Cuenta / perfil</th>
              <th className="px-3 py-2 text-left font-heading text-xs uppercase text-navy">Usa ahora</th>
              <th className="px-3 py-2 text-center font-heading text-xs uppercase text-navy">Motor</th>
              <th className="px-3 py-2 text-right font-heading text-xs uppercase text-navy">Consola</th>
              <th className="px-3 py-2 text-right font-heading text-xs uppercase text-navy">Acción</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && rows.every((r) => !r.provider) ? (
              <tr>
                <td colSpan={7} className="px-3 py-4 text-sm text-muted-foreground">
                  cargando estado del motor…
                </td>
              </tr>
            ) : (
              rows.map(({ rp, provider, route, configured, engineModel, isEngine, usingModel, healthError }) => {
                const consoleUrl = consoleUrlFor(rp.key, route);
                const consoleHost = consoleLabelFor(rp.key, route);
                return (
                  <tr
                    key={rp.key}
                    className={cn(
                      "border-b border-border align-middle last:border-b-0",
                      isEngine && "bg-sage/[0.06]",
                    )}
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{rp.icon}</span>
                        <div>
                          <div className="font-mono font-semibold">{rp.name}</div>
                          <div className="text-[11px] text-muted-foreground">{rp.key}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        title={provider?.sourceLabel || undefined}
                        className={cn(
                          "rounded px-2 py-0.5 text-[10px] font-bold uppercase",
                          routeClass(route, configured),
                        )}
                      >
                        {configured ? routeLabel(route) : "sin auth"}
                      </span>
                      {healthError && (
                        <div
                          className="mt-1 max-w-[200px] truncate text-[10px] font-bold text-red-600"
                          title={healthError}
                        >
                          ⚠ key inválida
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className="block max-w-[230px] truncate font-mono text-[12px] text-muted-foreground"
                        title={provider?.sourceLabel || undefined}
                      >
                        {provider?.sourceLabel ? maskAuthLabel(provider.sourceLabel) : "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="block max-w-[200px] truncate font-mono text-[12px] text-muted-foreground" title={usingModel || undefined}>
                        {usingModel || "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {isEngine ? (
                        <span className="rounded-full bg-sage/16 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-sage">
                          motor
                        </span>
                      ) : engineModel ? (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => saveModel(engineModel)}
                          className="rounded border border-ink px-2 py-0.5 text-[11px] font-semibold text-navy hover:bg-rust hover:text-white transition-colors disabled:opacity-50"
                        >
                          usar
                        </button>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">n/d</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {consoleUrl ? (
                        <a
                          href={consoleUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={consoleHost || undefined}
                          className="text-[11px] font-semibold text-rust underline-offset-2 hover:underline whitespace-nowrap"
                        >
                          🔗 {consoleHost || "consola"}
                        </a>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => onOpenSystemKey(rp.apiId, rp.name)}
                        className="text-[11px] px-2.5 py-1 bg-background border border-border rounded-md cursor-pointer hover:border-rust hover:bg-rust hover:text-white transition-all whitespace-nowrap"
                      >
                        🔑 Key sistema
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[11.5px] leading-relaxed text-muted-foreground">
        <strong>Qué ves:</strong> ruta (suscripción / API / env) + cuenta/perfil enmascarado, no siempre un email.{" "}
        <strong>No hay cuota/uso en vivo</strong> (OpenClaw no lo expone): el botón de consola es para revisar límites y
        facturación. Guardar/rotar una <strong>Key sistema</strong> reinicia el gateway para aplicarla; dar de alta una
        suscripción/OAuth nueva es trabajo de infra.
      </p>
    </div>
  );
}
