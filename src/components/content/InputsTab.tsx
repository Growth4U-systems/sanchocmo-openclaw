"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { buildTaskThread, type ThreadConfig } from "@/lib/chat-openers";
import { DocSlideOver } from "@/components/shared/doc-slideover";

interface NewsPromptConfig {
  file: string; pillarId: string; pillarName: string;
  prompt: string; sector: string; language: string[];
}
interface PaaConfig {
  file: string; pillarId: string; pillarName: string;
  prompt: string; language: string[];
}
interface KeywordsConfig {
  file: string; pillarId: string; pillarName: string;
  keywords: string[]; target: string; language: string[];
}
interface Profile {
  id: string;
  type: "company" | "person";
  name: string;
  parent_company_id?: string;
  parent_company_name?: string;
  role?: string;
  tier?: string;
  platforms: Record<string, string>;
  pillars_relevant: string[];
  metadata?: Record<string, unknown>;
}
interface CadenceChannel {
  key: string; active: boolean; frequency: string;
  bestDays: string[]; bestTimes: string[];
  gating: string; contentTypes: string[];
  profiles: { name: string; handle: string; role: string; postsPerWeek: number }[];
}

interface SetupTask {
  projectId: string;
  taskId: string;
  taskName: string;
  skill?: string;
  status?: string;
  deliverableFile?: string;
  chatThreadId?: string;
  updatedAt?: string | null;
}

interface AllConfigs {
  newsPrompts: NewsPromptConfig[];
  paaQueries: PaaConfig[];
  keywordsSeed: KeywordsConfig[];
  monitoredProfiles: Profile[];
  cadence: { businessModel: string; channels: CadenceChannel[] };
  setupTask: SetupTask | null;
}

interface CronInfo {
  id: string; baseName: string; enabled: boolean; scheduleHuman: string;
  lastExecution?: { date: string; status: string } | null;
}

