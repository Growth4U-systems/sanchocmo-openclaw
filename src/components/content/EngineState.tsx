"use client";

import { useEffect, useState, useCallback } from "react";

interface QueueCounts {
  total: number;
  ready: number;
  approved: number;
  pending: number;
  archived: number;
  published: number;
}
interface Kpis {
  publishedThisMonth: number;
  ideasInQueue: QueueCounts;
  approvalRate30d: number;
  antenasActive: number;
  antenasTotal: number;
}
interface ConfigSummary {
  povCount: number;
  pillarsCount: number;
  antenasCount: number;
  povBankCount: number;
}
interface Signal {
  cron: string;
  baseName: string;
  jobId: string;
  enabled: boolean;
  schedule: string;
  lastRunAt: string | null;
  finding: string | null;
  source: string | null;
  count: number | null;
  status: string | null;
}
interface ActivityEvent {
  ts: string;
  type: "publish" | "approve" | "discard" | "edit" | "cron-run" | "idea-created";
  text: string;
  icon?: string;
  accent?: "sage" | "rust" | "navy" | "sun" | "brick";
}
interface StateResponse {
  ok: boolean;
  kpis: Kpis;
  config: ConfigSummary;
  lastSignals: Signal[];
  activity: ActivityEvent[];
  verifiedAt: string;
}

interface Props { slug: string; }

