"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useModelCatalog, useSetAuthRoute, type CatalogProvider } from "@/hooks/useModels";
import { RUNTIME_PROVIDERS, consoleUrlFor, consoleLabelFor, type RuntimeProvider } from "@/lib/provider-console";
import { routeLabel, routeClass, effectiveRoute, maskAuthLabel } from "@/lib/provider-auth-display";
import { AuthInstructions } from "@/components/settings/auth-instructions";
import { cn } from "@/lib/utils";

interface RuntimeMotorSectionProps {
  /** Opens the parent panel's "Key sistema" slider for a route of a gateway provider. */
  onOpenSystemKey: (apiId: string, provider: string, route?: "subscription" | "api") => void;
}

function findProvider(rp: RuntimeProvider, providers: CatalogProvider[]): CatalogProvider | undefined {
  for (const id of rp.catalogIds) {
    const hit = providers.find((p) => p.id === id);
    if (hit) return hit;
  }
  return undefined;
}

interface SystemEnvField {
  masked?: string;
  hasValue?: boolean;
}

interface RuntimeSystemEnvStatus {
  hasValue: boolean;
  label: string | null;
}

function serviceHasCredential(status: string | undefined): boolean {
  return status === "ok" || status === "error";
}

function summarizeSystemEnv(fields: Record<string, SystemEnvField>): RuntimeSystemEnvStatus {
  const configured = Object.entries(fields).find(([, field]) => field?.hasValue);
  if (!configured) return { hasValue: false, label: null };

  const [key, field] = configured;
  return {
    hasValue: true,
    label: `env: ${key}${field.masked ? ` · ${field.masked}` : ""}`,
  };
}

/**
 * Engine auth routes (global). Each provider that supports a subscription shows
 * two rows (Suscripción / API Key); you activate one for the whole motor. The
 * per-agent *model* (the "motor concreto" of each agent) is chosen in the Models
 * tab — this section does not touch it.
 */
