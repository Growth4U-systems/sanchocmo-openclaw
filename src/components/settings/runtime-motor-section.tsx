"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useModelCatalog, useSetAuthRoute, type CatalogProvider } from "@/hooks/useModels";
import { RUNTIME_PROVIDERS, consoleUrlFor, consoleLabelFor, type RuntimeProvider } from "@/lib/provider-console";
import { routeLabel, routeClass, effectiveRoute, maskAuthLabel } from "@/lib/provider-auth-display";
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

type CliRuntimeProviderId = "hermes" | "claude-code" | "codex";
type LocalRuntimeProviderId = Extract<CliRuntimeProviderId, "claude-code" | "codex">;

interface RuntimeBridgeProvider {
  id: CliRuntimeProviderId;
  label: string;
  runtimeLocation: "server" | "user-device";
  serverStartSupported: boolean;
  serverAvailable: boolean | null;
  serverIssue?: string | null;
  defaultPort: number;
  defaultGatewayUrl: string;
}

interface RuntimeBridgeStatus {
  active: string;
  configuredKind?: CliRuntimeProviderId | null;
  providers: RuntimeBridgeProvider[];
}

interface LocalConnectorRuntimeStatus {
  ok: boolean;
  command?: string;
  version?: string;
  path?: string;
  error?: string;
}

interface LocalConnectorSession {
  id: string;
  provider: LocalRuntimeProviderId;
  pairingCode: string;
  status: "pending" | "connected" | "expired" | "revoked";
  createdAt: string;
  expiresAt: string;
  connectedAt?: string;
  lastSeenAt?: string;
  activatedAt?: string;
  deviceName?: string;
  runtime?: LocalConnectorRuntimeStatus;
  online: boolean;
}

interface LocalConnectorStatus {
  ok: boolean;
  session?: LocalConnectorSession | null;
  sessions: LocalConnectorSession[];
}

interface LocalPairingStart {
  ok?: boolean;
  error?: string;
  command?: string;
  session?: LocalConnectorSession;
  label?: string;
}

