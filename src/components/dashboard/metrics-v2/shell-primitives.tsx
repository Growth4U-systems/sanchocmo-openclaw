import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import type {
  MetricDataState,
  MetricQualityStatus,
} from "@/lib/metrics/dashboard-view-model";
import { Chip, Panel } from ".";

const QUALITY_LABEL: Partial<Record<MetricQualityStatus, string>> = {
  dirty: "Revisar dato",
  stale: "Dato desactualizado",
};

const EMPTY_LABEL: Record<MetricDataState, string> = {
  ON: "Sin KPI calculado",
  PARCIAL: "Faltan fuentes",
  OFF: "No conectado",
  "SIN DATOS": "No conectado",
  "CONECTADO SIN SNAPSHOTS": "Conectado sin datos",
  "COMING SOON": "Próximamente",
};

export function DeltaBadge({
  label = "sin delta",
  direction = "flat",
}: {
  label?: string;
  direction?: "up" | "down" | "flat";
}) {
  if (direction === "flat" && label === "sin delta") return null;
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
  if (status !== "dirty" && status !== "stale") return null;
  const tone = status === "dirty" ? "must" : "warn";
  return (
    <Chip tone={tone}>
      {QUALITY_LABEL[status]}
      {source ? `: ${source}` : ""}
    </Chip>
  );
}

export function EmptyMetricState({
  title,
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
      <div>
        <h3 className="font-heading text-[13px] font-bold text-navy">
          {title}
        </h3>
      </div>
      <p className="mt-1 text-[12px] text-[var(--sc-fg-muted)]">
        {EMPTY_LABEL[state]}
      </p>
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
          {index < stages.length - 1 && (
            <div className="mt-3 text-[11px] font-semibold text-[var(--sc-fg-muted)]">
              →
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
}: {
  title?: string;
  state?: MetricDataState;
}) {
  return (
    <Panel>
      <h3 className="font-heading text-[15px] font-bold text-navy">
        {title}
      </h3>
      <p className="mt-1 text-[12px] text-[var(--sc-fg-muted)]">
        Sin movimientos.
      </p>
    </Panel>
  );
}

export function SurfaceStatusCard({
  icon,
  label,
  description,
  onOpen,
}: {
  icon: string;
  label: string;
  description: string;
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
      </div>
      <h3 className="mt-3 font-heading text-[16px] font-bold text-navy">
        {label}
      </h3>
      <p className="mt-1 min-h-[38px] text-[12px] leading-snug text-[var(--sc-fg-muted)]">
        {description}
      </p>
      <div className="mt-3 font-heading text-[12px] font-bold text-rust">
        Abrir detalle →
      </div>
    </button>
  );
}