export function RuntimeMotorSection({ onOpenSystemKey }: RuntimeMotorSectionProps) {
  const router = useRouter();
  const { data: catalog, isLoading } = useModelCatalog();
  const { mutate: setAuthRoute, isPending } = useSetAuthRoute();
  const qc = useQueryClient();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);
  const [codexGuide, setCodexGuide] = useState(false);
  const [rechecking, setRechecking] = useState(false);

  const providers = useMemo(() => catalog?.providers ?? [], [catalog]);

  // The catalog only knows whether a credential is *present* (route), not whether
  // the provider *accepts* it. api-health pings the provider, so a present-but-
  // rejected key surfaces here as status "error" on the active row.
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

  const { data: systemEnv } = useQuery<Record<string, RuntimeSystemEnvStatus>>({
    queryKey: ["runtime-system-env"],
    queryFn: async () => {
      const apiIds = Array.from(new Set(RUNTIME_PROVIDERS.map((rp) => rp.apiId)));
      const entries = await Promise.all(
        apiIds.map(async (apiId) => {
          const res = await fetch(`/api/env?service=${encodeURIComponent(apiId)}`);
          if (!res.ok) return [apiId, { hasValue: false, label: null }] as const;
          const payload = (await res.json().catch(() => ({}))) as Record<string, SystemEnvField>;
          return [apiId, summarizeSystemEnv(payload)] as const;
        }),
      );
      return Object.fromEntries(entries);
    },
    staleTime: 10_000,
  });

  const rows = useMemo(
    () =>
      RUNTIME_PROVIDERS.map((rp) => {
        const provider = findProvider(rp, providers);
        const auth = provider?.auth;
        const effRoute = effectiveRoute(provider);
        const svc = services[rp.apiId];
        const env = systemEnv?.[rp.apiId];
        const hasSystemCredential = !!env?.hasValue || serviceHasCredential(svc?.status);
        const routeForRow = rp.route ?? (hasSystemCredential ? "env" : effRoute);
        const present =
          rp.route === "subscription"
            ? !!auth?.hasSubscription
            : rp.route === "api"
              ? !!auth?.hasApiKey || hasSystemCredential
              : !!provider?.configured || hasSystemCredential;
        // A split row is "active" when the gateway's effective route matches it;
        // a single-route row is active whenever it's configured.
        const isActive = rp.route !== undefined ? rp.route === effRoute : !!provider?.configured || hasSystemCredential;
        const label =
          rp.route === "subscription"
            ? auth?.subscriptionLabels?.[0] || auth?.effectiveLabel
            : rp.route === "api"
              ? auth?.apiKeyLabels?.[0] || auth?.effectiveLabel || env?.label
              : provider?.sourceLabel || env?.label;
        const healthError =
          isActive && svc?.status === "error" ? svc.details?.error || svc.error || "credencial rechazada" : null;
        return { rp, provider, routeForRow, present, isActive, label: label || null, healthError };
      }),
    [providers, services, systemEnv],
  );

  const activate = (rp: RuntimeProvider) => {
    if (rp.route !== "subscription" && rp.route !== "api") return;
    const route = rp.route;
    setPendingKey(rp.key);
    setNotice(null);
    setAuthRoute(
      { provider: rp.apiId, route },
      {
        onSuccess: (data) => {
          setNotice({
            ok: true,
            message: data?.warning || `Ruta «${routeLabel(route)}» activada para ${rp.name}.`,
          });
          setPendingKey(null);
        },
        onError: (err: unknown) => {
          setNotice({ ok: false, message: err instanceof Error ? err.message : "No se pudo activar la ruta" });
          setPendingKey(null);
        },
      },
    );
  };

  // Codex login happens over SSH (outside the app); after the user does it, this
  // re-pings the provider and refreshes the row so they see it land.
  const recheckCodex = async () => {
    setRechecking(true);
    setNotice(null);
    try {
      await fetch("/api/system/health-check-all?service=openai").catch(() => null);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["api-health"] }),
        qc.invalidateQueries({ queryKey: ["runtime-system-env"] }),
        qc.invalidateQueries({ queryKey: ["models-catalog"] }),
      ]);
      setNotice({ ok: true, message: "Estado del motor actualizado." });
    } finally {
      setRechecking(false);
      setCodexGuide(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* The engine's auth route is global; the per-agent model lives in Models. */}
      <div className="rounded-lg border-2 border-ink bg-sage/5 px-4 py-3 text-[12.5px] leading-relaxed text-foreground/80">
        <strong className="font-heading text-navy">🔐 Autenticación del motor.</strong>{" "}
        Elige la <strong>ruta</strong> (suscripción/OAuth o API key) con la que el motor se autentica ante cada
        proveedor — es <strong>global</strong>, compartida por todos los agentes. El <strong>modelo de cada agente</strong>{" "}
        (su «motor concreto») se elige en{" "}
        <button
          type="button"
          onClick={() => router.replace({ query: { ...router.query, tab: "agents" } }, undefined, { shallow: true })}
          className="font-semibold text-rust hover:underline"
        >
          Agentes
        </button>
        .
      </div>

      {notice && (
        <div
          className={cn(
            "rounded-lg border px-3 py-2 text-xs",
            notice.ok ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700",
          )}
        >
          {notice.message}
        </div>
      )}

      {/* Auth routes table */}
      <div className="overflow-x-auto rounded-lg border-2 border-ink shadow-comic-sm">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b-2 border-ink bg-navy/5">
              <th className="px-3 py-2 text-left font-heading text-xs uppercase text-navy">Proveedor</th>
              <th className="px-3 py-2 text-left font-heading text-xs uppercase text-navy">Ruta</th>
              <th className="px-3 py-2 text-left font-heading text-xs uppercase text-navy">Cuenta / perfil</th>
              <th className="px-3 py-2 text-center font-heading text-xs uppercase text-navy">Estado</th>
              <th className="px-3 py-2 text-right font-heading text-xs uppercase text-navy">Consola</th>
              <th className="px-3 py-2 text-right font-heading text-xs uppercase text-navy">Acción</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && rows.every((r) => !r.provider) ? (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-sm text-muted-foreground">
                  cargando estado del motor…
                </td>
              </tr>
            ) : (
              rows.map(({ rp, routeForRow, present, isActive, label, healthError }) => {
                const consoleUrl = consoleUrlFor(rp.apiId, routeForRow);
                const consoleHost = consoleLabelFor(rp.apiId, routeForRow);
                const subRow = rp.route === "subscription";
                const canPasteToken = subRow && !!rp.subscriptionTokenEnv; // Anthropic subscription
                const rowPending = pendingKey === rp.key;
                return (
                  <tr
                    key={rp.key}
                    className={cn("border-b border-border align-middle last:border-b-0", isActive && "bg-sage/[0.06]")}
                  >
                    {/* Provider + route */}
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{rp.icon}</span>
                        <div>
                          <div className="font-mono font-semibold">{rp.name}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {rp.route ? (rp.route === "subscription" ? "suscripción" : "API key") : rp.key}
                          </div>
                        </div>
                      </div>
                    </td>
                    {/* Route badge */}
                    <td className="px-3 py-2.5">
                      <span
                        className={cn("rounded px-2 py-0.5 text-[10px] font-bold uppercase", routeClass(routeForRow, present))}
                      >
                        {present ? routeLabel(routeForRow) : "sin auth"}
                      </span>
                      {healthError && (
                        <div className="mt-1 max-w-[200px] truncate text-[10px] font-bold text-red-600" title={healthError}>
                          ⚠ credencial rechazada
                        </div>
                      )}
                    </td>
                    {/* Account / profile */}
                    <td className="px-3 py-2.5">
                      <span
                        className="block max-w-[230px] truncate font-mono text-[12px] text-muted-foreground"
                        title={label || undefined}
                      >
                        {label ? maskAuthLabel(label) : "—"}
                      </span>
                    </td>
                    {/* Status */}
                    <td className="px-3 py-2.5 text-center">
                      {isActive ? (
                        <span className="rounded-full bg-sage/16 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-sage">
                          activa
                        </span>
                      ) : present ? (
                        <span className="text-[10px] font-semibold text-muted-foreground">disponible</span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">sin auth</span>
                      )}
                    </td>
                    {/* Console */}
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
                    {/* Action */}
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5 justify-end flex-wrap">
                        {/* Activate route (Anthropic only switches at runtime) */}
                        {rp.route && !isActive && rp.runtimeSwitchable && (
                          <button
                            type="button"
                            disabled={isPending || (subRow && !present)}
                            title={subRow && !present ? "Pega el token de suscripción primero" : undefined}
                            onClick={() => activate(rp)}
                            className="rounded border border-ink px-2 py-0.5 text-[11px] font-semibold text-navy hover:bg-rust hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {rowPending ? "activando…" : "Activar"}
                          </button>
                        )}
                        {/* Manage credential */}
                        {canPasteToken ? (
                          <button
                            type="button"
                            onClick={() => onOpenSystemKey(rp.apiId, rp.name, "subscription")}
                            className="text-[11px] px-2.5 py-1 bg-background border border-border rounded-md cursor-pointer hover:border-rust hover:bg-rust hover:text-white transition-all whitespace-nowrap"
                          >
                            🎫 Pegar token
                          </button>
                        ) : !subRow ? (
                          <button
                            type="button"
                            onClick={() => onOpenSystemKey(rp.apiId, rp.name, rp.route)}
                            className="text-[11px] px-2.5 py-1 bg-background border border-border rounded-md cursor-pointer hover:border-rust hover:bg-rust hover:text-white transition-all whitespace-nowrap"
                          >
                            🔑 Key sistema
                          </button>
                        ) : (
                          /* Codex subscription: SSH-only login, no in-app paste — show the how-to. */
                          <button
                            type="button"
                            onClick={() => setCodexGuide(true)}
                            className="text-[11px] px-2.5 py-1 bg-background border border-border rounded-md cursor-pointer hover:border-rust hover:bg-rust hover:text-white transition-all whitespace-nowrap"
                          >
                            📋 Instrucciones
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[11.5px] leading-relaxed text-muted-foreground">
        <strong>Qué ves:</strong> la <strong>ruta</strong> con la que el motor se autentica en cada proveedor y la
        cuenta/perfil enmascarado. <strong>Activar</strong> conmuta la ruta y reinicia el gateway para aplicarla. La
        suscripción de Anthropic se carga con <strong>🎫 Pegar token → Guardar y activar</strong>; la de Codex se
        conecta por SSH (pulsa <strong>📋 Instrucciones</strong>). <strong>No hay cuota/uso en vivo</strong>{" "}
        (OpenClaw no lo expone): la consola es para revisar límites y facturación.
      </p>

      {codexGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setCodexGuide(false)}
        >
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="relative w-full max-w-[480px] rounded-lg border-2 border-ink bg-card shadow-comic"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-ink px-4 py-3">
              <h3 className="font-heading text-base text-navy">⚙️ Conectar Codex (suscripción ChatGPT)</h3>
              <button
                type="button"
                onClick={() => setCodexGuide(false)}
                className="px-1 text-lg leading-none text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>
            <div className="space-y-3 p-4">
              <AuthInstructions
                intro="El login de Codex (suscripción ChatGPT) es interactivo y se hace por SSH en el VPS del motor — no se puede pegar aquí. El cambio de ruta en runtime llegará en una iteración futura (SAN-301)."
                steps={[
                  { text: "Conéctate por SSH al VPS del motor (o pídeselo a quien tenga acceso al VPS)." },
                  {
                    text: "Córrelo una vez; el store compartido lo propaga a todos los agentes Codex (automator, etc.):",
                    command: "openclaw models auth login --agent cervantes",
                  },
                  { text: "Autoriza con tu cuenta ChatGPT en el navegador que abre el comando." },
                  { text: "Vuelve aquí y pulsa Re-verificar." },
                ]}
                footnote="Por qué no hay botón aquí: el login OAuth vive en el CLI del motor y el sync por-agente no tiene inverso idempotente (SAN-301)."
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={recheckCodex}
                  disabled={rechecking}
                  className="rounded border border-ink px-3 py-1.5 text-[12px] font-semibold text-navy transition-colors hover:bg-rust hover:text-white disabled:opacity-50"
                >
                  {rechecking ? "verificando…" : "🔄 Re-verificar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
