"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { buildTaskThread, type ThreadConfig } from "@/lib/chat-openers";
import { DocSlideOver } from "@/components/shared/doc-slideover";

/**
 * Draft shape returned by `/api/content-engine/drafts`.
 * The persistent storage is `brand/{slug}/content/drafts/{idea-id}/{channel}.md`
 * with YAML frontmatter; the API parses it and returns this shape.
 */
interface Draft {
  meta: {
    idea_id: string;
    channel: string;
    iteration: number;
    status: "pending" | "researching" | "clarify-needed" | "drafting" | "draft" | "approved" | "published";
    content_task_id?: string;
    parent_task_id?: string;
    research_used?: boolean;
    clarify_status?: "pending" | "answered" | "skipped";
    updated_at?: string;
  };
  body: string;
  relPath: string;
  absPath: string;
}

interface Idea {
  id: string;
  title?: string;
  pillar_id: string;
  content_type: string;
  target_channel: string;
  signal: { summary: string; source: string; url?: string; date: string };
  angle_draft: string;
  pov_confidence: number;
  created_at: string;
  status: string;
  approved_at?: string;
  /** @deprecated drafts now live as files under content/drafts/{idea-id}/{channel}.md */
  drafts?: unknown;
  project_task_id?: string;
  project_id?: string;
  dispatch_date?: string;
  dispatch_slot?: string;
  source_signals?: string[];
}