interface CodexAuthJob {
  id: string;
  status: "running" | "succeeded" | "failed" | "cancelled";
  startedAt: string;
  updatedAt: string;
  output: string;
  exitCode: number | null;
  error: string | null;
  url: string | null;
  code: string | null;
  expiresText: string | null;
  restart?: {
    ok: boolean;
    method?: string;
    error?: string;
  };
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

function runtimeSourceLabel(source: RuntimeStatus["source"] | undefined): string {
  if (source === "ui") return "UI";
  if (source === "env") return "SANCHO_RUNTIME";
  return "default";
}

function runtimeFriendlyLabel(
  runtime: string | undefined,
  bridgeKind: CliRuntimeProviderId | null | undefined,
  fallback?: RuntimeAdapterOption,
): string {
  if (runtime === "openclaw") return "OpenClaw";
  if (runtime === "hermes") return "Hermes";
  if (runtime === "external-http") {
    if (bridgeKind === "hermes") return "Hermes";
    if (bridgeKind === "claude-code") return "Claude Code";
    if (bridgeKind === "codex") return "Codex";
    return "Runtime propio / API";
  }
  return fallback?.displayName || fallback?.label || "Sin verificar";
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

function runtimeReady(option: RuntimeAdapterOption | undefined): boolean {
  return !!option?.configured && !!option.health.ok;
}

type RuntimeChoiceTone = "active" | "ready" | "blocked" | "pending";

interface RuntimeChoiceCardProps {
  title: string;
  subtitle: string;
  description: string;
  status: string;
  tone: RuntimeChoiceTone;
  detail?: string;
  actionLabel: string;
  actionDisabled?: boolean;
  actionBusy?: boolean;
  onAction: () => void;
}

function RuntimeChoiceCard({
  title,
  subtitle,
  description,
  status,
  tone,
  detail,
  actionLabel,
  actionDisabled,
  actionBusy,
  onAction,
}: RuntimeChoiceCardProps) {
  return (
    <div
      className={cn(
        "flex min-h-[188px] flex-col rounded-lg border px-3 py-3",
        tone === "active"
          ? "border-sage bg-sage/10"
          : tone === "ready"
            ? "border-border bg-card"
            : "border-border bg-muted/25",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="font-heading text-sm text-navy">{title}</h4>
          <p className="mt-0.5 text-[11.5px] font-semibold text-muted-foreground">{subtitle}</p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
            tone === "active"
              ? "bg-sage/16 text-sage"
              : tone === "ready"
                ? "bg-navy/10 text-navy"
                : tone === "pending"
                  ? "bg-amber-50 text-amber-700"
                  : "bg-muted text-muted-foreground",
          )}
        >
          {status}
        </span>
      </div>
      <p className="mt-3 flex-1 text-[12.5px] leading-relaxed text-foreground/80">{description}</p>
      {detail && <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">{detail}</p>}
      <button
        type="button"
        onClick={onAction}
        disabled={actionDisabled || actionBusy}
        className={cn(
          "mt-3 w-fit rounded border border-ink px-3 py-1.5 text-[12px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
          tone === "active"
            ? "bg-sage/10 text-sage"
            : "text-navy hover:bg-rust hover:text-white",
        )}
      >
        {actionBusy ? "conectando..." : actionLabel}
      </button>
    </div>
  );
}

function codexAuthStatusLabel(status: CodexAuthJob["status"] | undefined): string {
  if (status === "succeeded") return "conectado";
  if (status === "failed") return "falló";
  if (status === "cancelled") return "cancelado";
  return "esperando autorización";
}

function codexAuthStatusClass(status: CodexAuthJob["status"] | undefined): string {
  if (status === "succeeded") return "border-green-200 bg-green-50 text-green-700";
  if (status === "failed") return "border-red-200 bg-red-50 text-red-700";
  if (status === "cancelled") return "border-border bg-muted text-muted-foreground";
  return "border-amber-200 bg-amber-50 text-amber-700";
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

function localRuntimeLabel(provider: LocalRuntimeProviderId): string {
  return provider === "claude-code" ? "Claude Code" : "Codex";
}

function latestLocalConnectorSession(
  status: LocalConnectorStatus | undefined,
  provider: LocalRuntimeProviderId,
): LocalConnectorSession | null {
  const sessions = status?.sessions?.filter((session) => session.provider === provider) ?? [];
  return sessions.find((session) => session.online) || sessions.find((session) => session.status === "connected") || sessions[0] || null;
}

function localConnectorDetail(session: LocalConnectorSession | null, fallback: string): string {
  if (!session) return fallback;
  if (session.runtime?.ok === false) {
    return `${session.runtime.command || "El CLI local"} no está disponible${session.runtime.error ? `: ${session.runtime.error}` : ""}.`;
  }
  if (session.online) {
    return `Conectado en ${session.deviceName || "este ordenador"}${session.runtime?.version ? ` · ${session.runtime.version}` : ""}.`;
  }
  if (session.status === "connected") return "El conector estuvo conectado, pero ahora no está respondiendo.";
  if (session.status === "pending") return `Esperando conexión local · código ${session.pairingCode}.`;
  if (session.status === "expired") return "La conexión caducó. Crea una nueva para este ordenador.";
  return fallback;
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
  const [codexAuthJobId, setCodexAuthJobId] = useState<string | null>(null);
  const [codexAuthStarting, setCodexAuthStarting] = useState(false);
  const [codexAuthSubmitting, setCodexAuthSubmitting] = useState(false);
  const [codexAuthCancelling, setCodexAuthCancelling] = useState(false);
  const [codexAuthInput, setCodexAuthInput] = useState("");
  const [runtimePending, setRuntimePending] = useState<string | null>(null);
  const [runtimeRefreshing, setRuntimeRefreshing] = useState(false);
  const [bridgePending, setBridgePending] = useState<CliRuntimeProviderId | null>(null);
  const [localRuntimeGuide, setLocalRuntimeGuide] = useState<LocalRuntimeProviderId | null>(null);
  const [localPairingSessionId, setLocalPairingSessionId] = useState<string | null>(null);
  const [localPairingCommand, setLocalPairingCommand] = useState<string | null>(null);
  const [localPairingStarting, setLocalPairingStarting] = useState<LocalRuntimeProviderId | null>(null);
  const [localRuntimeActivating, setLocalRuntimeActivating] = useState<LocalRuntimeProviderId | null>(null);
  const [localCommandCopied, setLocalCommandCopied] = useState(false);
  const [runtimeAdvancedOpen, setRuntimeAdvancedOpen] = useState(false);
  const [externalSaving, setExternalSaving] = useState(false);
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
    queryKey: ["system-runtime-bridge"],
    queryFn: async () => {
      const res = await fetch("/api/system/runtime-bridge");
      const payload = (await res.json().catch(() => ({}))) as RuntimeBridgeStatus & { error?: string };
      if (!res.ok) throw new Error(payload.error || "No se pudo leer el conector de runtime");
      return payload;
    },
    staleTime: 10_000,
  });

  const { data: localConnectorStatus } = useQuery<LocalConnectorStatus>({
    queryKey: ["system-runtime-local-connector", localRuntimeGuide, localPairingSessionId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (localRuntimeGuide) params.set("provider", localRuntimeGuide);
      if (localPairingSessionId) params.set("session", localPairingSessionId);
      const qs = params.toString();
      const res = await fetch(`/api/system/runtime-local-connector${qs ? `?${qs}` : ""}`);
      const payload = (await res.json().catch(() => ({}))) as LocalConnectorStatus & { error?: string };
      if (!res.ok) throw new Error(payload.error || "No se pudo leer el conector local");
      return payload;
    },
    refetchInterval: localRuntimeGuide ? 2_000 : 8_000,
    staleTime: 2_000,
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

  const { data: codexAuthJob, isFetching: codexAuthPolling } = useQuery<CodexAuthJob | null>({
    queryKey: ["codex-auth", codexAuthJobId],
    enabled: codexGuide && !!codexAuthJobId,
    queryFn: async () => {
      const res = await fetch(`/api/admin/codex-auth?id=${encodeURIComponent(codexAuthJobId || "")}`);
      const payload = (await res.json().catch(() => ({}))) as { job?: CodexAuthJob | null; error?: string };
      if (!res.ok) throw new Error(payload.error || "No se pudo leer el login de Codex");
      return payload.job ?? null;
    },
    refetchInterval: codexGuide ? 2_000 : false,
  });

  useEffect(() => {
    if (codexAuthJob?.status !== "succeeded") return;
    void Promise.all([
      qc.invalidateQueries({ queryKey: ["api-health"] }),
      qc.invalidateQueries({ queryKey: ["runtime-system-env"] }),
      qc.invalidateQueries({ queryKey: ["models-catalog"] }),
    ]);
  }, [codexAuthJob?.status, qc]);

  useEffect(() => {
    if (!localCommandCopied) return;
    const timer = window.setTimeout(() => setLocalCommandCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [localCommandCopied]);

  useEffect(() => {
    if (!localConnectorStatus?.sessions.some((session) => session.online)) return;
    void Promise.all([
      qc.invalidateQueries({ queryKey: ["system-runtime"] }),
      qc.invalidateQueries({ queryKey: ["system-runtime-bridge"] }),
    ]);
  }, [localConnectorStatus?.sessions, qc]);

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

  const runtimeOptionsById = useMemo(() => {
    return new Map((runtimeStatus?.options ?? []).map((option) => [option.id, option] as const));
  }, [runtimeStatus]);
  const openClawRuntime = runtimeOptionsById.get("openclaw");
  const hermesRuntime = runtimeOptionsById.get("hermes");
  const externalHttpRuntime = runtimeOptionsById.get("external-http");
  const activeRuntimeOption = runtimeOptionsById.get(runtimeStatus?.active || "");
  const configuredBridgeKind = runtimeBridgeStatus?.configuredKind ?? null;
  const hermesBridgeProvider = runtimeBridgeStatus?.providers.find((provider) => provider.id === "hermes");
  const hermesServerAvailable = hermesBridgeProvider?.serverAvailable === true;
  const activeRuntimeLabel = runtimeFriendlyLabel(runtimeStatus?.active, configuredBridgeKind, activeRuntimeOption);
  const externalSavedUrl = externalRuntimeMasked(
    externalRuntimeEnv,
    "SANCHO_EXTERNAL_GATEWAY_URL",
    "HERMES_EXTERNAL_GATEWAY_URL",
  );
  const externalReady = runtimeReady(externalHttpRuntime);
  const openClawActive = runtimeStatus?.active === "openclaw";
  const hermesActive =
    runtimeStatus?.active === "hermes" || (runtimeStatus?.active === "external-http" && configuredBridgeKind === "hermes");
  const claudeCodeActive = runtimeStatus?.active === "external-http" && configuredBridgeKind === "claude-code";
  const codexRuntimeActive = runtimeStatus?.active === "external-http" && configuredBridgeKind === "codex";
  const customRuntimeActive =
    runtimeStatus?.active === "external-http" && configuredBridgeKind !== "hermes" && configuredBridgeKind !== "claude-code" && configuredBridgeKind !== "codex";
  const claudeCodeLocalSession = latestLocalConnectorSession(localConnectorStatus, "claude-code");
  const codexLocalSession = latestLocalConnectorSession(localConnectorStatus, "codex");
  const selectedLocalSession =
    localConnectorStatus?.session ||
    (localRuntimeGuide ? latestLocalConnectorSession(localConnectorStatus, localRuntimeGuide) : null);
  const selectedLocalRuntimeLabel = localRuntimeGuide ? localRuntimeLabel(localRuntimeGuide) : "";

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
      const payload = (await res.json().catch(() => ({}))) as RuntimeStatus & { error?: string; warning?: string | null };
      if (!res.ok) throw new Error(payload.error || "No se pudo cambiar el runtime");

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["system-runtime"] }),
        qc.invalidateQueries({ queryKey: ["system-runtime-bridge"] }),
        qc.invalidateQueries({ queryKey: ["api-health"] }),
        qc.invalidateQueries({ queryKey: ["models-catalog"] }),
      ]);
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

  const connectManagedBridge = async (provider: CliRuntimeProviderId) => {
    setBridgePending(provider);
    setNotice(null);
    try {
      const res = await fetch("/api/system/runtime-bridge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", provider, activate: true }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        label?: string;
        gatewayUrl?: string;
      };
      if (!res.ok || payload.ok === false) throw new Error(payload.error || "No se pudo conectar el runtime");

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["system-runtime"] }),
        qc.invalidateQueries({ queryKey: ["system-runtime-bridge"] }),
        qc.invalidateQueries({ queryKey: ["runtime-external-env"] }),
        qc.invalidateQueries({ queryKey: ["api-health"] }),
        qc.invalidateQueries({ queryKey: ["models-catalog"] }),
      ]);
      setNotice({
        ok: true,
        message: `${payload.label || "Runtime"} conectado y activado para mensajes nuevos.`,
      });
    } catch (err) {
      setNotice({
        ok: false,
        message: err instanceof Error ? err.message : "No se pudo conectar el runtime",
      });
    } finally {
      setBridgePending(null);
    }
  };

  const startLocalRuntimePairing = async (provider: LocalRuntimeProviderId) => {
    setLocalRuntimeGuide(provider);
    setLocalPairingStarting(provider);
    setLocalPairingCommand(null);
    setLocalPairingSessionId(null);
    setLocalCommandCopied(false);
    setNotice(null);
    try {
      const res = await fetch("/api/system/runtime-local-connector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", provider }),
      });
      const payload = (await res.json().catch(() => ({}))) as LocalPairingStart;
      if (!res.ok || !payload.session || !payload.command) {
        throw new Error(payload.error || "No se pudo crear la conexión local");
      }
      setLocalPairingSessionId(payload.session.id);
      setLocalPairingCommand(payload.command);
      await qc.invalidateQueries({ queryKey: ["system-runtime-local-connector"] });
    } catch (err) {
      setNotice({
        ok: false,
        message: err instanceof Error ? err.message : "No se pudo crear la conexión local",
      });
    } finally {
      setLocalPairingStarting(null);
    }
  };

  const activateLocalRuntime = async (session: LocalConnectorSession) => {
    setLocalRuntimeActivating(session.provider);
    setNotice(null);
    try {
      const res = await fetch("/api/system/runtime-local-connector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "activate", sessionId: session.id }),
      });
      const payload = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || payload.ok === false) throw new Error(payload.error || "No se pudo activar el runtime local");

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["system-runtime"] }),
        qc.invalidateQueries({ queryKey: ["system-runtime-bridge"] }),
        qc.invalidateQueries({ queryKey: ["system-runtime-local-connector"] }),
        qc.invalidateQueries({ queryKey: ["runtime-external-env"] }),
        qc.invalidateQueries({ queryKey: ["api-health"] }),
        qc.invalidateQueries({ queryKey: ["models-catalog"] }),
      ]);
      setNotice({
        ok: true,
        message: `${localRuntimeLabel(session.provider)} activado para los mensajes nuevos.`,
      });
      setLocalRuntimeGuide(null);
    } catch (err) {
      setNotice({
        ok: false,
        message: err instanceof Error ? err.message : "No se pudo activar el runtime local",
      });
    } finally {
      setLocalRuntimeActivating(null);
    }
  };

  const copyLocalPairingCommand = async () => {
    if (!localPairingCommand) return;
    try {
      await navigator.clipboard.writeText(localPairingCommand);
      setLocalCommandCopied(true);
    } catch {
      setNotice({ ok: false, message: "No se pudo copiar el comando automáticamente." });
    }
  };

  const refreshRuntimeStatus = async () => {
    setRuntimeRefreshing(true);
    try {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["system-runtime"] }),
        qc.invalidateQueries({ queryKey: ["system-runtime-bridge"] }),
        qc.invalidateQueries({ queryKey: ["system-runtime-local-connector"] }),
      ]);
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
      setNotice({ ok: false, message: "No hay cambios para guardar en el runtime externo." });
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
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(payload.error || "No se pudo guardar el runtime externo");

      setExternalDraft({ protocol: "", gatewayUrl: "", secret: "", inboundPath: "", healthPath: "", agent: "" });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["runtime-external-env"] }),
        qc.invalidateQueries({ queryKey: ["system-runtime"] }),
        qc.invalidateQueries({ queryKey: ["system-runtime-bridge"] }),
      ]);
      setNotice({ ok: true, message: "Runtime externo guardado. La verificación ya se actualizó." });
    } catch (err) {
      setNotice({
        ok: false,
        message: err instanceof Error ? err.message : "No se pudo guardar el runtime externo",
      });
    } finally {
      setExternalSaving(false);
    }
  };

  const startCodexAuth = async () => {
    setCodexAuthStarting(true);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/codex-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });
      const payload = (await res.json().catch(() => ({}))) as { job?: CodexAuthJob; error?: string };
      if (!res.ok || !payload.job) throw new Error(payload.error || "No se pudo iniciar el login de Codex");
      setCodexAuthJobId(payload.job.id);
      setCodexAuthInput("");
    } catch (err) {
      setNotice({ ok: false, message: err instanceof Error ? err.message : "No se pudo iniciar Codex" });
    } finally {
      setCodexAuthStarting(false);
    }
  };

  const submitCodexAuthInput = async () => {
    if (!codexAuthJob?.id || !codexAuthInput.trim()) return;
    setCodexAuthSubmitting(true);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/codex-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "submit", id: codexAuthJob.id, input: codexAuthInput }),
      });
      const payload = (await res.json().catch(() => ({}))) as { job?: CodexAuthJob; error?: string };
      if (!res.ok || !payload.job) throw new Error(payload.error || "No se pudo enviar el redirect");
      setCodexAuthJobId(payload.job.id);
      setCodexAuthInput("");
      await qc.invalidateQueries({ queryKey: ["codex-auth", payload.job.id] });
    } catch (err) {
      setNotice({ ok: false, message: err instanceof Error ? err.message : "No se pudo enviar el redirect" });
    } finally {
      setCodexAuthSubmitting(false);
    }
  };

  const cancelCodexAuth = async () => {
    if (!codexAuthJob?.id) return;
    setCodexAuthCancelling(true);
    try {
      await fetch("/api/admin/codex-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", id: codexAuthJob.id }),
      });
      await qc.invalidateQueries({ queryKey: ["codex-auth", codexAuthJob.id] });
    } finally {
      setCodexAuthCancelling(false);
    }
  };

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
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border-2 border-ink bg-background p-4 shadow-comic-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-2xl">
            <h3 className="font-heading text-sm text-navy">Runtime</h3>
            <p className="mt-1 text-[12.5px] leading-relaxed text-foreground/75">
              Elige quién ejecuta los mensajes nuevos de Sancho. Las skills, documentos y contexto siguen viviendo en Sancho.
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <div className="rounded-md border border-border bg-card px-3 py-2 text-[12px] text-muted-foreground">
              Activo ahora: <strong className="font-heading text-navy">{activeRuntimeLabel}</strong>
              {runtimeStatus && (
                <span className="block text-[10.5px]">
                  origen: {runtimeSourceLabel(runtimeStatus.source)}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={refreshRuntimeStatus}
              disabled={runtimeRefreshing}
              className="w-fit rounded border border-ink px-3 py-1.5 text-[12px] font-semibold text-navy transition-colors hover:bg-rust hover:text-white disabled:opacity-50"
            >
              {runtimeRefreshing ? "revisando..." : "Revisar estado"}
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {runtimeLoading && !runtimeStatus ? (
            <div className="rounded-md border border-border px-3 py-3 text-sm text-muted-foreground">cargando runtime...</div>
          ) : (
            <>
              <RuntimeChoiceCard
                title="OpenClaw"
                subtitle="Incluido en Sancho"
                description="La opción estable. Usa el runtime que ya viene con Sancho y no requiere configuración extra."
                status={openClawActive ? "activo" : "listo"}
                tone={openClawActive ? "active" : "ready"}
                detail="Recomendado como fallback cuando estás probando otros runtimes."
                actionLabel={openClawActive ? "Activo" : "Usar OpenClaw"}
                actionDisabled={openClawActive || !openClawRuntime || !!runtimePending}
                actionBusy={runtimePending === "openclaw"}
                onAction={() => openClawRuntime && selectRuntime(openClawRuntime)}
              />

              <RuntimeChoiceCard
                title="Hermes"
                subtitle="Runtime gestionado"
                description="Sancho intenta conectarlo desde el servidor. Es el camino más simple cuando Hermes está disponible en el despliegue."
                status={hermesActive ? "activo" : !hermesServerAvailable ? "no disponible" : runtimeReady(hermesRuntime) ? "listo" : "conectar"}
                tone={hermesActive ? "active" : !hermesServerAvailable ? "blocked" : "ready"}
                detail={
                  !hermesServerAvailable
                    ? hermesBridgeProvider?.serverIssue || "Hermes no está incluido en este despliegue."
                    : runtimeReady(hermesRuntime)
                    ? "Ya responde health OK."
                    : "Sancho prepara Hermes en el servidor y lo activa."
                }
                actionLabel={hermesActive ? "Activo" : !hermesServerAvailable ? "No disponible" : runtimeReady(hermesRuntime) ? "Usar Hermes" : "Conectar Hermes"}
                actionDisabled={hermesActive || !hermesServerAvailable || !!runtimePending || !!bridgePending}
                actionBusy={bridgePending === "hermes" || runtimePending === "hermes"}
                onAction={() => {
                  if (runtimeReady(hermesRuntime) && hermesRuntime) {
                    void selectRuntime(hermesRuntime);
                    return;
                  }
                  void connectManagedBridge("hermes");
                }}
              />

              <RuntimeChoiceCard
                title="Claude Code"
                subtitle="En tu ordenador"
                description="Usa la instalación de Claude Code de la persona que conecta este runtime."
                status={claudeCodeActive ? "activo" : claudeCodeLocalSession?.online ? "conectado" : "conectar"}
                tone={claudeCodeActive ? "active" : claudeCodeLocalSession?.online ? "ready" : "pending"}
                detail={localConnectorDetail(claudeCodeLocalSession, "Sancho genera un comando seguro y espera a este ordenador.")}
                actionLabel={
                  claudeCodeActive
                    ? "Activo"
                    : claudeCodeLocalSession?.online
                      ? "Usar Claude Code"
                      : "Conectar"
                }
                actionDisabled={claudeCodeActive || !!runtimePending || !!localRuntimeActivating}
                actionBusy={localPairingStarting === "claude-code" || localRuntimeActivating === "claude-code"}
                onAction={() => {
                  if (claudeCodeLocalSession?.online) {
                    void activateLocalRuntime(claudeCodeLocalSession);
                    return;
                  }
                  if (configuredBridgeKind === "claude-code" && externalReady && externalHttpRuntime) {
                    void selectRuntime(externalHttpRuntime);
                    return;
                  }
                  void startLocalRuntimePairing("claude-code");
                }}
              />

              <RuntimeChoiceCard
                title="Codex"
                subtitle="En tu ordenador"
                description="Usa el CLI de Codex local como runtime de Sancho para los mensajes nuevos."
                status={codexRuntimeActive ? "activo" : codexLocalSession?.online ? "conectado" : "conectar"}
                tone={codexRuntimeActive ? "active" : codexLocalSession?.online ? "ready" : "pending"}
                detail={localConnectorDetail(codexLocalSession, "La autenticación de Codex se gestiona aparte; esto conecta el runtime local.")}
                actionLabel={codexRuntimeActive ? "Activo" : codexLocalSession?.online ? "Usar Codex" : "Conectar"}
                actionDisabled={codexRuntimeActive || !!runtimePending || !!localRuntimeActivating}
                actionBusy={localPairingStarting === "codex" || localRuntimeActivating === "codex"}
                onAction={() => {
                  if (codexLocalSession?.online) {
                    void activateLocalRuntime(codexLocalSession);
                    return;
                  }
                  if (configuredBridgeKind === "codex" && externalReady && externalHttpRuntime) {
                    void selectRuntime(externalHttpRuntime);
                    return;
                  }
                  void startLocalRuntimePairing("codex");
                }}
              />

              <RuntimeChoiceCard
                title="Runtime propio / API"
                subtitle="Endpoint compatible"
                description="Para equipos que ya tienen un runtime expuesto por HTTP. La URL la da ese runtime o su conector."
                status={customRuntimeActive ? "activo" : externalReady && !configuredBridgeKind ? "listo" : "manual"}
                tone={customRuntimeActive ? "active" : externalReady && !configuredBridgeKind ? "ready" : "blocked"}
                detail={
                  externalSavedUrl
                    ? `Guardado: ${externalSavedUrl}`
                    : "No hace falta para OpenClaw ni para Hermes gestionado."
                }
                actionLabel={customRuntimeActive ? "Activo" : externalReady && !configuredBridgeKind ? "Usar API" : "Configurar API"}
                actionDisabled={customRuntimeActive || !!runtimePending}
                actionBusy={runtimePending === "external-http" && !configuredBridgeKind}
                onAction={() => {
                  if (externalReady && !configuredBridgeKind && externalHttpRuntime) {
                    void selectRuntime(externalHttpRuntime);
                    return;
                  }
                  setRuntimeAdvancedOpen(true);
                }}
              />
            </>
          )}
        </div>

        {localRuntimeGuide && (
          <div className="mt-4 rounded-lg border border-navy/20 bg-navy/[0.03] px-3 py-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="font-heading text-sm text-navy">Conectar {selectedLocalRuntimeLabel}</div>
                <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-foreground/75">
                  Este runtime corre en el ordenador de la persona que lo conecta. Sancho queda esperando una conexión
                  saliente, sin bridge URL ni túnel.
                </p>
              </div>
              <span
                className={cn(
                  "w-fit rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                  selectedLocalSession?.online
                    ? "bg-sage/16 text-sage"
                    : selectedLocalSession?.status === "expired"
                      ? "bg-red-50 text-red-700"
                      : "bg-amber-50 text-amber-700",
                )}
              >
                {selectedLocalSession?.online
                  ? "conectado"
                  : selectedLocalSession?.status === "expired"
                    ? "caducado"
                    : "esperando"}
              </span>
            </div>

            <div className="mt-3 grid gap-2 md:grid-cols-3">
              {["Abrir Terminal", "Pegar comando", "Volver a Sancho"].map((label, index) => (
                <div key={label} className="rounded-md border border-border bg-background px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-navy text-[10px] font-bold text-white">
                      {index + 1}
                    </span>
                    <span className="font-heading text-[12px] text-navy">{label}</span>
                  </div>
                </div>
              ))}
            </div>

            {selectedLocalSession && (
              <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
                {localConnectorDetail(selectedLocalSession, `Esperando ${selectedLocalRuntimeLabel}.`)}
              </p>
            )}

            {localPairingCommand ? (
              <div className="mt-3 rounded-md border border-border bg-foreground/[0.04] p-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <code className="max-h-24 flex-1 overflow-auto break-all text-[11.5px] leading-relaxed text-foreground">
                    {localPairingCommand}
                  </code>
                  <button
                    type="button"
                    onClick={copyLocalPairingCommand}
                    className="w-fit shrink-0 rounded border border-ink px-3 py-1.5 text-[12px] font-semibold text-navy transition-colors hover:bg-rust hover:text-white"
                  >
                    {localCommandCopied ? "Copiado" : "Copiar"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void startLocalRuntimePairing(localRuntimeGuide)}
                disabled={localPairingStarting === localRuntimeGuide}
                className="mt-3 rounded border border-ink px-3 py-1.5 text-[12px] font-semibold text-navy transition-colors hover:bg-rust hover:text-white disabled:opacity-50"
              >
                {localPairingStarting === localRuntimeGuide ? "creando..." : "Crear conexión"}
              </button>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              {selectedLocalSession?.online && (
                <button
                  type="button"
                  onClick={() => void activateLocalRuntime(selectedLocalSession)}
                  disabled={localRuntimeActivating === selectedLocalSession.provider}
                  className="rounded border border-ink bg-sage/10 px-3 py-1.5 text-[12px] font-semibold text-sage transition-colors hover:bg-sage hover:text-white disabled:opacity-50"
                >
                  {localRuntimeActivating === selectedLocalSession.provider ? "activando..." : `Usar ${selectedLocalRuntimeLabel}`}
                </button>
              )}
              {selectedLocalSession?.status === "expired" && (
                <button
                  type="button"
                  onClick={() => void startLocalRuntimePairing(localRuntimeGuide)}
                  disabled={localPairingStarting === localRuntimeGuide}
                  className="rounded border border-ink px-3 py-1.5 text-[12px] font-semibold text-navy transition-colors hover:bg-rust hover:text-white disabled:opacity-50"
                >
                  Nueva conexión
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setRuntimeAdvancedOpen(true);
                  setLocalRuntimeGuide(null);
                }}
                className="rounded border border-border px-3 py-1.5 text-[12px] font-semibold text-muted-foreground transition-colors hover:border-ink hover:text-navy"
              >
                Endpoint manual
              </button>
              <button
                type="button"
                onClick={() => setLocalRuntimeGuide(null)}
                className="rounded border border-border px-3 py-1.5 text-[12px] font-semibold text-muted-foreground transition-colors hover:border-ink hover:text-navy"
              >
                Cerrar
              </button>
            </div>
          </div>
        )}

        {runtimeStatus?.options.some((option) => option.id === "external-http") && (
          <details
            open={runtimeAdvancedOpen}
            onToggle={(event) => setRuntimeAdvancedOpen(event.currentTarget.open)}
            className="mt-4 rounded-lg border border-border bg-card px-3 py-3"
          >
            <summary className="cursor-pointer font-heading text-[13px] text-navy">
              Avanzado: conectar una API propia
            </summary>
            <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">
              Úsalo sólo si ya tienes un endpoint compatible con Sancho. La URL sale del runtime o del conector que
              quieras conectar; Sancho sólo la guarda y prueba que responda.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h4 className="sr-only">Configuración de API propia</h4>
              </div>
              <button
                type="button"
                onClick={saveExternalRuntime}
                disabled={externalSaving}
                className="w-fit rounded border border-ink px-3 py-1.5 text-[12px] font-semibold text-navy transition-colors hover:bg-rust hover:text-white disabled:opacity-50"
              >
                {externalSaving ? "guardando…" : "Guardar y probar"}
              </button>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="block text-[11px] font-semibold uppercase text-muted-foreground">
                Tipo
                <select
                  value={externalDraft.protocol}
                  onChange={(event) => setExternalDraft((prev) => ({ ...prev, protocol: event.target.value }))}
                  className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-2 text-[12px] font-normal normal-case text-foreground outline-none focus:border-rust"
                >
                  <option value="">Default Sancho</option>
                  <option value="sancho">Sancho HTTP async</option>
                  <option value="mc-bridge">MC bridge / Hermes sync</option>
                </select>
              </label>
              <label className="block text-[11px] font-semibold uppercase text-muted-foreground">
                URL del runtime
                <input
                  value={externalDraft.gatewayUrl}
                  onChange={(event) => setExternalDraft((prev) => ({ ...prev, gatewayUrl: event.target.value }))}
                  placeholder={
                    hasExternalRuntimeEnv(externalRuntimeEnv, "SANCHO_EXTERNAL_GATEWAY_URL") ||
                    hasExternalRuntimeEnv(externalRuntimeEnv, "HERMES_EXTERNAL_GATEWAY_URL")
                      ? "Ya configurado"
                      : "https://runtime.example.com"
                  }
                  className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-2 text-[12px] font-normal normal-case text-foreground outline-none focus:border-rust"
                />
              </label>
              <label className="block text-[11px] font-semibold uppercase text-muted-foreground">
                Clave compartida
                <input
                  type="password"
                  value={externalDraft.secret}
                  onChange={(event) => setExternalDraft((prev) => ({ ...prev, secret: event.target.value }))}
                  placeholder={
                    hasExternalRuntimeEnv(externalRuntimeEnv, "SANCHO_EXTERNAL_SECRET") ||
                    hasExternalRuntimeEnv(externalRuntimeEnv, "HERMES_EXTERNAL_SECRET")
                      ? "Ya configurado"
                      : "secret compartido"
                  }
                  className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-2 text-[12px] font-normal normal-case text-foreground outline-none focus:border-rust"
                />
              </label>
              <label className="block text-[11px] font-semibold uppercase text-muted-foreground">
                {externalDraft.protocol === "mc-bridge" ? "Ruta de chat" : "Ruta para recibir mensajes"}
                <input
                  value={externalDraft.inboundPath}
                  onChange={(event) => setExternalDraft((prev) => ({ ...prev, inboundPath: event.target.value }))}
                  placeholder={externalDraft.protocol === "mc-bridge" ? "/chat" : "/sancho/inbound"}
                  className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-2 text-[12px] font-normal normal-case text-foreground outline-none focus:border-rust"
                />
              </label>
              <label className="block text-[11px] font-semibold uppercase text-muted-foreground">
                Ruta de verificación
                <input
                  value={externalDraft.healthPath}
                  onChange={(event) => setExternalDraft((prev) => ({ ...prev, healthPath: event.target.value }))}
                  placeholder={externalDraft.protocol === "mc-bridge" ? "/health" : "/healthz"}
                  className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-2 text-[12px] font-normal normal-case text-foreground outline-none focus:border-rust"
                />
              </label>
              {externalDraft.protocol === "mc-bridge" && (
                <label className="block text-[11px] font-semibold uppercase text-muted-foreground">
                  Perfil o agente
                  <input
                    value={externalDraft.agent}
                    onChange={(event) => setExternalDraft((prev) => ({ ...prev, agent: event.target.value }))}
                    placeholder="sancho-coordinator"
                    className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-2 text-[12px] font-normal normal-case text-foreground outline-none focus:border-rust"
                  />
                </label>
              )}
            </div>
            {externalSavedUrl && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Guardado: {externalSavedUrl}
                {hasExternalRuntimeEnv(externalRuntimeEnv, "SANCHO_EXTERNAL_SECRET") ||
                hasExternalRuntimeEnv(externalRuntimeEnv, "HERMES_EXTERNAL_SECRET")
                  ? " · secret guardado"
                  : ""}
                {hasExternalRuntimeEnv(externalRuntimeEnv, "SANCHO_EXTERNAL_PROTOCOL") ||
                hasExternalRuntimeEnv(externalRuntimeEnv, "HERMES_EXTERNAL_PROTOCOL")
                  ? " · protocolo guardado"
                  : ""}
              </p>
            )}
            <div className="mt-4 border-t border-border pt-3">
              <div className="font-heading text-[12px] text-navy">Adapters técnicos</div>
              <div className="mt-2 grid gap-2 md:grid-cols-3">
                {(runtimeStatus?.options ?? []).map((option) => {
                  const active = option.id === runtimeStatus?.active;
                  const healthDetail = runtimeHealthDetail(option);
                  return (
                    <div key={option.id} className="rounded-md border border-border bg-background px-2.5 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-heading text-[12px] text-navy">{option.label}</span>
                        <span className="text-[10px] font-bold uppercase text-muted-foreground">
                          {active ? "activo" : option.configured && option.health.ok ? "ok" : "pendiente"}
                        </span>
                      </div>
                      <p className="mt-1 text-[10.5px] leading-relaxed text-muted-foreground">
                        {runtimeCapabilitySummary(option)}
                        {healthDetail ? ` · ${healthDetail}` : ""}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </details>
        )}
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

      <details className="rounded-lg border-2 border-ink bg-background shadow-comic-sm">
        <summary className="cursor-pointer px-4 py-3 font-heading text-sm text-navy">
          Credenciales del motor
          <span className="ml-2 font-sans text-[11.5px] font-normal text-muted-foreground">
            API keys, suscripciones y cuentas de proveedores
          </span>
        </summary>
        <div className="space-y-3 border-t border-border px-4 py-3">
          {/* The engine's auth route is global; the per-agent model lives in Models. */}
          <p className="text-[12.5px] leading-relaxed text-foreground/80">
            Esto es distinto del runtime: aquí eliges si cada proveedor usa suscripción/OAuth o API key. Es global para
            todos los agentes. El modelo concreto de cada agente se elige en{" "}
            <button
              type="button"
              onClick={() => router.replace({ query: { ...router.query, tab: "agents" } }, undefined, { shallow: true })}
              className="font-semibold text-rust hover:underline"
            >
              Agentes
            </button>
            .
          </p>

          {/* Auth routes table */}
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-border bg-navy/5">
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
                              /* Codex subscription: start the OpenClaw pairing flow from the UI. */
                              <button
                                type="button"
                                onClick={() => setCodexGuide(true)}
                                className="text-[11px] px-2.5 py-1 bg-background border border-border rounded-md cursor-pointer hover:border-rust hover:bg-rust hover:text-white transition-all whitespace-nowrap"
                              >
                                Conectar
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
            renueva desde <strong>Conectar</strong> y muestra el código de autorización en pantalla. <strong>No hay cuota/uso en vivo</strong>{" "}
            (OpenClaw no lo expone): la consola es para revisar límites y facturación.
          </p>
        </div>
      </details>

      {codexGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setCodexGuide(false)}
        >
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="relative w-full max-w-[620px] rounded-lg border-2 border-ink bg-card shadow-comic"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-ink px-4 py-3">
              <h3 className="font-heading text-base text-navy">Conectar Codex (suscripción ChatGPT)</h3>
              <button
                type="button"
                onClick={() => setCodexGuide(false)}
                className="px-1 text-lg leading-none text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>
            <div className="space-y-3 p-4">
              <div className="rounded-lg border border-border bg-background px-3 py-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-[12.5px] leading-relaxed text-foreground/80">
                      Pulsa iniciar. Sancho pedirá a OpenClaw un código de emparejamiento; abre la URL, escribe el
                      código y autoriza con la cuenta ChatGPT que debe pagar Codex.
                    </p>
                    <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
                      El token queda guardado en el motor y se comparte con los agentes Codex. No hace falta terminal.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={startCodexAuth}
                    disabled={codexAuthStarting || codexAuthJob?.status === "running"}
                    className="w-fit rounded border border-ink px-3 py-1.5 text-[12px] font-semibold text-navy transition-colors hover:bg-rust hover:text-white disabled:opacity-50"
                  >
                    {codexAuthStarting || codexAuthJob?.status === "running" ? "conectando..." : "Iniciar conexión"}
                  </button>
                </div>
              </div>

              {codexAuthJob && (
                <div className="space-y-3 rounded-lg border border-border bg-background px-3 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide",
                        codexAuthStatusClass(codexAuthJob.status),
                      )}
                    >
                      {codexAuthStatusLabel(codexAuthJob.status)}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {codexAuthPolling ? "actualizando..." : `última señal ${new Date(codexAuthJob.updatedAt).toLocaleTimeString()}`}
                    </span>
                  </div>

                  {(codexAuthJob.url || codexAuthJob.code) && (
                    <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
                      <div className="min-w-0">
                        <div className="text-[11px] font-semibold uppercase text-muted-foreground">URL</div>
                        {codexAuthJob.url ? (
                          <a
                            href={codexAuthJob.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block truncate text-[12px] font-semibold text-rust underline-offset-2 hover:underline"
                            title={codexAuthJob.url}
                          >
                            {codexAuthJob.url}
                          </a>
                        ) : (
                          <span className="text-[12px] text-muted-foreground">esperando URL...</span>
                        )}
                      </div>
                      {codexAuthJob.url && (
                        <a
                          href={codexAuthJob.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-fit rounded border border-ink px-3 py-1.5 text-[12px] font-semibold text-navy transition-colors hover:bg-rust hover:text-white"
                        >
                          Abrir autorización
                        </a>
                      )}
                      <div>
                        <div className="text-[11px] font-semibold uppercase text-muted-foreground">Código</div>
                        <div className="mt-1 rounded-md border border-border bg-muted/35 px-3 py-2 font-mono text-lg font-bold tracking-wide text-navy">
                          {codexAuthJob.code || "esperando..."}
                        </div>
                        {codexAuthJob.expiresText && (
                          <div className="mt-1 text-[11px] text-muted-foreground">caduca en {codexAuthJob.expiresText}</div>
                        )}
                      </div>
                    </div>
                  )}

                  {codexAuthJob.restart && !codexAuthJob.restart.ok && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] text-amber-800">
                      Codex quedó autenticado, pero el gateway no se pudo reiniciar automáticamente:{" "}
                      {codexAuthJob.restart.error || "timeout"}. Pulsa Re-verificar tras reiniciar el runtime.
                    </div>
                  )}

                  <div>
                    <label className="block text-[11px] font-semibold uppercase text-muted-foreground">
                      Redirect manual
                      <textarea
                        value={codexAuthInput}
                        onChange={(event) => setCodexAuthInput(event.target.value)}
                        placeholder="Solo si OpenClaw lo pide: pega aquí la URL de redirección completa."
                        className="mt-1 h-16 w-full resize-none rounded-md border border-border bg-card px-2.5 py-2 text-[12px] font-normal normal-case text-foreground outline-none focus:border-rust"
                      />
                    </label>
                    <div className="mt-2 flex flex-wrap justify-end gap-2">
                      {codexAuthJob.status === "running" && (
                        <button
                          type="button"
                          onClick={cancelCodexAuth}
                          disabled={codexAuthCancelling}
                          className="rounded border border-border px-3 py-1.5 text-[12px] font-semibold text-muted-foreground transition-colors hover:border-ink hover:text-navy disabled:opacity-50"
                        >
                          {codexAuthCancelling ? "cancelando..." : "Cancelar"}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={submitCodexAuthInput}
                        disabled={!codexAuthInput.trim() || codexAuthSubmitting || codexAuthJob.status !== "running"}
                        className="rounded border border-ink px-3 py-1.5 text-[12px] font-semibold text-navy transition-colors hover:bg-rust hover:text-white disabled:opacity-50"
                      >
                        {codexAuthSubmitting ? "enviando..." : "Enviar redirect"}
                      </button>
                    </div>
                  </div>

                  <pre className="max-h-44 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-2 text-[11px] leading-relaxed text-muted-foreground">
                    {codexAuthJob.output || "Esperando salida de OpenClaw..."}
                  </pre>
                </div>
              )}

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={recheckCodex}
                  disabled={rechecking}
                  className="rounded border border-ink px-3 py-1.5 text-[12px] font-semibold text-navy transition-colors hover:bg-rust hover:text-white disabled:opacity-50"
                >
                  {rechecking ? "verificando..." : "Re-verificar estado"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