function formatLastRun(iso: string | undefined | null): string | null {
  if (!iso) return null;
  // ISO date strings or YYYY-MM-DD; both parse fine with new Date.
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso; // fallback to raw string
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "ahora mismo";
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `hace ${diffHr}h`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `hace ${diffDays}d`;
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

interface Props { slug: string; openChat: (slug: string, config: ThreadConfig) => void; }

type Section = "news" | "profiles" | "keywords" | "paa" | "cadence";

const SECTIONS: { key: Section; icon: string; label: string }[] = [
  { key: "news", icon: "📰", label: "News Prompts" },
  { key: "profiles", icon: "🕵️", label: "Perfiles a monitorizar" },
  { key: "keywords", icon: "🔑", label: "Keywords SEO" },
  { key: "paa", icon: "❓", label: "People Also Ask" },
  { key: "cadence", icon: "⏰", label: "Cadencia" },
];

interface IdeaLite {
  id: string; pillar_id: string; target_channel: string; status: string; created_at: string;
  pov_confidence?: number; angle_draft?: string; signal?: { date?: string; summary?: string };
}

export function InputsTab({ slug, openChat }: Props) {
  const [configs, setConfigs] = useState<AllConfigs | null>(null);
  const [crons, setCrons] = useState<CronInfo[]>([]);
  const [ideas, setIdeas] = useState<IdeaLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<Section | null>(null);
  const [openDocPath, setOpenDocPath] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    const [cfgRes, cronRes, ideasRes] = await Promise.all([
      fetch(`/api/content-engine/configs?slug=${slug}`).then(r => r.json()).catch(() => ({ configs: null })),
      fetch(`/api/content-engine/crons?slug=${slug}`).then(r => r.json()).catch(() => ({ crons: [] })),
      fetch(`/api/content-engine/ideas?slug=${slug}&status=ready`).then(r => r.json()).catch(() => ({ ideas: [] })),
    ]);
    setConfigs(cfgRes.configs || null);
    setCrons(cronRes.crons || []);
    setIdeas(ideasRes.ideas || []);
    setLoading(false);
  }, [slug]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const toggleCron = useCallback(async (jobId: string, enabled: boolean) => {
    await fetch("/api/content-engine/crons", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId, fields: { enabled } }),
    });
    fetchAll();
  }, [fetchAll]);

  const [runningJob, setRunningJob] = useState<string | null>(null);
  const [runFlash, setRunFlash] = useState<{ jobId: string; status: "ok" | "error"; message: string } | null>(null);
  const [pollingJob, setPollingJob] = useState<string | null>(null);

  const fetchCronsOnly = useCallback(async () => {
    const r = await fetch(`/api/content-engine/crons?slug=${slug}`).then(r => r.json()).catch(() => ({ crons: [] }));
    setCrons(r.crons || []);
  }, [slug]);

  const runCron = useCallback(async (jobId: string) => {
    setRunningJob(jobId);
    setRunFlash(null);
    try {
      const res = await fetch("/api/content-engine/crons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, action: "run" }),
      });
      const data = await res.json();
      if (res.ok) {
        setRunFlash({ jobId, status: "ok", message: "Ejecución lanzada — el resultado tarda unos minutos. Refresco automáticamente." });
        setPollingJob(jobId);
      } else {
        setRunFlash({ jobId, status: "error", message: data.error || "No se pudo lanzar" });
      }
    } catch (err) {
      setRunFlash({ jobId, status: "error", message: err instanceof Error ? err.message : "Error de red" });
    } finally {
      setRunningJob(null);
      setTimeout(() => setRunFlash((cur) => (cur?.jobId === jobId ? null : cur)), 8000);
    }
  }, []);

  // Polling: tras un Ejecutar exitoso, refresca crons cada 60s durante 5 min
  // para que el badge de "última ejecución" se actualice solo cuando el cron termine.
  useEffect(() => {
    if (!pollingJob) return;
    const baselineExec = crons.find((c) => c.id === pollingJob)?.lastExecution?.date || null;
    const start = Date.now();
    const interval = setInterval(async () => {
      await fetchCronsOnly();
      const elapsed = Date.now() - start;
      // Stop after 5 minutes
      if (elapsed > 5 * 60 * 1000) {
        setPollingJob(null);
      }
    }, 60_000);
    // Also do an immediate check after 30s
    const fast = setTimeout(() => fetchCronsOnly(), 30_000);
    return () => {
      clearInterval(interval);
      clearTimeout(fast);
    };
    // We intentionally only react to pollingJob changes (start/stop polling).
    // baselineExec is captured at start; fetchCronsOnly is stable (memoized).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollingJob, fetchCronsOnly]);

  const getCron = (baseName: string) => crons.find(c => c.baseName === baseName);

  if (loading) return <p className="text-muted-foreground text-sm py-8 text-center">Cargando...</p>;
  if (!configs) return <p className="text-muted-foreground text-sm py-8 text-center">Sin configuracion</p>;

  const counts: Record<Section, string> = {
    news: `${configs.newsPrompts.length} pillars`,
    profiles: `${configs.monitoredProfiles.length} perfiles`,
    keywords: `${configs.keywordsSeed.length} pillars`,
    paa: `${configs.paaQueries.length} pillars`,
    cadence: `${configs.cadence.channels.filter(c => c.active).length} canales`,
  };

  const cronMap: Record<Section, string> = {
    news: "News Monitor", profiles: "Competitor Monitor",
    keywords: "Keyword Research", paa: "PAA Monitor", cadence: "",
  };

  const openSetupChat = () => {
    const t = configs.setupTask;
    if (!t) return;
    const cfg = buildTaskThread(slug, t.taskId, t.taskName, t.projectId, {
      taskSkill: t.skill,
      taskStatus: t.status,
      deliverableFile: t.deliverableFile,
    });
    openChat(slug, cfg);
  };

  const docSlideOver = (
    <DocSlideOver
      slug={slug}
      docPath={
        openDocPath
          ? openDocPath.startsWith("brand/")
            ? openDocPath
            : `brand/${slug}/${openDocPath}`
          : null
      }
      onClose={() => setOpenDocPath(null)}
    />
  );

  // Render list
  if (!activeSection) {
    return (
      <div className="space-y-3">
        {/* Editorial calendar — what publishes today + week strip */}
        <EditorialCalendar cadence={configs.cadence} ideas={ideas} />

        {/* Setup configs card — gateway to the content-engine-setup task */}
        {configs.setupTask && (
          <div className="bg-white border border-rust/30 rounded-lg p-4" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <div className="flex items-start gap-3">
              <span className="text-xl">⚙️</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-[#2C3E50]">Setup configs por pillar</span>
                  <Link
                    href={`/dashboard/${slug}/projects/${configs.setupTask.projectId}/tasks/${configs.setupTask.taskId}`}
                    className="text-[10px] text-muted-foreground hover:text-rust bg-muted/40 hover:bg-muted/60 px-1.5 py-0.5 rounded transition-colors no-underline"
                    title="Abrir tarea"
                  >
                    📋 {configs.setupTask.taskId}
                  </Link>
                  {configs.setupTask.status && (
                    <span className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded",
                      configs.setupTask.status === "completed" || configs.setupTask.status === "done"
                        ? "bg-green-50 text-green-700"
                        : configs.setupTask.status === "in-progress"
                        ? "bg-blue-50 text-blue-700"
                        : "bg-muted/40 text-muted-foreground"
                    )}>
                      {configs.setupTask.status}
                    </span>
                  )}
                  {configs.setupTask.updatedAt && (
                    <span className="text-[10px] text-muted-foreground">
                      🕒 {formatLastRun(configs.setupTask.updatedAt)}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Esta tarea genera y mantiene todos los configs de Inputs (news prompts, perfiles,
                  keywords, PAA, cadencia). Para regenerar o ajustar, abre el chat.
                </p>
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  <Link
                    href={`/dashboard/${slug}/projects/${configs.setupTask.projectId}/tasks/${configs.setupTask.taskId}`}
                    className="text-[11px] px-2.5 py-1 rounded border border-rust/30 text-rust hover:bg-rust/10 font-medium no-underline"
                  >
                    📋 Abrir tarea
                  </Link>
                  <button
                    type="button"
                    onClick={openSetupChat}
                    className="text-[11px] px-2.5 py-1 rounded border border-[#E8E2D9] text-[#2C3E50] hover:bg-[#FAFAF8] font-medium"
                  >
                    💬 Abrir chat
                  </button>
                  {configs.setupTask.deliverableFile && (
                    <button
                      type="button"
                      onClick={() => setOpenDocPath(configs.setupTask!.deliverableFile!)}
                      className="text-[11px] px-2.5 py-1 rounded border border-[#E8E2D9] text-[#2C3E50] hover:bg-[#FAFAF8] font-medium"
                    >
                      📄 Ver doc
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {SECTIONS.map(sec => {
          const cron = cronMap[sec.key] ? getCron(cronMap[sec.key]) : null;
          const isRunning = cron ? runningJob === cron.id : false;
          const flash = cron && runFlash?.jobId === cron.id ? runFlash : null;
          return (
            <div key={sec.key} className="bg-white border border-[#E8E2D9] rounded-lg px-4 py-3" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setActiveSection(sec.key)} className="flex items-center gap-2 flex-1 text-left">
                  <span className="text-lg">{sec.icon}</span>
                  <div className="flex-1">
                    <span className="text-sm font-semibold text-[#2C3E50]">{sec.label}</span>
                    <span className="text-[10px] text-muted-foreground ml-2">{counts[sec.key]}</span>
                  </div>
                  {cron && <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">⏰ {cron.scheduleHuman}</span>}
                  {cron && cron.lastExecution && (
                    <span
                      className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded",
                        cron.lastExecution.status === "ok" || cron.lastExecution.status === "success"
                          ? "bg-green-50 text-green-700"
                          : cron.lastExecution.status === "error" || cron.lastExecution.status === "failed"
                          ? "bg-red-50 text-red-700"
                          : "bg-muted/40 text-muted-foreground"
                      )}
                      title={`Última ejecución: ${cron.lastExecution.date} (${cron.lastExecution.status})`}
                    >
                      🕒 {formatLastRun(cron.lastExecution.date)}
                    </span>
                  )}
                  {cron && !cron.lastExecution && (
                    <span className="text-[10px] bg-muted/40 text-muted-foreground px-1.5 py-0.5 rounded" title="Sin ejecuciones registradas">
                      🕒 nunca
                    </span>
                  )}
                  <span className="text-[#7A7A7A] text-xs">▸</span>
                </button>
                {cron && (
                  <>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); runCron(cron.id); }}
                      disabled={isRunning}
                      className="text-[11px] px-2 py-0.5 rounded border border-rust/30 text-rust hover:bg-rust/10 disabled:opacity-50 transition-colors flex-shrink-0"
                      title={isRunning ? "Lanzando..." : `Ejecutar ${cron.baseName} ahora`}
                    >
                      {isRunning ? "⏳" : "▶"} {isRunning ? "Lanzando" : "Ejecutar"}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); toggleCron(cron.id, !cron.enabled); }}
                      className={cn("w-10 h-5 rounded-full transition-colors flex-shrink-0 relative", cron.enabled ? "bg-green-500" : "bg-gray-300")}
                      title={cron.enabled ? "Programación activa — click para desactivar" : "Programación desactivada"}
                    >
                      <span className={cn("absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform", cron.enabled ? "translate-x-5" : "translate-x-0.5")} />
                    </button>
                  </>
                )}
              </div>
              {flash && (
                <div className={cn(
                  "mt-2 text-[10px] px-2 py-1 rounded",
                  flash.status === "ok" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"
                )}>
                  {flash.status === "ok" ? "✅" : "❌"} {flash.message}
                </div>
              )}
            </div>
          );
        })}
        {docSlideOver}
      </div>
    );
  }

  const pillars = configs.newsPrompts.map((p) => ({ id: p.pillarId, name: p.pillarName }));

  // Render detail section
  return (
    <div>
      <button type="button" onClick={() => setActiveSection(null)} className="text-xs text-muted-foreground hover:text-rust mb-4 flex items-center gap-1">
        ← Volver a Inputs
      </button>

      {activeSection === "news" && <NewsPromptsForm configs={configs.newsPrompts} slug={slug} onSaved={fetchAll} />}
      {activeSection === "profiles" && (
        <MonitoredProfilesForm
          profiles={configs.monitoredProfiles}
          pillars={pillars}
          slug={slug}
          onSaved={fetchAll}
        />
      )}
      {activeSection === "keywords" && <KeywordsForm configs={configs.keywordsSeed} slug={slug} onSaved={fetchAll} />}
      {activeSection === "paa" && <PaaForm configs={configs.paaQueries} slug={slug} onSaved={fetchAll} />}
      {activeSection === "cadence" && <CadenceForm cadence={configs.cadence} slug={slug} onSaved={fetchAll} />}
      {docSlideOver}
    </div>
  );
}