// Strip "Nuestro POV:" / "POV:" / etc prefix from angle text. The UI/Slack
// already shows a "✍️ Nuestro ángulo" header, so the prefix is redundant.
function stripPovPrefix(text: string): string {
  return (text || "")
    .replace(/^\s*(nuestro\s+pov|our\s+pov|pov)\s*:\s*/i, "")
    .trim();
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

// Pick the best title to render: prefer the dedicated `title` field set by
// `idea-builder`, else derive from the angle (stripping the redundant
// "Nuestro POV:" prefix), else fall back to the signal summary.
function getIdeaTitle(idea: { title?: string; angle_draft?: string; signal?: { summary?: string }; id: string }): string {
  if (idea.title && idea.title.trim()) return idea.title.trim();
  const cleanAngle = stripPovPrefix(idea.angle_draft || "");
  const candidate = cleanAngle || (idea.signal?.summary || "").trim();
  if (!candidate) return idea.id;
  // First sentence between 12-160 chars
  const m = candidate.match(/^([^.!?\n]{12,160}[.!?])/);
  const out = m ? m[1] : candidate.split("\n")[0];
  return out.length > 140 ? out.slice(0, 137).trimEnd() + "…" : out;
}

// Comic UI palette for recency
function recencyBadge(days: number | null): { color: string; label: string } | null {
  if (days === null) return null;
  if (days <= 3)  return { color: "bg-sage   text-white", label: `${days}d · reciente` };
  if (days <= 14) return { color: "bg-yellow text-ink",   label: `${days}d · esta semana` };
  if (days <= 45) return { color: "bg-aged   text-ink",   label: `${Math.round(days/7)} sem` };
  return                { color: "bg-rust   text-white", label: `> ${Math.round(days/30)} mes` };
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
  openChat?: (slug: string, config: ThreadConfig) => void;
}

// Comic UI palette — only rust/navy/sage/yellow/aged + ink
const STATUS_VISUAL: Record<string, string> = {
  ready:     "bg-card    text-ink",
  approved:  "bg-sage    text-white",
  stale:     "bg-aged    text-ink",
  archived:  "bg-rust    text-white",
  published: "bg-navy    text-white",
};

// Content type → comic color (rust = hot, sage = proof, navy = framework, yellow = personal, aged = listicle)
const CONTENT_TYPE_VISUAL: Record<string, { label: string; bg: string; emoji: string }> = {
  "Hot Take":       { label: "HOT TAKE",  bg: "bg-rust    text-white", emoji: "🔥" },
  "Proof Post":     { label: "PROOF",     bg: "bg-sage    text-white", emoji: "📚" },
  Framework:        { label: "FRAMEWORK", bg: "bg-navy    text-white", emoji: "🧩" },
  "Personal Story": { label: "PERSONAL",  bg: "bg-yellow  text-ink",   emoji: "💬" },
  Listicle:         { label: "LISTICLE",  bg: "bg-aged    text-ink",   emoji: "📋" },
};

const CHANNEL_VISUAL: Record<string, { label: string; emoji: string }> = {
  linkedin:   { label: "LinkedIn",    emoji: "💼" },
  twitter:    { label: "X / Twitter", emoji: "🐦" },
  blog:       { label: "Blog",        emoji: "📝" },
  newsletter: { label: "Newsletter",  emoji: "📧" },
};

const CHANNEL_ICONS: Record<string, string> = {
  linkedin: "💼",
  twitter: "🐦",
  blog: "📝",
  newsletter: "📧",
};

// Pick a writer skill based on the idea's target_channel
function writerSkillFor(channel: string): string {
  if (channel === "blog") return "seo-content";
  if (channel === "newsletter") return "newsletter";
  return "social-writer"; // linkedin, twitter, default
}

export function IdeaQueueTab({ slug, openChat }: Props) {
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

  const saveDraft = useCallback(async (ideaId: string, channel: string, body: string, status?: string) => {
    await fetch("/api/content-engine/drafts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, ideaId, channel, body, meta: status ? { status } : undefined }),
    });
    fetchIdeas();
  }, [slug, fetchIdeas]);

  const requestIteration = useCallback(async (ideaId: string, channel: string, instruction: string) => {
    // Iteration goes to a dedicated endpoint that re-runs the writer skill
    // against the current draft + the user's feedback. Falls back to recording
    // the request if the endpoint isn't ready yet.
    await fetch("/api/content-engine/iterate-draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, ideaId, channel, instruction }),
    });
    fetchIdeas();
  }, [slug, fetchIdeas]);

  // DocSlideOver state — opened when the user clicks a draft card to view/edit
  // the markdown file directly via /api/docs/.
  const [openDocPath, setOpenDocPath] = useState<string | null>(null);
  const openDraftDoc = useCallback((ideaId: string, channel: string) => {
    if (!slug) return;
    setOpenDocPath(`brand/${slug}/content/drafts/${ideaId}/${channel}.md`);
  }, [slug]);

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
    { key: "archived", label: "Descartadas", count: counts?.archived },
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
      {/* Dispatch action bar — Comic UI */}
      <div className="bg-card border-[3px] border-ink shadow-comic-sm rounded-xl p-4 mb-4 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-1 min-w-[220px]">
          <span className="text-2xl">📬</span>
          <div className="flex-1 min-w-0">
            <div className="font-heading text-base font-bold text-ink">Editorial Dispatch</div>
            <div className="text-xs text-ink/70">
              Selecciona candidatas según cadencia y las envía a Discord/Slack para que elijas allí.
              {dispatchCron?.lastExecution && (
                <> · Última: <strong className="text-ink">{formatLastRun(dispatchCron.lastExecution.date)}</strong> ({dispatchCron.lastExecution.status})</>
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
          className="font-heading text-sm font-bold px-4 py-2 rounded-md bg-rust text-white border-2 border-ink shadow-comic-sm hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed transition-transform"
          title={dispatchCron ? "Lanzar dispatch ahora" : "Cron Editorial Dispatch no encontrado"}
        >
          {dispatching ? "Lanzando..." : dispatchPolling ? "⏳ En curso" : "▶ Ejecutar ahora"}
        </button>
        {dispatchPolling && (
          <button
            type="button"
            onClick={() => { fetchIdeas(); fetchPillarsAndCrons(); }}
            className="font-heading text-sm font-bold px-3 py-2 rounded-md bg-card text-ink border-2 border-ink shadow-comic-sm hover:-translate-y-0.5 transition-transform"
            title="Refrescar manualmente"
          >
            🔄
          </button>
        )}
      </div>
      {dispatchFlash && (
        <div className={cn(
          "mb-3 text-xs font-heading font-bold px-3 py-2 rounded-md border-2 border-ink",
          dispatchFlash.status === "ok" ? "bg-sage text-white" : "bg-rust text-white"
        )}>
          {dispatchFlash.status === "ok" ? "✅" : "❌"} {dispatchFlash.message}
        </div>
      )}

      {/* Status filter chips — Comic UI */}
      <div className="flex gap-2 mb-3 overflow-x-auto">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "font-heading font-bold text-sm px-4 py-2 rounded-md border-2 border-ink whitespace-nowrap transition-transform",
              filter === f.key
                ? "bg-rust text-white shadow-comic-sm"
                : "bg-card text-ink shadow-comic-sm hover:-translate-y-0.5"
            )}
          >
            {f.label}{f.count !== undefined ? ` (${f.count})` : ""}
          </button>
        ))}
      </div>

      {/* Secondary filters — Comic UI */}
      <div className="flex gap-2 mb-4 flex-wrap items-center">
        <button
          onClick={() => setTodayOnly((v) => !v)}
          className={cn(
            "font-heading font-bold text-xs px-3 py-1.5 rounded-md border-2 border-ink shadow-comic-sm transition-transform hover:-translate-y-0.5 inline-flex items-center gap-1.5",
            todayOnly
              ? "bg-rust text-white ring-2 ring-ink ring-offset-1"
              : "bg-card text-ink"
          )}
          title={todayOnly ? "✓ Mostrando solo dispatch de hoy. Click para quitar el filtro." : "Filtrar para mostrar solo dispatch de hoy"}
        >
          {todayOnly ? "✓" : "📬"} Solo HOY ({todayCount})
          {todayOnly && <span className="ml-1 text-[10px] opacity-80">· quitar</span>}
        </button>
        <select
          value={filterChannel}
          onChange={(e) => setFilterChannel(e.target.value)}
          className="font-heading font-bold text-xs px-2.5 py-1.5 rounded-md border-2 border-ink bg-card text-ink shadow-comic-sm focus:outline-none"
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
          className="font-heading font-bold text-xs px-2.5 py-1.5 rounded-md border-2 border-ink bg-card text-ink shadow-comic-sm focus:outline-none"
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
          className="font-heading font-bold text-xs px-2.5 py-1.5 rounded-md border-2 border-ink bg-card text-ink shadow-comic-sm focus:outline-none"
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
          className="font-heading font-bold text-xs px-2.5 py-1.5 rounded-md border-2 border-ink bg-card text-ink shadow-comic-sm focus:outline-none"
          title="Cron de origen"
        >
          <option value="all">Fuente: Todas</option>
          <option value="news">📰 News</option>
          <option value="paa">❓ PAA</option>
          <option value="keywords">🔑 Keywords</option>
          <option value="competitors">🕵️ Competidores</option>
          <option value="other">Otra</option>
        </select>
        <span className="font-heading text-xs font-bold text-ink/70 ml-auto">
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
            const tv = CONTENT_TYPE_VISUAL[idea.content_type] || { label: idea.content_type.toUpperCase(), bg: "bg-aged text-ink", emoji: "📄" };
            const cv = CHANNEL_VISUAL[idea.target_channel] || { label: idea.target_channel, emoji: "📄" };
            const conf = Math.round((idea.pov_confidence || 0) * 100);
            return (
            <div
              key={idea.id}
              className={cn(
                "bg-card rounded-xl p-5 border-[3px] border-ink",
                isToday ? "shadow-comic" : "shadow-comic-sm"
              )}
            >
              {/* Header — canal grande PRIMERO + tipo color comic */}
              <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b-2 border-dashed border-ink/30 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-parchment border-2 border-ink text-ink font-heading font-bold text-base">
                    <span className="text-xl leading-none">{cv.emoji}</span>
                    {cv.label}
                  </span>
                  <span className={cn("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border-2 border-ink font-heading font-bold text-sm", tv.bg)}>
                    <span className="text-base">{tv.emoji}</span>
                    {tv.label}
                  </span>
                  {idea.status === "approved" && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-sage text-white border-2 border-ink text-xs font-heading font-bold">
                      ✓ APROBADA
                    </span>
                  )}
                  {idea.status !== "approved" && idea.status !== "ready" && (
                    <span className={cn("inline-flex items-center px-2.5 py-1 rounded-md border-2 border-ink text-xs font-heading font-bold uppercase", STATUS_VISUAL[idea.status] || "bg-aged text-ink")}>
                      {idea.status}
                    </span>
                  )}
                  {isToday && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-yellow text-ink border-2 border-ink text-xs font-heading font-bold">
                      📬 HOY
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-ink/60 font-heading uppercase tracking-wider">Confianza</span>
                  <div className="w-24 h-3 bg-aged border-2 border-ink rounded-full overflow-hidden">
                    <div
                      className={cn("h-full", conf >= 80 ? "bg-sage" : conf >= 60 ? "bg-yellow" : "bg-rust")}
                      style={{ width: `${conf}%` }}
                    />
                  </div>
                  <span className="text-base font-heading font-bold text-ink tabular-nums">{conf}%</span>
                </div>
              </div>

              {/* Título — del campo idea.title (nuevo, generado por idea-builder)
                  con fallback al angle stripeado por compat. */}
              <h2 className="font-heading text-lg font-bold text-ink leading-tight mb-3">
                {getIdeaTitle(idea)}
              </h2>

              {/* Signal */}
              <div className="bg-parchment border-2 border-ink rounded-lg p-4 mb-4">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="font-heading font-bold text-ink uppercase tracking-wider text-xs">📰 Signal</span>
                  {idea.signal?.source && (
                    <>
                      <span className="text-ink/40">·</span>
                      <span className="text-xs font-bold text-ink">{idea.signal.source}</span>
                    </>
                  )}
                  {idea.signal?.date && (
                    <>
                      <span className="text-ink/40">·</span>
                      <span className="text-xs text-ink/70">📅 {idea.signal.date}</span>
                    </>
                  )}
                  {rec && (
                    <span className={cn("text-[11px] font-heading font-bold px-2 py-0.5 rounded-full border-2 border-ink", rec.color)} title={`Antigüedad del signal: ${recDays} días`}>
                      {rec.label}
                    </span>
                  )}
                </div>
                <p className="text-sm text-ink leading-relaxed mb-2">{idea.signal?.summary}</p>
                {idea.signal?.url && (
                  <a href={idea.signal.url} target="_blank" rel="noopener noreferrer" className="text-xs text-rust hover:underline font-bold inline-flex items-center gap-1">
                    🔗 Ver fuente original
                  </a>
                )}
              </div>

              {/* Angle draft */}
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-heading font-bold text-rust uppercase tracking-wider text-xs">✍️ Nuestro ángulo</span>
                </div>
                <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap">{stripPovPrefix(idea.angle_draft)}</p>
              </div>

              {/* Pillar + Actions */}
              <div className="flex items-center justify-between gap-3 flex-wrap pt-3 border-t-2 border-dashed border-ink/30">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-ink/60 font-heading uppercase tracking-wider">Pillar</span>
                  <span className="text-xs font-heading font-bold bg-aged text-ink px-2.5 py-1 rounded-md border-2 border-ink" title={pillarName || idea.pillar_id}>
                    {idea.pillar_id}{pillarName ? ` · ${pillarName}` : ""}
                  </span>
                </div>

                {idea.status === "ready" && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => updateIdea(idea.id, { status: "approved", approved_at: new Date().toISOString(), approved_via: "mc-ui" })}
                      className="font-heading text-sm font-bold px-4 py-2 rounded-md bg-sage text-white border-2 border-ink shadow-comic-sm hover:-translate-y-0.5 transition-transform"
                    >
                      ✓ Aprobar
                    </button>
                    <button
                      onClick={() => updateIdea(idea.id, { status: "archived" })}
                      className="font-heading text-sm font-bold px-4 py-2 rounded-md bg-card text-ink border-2 border-ink shadow-comic-sm hover:-translate-y-0.5 transition-transform"
                    >
                      ✕ Descartar
                    </button>
                  </div>
                )}

                {idea.status === "approved" && (
                  <div className="flex gap-2 items-center">
                    {idea.project_task_id && (
                      idea.project_id ? (
                        <Link
                          href={`/dashboard/${slug}/projects/${idea.project_id}/tasks/${idea.project_task_id}`}
                          className="font-heading text-xs font-bold bg-parchment text-ink px-2.5 py-1.5 rounded-md border-2 border-ink shadow-comic-sm hover:-translate-y-0.5 transition-transform no-underline"
                          title="Abrir tarea del proyecto"
                        >
                          📋 {idea.project_task_id}
                        </Link>
                      ) : (
                        <span className="font-heading text-xs font-bold bg-aged text-ink px-2.5 py-1.5 rounded-md border-2 border-ink">
                          📋 {idea.project_task_id}
                        </span>
                      )
                    )}
                    <button
                      onClick={() => {
                        if (!openChat || !idea.project_task_id || !idea.project_id) {
                          // Fallback: legacy inline expand if openChat not wired
                          setExpandedIdea(expandedIdea === idea.id ? null : idea.id);
                          return;
                        }
                        const skill = writerSkillFor(idea.target_channel);
                        const cfg = buildTaskThread(
                          slug,
                          idea.project_task_id,
                          `${idea.content_type} · ${idea.pillar_id}`,
                          idea.project_id,
                          {
                            taskSkill: skill,
                            taskChannel: idea.target_channel,
                            taskType: "content",
                            deliverableFile: undefined,
                          }
                        );
                        openChat(slug, cfg);
                      }}
                      className="font-heading text-sm font-bold px-4 py-2 rounded-md bg-rust text-white border-2 border-ink shadow-comic-sm hover:-translate-y-0.5 transition-transform inline-flex items-center gap-1.5"
                      title={`Abrir chat para redactar el ${idea.target_channel} (skill: ${writerSkillFor(idea.target_channel)})`}
                    >
                      💬 Redactar
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
                  onOpenDoc={openDraftDoc}
                  onRefresh={fetchIdeas}
                />
              )}
            </div>
            );
          })}
        </div>
      )}

      {/* Draft viewer/editor — shared slideover used by all DraftCards */}
      <DocSlideOver
        slug={slug}
        docPath={openDocPath}
        onClose={() => setOpenDocPath(null)}
      />
    </div>
  );
}

