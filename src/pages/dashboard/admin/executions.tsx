"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import Head from "next/head";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ComicCard } from "@/components/shared/comic-card";
import { FilterBar } from "@/components/shared/filter-bar";
import { useClients } from "@/hooks/useClients";
import { cn } from "@/lib/utils";

interface ExecutionRun {
  id: string;
  tenantKey: string;
  aggregateType: string;
  aggregateId: string;
  operation: string;
  mode: string;
  status: string;
  currentStep?: string;
  traceId?: string;
  hasError?: boolean;
  error?: unknown;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  updatedAt: string;
  input?: unknown;
  output?: unknown;
  metadata?: unknown;
  idempotencyKey?: string;
}

interface ExecutionStep {
  id: string;
  runId: string;
  stepKey: string;
  status: string;
  attempt: number;
  input?: unknown;
  output?: unknown;
  error?: unknown;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  updatedAt: string;
}

interface ExecutionEvent {
  sequence: number;
  id: string;
  runId: string;
  aggregateType: string;
  aggregateId: string;
  traceId?: string;
  type: string;
  ts: string;
  data?: unknown;
}

interface ExecutionRunsResponse {
  runs: ExecutionRun[];
  nextCursor?: string | null;
  page?: {
    limit: number;
    nextCursor?: string | null;
    hasMore: boolean;
  };
}

interface ExecutionRunDetailResponse {
  run: ExecutionRun;
  steps: ExecutionStep[];
  events: ExecutionEvent[];
  nextEventCursor?: string | number;
  page?: {
    steps: {
      limit: number;
      truncated: boolean;
    };
    events: {
      limit: number;
      nextAfterSequence?: number | null;
      hasMore: boolean;
    };
  };
  redaction?: unknown;
}

const STATUS_OPTIONS = [
  "queued",
  "running",
  "waiting_approval",
  "completed",
  "partial",
  "failed",
  "cancelled",
] as const;

const ACTIVE_RUN_STATUSES = new Set(["queued", "running", "waiting_approval"]);

const STATUS_LABELS: Record<string, string> = {
  queued: "En cola",
  pending: "Pendiente",
  running: "En curso",
  waiting_approval: "Esperando aprobación",
  completed: "Completada",
  partial: "Parcial",
  failed: "Fallida",
  cancelled: "Cancelada",
  skipped: "Omitida",
};

const STATUS_STYLES: Record<string, string> = {
  queued: "border-slate-300 bg-slate-100 text-slate-700",
  pending: "border-slate-300 bg-slate-100 text-slate-700",
  running: "border-blue-300 bg-blue-100 text-blue-800",
  waiting_approval: "border-amber-300 bg-amber-100 text-amber-900",
  completed: "border-emerald-300 bg-emerald-100 text-emerald-800",
  partial: "border-orange-300 bg-orange-100 text-orange-900",
  failed: "border-red-300 bg-red-100 text-red-800",
  cancelled: "border-zinc-300 bg-zinc-100 text-zinc-700",
  skipped: "border-zinc-300 bg-zinc-100 text-zinc-700",
};

const MODE_LABELS: Record<string, string> = {
  shadow: "Sombra",
  canary: "Canary",
  active: "Activa",
};

const DATE_FORMATTER = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function useDocumentVisibility(): boolean {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const updateVisibility = () => {
      setVisible(document.visibilityState === "visible");
    };

    updateVisibility();
    document.addEventListener("visibilitychange", updateVisibility);
    return () => {
      document.removeEventListener("visibilitychange", updateVisibility);
    };
  }, []);

  return visible;
}

function formatDate(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : DATE_FORMATTER.format(date);
}

function formatJson(value: unknown): string {
  if (value === undefined || value === null) return "—";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "No se pudo cargar la información.";
}