function formatLastRun(iso: string | null): string {
  if (!iso) return "nunca";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const min = Math.floor((Date.now() - d.getTime()) / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `hace ${hr}h`;
  const dys = Math.floor(hr / 24);
  if (dys < 7) return `hace ${dys}d`;
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

function relTime(iso: string): string {
  return formatLastRun(iso);
}

export function EngineState({ slug }: Props) {
  const [data, setData] = useState<StateResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchState = useCallback(async () => {
    try {
      const r = await fetch(`/api/content-engine/state?slug=${slug}`).then((r) => r.json());
      if (r.ok) setData(r);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => { fetchState(); }, [fetchState]);

  if (loading) return <p className="text-center py-8" style={{ color: "var(--sc-fg-muted)" }}>Cargando estado…</p>;
  if (!data) return <p className="text-center py-8" style={{ color: "var(--sc-fg-muted)" }}>No se pudo cargar el estado.</p>;

  const dispatchOn = data.kpis.antenasActive > 0;

  return (
    <div>
      <EngineHeader
        kpis={data.kpis}
        config={data.config}
        verifiedAt={data.verifiedAt}
        healthy={dispatchOn && data.kpis.antenasActive === data.kpis.antenasTotal}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-3.5">
        <LastSignalsCard signals={data.lastSignals} onRefresh={fetchState} />
        <ActivityCard events={data.activity} />
      </div>
    </div>
  );
}

// ── EngineHeader ───────────────────────────────────────────────

function EngineHeader({
  kpis, config, verifiedAt, healthy,
}: {
  kpis: Kpis; config: ConfigSummary; verifiedAt: string; healthy: boolean;
}) {
  const approvalPct = Math.round(kpis.approvalRate30d * 100);
  return (
    <div
      className="rounded-sc-lg overflow-hidden mb-5 border-[3px]"
      style={{
        background: "var(--sc-paper-3)",
        borderColor: "var(--sc-ink)",
        boxShadow: "var(--pop-md)",
      }}
    >
      {/* Línea 1 — estado + 3 cifras inline */}
      <div className="grid grid-cols-[auto_1fr_auto] gap-5 items-center px-5 py-5">
        <span
          className="font-heading uppercase text-[11.5px] tracking-wider px-3 py-1.5 rounded-sc-pill border-2 self-start mt-1.5 inline-flex items-center gap-1.5"
          style={{
            background: healthy ? "var(--sc-sage-100)" : "var(--sc-sun-100)",
            borderColor: "var(--sc-ink)",
            color: "var(--sc-ink)",
          }}
        >
          {healthy ? "✓" : "•"} Motor {healthy ? "ON" : "ATENCIÓN"}
        </span>

        <div className="flex flex-col gap-2.5 min-w-0">
          <div
            className="font-heading text-xl font-extrabold leading-tight"
            style={{ color: "var(--sc-ink)", letterSpacing: "-0.01em" }}
          >
            {healthy ? "Motor rindiendo bien." : "Revisa las antenas."}
          </div>
          <div className="flex gap-7 flex-wrap items-baseline">
            <Stat value={kpis.publishedThisMonth} label="publicados este mes" dot="var(--sc-navy-500)" />
            <Stat value={kpis.ideasInQueue.total} label={`ideas en cola (${kpis.ideasInQueue.ready} ready)`} dot="var(--sc-sun-500)" />
            <Stat value={`${approvalPct}%`} label="aprobación (30d)" dot="var(--sc-sage-500)" />
          </div>
        </div>

        <span className="text-xs whitespace-nowrap self-start mt-1.5" style={{ color: "var(--sc-fg-muted)" }}>
          verificado {relTime(verifiedAt)}
        </span>
      </div>

      {/* Línea 2 — config inline */}
      <div
        className="flex items-center gap-5 px-5 py-2.5 flex-wrap border-t-2"
        style={{ borderColor: "var(--sc-ink)", background: "var(--sc-paper-2)" }}
      >
        <span
          className="font-heading uppercase text-[11px] tracking-widest font-bold"
          style={{ color: "var(--sc-fg-muted)" }}
        >Configurado con</span>
        <ConfigChip icon="🧭" label="POV" value={`${config.povCount} decisiones`} />
        <span style={{ color: "var(--sc-fg-muted)" }}>·</span>
        <ConfigChip icon="🗂" label="Pillars" value={`${config.pillarsCount} temas`} />
        <span style={{ color: "var(--sc-fg-muted)" }}>·</span>
        <ConfigChip icon="📡" label="Antenas" value={`${config.antenasCount} activas`} />
        <span style={{ color: "var(--sc-fg-muted)" }}>·</span>
        <ConfigChip icon="🗃" label="Banco" value={`${config.povBankCount} POVs`} />
      </div>
    </div>
  );
}

function Stat({ value, label, dot }: { value: string | number; label: string; dot: string }) {
  return (
    <span className="flex items-baseline gap-2">
      <span
        className="w-2 h-2 rounded-full border self-center"
        style={{ background: dot, borderColor: "var(--sc-ink)" }}
      />
      <span
        className="font-heading text-[26px] font-extrabold leading-none"
        style={{ color: "var(--sc-ink)", letterSpacing: "-0.02em" }}
      >{value}</span>
      <span className="text-[12.5px]" style={{ color: "var(--sc-fg-muted)" }}>{label}</span>
    </span>
  );
}

function ConfigChip({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-xs">{icon}</span>
      <span
        className="font-heading uppercase text-[12px] tracking-wider font-bold"
        style={{ color: "var(--sc-fg-muted)" }}
      >{label}</span>
      <b className="font-mono text-[12.5px]" style={{ color: "var(--sc-ink)" }}>{value}</b>
    </span>
  );
}

// ── Last signals card ──────────────────────────────────────────

function LastSignalsCard({ signals, onRefresh }: { signals: Signal[]; onRefresh: () => void }) {
  return (
    <div
      className="rounded-sc-lg border-[2.5px] overflow-hidden"
      style={{ background: "var(--sc-paper-3)", borderColor: "var(--sc-ink)", boxShadow: "var(--pop-sm)" }}
    >
      <div
        className="flex items-center gap-2 px-4 py-3 border-b-2"
        style={{ background: "var(--sc-paper-2)", borderColor: "var(--sc-ink)" }}
      >
        <span style={{ color: "var(--sc-rust-500)" }}>📡</span>
        <span className="font-heading uppercase text-[12.5px] tracking-wider font-bold">Antenas de contenido</span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onRefresh}
          className="font-mono text-[10.5px] underline"
          style={{ color: "var(--sc-fg-muted)" }}
          title="Refrescar"
        >refresh ↻</button>
      </div>
      <div>
        {signals.length === 0 ? (
          <div className="p-4 text-xs italic" style={{ color: "var(--sc-fg-muted)" }}>
            Aún no hay antenas configuradas.
          </div>
        ) : signals.map((s) => <SignalRow key={s.jobId} signal={s} />)}
      </div>
    </div>
  );
}

function SignalRow({ signal }: { signal: Signal }) {
  const ok = signal.status !== "error" && signal.status !== "failed";
  return (
    <div
      className="flex gap-3 items-start px-4 py-3 border-b border-dashed"
      style={{ borderColor: "rgba(31,20,16,0.2)" }}
    >
      <span
        className="w-2 h-2 mt-2 rounded-full border flex-shrink-0"
        style={{
          background: ok ? "var(--sc-sage-500)" : "var(--sc-brick-500)",
          borderColor: "var(--sc-ink)",
        }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex gap-2 flex-wrap items-baseline">
          <span className="font-heading text-[13.5px] font-bold" style={{ color: "var(--sc-ink)" }}>
            {signal.baseName}
          </span>
          <span className="font-mono text-[11px]" style={{ color: "var(--sc-fg-muted)" }}>
            {formatLastRun(signal.lastRunAt)}
          </span>
          <span
            className="font-heading uppercase text-[10px] tracking-wider px-1.5 py-0.5 rounded-sc-pill border inline-flex items-center gap-1"
            style={{
              background: ok ? "var(--sc-sage-100)" : "var(--sc-brick-bg)",
              borderColor: ok ? "var(--sc-sage-500)" : "var(--sc-brick-500)",
              color: ok ? "var(--sc-ink)" : "var(--sc-brick-500)",
            }}
          >
            {ok ? "✓" : "✗"} {signal.status || "ok"}
          </span>
        </div>
        {signal.finding ? (
          <div
            className="text-[12.5px] mt-0.5 leading-snug"
            style={{ color: "var(--sc-fg-soft)" }}
            // finding may include <b> tags for emphasis (server-side controlled)
            dangerouslySetInnerHTML={{ __html: signal.finding }}
          />
        ) : (
          <div className="text-[12.5px] mt-0.5 leading-snug">
            <em style={{ color: "var(--sc-fg-subtle)" }}>
              {signal.lastRunAt
                ? "Sin contenido en la última corrida (se rellena cuando la próxima escribe en recurring-tasks)."
                : "Aún no hay corridas registradas."}
            </em>
          </div>
        )}
        <div className="flex gap-2 text-[11px] mt-1" style={{ color: "var(--sc-fg-muted)" }}>
          {signal.source && <span>🌐 {signal.source}</span>}
          {signal.count != null && (
            <>
              <span>·</span>
              <b style={{ color: "var(--sc-rust-500)" }}>{signal.count}</b>
              <span>nuevas señales</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Activity feed ──────────────────────────────────────────────

const ACCENT_BG: Record<NonNullable<ActivityEvent["accent"]>, string> = {
  sage: "var(--sc-sage-100)",
  rust: "var(--sc-rust-100)",
  navy: "rgba(27,44,91,0.12)",
  sun: "var(--sc-sun-100)",
  brick: "var(--sc-brick-bg)",
};
const ACCENT_FG: Record<NonNullable<ActivityEvent["accent"]>, string> = {
  sage: "var(--sc-sage-500)",
  rust: "var(--sc-rust-500)",
  navy: "var(--sc-navy-500)",
  sun: "var(--sc-rust-700)",
  brick: "var(--sc-brick-500)",
};

const ACTIVITY_PAGE_SIZE = 20;

function ActivityCard({ events }: { events: ActivityEvent[] }) {
  const [shown, setShown] = useState(ACTIVITY_PAGE_SIZE);
  const visible = events.slice(0, shown);
  const hasMore = events.length > shown;
  return (
    <div
      className="rounded-sc-lg border-[2.5px] overflow-hidden"
      style={{ background: "var(--sc-paper-3)", borderColor: "var(--sc-ink)", boxShadow: "var(--pop-sm)" }}
    >
      <div
        className="flex items-center gap-2 px-4 py-3 border-b-2"
        style={{ background: "var(--sc-paper-2)", borderColor: "var(--sc-ink)" }}
      >
        <span style={{ color: "var(--sc-rust-500)" }}>⚡</span>
        <span className="font-heading uppercase text-[12.5px] tracking-wider font-bold">Actividad del motor</span>
        <div className="flex-1" />
        <span className="text-xs" style={{ color: "var(--sc-fg-muted)" }}>
          {events.length === 0 ? "—" : `${visible.length} de ${events.length}`}
        </span>
      </div>
      <div>
        {events.length === 0 ? (
          <div className="p-4 text-xs italic" style={{ color: "var(--sc-fg-muted)" }}>
            Sin actividad. (Las aprobaciones por Slack, los envíos del Editorial Dispatch y las ejecuciones de cron aparecerán aquí.)
          </div>
        ) : (
          <>
            {visible.map((e, i) => (
              <ActivityItem key={i} event={e} />
            ))}
            {hasMore && (
              <div className="p-3 flex justify-center" style={{ borderTop: "1px dashed rgba(31,20,16,0.15)" }}>
                <button
                  type="button"
                  onClick={() => setShown((s) => s + ACTIVITY_PAGE_SIZE)}
                  className="font-heading uppercase text-[11px] tracking-wider px-3 py-1.5 rounded-sc-pill border-2 sc-pop-hover"
                  style={{ background: "var(--sc-paper-2)", borderColor: "var(--sc-ink)", color: "var(--sc-ink)", boxShadow: "var(--pop-xs)" }}
                >
                  Mostrar más ({events.length - shown})
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ActivityItem({ event }: { event: ActivityEvent }) {
  const accent = event.accent || "navy";
  return (
    <div
      className="flex gap-2.5 items-start px-3 py-2.5 border-b border-dashed"
      style={{ borderColor: "rgba(31,20,16,0.15)" }}
    >
      <span
        className="font-heading uppercase text-[10px] tracking-wider px-1.5 py-1 rounded-sc-pill border inline-flex items-center"
        style={{
          background: ACCENT_BG[accent],
          color: ACCENT_FG[accent],
          borderColor: ACCENT_FG[accent],
        }}
      >{event.icon || "•"}</span>
      <span
        className="text-[12.5px] flex-1 leading-snug"
        style={{ color: "var(--sc-ink)" }}
        // Activity log entries use <b>...</b> for emphasis. Content is server-controlled
        // (written by integrations/slack/interactivity.ts and send-dispatch.ts).
        dangerouslySetInnerHTML={{ __html: event.text }}
      />
      <span
        className="font-mono text-[10.5px] flex-shrink-0"
        style={{ color: "var(--sc-fg-muted)" }}
      >{relTime(event.ts)}</span>
    </div>
  );
}
