"use client";

/**
 * ChannelLoopCard (SAN-141) — one channel rendered as its 5-stage loop:
 * antennas → ideation → creation → published → metrics. Every stage is a
 * drill-down into the existing views (Ideas/Calendar/Setup or a slide-over),
 * pre-filtered by this channel. Inactive channels render locked with an
 * "Activar" CTA into Setup.
 */

import { cn } from "@/lib/utils";
import type { ChannelLoopState } from "@/types";

export const CHANNEL_EMOJI: Record<string, string> = {
  linkedin: "💼",
  twitter: "🐦",
  x: "🐦",
  blog: "📝",
  instagram: "📸",
  newsletter: "📧",
  tiktok: "🎵",
  youtube: "▶️",
};

export type LoopStageKey = "antennas" | "ideation" | "creation" | "published" | "metrics";

interface StageDef {
  key: LoopStageKey;
  icon: string;
  label: string;
}

function stageDefs(channel: string): StageDef[] {
  // Blog speaks search (keywords → plan → artículos); social speaks signals.
  if (channel === "blog") {
    return [
      { key: "antennas", icon: "📡", label: "Keywords" },
      { key: "ideation", icon: "💡", label: "Plan" },
      { key: "creation", icon: "✍️", label: "Artículos" },
      { key: "published", icon: "🚀", label: "Publicado" },
      { key: "metrics", icon: "📊", label: "Métricas" },
    ];
  }
  return [
    { key: "antennas", icon: "📡", label: "Antenas" },
    { key: "ideation", icon: "💡", label: "Ideación" },
    { key: "creation", icon: "✍️", label: "Creación" },
    { key: "published", icon: "🚀", label: "Publicado" },
    { key: "metrics", icon: "📊", label: "Métricas" },
  ];
}

function relTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const min = Math.floor((Date.now() - d.getTime()) / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `hace ${hr}h`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `hace ${days}d`;
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

type DotState = "run" | "ok" | "warn" | "off";

const DOT_CLASS: Record<DotState, string> = {
  run: "bg-[var(--sc-navy-500,#1E3A5F)] animate-pulse",
  ok: "bg-sage",
  warn: "bg-yellow-400",
  off: "bg-border",
};

interface StageTileProps {
  def: StageDef;
  big: string;
  meta: string;
  dot: DotState;
  warn?: string | null;
  onClick: () => void;
}

function StageTile({ def, big, meta, dot, warn, onClick }: StageTileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left border-[2.5px] border-ink rounded-lg bg-card p-2.5 min-h-[104px] relative transition-all hover:-translate-y-0.5 hover:shadow-comic"
      style={{ boxShadow: "var(--pop-xs)" }}
    >
      <span className={cn("absolute top-2 right-2 w-2.5 h-2.5 rounded-full border-2 border-ink", DOT_CLASS[dot])} />
      <p className="text-[12px] font-bold text-ink flex items-center gap-1 mb-1.5">
        <span>{def.icon}</span> {def.label}
      </p>
      <p className="font-heading text-[22px] font-bold leading-none text-navy">{big}</p>
      <p className="text-[11px] text-muted-foreground mt-1 leading-snug whitespace-pre-line">{meta}</p>
      {warn && (
        <span className="inline-block mt-1 text-[10px] font-bold border-2 border-ink rounded px-1.5 bg-yellow-400/70 text-ink">
          ⚠ {warn}
        </span>
      )}
    </button>
  );
}

interface Props {
  loop: ChannelLoopState;
  onStageClick: (stage: LoopStageKey) => void;
  onNextAction: () => void;
  onOpenSetup: () => void;
  onOpenStrategy: () => void;
}

