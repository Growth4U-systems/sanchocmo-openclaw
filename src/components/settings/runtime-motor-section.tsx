"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clipboard, PlugZap, RefreshCcw, Terminal } from "lucide-react";
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
  label?: string;
  placeholder?: string;
  help?: string;
  masked?: string;
  hasValue?: boolean;
}

interface RuntimeSystemEnvStatus {
  hasValue: boolean;
  label: string | null;
}

interface RuntimeAdapterOption {
  id: string;
  label: string;
  displayName?: string;
  description: string;
  note: string;
  configured: boolean;
  requiredEnv?: string[];
  capabilities: Record<string, boolean>;
  health: {
    ok: boolean;
    details?: Record<string, unknown>;
  };
}

interface RuntimeStatus {
  active: string;
  source: "ui" | "env" | "default";
  envRuntime?: string | null;
  selected?: {
    updatedAt?: string | null;
    updatedBy?: string | null;
  };
  options: RuntimeAdapterOption[];
  warning?: string | null;
}

type CliRuntimeId = "hermes" | "claude-code" | "codex";

interface RuntimeBridgeProvider {
  id: CliRuntimeId;
  label: string;
  defaultPort: number;
  defaultGatewayUrl: string;
}

interface RuntimeBridgeStatus {
  ok: boolean;
  active: string;
  configuredKind: CliRuntimeId | null;
  providers: RuntimeBridgeProvider[];
}

interface PreparedRuntimeBridge {
  provider: CliRuntimeId;
  label: string;
  gatewayUrl: string;
  command: string;
}

const CLI_RUNTIME_META: Record<CliRuntimeId, { title: string; subtitle: string; account: string }> = {
  hermes: {
    title: "Hermes CLI",
    subtitle: "Para correr Sancho con Hermes desde un bridge externo.",
    account: "Usa la auth y el modelo configurados en Hermes.",
  },
  "claude-code": {
    title: "Claude Code",
    subtitle: "Para correr Sancho con la sesión Claude Code del host.",
    account: "Usa la suscripción o API configurada en Claude Code.",
  },
  codex: {
    title: "Codex",
    subtitle: "Para correr Sancho con Codex CLI.",
    account: "Usa la cuenta ChatGPT/Codex o API configurada en el CLI.",
  },
};

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

function runtimeSourceLabel(source: RuntimeStatus["source"] | undefined): string {
  if (source === "ui") return "UI";
  if (source === "env") return "SANCHO_RUNTIME";
  return "default";
}

function runtimeHealthDetail(option: RuntimeAdapterOption): string | null {
  const details = option.health.details;
  if (!details) return null;
  if (typeof details.error === "string") return details.error;
  if (typeof details.baseUrl === "string") return details.baseUrl;
  if (typeof details.gatewayUrl === "string") return details.gatewayUrl;
  if (typeof details.status === "number") return `status ${details.status}`;
  return null;
}

function runtimeCapabilitySummary(option: RuntimeAdapterOption): string {
  const enabled = Object.entries(option.capabilities)
    .filter(([, value]) => value)
    .map(([key]) => key);
  return enabled.length ? enabled.join(", ") : "sin capacidades activas";
}

function hasExternalRuntimeEnv(env: Record<string, SystemEnvField> | undefined, key: string): boolean {
  return !!env?.[key]?.hasValue;
}

