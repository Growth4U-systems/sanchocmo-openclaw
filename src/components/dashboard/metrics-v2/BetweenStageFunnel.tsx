/**
 * Between-stage funnel (SAN-319 · Conversión) — the cross-source synthesis hero.
 *
 * Pure/presentational: the unified funnel (Sessions → Leads → Cualificados →
 * Reuniones → Deals) with the **% conversion BETWEEN stages** — the leak is the
 * insight. Stages come from the dashboard funnel (each step resolved from its own
 * surface's metric), so this is an amalgam view, not a single source. Flags the
 * worst drops as leaks.
 */
import { DataChip } from "./rigor";

export type FunnelStage = { label: string; value: number };

const fmt = (n: number) => Math.round(n).toLocaleString("es-ES");
const pct = (n: number) => `${(n * 100).toFixed(n < 0.1 ? 1 : 0)}%`;

export function BetweenStageFunnel({ stages, leaks = 2 }: { stages: FunnelStage[]; leaks?: number }) {
  const usable = stages.filter((s) => Number.isFinite(s.value));
  if (usable.length < 2) {
    return (
      <div className="rounded-sc-md border-2 border-ink bg-card p-5 text-[12px] text-[var(--sc-fg-muted)] shadow-pop-xs">
        El embudo unificado aparece cuando las etapas (Leads · Reuniones · Deals…) se resuelven de sus fuentes.
      </div>
    );
  }
  const steps = usable.slice(1).map((s, i) => ({
    from: usable[i],
    to: s,
    rate: usable[i].value > 0 ? s.value / usable[i].value : 0,
  }));
  // leaks = the N lowest between-stage rates, but only ones that are genuinely low
  // (a step converting ≥85% isn't a "fuga" — e.g. a short 100%-through funnel).
  const leakSet = new Set(
    [...steps]
      .sort((a, b) => a.rate - b.rate)
      .slice(0, leaks)
      .filter((s) => s.rate < 0.85)
      .map((s) => s.to.label),
  );
  const overall = usable[0].value > 0 ? usable[usable.length - 1].value / usable[0].value : 0;

  return (
    <section aria-label="Embudo · % entre etapas" className="rounded-sc-md border-2 border-ink bg-card p-4 shadow-pop-xs">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-heading text-[13px] font-bold text-navy">Embudo end-to-end · % entre etapas</h4>
        <span className="text-[11px] text-[var(--sc-fg-muted)]">{fmt(usable[0].value)} → {fmt(usable[usable.length - 1].value)} · global {pct(overall)}</span>
      </div>

      <div className="flex flex-wrap items-stretch gap-1 overflow-x-auto">
        {usable.map((s, i) => {
          const last = i === usable.length - 1;
          const step = steps[i - 1];
          return (
            <div key={s.label} className="flex items-stretch gap-1">
              {i > 0 && step && (
                <div className="flex flex-col items-center justify-center px-1">
                  <span
                    className={
                      "rounded-sc-pill border-[1.5px] border-ink px-2 py-0.5 font-heading text-[11px] font-bold " +
                      (leakSet.has(step.to.label) ? "bg-[var(--sc-brick-bg)] text-destructive" : "bg-card text-[var(--sc-ink-soft)]")
                    }
                    title={`${step.from.label} → ${step.to.label}`}
                  >
                    {pct(step.rate)}
                  </span>
                  <span aria-hidden="true" className="text-[var(--sc-fg-subtle)]">→</span>
                </div>
              )}
              <div
                className={
                  "min-w-[88px] rounded-sc-md border-2 border-ink px-3 py-2 text-center shadow-pop-xs " +
                  (last ? "bg-[var(--sc-sage-100)]" : "bg-[var(--sc-paper-3)]")
                }
              >
                <div className="font-heading text-[20px] font-bold leading-none text-navy">{fmt(s.value)}</div>
                <div className="mt-1 text-[9px] font-bold uppercase tracking-wide text-[var(--sc-fg-muted)]">{s.label}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* leak points */}
      {leakSet.size > 0 && (
        <div className="mt-3 space-y-1.5 border-t border-border pt-2">
          {steps
            .filter((s) => leakSet.has(s.to.label))
            .sort((a, b) => a.rate - b.rate)
            .map((s) => (
              <div key={s.to.label} className="flex items-center gap-2 text-[12px]">
                <span aria-hidden="true" className="text-destructive">●</span>
                <span className="font-semibold">{s.from.label} → {s.to.label}</span>
                <span className="font-heading font-bold text-destructive">{pct(s.rate)}</span>
                <span className="text-[var(--sc-fg-muted)]">— mayor fuga; revisar este paso</span>
              </div>
            ))}
        </div>
      )}

      <div className="mt-2"><DataChip type="real" source="funnel · síntesis" confidence="alta" /></div>
    </section>
  );
}
