"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/router";
import { cn } from "@/lib/utils";
import { buildTaskThread, type ThreadConfig } from "@/lib/chat-openers";
import { DocSlideOver } from "@/components/shared/doc-slideover";
import { DraftCards } from "@/components/content/DraftCards";

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
  content_task_id?: string;
  content_task_channels?: string[];
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
  New: number;
  Approved: number;
  Draft: number;
  "Pending Media": number;
  Ready: number;
  Published: number;
  Discarded: number;
  Deferred: number;
}

// Per-status display: Spanish label + comic palette tokens. Defined once so
// the table badges and downstream UIs share the same mapping.
const STATUS_VISUAL: Record<string, { label: string; bg: string; fg: string }> = {
  New:             { label: "Nueva",      bg: "var(--sc-sage-100)",  fg: "var(--sc-ink)" },
  Approved:        { label: "Aprobada",   bg: "var(--sc-navy-500)",  fg: "var(--sc-paper-3)" },
  Draft:           { label: "Borrador",   bg: "var(--sc-sun-300)",   fg: "var(--sc-ink)" },
  "Pending Media": { label: "Media",      bg: "var(--sc-sun-100)",   fg: "var(--sc-ink)" },
  Ready:           { label: "Lista",      bg: "var(--sc-sage-500)",  fg: "var(--sc-paper-3)" },
  Published:       { label: "Publicada",  bg: "var(--sc-sage-700)",  fg: "var(--sc-paper-3)" },
  Deferred:        { label: "Diferida",   bg: "var(--sc-sun-100)",   fg: "var(--sc-ink)" },
  Discarded:       { label: "Descartada", bg: "var(--sc-brick-bg)",  fg: "var(--sc-brick-500)" },
};

interface Props {
  slug: string;
  openChat?: (slug: string, config: ThreadConfig) => void;
}

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

// Pick a writer skill based on the idea's target_channel
function writerSkillFor(channel: string): string {
  if (channel === "blog") return "seo-content";
  if (channel === "newsletter") return "newsletter";
  return "social-writer"; // linkedin, twitter, default
}

