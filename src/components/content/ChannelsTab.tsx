"use client";

/**
 * ChannelsTab (SAN-141) — the 📡 Canales home of Content Creation.
 *
 * One ChannelLoopCard per channel declared in cadence-config.yml, plus a
 * two-column footer with the cross-channel pieces: repurposing lineage and
 * the activity feed (which used to live inside Engine → Estado del motor).
 * Stage clicks drill down into Ideas/Calendar pre-filtered by channel, or
 * open the per-channel antennas / metrics slide-overs.
 */

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useChannelLoops } from "@/hooks/useChannelLoops";
import { ChannelLoopCard, CHANNEL_EMOJI, type LoopStageKey } from "@/components/content/ChannelLoopCard";
import { SlideOver } from "@/components/shared/slide-over";
import { DocSlideOver } from "@/components/shared/doc-slideover";
import { KpiCard } from "@/components/shared/kpi-card";
import { ReconcileBar } from "@/components/content/ReconcileBar";
import { FounderLedSection } from "@/components/content/FounderLedSection";
import { buildDocThread, type ThreadConfig } from "@/lib/chat-openers";
import { getTaskSetEntry } from "@/lib/data/task-blueprints";
import type { ChannelLoopState } from "@/types";

interface ActivityEvent {
  ts: string;
  type: string;
  text: string;
  icon?: string;
}

interface Props {
  slug: string;
  onGo: (
    tab: "ideas" | "calendar" | "setup",
    channel?: string,
    focusStatus?: string,
    extra?: { author?: string; unassigned?: boolean },
  ) => void;
  openChat: (slug: string, config: ThreadConfig) => void;
}

function relTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const min = Math.floor((Date.now() - d.getTime()) / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `hace ${hr}h`;
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

const REPURPOSE_STATUS_LABEL: Record<string, string> = {
  New: "idea nueva",
  Approved: "aprobada",
  Draft: "borrador",
  "Pending Media": "media",
  Ready: "lista",
  Published: "publicada",
};

/** Personal-voice networks that collapse into the unified Founder-Led section. */
const FOUNDER_LED_CHANNELS = new Set(["linkedin", "twitter", "x"]);

export function ChannelsTab({ slug, onGo, openChat }: Props) {
  const { data, isLoading, isError, error, refetch } = useChannelLoops(slug);
  const [antennasFor, setAntennasFor] = useState<ChannelLoopState | null>(null);
  const [metricsFor, setMetricsFor] = useState<ChannelLoopState | null>(null);
  const [docPath, setDocPath] = useState<string | null>(null);
  const [runningCron, setRunningCron] = useState<string | null>(null);

  // Activity feed shares the Engine state endpoint — the feed moved here when
  // the Engine tab was dissolved (SAN-141), the data source didn't change.
  const activityQ = useQuery<{ activity: ActivityEvent[] }>({
    queryKey: ["content-engine-state-activity", slug],
    queryFn: async () => {
      const res = await fetch(`/api/content-engine/state?slug=${slug}`);
      if (!res.ok) throw new Error("Failed to load activity");
      return res.json();
    },
    enabled: !!slug,
    staleTime: 30_000,
  });

  const runCron = async (jobId: string | null) => {
    if (!jobId) return;
    setRunningCron(jobId);
    try {
      await fetch("/api/content-engine/crons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, action: "run" }),
      });
    } finally {
      setTimeout(() => setRunningCron(null), 4000);
    }
  };

  const handleStage = (loop: ChannelLoopState, stage: LoopStageKey) => {
    switch (stage) {
      case "antennas": return setAntennasFor(loop);
      case "ideation": return onGo("ideas", loop.channel, "New");
      case "creation": return onGo("ideas", loop.channel);
      case "published": return onGo("calendar", loop.channel);
      case "metrics": return setMetricsFor(loop);
    }
  };

  // "+ Añadir voz" — instantiate the founder-led-voice on-demand entry from the
  // pillar-manifest (skill + owner agent come from there, never hardcoded), then
  // open its chat. Mirrors SetupTab.createChannelStrategy.
  const addVoice = () => {
    const entry = getTaskSetEntry("content", "founder-led-voice");
    const cfg = buildDocThread(slug, {
      key: "founder-led-voice",
      name: entry?.name ?? "Añadir voz founder-led",
      skill: entry?.skill ?? "founder-led-setup",
      channel: "strategy",
      status: "pending",
    });
    if (entry?.agent) cfg.agent = entry.agent;
    cfg.initialMessage =
      "Añade una voz founder-led: dime quién es, en qué red (LinkedIn o X), su handle, la cadencia y la cuenta de publicación (Metricool). Una voz = una persona en una red.";
    openChat(slug, cfg);
  };

  if (isError) {
    return (
      <div className="border-[3px] border-destructive rounded-lg bg-destructive/5 p-5 text-center" style={{ boxShadow: "var(--pop-sm)" }}>
        <p className="font-bold text-sm text-destructive mb-1">No se pudieron cargar los canales.</p>
        <p className="text-xs text-muted-foreground mb-3">
          {error instanceof Error ? error.message : "Error inesperado al leer Content Creation."}
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          className="px-4 py-2 text-sm font-semibold border-2 border-ink rounded-lg bg-card hover:-translate-y-0.5 hover:shadow-comic transition-all"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (isLoading || !data) {
    return <p className="text-muted-foreground text-sm py-8 text-center">Cargando canales…</p>;
  }

  const channels = Array.isArray(data.channels) ? data.channels : [];
  const repurposing = Array.isArray(data.repurposing)
    ? data.repurposing.map((entry) => ({
        fromChannel: typeof entry?.fromChannel === "string" ? entry.fromChannel : "",
        fromTitle: typeof entry?.fromTitle === "string" ? entry.fromTitle : "",
        toChannel: typeof entry?.toChannel === "string" ? entry.toChannel : "",
        toTitle: typeof entry?.toTitle === "string" ? entry.toTitle : "",
        toStatus: typeof entry?.toStatus === "string" ? entry.toStatus : "",
        toId: typeof entry?.toId === "string" ? entry.toId : "",
      }))
    : [];
  // Founder-led networks collapse into ONE unified "Founder-Led Content"
  // section — keyed by network (not by "has voices") so the section + its
  // "+ Añadir voz" CTA show even before the first voice exists. Inactive
  // networks fall back to standalone cards (so their "Activar" flow still works).
  const founderLed = channels.filter((c) => c.active && FOUNDER_LED_CHANNELS.has(c.channel));
  const standalone = channels.filter((c) => !(c.active && FOUNDER_LED_CHANNELS.has(c.channel)));
  const activity = Array.isArray(activityQ.data?.activity)
    ? activityQ.data.activity.map((event) => {
        const e = event as Partial<ActivityEvent>;
        return {
          ts: typeof e.ts === "string" ? e.ts : null,
          type: typeof e.type === "string" ? e.type : "event",
          text: typeof e.text === "string" ? e.text : "",
          icon: typeof e.icon === "string" ? e.icon : "",
        };
      })
    : [];

  return (
    <div className="space-y-5">
      {channels.length > 0 && <ReconcileBar slug={slug} />}

      {channels.length === 0 && (
        <div className="text-center py-12">
          <span className="text-4xl mb-3 block">📡</span>
          <p className="text-sm text-muted-foreground mb-2">
            Sin canales configurados todavía — define la cadencia en ⚙️ Setup para activar el primero.
          </p>
          <button
            type="button"
            onClick={() => onGo("setup")}
            className="px-4 py-2 text-sm font-semibold border-2 border-ink rounded-lg bg-card hover:-translate-y-0.5 hover:shadow-comic transition-all"
          >
            Abrir Setup →
          </button>
        </div>
      )}

      {founderLed.length > 0 && (
        <FounderLedSection
          slug={slug}
          channels={founderLed}
          onGo={onGo}
          onAddVoice={addVoice}
          onOpenStrategy={(doc) => setDocPath(`brand/${slug}/${doc}`)}
          onOpenSetup={(channel) => onGo("setup", channel)}
        />
      )}

      {standalone.map((loop) => (
        <ChannelLoopCard
          key={loop.channel}
          loop={loop}
          onStageClick={(stage) => handleStage(loop, stage)}
          onNextAction={() => {
            const na = loop.nextAction;
            if (!na) return;
            onGo(na.tab, loop.channel, na.focusStatus);
          }}
          onOpenSetup={() => onGo("setup", loop.channel)}
          onOpenStrategy={() => loop.strategyDoc && setDocPath(`brand/${slug}/${loop.strategyDoc}`)}
          onPersonaClick={(personaId) => onGo("ideas", loop.channel, undefined, { author: personaId })}
          onPoolClick={() => onGo("ideas", loop.channel, undefined, { unassigned: true })}
        />
      ))}

      {/* Footer: repurposing + cross-channel activity */}
      {channels.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr] items-start">
          <section className="border-[3px] border-ink rounded-lg bg-muted/30 p-4" style={{ boxShadow: "var(--pop-sm)" }}>
            <h3 className="font-bold text-sm mb-2">♻️ Repurposing reciente — una pieza, varios canales</h3>
            {repurposing.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                Aún no hay piezas derivadas. En una pieza publicada (tab Ideas → Abrir draft) usa
                &ldquo;♻️ Convertir a…&rdquo; para que content-atomizer la adapte a otro canal.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {repurposing.map((r) => (
                  <li key={r.toId} className="flex items-center gap-2 flex-wrap text-[13px] border-b border-dashed border-ink/15 pb-1.5 last:border-0">
                    <span className="font-semibold border-2 border-ink rounded px-2 py-0.5 bg-card">
                      {CHANNEL_EMOJI[r.fromChannel] || "📄"} {r.fromTitle.slice(0, 42)}{r.fromTitle.length > 42 ? "…" : ""}
                    </span>
                    <span className="text-rust font-black">──▶</span>
                    <button
                      type="button"
                      onClick={() => onGo("ideas", r.toChannel)}
                      className="font-semibold border-2 border-ink rounded px-2 py-0.5 bg-card hover:-translate-y-0.5 transition-all"
                    >
                      {CHANNEL_EMOJI[r.toChannel] || "📄"} {r.toTitle.slice(0, 42)}{r.toTitle.length > 42 ? "…" : ""}
                    </button>
                    <span className="text-[11px] text-muted-foreground">
                      {REPURPOSE_STATUS_LABEL[r.toStatus] || r.toStatus}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="border-[3px] border-ink rounded-lg bg-card p-4" style={{ boxShadow: "var(--pop-sm)" }}>
            <h3 className="font-bold text-sm mb-2">🗞 Actividad — todos los canales</h3>
            {activity.slice(0, 7).map((e, i) => (
              <p key={`${e.ts}-${i}`} className="text-[12px] py-1 border-b border-dashed border-ink/15 last:border-0 flex gap-2">
                <span className="text-muted-foreground whitespace-nowrap min-w-[64px]">{relTime(e.ts)}</span>
                {/* activity text can carry <b> markers from the engine state endpoint */}
                <span className="flex-1" dangerouslySetInnerHTML={{ __html: `${e.icon || ""} ${e.text}` }} />
              </p>
            ))}
            {activity.length === 0 && (
              <p className="text-xs text-muted-foreground italic">Sin actividad reciente.</p>
            )}
          </section>
        </div>
      )}

      {/* ── Antennas slide-over (per channel) ── */}
      <SlideOver
        open={!!antennasFor}
        onClose={() => setAntennasFor(null)}
        title={antennasFor ? `📡 Antenas · ${CHANNEL_EMOJI[antennasFor.channel] || ""} ${antennasFor.label}` : ""}
      >
        {antennasFor && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Cada canal escucha cosas distintas — estas antenas alimentan solo la ideación de{" "}
              <b>{antennasFor.label}</b>. Su definición (prompts, perfiles, keywords, PAA) se edita en ⚙️ Setup.
            </p>
            {antennasFor.antennas.map((a) => (
              <div key={a.baseName} className="border-2 border-ink rounded-lg p-3 bg-card flex items-start gap-3">
                <span className={a.enabled ? "text-sage font-black" : "text-muted-foreground"}>●</span>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm">{a.baseName}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {a.schedule || "sin programar"} · última: {relTime(a.lastRunAt)}
                    {a.count !== null && <> · {a.count} señales</>}
                    {a.status === "error" && <span className="text-destructive font-bold"> · ⚠ error</span>}
                  </p>
                  {a.finding && (
                    <p className="text-[12px] mt-1 leading-snug" dangerouslySetInnerHTML={{ __html: a.finding }} />
                  )}
                </div>
                <button
                  type="button"
                  disabled={!a.jobId || runningCron === a.jobId}
                  onClick={() => runCron(a.jobId)}
                  className="px-2 py-1 text-xs font-semibold border-2 border-ink rounded bg-card hover:-translate-y-0.5 transition-all disabled:opacity-40"
                  title="Ejecutar ahora"
                >
                  {runningCron === a.jobId ? "⏳" : "▶"}
                </button>
              </div>
            ))}
            {antennasFor.antennas.every((a) => !a.jobId) && (
              <div className="border-2 border-dashed border-border rounded-lg p-3 text-xs text-muted-foreground text-center">
                Las antenas de esta marca aún no están registradas como crons — se crean con el
                setup del Content Engine. Hasta entonces este canal no recibe señales automáticas.
              </div>
            )}
            <button
              type="button"
              onClick={() => { const ch = antennasFor.channel; setAntennasFor(null); onGo("setup", ch); }}
              className="w-full px-3 py-2 text-sm font-semibold border-2 border-ink rounded-lg bg-yellow-400/30 hover:-translate-y-0.5 hover:shadow-comic transition-all"
            >
              ✏️ Editar definición de antenas (Setup)
            </button>
          </div>
        )}
      </SlideOver>

      {/* ── Metrics slide-over (per channel) ── */}
      <SlideOver
        open={!!metricsFor}
        onClose={() => setMetricsFor(null)}
        title={metricsFor ? `📊 Métricas · ${CHANNEL_EMOJI[metricsFor.channel] || ""} ${metricsFor.label}` : ""}
      >
        {metricsFor && (
          <div className="space-y-4">
            {metricsFor.metricsProvider === "gsc-pending" ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <KpiCard value={metricsFor.stages.published.thisMonth} label="publicados este mes" status="good" />
                  <KpiCard value="⏳" label="GSC pendiente" status="warn" />
                </div>
                <div className="border-2 border-ink rounded-lg p-3 bg-yellow-400/15 text-sm">
                  <b>Google Search Console sin conectar.</b> Cuando se integre verás impresiones de
                  búsqueda, clicks y posición media. Hasta entonces no se muestran datos
                  inventados — solo producción.
                </div>
                <Link
                  href={`/dashboard/${slug}/settings?tab=apis`}
                  className="block w-full text-center px-3 py-2 text-sm font-semibold border-2 border-ink rounded-lg bg-yellow-400/30 hover:-translate-y-0.5 hover:shadow-comic transition-all no-underline text-ink"
                >
                  🔌 Conectar Search Console (Ajustes → APIs)
                </Link>
                <p className="text-xs text-muted-foreground italic">
                  El loop SEO se mide distinto al social: tarda semanas en dar señal. Por eso este
                  canal es always-on — la constancia es la métrica intermedia.
                </p>
              </>
            ) : metricsFor.metricsProvider === "gsc" ? (
              (() => {
                const g = metricsFor.stages.metrics.gsc;
                const delta = (cur: number, prev: number | null) =>
                  prev && prev > 0
                    ? { value: `${Math.round(((cur - prev) / prev) * 100)}%`, direction: (cur >= prev ? "up" : "down") as "up" | "down" }
                    : undefined;
                return g ? (
                  <>
                    <div className="grid grid-cols-3 gap-3">
                      <KpiCard value={g.clicks30d} label="clicks búsqueda · 30d" status="good" delta={delta(g.clicks30d, g.prevClicks30d)} />
                      <KpiCard value={g.impressions30d} label="impresiones · 30d" status="neutral" delta={delta(g.impressions30d, g.prevImpressions30d)} />
                      <KpiCard value={g.avgPosition ?? "—"} label="posición media" status="neutral" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <KpiCard value={metricsFor.stages.published.thisMonth} label="publicados este mes" status="neutral" />
                      <KpiCard
                        value={g.impressions30d > 0 ? `${Math.round((g.clicks30d / g.impressions30d) * 1000) / 10}%` : "—"}
                        label="CTR · 30d"
                        status="neutral"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Fuente: Google Search Console (cron diario de métricas) · tendencia vs 30d anteriores.
                    </p>
                  </>
                ) : (
                  <div className="border-2 border-ink rounded-lg p-3 bg-sage/15 text-sm">
                    <b>✓ Search Console conectado.</b> Aún no hay datos diarios recogidos — el cron de
                    métricas empezará a escribirlos en breve.
                  </div>
                );
              })()
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <KpiCard
                    value={metricsFor.stages.metrics.engagementPct !== null ? `${metricsFor.stages.metrics.engagementPct}%` : "—"}
                    label="engagement medio"
                    status={metricsFor.stages.metrics.engagementPct !== null ? "good" : "neutral"}
                  />
                  <KpiCard value={metricsFor.stages.metrics.impressions30d ?? "—"} label="impresiones · 30d" status="neutral" />
                  <KpiCard value={metricsFor.stages.published.thisMonth} label="publicados este mes" status="neutral" />
                </div>
                <p className="text-xs text-muted-foreground">
                  Fuente: PostMetricsSnapshot vía {metricsFor.stages.metrics.provider} ·{" "}
                  {metricsFor.stages.metrics.postsWithMetrics} posts con métricas en 30d.
                </p>
                {metricsFor.primaryKpi && (
                  <p className="text-xs text-muted-foreground">KPI norte del canal: <b>{metricsFor.primaryKpi}</b></p>
                )}
              </>
            )}
          </div>
        )}
      </SlideOver>

      {/* Strategy doc viewer — same DocSlideOver as everywhere else */}
      <DocSlideOver slug={slug} docPath={docPath} onClose={() => setDocPath(null)} />
    </div>
  );
}
