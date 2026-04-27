"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface Draft {
  channel: string;
  content: string;
  status: "draft" | "edited" | "approved" | "published";
  iterations: { role: string; text: string; ts: string }[];
}

interface Idea {
  id: string;
  pillar_id: string;
  content_type: string;
  target_channel: string;
  signal: { summary: string; source: string; url?: string; date: string };
  angle_draft: string;
  pov_confidence: number;
  created_at: string;
  status: string;
  approved_at?: string;
  drafts?: Draft[];
  project_task_id?: string;
  project_id?: string;
  dispatch_date?: string;
  dispatch_slot?: string;
  source_signals?: string[];
}

interface PillarLite { id: string; name: string }
interface CronLite { id: string; baseName: string; lastExecution?: { date: string; status: string } | null }

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function classifySignalSource(idea: Idea): string {
  // Heuristic: derive what input cron produced this idea from source_signals ids.
  const ids = idea.source_signals || [];
  const joined = ids.join(",").toLowerCase();
  if (joined.includes("news")) return "news";
  if (joined.includes("paa")) return "paa";
  if (joined.includes("kw") || joined.includes("keyword")) return "keywords";
  if (joined.includes("creator") || joined.includes("competitor") || joined.includes("compet")) return "competitors";
  return "other";
}

function signalRecencyDays(date: string | undefined): number | null {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

function recencyBadge(days: number | null): { color: string; label: string } | null {
  if (days === null) return null;
  if (days <= 3)  return { color: "bg-green-100 text-green-700",   label: `${days}d` };
  if (days <= 14) return { color: "bg-yellow-100 text-yellow-700", label: `${days}d` };
  if (days <= 45) return { color: "bg-orange-100 text-orange-700", label: `${Math.round(days/7)} sem` };
  return                { color: "bg-red-100 text-red-700",        label: `>${Math.round(days/30)} mes` };
}

function formatLastRun(iso: string | undefined | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "ahora mismo";
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `hace ${diffHr}h`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `hace ${diffDays}d`;
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

interface IdeasCounts {
  total: number;
  ready: number;
  approved: number;
  stale: number;
  archived: number;
  published: number;
}

interface Props {
  slug: string;
}

const STATUS_COLORS: Record<string, string> = {
  ready: "bg-blue-50 text-blue-700 border-blue-200",
  approved: "bg-green-50 text-green-700 border-green-200",
  stale: "bg-gray-50 text-gray-500 border-gray-200",
  archived: "bg-red-50 text-red-600 border-red-200",
  published: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const CHANNEL_ICONS: Record<string, string> = {
  linkedin: "💼",
  twitter: "🐦",
  blog: "📝",
  newsletter: "📧",
};

export function IdeaQueueTab({ slug }: Props) {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [counts, setCounts] = useState<IdeasCounts | null>(null);
  const [pillars, setPillars] = useState<PillarLite[]>([]);
  const [dispatchCron, setDispatchCron] = useState<CronLite | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  // New filters
  const [filterChannel, setFilterChannel] = useState<string>("all");
  const [filterPillar, setFilterPillar] = useState<string>("all");
  const [filterDate, setFilterDate] = useState<"all" | "today" | "week" | "month">("all");
  const [filterSource, setFilterSource] = useState<"all" | "news" | "paa" | "keywords" | "competitors" | "other">("all");
  const [todayOnly, setTodayOnly] = useState<boolean>(false);

  const fetchIdeas = useCallback(() => {
    const statusParam = filter !== "all" ? `&status=${filter}` : "";
    fetch(`/api/content-engine/ideas?slug=${slug}${statusParam}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          setIdeas(data.ideas || []);
          setCounts(data.counts || null);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug, filter]);

  const fetchPillarsAndCrons = useCallback(async () => {
    const [cfg, cr] = await Promise.all([
      fetch(`/api/content-engine/configs?slug=${slug}`).then(r => r.json()).catch(() => ({})),
      fetch(`/api/content-engine/crons?slug=${slug}`).then(r => r.json()).catch(() => ({ crons: [] })),
    ]);
    const newsPrompts = (cfg.configs?.newsPrompts || []) as { pillarId: string; pillarName: string }[];
    setPillars(newsPrompts.map((p) => ({ id: p.pillarId, name: p.pillarName })));
    const dispatch = (cr.crons || []).find((c: CronLite) => c.baseName === "Editorial Dispatch") || null;
    setDispatchCron(dispatch);
  }, [slug]);

  useEffect(() => { fetchIdeas(); }, [fetchIdeas]);
  useEffect(() => { fetchPillarsAndCrons(); }, [fetchPillarsAndCrons]);

  const updateIdea = useCallback(async (ideaId: string, fields: Record<string, unknown>) => {
    await fetch("/api/content-engine/ideas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, ideaId, fields }),
    });
    fetchIdeas();
  }, [slug, fetchIdeas]);

  const saveDraft = useCallback(async (ideaId: string, channel: string, content: string, status?: string) => {
    await fetch("/api/content-engine/drafts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, ideaId, channel, content, status }),
    });
    fetchIdeas();
  }, [slug, fetchIdeas]);

  const requestIteration = useCallback(async (ideaId: string, channel: string, instruction: string) => {
    await fetch("/api/content-engine/drafts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, ideaId, channel, iteration: { role: "user", text: instruction } }),
    });
    fetchIdeas();
  }, [slug, fetchIdeas]);

  // Expanded idea for draft editing
  const [expandedIdea, setExpandedIdea] = useState<string | null>(null);

  // Editorial Dispatch trigger (runs the same cron as 8:30am, sends to Discord)
  const [dispatching, setDispatching] = useState(false);
  const [dispatchFlash, setDispatchFlash] = useState<{ status: "ok" | "error"; message: string } | null>(null);
  const [dispatchPolling, setDispatchPolling] = useState(false);

  const runDispatchCron = useCallback(async () => {
    if (!dispatchCron) {
      setDispatchFlash({ status: "error", message: "Cron Editorial Dispatch no encontrado" });
      return;
    }
    setDispatching(true);
    setDispatchFlash(null);
    try {
      const res = await fetch("/api/content-engine/crons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: dispatchCron.id, action: "run" }),
      });
      const data = await res.json();
      if (res.ok) {
        setDispatchFlash({ status: "ok", message: "Dispatch lanzado — revisa Discord/Slack en ~1-2 min. Refresco automático." });
        setDispatchPolling(true);
      } else {
        setDispatchFlash({ status: "error", message: data.error || "No se pudo lanzar" });
      }
    } catch (err) {
      setDispatchFlash({ status: "error", message: err instanceof Error ? err.message : "Error de red" });
    } finally {
      setDispatching(false);
      setTimeout(() => setDispatchFlash(null), 8000);
    }
  }, [dispatchCron]);

  // Polling: tras dispatch, refresca ideas + cron cada 60s durante 5 min
  useEffect(() => {
    if (!dispatchPolling) return;
    const start = Date.now();
    const interval = setInterval(() => {
      fetchIdeas();
      fetchPillarsAndCrons();
      if (Date.now() - start > 5 * 60 * 1000) {
        setDispatchPolling(false);
      }
    }, 60_000);
    const fast = setTimeout(() => { fetchIdeas(); fetchPillarsAndCrons(); }, 30_000);
    return () => { clearInterval(interval); clearTimeout(fast); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatchPolling]);

  if (loading) return <p className="text-muted-foreground text-sm py-8 text-center">Cargando ideas...</p>;

  const FILTERS = [
    { key: "all", label: "Todas", count: counts?.total },
    { key: "ready", label: "Ready", count: counts?.ready },
    { key: "approved", label: "Aprobadas", count: counts?.approved },
    { key: "stale", label: "Stale", count: counts?.stale },
    { key: "archived", label: "Archivadas", count: counts?.archived },
    { key: "published", label: "Publicadas", count: counts?.published },
  ];

  const today = todayKey();

  // Apply secondary filters + sort: today's dispatch first, then most recent signal
  const visibleIdeas = ideas
    .filter((i) => filterChannel === "all" || i.target_channel === filterChannel)
    .filter((i) => filterPillar === "all" || i.pillar_id === filterPillar)
    .filter((i) => {
      if (filterDate === "all") return true;
      const days = signalRecencyDays(i.signal?.date);
      if (days === null) return false;
      if (filterDate === "today") return days === 0;
      if (filterDate === "week") return days <= 7;
      if (filterDate === "month") return days <= 30;
      return true;
    })
    .filter((i) => filterSource === "all" || classifySignalSource(i) === filterSource)
    .filter((i) => !todayOnly || i.dispatch_date === today)
    .sort((a, b) => {
      const aToday = a.dispatch_date === today ? 1 : 0;
      const bToday = b.dispatch_date === today ? 1 : 0;
      if (aToday !== bToday) return bToday - aToday;
      // Then by signal date (most recent first)
      const aDate = new Date(a.signal?.date || a.created_at).getTime();
      const bDate = new Date(b.signal?.date || b.created_at).getTime();
      return bDate - aDate;
    });

  const todayCount = ideas.filter((i) => i.dispatch_date === today).length;

  return (
    <div>
      {/* Dispatch action bar */}
      <div className="bg-white border border-[#E8E2D9] rounded-lg p-3 mb-4 flex items-center gap-3 flex-wrap" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <span className="text-xl">📬</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-[#2C3E50]">Editorial Dispatch</div>
            <div className="text-xs text-muted-foreground">
              Selecciona candidatas según cadencia y las envía a Discord/Slack para que elijas allí.
              {dispatchCron?.lastExecution && (
                <> · Última: <strong>{formatLastRun(dispatchCron.lastExecution.date)}</strong> ({dispatchCron.lastExecution.status})</>
              )}
              {!dispatchCron?.lastExecution && <> · Sin ejecuciones</>}
              {dispatchCron && <> · Cron diario 08:30</>}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={runDispatchCron}
          disabled={dispatching || !dispatchCron}
          className="text-sm px-4 py-2 bg-rust text-white rounded-md hover:bg-rust/90 transition-colors font-medium disabled:opacity-50"
          title={dispatchCron ? "Lanzar dispatch ahora" : "Cron Editorial Dispatch no encontrado"}
        >
          {dispatching ? "Lanzando..." : dispatchPolling ? "⏳ En curso" : "▶ Ejecutar ahora"}
        </button>
        {dispatchPolling && (
          <button
            type="button"
            onClick={() => { fetchIdeas(); fetchPillarsAndCrons(); }}
            className="text-xs text-muted-foreground hover:text-rust"
            title="Refrescar manualmente"
          >
            🔄
          </button>
        )}
      </div>
      {dispatchFlash && (
        <div className={cn(
          "mb-3 text-xs px-3 py-2 rounded border",
          dispatchFlash.status === "ok" ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"
        )}>
          {dispatchFlash.status === "ok" ? "✅" : "❌"} {dispatchFlash.message}
        </div>
      )}

      {/* Status filter chips */}
      <div className="flex gap-1.5 mb-2 overflow-x-auto">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "text-xs px-3 py-1.5 rounded-md whitespace-nowrap transition-colors font-medium",
              filter === f.key
                ? "bg-rust text-white"
                : "bg-muted/40 text-muted-foreground hover:bg-muted"
            )}
          >
            {f.label}{f.count !== undefined ? ` (${f.count})` : ""}
          </button>
        ))}
      </div>

      {/* Secondary filters */}
      <div className="flex gap-2 mb-4 flex-wrap items-center text-xs">
        <button
          onClick={() => setTodayOnly((v) => !v)}
          className={cn(
            "px-2.5 py-1 rounded-md font-medium transition-colors border",
            todayOnly
              ? "bg-green-100 text-green-700 border-green-300"
              : "bg-white text-muted-foreground border-[#E8E2D9] hover:border-rust/40"
          )}
          title="Filtrar por dispatch de hoy"
        >
          📬 Hoy ({todayCount})
        </button>
        <select
          value={filterChannel}
          onChange={(e) => setFilterChannel(e.target.value)}
          className="px-2 py-1 rounded border border-[#E8E2D9] bg-white focus:outline-none focus:border-rust"
          title="Canal"
        >
          <option value="all">Canal: Todos</option>
          <option value="linkedin">💼 LinkedIn</option>
          <option value="twitter">🐦 Twitter</option>
          <option value="blog">📝 Blog</option>
          <option value="newsletter">📧 Newsletter</option>
        </select>
        <select
          value={filterPillar}
          onChange={(e) => setFilterPillar(e.target.value)}
          className="px-2 py-1 rounded border border-[#E8E2D9] bg-white focus:outline-none focus:border-rust"
          title="Pillar"
        >
          <option value="all">Pillar: Todos</option>
          {pillars.map((p) => (
            <option key={p.id} value={p.id} title={p.name}>{p.id} — {p.name.slice(0, 30)}{p.name.length > 30 ? "…" : ""}</option>
          ))}
        </select>
        <select
          value={filterDate}
          onChange={(e) => setFilterDate(e.target.value as typeof filterDate)}
          className="px-2 py-1 rounded border border-[#E8E2D9] bg-white focus:outline-none focus:border-rust"
          title="Recencia del signal"
        >
          <option value="all">Fecha signal: Todas</option>
          <option value="today">Hoy</option>
          <option value="week">≤ 7 días</option>
          <option value="month">≤ 30 días</option>
        </select>
        <select
          value={filterSource}
          onChange={(e) => setFilterSource(e.target.value as typeof filterSource)}
          className="px-2 py-1 rounded border border-[#E8E2D9] bg-white focus:outline-none focus:border-rust"
          title="Cron de origen"
        >
          <option value="all">Fuente: Todas</option>
          <option value="news">📰 News</option>
          <option value="paa">❓ PAA</option>
          <option value="keywords">🔑 Keywords</option>
          <option value="competitors">🕵️ Competidores</option>
          <option value="other">Otra</option>
        </select>
        <span className="text-[11px] text-muted-foreground ml-auto">
          {visibleIdeas.length} de {ideas.length}
        </span>
      </div>

      {/* Ideas list */}
      {visibleIdeas.length === 0 ? (
        <div className="text-center py-12">
          <span className="text-4xl mb-3 block">💡</span>
          <p className="text-sm text-muted-foreground mb-2">
            {ideas.length === 0
              ? (filter === "all" ? "Sin ideas todavia" : `Sin ideas con status "${filter}"`)
              : "Sin ideas que coincidan con los filtros"}
          </p>
          <p className="text-xs text-muted-foreground">
            Las ideas se generan automaticamente via los crons del Content Engine (7:30am L-V)
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleIdeas.map((idea) => {
            const recDays = signalRecencyDays(idea.signal?.date);
            const rec = recencyBadge(recDays);
            const isToday = idea.dispatch_date === today;
            const pillarName = pillars.find((p) => p.id === idea.pillar_id)?.name;
            return (
            <div
              key={idea.id}
              className={cn(
                "bg-white border rounded-lg p-4",
                isToday ? "border-green-300 ring-1 ring-green-200" : "border-[#E8E2D9]"
              )}
              style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}
            >
              {/* Header */}
              <div className="flex items-start gap-2 mb-2 flex-wrap">
                <span className="text-xl">{CHANNEL_ICONS[idea.target_channel] || "📄"}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full border", STATUS_COLORS[idea.status] || "bg-muted")}>
                      {idea.status}
                    </span>
                    {isToday && (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-300" title="Dispatch de hoy">
                        📬 Hoy
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground" title={pillarName || ""}>
                      <span className="font-semibold">{idea.pillar_id}</span>
                      {pillarName && <span className="ml-1 opacity-80">{pillarName}</span>}
                    </span>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="text-xs text-muted-foreground">{idea.content_type}</span>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="text-xs text-muted-foreground capitalize">{idea.target_channel}</span>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap" title={`Idea creada: ${idea.created_at}`}>
                  Idea {new Date(idea.created_at).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
                </span>
              </div>

              {/* Signal */}
              <div className="bg-muted/20 rounded px-3 py-2.5 mb-2.5">
                <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                  <p className="text-xs text-muted-foreground font-medium">📰 Signal</p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {idea.signal?.date && (
                      <span className="text-[11px] text-muted-foreground" title="Fecha del signal (artículo/noticia)">
                        📅 {idea.signal.date}
                      </span>
                    )}
                    {rec && (
                      <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded", rec.color)} title={`Antigüedad del signal: ${recDays} días`}>
                        {rec.label}
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-sm text-[#2C3E50] leading-relaxed">{idea.signal?.summary}</p>
                <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1.5 flex-wrap">
                  {idea.signal?.source && <span>🏷️ {idea.signal.source}</span>}
                  {idea.signal?.url && (
                    <>
                      <span>·</span>
                      <a href={idea.signal.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                        🔗 Ver fuente
                      </a>
                    </>
                  )}
                </p>
              </div>

              {/* Angle draft */}
              <div className="mb-3">
                <p className="text-xs text-muted-foreground font-medium mb-1">✍️ Ángulo</p>
                <p className="text-sm text-[#2C3E50] leading-relaxed whitespace-pre-wrap">{idea.angle_draft}</p>
              </div>

              {/* Confidence + Actions */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Confianza:</span>
                  <div className="w-20 h-1.5 bg-muted/40 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-rust"
                      style={{ width: `${(idea.pov_confidence || 0) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground font-semibold">{Math.round((idea.pov_confidence || 0) * 100)}%</span>
                </div>

                {idea.status === "ready" && (
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => updateIdea(idea.id, { status: "approved", approved_at: new Date().toISOString(), approved_via: "mc-ui" })}
                      className="text-xs px-3 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-md hover:bg-green-100 transition-colors font-medium"
                    >
                      ✅ Aprobar
                    </button>
                    <button
                      onClick={() => updateIdea(idea.id, { status: "archived" })}
                      className="text-xs px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 rounded-md hover:bg-red-100 transition-colors font-medium"
                    >
                      ❌ Descartar
                    </button>
                  </div>
                )}

                {idea.status === "approved" && (
                  <div className="flex gap-1.5 items-center">
                    {idea.project_task_id && (
                      idea.project_id ? (
                        <Link
                          href={`/dashboard/${slug}/projects/${idea.project_id}/tasks/${idea.project_task_id}`}
                          className="text-xs text-muted-foreground hover:text-rust bg-muted/40 hover:bg-muted/60 px-2 py-0.5 rounded transition-colors no-underline"
                          title="Abrir tarea del proyecto"
                        >
                          📋 {idea.project_task_id}
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground bg-muted/40 px-2 py-0.5 rounded">
                          📋 {idea.project_task_id}
                        </span>
                      )
                    )}
                    <button
                      onClick={() => setExpandedIdea(expandedIdea === idea.id ? null : idea.id)}
                      className="text-xs px-3 py-1.5 bg-rust/10 text-rust border border-rust/20 rounded-md hover:bg-rust/20 transition-colors font-medium"
                    >
                      {expandedIdea === idea.id ? "▾ Cerrar" : `✏️ Drafts${idea.drafts?.length ? ` (${idea.drafts.length})` : ""}`}
                    </button>
                  </div>
                )}
              </div>

              {/* Draft cards — shown when idea is approved and expanded */}
              {idea.status === "approved" && expandedIdea === idea.id && (
                <DraftCards
                  idea={idea}
                  slug={slug}
                  onSaveDraft={saveDraft}
                  onRequestIteration={requestIteration}
                  onRefresh={fetchIdeas}
                />
              )}
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── DRAFT CARDS COMPONENT ─────────────────────────────────────
function DraftCards({
  idea, slug, onSaveDraft, onRequestIteration, onRefresh,
}: {
  idea: Idea; slug: string;
  onSaveDraft: (ideaId: string, channel: string, content: string, status?: string) => Promise<void>;
  onRequestIteration: (ideaId: string, channel: string, instruction: string) => Promise<void>;
  onRefresh: () => void;
}) {
  const drafts = idea.drafts || [];
  const [editingChannel, setEditingChannel] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [iterationInput, setIterationInput] = useState("");
  const [iteratingChannel, setIteratingChannel] = useState<string | null>(null);

  // Channels this idea should have drafts for
  const channels = idea.target_channel === "linkedin"
    ? ["linkedin", "twitter"]
    : idea.target_channel === "blog"
    ? ["blog", "linkedin"]
    : idea.target_channel === "newsletter"
    ? ["newsletter"]
    : [idea.target_channel, "linkedin"];

  const DRAFT_STATUS: Record<string, { bg: string; text: string; label: string }> = {
    draft: { bg: "bg-yellow-50", text: "text-yellow-700", label: "Borrador" },
    edited: { bg: "bg-blue-50", text: "text-blue-700", label: "Editado" },
    approved: { bg: "bg-green-50", text: "text-green-700", label: "Aprobado" },
    published: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Publicado" },
  };

  return (
    <div className="mt-3 pt-3 border-t border-[#E8E2D9] space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Drafts por canal</span>
        {drafts.length === 0 && (
          <span className="text-[10px] text-muted-foreground italic">Escudero Content generara los drafts automaticamente tras el Clarify</span>
        )}
      </div>

      {channels.map((channel) => {
        const draft = drafts.find(d => d.channel === channel);
        const st = draft ? (DRAFT_STATUS[draft.status] || DRAFT_STATUS.draft) : null;
        const isEditing = editingChannel === channel;

        return (
          <div key={channel} className="bg-[#FAFAF8] border border-[#E8E2D9] rounded-lg p-3">
            {/* Channel header */}
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm">{CHANNEL_ICONS[channel] || "📄"}</span>
              <span className="text-xs font-semibold text-[#2C3E50] capitalize">{channel}</span>
              {st && (
                <span className={cn("text-[9px] font-semibold px-2 py-0.5 rounded-full", st.bg, st.text)}>
                  {st.label}
                </span>
              )}
              <div className="ml-auto flex gap-1.5">
                {draft && draft.status !== "approved" && draft.status !== "published" && (
                  <>
                    <button
                      onClick={() => {
                        if (isEditing) {
                          onSaveDraft(idea.id, channel, editContent, "edited");
                          setEditingChannel(null);
                        } else {
                          setEditContent(draft.content);
                          setEditingChannel(channel);
                        }
                      }}
                      className="text-[10px] px-2 py-0.5 rounded border border-[#E5E2DC] text-[#7A7A7A] hover:bg-[#E5E2DC] transition-colors"
                    >
                      {isEditing ? "💾 Guardar" : "✏️ Editar"}
                    </button>
                    <button
                      onClick={() => onSaveDraft(idea.id, channel, draft.content, "approved")}
                      className="text-[10px] px-2 py-0.5 rounded border border-green-200 text-green-700 bg-green-50 hover:bg-green-100 transition-colors"
                    >
                      ✅ Aprobar
                    </button>
                  </>
                )}
                {draft?.status === "approved" && (
                  <span className="text-[10px] text-green-600 font-medium">✓ Listo para publicar</span>
                )}
              </div>
            </div>

            {/* Draft content */}
            {!draft ? (
              <p className="text-[11px] text-muted-foreground italic py-2">
                Sin draft todavia. Se generara automaticamente cuando Escudero Content ejecute el Clarify + Writer.
              </p>
            ) : isEditing ? (
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full text-[12px] border border-[#E8E2D9] rounded p-2 min-h-[120px] resize-y focus:outline-none focus:border-rust leading-relaxed"
                placeholder="Contenido del draft..."
              />
            ) : (
              <div className="text-[12px] text-[#2C3E50] whitespace-pre-wrap leading-relaxed py-1">
                {draft.content || "(vacio)"}
              </div>
            )}

            {/* Iteration request */}
            {draft && draft.status !== "approved" && draft.status !== "published" && (
              <div className="mt-2">
                {iteratingChannel === channel ? (
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={iterationInput}
                      onChange={(e) => setIterationInput(e.target.value)}
                      className="flex-1 text-[11px] border border-[#E8E2D9] rounded px-2 py-1 focus:outline-none focus:border-rust"
                      placeholder='Ej: "hook mas fuerte", "mas corto", "cita datos de Bnext"'
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && iterationInput.trim()) {
                          onRequestIteration(idea.id, channel, iterationInput);
                          setIterationInput("");
                          setIteratingChannel(null);
                        }
                      }}
                    />
                    <button
                      onClick={() => { setIteratingChannel(null); setIterationInput(""); }}
                      className="text-[10px] text-muted-foreground hover:text-[#2C3E50]"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setIteratingChannel(channel)}
                    className="text-[10px] text-rust hover:underline"
                  >
                    🔄 Pedir iteracion
                  </button>
                )}

                {/* Show iteration history */}
                {draft.iterations.length > 0 && (
                  <div className="mt-1.5 space-y-1">
                    {draft.iterations.map((it, i) => (
                      <div key={i} className="text-[10px] text-muted-foreground bg-white rounded px-2 py-1 border border-[#E8E2D9]">
                        <span className="font-medium">{it.role === "user" ? "Tu" : "Escudero"}:</span> {it.text}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