function responseErrorMessage(payload: unknown, status: number): string {
  if (status === 401) return "Tu sesión expiró. Vuelve a iniciar sesión.";
  if (status === 403)
    return "Necesitas permisos de administrador para ver el Ledger.";
  if (status === 404)
    return "La ejecución ya no existe o pertenece a otro tenant.";
  if (payload && typeof payload === "object") {
    const candidate = payload as {
      error?: string | { message?: string };
      message?: string;
    };
    if (typeof candidate.error === "string") return candidate.error;
    if (candidate.error && typeof candidate.error.message === "string") {
      return candidate.error.message;
    }
    if (typeof candidate.message === "string") return candidate.message;
  }
  return `La API respondió con HTTP ${status}.`;
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(responseErrorMessage(payload, response.status));
  }
  return response.json() as Promise<T>;
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold whitespace-nowrap",
        STATUS_STYLES[status] ?? "border-border bg-background text-foreground",
      )}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  if (value === undefined || value === null) return null;
  return (
    <details className="group border-t border-border py-3 first:border-t-0">
      <summary className="cursor-pointer select-none text-xs font-bold text-navy group-open:text-rust">
        {label}
      </summary>
      <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-background p-3 text-[11px] leading-relaxed text-foreground">
        {formatJson(value)}
      </pre>
    </details>
  );
}

