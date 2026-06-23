/**
 * Rigor primitives (SAN-319 · PR1) — data-provenance UI for Métricas v2.
 *
 * Presentational only — no data wiring. Surfaces (PR3–PR8) compose these so every
 * number carries its provenance: `DataChip` (origin per KPI), `ProvenanceFooter`
 * (panel footer), `ConnectionState` (4-state connection badge), `DataHealthBadge`
 * (clean / known-dirty, links to *Salud de dato*). Style matches `./index.tsx`.
 */
import { cn } from "@/lib/utils";

/** Per-KPI provenance pill: a colour-dot by data `type` + label, tooltip = `source · confidence`. */
export function DataChip({
  type,
  confidence,
  source,
}: {
  type: "real" | "dedup" | "seed" | "target" | "pending";
  confidence?: "alta" | "media" | "baja";
  source?: string;
}) {
  const meta: Record<typeof type, { label: string; dot: string }> = {
    real: { label: "Real", dot: "bg-sage" },
    dedup: { label: "Dedup", dot: "bg-[var(--yellow)]" },
    seed: { label: "Seed", dot: "bg-[var(--sc-fg-muted)]" },
    target: { label: "Target", dot: "bg-[var(--cyan)]" },
    pending: { label: "Pendiente", dot: "bg-destructive" },
  };
  const { label, dot } = meta[type];
  const title = [source, confidence].filter(Boolean).join(" · ") || undefined;
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 rounded-sc-pill border-[1.5px] border-ink bg-card px-2 py-0.5 font-heading text-[10.5px] font-bold text-[var(--sc-ink-soft)]"
    >
      <span aria-hidden="true" className={cn("h-1.5 w-1.5 rounded-full border border-ink", dot)} />
      {label}
    </span>
  );
}

/** Panel footer: provenance line (mono, muted) — shows only the fields it's given. */
export function ProvenanceFooter({
  source,
  route,
  client,
  period,
  lastCollected,
}: {
  source: string;
  route?: string;
  client?: string;
  period?: string;
  lastCollected?: string;
}) {
  const fields: Array<[string, string | undefined]> = [
    ["Fuente", source],
    ["Ruta", route],
    ["Cliente", client],
    ["Periodo", period],
    ["Colectado", lastCollected],
  ];
  return (
    <footer className="mt-2 flex flex-wrap gap-x-2 gap-y-0.5 border-t border-border pt-1.5 font-mono text-[10px] text-[var(--sc-fg-muted)]">
      {fields
        .filter(([, value]) => value)
        .map(([label, value]) => (
          <span key={label}>
            <span className="font-bold">{label}:</span> {value}
          </span>
        ))}
    </footer>
  );
}

/** 4-state connection badge. `connected_pending` = credential present but collector not yet writing. */
export function ConnectionState({
  state,
}: {
  state: "off" | "partial" | "connected_pending" | "collecting";
}) {
  const meta: Record<typeof state, { label: string; glyph: string; cls: string }> = {
    off: { label: "Desconectado", glyph: "🔌", cls: "bg-aged text-[var(--sc-fg-muted)]" },
    partial: { label: "Parcial", glyph: "◐", cls: "bg-[var(--yellow)] text-ink" },
    connected_pending: { label: "Conectado · pendiente", glyph: "◑", cls: "bg-[var(--cyan)] text-white" },
    collecting: { label: "Recolectando", glyph: "✓", cls: "bg-sage text-white" },
  };
  const { label, glyph, cls } = meta[state];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sc-pill border-[1.5px] border-ink px-2 py-0.5 font-heading text-[10.5px] font-bold",
        cls,
      )}
    >
      <span aria-hidden="true">{glyph}</span>
      {label}
    </span>
  );
}

/** Per-source data-health badge: `clean` = inert green pill; `dirty` = red link to *Salud de dato*. */
export function DataHealthBadge({
  source,
  status,
  href = "#salud-de-dato",
}: {
  source: string;
  status: "clean" | "dirty";
  href?: string;
}) {
  const base =
    "inline-flex items-center gap-1 rounded-sc-pill border-[1.5px] border-ink px-2 py-0.5 font-heading text-[10.5px] font-bold";
  if (status === "clean") {
    return (
      <span className={cn(base, "bg-[var(--sc-sage-100)] text-sage")}>
        <span aria-hidden="true">✓</span>
        {source}
      </span>
    );
  }
  return (
    <a href={href} className={cn(base, "bg-[var(--sc-brick-bg)] text-destructive underline")}>
      <span aria-hidden="true">⚠</span>
      {source}
    </a>
  );
}
