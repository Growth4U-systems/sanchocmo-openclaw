/**
 * DataQualityInsight (SAN-319 · PR8 component) — an instrumentation-quality callout
 * for the *Salud de dato* view.
 *
 * Presentational only. The view feeds these from `getMetricsHealth()` (GHL event
 * provider anomalies, missing instrumentation, connected≠collected). Surfaces never
 * render quality insights themselves — they only link here via `DataHealthBadge`.
 * Style matches `./index.tsx`.
 */
import { cn } from "@/lib/utils";
import { Chip } from "./index";

export function DataQualityInsight({
  title,
  body,
  severity,
  owner,
}: {
  title: string;
  body: string;
  severity: "high" | "warn";
  /** Who owns the fix (the surface/source responsible), e.g. "Pipeline · GHL". */
  owner?: string;
}) {
  const meta = {
    high: { label: "Crítico", accent: "border-l-destructive", tone: "must" as const, glyph: "⚠" },
    warn: { label: "Aviso", accent: "border-l-[var(--yellow)]", tone: "warn" as const, glyph: "△" },
  };
  const { label, accent, tone, glyph } = meta[severity];

  return (
    <div
      role="note"
      className={cn(
        "rounded-sc-md border-2 border-l-[6px] border-ink bg-card p-3 shadow-pop-xs",
        accent,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone={tone}>
          <span aria-hidden="true">{glyph}</span> {label}
        </Chip>
        <h4 className="font-heading text-[13px] font-bold text-navy">{title}</h4>
      </div>
      <p className="mt-1.5 text-[12px] leading-snug text-[var(--sc-ink-soft)]">{body}</p>
      {owner && (
        <p className="mt-1.5 font-mono text-[10px] text-[var(--sc-fg-muted)]">
          <span className="font-bold">Dueño:</span> {owner}
        </p>
      )}
    </div>
  );
}
