/**
 * Product surface — PostHog funnel by unique users (SAN-319 · PR5).
 *
 * Pure/presentational: the parent (`renderModuleContent` in `metrics.tsx`) parses the
 * PostHog `funnel_step_reached` rows into ordered steps and passes them in. Surfaces
 * read ONLY their own source — PostHog here — so every frontend step is `Real`
 * (PostHog observes the event directly). The real cita and the pago are NOT computed
 * here (they're Koibox / Stripe, joined in the Atribución view, PR7); the surface
 * never fabricates a "booked"/appointment step, it cross-links instead.
 */
import { DataChip, DataHealthBadge } from "./rigor";

export function ProductFunnel({
  steps,
  pageviews,
  activationEvents,
  recordings,
  posthogDirty = false,
  dirtyReason,
  attributionHref = "#conversion",
}: {
  steps: { step: string; reached: number; dropoff: number }[];
  pageviews?: number | null;
  activationEvents?: number | null;
  recordings?: number | null;
  posthogDirty?: boolean;
  dirtyReason?: string;
  attributionHref?: string;
}) {
  const top = steps[0]?.reached || 1;
  const kpis = ([
    { label: "Pageviews", value: pageviews },
    { label: "Activación", value: activationEvents },
    { label: "Grabaciones", value: recordings },
  ] as const).filter((k) => k.value != null);
  return (
    <>
      {kpis.length > 0 && (
        <div className="flex flex-wrap gap-4">
          {kpis.map((k) => (
            <div key={k.label} className="min-w-[70px] text-center">
              <div className="font-heading text-[22px] font-bold text-navy">{(k.value as number).toLocaleString()}</div>
              <div className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{k.label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 space-y-1.5">
        {steps.map((s, i) => (
          <div key={`${s.step}-${i}`}>
            <div className="flex items-center justify-between text-[12px]">
              <span className="font-heading font-bold text-navy">{s.step}</span>
              <span className="font-heading font-bold">
                {s.reached.toLocaleString()}
                {i > 0 && s.dropoff > 0 && (
                  <span className="ml-2 text-[11px] font-semibold text-destructive">-{s.dropoff.toLocaleString()}</span>
                )}
              </span>
            </div>
            <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-navy" style={{ width: `${Math.round((s.reached / top) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px] text-[var(--sc-fg-muted)]">
        <DataChip type="real" source="PostHog" confidence="alta" />
        <span>funnel por personas únicas — eventos frontend que PostHog observa directo</span>
        <span title={dirtyReason}>
          <DataHealthBadge source="posthog" status={posthogDirty ? "dirty" : "clean"} />
        </span>
        <a href={attributionHref} className="font-heading font-bold text-rust underline">
          → la cita y el pago (real) viven en Conversión/Atribución
        </a>
      </div>
    </>
  );
}