// ── EDITORIAL CALENDAR (top of Inputs) ────────────────────────
const CHANNEL_ICONS: Record<string, string> = {
  linkedin: "💼", twitter: "🐦", blog: "📝", newsletter: "📧",
};

const DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const DAY_LABELS_SHORT = ["D", "L", "M", "X", "J", "V", "S"];

function startOfWeek(d: Date): Date {
  const out = new Date(d);
  const day = out.getDay();
  const diff = (day === 0 ? -6 : 1) - day; // Monday as start
  out.setDate(out.getDate() + diff);
  out.setHours(0, 0, 0, 0);
  return out;
}

function isPublishDay(channel: CadenceChannel, dayKey: string): boolean {
  if (!channel.active) return false;
  // If best_days is empty, treat as "any day"
  if (!channel.bestDays || channel.bestDays.length === 0) return true;
  return channel.bestDays.includes(dayKey);
}

function EditorialCalendar({
  cadence, ideas,
}: { cadence: { businessModel: string; channels: CadenceChannel[] }; ideas: IdeaLite[] }) {
  const today = new Date();
  const todayKey = DAY_KEYS[today.getDay()];

  const channels = cadence.channels.filter((c) => c.active);

  // Slots for today: each active channel that publishes today
  const todaySlots = channels.filter((c) => isPublishDay(c, todayKey));

  // Candidate count per channel (uses target_channel + adapter rule between linkedin/twitter)
  const candidatesFor = (channelKey: string): IdeaLite[] => {
    return ideas.filter((i) => {
      if (i.target_channel === channelKey) return true;
      if (channelKey === "linkedin" && i.target_channel === "twitter") return true;
      if (channelKey === "twitter" && i.target_channel === "linkedin") return true;
      return false;
    });
  };

  // Week strip: 7 days starting Monday
  const weekStart = startOfWeek(today);
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    const dayKey = DAY_KEYS[d.getDay()];
    const slots = channels.filter((c) => isPublishDay(c, dayKey));
    const isToday = d.toDateString() === today.toDateString();
    return { date: d, dayKey, slots, isToday };
  });

  return (
    <div
      className="bg-gradient-to-br from-amber-50 to-white border border-amber-200 rounded-lg p-4"
      style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}
    >
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold text-[#2C3E50]">📅 Calendario editorial</h2>
        <span className="text-[10px] text-muted-foreground">
          Hoy: {today.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "short" })}
        </span>
      </div>

      {/* Today: slots with candidate counts */}
      <div className="space-y-1.5 mb-4">
        {todaySlots.length === 0 ? (
          <p className="text-[12px] text-muted-foreground italic">
            Ningún canal publica hoy según la cadencia.
          </p>
        ) : (
          todaySlots.map((ch) => {
            const cands = candidatesFor(ch.key);
            const times = ch.bestTimes.length ? ch.bestTimes.join(" · ") : "horario libre";
            return (
              <div key={ch.key} className="bg-white border border-amber-200 rounded-md px-3 py-2 flex items-center gap-2 flex-wrap">
                <span className="text-base">{CHANNEL_ICONS[ch.key] || "📄"}</span>
                <span className="text-xs font-semibold text-[#2C3E50] capitalize">{ch.key}</span>
                <span className="text-[10px] text-muted-foreground">{times}</span>
                <span className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded ml-auto",
                  cands.length > 0 ? "bg-green-50 text-green-700" : "bg-yellow-50 text-yellow-700"
                )}>
                  {cands.length === 0 ? "Sin candidatas ready" : `${cands.length} candidata${cands.length === 1 ? "" : "s"} ready`}
                </span>
                {ch.profiles.length > 0 && (
                  <span className="text-[10px] text-muted-foreground">
                    👤 {ch.profiles.map((p) => p.name).join(", ")}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Week strip */}
      <div>
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Esta semana</div>
        <div className="grid grid-cols-7 gap-1">
          {weekDays.map(({ date, dayKey, slots, isToday }) => (
            <div
              key={dayKey + date.getDate()}
              className={cn(
                "rounded-md border p-1.5 min-h-[64px] flex flex-col items-center text-center",
                isToday
                  ? "bg-rust/10 border-rust/40"
                  : slots.length > 0
                  ? "bg-white border-[#E8E2D9]"
                  : "bg-muted/20 border-[#E8E2D9]"
              )}
              title={dayKey}
            >
              <div className={cn("text-[10px] font-semibold", isToday ? "text-rust" : "text-muted-foreground")}>
                {DAY_LABELS_SHORT[date.getDay()]} {date.getDate()}
              </div>
              <div className="flex flex-wrap gap-0.5 justify-center mt-1">
                {slots.length === 0 ? (
                  <span className="text-[9px] text-muted-foreground/70">—</span>
                ) : (
                  slots.map((ch) => (
                    <span key={ch.key} className="text-sm leading-none" title={ch.key}>
                      {CHANNEL_ICONS[ch.key] || "·"}
                    </span>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── NEWS PROMPTS FORM ─────────────────────────────────────────
function NewsPromptsForm({ configs, slug, onSaved }: { configs: NewsPromptConfig[]; slug: string; onSaved: () => void }) {
  const [data, setData] = useState(configs);
  const [saving, setSaving] = useState(false);

  const updatePrompt = (pi: number, val: string) => {
    const next = [...data];
    next[pi] = { ...next[pi], prompt: val };
    setData(next);
  };
  const save = async () => {
    setSaving(true);
    for (const p of data) {
      await fetch("/api/content-engine/configs", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, configId: `news-prompts-${p.pillarId}`, data: p }),
      });
    }
    onSaved(); setSaving(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-[#2C3E50]">📰 News Prompts</h2>
        <button onClick={save} disabled={saving} className="text-[11px] px-3 py-1.5 rounded-md bg-rust text-white font-medium hover:bg-rust/90 disabled:opacity-50">
          {saving ? "Guardando..." : "💾 Guardar"}
        </button>
      </div>
      <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-[11px] text-blue-700">
        <strong>Como funciona:</strong> Cada prompt se ejecuta diariamente (7am L-V) via Brave Search / Perplexity.
        Genera resultados DIFERENTES cada dia segun lo que sea trending. Edita el prompt para ajustar que tipo de noticias buscas por pillar.
      </div>
      {data.map((pillar, pi) => (
        <div key={pillar.pillarId} className="bg-white border border-[#E8E2D9] rounded-lg p-4" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-xs font-semibold text-[#2C3E50]">{pillar.pillarId}: {pillar.pillarName}</h3>
            {pillar.sector && <span className="text-[9px] bg-muted/40 px-1.5 py-0.5 rounded">{pillar.sector}</span>}
            {pillar.language.map((l, i) => (
              <span key={i} className="text-[9px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">{l}</span>
            ))}
          </div>
          <textarea
            value={pillar.prompt}
            onChange={(e) => updatePrompt(pi, e.target.value)}
            className="w-full text-[12px] border border-[#E8E2D9] rounded-lg p-3 min-h-[100px] resize-y focus:outline-none focus:border-rust leading-relaxed"
            placeholder="Prompt para buscar noticias relevantes a este pillar..."
          />
        </div>
      ))}
    </div>
  );
}

// ── MONITORED PROFILES FORM ───────────────────────────────────
function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const PLATFORMS: { key: string; label: string; placeholder: string }[] = [
  { key: "web",        label: "Web",        placeholder: "https://..." },
  { key: "linkedin",   label: "LinkedIn",   placeholder: "https://www.linkedin.com/..." },
  { key: "twitter",    label: "X/Twitter",  placeholder: "https://x.com/..." },
  { key: "instagram",  label: "Instagram",  placeholder: "https://instagram.com/..." },
  { key: "youtube",    label: "YouTube",    placeholder: "https://youtube.com/..." },
  { key: "newsletter", label: "Newsletter", placeholder: "https://..." },
  { key: "podcast",    label: "Podcast",    placeholder: "https://..." },
];

function emptyProfile(type: "company" | "person"): Profile {
  return {
    id: "", type, name: "",
    role: "", tier: "",
    platforms: {}, pillars_relevant: [],
  };
}

function MonitoredProfilesForm({
  profiles: initial, pillars, slug, onSaved,
}: {
  profiles: Profile[];
  pillars: { id: string; name: string }[];
  slug: string;
  onSaved: () => void;
}) {
  const [profiles, setProfiles] = useState<Profile[]>(initial);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<"all" | "company" | "person">("all");
  const [search, setSearch] = useState("");

  const companies = useMemo(
    () => profiles.filter((p) => p.type === "company").map((p) => ({ id: p.id, name: p.name })),
    [profiles]
  );

  const update = (idx: number, patch: Partial<Profile>) => {
    setProfiles((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      // Auto-derive id from name if id is empty
      if (patch.name !== undefined && !next[idx].id) {
        const base = slugify(patch.name || "");
        const prefix = next[idx].type === "person" && !next[idx].parent_company_id ? "creator__" : "";
        next[idx].id = base ? `${prefix}${base}` : "";
      }
      return next;
    });
  };

  const updatePlatform = (idx: number, key: string, value: string) => {
    setProfiles((prev) => {
      const next = [...prev];
      const platforms = { ...next[idx].platforms };
      if (value.trim()) platforms[key] = value;
      else delete platforms[key];
      next[idx] = { ...next[idx], platforms };
      return next;
    });
  };

  const togglePillar = (idx: number, pillarId: string) => {
    setProfiles((prev) => {
      const next = [...prev];
      const has = next[idx].pillars_relevant.includes(pillarId);
      next[idx] = {
        ...next[idx],
        pillars_relevant: has
          ? next[idx].pillars_relevant.filter((p) => p !== pillarId)
          : [...next[idx].pillars_relevant, pillarId],
      };
      return next;
    });
  };

  const remove = (idx: number) => {
    setProfiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const add = (type: "company" | "person") => {
    setProfiles((prev) => [...prev, emptyProfile(type)]);
  };

  const save = async () => {
    setSaving(true);
    // Hygiene before save
    const finalized = profiles
      .filter((p) => (p.name || "").trim())
      .map((p) => {
        const id = p.id || (p.type === "person" && !p.parent_company_id ? `creator__${slugify(p.name)}` : slugify(p.name));
        return { ...p, id };
      });
    await fetch("/api/content-engine/configs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, configId: "monitored-profiles", data: finalized }),
    });
    onSaved();
    setSaving(false);
  };

  const visible = profiles
    .map((p, idx) => ({ p, idx }))
    .filter(({ p }) => filter === "all" || p.type === filter)
    .filter(({ p }) => !search.trim() || p.name.toLowerCase().includes(search.toLowerCase()));

  const counts = {
    all: profiles.length,
    companies: profiles.filter((p) => p.type === "company").length,
    persons: profiles.filter((p) => p.type === "person").length,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-sm font-bold text-[#2C3E50]">🕵️ Perfiles a monitorizar</h2>
        <div className="flex gap-1.5">
          <button
            onClick={() => add("company")}
            className="text-[11px] px-3 py-1.5 rounded-md border border-[#E8E2D9] text-[#2C3E50] hover:bg-[#FAFAF8] font-medium"
          >
            + Empresa
          </button>
          <button
            onClick={() => add("person")}
            className="text-[11px] px-3 py-1.5 rounded-md border border-[#E8E2D9] text-[#2C3E50] hover:bg-[#FAFAF8] font-medium"
          >
            + Persona
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="text-[11px] px-3 py-1.5 rounded-md bg-rust text-white font-medium hover:bg-rust/90 disabled:opacity-50"
          >
            {saving ? "Guardando..." : "💾 Guardar"}
          </button>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-[11px] text-amber-800">
        <strong>Lista unificada:</strong> empresas competidoras + sus founders + voces del sector.
        Los founders aparecen como cards independientes con badge <code>↳ empresa</code>.
        Todo se guarda en <code>market-and-us/competitors/sources.json</code> (schema v2: array plano de profiles).
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {[
          { key: "all" as const, label: `Todos (${counts.all})` },
          { key: "company" as const, label: `Empresas (${counts.companies})` },
          { key: "person" as const, label: `Personas (${counts.persons})` },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={cn(
              "text-[11px] px-2.5 py-1 rounded-md font-medium transition-colors",
              filter === t.key ? "bg-rust text-white" : "bg-muted/40 text-muted-foreground hover:bg-muted"
            )}
          >
            {t.label}
          </button>
        ))}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre..."
          className="text-[11px] border border-[#E8E2D9] rounded px-2 py-1 ml-auto focus:outline-none focus:border-rust w-48"
        />
      </div>

      {visible.length === 0 ? (
        <p className="text-[11px] text-muted-foreground text-center py-8">
          Sin perfiles que coincidan con el filtro
        </p>
      ) : (
        <div className="space-y-2">
          {visible.map(({ p, idx }) => (
            <ProfileCard
              key={`${p.id}-${idx}`}
              profile={p}
              idx={idx}
              pillars={pillars}
              companies={companies}
              onUpdate={update}
              onUpdatePlatform={updatePlatform}
              onTogglePillar={togglePillar}
              onRemove={remove}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ProfileCard({
  profile, idx, pillars, companies, onUpdate, onUpdatePlatform, onTogglePillar, onRemove,
}: {
  profile: Profile;
  idx: number;
  pillars: { id: string; name: string }[];
  companies: { id: string; name: string }[];
  onUpdate: (idx: number, patch: Partial<Profile>) => void;
  onUpdatePlatform: (idx: number, key: string, value: string) => void;
  onTogglePillar: (idx: number, pillarId: string) => void;
  onRemove: (idx: number) => void;
}) {
  const [showAllPlatforms, setShowAllPlatforms] = useState(
    Object.keys(profile.platforms).length > 4
  );
  const visiblePlatforms = showAllPlatforms ? PLATFORMS : PLATFORMS.slice(0, 4);

  const isFounder = profile.type === "person" && profile.parent_company_id;
  const parentName = profile.parent_company_name
    || companies.find((c) => c.id === profile.parent_company_id)?.name;

  return (
    <div
      className="bg-white border border-[#E8E2D9] rounded-lg p-3 space-y-2"
      style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}
    >
      {/* Header row */}
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="text"
          value={profile.name}
          onChange={(e) => onUpdate(idx, { name: e.target.value })}
          placeholder={profile.type === "company" ? "Nombre de la empresa" : "Nombre de la persona"}
          className="flex-1 min-w-[180px] text-xs font-semibold text-[#2C3E50] border border-[#E8E2D9] rounded px-2 py-1.5 focus:outline-none focus:border-rust"
        />

        {/* Type badge */}
        <span
          className={cn(
            "text-[10px] font-semibold px-2 py-0.5 rounded",
            profile.type === "company"
              ? "bg-blue-50 text-blue-700 border border-blue-200"
              : "bg-purple-50 text-purple-700 border border-purple-200"
          )}
        >
          {profile.type === "company" ? "Empresa" : "Persona"}
        </span>

        {/* Parent company badge / selector for persons */}
        {profile.type === "person" && (
          <div className="flex items-center gap-1">
            {isFounder && parentName ? (
              <span className="text-[10px] bg-muted/40 text-muted-foreground px-2 py-0.5 rounded">
                ↳ {parentName}
              </span>
            ) : (
              <span className="text-[10px] bg-muted/40 text-muted-foreground px-2 py-0.5 rounded">
                Voz del sector
              </span>
            )}
            <select
              value={profile.parent_company_id || ""}
              onChange={(e) => onUpdate(idx, { parent_company_id: e.target.value || undefined })}
              className="text-[10px] border border-[#E8E2D9] rounded px-1.5 py-0.5 bg-white focus:outline-none focus:border-rust"
              title="Empresa asociada (founders)"
            >
              <option value="">— sin empresa —</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Tier (companies only) */}
        {profile.type === "company" && (
          <select
            value={profile.tier || ""}
            onChange={(e) => onUpdate(idx, { tier: e.target.value })}
            className="text-[11px] border border-[#E8E2D9] rounded px-1.5 py-1 bg-white focus:outline-none focus:border-rust"
            title="Tier"
          >
            <option value="">Tier</option>
            <option value="A">Tier A</option>
            <option value="B">Tier B</option>
            <option value="C">Tier C</option>
          </select>
        )}

        <button
          onClick={() => onRemove(idx)}
          className="text-red-400 hover:text-red-600 text-xs px-1"
          title="Eliminar perfil"
        >
          🗑️
        </button>
      </div>

      {/* Role (persons only) */}
      {profile.type === "person" && (
        <input
          type="text"
          value={profile.role || ""}
          onChange={(e) => onUpdate(idx, { role: e.target.value })}
          placeholder="Rol / focus (ej: CEO & Founder, Growth en B2B SaaS, ...)"
          className="w-full text-[11px] text-muted-foreground border border-[#E8E2D9] rounded px-2 py-1 focus:outline-none focus:border-rust italic"
        />
      )}

      {/* Platforms */}
      <div className="grid grid-cols-2 md:grid-cols-2 gap-1.5">
        {visiblePlatforms.map(({ key, label, placeholder }) => (
          <div key={key} className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground w-14 flex-shrink-0">{label}</span>
            <input
              type="text"
              value={profile.platforms[key] || ""}
              onChange={(e) => onUpdatePlatform(idx, key, e.target.value)}
              placeholder={placeholder}
              className="flex-1 text-[11px] border border-[#E8E2D9] rounded px-2 py-1 focus:outline-none focus:border-rust"
            />
          </div>
        ))}
      </div>
      {!showAllPlatforms && (
        <button
          onClick={() => setShowAllPlatforms(true)}
          className="text-[10px] text-rust hover:underline"
        >
          + Más plataformas ({PLATFORMS.length - 4})
        </button>
      )}

      {/* Pillars */}
      <div className="flex flex-wrap gap-1 items-center pt-1">
        <span className="text-[10px] text-muted-foreground mr-1">Pillars:</span>
        {pillars.length === 0 ? (
          <span className="text-[10px] text-muted-foreground italic">Sin pillars configurados</span>
        ) : (
          pillars.map((p) => {
            const active = profile.pillars_relevant.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onTogglePillar(idx, p.id)}
                className={cn(
                  "text-[10px] px-2 py-0.5 rounded-full border transition-colors",
                  active
                    ? "bg-rust/10 border-rust/40 text-rust"
                    : "bg-white border-[#E8E2D9] text-muted-foreground hover:border-rust/40"
                )}
                title={p.name}
              >
                <span className="font-semibold">{p.id}</span>
                <span className="ml-1 opacity-80">{p.name}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── KEYWORDS FORM ─────────────────────────────────────────────
function KeywordsForm({ configs, slug, onSaved }: { configs: KeywordsConfig[]; slug: string; onSaved: () => void }) {
  const [data, setData] = useState(configs);
  const [saving, setSaving] = useState(false);

  const updateKw = (pi: number, ki: number, val: string) => {
    const next = [...data];
    next[pi] = { ...next[pi], keywords: [...next[pi].keywords] };
    next[pi].keywords[ki] = val;
    setData(next);
  };
  const addKw = (pi: number) => {
    const next = [...data];
    next[pi] = { ...next[pi], keywords: [...next[pi].keywords, ""] };
    setData(next);
  };
  const removeKw = (pi: number, ki: number) => {
    const next = [...data];
    next[pi] = { ...next[pi], keywords: next[pi].keywords.filter((_, i) => i !== ki) };
    setData(next);
  };
  const save = async () => {
    setSaving(true);
    for (const p of data) {
      await fetch("/api/content-engine/configs", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, configId: `keywords-seed-${p.pillarId}`, data: p }),
      });
    }
    onSaved(); setSaving(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-[#2C3E50]">🔑 Keywords SEO</h2>
        <button onClick={save} disabled={saving} className="text-[11px] px-3 py-1.5 rounded-md bg-rust text-white font-medium hover:bg-rust/90 disabled:opacity-50">
          {saving ? "Guardando..." : "💾 Guardar"}
        </button>
      </div>
      {data.map((pillar, pi) => (
        <div key={pillar.pillarId} className="bg-white border border-[#E8E2D9] rounded-lg p-4" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
          <h3 className="text-xs font-semibold text-[#2C3E50] mb-2">{pillar.pillarId}: {pillar.pillarName}</h3>
          <div className="space-y-1.5">
            {pillar.keywords.map((kw, ki) => (
              <div key={ki} className="flex items-center gap-1.5">
                <input type="text" value={kw} onChange={(e) => updateKw(pi, ki, e.target.value)}
                  className="flex-1 text-[12px] border border-[#E8E2D9] rounded px-2 py-1.5 focus:outline-none focus:border-rust" placeholder="Keyword..." />
                <button onClick={() => removeKw(pi, ki)} className="text-red-400 hover:text-red-600 text-xs px-1">🗑️</button>
              </div>
            ))}
            <button onClick={() => addKw(pi)} className="text-[11px] text-rust hover:underline">+ Anadir keyword</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── PAA FORM ──────────────────────────────────────────────────
function PaaForm({ configs, slug, onSaved }: { configs: PaaConfig[]; slug: string; onSaved: () => void }) {
  const [data, setData] = useState(configs);
  const [saving, setSaving] = useState(false);

  const updatePrompt = (pi: number, val: string) => {
    const next = [...data];
    next[pi] = { ...next[pi], prompt: val };
    setData(next);
  };
  const save = async () => {
    setSaving(true);
    for (const p of data) {
      await fetch("/api/content-engine/configs", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, configId: `paa-queries-${p.pillarId}`, data: p }),
      });
    }
    onSaved(); setSaving(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-[#2C3E50]">❓ People Also Ask</h2>
        <button onClick={save} disabled={saving} className="text-[11px] px-3 py-1.5 rounded-md bg-rust text-white font-medium hover:bg-rust/90 disabled:opacity-50">
          {saving ? "Guardando..." : "💾 Guardar"}
        </button>
      </div>
      <div className="bg-purple-50 border border-purple-200 rounded-lg px-3 py-2 text-[11px] text-purple-700">
        <strong>Como funciona:</strong> Cada prompt se ejecuta semanalmente (lunes 6am) usando la
        <strong> API de DataforSEO</strong> para extraer las preguntas reales de "People Also Ask"
        que muestra Google para cada pillar. Las preguntas descubiertas alimentan el Idea Queue
        como fuente de contenido.
      </div>
      {data.map((pillar, pi) => (
        <div key={pillar.pillarId} className="bg-white border border-[#E8E2D9] rounded-lg p-4" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-xs font-semibold text-[#2C3E50]">{pillar.pillarId}: {pillar.pillarName}</h3>
            {pillar.language.map((l, i) => (
              <span key={i} className="text-[9px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded">{l}</span>
            ))}
          </div>
          <textarea
            value={pillar.prompt}
            onChange={(e) => updatePrompt(pi, e.target.value)}
            className="w-full text-[12px] border border-[#E8E2D9] rounded-lg p-3 min-h-[100px] resize-y focus:outline-none focus:border-rust leading-relaxed"
            placeholder="Prompt para descubrir preguntas reales de la audiencia..."
          />
        </div>
      ))}
    </div>
  );
}

// ── CADENCE FORM ──────────────────────────────────────────────
const DAYS_OF_WEEK: { key: string; label: string }[] = [
  { key: "monday",    label: "L" },
  { key: "tuesday",   label: "M" },
  { key: "wednesday", label: "X" },
  { key: "thursday",  label: "J" },
  { key: "friday",    label: "V" },
  { key: "saturday",  label: "S" },
  { key: "sunday",    label: "D" },
];

const GATING_OPTIONS = [
  { value: "ungated",              label: "Ungated" },
  { value: "gated_top_funnel",     label: "Gated (top funnel)" },
  { value: "gated_bottom_funnel",  label: "Gated (bottom funnel)" },
  { value: "gated",                label: "Gated" },
];

function CadenceForm({
  cadence, slug, onSaved,
}: {
  cadence: { businessModel: string; channels: CadenceChannel[] };
  slug: string;
  onSaved: () => void;
}) {
  const [businessModel, setBusinessModel] = useState(cadence.businessModel);
  const [channels, setChannels] = useState<CadenceChannel[]>(cadence.channels);
  const [saving, setSaving] = useState(false);

  const updateChannel = (idx: number, patch: Partial<CadenceChannel>) => {
    setChannels((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  };

  const toggleDay = (idx: number, dayKey: string) => {
    const ch = channels[idx];
    const has = ch.bestDays.includes(dayKey);
    updateChannel(idx, {
      bestDays: has ? ch.bestDays.filter((d) => d !== dayKey) : [...ch.bestDays, dayKey],
    });
  };

  const updateTimesString = (idx: number, csv: string) => {
    const times = csv.split(",").map((s) => s.trim()).filter(Boolean);
    updateChannel(idx, { bestTimes: times });
  };

  const updateContentTypesString = (idx: number, csv: string) => {
    const types = csv.split(",").map((s) => s.trim()).filter(Boolean);
    updateChannel(idx, { contentTypes: types });
  };

  const updateProfile = (idx: number, pi: number, patch: Partial<CadenceChannel["profiles"][number]>) => {
    setChannels((prev) => {
      const next = [...prev];
      const profiles = [...next[idx].profiles];
      profiles[pi] = { ...profiles[pi], ...patch };
      next[idx] = { ...next[idx], profiles };
      return next;
    });
  };

  const addProfile = (idx: number) => {
    setChannels((prev) => {
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        profiles: [...next[idx].profiles, { name: "", handle: "", role: "", postsPerWeek: 0 }],
      };
      return next;
    });
  };

  const removeProfile = (idx: number, pi: number) => {
    setChannels((prev) => {
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        profiles: next[idx].profiles.filter((_, i) => i !== pi),
      };
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    await fetch("/api/content-engine/configs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        configId: "cadence",
        data: { businessModel, channels },
      }),
    });
    onSaved();
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-[#2C3E50]">⏰ Cadencia</h2>
        <button
          onClick={save}
          disabled={saving}
          className="text-[11px] px-3 py-1.5 rounded-md bg-rust text-white font-medium hover:bg-rust/90 disabled:opacity-50"
        >
          {saving ? "Guardando..." : "💾 Guardar"}
        </button>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-[11px] text-amber-800">
        <strong>Cadencia editable:</strong> define para cada canal cuándo y con qué frecuencia
        se publica. El cron Editorial Dispatch lee esto cada mañana para decidir los slots del día.
        El archivo guardado es <code>content/configs/cadence-config.yml</code>.
      </div>

      <div className="flex items-center gap-2 text-[11px]">
        <span className="text-muted-foreground">Modelo de negocio:</span>
        <input
          type="text"
          value={businessModel}
          onChange={(e) => setBusinessModel(e.target.value)}
          className="w-24 border border-[#E8E2D9] rounded px-2 py-1 focus:outline-none focus:border-rust"
        />
      </div>

      <div className="space-y-3">
        {channels.map((ch, idx) => (
          <div
            key={ch.key}
            className="bg-white border border-[#E8E2D9] rounded-lg p-3 space-y-2"
            style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}
          >
            {/* Header: active toggle + name + frequency + gating */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => updateChannel(idx, { active: !ch.active })}
                className={cn(
                  "w-9 h-5 rounded-full transition-colors flex-shrink-0 relative",
                  ch.active ? "bg-green-500" : "bg-gray-300"
                )}
                title={ch.active ? "Activo" : "Inactivo"}
              >
                <span
                  className={cn(
                    "absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform",
                    ch.active ? "translate-x-4" : "translate-x-0.5"
                  )}
                />
              </button>
              <span className="text-sm font-semibold text-[#2C3E50] capitalize min-w-[80px]">{ch.key}</span>
              <input
                type="text"
                value={ch.frequency}
                onChange={(e) => updateChannel(idx, { frequency: e.target.value })}
                placeholder="Frecuencia (ej: 3-5x/week)"
                className="flex-1 min-w-[150px] text-[11px] border border-[#E8E2D9] rounded px-2 py-1 focus:outline-none focus:border-rust"
              />
              <select
                value={ch.gating}
                onChange={(e) => updateChannel(idx, { gating: e.target.value })}
                className="text-[11px] border border-[#E8E2D9] rounded px-2 py-1 bg-white focus:outline-none focus:border-rust"
              >
                {GATING_OPTIONS.map((g) => (
                  <option key={g.value} value={g.value}>{g.label}</option>
                ))}
              </select>
            </div>

            {/* Best days */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-muted-foreground w-24">Mejores días:</span>
              <div className="flex gap-0.5">
                {DAYS_OF_WEEK.map((d) => {
                  const active = ch.bestDays.includes(d.key);
                  return (
                    <button
                      key={d.key}
                      type="button"
                      onClick={() => toggleDay(idx, d.key)}
                      className={cn(
                        "w-7 h-7 rounded-full text-[10px] font-semibold border transition-colors",
                        active
                          ? "bg-rust/10 border-rust/40 text-rust"
                          : "bg-white border-[#E8E2D9] text-muted-foreground hover:border-rust/40"
                      )}
                      title={d.key}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Best times */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground w-24">Horarios:</span>
              <input
                type="text"
                value={ch.bestTimes.join(", ")}
                onChange={(e) => updateTimesString(idx, e.target.value)}
                placeholder="08:30, 12:00, 17:30"
                className="flex-1 text-[11px] border border-[#E8E2D9] rounded px-2 py-1 focus:outline-none focus:border-rust"
              />
            </div>

            {/* Content types */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground w-24">Tipos:</span>
              <input
                type="text"
                value={ch.contentTypes.join(", ")}
                onChange={(e) => updateContentTypesString(idx, e.target.value)}
                placeholder="hot-take, listicle, case-study"
                className="flex-1 text-[11px] border border-[#E8E2D9] rounded px-2 py-1 focus:outline-none focus:border-rust"
              />
            </div>

            {/* Profiles */}
            <div className="space-y-1.5 pt-1 border-t border-[#E8E2D9]">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">Perfiles ({ch.profiles.length})</span>
                <button
                  type="button"
                  onClick={() => addProfile(idx)}
                  className="text-[10px] text-rust hover:underline"
                >
                  + Añadir perfil
                </button>
              </div>
              {ch.profiles.map((p, pi) => (
                <div key={pi} className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={p.name}
                    onChange={(e) => updateProfile(idx, pi, { name: e.target.value })}
                    placeholder="Nombre"
                    className="flex-1 text-[11px] border border-[#E8E2D9] rounded px-2 py-1 focus:outline-none focus:border-rust"
                  />
                  <input
                    type="text"
                    value={p.handle}
                    onChange={(e) => updateProfile(idx, pi, { handle: e.target.value })}
                    placeholder="handle"
                    className="w-32 text-[11px] border border-[#E8E2D9] rounded px-2 py-1 focus:outline-none focus:border-rust"
                  />
                  <input
                    type="text"
                    value={p.role}
                    onChange={(e) => updateProfile(idx, pi, { role: e.target.value })}
                    placeholder="rol"
                    className="w-28 text-[11px] border border-[#E8E2D9] rounded px-2 py-1 focus:outline-none focus:border-rust"
                  />
                  <input
                    type="number"
                    value={p.postsPerWeek}
                    onChange={(e) => updateProfile(idx, pi, { postsPerWeek: Number(e.target.value) || 0 })}
                    placeholder="x/sem"
                    min={0}
                    className="w-16 text-[11px] border border-[#E8E2D9] rounded px-2 py-1 focus:outline-none focus:border-rust"
                  />
                  <button
                    onClick={() => removeProfile(idx, pi)}
                    className="text-red-400 hover:text-red-600 text-xs px-1"
                    title="Eliminar perfil"
                  >
                    🗑️
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
