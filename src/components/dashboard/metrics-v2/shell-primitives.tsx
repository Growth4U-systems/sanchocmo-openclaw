import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import type {
  MetricDataState,
  MetricQualityStatus,
} from "@/lib/metrics/dashboard-view-model";
import { Chip, Panel } from ".";

const STATE_TONE: Record<MetricDataState, string> = {
  ON: "bg-sage text-white",
  PARCIAL: "bg-[var(--sc-sun-300)] text-ink",
  OFF: "bg-aged text-[var(--sc-fg-muted)]",
  "SIN DATOS": "bg-[var(--sc-brick-bg)] text-destructive",
  "CONECTADO SIN SNAPSHOTS": "bg-[var(--sc-sun-50)] text-[var(--sc-fg-soft)]",
  "COMING SOON": "bg-navy text-white",
};

const QUALITY_LABEL: Record<MetricQualityStatus, string> = {
  ok: "Dato listo",
  partial: "Dato parcial",
  missing: "Sin dato",
  pending: "Pendiente",
  future: "Fase posterior",
  dirty: "Revisar",
  stale: "Desactualizado",
  demo: "Demo",
};

export function DeltaBadge({
  label = "sin delta",
  direction = "flat",
}: {
  label?: string;
  direction?: "up" | "down" | "flat";
}) {
  const tone =
    direction === "up" ? "up" : direction === "down" ? "down" : "flat";
  return <Chip tone={tone}>{label}</Chip>;
}

export function MetricQualityBadge({
  status,
  source,
}: {
  status: MetricQualityStatus;
  source?: string;
}) {
  const tone =
    status === "ok"
      ? "ok"
      : status === "partial" || status === "stale"
        ? "warn"
        : status === "dirty"
          ? "must"
          : status === "demo"
            ? "custom"
            : "flat";
  return (
    <Chip tone={tone}>
      {QUALITY_LABEL[status]}
      {source ? ` · ${source}` : ""}
    </Chip>
  );
}

export function EmptyMetricState({
  title,
  requiredSource,
  nextAction,
  state = "SIN DATOS",
  compact,
}: {
  title: string;
  requiredSource: string;
  nextAction: string;
  state?: MetricDataState;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-sc-md border-2 border-dashed border-ink bg-[var(--sc-paper-3)] p-4",
        compact && "p-3",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "rounded-sc-pill border border-ink px-2 py-0.5 font-heading text-[10px] font-bold",
            STATE_TONE[state],
          )}
        >
          {state}
        </span>
        <h3 className="font-heading text-[13px] font-bold text-navy">
          {title}
        </h3>
      </div>
      <p className="mt-2 text-[12px] text-[var(--sc-fg-muted)]">
        Dato necesario: <b>{requiredSource}</b>.
      </p>
      <p className="mt-1 text-[12px] text-[var(--sc-fg-muted)]">{nextAction}</p>
    </div>
  );
}

export function MiniSparkline({
  state = "SIN DATOS",
  label = "sin serie",
}: {
  state?: MetricDataState;
  label?: string;
}) {
  return (
    <div
      aria-label={label}
      className="flex h-12 items-end gap-1 rounded-sc-md border-2 border-ink bg-aged/40 p-2"
    >
      {Array.from({ length: 12 }).map((_, index) => (
        <span
          key={index}
          className={cn(
            "flex-1 rounded-t-sm border border-ink bg-card opacity-50",
            state === "ON" && "bg-sage opacity-80",
          )}
          style={{
            height:
              state === "ON"
                ? `${30 + ((index * 13) % 55)}%`
                : `${18 + (index % 3) * 8}%`,
          }}
        />
      ))}
    </div>
  );
}

