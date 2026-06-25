/**
 * Funnel contribution (SAN-319) — the ⑦ slot on every surface.
 *
 * Generic + presentational: how a surface feeds the North Star, as a horizontal
 * mini-funnel + a "aporta X de Y → Channels" note. The actual stage←source join is
 * resolved by the wiring; this just renders the chain. Reused across surfaces.
 */
import { Fragment } from "react";

export function FunnelContribution({
  steps,
  note,
  href = "#channels",
  linkLabel = "ver en Channels →",
}: {
  steps: { label: string; value: string }[];
  note?: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <section aria-label="Contribución al embudo" className="mt-4 rounded-sc-md border-2 border-ink bg-card p-4 shadow-pop-xs">
      <div className="flex flex-wrap items-center gap-1.5">
        {steps.map((s, i) => (
          <Fragment key={s.label}>
            <div className="rounded-sc-md border-2 border-ink bg-[var(--sc-paper-3)] px-3 py-2 text-center">
              <div className={"font-heading text-[18px] font-bold " + (i === steps.length - 1 ? "text-rust" : "text-navy")}>{s.value}</div>
              <div className="text-[9px] uppercase tracking-wide text-[var(--sc-fg-muted)]">{s.label}</div>
            </div>
            {i < steps.length - 1 && <span aria-hidden="true" className="font-bold text-rust">→</span>}
          </Fragment>
        ))}
      </div>
      {note && (
        <p className="mt-2 text-[12px] text-[var(--sc-fg-muted)]">
          {note} <a href={href} className="font-heading font-bold text-rust underline">{linkLabel}</a>
        </p>
      )}
    </section>
  );
}
