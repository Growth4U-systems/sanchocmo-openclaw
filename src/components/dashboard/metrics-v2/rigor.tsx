import { cn } from "@/lib/utils";

export const PILL_BASE =
  "inline-flex items-center gap-1 rounded-sc-pill border-[1.5px] border-ink px-2 py-0.5 font-heading text-[10.5px] font-bold";

function readableSource(value?: string): string {
  if (!value) return "Fuente";
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/\bGa4\b/g, "GA4")
    .replace(/\bGsc\b/g, "GSC")
    .replace(/\bGhl\b/g, "GHL")
    .replace(/\bIa\b/g, "IA");
}

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
    real: { label: "Dato directo", dot: "bg-sage" },
    dedup: { label: "Dato validado", dot: "bg-[var(--yellow)]" },
    seed: { label: "Referencia temporal", dot: "bg-[var(--sc-fg-muted)]" },
    target: { label: "Objetivo", dot: "bg-[var(--cyan)]" },
    pending: { label: "Por conectar", dot: "bg-destructive" },
  };
  const { label, dot } = meta[type];
  const sourceLabel = source ? readableSource(source) : undefined;
  const title = [sourceLabel, label, confidence].filter(Boolean).join(" · ") || undefined;
  return (
    <span
      title={title}
      aria-label={title}
      className="inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center rounded-full border border-ink bg-card align-middle"
    >
      <span aria-hidden="true" className={cn("h-1.5 w-1.5 rounded-full border border-ink", dot)} />
    </span>
  );
}

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
  const details = [
    `Fuente: ${readableSource(source)}`,
    route ? `Ruta: ${route}` : null,
    client ? `Cliente: ${client}` : null,
    period ? `Periodo: ${period}` : null,
    lastCollected ? `Colectado: ${lastCollected}` : null,
  ].filter(Boolean);
  const visible = [
    `Datos: ${readableSource(source)}`,
    period,
    lastCollected ? `actualizado ${lastCollected}` : null,
  ].filter(Boolean);
  return (
    <footer
      className="mt-2 border-t border-border pt-1.5 text-[11px] text-[var(--sc-fg-muted)]"
      title={details.join(" · ")}
    >
      {visible.join(" · ")}
    </footer>
  );
}

export function ConnectionState({
  state,
}: {
  state: "off" | "partial" | "connected_pending" | "collecting";
}) {
  const meta: Record<typeof state, { label: string; glyph: string; cls: string }> = {
    off: { label: "No conectado", glyph: "○", cls: "bg-aged text-[var(--sc-fg-muted)]" },
    partial: { label: "Faltan fuentes", glyph: "◐", cls: "bg-[var(--yellow)] text-ink" },
    connected_pending: { label: "Conectado sin datos", glyph: "◑", cls: "bg-[var(--cyan)] text-white" },
    collecting: { label: "Recolectando", glyph: "✓", cls: "bg-sage text-white" },
  };
  const { label, glyph, cls } = meta[state];
  return (
    <span aria-label={`Conexión: ${label}`} className={cn(PILL_BASE, cls)}>
      <span aria-hidden="true">{glyph}</span>
      {label}
    </span>
  );
}

export function DataHealthBadge({
  source,
  status,
  href = "#salud-de-dato",
}: {
  source: string;
  status: "clean" | "dirty";
  href?: string;
}) {
  if (status === "clean") {
    return null;
  }
  return (
    <a
      href={href}
      aria-label={`${source}: problema de dato`}
      className={cn(PILL_BASE, "bg-[var(--sc-brick-bg)] text-destructive underline")}
    >
      <span aria-hidden="true">⚠</span>
      Revisar dato
    </a>
  );
}