function externalRuntimeMasked(env: Record<string, SystemEnvField> | undefined, ...keys: string[]): string | null {
  for (const key of keys) {
    const field = env?.[key];
    if (field?.hasValue) return field.masked || "URL guardada";
  }
  return null;
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
  const [runtimePending, setRuntimePending] = useState<string | null>(null);
  const [runtimeRefreshing, setRuntimeRefreshing] = useState(false);
  const [externalSaving, setExternalSaving] = useState(false);
  const [bridgeDrafts, setBridgeDrafts] = useState<Record<CliRuntimeId, string>>({
    hermes: "",
    "claude-code": "",
    codex: "",
  });
  const [preparedBridge, setPreparedBridge] = useState<PreparedRuntimeBridge | null>(null);
  const [bridgePending, setBridgePending] = useState<string | null>(null);
  const [copiedBridge, setCopiedBridge] = useState<CliRuntimeId | null>(null);
  const [externalDraft, setExternalDraft] = useState({
    protocol: "",
    gatewayUrl: "",
    secret: "",
    inboundPath: "",
    healthPath: "",
    agent: "",
  });

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

  const { data: runtimeStatus, isLoading: runtimeLoading } = useQuery<RuntimeStatus>({
    queryKey: ["system-runtime"],
    queryFn: async () => {
      const res = await fetch("/api/system/runtime");
      const payload = (await res.json().catch(() => ({}))) as RuntimeStatus & { error?: string };
      if (!res.ok) throw new Error(payload.error || "No se pudo leer el runtime activo");
      return payload;
    },
    staleTime: 10_000,
  });

  const { data: runtimeBridgeStatus } = useQuery<RuntimeBridgeStatus>({
    queryKey: ["runtime-bridge"],
    queryFn: async () => {
      const res = await fetch("/api/system/runtime-bridge");
      const payload = (await res.json().catch(() => ({}))) as RuntimeBridgeStatus & { error?: string };
      if (!res.ok) throw new Error(payload.error || "No se pudo leer el bridge de runtime");
      return payload;
    },
    staleTime: 10_000,
  });

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

  const { data: externalRuntimeEnv } = useQuery<Record<string, SystemEnvField>>({
    queryKey: ["runtime-external-env"],
    queryFn: async () => {
      const res = await fetch("/api/env?service=runtime-external");
      if (!res.ok) return {};
      return res.json();
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
        const present = rp.route === "subscription" ? !!auth?.hasSubscription : rp.route === "api" ? !!auth?.hasApiKey || hasSystemCredential : !!provider?.configured || hasSystemCredential;
        // A split row is "active" when the gateway's effective route matches it;
        // a single-route row is active whenever it's configured.
        const isActive = rp.route !== undefined ? rp.route === effRoute : !!provider?.configured || hasSystemCredential;
        const label = rp.route === "subscription" ? auth?.subscriptionLabels?.[0] || auth?.effectiveLabel : rp.route === "api" ? auth?.apiKeyLabels?.[0] || auth?.effectiveLabel || env?.label : provider?.sourceLabel || env?.label;
        const healthError = isActive && svc?.status === "error" ? svc.details?.error || svc.error || "credencial rechazada" : null;
        return {
          rp,
          provider,
          routeForRow,
          present,
          isActive,
          label: label || null,
          healthError,
        };
      }),
    [providers, services, systemEnv],
  );

  const cliRuntimeCards = useMemo(() => {
    const providersById = new Map((runtimeBridgeStatus?.providers ?? []).map((provider) => [provider.id, provider]));
    return (["hermes", "claude-code", "codex"] as CliRuntimeId[]).map((id) => {
      const provider = providersById.get(id);
      return {
        id,
        label: provider?.label || (id === "hermes" ? "Hermes" : id === "claude-code" ? "Claude Code" : "Codex"),
        defaultGatewayUrl: provider?.defaultGatewayUrl || (id === "hermes" ? "http://127.0.0.1:18791" : id === "claude-code" ? "http://127.0.0.1:18792" : "http://127.0.0.1:18793"),
        ...CLI_RUNTIME_META[id],
      };
    });
  }, [runtimeBridgeStatus?.providers]);

  const runtimeOptionsById = useMemo(() => {
    return new Map((runtimeStatus?.options ?? []).map((option) => [option.id, option]));
  }, [runtimeStatus?.options]);

  const openClawRuntime = runtimeOptionsById.get("openclaw");
  const activeRuntimeOption = runtimeOptionsById.get(runtimeStatus?.active ?? "");
  const activeCliRuntime = runtimeStatus?.active === "external-http" && runtimeBridgeStatus?.configuredKind ? cliRuntimeCards.find((card) => card.id === runtimeBridgeStatus.configuredKind) : null;
  const activeRuntimeLabel = activeCliRuntime?.title || (runtimeStatus?.active === "openclaw" ? "Sancho integrado" : runtimeStatus?.active === "hermes" ? "Hermes gestionado" : activeRuntimeOption?.displayName || activeRuntimeOption?.label || "Sin verificar");
  const activeRuntimeCopy = runtimeStatus?.active === "external-http" ? (activeCliRuntime ? `Sancho delega los mensajes nuevos en ${activeCliRuntime.title}.` : "Sancho delega los mensajes nuevos en un gateway HTTP externo.") : runtimeStatus?.active === "openclaw" ? "Sancho ejecuta los mensajes con su runtime integrado." : activeRuntimeOption?.description || "Verifica el estado para confirmar el runtime activo.";
  const externalRuntimeAvailable = runtimeStatus?.options.some((option) => option.id === "external-http") ?? false;
  const openClawActive = runtimeStatus?.active === "openclaw";
  const openClawReady = !!openClawRuntime?.configured && !!openClawRuntime?.health.ok;

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
          setNotice({
            ok: false,
            message: err instanceof Error ? err.message : "No se pudo activar la ruta",
          });
          setPendingKey(null);
        },
      },
    );
  };

  const selectRuntime = async (option: RuntimeAdapterOption) => {
    if (option.id === runtimeStatus?.active) return;
    setRuntimePending(option.id);
    setNotice(null);

    try {
      const res = await fetch("/api/system/runtime", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runtime: option.id }),
      });
      const payload = (await res.json().catch(() => ({}))) as RuntimeStatus & {
        error?: string;
        warning?: string | null;
      };
      if (!res.ok) throw new Error(payload.error || "No se pudo cambiar el runtime");

      await Promise.all([qc.invalidateQueries({ queryKey: ["system-runtime"] }), qc.invalidateQueries({ queryKey: ["api-health"] }), qc.invalidateQueries({ queryKey: ["models-catalog"] })]);
      setNotice({
        ok: true,
        message: payload.warning || `${option.label} activado para los mensajes nuevos.`,
      });
    } catch (err) {
      setNotice({
        ok: false,
        message: err instanceof Error ? err.message : "No se pudo cambiar el runtime",
      });
    } finally {
      setRuntimePending(null);
    }
  };

  const refreshRuntimeStatus = async () => {
    setRuntimeRefreshing(true);
    try {
      await qc.invalidateQueries({ queryKey: ["system-runtime"] });
      setNotice({ ok: true, message: "Estado del runtime actualizado." });
    } finally {
      setRuntimeRefreshing(false);
    }
  };

  const saveExternalRuntime = async () => {
    const vars: Record<string, string> = {};
    if (externalDraft.protocol.trim()) vars.SANCHO_EXTERNAL_PROTOCOL = externalDraft.protocol.trim();
    if (externalDraft.gatewayUrl.trim()) vars.SANCHO_EXTERNAL_GATEWAY_URL = externalDraft.gatewayUrl.trim();
    if (externalDraft.secret.trim()) vars.SANCHO_EXTERNAL_SECRET = externalDraft.secret.trim();
    if (externalDraft.inboundPath.trim()) {
      if (externalDraft.protocol === "mc-bridge") vars.SANCHO_EXTERNAL_CHAT_PATH = externalDraft.inboundPath.trim();
      else vars.SANCHO_EXTERNAL_INBOUND_PATH = externalDraft.inboundPath.trim();
    }
    if (externalDraft.healthPath.trim()) vars.SANCHO_EXTERNAL_HEALTH_PATH = externalDraft.healthPath.trim();
    if (externalDraft.agent.trim()) vars.SANCHO_EXTERNAL_AGENT = externalDraft.agent.trim();

    if (Object.keys(vars).length === 0) {
      setNotice({
        ok: false,
        message: "No hay cambios para guardar en el runtime externo.",
      });
      return;
    }

    setExternalSaving(true);
    setNotice(null);
    try {
      const res = await fetch("/api/env", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service: "runtime-external", vars }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!res.ok) throw new Error(payload.error || "No se pudo guardar el runtime externo");

      setExternalDraft({
        protocol: "",
        gatewayUrl: "",
        secret: "",
        inboundPath: "",
        healthPath: "",
        agent: "",
      });
      await Promise.all([qc.invalidateQueries({ queryKey: ["runtime-external-env"] }), qc.invalidateQueries({ queryKey: ["system-runtime"] })]);
      setNotice({
        ok: true,
        message: "Runtime externo guardado. La verificación ya se actualizó.",
      });
    } catch (err) {
      setNotice({
        ok: false,
        message: err instanceof Error ? err.message : "No se pudo guardar el runtime externo",
      });
    } finally {
      setExternalSaving(false);
    }
  };

  const prepareCliBridge = async (provider: CliRuntimeId) => {
    setBridgePending(`${provider}:prepare`);
    setNotice(null);
    try {
      const res = await fetch("/api/system/runtime-bridge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "prepare",
          provider,
          gatewayUrl: bridgeDrafts[provider].trim() || undefined,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as PreparedRuntimeBridge & { error?: string };
      if (!res.ok) throw new Error(payload.error || "No se pudo preparar el bridge");

      setPreparedBridge(payload);
      await Promise.all([qc.invalidateQueries({ queryKey: ["runtime-bridge"] }), qc.invalidateQueries({ queryKey: ["runtime-external-env"] }), qc.invalidateQueries({ queryKey: ["system-runtime"] })]);
      setNotice({
        ok: true,
        message: `${payload.label} preparado. Ejecuta el comando y verifica la conexión.`,
      });
    } catch (err) {
      setNotice({
        ok: false,
        message: err instanceof Error ? err.message : "No se pudo preparar el bridge",
      });
    } finally {
      setBridgePending(null);
    }
  };

  const copyBridgeCommand = async (provider: CliRuntimeId, command: string) => {
    try {
      await navigator.clipboard.writeText(command);
      setCopiedBridge(provider);
      window.setTimeout(() => setCopiedBridge(null), 1800);
    } catch {
      setNotice({
        ok: false,
        message: "No se pudo copiar. Selecciona el comando manualmente.",
      });
    }
  };

  const verifyAndActivateCliBridge = async (provider: CliRuntimeId) => {
    setBridgePending(`${provider}:verify`);
    setNotice(null);
    try {
      const res = await fetch("/api/system/runtime-bridge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", provider, activate: true }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        active?: string;
      };
      if (!res.ok || !payload.ok) throw new Error(payload.error || "El bridge todavía no responde");

      await Promise.all([qc.invalidateQueries({ queryKey: ["runtime-bridge"] }), qc.invalidateQueries({ queryKey: ["system-runtime"] }), qc.invalidateQueries({ queryKey: ["api-health"] })]);
      setNotice({
        ok: true,
        message: "Runtime externo activado para los mensajes nuevos.",
      });
    } catch (err) {
      setNotice({
        ok: false,
        message: err instanceof Error ? err.message : "No se pudo activar el runtime",
      });
    } finally {
      setBridgePending(null);
    }
  };

  // Codex login happens over SSH (outside the app); after the user does it, this
  // re-pings the provider and refreshes the row so they see it land.
  const recheckCodex = async () => {
    setRechecking(true);
    setNotice(null);
    try {
      await fetch("/api/system/health-check-all?service=openai").catch(() => null);
      await Promise.all([qc.invalidateQueries({ queryKey: ["api-health"] }), qc.invalidateQueries({ queryKey: ["runtime-system-env"] }), qc.invalidateQueries({ queryKey: ["models-catalog"] })]);
      setNotice({ ok: true, message: "Estado del motor actualizado." });
    } finally {
      setRechecking(false);
      setCodexGuide(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border-2 border-ink bg-background p-4 shadow-comic-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="font-heading text-sm text-navy">Motor de Sancho</h3>
            <p className="mt-1 text-[12.5px] leading-relaxed text-foreground/75">Elige quién ejecuta los mensajes nuevos. Sancho conserva el contexto, las skills, los documentos y las integraciones.</p>
          </div>
          <button type="button" onClick={refreshRuntimeStatus} disabled={runtimeRefreshing} className="w-fit rounded border border-ink px-3 py-1.5 text-[12px] font-semibold text-navy transition-colors hover:bg-rust hover:text-white disabled:opacity-50">
            {runtimeRefreshing ? "verificando…" : "Re-verificar"}
          </button>
        </div>

        <div className="mt-4 rounded-lg border border-sage/50 bg-sage/10 px-3 py-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-[10.5px] font-bold uppercase tracking-wide text-sage">Activo ahora</div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="font-heading text-base text-navy">{runtimeLoading && !runtimeStatus ? "Verificando..." : activeRuntimeLabel}</span>
                {runtimeStatus && <span className="rounded-full bg-background px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">{runtimeSourceLabel(runtimeStatus.source)}</span>}
              </div>
              <p className="mt-1 text-[12px] leading-relaxed text-foreground/75">{activeRuntimeCopy}</p>
            </div>
            <div className="flex items-center gap-1.5 rounded-full border border-sage/40 bg-background px-2.5 py-1 text-[10px] font-semibold uppercase text-sage">
              <CheckCircle2 className="h-3.5 w-3.5" />
              mensajes nuevos
            </div>
          </div>
          {runtimeStatus?.warning && <p className="mt-2 text-[11px] font-semibold text-rust">{runtimeStatus.warning}</p>}
        </div>

        <div className="mt-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h4 className="font-heading text-[13px] text-navy">Elige un motor</h4>
              <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">Para la mayoría de casos, solo elige el motor y pulsa el botón. No necesitas tocar URLs.</p>
            </div>
            {externalRuntimeAvailable && (
              <div className="flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[10px] font-semibold uppercase text-muted-foreground">
                <PlugZap className="h-3.5 w-3.5" />
                {runtimeBridgeStatus?.configuredKind ? `${CLI_RUNTIME_META[runtimeBridgeStatus.configuredKind].title} preparado` : "sin motor externo"}
              </div>
            )}
          </div>

          {runtimeLoading && !runtimeStatus ? (
            <div className="mt-3 rounded-md border border-border px-3 py-3 text-sm text-muted-foreground">Cargando motores...</div>
          ) : (
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className={cn("flex min-h-[170px] flex-col rounded-lg border p-3", openClawActive ? "border-sage bg-sage/10" : openClawReady ? "border-border bg-card" : "border-border bg-muted/30 text-muted-foreground")}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-heading text-sm text-navy">Sancho integrado</div>
                    <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">Usa el runtime completo que ya viene con Sancho.</p>
                  </div>
                  <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", openClawActive ? "bg-sage/16 text-sage" : openClawReady ? "bg-navy/10 text-navy" : "bg-muted text-muted-foreground")}>
                    {openClawActive && <CheckCircle2 className="h-3 w-3" />}
                    {openClawActive ? "activo" : openClawReady ? "listo" : "offline"}
                  </span>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">Opción simple y estable. También sirve como fallback si un bridge externo no responde.</p>
                <button type="button" onClick={() => openClawRuntime && selectRuntime(openClawRuntime)} disabled={!openClawRuntime || openClawActive || !openClawReady || !!runtimePending} className="mt-auto inline-flex w-fit items-center gap-1.5 rounded border border-ink px-3 py-1.5 text-[12px] font-semibold text-navy transition-colors hover:bg-rust hover:text-white disabled:opacity-50">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {runtimePending === "openclaw" ? "activando..." : openClawActive ? "Activo" : "Usar Sancho"}
                </button>
              </div>

              {externalRuntimeAvailable &&
                cliRuntimeCards.map((card) => {
                  const prepared = preparedBridge?.provider === card.id ? preparedBridge : null;
                  const isConfigured = runtimeBridgeStatus?.configuredKind === card.id;
                  const isActive = runtimeStatus?.active === "external-http" && isConfigured;
                  const readyToActivate = !!prepared || isConfigured;
                  const preparing = bridgePending === `${card.id}:prepare`;
                  const verifying = bridgePending === `${card.id}:verify`;
                  const disabled = isActive || !!bridgePending;
                  const actionLabel = isActive ? "Activo" : verifying ? "activando..." : preparing ? "preparando..." : readyToActivate ? "Activar" : "Conectar";

                  return (
                    <div key={card.id} className={cn("flex min-h-[170px] flex-col rounded-lg border p-3", isActive ? "border-sage bg-sage/10" : isConfigured ? "border-navy/30 bg-navy/[0.03]" : "border-border bg-card")}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-heading text-sm text-navy">{card.title}</div>
                          <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">{card.subtitle}</p>
                        </div>
                        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", isActive ? "bg-sage/16 text-sage" : isConfigured ? "bg-navy/10 text-navy" : "bg-muted text-muted-foreground")}>
                          {isActive && <CheckCircle2 className="h-3 w-3" />}
                          {isActive ? "activo" : isConfigured ? "listo" : "nuevo"}
                        </span>
                      </div>

                      <p className="mt-2 text-[11px] text-muted-foreground">{card.account}</p>

                      <button
                        type="button"
                        onClick={() => {
                          if (readyToActivate) verifyAndActivateCliBridge(card.id);
                          else prepareCliBridge(card.id);
                        }}
                        disabled={disabled}
                        className="mt-auto inline-flex w-fit items-center gap-1.5 rounded border border-ink px-3 py-1.5 text-[12px] font-semibold text-navy transition-colors hover:bg-rust hover:text-white disabled:opacity-50"
                      >
                        {readyToActivate ? <RefreshCcw className="h-3.5 w-3.5" /> : <Terminal className="h-3.5 w-3.5" />}
                        {actionLabel}
                      </button>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        {preparedBridge && (
          <div className="mt-4 rounded-lg border border-sage/50 bg-sage/10 p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h4 className="font-heading text-[13px] text-navy">{preparedBridge.label} preparado</h4>
                <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">Ejecuta este comando en el host donde corre Sancho. Después vuelve y activa el motor.</p>
              </div>
              <button type="button" onClick={() => verifyAndActivateCliBridge(preparedBridge.provider)} disabled={!!bridgePending} className="w-fit rounded border border-ink px-3 py-1.5 text-[12px] font-semibold text-navy transition-colors hover:bg-sage hover:text-white disabled:opacity-50">
                {bridgePending === `${preparedBridge.provider}:verify` ? "activando..." : "Ya lo ejecuté, activar"}
              </button>
            </div>
            <div className="mt-3 rounded-md border border-border bg-background p-2">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-[10.5px] font-semibold uppercase text-muted-foreground">Comando para iniciar el bridge</span>
                <button type="button" onClick={() => copyBridgeCommand(preparedBridge.provider, preparedBridge.command)} className="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-0.5 text-[11px] font-semibold text-navy hover:border-rust hover:text-rust">
                  <Clipboard className="h-3.5 w-3.5" />
                  {copiedBridge === preparedBridge.provider ? "Copiado" : "Copiar"}
                </button>
              </div>
              <pre className="max-h-[120px] overflow-auto whitespace-pre-wrap break-all rounded bg-muted/30 p-2 text-[11px] leading-relaxed text-foreground">{preparedBridge.command}</pre>
              <p className="mt-2 text-[10.5px] text-muted-foreground">
                URL interna usada por Sancho: <span className="font-mono">{preparedBridge.gatewayUrl}</span>
              </p>
            </div>
          </div>
        )}

        {externalRuntimeAvailable && (
          <details className="mt-4 rounded-lg border border-border bg-card">
            <summary className="cursor-pointer list-none px-3 py-2 text-[12px] font-semibold text-navy">Avanzado: conexión local y gateway custom</summary>
            <div className="space-y-4 border-t border-border px-3 py-3">
              <div>
                <h4 className="font-heading text-[13px] text-navy">Conexión local del bridge</h4>
                <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">Solo cambia esto si el bridge corre en otra máquina. Si corre junto a Sancho, déjalo vacío.</p>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  {cliRuntimeCards.map((card) => (
                    <label key={card.id} className="block text-[10.5px] font-semibold uppercase text-muted-foreground">
                      {card.title}
                      <input
                        value={bridgeDrafts[card.id]}
                        onChange={(event) =>
                          setBridgeDrafts((prev) => ({
                            ...prev,
                            [card.id]: event.target.value,
                          }))
                        }
                        placeholder={card.defaultGatewayUrl}
                        className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-2 text-[12px] font-normal normal-case text-foreground outline-none focus:border-rust"
                      />
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="font-heading text-[13px] text-navy">Adapter técnico</h4>
                <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">Solo para mantenimiento o gateways legacy. No hace falta tocarlo para Hermes CLI, Claude Code o Codex.</p>
                <div className="mt-2 overflow-hidden rounded-md border border-border">
                  {runtimeLoading && !runtimeStatus ? (
                    <div className="px-3 py-3 text-sm text-muted-foreground">Cargando adapters...</div>
                  ) : (
                    (runtimeStatus?.options ?? []).map((option) => {
                      const active = option.id === runtimeStatus?.active;
                      const available = option.configured && option.health.ok;
                      const disabled = !!runtimePending || (!active && !available);
                      const healthDetail = runtimeHealthDetail(option);
                      const displayName = option.id === "hermes" ? "Hermes gestionado (legacy)" : option.displayName || option.label;

                      return (
                        <button key={option.id} type="button" onClick={() => selectRuntime(option)} disabled={disabled || active} className={cn("flex w-full items-center justify-between gap-3 border-b border-border px-3 py-2 text-left text-[12px] last:border-b-0", active ? "bg-sage/10 text-foreground" : disabled ? "bg-muted/30 text-muted-foreground" : "bg-background hover:bg-rust/5")}>
                          <span>
                            <span className="font-semibold text-navy">{displayName}</span>
                            <span className="ml-2 text-muted-foreground">{runtimeCapabilitySummary(option)}</span>
                            {healthDetail && (
                              <span className="ml-2 text-muted-foreground" title={healthDetail}>
                                {healthDetail}
                              </span>
                            )}
                          </span>
                          <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", active ? "bg-sage/16 text-sage" : available ? "bg-navy/10 text-navy" : "bg-muted text-muted-foreground")}>{active ? "activo" : !option.configured ? "sin config" : option.health.ok ? "usar" : "offline"}</span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              <div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h4 className="font-heading text-[13px] text-navy">Gateway HTTP custom</h4>
                    <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">Para un runtime propio. Hermes CLI, Claude Code y Codex usan las opciones de arriba.</p>
                  </div>
                  <button type="button" onClick={saveExternalRuntime} disabled={externalSaving} className="w-fit rounded border border-ink px-3 py-1.5 text-[12px] font-semibold text-navy transition-colors hover:bg-rust hover:text-white disabled:opacity-50">
                    {externalSaving ? "guardando…" : "Guardar y probar"}
                  </button>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <label className="block text-[11px] font-semibold uppercase text-muted-foreground">
                    Protocolo
                    <select
                      value={externalDraft.protocol}
                      onChange={(event) =>
                        setExternalDraft((prev) => ({
                          ...prev,
                          protocol: event.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-2 text-[12px] font-normal normal-case text-foreground outline-none focus:border-rust"
                    >
                      <option value="">Default Sancho</option>
                      <option value="sancho">Sancho HTTP async</option>
                      <option value="mc-bridge">MC bridge / Hermes sync</option>
                    </select>
                  </label>
                  <label className="block text-[11px] font-semibold uppercase text-muted-foreground">
                    Gateway URL
                    <input
                      value={externalDraft.gatewayUrl}
                      onChange={(event) =>
                        setExternalDraft((prev) => ({
                          ...prev,
                          gatewayUrl: event.target.value,
                        }))
                      }
                      placeholder={hasExternalRuntimeEnv(externalRuntimeEnv, "SANCHO_EXTERNAL_GATEWAY_URL") || hasExternalRuntimeEnv(externalRuntimeEnv, "HERMES_EXTERNAL_GATEWAY_URL") ? "Ya configurado" : "https://runtime.example.com"}
                      className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-2 text-[12px] font-normal normal-case text-foreground outline-none focus:border-rust"
                    />
                  </label>
                  <label className="block text-[11px] font-semibold uppercase text-muted-foreground">
                    Secret
                    <input
                      type="password"
                      value={externalDraft.secret}
                      onChange={(event) =>
                        setExternalDraft((prev) => ({
                          ...prev,
                          secret: event.target.value,
                        }))
                      }
                      placeholder={hasExternalRuntimeEnv(externalRuntimeEnv, "SANCHO_EXTERNAL_SECRET") || hasExternalRuntimeEnv(externalRuntimeEnv, "HERMES_EXTERNAL_SECRET") ? "Ya configurado" : "secret compartido"}
                      className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-2 text-[12px] font-normal normal-case text-foreground outline-none focus:border-rust"
                    />
                  </label>
                  <label className="block text-[11px] font-semibold uppercase text-muted-foreground">
                    {externalDraft.protocol === "mc-bridge" ? "Chat path" : "Inbound path"}
                    <input
                      value={externalDraft.inboundPath}
                      onChange={(event) =>
                        setExternalDraft((prev) => ({
                          ...prev,
                          inboundPath: event.target.value,
                        }))
                      }
                      placeholder={externalDraft.protocol === "mc-bridge" ? "/chat" : "/sancho/inbound"}
                      className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-2 text-[12px] font-normal normal-case text-foreground outline-none focus:border-rust"
                    />
                  </label>
                  <label className="block text-[11px] font-semibold uppercase text-muted-foreground">
                    Health path
                    <input
                      value={externalDraft.healthPath}
                      onChange={(event) =>
                        setExternalDraft((prev) => ({
                          ...prev,
                          healthPath: event.target.value,
                        }))
                      }
                      placeholder={externalDraft.protocol === "mc-bridge" ? "/health" : "/healthz"}
                      className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-2 text-[12px] font-normal normal-case text-foreground outline-none focus:border-rust"
                    />
                  </label>
                  {externalDraft.protocol === "mc-bridge" && (
                    <label className="block text-[11px] font-semibold uppercase text-muted-foreground">
                      Agent/profile
                      <input
                        value={externalDraft.agent}
                        onChange={(event) =>
                          setExternalDraft((prev) => ({
                            ...prev,
                            agent: event.target.value,
                          }))
                        }
                        placeholder="sancho-coordinator"
                        className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-2 text-[12px] font-normal normal-case text-foreground outline-none focus:border-rust"
                      />
                    </label>
                  )}
                </div>
                {externalRuntimeMasked(externalRuntimeEnv, "SANCHO_EXTERNAL_GATEWAY_URL", "HERMES_EXTERNAL_GATEWAY_URL") && (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Config actual: {externalRuntimeMasked(externalRuntimeEnv, "SANCHO_EXTERNAL_GATEWAY_URL", "HERMES_EXTERNAL_GATEWAY_URL")}
                    {hasExternalRuntimeEnv(externalRuntimeEnv, "SANCHO_EXTERNAL_SECRET") || hasExternalRuntimeEnv(externalRuntimeEnv, "HERMES_EXTERNAL_SECRET") ? " · secret guardado" : ""}
                    {hasExternalRuntimeEnv(externalRuntimeEnv, "SANCHO_EXTERNAL_PROTOCOL") || hasExternalRuntimeEnv(externalRuntimeEnv, "HERMES_EXTERNAL_PROTOCOL") ? " · protocolo guardado" : ""}
                  </p>
                )}
              </div>
            </div>
          </details>
        )}
      </div>

      {notice && <div className={cn("rounded-lg border px-3 py-2 text-xs", notice.ok ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700")}>{notice.message}</div>}

      {/* The engine's auth route is global; the per-agent model lives in Models. */}
      <div className="rounded-lg border-2 border-ink bg-sage/5 px-4 py-3 text-[12.5px] leading-relaxed text-foreground/80">
        <strong className="font-heading text-navy">Credenciales de proveedores.</strong> Después de elegir motor, usa la tabla de abajo para decidir si cada proveedor se conecta con suscripción o API key. El modelo concreto de cada agente se elige en{" "}
        <button type="button" onClick={() => router.replace({ query: { ...router.query, tab: "agents" } }, undefined, { shallow: true })} className="font-semibold text-rust hover:underline">
          Agentes
        </button>
        .
      </div>

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
                  <tr key={rp.key} className={cn("border-b border-border align-middle last:border-b-0", isActive && "bg-sage/[0.06]")}>
                    {/* Provider + route */}
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{rp.icon}</span>
                        <div>
                          <div className="font-mono font-semibold">{rp.name}</div>
                          <div className="text-[11px] text-muted-foreground">{rp.route ? (rp.route === "subscription" ? "suscripción" : "API key") : rp.key}</div>
                        </div>
                      </div>
                    </td>
                    {/* Route badge */}
                    <td className="px-3 py-2.5">
                      <span className={cn("rounded px-2 py-0.5 text-[10px] font-bold uppercase", routeClass(routeForRow, present))}>{present ? routeLabel(routeForRow) : "sin auth"}</span>
                      {healthError && (
                        <div className="mt-1 max-w-[200px] truncate text-[10px] font-bold text-red-600" title={healthError}>
                          ⚠ credencial rechazada
                        </div>
                      )}
                    </td>
                    {/* Account / profile */}
                    <td className="px-3 py-2.5">
                      <span className="block max-w-[230px] truncate font-mono text-[12px] text-muted-foreground" title={label || undefined}>
                        {label ? maskAuthLabel(label) : "—"}
                      </span>
                    </td>
                    {/* Status */}
                    <td className="px-3 py-2.5 text-center">{isActive ? <span className="rounded-full bg-sage/16 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-sage">activa</span> : present ? <span className="text-[10px] font-semibold text-muted-foreground">disponible</span> : <span className="text-[10px] text-muted-foreground">sin auth</span>}</td>
                    {/* Console */}
                    <td className="px-3 py-2.5 text-right">
                      {consoleUrl ? (
                        <a href={consoleUrl} target="_blank" rel="noopener noreferrer" title={consoleHost || undefined} className="text-[11px] font-semibold text-rust underline-offset-2 hover:underline whitespace-nowrap">
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
                          <button type="button" disabled={isPending || (subRow && !present)} title={subRow && !present ? "Pega el token de suscripción primero" : undefined} onClick={() => activate(rp)} className="rounded border border-ink px-2 py-0.5 text-[11px] font-semibold text-navy hover:bg-rust hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                            {rowPending ? "activando…" : "Activar"}
                          </button>
                        )}
                        {/* Manage credential */}
                        {canPasteToken ? (
                          <button type="button" onClick={() => onOpenSystemKey(rp.apiId, rp.name, "subscription")} className="text-[11px] px-2.5 py-1 bg-background border border-border rounded-md cursor-pointer hover:border-rust hover:bg-rust hover:text-white transition-all whitespace-nowrap">
                            🎫 Pegar token
                          </button>
                        ) : !subRow ? (
                          <button type="button" onClick={() => onOpenSystemKey(rp.apiId, rp.name, rp.route)} className="text-[11px] px-2.5 py-1 bg-background border border-border rounded-md cursor-pointer hover:border-rust hover:bg-rust hover:text-white transition-all whitespace-nowrap">
                            🔑 Key sistema
                          </button>
                        ) : (
                          /* Codex subscription: SSH-only login, no in-app paste — show the how-to. */
                          <button type="button" onClick={() => setCodexGuide(true)} className="text-[11px] px-2.5 py-1 bg-background border border-border rounded-md cursor-pointer hover:border-rust hover:bg-rust hover:text-white transition-all whitespace-nowrap">
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
        <strong>Qué ves:</strong> la <strong>ruta</strong> con la que el motor se autentica en cada proveedor y la cuenta/perfil enmascarado. <strong>Activar</strong> conmuta la ruta y reinicia el gateway para aplicarla. La suscripción de Anthropic se carga con <strong>🎫 Pegar token → Guardar y activar</strong>; la de Codex se conecta por SSH (pulsa <strong>📋 Instrucciones</strong>). <strong>No hay cuota/uso en vivo</strong> (OpenClaw no lo expone): la consola es para revisar límites y facturación.
      </p>

      {codexGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setCodexGuide(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <div className="relative w-full max-w-[480px] rounded-lg border-2 border-ink bg-card shadow-comic" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-ink px-4 py-3">
              <h3 className="font-heading text-base text-navy">⚙️ Conectar Codex (suscripción ChatGPT)</h3>
              <button type="button" onClick={() => setCodexGuide(false)} className="px-1 text-lg leading-none text-muted-foreground hover:text-foreground">
                ✕
              </button>
            </div>
            <div className="space-y-3 p-4">
              <AuthInstructions
                intro="El login de Codex (suscripción ChatGPT) es interactivo y se hace por SSH en el VPS del motor — no se puede pegar aquí. El cambio de ruta en runtime llegará en una iteración futura (SAN-301)."
                steps={[
                  {
                    text: "Conéctate por SSH al VPS del motor (o pídeselo a quien tenga acceso al VPS).",
                  },
                  {
                    text: "Córrelo una vez; el store compartido lo propaga a todos los agentes Codex (automator, etc.):",
                    command: "openclaw models auth login --agent cervantes",
                  },
                  {
                    text: "Autoriza con tu cuenta ChatGPT en el navegador que abre el comando.",
                  },
                  { text: "Vuelve aquí y pulsa Re-verificar." },
                ]}
                footnote="Por qué no hay botón aquí: el login OAuth vive en el CLI del motor y el sync por-agente no tiene inverso idempotente (SAN-301)."
              />
              <div className="flex items-center justify-end gap-2">
                <button type="button" onClick={recheckCodex} disabled={rechecking} className="rounded border border-ink px-3 py-1.5 text-[12px] font-semibold text-navy transition-colors hover:bg-rust hover:text-white disabled:opacity-50">
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
