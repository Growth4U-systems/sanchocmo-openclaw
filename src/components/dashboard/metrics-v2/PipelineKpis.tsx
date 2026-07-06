/**
 * Pipeline/CRM surface — GHL-only KPI header with data provenance (SAN-319 · PR4).
 *
 * Pure/presentational: the parent (`CrmModule` in `metrics.tsx`) computes the GHL
 * numbers (via `mVal`) and the known-dirty flag (via `getKnownDirty('ghl')`) and
 * passes them in. Surfaces read ONLY their own source — GHL here — so this never
 * references cross-source attribution. GHL contacts, appointments and opportunities
 * are CRM-owned figures; channel→cita→pago joins live in the Atribución view (PR7).
 */
import { cn } from "@/lib/utils";
import { DataChip, DataHealthBadge } from "./rigor";
import { fmt } from "@/lib/metrics/format";

export function PipelineKpis({
  contacts,
  newContacts,
  appointments,
  opportunities,
  pipelineValue,
  ghlDirty,
  dirtyReason,
  attributionHref = "#conversion",
}: {
  contacts: number;
  newContacts: number;
  appointments: number;
  opportunities: number;
  pipelineValue: number;
  ghlDirty: boolean;
  dirtyReason?: string;
  attributionHref?: string;
}) {
  const kpis: { label: string; value: string; color?: string }[] = [
    { label: "Contacts", value: fmt(contacts) },
    { label: "New", value: `+${newContacts}`, color: "text-sage" },
    { label: "Appts", value: fmt(appointments) },
    { label: "Opps", value: fmt(opportunities) },
    ...(pipelineValue > 0
      ? [{ label: "Pipeline", value: `€${fmt(pipelineValue)}`, color: "text-sage" }]
      : []),
  ];
  return (
    <>
      <div className="flex flex-wrap gap-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="min-w-[70px] text-center">
            <div className={cn("font-heading text-[22px] font-bold", kpi.color)}>{kpi.value}</div>
            <div className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{kpi.label}</div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px] text-[var(--sc-fg-muted)]">
        <DataChip type="real" source="GHL" confidence="alta" />
        <span>contactos · reuniones · opportunities = dato directo de GHL</span>
        <span title={dirtyReason}>
          <DataHealthBadge source="ghl" status={ghlDirty ? "dirty" : "clean"} />
        </span>
        <a href={attributionHref} className="font-heading font-bold text-rust underline">
          → citas reales por canal en Conversión/Atribución
        </a>
      </div>
    </>
  );
}