export function MiniFunnel({
  stages,
  state = "SIN DATOS",
}: {
  stages: string[];
  state?: MetricDataState;
}) {
  return (
    <div
      className="grid gap-2 lg:grid-cols-[repeat(var(--stage-count),minmax(0,1fr))]"
      style={{ "--stage-count": stages.length } as CSSProperties}
    >
      {stages.map((stage, index) => (
        <div
          key={stage}
          className="relative rounded-sc-md border-2 border-ink bg-card p-3 shadow-pop-xs"
        >
          <div className="font-heading text-[11px] font-bold uppercase text-[var(--sc-fg-muted)]">
            {stage}
          </div>
          <div className="mt-2 font-heading text-[24px] font-bold text-navy">
            —
          </div>
          <MetricQualityBadge
            status={state === "ON" ? "partial" : "missing"}
            source="Embudo unificado"
          />
          {index < stages.length - 1 && (
            <div className="mt-3 text-[11px] font-semibold text-[var(--sc-fg-muted)]">
              Conversión pendiente →
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function BreakdownTable({
  columns,
  rows,
  empty,
}: {
  columns: string[];
  rows?: Array<{ key: string; cells: ReactNode[] }>;
  empty: ReactNode;
}) {
  if (!rows?.length) return <>{empty}</>;
  return (
    <div className="overflow-x-auto rounded-sc-md border-2 border-ink bg-card shadow-pop-xs">
      <table className="w-full min-w-[680px] border-collapse text-[13px]">
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column}
                className="border-b-2 border-ink px-3 py-2 text-left font-heading text-[10px] font-bold uppercase text-[var(--sc-fg-muted)]"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              {row.cells.map((cell, index) => (
                <td
                  key={index}
                  className="border-b border-border px-3 py-2.5 align-top"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MoversPanel({
  title = "Movimientos",
  state = "COMING SOON",
}: {
  title?: string;
  state?: MetricDataState;
}) {
  return (
    <Panel>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-heading text-[15px] font-bold text-navy">
            {title}
          </h3>
          <p className="mt-1 text-[12px] text-[var(--sc-fg-muted)]">
            Pendiente de conectar Intelligence signals a esta surface; hoy no
            lee señales reales.
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-sc-pill border border-ink px-2 py-0.5 font-heading text-[10px] font-bold",
            STATE_TONE[state],
          )}
        >
          {state}
        </span>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {["Cambio relevante", "Fuga o anomalía", "Siguiente acción"].map(
          (item) => (
            <EmptyMetricState
              key={item}
              compact
              title={item}
              requiredSource="Intelligence signals por surface"
              nextAction="Falta el read model que conecte señales reales con Métricas."
              state={state}
            />
          ),
        )}
      </div>
    </Panel>
  );
}

export function SurfaceStatusCard({
  icon,
  label,
  description,
  state,
  sources,
  onOpen,
}: {
  icon: string;
  label: string;
  description: string;
  state: MetricDataState;
  sources: string[];
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="h-full rounded-sc-lg border-[2.5px] border-ink bg-card p-4 text-left shadow-pop-sm transition-all hover:-translate-x-px hover:-translate-y-px hover:shadow-pop-md"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-sc-md border-2 border-ink bg-aged text-xl">
          {icon}
        </span>
        <span
          className={cn(
            "rounded-sc-pill border border-ink px-2 py-0.5 font-heading text-[10px] font-bold",
            STATE_TONE[state],
          )}
        >
          {state}
        </span>
      </div>
      <h3 className="mt-3 font-heading text-[16px] font-bold text-navy">
        {label}
      </h3>
      <p className="mt-1 min-h-[38px] text-[12px] leading-snug text-[var(--sc-fg-muted)]">
        {description}
      </p>
      <p className="mt-3 text-[11px] text-[var(--sc-fg-muted)]">
        {sources.length
          ? `Fuentes: ${sources.join(" · ")}`
          : "Sin fuentes conectadas"}
      </p>
      <div className="mt-3 font-heading text-[12px] font-bold text-rust">
        Abrir detalle →
      </div>
    </button>
  );
}
