import { Panel, Chip } from "@/components/dashboard/metrics-v2";
import { cn } from "@/lib/utils";
import {
  useCollectionSchedule,
  useUpdateCollectionSchedule,
  useMetricsHealth,
  type Cadence,
  type CollectionScheduleItem,
  type SourceHealthItem,
} from "@/hooks/useMetrics";

/**
 * Editable per-source collection cadence + health (SAN-300). Rendered in the
 * Setup view. Each connected source picks daily / 2×week / weekly / custom; the
 * daily "Morning Metrics" cron collects only what's due today.
 */

const CADENCE_LABELS: Record<Cadence, string> = {
  daily: "Diaria",
  twice_weekly: "2×/semana",
  weekly: "Semanal",
  custom: "Custom",
};
const CADENCE_ORDER: Cadence[] = ["daily", "twice_weekly", "weekly", "custom"];

// JS getDay(): 0=Sun … 6=Sat. Shown Monday-first.
const DOW: Array<{ label: string; value: number }> = [
  { label: "L", value: 1 },
  { label: "M", value: 2 },
  { label: "X", value: 3 },
  { label: "J", value: 4 },
  { label: "V", value: 5 },
  { label: "S", value: 6 },
  { label: "D", value: 0 },
];

const SOURCE_LABELS: Record<string, string> = {
  ga4: "Google Analytics 4",
  gsc: "Search Console",
  pagespeed: "PageSpeed",
  trust_score: "Trust Score",
  posthog: "PostHog",
  ghl: "GoHighLevel",
  metricool: "Metricool",
  "meta-ads": "Meta Ads",
  instantly: "Instantly",
  lemlist: "Lemlist",
  explee: "Explee AutoGTM",
};
const sourceLabel = (source: string) => SOURCE_LABELS[source] ?? source;

export function CadencePanel({ slug }: { slug: string }) {
  const { data: sched, isLoading } = useCollectionSchedule(slug);
  const { data: health } = useMetricsHealth(slug);
  const update = useUpdateCollectionSchedule(slug);

  const schedules = sched?.schedules ?? [];
  const healthBySource = new Map<string, SourceHealthItem>((health?.sources ?? []).map((s) => [s.source, s]));

  // Nothing to configure yet (no connected sources, or DB unconfigured).
  if (isLoading || !schedules.length) return null;

  const save = (item: CollectionScheduleItem, patch: Partial<CollectionScheduleItem>) => {
    const next = { ...item, ...patch };
    if ((next.cadence === "weekly" || next.cadence === "twice_weekly") && next.daysOfWeek.length === 0) {
      next.daysOfWeek = [1]; // default to Monday so a weekly source actually runs
    }
    update.mutate({
      source: item.source,
      cadence: next.cadence,
      daysOfWeek: next.daysOfWeek,
      cronExpr: next.cronExpr,
      enabled: next.enabled,
    });
  };

  return (
    <Panel>
      <div className="mb-3 flex items-center gap-2 font-heading text-[15px] font-bold text-navy">
        📆 Cadencia de recogida
        <span className="font-heading text-[12px] font-semibold text-[var(--sc-fg-muted)]">— cada mañana se recoge solo lo que toca hoy</span>
      </div>

      {health?.cron?.degraded && (
        <div className="mb-3 rounded-sc-md border-2 border-ink bg-[#FBE2E2] px-3 py-2 font-heading text-[12px] font-bold text-rust">
          ⚠️ El cron de recogida está degradado{health.cron.reasons.length ? ` (${health.cron.reasons.join(", ")})` : ""}. Avisa a #sancho-pruebas.
        </div>
      )}

      <div className="space-y-1.5">
        {schedules.map((item) => {
          const h = healthBySource.get(item.source);
          const showDow = item.cadence === "weekly" || item.cadence === "twice_weekly";
          return (
            <div
              key={item.source}
              className={cn(
                "flex flex-wrap items-center gap-2.5 rounded-sc-md border-2 border-ink px-2.5 py-1.5 shadow-pop-xs",
                item.enabled ? "bg-card" : "bg-aged opacity-70",
              )}
            >
              <span className="min-w-[130px] flex-1 font-heading text-[13px] font-bold text-navy">{sourceLabel(item.source)}</span>

              <select
                value={item.cadence}
                onChange={(e) => save(item, { cadence: e.target.value as Cadence })}
                className="rounded-sc-md border-2 border-ink bg-card px-2 py-1 font-heading text-[12px] font-bold text-navy shadow-pop-xs"
              >
                {CADENCE_ORDER.map((c) => (
                  <option key={c} value={c}>{CADENCE_LABELS[c]}</option>
                ))}
              </select>

              {showDow && (
                <span className="flex items-center gap-1">
                  {DOW.map((d) => {
                    const on = item.daysOfWeek.includes(d.value);
                    return (
                      <button
                        key={d.value}
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          save(item, {
                            daysOfWeek: on
                              ? item.daysOfWeek.filter((x) => x !== d.value)
                              : [...item.daysOfWeek, d.value].sort((a, b) => a - b),
                          })
                        }
                        className={cn(
                          "h-6 w-6 rounded-sc-md border-2 border-ink font-heading text-[11px] font-bold shadow-pop-xs",
                          on ? "bg-navy text-white" : "bg-card text-[var(--sc-fg-muted)]",
                        )}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </span>
              )}

              {item.cadence === "custom" && (
                <input
                  defaultValue={item.cronExpr ?? ""}
                  placeholder="0 9 * * 1"
                  onBlur={(e) => {
                    const next = e.target.value.trim() || null;
                    if (next !== (item.cronExpr ?? null)) save(item, { cronExpr: next });
                  }}
                  className="w-[110px] rounded-sc-md border-2 border-ink bg-card px-2 py-1 font-mono text-[11px] text-navy shadow-pop-xs"
                />
              )}

              <span className="ml-auto flex items-center gap-1.5">
                {h?.lastStatus === "error" ? (
                  <Chip tone="down">error</Chip>
                ) : h?.overdue ? (
                  <Chip tone="warn">vencida</Chip>
                ) : h?.lastMetricDate ? (
                  <Chip tone="ok">al día</Chip>
                ) : null}
                <span className="text-[10.5px] text-[var(--sc-fg-muted)]">
                  {h?.lastMetricDate ? `últ. ${h.lastMetricDate}` : "sin datos"}
                </span>
              </span>

              <button
                type="button"
                onClick={() => save(item, { enabled: !item.enabled })}
                aria-pressed={item.enabled}
                title={item.enabled ? "Recogida activa" : "Recogida pausada"}
                className={cn(
                  "rounded-sc-pill border-2 border-ink px-2 py-0.5 font-heading text-[10px] font-bold shadow-pop-xs",
                  item.enabled ? "bg-sage text-white" : "bg-card text-[var(--sc-fg-muted)]",
                )}
              >
                {item.enabled ? "ON" : "OFF"}
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-2.5 text-[10.5px] text-[var(--sc-fg-muted)]">
        Diaria = todos los días · Semanal / 2×semana = elige los días · Custom = expresión cron. Por defecto la mayoría es diaria; Trust Score y PageSpeed, semanal.
      </div>
    </Panel>
  );
}