export function IdeaQueueTab({ slug, openChat }: Props) {
  const router = useRouter();
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
  const [filterFramework, setFilterFramework] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"dispatch" | "confidence" | "date" | "pillar">("dispatch");
  const [todayOnly, setTodayOnly] = useState<boolean>(false);

  // Tick cada 30s para refrescar los "hace Xd/h/min" sin recargar la página.
  const [, setNowTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNowTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const fetchIdeas = useCallback(() => {
    const statusParam = filter !== "all" ? `&status=${encodeURIComponent(filter)}` : "";
    fetch(`/api/content-engine/content-tasks-pool?slug=${slug}${statusParam}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          setIdeas(data.contentTasks || []);
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

  const saveDraft = useCallback(async (ideaId: string, channel: string, body: string) => {
    await fetch("/api/content-engine/drafts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, ideaId, channel, body }),
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
      setDispatchFlash({ status: "error", message: "Antena Editorial Dispatch no encontrada" });
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
    { key: "New", label: "Nuevas", count: counts?.New },
    { key: "Approved", label: "Aprobadas", count: counts?.Approved },
    { key: "Draft", label: "Borrador", count: counts?.Draft },
    { key: "Pending Media", label: "Media", count: counts?.["Pending Media"] },
    { key: "Ready", label: "Listas", count: counts?.Ready },
    { key: "Published", label: "Publicadas", count: counts?.Published },
    { key: "Deferred", label: "Diferidas", count: counts?.Deferred },
    { key: "Discarded", label: "Descartadas", count: counts?.Discarded },
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
    .filter((i) => filterFramework === "all" || i.content_type === filterFramework)
    .filter((i) => !todayOnly || i.dispatch_date === today)
    .sort((a, b) => {
      if (sortBy === "confidence") return (b.pov_confidence || 0) - (a.pov_confidence || 0);
      if (sortBy === "pillar") return a.pillar_id.localeCompare(b.pillar_id);
      if (sortBy === "date") {
        const aD = new Date(a.signal?.date || a.created_at).getTime();
        const bD = new Date(b.signal?.date || b.created_at).getTime();
        return bD - aD;
      }
      // default: dispatch — today first, then by signal date desc
      const aToday = a.dispatch_date === today ? 1 : 0;
      const bToday = b.dispatch_date === today ? 1 : 0;
      if (aToday !== bToday) return bToday - aToday;
      const aDate = new Date(a.signal?.date || a.created_at).getTime();
      const bDate = new Date(b.signal?.date || b.created_at).getTime();
      return bDate - aDate;
    });

  const todayCount = ideas.filter((i) => i.dispatch_date === today).length;

  return (
    <div>
      {/* DispatchBanner — Sancho Comic */}
      <div
        className="rounded-sc-lg border-[3px] grid grid-cols-[52px_1fr_auto_auto] gap-3.5 items-center p-3.5 mb-3.5"
        style={{
          background: "var(--sc-paper-2)",
          borderColor: "var(--sc-ink)",
          boxShadow: "var(--pop-md)",
        }}
      >
        <span className="sc-burst grid place-items-center w-[52px] h-[52px] text-[10px] font-heading text-center leading-none">
          SLACK<br />NEXT
        </span>
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-heading uppercase text-sm tracking-wider font-bold" style={{ color: "var(--sc-ink)" }}>
              Editorial Dispatch
            </span>
            <span
              className="font-heading uppercase text-[10px] tracking-wider px-2 py-0.5 rounded-sc-pill border inline-flex items-center gap-1"
              style={{ background: "var(--sc-rust-100)", borderColor: "var(--sc-ink)", color: "var(--sc-ink)" }}
            >⚡ AUTO</span>
          </div>
          <span className="text-xs" style={{ color: "var(--sc-fg-muted)" }}>
            Selecciona candidatas según cadencia y las envía a Slack/Discord para que elijas allí.
            {dispatchCron?.lastExecution && (
              <> · Última: <b style={{ color: "var(--sc-ink)" }}>{formatLastRun(dispatchCron.lastExecution.date)}</b></>
            )}
            {!dispatchCron?.lastExecution && <> · Sin ejecuciones</>}
            {dispatchCron && <> · Antena diaria 08:30</>}
          </span>
        </div>
        <button
          type="button"
          onClick={runDispatchCron}
          disabled={dispatching || !dispatchCron}
          className="font-heading uppercase text-[12px] tracking-wider px-3 py-2 rounded-sc-md border-2 sc-pop-hover disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background: "var(--sc-rust-500)",
            color: "var(--sc-paper-3)",
            borderColor: "var(--sc-ink)",
            boxShadow: "var(--pop-sm)",
          }}
          title={dispatchCron ? "Lanzar dispatch ahora" : "Antena no encontrada"}
        >
          {dispatching ? "⏳ Lanzando" : dispatchPolling ? "⏳ En curso" : "▶ Ejecutar ahora"}
        </button>
        {dispatchPolling && (
          <button
            type="button"
            onClick={() => { fetchIdeas(); fetchPillarsAndCrons(); }}
            className="font-heading uppercase text-[12px] tracking-wider px-2.5 py-2 rounded-sc-md border-2 sc-pop-hover"
            style={{ background: "var(--sc-paper-3)", borderColor: "var(--sc-ink)", boxShadow: "var(--pop-xs)" }}
            title="Refrescar"
          >🔄</button>
        )}
      </div>
      {dispatchFlash && (
        <div
          className="mb-3 text-xs font-heading font-bold px-3 py-2 rounded-sc-md border-2"
          style={{
            background: dispatchFlash.status === "ok" ? "var(--sc-sage-100)" : "var(--sc-brick-bg)",
            borderColor: dispatchFlash.status === "ok" ? "var(--sc-sage-500)" : "var(--sc-brick-500)",
            color: dispatchFlash.status === "ok" ? "var(--sc-ink)" : "var(--sc-brick-500)",
          }}
        >
          {dispatchFlash.status === "ok" ? "✓" : "✗"} {dispatchFlash.message}
        </div>
      )}

      {/* FilterBar — Sancho Comic */}
      <div
        className="rounded-sc-lg border-[2.5px] p-3 mb-3.5 flex gap-2 flex-wrap items-center"
        style={{ background: "var(--sc-paper-3)", borderColor: "var(--sc-ink)", boxShadow: "var(--pop-sm)" }}
      >
        <div className="flex">
          {FILTERS.map((f, i, arr) => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className="font-heading uppercase text-[12px] tracking-wider px-3 py-1.5 border-[2.5px] inline-flex items-center gap-1.5 transition-all"
                style={{
                  background: active ? "var(--sc-rust-500)" : "var(--sc-paper-3)",
                  color: active ? "var(--sc-paper-3)" : "var(--sc-ink)",
                  borderColor: "var(--sc-ink)",
                  borderRadius: i === 0 ? "8px 0 0 8px" : i === arr.length - 1 ? "0 8px 8px 0" : "0",
                  borderRightWidth: i === arr.length - 1 ? 2.5 : 0,
                }}
              >
                {f.label}
                {f.count !== undefined && (
                  <span
                    className="font-mono text-[10.5px] px-1.5 py-0.5 rounded-sc-pill border"
                    style={{
                      background: active ? "var(--sc-sun-300)" : "var(--sc-paper-3)",
                      borderColor: "var(--sc-ink)",
                      color: "var(--sc-ink)",
                    }}
                  >{f.count}</span>
                )}
              </button>
            );
          })}
        </div>
        <div className="flex-1" />
        <button
          onClick={() => setTodayOnly((v) => !v)}
          className="font-heading uppercase text-[11px] tracking-wider px-2.5 py-1.5 rounded-sc-md border-2 sc-pop-hover inline-flex items-center gap-1.5"
          style={{
            background: todayOnly ? "var(--sc-sun-300)" : "var(--sc-paper-3)",
            borderColor: "var(--sc-ink)",
            boxShadow: "var(--pop-xs)",
          }}
        >
          {todayOnly ? "✓" : "📬"} Solo HOY ({todayCount})
        </button>
        <select
          value={filterChannel}
          onChange={(e) => setFilterChannel(e.target.value)}
          className="font-heading uppercase text-[11px] tracking-wider px-2.5 py-1.5 rounded-sc-md border-2 focus:outline-none"
          style={{ background: "var(--sc-paper-3)", borderColor: "var(--sc-ink)", boxShadow: "var(--pop-xs)" }}
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
          className="font-heading uppercase text-[11px] tracking-wider px-2.5 py-1.5 rounded-sc-md border-2 focus:outline-none"
          style={{ background: "var(--sc-paper-3)", borderColor: "var(--sc-ink)", boxShadow: "var(--pop-xs)" }}
        >
          <option value="all">Pillar: Todos</option>
          {pillars.map((p) => (
            <option key={p.id} value={p.id}>{p.id} — {p.name.slice(0, 28)}{p.name.length > 28 ? "…" : ""}</option>
          ))}
        </select>
        <select
          value={filterDate}
          onChange={(e) => setFilterDate(e.target.value as typeof filterDate)}
          className="font-heading uppercase text-[11px] tracking-wider px-2.5 py-1.5 rounded-sc-md border-2 focus:outline-none"
          style={{ background: "var(--sc-paper-3)", borderColor: "var(--sc-ink)", boxShadow: "var(--pop-xs)" }}
        >
          <option value="all">Fecha: Todas</option>
          <option value="today">Hoy</option>
          <option value="week">≤ 7 días</option>
          <option value="month">≤ 30 días</option>
        </select>
        <select
          value={filterSource}
          onChange={(e) => setFilterSource(e.target.value as typeof filterSource)}
          className="font-heading uppercase text-[11px] tracking-wider px-2.5 py-1.5 rounded-sc-md border-2 focus:outline-none"
          style={{ background: "var(--sc-paper-3)", borderColor: "var(--sc-ink)", boxShadow: "var(--pop-xs)" }}
        >
          <option value="all">Fuente: Todas</option>
          <option value="news">📰 News</option>
          <option value="paa">❓ PAA</option>
          <option value="keywords">🔑 Keywords</option>
          <option value="competitors">🕵️ Competidores</option>
          <option value="other">Otra</option>
        </select>
        <select
          value={filterFramework}
          onChange={(e) => setFilterFramework(e.target.value)}
          className="font-heading uppercase text-[11px] tracking-wider px-2.5 py-1.5 rounded-sc-md border-2 focus:outline-none"
          style={{ background: "var(--sc-paper-3)", borderColor: "var(--sc-ink)", boxShadow: "var(--pop-xs)" }}
        >
          <option value="all">Framework: Todos</option>
          <option value="Hot Take">🔥 Hot Take</option>
          <option value="Proof Post">📚 Proof</option>
          <option value="Framework">🧩 Framework</option>
          <option value="Personal Story">💬 Personal</option>
          <option value="Listicle">📋 Listicle</option>
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className="font-heading uppercase text-[11px] tracking-wider px-2.5 py-1.5 rounded-sc-md border-2 focus:outline-none"
          style={{ background: "var(--sc-paper-3)", borderColor: "var(--sc-ink)", boxShadow: "var(--pop-xs)" }}
          title="Ordenar"
        >
          <option value="dispatch">↕ Dispatch primero</option>
          <option value="confidence">↕ Confianza</option>
          <option value="date">↕ Fecha</option>
          <option value="pillar">↕ Pillar</option>
        </select>
      </div>

      {/* Hint + count above table */}
      <div className="flex gap-1.5 items-center text-xs mb-2.5" style={{ color: "var(--sc-fg-muted)" }}>
        <span>ℹ</span>
        <span>Mostrando <b style={{ color: "var(--sc-ink)" }}>{visibleIdeas.length} de {ideas.length}</b> ideas. La aprobación normalmente ocurre en Slack/Discord — esta vista es para auditar y aprobar en bulk.</span>
      </div>

      {/* Ideas WIDE TABLE */}
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
        <>
        <div
          className="rounded-sc-lg overflow-hidden border-[3px]"
          style={{ background: "var(--sc-paper-3)", borderColor: "var(--sc-ink)", boxShadow: "var(--pop-md)" }}
        >
          <div className="overflow-x-auto relative">
            <table style={{ borderCollapse: "collapse", fontSize: 13, tableLayout: "fixed", minWidth: "100%" }}>
              <colgroup>
                <col style={{ width: 70 }} />
                <col style={{ width: 720 }} />
                <col style={{ width: 520 }} />
                <col style={{ width: 80 }} />
                <col style={{ width: 140 }} />
              </colgroup>
              <thead>
                <tr style={{ background: "var(--sc-paper-2)", borderBottom: "2.5px solid var(--sc-ink)" }}>
                  {[
                    { l: "Canal", w: 70 },
                    { l: "Idea · meta · descripción · fuente", w: 720 },
                    { l: "Ángulo editorial", w: 520 },
                    { l: "Fecha", w: 80 },
                    { l: "Acciones", w: 140 },
                  ].map((h) => (
                    <th
                      key={h.l}
                      style={{
                        padding: "12px 14px",
                        textAlign: "left",
                        fontFamily: "var(--font-heading)",
                        fontSize: 11,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        color: "var(--sc-ink)",
                        fontWeight: 700,
                        whiteSpace: "nowrap",
                        background: "var(--sc-paper-2)",
                      }}
                    >{h.l}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleIdeas.map((idea, idx) => {
                  const recDays = signalRecencyDays(idea.signal?.date);
                  const isToday = idea.dispatch_date === today;
                  const pillarName = pillars.find((p) => p.id === idea.pillar_id)?.name;
                  const tv = CONTENT_TYPE_VISUAL[idea.content_type] || { label: idea.content_type.toUpperCase(), bg: "bg-aged text-ink", emoji: "📄" };
                  const cv = CHANNEL_VISUAL[idea.target_channel] || { label: idea.target_channel, emoji: "📄" };
                  const conf = Math.round((idea.pov_confidence || 0) * 100);
                  const cellBase: React.CSSProperties = { padding: "16px 12px", verticalAlign: "top", background: isToday ? "var(--sc-sun-50)" : "var(--sc-paper-3)" };
                  const last = idx === visibleIdeas.length - 1;
                  const isNew = idea.status === "New";
                  const isApproved = idea.status === "Approved";
                  return (
                    <tr key={idea.id} style={{ borderBottom: last ? "none" : "2.5px solid var(--sc-ink)" }}>
                      {/* Canal */}
                      <td style={cellBase}>
                        <div className="flex flex-col items-start gap-1">
                          <span className="text-xl">{cv.emoji}</span>
                          <span className="font-heading uppercase text-[11px] tracking-wider font-bold" style={{ color: "var(--sc-ink)" }}>
                            {cv.label}
                          </span>
                          {isToday && (
                            <span
                              className="font-heading uppercase text-[9px] tracking-wider px-1.5 py-0.5 rounded-sc-pill border"
                              style={{ background: "var(--sc-sun-300)", borderColor: "var(--sc-ink)", color: "var(--sc-ink)" }}
                            >📬 HOY</span>
                          )}
                        </div>
                      </td>

                      {/* Idea · meta · descripción · fuente */}
                      <td style={{ ...cellBase, padding: "16px 16px 16px 12px" }}>
                        {/* Meta strip — pillar · framework · status · confianza */}
                        <div className="flex flex-wrap gap-1.5 items-center mb-2">
                          <span
                            className="font-mono text-[10.5px] font-bold inline-flex items-center px-1.5 py-0.5 rounded-sc-pill border"
                            style={{ background: "var(--sc-rust-100)", color: "var(--sc-rust-700)", borderColor: "var(--sc-rust-500)" }}
                            title={pillarName || idea.pillar_id}
                          >{idea.pillar_id}{pillarName ? ` · ${pillarName.slice(0, 28)}${pillarName.length > 28 ? "…" : ""}` : ""}</span>
                          <span
                            className={cn("font-heading uppercase text-[9.5px] tracking-wider px-1.5 py-0.5 rounded-sc-pill border-[1.5px] inline-flex items-center gap-1", tv.bg)}
                            style={{ borderColor: "var(--sc-ink)" }}
                          >
                            <span>{tv.emoji}</span>{tv.label}
                          </span>
                          {(() => {
                            const sv = STATUS_VISUAL[idea.status] || { label: idea.status, bg: "var(--sc-sun-100)", fg: "var(--sc-ink)" };
                            return (
                              <span
                                className="font-heading uppercase text-[9.5px] tracking-wider px-1.5 py-0.5 rounded-sc-pill border inline-flex items-center"
                                style={{ background: sv.bg, color: sv.fg, borderColor: "var(--sc-ink)" }}
                              >{sv.label}</span>
                            );
                          })()}
                          <span className="inline-flex items-center gap-1.5" title={`Confianza ${conf}%`}>
                            <span
                              className="inline-block h-2 w-12 rounded-sc-pill border overflow-hidden"
                              style={{ borderColor: "var(--sc-ink)", background: "var(--sc-paper-3)" }}
                            >
                              <span
                                className="block h-full"
                                style={{
                                  width: `${conf}%`,
                                  background: conf >= 80 ? "var(--sc-sage-500)" : conf >= 60 ? "var(--sc-sun-300)" : "var(--sc-brick-500)",
                                }}
                              />
                            </span>
                            <span className="font-mono text-[10.5px] font-bold">{conf}%</span>
                          </span>
                        </div>

                        <div
                          className="font-heading font-extrabold leading-tight mb-2"
                          style={{ fontSize: 18, color: "var(--sc-ink)", textWrap: "balance" }}
                        >
                          {getIdeaTitle(idea)}
                        </div>
                        <div className="text-[13px] leading-relaxed mb-2" style={{ color: "var(--sc-fg-soft)" }}>
                          {idea.signal?.summary}
                        </div>
                        <div className="flex flex-wrap gap-1.5 items-center text-xs" style={{ color: "var(--sc-fg-muted)" }}>
                          <span>🌐</span>
                          <span>Fuente:</span>
                          {idea.signal?.source && (
                            <b style={{ color: "var(--sc-fg-soft)" }}>{idea.signal.source}</b>
                          )}
                          {idea.signal?.url && (
                            <a
                              href={idea.signal.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-mono text-[11px] underline"
                              style={{ color: "var(--sc-navy-500)", textUnderlineOffset: 3 }}
                              title={idea.signal.url}
                            >{idea.signal.url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 38)}{idea.signal.url.length > 45 ? "…" : ""} ↗</a>
                          )}
                          {idea.signal?.date && (
                            <>
                              <span>·</span>
                              <span>📅 {idea.signal.date}{recDays !== null && ` (${recDays}d)`}</span>
                            </>
                          )}
                        </div>
                      </td>

                      {/* Ángulo editorial */}
                      <td style={cellBase}>
                        <div className="flex gap-2 items-stretch">
                          <span style={{ width: 3, alignSelf: "stretch", background: "var(--sc-rust-500)", borderRadius: 1.5, flexShrink: 0 }} />
                          <span
                            className="text-[13px] leading-relaxed italic"
                            style={{ color: "var(--sc-ink)", textWrap: "pretty" }}
                          >{stripPovPrefix(idea.angle_draft)}</span>
                        </div>
                      </td>

                      {/* Fecha contenido */}
                      <td style={cellBase}>
                        <div className="flex flex-col gap-1">
                          <span className="font-mono text-[13px] font-bold" style={{ color: "var(--sc-ink)" }}>
                            {idea.signal?.date ? new Date(idea.signal.date).toLocaleDateString("es-ES", { day: "numeric", month: "short" }) : "—"}
                          </span>
                          <span className="text-[10px]" style={{ color: "var(--sc-fg-muted)" }}>
                            {idea.signal?.date ? new Date(idea.signal.date).getFullYear() : ""}
                          </span>
                          {idea.dispatch_date && (
                            <span className="text-[10px]" style={{ color: "var(--sc-rust-500)" }}>
                              dispatch {idea.dispatch_date.slice(5)}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Acciones — vertical stack */}
                      <td style={{ ...cellBase, padding: "16px 12px" }}>
                        {idea.status === "Discarded" && (
                          <span className="text-xs italic" style={{ color: "var(--sc-fg-muted)" }}>
                            Descartada
                          </span>
                        )}
                        {isNew && (
                          <div className="flex flex-col gap-1.5">
                            <button
                              onClick={() => updateIdea(idea.id, { status: "Approved", approved_at: new Date().toISOString(), approved_via: "mc-ui" })}
                              className="font-heading uppercase text-[12px] tracking-wider px-2.5 py-1.5 rounded border-2 sc-pop-hover inline-flex items-center justify-center gap-1.5"
                              style={{ background: "var(--sc-sage-500)", color: "var(--sc-paper-3)", borderColor: "var(--sc-ink)", boxShadow: "var(--pop-xs)" }}
                            >✓ Aprobar</button>
                            <button
                              onClick={() => updateIdea(idea.id, { status: "Deferred", deferred_at: new Date().toISOString(), deferred_by: "mc-ui" })}
                              className="font-heading uppercase text-[11px] tracking-wider px-2.5 py-1.5 rounded border-2 sc-pop-hover inline-flex items-center justify-center gap-1.5"
                              style={{ background: "var(--sc-sun-300)", color: "var(--sc-ink)", borderColor: "var(--sc-ink)", boxShadow: "var(--pop-xs)" }}
                            >🕒 Más tarde</button>
                            <button
                              onClick={() => updateIdea(idea.id, { status: "Discarded" })}
                              className="font-heading uppercase text-[11px] tracking-wider px-2.5 py-1.5 rounded border-2 sc-pop-hover inline-flex items-center justify-center gap-1.5"
                              style={{ background: "var(--sc-paper-3)", color: "var(--sc-ink)", borderColor: "var(--sc-ink)", boxShadow: "var(--pop-xs)" }}
                            >✗ Descartar</button>
                          </div>
                        )}
                        {idea.status === "Deferred" && (
                          <button
                            onClick={() => updateIdea(idea.id, { status: "New", deferred_at: null, deferred_by: null })}
                            className="font-heading uppercase text-[11px] tracking-wider px-2.5 py-1.5 rounded border-2 sc-pop-hover inline-flex items-center justify-center gap-1.5"
                            style={{ background: "var(--sc-sage-100)", color: "var(--sc-ink)", borderColor: "var(--sc-ink)", boxShadow: "var(--pop-xs)" }}
                          >↺ Volver a queue</button>
                        )}
                        {(isApproved || idea.status === "Draft" || idea.status === "Pending Media" || idea.status === "Ready" || idea.status === "Published") && (
                          <div className="flex flex-col gap-1.5">
                            <button
                              onClick={() => {
                                if (idea.content_task_id && idea.project_id && idea.project_task_id) {
                                  const channel = idea.content_task_channels?.[0] || idea.target_channel || "linkedin";
                                  router.push(`/dashboard/${slug}/projects/${idea.project_id}/tasks/${idea.project_task_id}/content/${idea.content_task_id}/draft/${channel}`);
                                  return;
                                }
                                if (!openChat || !idea.project_task_id || !idea.project_id) {
                                  setExpandedIdea(expandedIdea === idea.id ? null : idea.id);
                                  return;
                                }
                                const cfg = buildTaskThread(slug, idea.project_task_id, `${idea.content_type} · ${idea.pillar_id}`, idea.project_id, { taskSkill: writerSkillFor(idea.target_channel), taskChannel: idea.target_channel, taskType: "content" });
                                openChat(slug, cfg);
                              }}
                              className="font-heading uppercase text-[12px] tracking-wider px-2.5 py-1.5 rounded border-2 sc-pop-hover inline-flex items-center justify-center gap-1.5"
                              style={{ background: "var(--sc-rust-500)", color: "var(--sc-paper-3)", borderColor: "var(--sc-ink)", boxShadow: "var(--pop-xs)" }}
                            >💬 Abrir draft</button>
                          </div>
                        )}
                      </td>

                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Draft expansion (legacy fallback) */}
        {expandedIdea && (() => {
          const idea = visibleIdeas.find((i) => i.id === expandedIdea);
          if (!idea || idea.status !== "Approved") return null;
          return (
            <div className="mt-4">
              <DraftCards
                idea={idea}
                slug={slug}
                onSaveDraft={saveDraft}
                onRequestIteration={requestIteration}
                onOpenDoc={openDraftDoc}
                onRefresh={fetchIdeas}
              />
            </div>
          );
        })()}
        </>
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