// ── DRAFT CARDS COMPONENT ─────────────────────────────────────
function DraftCards({
  idea, slug, onSaveDraft, onRequestIteration, onOpenDoc, onRefresh,
}: {
  idea: Idea; slug: string;
  onSaveDraft: (ideaId: string, channel: string, body: string, status?: string) => Promise<void>;
  onRequestIteration: (ideaId: string, channel: string, instruction: string) => Promise<void>;
  onOpenDoc: (ideaId: string, channel: string) => void;
  onRefresh: () => void;
}) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(false);
  const [iterationInput, setIterationInput] = useState("");
  const [iteratingChannel, setIteratingChannel] = useState<string | null>(null);

  // Pull drafts from the markdown-file storage. Re-fetch on refresh signals.
  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    fetch(`/api/content-engine/drafts?slug=${slug}&ideaId=${idea.id}`)
      .then((r) => r.json())
      .then((data) => setDrafts(data?.drafts || []))
      .catch(() => setDrafts([]))
      .finally(() => setLoading(false));
  }, [slug, idea.id]);

  // Channels this idea should have drafts for
  const channels = idea.target_channel === "linkedin"
    ? ["linkedin", "twitter"]
    : idea.target_channel === "blog"
    ? ["blog", "linkedin"]
    : idea.target_channel === "newsletter"
    ? ["newsletter"]
    : [idea.target_channel, "linkedin"];

  const DRAFT_STATUS: Record<string, { bg: string; text: string; label: string }> = {
    pending: { bg: "bg-gray-50", text: "text-gray-700", label: "Pendiente" },
    researching: { bg: "bg-purple-50", text: "text-purple-700", label: "Researching" },
    "clarify-needed": { bg: "bg-amber-50", text: "text-amber-700", label: "Necesita aclaración" },
    drafting: { bg: "bg-blue-50", text: "text-blue-700", label: "Escribiendo" },
    draft: { bg: "bg-yellow-50", text: "text-yellow-700", label: "Borrador" },
    approved: { bg: "bg-green-50", text: "text-green-700", label: "Aprobado" },
    published: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Publicado" },
  };

  return (
    <div className="mt-3 pt-3 border-t border-[#E8E2D9] space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Drafts por canal</span>
        {!loading && drafts.length === 0 && (
          <span className="text-[10px] text-muted-foreground italic">Escudero Content generará los drafts automáticamente tras el Clarify</span>
        )}
      </div>

      {channels.map((channel) => {
        const draft = drafts.find((d) => d.meta.channel === channel);
        const status = draft?.meta.status;
        const st = status ? DRAFT_STATUS[status] : null;
        const isTerminal = status === "approved" || status === "published";

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
              {draft?.meta.iteration ? (
                <span className="text-[9px] text-muted-foreground">v{draft.meta.iteration}</span>
              ) : null}
              <div className="ml-auto flex gap-1.5">
                {draft && (
                  <button
                    onClick={() => onOpenDoc(idea.id, channel)}
                    className="text-[10px] px-2 py-0.5 rounded border border-[#E5E2DC] text-[#7A7A7A] hover:bg-[#E5E2DC] transition-colors"
                    title="Abrir el draft en el editor de documentos"
                  >
                    📄 Abrir
                  </button>
                )}
                {draft && !isTerminal && (
                  <button
                    onClick={() => onSaveDraft(idea.id, channel, draft.body, "approved")}
                    className="text-[10px] px-2 py-0.5 rounded border border-green-200 text-green-700 bg-green-50 hover:bg-green-100 transition-colors"
                  >
                    ✅ Aprobar
                  </button>
                )}
                {status === "approved" && (
                  <span className="text-[10px] text-green-600 font-medium">✓ Listo para publicar</span>
                )}
              </div>
            </div>

            {/* Body preview (read-only — full editing happens in the slideover) */}
            {!draft ? (
              <p className="text-[11px] text-muted-foreground italic py-2">
                Sin draft todavía. Se generará automáticamente cuando Escudero Content ejecute deep-research → Clarify → writer.
              </p>
            ) : (
              <div
                className="text-[12px] text-[#2C3E50] whitespace-pre-wrap leading-relaxed py-1 max-h-32 overflow-hidden cursor-pointer hover:bg-white"
                onClick={() => onOpenDoc(idea.id, channel)}
                title="Click para abrir y editar"
              >
                {draft.body.trim() || "(vacío — Escudero está trabajando)"}
              </div>
            )}

            {/* Iteration request */}
            {draft && !isTerminal && (
              <div className="mt-2">
                {iteratingChannel === channel ? (
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={iterationInput}
                      onChange={(e) => setIterationInput(e.target.value)}
                      className="flex-1 text-[11px] border border-[#E8E2D9] rounded px-2 py-1 focus:outline-none focus:border-rust"
                      placeholder='Ej: "hook más fuerte", "más corto", "cita datos de Bnext"'
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
                    🔄 Pedir iteración
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