export function ChannelLoopCard({ loop, onStageClick, onNextAction, onOpenSetup, onOpenStrategy }: Props) {
  const emoji = CHANNEL_EMOJI[loop.channel] || "📄";
  const defs = stageDefs(loop.channel);
  const s = loop.stages;

  if (!loop.active) {
    return (
      <section className="border-[3px] border-ink rounded-lg bg-muted/40 p-5 opacity-90" style={{ boxShadow: "var(--pop-sm)" }}>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-2xl grayscale">{emoji}</span>
          <div className="flex-1 min-w-[180px]">
            <h3 className="font-heading text-lg text-ink">{loop.label}</h3>
            <p className="text-xs text-muted-foreground">Canal no activado — Sancho puede prepararte estrategia y cadencia.</p>
          </div>
          <span className="text-[11px] font-bold uppercase tracking-wider border-2 border-destructive text-destructive rounded px-2 py-0.5 -rotate-3">
            No activado
          </span>
          <button
            type="button"
            onClick={onOpenSetup}
            className="px-3 py-1.5 text-sm font-semibold border-2 border-ink rounded-lg bg-card hover:-translate-y-0.5 hover:shadow-comic transition-all"
          >
            Activar →
          </button>
        </div>
      </section>
    );
  }

  // ── stage display values ──────────────────────────────────────
  const antennasBig = `${s.antennas.enabled}/${s.antennas.total}`;
  const antennasMeta = [
    "antenas activas",
    relTime(s.antennas.lastRunAt) ? `última: ${relTime(s.antennas.lastRunAt)}` : "sin ejecuciones",
  ].join("\n");
  const antennasDot: DotState = s.antennas.hasError ? "warn" : s.antennas.enabled > 0 ? "run" : "off";

  const ideationMeta = `nuevas · ${s.ideation.approvedCount} aprobada${s.ideation.approvedCount !== 1 ? "s" : ""}`;
  const creationTotal = s.creation.draftingCount + s.creation.pendingMediaCount + s.creation.readyCount;
  const creationMeta = [
    `${s.creation.draftingCount} en redacción`,
    s.creation.pendingMediaCount ? `${s.creation.pendingMediaCount} media` : null,
    s.creation.readyCount ? `${s.creation.readyCount} lista${s.creation.readyCount !== 1 ? "s" : ""}` : null,
  ].filter(Boolean).join(" · ");

  const publishedMeta = [
    "este mes",
    loop.mode === "always-on"
      ? "ritmo diario"
      : s.published.nextSlot ? `próx: ${s.published.nextSlot}` : null,
  ].filter(Boolean).join("\n");

  const gscPending = loop.metricsProvider === "gsc-pending";
  const gscLive = loop.metricsProvider === "gsc" ? s.metrics.gsc : null;
  const metricsBig = gscPending
    ? "⏳"
    : gscLive
      ? String(gscLive.clicks30d)
      : loop.metricsProvider === "gsc"
        ? "—"
        : s.metrics.engagementPct !== null ? `${s.metrics.engagementPct}%` : "—";
  const metricsMeta = gscPending
    ? "GSC pendiente de\nintegrar — sin datos inventados"
    : gscLive
      ? `clicks · ${gscLive.impressions30d} impr · 30d${gscLive.avgPosition !== null ? `\npos media ${gscLive.avgPosition}` : ""}`
      : loop.metricsProvider === "gsc"
        ? "GSC conectado —\nesperando primeros datos"
        : s.metrics.engagementPct !== null
          ? `engagement medio\n${s.metrics.impressions30d ?? 0} impresiones · 30d`
          : "sin snapshots aún";
  const metricsDot: DotState = gscPending
    ? "warn"
    : gscLive
      ? "ok"
      : loop.metricsProvider === "gsc"
        ? "run"
        : s.metrics.postsWithMetrics > 0 ? "ok" : "off";

  return (
    <section className="border-[3px] border-ink rounded-lg bg-card overflow-hidden" style={{ boxShadow: "var(--pop-md)" }}>
      {/* Header */}
      <header className="flex items-center gap-3 flex-wrap px-4 py-3 border-b-[2.5px] border-ink" style={{ background: "var(--sc-paper-2)" }}>
        <span className="text-2xl">{emoji}</span>
        <div className="flex-1 min-w-[180px]">
          <h3 className="font-heading text-lg text-ink leading-tight">{loop.label}</h3>
          <p className="text-[11px] text-muted-foreground">
            {loop.channel}
            {" · "}
            {loop.strategyDocExists ? (
              <button type="button" onClick={onOpenStrategy} className="underline text-rust hover:opacity-80">
                estrategia del canal
              </button>
            ) : (
              <button type="button" onClick={onOpenSetup} className="underline text-destructive hover:opacity-80">
                ⚠ sin estrategia de canal — crear en Setup
              </button>
            )}
          </p>
        </div>
        <span className={cn(
          "text-[11px] font-bold uppercase tracking-wider rounded-full border-2 border-ink px-2.5 py-0.5",
          loop.mode === "always-on" ? "bg-navy text-white" : "bg-sage text-white"
        )}>
          {loop.mode === "always-on" ? "🔁 Always-on" : "● Activo"}
        </span>
        {loop.cadence.frequency && (
          <span className="text-[11px] font-semibold rounded-full border-2 border-ink px-2.5 py-0.5 bg-card">
            {loop.cadence.frequency}
          </span>
        )}
        <button
          type="button"
          onClick={onOpenSetup}
          className="px-2.5 py-1 text-xs font-semibold border-2 border-ink rounded-lg bg-card hover:-translate-y-0.5 hover:shadow-comic transition-all"
          title="Configuración del canal (Setup)"
        >
          ⚙️ Canal
        </button>
      </header>

      {/* Loop stages */}
      <div className="grid items-stretch gap-0 px-4 pt-4 pb-1 grid-cols-1 md:[grid-template-columns:1fr_22px_1fr_22px_1fr_22px_1fr_22px_1fr]">
        {defs.map((def, i) => {
          const tile = (() => {
            switch (def.key) {
              case "antennas":
                return <StageTile key={def.key} def={def} big={antennasBig} meta={antennasMeta} dot={antennasDot} onClick={() => onStageClick("antennas")} />;
              case "ideation":
                return <StageTile key={def.key} def={def} big={String(s.ideation.newCount)} meta={ideationMeta} dot={s.ideation.newCount > 0 ? "run" : "ok"} onClick={() => onStageClick("ideation")} />;
              case "creation":
                return (
                  <StageTile
                    key={def.key}
                    def={def}
                    big={String(creationTotal)}
                    meta={creationMeta || "nada en curso"}
                    dot={s.creation.clarifyCount > 0 ? "warn" : creationTotal > 0 ? "run" : "off"}
                    warn={s.creation.clarifyCount > 0 ? `${s.creation.clarifyCount} clarify pendiente${s.creation.clarifyCount > 1 ? "s" : ""}` : null}
                    onClick={() => onStageClick("creation")}
                  />
                );
              case "published":
                return <StageTile key={def.key} def={def} big={String(s.published.thisMonth)} meta={publishedMeta} dot={s.published.thisMonth > 0 ? "ok" : "off"} onClick={() => onStageClick("published")} />;
              case "metrics":
                return <StageTile key={def.key} def={def} big={metricsBig} meta={metricsMeta} dot={metricsDot} onClick={() => onStageClick("metrics")} />;
            }
          })();
          return (
            <div key={def.key} className="contents">
              {tile}
              {i < defs.length - 1 && (
                <span className="hidden md:grid place-items-center text-ink font-black select-none">▶</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Intelligence return line — the loop closes manually for now */}
      <div className="flex items-center gap-2 mx-4 px-2 py-1 text-[11px] italic text-muted-foreground">
        <span className="flex-1 border-b-2 border-dashed border-ink/30 relative">
          <span className="absolute -left-1 -top-2 text-[10px] text-ink/40">◀</span>
        </span>
        🧠 Intelligence: lo aprendido vuelve a las antenas <em>(manual por ahora)</em>
      </div>

      {/* Footer */}
      <footer className="flex items-center gap-3 flex-wrap px-4 pb-4 pt-2">
        {loop.nextAction ? (
          <button
            type="button"
            onClick={onNextAction}
            className="flex-1 min-w-[240px] flex items-center gap-2 text-left border-[2.5px] border-ink rounded-lg px-3 py-2 text-sm font-semibold bg-yellow-400/20 hover:-translate-y-0.5 hover:shadow-comic transition-all"
          >
            ⚡ <span className="flex-1"><b>Próxima acción:</b> {loop.nextAction.label}</span>
            <span className="font-heading text-rust whitespace-nowrap">IR →</span>
          </button>
        ) : (
          <span className="flex-1 min-w-[240px] text-sm text-muted-foreground px-1">
            ✓ Sin pendientes — el motor sigue buscando señales
          </span>
        )}
        {(loop.repurposing.incoming > 0 || loop.repurposing.outgoing > 0) && (
          <span className="text-[12px] font-semibold border-2 border-ink rounded-full px-2.5 py-1 bg-sage/15" title="Piezas derivadas con content-atomizer">
            ♻️ {loop.repurposing.outgoing} → · ← {loop.repurposing.incoming}
          </span>
        )}
      </footer>
    </section>
  );
}