function RunDetail({
  detail,
  loading,
  fetching,
  error,
}: {
  detail?: ExecutionRunDetailResponse;
  loading: boolean;
  fetching: boolean;
  error: unknown;
}) {
  if (loading) {
    return (
      <div className="space-y-3" aria-live="polite">
        <div className="h-5 w-2/3 animate-pulse rounded bg-muted" />
        <div className="h-20 animate-pulse rounded bg-muted" />
        <div className="h-40 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="rounded-lg border-2 border-red-300 bg-red-50 p-4 text-sm text-red-900"
        role="alert"
      >
        <p className="font-bold">No pudimos abrir esta ejecución.</p>
        <p className="mt-1 text-xs">{errorMessage(error)}</p>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex min-h-64 items-center justify-center text-center">
        <div>
          <p className="text-sm font-bold text-navy">
            Selecciona una ejecución
          </p>
          <p className="mt-1 max-w-xs text-xs text-muted-foreground">
            Aquí verás su recorrido, los pasos y la evidencia que dejó en el
            Ledger.
          </p>
        </div>
      </div>
    );
  }

  const { run, steps, events } = detail;
  const orderedEvents = [...events].sort((left, right) => {
    const sequenceDelta = left.sequence - right.sequence;
    if (sequenceDelta !== 0) return sequenceDelta;
    return new Date(left.ts).getTime() - new Date(right.ts).getTime();
  });

  return (
    <div
      className={cn("space-y-5", fetching && "opacity-80")}
      aria-busy={fetching}
    >
      <div>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
              {run.operation}
            </p>
            <h2 className="mt-1 break-all font-heading text-lg text-navy">
              {run.id}
            </h2>
          </div>
          <StatusBadge status={run.status} />
        </div>
        {run.error ? (
          <div className="mt-3 rounded-md border border-red-300 bg-red-50 p-3 text-xs text-red-900">
            <p className="font-bold">Error</p>
            <pre className="mt-1 whitespace-pre-wrap break-words font-sans text-xs">
              {typeof run.error === "string"
                ? run.error
                : formatJson(run.error)}
            </pre>
          </div>
        ) : null}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-y border-border py-4 text-xs">
        <div>
          <dt className="text-muted-foreground">Creada</dt>
          <dd className="mt-0.5 font-semibold text-foreground">
            {formatDate(run.createdAt)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Actualizada</dt>
          <dd className="mt-0.5 font-semibold text-foreground">
            {formatDate(run.updatedAt)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Modo</dt>
          <dd className="mt-0.5 font-semibold text-foreground">
            {MODE_LABELS[run.mode] ?? run.mode}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Paso actual</dt>
          <dd className="mt-0.5 break-words font-semibold text-foreground">
            {run.currentStep || "—"}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-muted-foreground">Agregado</dt>
          <dd className="mt-0.5 break-all font-semibold text-foreground">
            {run.aggregateType} · {run.aggregateId}
          </dd>
        </div>
        {run.traceId ? (
          <div className="col-span-2">
            <dt className="text-muted-foreground">Trace ID</dt>
            <dd className="mt-0.5 break-all font-mono text-[11px] text-foreground">
              {run.traceId}
            </dd>
          </div>
        ) : null}
        {run.idempotencyKey ? (
          <div className="col-span-2">
            <dt className="text-muted-foreground">Clave de idempotencia</dt>
            <dd className="mt-0.5 break-all font-mono text-[11px] text-foreground">
              {run.idempotencyKey}
            </dd>
          </div>
        ) : null}
      </dl>

      <section aria-labelledby="execution-steps-title">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3
            id="execution-steps-title"
            className="font-heading text-sm text-navy"
          >
            Pasos
          </h3>
          <span className="text-[10px] font-bold text-muted-foreground">
            {steps.length}
          </span>
        </div>
        {steps.length === 0 ? (
          <p className="rounded-md bg-background px-3 py-2 text-xs text-muted-foreground">
            Esta ejecución todavía no registró pasos.
          </p>
        ) : (
          <div className="space-y-2">
            {steps.map((step) => (
              <div
                key={step.id}
                className="rounded-md border border-border bg-background p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="break-all text-xs font-bold text-foreground">
                    {step.stepKey}
                  </p>
                  <StatusBadge status={step.status} />
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Intento {step.attempt} ·{" "}
                  {formatDate(step.startedAt || step.createdAt)}
                </p>
                {step.error ? (
                  <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-xs text-red-800">
                    {typeof step.error === "string"
                      ? step.error
                      : formatJson(step.error)}
                  </pre>
                ) : null}
                <JsonBlock label="Entrada del paso" value={step.input} />
                <JsonBlock label="Salida del paso" value={step.output} />
              </div>
            ))}
          </div>
        )}
        {detail.page?.steps.truncated ? (
          <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
            La ejecución tiene más pasos de los mostrados en esta vista.
          </p>
        ) : null}
      </section>

      <section aria-labelledby="execution-events-title">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3
            id="execution-events-title"
            className="font-heading text-sm text-navy"
          >
            Línea de tiempo
          </h3>
          <span className="text-[10px] font-bold text-muted-foreground">
            {events.length} eventos
          </span>
        </div>
        {orderedEvents.length === 0 ? (
          <p className="rounded-md bg-background px-3 py-2 text-xs text-muted-foreground">
            No hay eventos registrados para esta ejecución.
          </p>
        ) : (
          <ol className="relative ml-1 border-l-2 border-border pl-4">
            {orderedEvents.map((event) => (
              <li key={event.id} className="relative pb-4 last:pb-0">
                <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-card bg-rust" />
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="break-all text-xs font-bold text-foreground">
                    {event.type}
                  </p>
                  <time
                    className="text-[10px] text-muted-foreground"
                    dateTime={event.ts}
                  >
                    {formatDate(event.ts)}
                  </time>
                </div>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  Secuencia {event.sequence}
                </p>
                <JsonBlock label="Datos del evento" value={event.data} />
              </li>
            ))}
          </ol>
        )}
        {detail.nextEventCursor !== undefined || detail.page?.events.hasMore ? (
          <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
            Esta es una vista parcial: el Ledger conserva más eventos para esta
            ejecución.
          </p>
        ) : null}
      </section>

      <section
        className="border-t border-border pt-1"
        aria-label="Datos persistidos"
      >
        <JsonBlock label="Entrada de la ejecución" value={run.input} />
        <JsonBlock label="Salida de la ejecución" value={run.output} />
        <JsonBlock label="Metadatos" value={run.metadata} />
        {detail.redaction ? (
          <p className="pt-2 text-[10px] leading-relaxed text-muted-foreground">
            Los valores sensibles se redactan y los payloads se acotan en el
            servidor antes de llegar al navegador.
          </p>
        ) : null}
      </section>
    </div>
  );
}

export default function ExecutionsPage() {
  const [tenantKey, setTenantKey] = useState("");
  const [operationDraft, setOperationDraft] = useState("");
  const [operation, setOperation] = useState("");
  const [status, setStatus] = useState("");
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const [explicitRunId, setExplicitRunId] = useState<string | null>(null);
  const visible = useDocumentVisibility();
  const { data: clients, isLoading: clientsLoading } = useClients();
  const activeClients = (clients || [])
    .filter((client) => client.active)
    .sort((left, right) => left.name.localeCompare(right.name, "es"));
  const cursor = cursorStack[cursorStack.length - 1];

  const runsQuery = useQuery<ExecutionRunsResponse>({
    queryKey: ["admin-execution-runs", tenantKey, operation, status, cursor],
    enabled: Boolean(tenantKey),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ tenantKey, limit: "25" });
      if (operation) params.set("operation", operation);
      if (status) params.set("status", status);
      if (cursor) params.set("before", cursor);
      return fetchJson<ExecutionRunsResponse>(
        `/api/admin/execution-runs?${params}`,
        signal,
      );
    },
    refetchInterval: visible ? 10_000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  const selectedRunId = explicitRunId || runsQuery.data?.runs[0]?.id || null;
  const detailQuery = useQuery<ExecutionRunDetailResponse>({
    queryKey: ["admin-execution-run", tenantKey, selectedRunId],
    enabled: Boolean(tenantKey && selectedRunId),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ tenantKey });
      return fetchJson<ExecutionRunDetailResponse>(
        `/api/admin/execution-runs/${encodeURIComponent(selectedRunId as string)}?${params}`,
        signal,
      );
    },
    refetchInterval: (query) => {
      const runStatus = query.state.data?.run.status;
      return visible && (!runStatus || ACTIVE_RUN_STATUSES.has(runStatus))
        ? 10_000
        : false;
    },
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  function resetNavigation() {
    setCursorStack([]);
    setExplicitRunId(null);
  }

  function applyOperationFilter() {
    const nextOperation = operationDraft.trim();
    if (nextOperation === operation) return;
    setOperation(nextOperation);
    resetNavigation();
  }

  function refresh() {
    void runsQuery.refetch();
    if (selectedRunId) void detailQuery.refetch();
  }

  const refreshing = runsQuery.isFetching || detailQuery.isFetching;
  const runs = runsQuery.data?.runs || [];
  const nextCursor =
    runsQuery.data?.page?.nextCursor ?? runsQuery.data?.nextCursor;

  return (
    <DashboardLayout>
      <Head>
        <title>Ejecuciones — Mission Control</title>
      </Head>

      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-rust">
            Ledger de ejecución
          </p>
          <h1 className="mt-1 font-heading text-2xl text-navy">Ejecuciones</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Evidencia de cada operación, desde la solicitud hasta su resultado.
          </p>
        </div>
        <div
          className="flex items-center gap-2 text-[11px] text-muted-foreground"
          aria-live="polite"
        >
          <span
            aria-hidden="true"
            className={cn(
              "h-2 w-2 rounded-full",
              visible ? "bg-emerald-500" : "bg-amber-500",
            )}
          />
          {visible
            ? "Actualización automática · 10 s"
            : "Actualización pausada"}
        </div>
      </div>

      <FilterBar className="rounded-lg border-2 border-border bg-card p-3 shadow-comic-sm">
        <label className="min-w-[190px] flex-1">
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            Cliente / tenant
          </span>
          <select
            value={tenantKey}
            onChange={(event) => {
              setTenantKey(event.target.value);
              resetNavigation();
            }}
            className="w-full rounded-lg border-2 border-ink bg-background px-3 py-2 text-sm"
            aria-label="Cliente o tenant"
          >
            <option value="">
              {clientsLoading ? "Cargando clientes…" : "Selecciona un cliente"}
            </option>
            {activeClients.map((client) => (
              <option key={client.slug} value={client.slug}>
                {client.emoji} {client.name}
              </option>
            ))}
            <option value="system">⚙️ Sistema</option>
          </select>
        </label>

        <div className="min-w-[250px] flex-[1.3]">
          <label
            htmlFor="execution-operation-filter"
            className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-muted-foreground"
          >
            Operación
          </label>
          <div className="flex gap-1.5">
            <input
              id="execution-operation-filter"
              name="execution-operation-filter"
              type="text"
              autoComplete="off"
              value={operationDraft}
              onChange={(event) => setOperationDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") applyOperationFilter();
              }}
              placeholder="p. ej. partnerships.discovery"
              className="min-w-0 flex-1 rounded-lg border-2 border-ink bg-background px-3 py-2 text-sm"
              disabled={!tenantKey}
            />
            <button
              type="button"
              onClick={applyOperationFilter}
              disabled={!tenantKey || operationDraft.trim() === operation}
              className="rounded-lg border-2 border-ink bg-background px-3 py-2 text-xs font-bold text-navy hover:bg-rust/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Aplicar
            </button>
          </div>
        </div>

        <label className="min-w-[170px] flex-1">
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            Estado
          </span>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              resetNavigation();
            }}
            className="w-full rounded-lg border-2 border-ink bg-background px-3 py-2 text-sm"
            disabled={!tenantKey}
          >
            <option value="">Todos los estados</option>
            {STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {STATUS_LABELS[option]}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={refresh}
          disabled={!tenantKey || refreshing}
          className="self-end rounded-lg border-2 border-ink bg-background px-4 py-2 text-sm font-bold text-navy transition-colors hover:bg-rust/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {refreshing ? "Actualizando…" : "Actualizar"}
        </button>
      </FilterBar>

      {!tenantKey ? (
        <ComicCard className="flex min-h-[360px] items-center justify-center border-dashed text-center">
          <div>
            <p className="font-heading text-lg text-navy">Elige dónde mirar</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Selecciona un cliente o Sistema para consultar ejecuciones sin
              mezclar fronteras de tenant.
            </p>
          </div>
        </ComicCard>
      ) : (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(380px,7fr)]">
          <ComicCard className="overflow-hidden p-0">
            <div className="flex items-center justify-between gap-3 border-b-2 border-border px-4 py-3">
              <div>
                <h2 className="font-heading text-sm text-navy">Historial</h2>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  25 por página · más recientes primero
                </p>
              </div>
              <span className="text-[10px] font-bold text-muted-foreground">
                Página {cursorStack.length + 1}
              </span>
            </div>

            {runsQuery.isLoading ? (
              <div className="space-y-2 p-4" aria-live="polite">
                {[0, 1, 2, 3, 4].map((index) => (
                  <div
                    key={index}
                    className="h-20 animate-pulse rounded-lg bg-muted motion-reduce:animate-none"
                  />
                ))}
              </div>
            ) : runsQuery.error ? (
              <div
                className="m-4 rounded-lg border-2 border-red-300 bg-red-50 p-4 text-sm text-red-900"
                role="alert"
              >
                <p className="font-bold">No pudimos leer el Ledger.</p>
                <p className="mt-1 text-xs">{errorMessage(runsQuery.error)}</p>
                <button
                  type="button"
                  onClick={() => void runsQuery.refetch()}
                  className="mt-3 rounded-md border border-red-800 px-3 py-1.5 text-xs font-bold hover:bg-red-100"
                >
                  Reintentar
                </button>
              </div>
            ) : runs.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <p className="text-sm font-bold text-navy">
                  No hay ejecuciones con estos filtros.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Prueba otro estado u operación, o ejecuta el flujo que quieres
                  observar.
                </p>
              </div>
            ) : (
              <div className="max-h-[66vh] divide-y divide-border overflow-y-auto">
                {runs.map((run) => {
                  const selected = run.id === selectedRunId;
                  return (
                    <button
                      key={run.id}
                      type="button"
                      onClick={() => setExplicitRunId(run.id)}
                      aria-pressed={selected}
                      className={cn(
                        "w-full px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rust",
                        selected ? "bg-rust/10" : "hover:bg-background",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p
                            className="truncate text-xs font-bold text-foreground"
                            title={run.operation}
                          >
                            {run.operation}
                          </p>
                          <p
                            className="mt-1 truncate text-[11px] text-muted-foreground"
                            title={run.aggregateId}
                          >
                            {run.aggregateId}
                          </p>
                        </div>
                        <StatusBadge status={run.status} />
                      </div>
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground">
                        <span>{formatDate(run.createdAt)}</span>
                        <span>{MODE_LABELS[run.mode] ?? run.mode}</span>
                      </div>
                      {run.currentStep ? (
                        <p
                          className="mt-1.5 truncate text-[10px] font-semibold text-rust"
                          title={run.currentStep}
                        >
                          Paso · {run.currentStep}
                        </p>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex items-center justify-between gap-3 border-t-2 border-border px-4 py-3">
              <button
                type="button"
                onClick={() => {
                  setCursorStack((current) => current.slice(0, -1));
                  setExplicitRunId(null);
                }}
                disabled={cursorStack.length === 0 || runsQuery.isFetching}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-bold text-navy hover:bg-background disabled:cursor-not-allowed disabled:opacity-40"
              >
                ← Anterior
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!nextCursor) return;
                  setCursorStack((current) => [...current, nextCursor]);
                  setExplicitRunId(null);
                }}
                disabled={!nextCursor || runsQuery.isFetching}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-bold text-navy hover:bg-background disabled:cursor-not-allowed disabled:opacity-40"
              >
                Siguiente →
              </button>
            </div>
          </ComicCard>

          <ComicCard className="max-h-[78vh] overflow-y-auto xl:sticky xl:top-4">
            <RunDetail
              detail={detailQuery.data}
              loading={detailQuery.isLoading}
              fetching={detailQuery.isFetching}
              error={detailQuery.error}
            />
          </ComicCard>
        </div>
      )}
    </DashboardLayout>
  );
}
