"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/router";
import { cn } from "@/lib/utils";
import { DocSlideOver } from "@/components/shared/doc-slideover";
import { findTaskThreadForDoc, buildTaskThread, type ThreadConfig } from "@/lib/chat-openers";
import { useProjects } from "@/hooks/useProjects";
import { ConfigSection } from "@/components/content/config/ConfigSection";
import { ConfigRow } from "@/components/content/config/ConfigRow";
import { EditButton } from "@/components/content/config/EditButton";
import { ImageGenSetupPanel } from "@/components/content/ImageGenSetupPanel";
import { CarouselSetupPanel } from "@/components/content/CarouselSetupPanel";
import { PublishingSetupPanel } from "@/components/content/PublishingSetupPanel";

// ── Types ──────────────────────────────────────────────────────

interface DocItem {
  path: string;
  name: string;
  status: string;
  taskId?: string;
}
interface CronInfo {
  id: string;
  baseName: string;
  enabled: boolean;
  scheduleHuman: string;
  lastExecution?: { date: string; status: string } | null;
}
interface DispatchChannelConfig {
  transport: "slack" | "discord";
  channel_id: string;
  channel_name?: string;
}
interface ConfigSummary {
  newsPrompts: number;
  monitoredProfiles: number;
  keywordsSeed: number;
  paaQueries: number;
  cadenceActiveChannels: number;
  povPillarsFilled: number;
  povPillarsTotal: number;
}
interface IdeaCounts {
  ready: number;
  approved: number;
  pending: number;
  archived: number;
  published: number;
  total: number;
}
interface CadenceChannelLite {
  key: string;
  active: boolean;
  bestDays?: string[];
  bestTimes: string[];
  profiles?: { name: string }[];
}

const DAY_LABELS = ["L", "M", "X", "J", "V", "S", "D"] as const;
const DAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
function isDayActive(channel: CadenceChannelLite, dayIdx: number): boolean {
  if (!channel.bestDays || channel.bestDays.length === 0) return false;
  return channel.bestDays.includes(DAY_KEYS[dayIdx]);
}

interface Props {
  slug: string;
  openChat: (slug: string, config: ThreadConfig) => void;
  /** Open a slide-over editor for the given section. */
  onRequestEditor: (section: "dispatch-channel" | "news" | "profiles" | "keywords" | "paa" | "cadence") => void;
  /** Switch the parent page to the Ideas tab. */
  onOpenIdeas: () => void;
}

// ── Helpers ────────────────────────────────────────────────────

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

// ── Component ──────────────────────────────────────────────────

export function ConfigurationPipeline({ slug, openChat, onRequestEditor, onOpenIdeas }: Props) {
  const router = useRouter();
  const { data: projectsData } = useProjects(slug || null);
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [crons, setCrons] = useState<CronInfo[]>([]);
  const [configSummary, setConfigSummary] = useState<ConfigSummary | null>(null);
  const [ideaCounts, setIdeaCounts] = useState<IdeaCounts | null>(null);
  const [dispatchChannel, setDispatchChannel] = useState<DispatchChannelConfig | null>(null);
  const [cadenceChannels, setCadenceChannels] = useState<CadenceChannelLite[]>([]);
  const [openDocPath, setOpenDocPath] = useState<string | null>(null);
  const [runningJob, setRunningJob] = useState<string | null>(null);
  const [runFlash, setRunFlash] = useState<{ jobId: string; status: "ok" | "error"; message: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    const [projData, configsData, cronsData, ideasData, dispatchData] = await Promise.all([
      fetch(`/api/projects?slug=${slug}`).then((r) => r.json()).catch(() => ({ projects: [] })),
      fetch(`/api/content-engine/configs?slug=${slug}`).then((r) => r.json()).catch(() => ({ configs: null })),
      fetch(`/api/content-engine/crons?slug=${slug}`).then((r) => r.json()).catch(() => ({ crons: [] })),
      fetch(`/api/content-engine/ideas?slug=${slug}`).then((r) => r.json()).catch(() => ({ ideas: [] })),
      fetch(`/api/content-engine/dispatch-channel?slug=${slug}`).then((r) => r.json()).catch(() => ({ config: null })),
    ]);

    // Docs from P14
    const projects = projData.projects || [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ce = projects.find((p: any) => p.id === "P14") || projects.find((p: any) => p.name === "Content Engine");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tasks = (ce?.tasks || []) as any[];
    const docItems: DocItem[] = tasks.flatMap((t) => {
      if (!t.deliverable_file) return [];
      const paths = Array.isArray(t.deliverable_file) ? t.deliverable_file : [t.deliverable_file];
      return paths
        .filter((p: unknown): p is string => typeof p === "string" && p.length > 0)
        .map((path: string) => ({
          path,
          name: t.name,
          status: t.status || "todo",
          taskId: t.id,
        }));
    });
    setDocs(docItems);

    // Configs summary
    if (configsData.configs) {
      const c = configsData.configs;
      const povTotal = c.povBank ? Object.keys(c.povBank.pov_per_pillar || {}).length : 0;
      const povFilled = c.povBank
        ? Object.values(c.povBank.pov_per_pillar || {}).filter((p) => (p as { core_belief?: string | null }).core_belief).length
        : 0;
      setConfigSummary({
        newsPrompts: c.newsPrompts?.length || 0,
        monitoredProfiles: c.monitoredProfiles?.length || 0,
        keywordsSeed: c.keywordsSeed?.length || 0,
        paaQueries: c.paaQueries?.length || 0,
        cadenceActiveChannels: c.cadence?.channels?.filter((ch: { active: boolean }) => ch.active).length || 0,
        povPillarsFilled: povFilled,
        povPillarsTotal: povTotal,
      });
      setCadenceChannels(c.cadence?.channels || []);
    }
    setCrons(cronsData.crons || []);

    // Idea counts
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allIdeas = (ideasData.ideas || []) as any[];
    setIdeaCounts({
      ready: allIdeas.filter((i) => i.status === "New").length,
      approved: allIdeas.filter((i) => i.status === "Approved").length,
      pending: allIdeas.filter((i) => i.status === "Deferred").length,
      archived: allIdeas.filter((i) => i.status === "Discarded").length,
      published: allIdeas.filter((i) => i.status === "Published").length,
      total: allIdeas.length,
    });

    setDispatchChannel(dispatchData.config || null);
    setLoading(false);
  }, [slug]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const getCron = useCallback((baseName: string) => crons.find((c) => c.baseName === baseName), [crons]);

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
        setRunFlash({ jobId, status: "ok", message: "Lanzada — el resultado tarda unos minutos." });
        setTimeout(() => fetchAll(), 5000);
      } else {
        setRunFlash({ jobId, status: "error", message: data.error || "No se pudo lanzar" });
      }
    } catch (err) {
      setRunFlash({ jobId, status: "error", message: err instanceof Error ? err.message : "Error de red" });
    } finally {
      setRunningJob(null);
      setTimeout(() => setRunFlash((cur) => (cur?.jobId === jobId ? null : cur)), 6000);
    }
  }, [fetchAll]);

  const toggleCron = useCallback(async (jobId: string, enabled: boolean) => {
    await fetch("/api/content-engine/crons", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId, fields: { enabled } }),
    });
    fetchAll();
  }, [fetchAll]);

  const handleDocChat = useCallback((doc: DocItem) => {
    if (!slug) return;
    const taskThread = findTaskThreadForDoc(slug, doc.path, projectsData);
    if (taskThread) { openChat(slug, taskThread); return; }
    if (doc.taskId) {
      const config = buildTaskThread(slug, doc.taskId, doc.name, "P14", { taskStatus: doc.status });
      openChat(slug, config);
    }
  }, [slug, projectsData, openChat]);

  const definedDocs = useMemo(() => {
    const lookup: Record<string, DocItem | undefined> = {};
    for (const d of docs) {
      const file = d.path.split("/").pop() || "";
      if (file.includes("strategy")) lookup.strategy = d;
      else if (file.includes("pillar")) lookup.pillars = d;
      else if (file.includes("setup")) lookup.setup = d;
      else if (file.includes("pov")) lookup.pov = d;
    }
    return [
      { num: 1, key: "strategy", title: "Content Strategy", file: "strategy-decisions.md", badges: "Decisiones · informa Pillars y POV", doc: lookup.strategy },
      { num: 2, key: "pillars", title: "Content Pillars", file: "content-pillars.md", badges: "Temas · definen prompts, keywords, PAA", doc: lookup.pillars },
      { num: 3, key: "setup", title: "Setup configs", file: "setup.md", badges: "Archivos YAML · alimenta News, Perfiles, Keywords, PAA", doc: lookup.setup },
      { num: 4, key: "pov", title: "POV Bank", file: "pov-bank.json", badges: "Tu ángulo único · usado por Classify para puntuar ideas", doc: lookup.pov },
    ];
  }, [docs]);

  if (loading) {
    return <p className="text-center py-8" style={{ color: "var(--sc-fg-muted)" }}>Cargando configuración…</p>;
  }

  const defineDone = definedDocs.filter((d) => d.doc?.status === "completed" || d.doc?.status === "active").length;
  const investigaCount = ["News Monitor", "Competitor Monitor", "Keyword Research", "PAA Monitor"].filter((n) => getCron(n)).length;
  const dispatchCron = getCron("Editorial Dispatch");

  return (
    <div>
      {/* PIPELINE MAP */}
      <PipelineMap
        defineDone={defineDone}
        defineTotal={definedDocs.length}
        antenasCount={investigaCount}
        ideasReady={ideaCounts?.ready || 0}
        ideasTotal={ideaCounts?.total || 0}
        cadenceActive={configSummary?.cadenceActiveChannels || 0}
        dispatchOn={dispatchCron?.enabled || false}
      />

      {/* ① DEFINE */}
      <ConfigSection
        num="1"
        status="done"
        title="Define · La base de tu voz"
        meta={`${defineDone}/${definedDocs.length} documentos · una vez`}
        description={
          <>
            Estos documentos son <b>la fuente de la verdad</b> que todo lo demás lee. Cuando los actualizas,
            cambias cómo Investiga, cómo Idea y cómo Publica el motor.
          </>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {definedDocs.map((d) => (
            <DocRow
              key={d.key}
              num={d.num}
              title={d.title}
              file={d.file}
              badges={d.badges}
              status={d.doc?.status}
              onChat={d.doc ? () => handleDocChat(d.doc!) : undefined}
              onTask={d.doc?.taskId ? () => router.push(`/dashboard/${slug}/projects/P14/tasks/${d.doc!.taskId}`) : undefined}
              onView={d.doc ? () => setOpenDocPath(d.doc!.path) : undefined}
              onDownload={d.doc ? () => window.open(`/api/docs/${d.doc!.path}?download=1`, "_blank") : undefined}
            />
          ))}
        </div>
      </ConfigSection>

      {/* ② INVESTIGA */}
      <ConfigSection
        num="2"
        status="run"
        title="Investiga · Antenas que recolectan señales"
        meta={`${investigaCount} antenas · próx. corrida 07:00`}
        description={
          <>
            Estas antenas leen los configs por pillar que produjiste arriba. Cada ejecución vuelca <b>señales</b>
            (noticias, posts, keywords, preguntas) que alimentan la cola de Ideas →
          </>
        }
      >
        <div className="space-y-2">
          <CronRow
            icon="📰"
            title="News Prompts"
            sub={`${configSummary?.newsPrompts || 0} pillars · lee news-prompts/P*.yml`}
            onEdit={() => onRequestEditor("news")}
            cron={getCron("News Monitor")}
            isRunning={runningJob === getCron("News Monitor")?.id}
            flash={runFlash?.jobId === getCron("News Monitor")?.id ? runFlash : null}
            onRun={(id) => runCron(id)}
            onToggle={(id, on) => toggleCron(id, on)}
          />
          <CronRow
            icon="🕵️"
            title="Perfiles a monitorizar"
            sub={`${configSummary?.monitoredProfiles || 0} perfiles · lee sources.json`}
            onEdit={() => onRequestEditor("profiles")}
            cron={getCron("Competitor Monitor")}
            isRunning={runningJob === getCron("Competitor Monitor")?.id}
            flash={runFlash?.jobId === getCron("Competitor Monitor")?.id ? runFlash : null}
            onRun={(id) => runCron(id)}
            onToggle={(id, on) => toggleCron(id, on)}
          />
          <CronRow
            icon="🔑"
            title="Keywords SEO"
            sub={`${configSummary?.keywordsSeed || 0} pillars · lee keywords-seed/P*.yml`}
            onEdit={() => onRequestEditor("keywords")}
            cron={getCron("Keyword Research")}
            isRunning={runningJob === getCron("Keyword Research")?.id}
            flash={runFlash?.jobId === getCron("Keyword Research")?.id ? runFlash : null}
            onRun={(id) => runCron(id)}
            onToggle={(id, on) => toggleCron(id, on)}
          />
          <CronRow
            icon="❓"
            title="People Also Ask"
            sub={`${configSummary?.paaQueries || 0} pillars · lee paa-queries/P*.yml`}
            onEdit={() => onRequestEditor("paa")}
            cron={getCron("PAA Monitor")}
            isRunning={runningJob === getCron("PAA Monitor")?.id}
            flash={runFlash?.jobId === getCron("PAA Monitor")?.id ? runFlash : null}
            onRun={(id) => runCron(id)}
            onToggle={(id, on) => toggleCron(id, on)}
          />
        </div>
      </ConfigSection>

      {/* ③ IDEA */}
      <ConfigSection
        num="3"
        status="rust"
        title="Idea · El resultado del pipeline"
        meta="Classify + Ideas → vuelca a la cola"
        description={
          <>
            Una antena junta las señales de <b>Investiga</b> con tu <b>POV Bank</b> y crea ideas con angle_draft + pov_confidence.
            Las ideas <b>ready</b> son las que se publican en el siguiente paso →
          </>
        }
      >
        <div
          className="rounded-sc-md border-[2.5px] flex items-center gap-3 p-4"
          style={{
            background: "var(--sc-sun-50)",
            borderColor: "var(--sc-ink)",
            boxShadow: "var(--pop-sm)",
          }}
        >
          <span
            className="grid place-items-center w-10 h-10 rounded-md border-2 text-lg flex-shrink-0"
            style={{ background: "var(--sc-sun-300)", borderColor: "var(--sc-ink)", boxShadow: "var(--pop-xs)" }}
          >💡</span>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-[15px]" style={{ color: "var(--sc-ink)" }}>
              Cola de ideas — <b style={{ color: "var(--sc-ink)" }}>{ideaCounts?.total || 0} en total</b>
            </div>
            <div className="text-xs flex flex-wrap gap-x-2.5 gap-y-1 mt-1" style={{ color: "var(--sc-fg-muted)" }}>
              {!!ideaCounts?.ready && <span><b style={{ color: "var(--sc-sage-500)" }}>{ideaCounts.ready}</b> ready</span>}
              {!!ideaCounts?.approved && <span>· <b style={{ color: "var(--sc-navy-500)" }}>{ideaCounts.approved}</b> aprobadas</span>}
              {!!ideaCounts?.pending && <span>· <b style={{ color: "var(--sc-rust-500)" }}>{ideaCounts.pending}</b> new</span>}
              {!!ideaCounts?.published && <span>· <b>{ideaCounts.published}</b> publicadas</span>}
              {!!ideaCounts?.archived && <span>· {ideaCounts.archived} archivadas</span>}
            </div>
          </div>
          <EditButton variant="primary" onClick={onOpenIdeas}>Abrir cola →</EditButton>
        </div>
      </ConfigSection>

      {/* ④ PUBLICA */}
      <ConfigSection
        num="4"
        status="ok"
        title="Publica · Cómo, dónde y cuándo sale"
        meta="cadencia + canal + dispatch"
        description={
          <>
            La antena <b>Editorial Dispatch</b> mira tu cadencia y tu canal, coge ideas <b>ready</b> y publica.
            Sin cadencia, sin canal, o sin ideas ready → no publica.
          </>
        }
      >
        {/* Cadence summary */}
        <div
          className="rounded-sc-md border-[2px] mb-2 overflow-hidden"
          style={{ borderColor: "var(--sc-ink)", boxShadow: "var(--pop-xs)" }}
        >
          <div
            className="flex items-center gap-2 px-4 py-2.5 border-b-2 border-dashed"
            style={{ background: "var(--sc-paper-2)", borderColor: "var(--sc-ink)" }}
          >
            <span>⏰</span>
            <span className="font-heading uppercase text-[12px] tracking-wider font-bold">Cadencia editorial</span>
            <span className="text-xs" style={{ color: "var(--sc-fg-muted)" }}>
              {cadenceChannels.filter((c) => c.active).length} canales activos
            </span>
            <div className="flex-1" />
            <EditButton size="sm" onClick={() => onRequestEditor("cadence")} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2">
            {cadenceChannels.length === 0 ? (
              <div className="px-4 py-3 text-xs" style={{ color: "var(--sc-fg-muted)" }}>Sin cadencia configurada.</div>
            ) : cadenceChannels.map((c, i) => (
              <div
                key={c.key}
                className="flex flex-col gap-1.5 px-4 py-3"
                style={{
                  borderRight: i % 2 === 0 ? "2px dashed var(--sc-ink)" : undefined,
                  borderTop: i >= 2 ? "2px dashed var(--sc-ink)" : undefined,
                  opacity: c.active ? 1 : 0.55,
                }}
              >
                <div className="flex items-center justify-between">
                  <span
                    className="font-heading uppercase text-[12px] tracking-wider font-bold"
                    style={{ color: c.active ? "var(--sc-ink)" : "var(--sc-fg-subtle)" }}
                  >{c.key}</span>
                  {!c.active && (
                    <span className="font-heading uppercase text-[9px] tracking-wider" style={{ color: "var(--sc-fg-subtle)" }}>off</span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex gap-1">
                    {DAY_LABELS.map((d, idx) => {
                      const active = isDayActive(c, idx);
                      return (
                        <span
                          key={idx}
                          className="grid place-items-center w-5 h-5 rounded font-heading text-[10px] font-bold border"
                          style={{
                            background: active ? "var(--sc-rust-500)" : "var(--sc-paper-2)",
                            color: active ? "var(--sc-paper-3)" : "var(--sc-fg-subtle)",
                            borderColor: active ? "var(--sc-ink)" : "var(--sc-fg-subtle)",
                          }}
                          title={DAY_KEYS[idx]}
                        >{d}</span>
                      );
                    })}
                  </div>
                  <span className="text-xs font-mono" style={{ color: "var(--sc-fg-muted)" }}>
                    {c.bestTimes?.length ? c.bestTimes.join(" · ") : "horario libre"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Channel summary */}
        <ConfigRow
          icon="#"
          title="Canal de envío · a dónde envía"
          sub={
            dispatchChannel ? (
              <>
                <span className="font-mono" style={{ color: "var(--sc-navy-500)" }}>
                  {dispatchChannel.transport === "slack" ? "#" : ""}
                  {dispatchChannel.channel_name || dispatchChannel.channel_id}
                </span>
                <span> · transporte: {dispatchChannel.transport === "slack" ? "Slack" : "Discord"}</span>
              </>
            ) : "Sin configurar"
          }
          right={<EditButton onClick={() => onRequestEditor("dispatch-channel")} />}
        />

        {/* Editorial Dispatch antena */}
        <CronRow
          icon="📨"
          title="Editorial Dispatch"
          sub="lee Cadencia + Canal + Ideas ready · publica"
          cron={dispatchCron}
          isRunning={runningJob === dispatchCron?.id}
          flash={runFlash?.jobId === dispatchCron?.id ? runFlash : null}
          onRun={(id) => runCron(id)}
          onToggle={(id, on) => toggleCron(id, on)}
        />
      </ConfigSection>

      {/* ⑤ PRODUCCIÓN */}
      <ConfigSection
        num="5"
        status="warn"
        title="Producción · Cómo se fabrican y se publican los posts"
        meta="imagen + carrusel + publishing tool"
        description={
          <>
            Una vez una idea está lista, estas piezas controlan <b>cómo se fabrica el post</b> (imagen, carrusel)
            y <b>la herramienta de publishing</b> que programa el envío real.
          </>
        }
      >
        <ImageGenSetupPanel slug={slug} />
        <CarouselSetupPanel slug={slug} />
        <PublishingSetupPanel slug={slug} />
      </ConfigSection>

      <div
        className="mt-6 px-4 py-3 rounded-sc-md border-2 border-dashed text-xs"
        style={{ background: "var(--sc-paper-2)", borderColor: "var(--sc-ink)", color: "var(--sc-fg-soft)" }}
      >
        <b>Cómo se conecta todo:</b> editar un doc en ① → cambia cómo lee una antena en ② → cambia las
        señales que entran a ③ → cambia lo que publica ④. ⑤ controla cómo se fabrica el post antes de salir.
        Cada paso depende del anterior, pero puedes ejecutarlos manualmente con ▶ Ejecutar mientras testeas.
      </div>

      <DocSlideOver
        slug={slug}
        docPath={openDocPath ? (openDocPath.startsWith("brand/") ? openDocPath : `brand/${slug}/${openDocPath}`) : null}
        onClose={() => setOpenDocPath(null)}
      />
    </div>
  );
}

// ── PipelineMap ────────────────────────────────────────────────

function PipelineMap({
  defineDone, defineTotal, antenasCount, ideasReady, ideasTotal, cadenceActive, dispatchOn,
}: {
  defineDone: number; defineTotal: number; antenasCount: number;
  ideasReady: number; ideasTotal: number; cadenceActive: number; dispatchOn: boolean;
}) {
  return (
    <div
      className="rounded-sc-lg border-[3px] p-4 mb-6"
      style={{
        background: "var(--sc-paper-3)",
        borderColor: "var(--sc-ink)",
        boxShadow: "var(--pop-md)",
      }}
    >
      <div className="flex items-center gap-3 mb-3">
        <span className="font-heading uppercase text-[11px] tracking-wider font-bold" style={{ color: "var(--sc-fg-muted)" }}>
          Pipeline · Estado global
        </span>
        <div className="flex-1" />
        <span
          className="font-heading uppercase text-[10px] tracking-wider px-2 py-1 rounded-sc-pill border-2"
          style={{ background: "var(--sc-sage-100)", borderColor: "var(--sc-ink)" }}
        >✓ Healthy</span>
      </div>
      <div className="flex items-stretch gap-0">
        <Station num="1" label="Define" title="La base" sub={`${defineDone}/${defineTotal} docs`} status="ok" accent="var(--sc-sage-500)" active={defineDone === defineTotal} />
        <Arrow />
        <Station num="2" label="Investiga" title="Antenas" sub={`${antenasCount} antenas`} status="ok" accent="var(--sc-navy-500)" />
        <Arrow />
        <Station num="3" label="Idea" title="Cola" sub={`${ideasTotal} total · ${ideasReady} ready`} status="run" accent="var(--sc-sun-500)" />
        <Arrow />
        <Station num="4" label="Publica" title="Cadencia + Dispatch" sub={`${cadenceActive} canales · ${dispatchOn ? "ON" : "OFF"}`} status={dispatchOn ? "ok" : "warn"} accent="var(--sc-rust-500)" />
        <Arrow />
        <Station num="5" label="Producción" title="Imagen + Carrusel + Tool" sub="branding & publishing" status="run" accent="var(--sc-brick-500)" />
      </div>
    </div>
  );
}

function Station({ num, label, title, sub, status, accent, active }: {
  num: string; label: string; title: string; sub: string;
  status: "ok" | "run" | "warn" | "off"; accent: string; active?: boolean;
}) {
  const statusMap = {
    ok: { bg: "var(--sc-sage-500)", label: "Listo" },
    run: { bg: "var(--sc-sun-300)", label: "Activo" },
    warn: { bg: "var(--sc-rust-500)", label: "Pendiente" },
    off: { bg: "var(--sc-fg-muted)", label: "Off" },
  } as const;
  const st = statusMap[status];
  return (
    <div
      className="flex-1 min-w-0 p-3 rounded-sc-md border-[2px]"
      style={{
        background: active ? "var(--sc-sun-100)" : "var(--sc-paper-3)",
        borderColor: "var(--sc-ink)",
        boxShadow: "var(--pop-sm)",
      }}
    >
      <div className="flex justify-between items-center mb-1.5">
        <span
          className="grid place-items-center w-6 h-6 rounded-md border-2 font-heading text-xs font-bold"
          style={{ background: accent, color: "var(--sc-paper-3)", borderColor: "var(--sc-ink)", boxShadow: "var(--pop-xs)" }}
        >{num}</span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full border" style={{ background: st.bg, borderColor: "var(--sc-ink)" }} />
          <span className="font-heading uppercase text-[10px] tracking-wider">{st.label}</span>
        </span>
      </div>
      <div className="font-heading uppercase text-[10px] tracking-wider mb-0.5" style={{ color: "var(--sc-fg-muted)" }}>{label}</div>
      <div className="font-heading font-bold text-base leading-tight mb-1" style={{ color: "var(--sc-ink)" }}>{title}</div>
      <div className="text-xs" style={{ color: "var(--sc-fg-muted)" }}>{sub}</div>
    </div>
  );
}

function Arrow() {
  return (
    <div
      className="w-6 grid place-items-center text-xl font-bold flex-shrink-0"
      style={{ color: "var(--sc-rust-500)" }}
    >▶</div>
  );
}

// ── DocRow (sección Define) ────────────────────────────────────

function DocRow({
  num, title, file, badges, status, onChat, onTask, onView, onDownload,
}: {
  num: number; title: string; file: string; badges: string;
  status?: string;
  onChat?: () => void; onTask?: () => void; onView?: () => void; onDownload?: () => void;
}) {
  const isDone = status === "completed" || status === "active" || status === "in-progress";
  return (
    <ConfigRow
      icon={
        <span className="flex items-center gap-1">
          <span
            className="grid place-items-center w-6 h-6 rounded-md border-2 font-heading text-[12px] font-bold"
            style={{ background: "var(--sc-sun-300)", borderColor: "var(--sc-ink)" }}
          >{num}</span>
        </span>
      }
      title={
        <span className="flex items-center gap-2">
          <span>{title}</span>
          {isDone && (
            <span
              className="grid place-items-center w-[18px] h-[18px] rounded-full border"
              style={{ background: "var(--sc-sage-500)", borderColor: "var(--sc-ink)" }}
            >
              <span className="text-white text-[11px] font-bold leading-none">✓</span>
            </span>
          )}
        </span>
      }
      sub={
        <span className="flex flex-col gap-1">
          <span
            className="inline-block self-start font-mono text-[11px] px-1.5 py-0.5 rounded-sm border border-dashed"
            style={{ background: "var(--sc-paper-2)", borderColor: "var(--sc-ink)" }}
          >{file}</span>
          <span>{badges}</span>
        </span>
      }
      right={
        <div className="flex items-center gap-1.5">
          <DocAction icon="💬" label="Chat sobre este doc" onClick={onChat} />
          <DocAction icon="📋" label="Ir a la tarea" onClick={onTask} />
          <DocAction icon="⤓" label="Descargar" onClick={onDownload} />
          <EditButton variant="primary" size="sm" onClick={onView} disabled={!onView}>Abrir →</EditButton>
        </div>
      }
    />
  );
}

function DocAction({ icon, label, onClick }: { icon: string; label: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      title={label}
      disabled={!onClick}
      onClick={onClick}
      className="grid place-items-center w-7 h-7 rounded border-[1.5px] cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed"
      style={{
        background: "var(--sc-paper-3)",
        borderColor: "var(--sc-ink)",
        boxShadow: "1.5px 1.5px 0 0 var(--sc-ink)",
        fontSize: "13px",
      }}
    >{icon}</button>
  );
}

// ── CronRow (Investiga + Editorial Dispatch) ───────────────────

function CronRow({
  icon, title, sub, cron, isRunning, flash, onRun, onToggle, onEdit,
}: {
  icon: string; title: string; sub: string;
  cron?: CronInfo;
  isRunning: boolean;
  flash?: { status: "ok" | "error"; message: string } | null;
  onRun: (id: string) => void;
  onToggle: (id: string, on: boolean) => void;
  onEdit?: () => void;
}) {
  return (
    <ConfigRow
      icon={icon}
      title={title}
      sub={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span>{sub}</span>
          {cron && (
            <>
              <span>·</span>
              <span
                className="font-heading uppercase text-[10px] tracking-wider px-2 py-0.5 rounded-sc-pill border"
                style={{ background: "var(--sc-rust-100)", borderColor: "var(--sc-ink)", color: "var(--sc-ink)" }}
              >⏰ {cron.scheduleHuman}</span>
            </>
          )}
          {cron?.lastExecution ? (
            <>
              <span>·</span>
              <span className="font-mono text-[11px]" style={{ color: "var(--sc-fg-muted)" }}>
                {formatLastRun(cron.lastExecution.date)}
              </span>
            </>
          ) : (
            <>
              <span>·</span>
              <span className="text-[11px]" style={{ color: "var(--sc-fg-subtle)" }}>nunca ejecutada</span>
            </>
          )}
        </span>
      }
      right={
        <>
          {onEdit && <EditButton size="sm" onClick={onEdit} />}
          {cron && (
            <>
              <button
                type="button"
                onClick={() => onRun(cron.id)}
                disabled={isRunning}
                className={cn(
                  "font-heading uppercase text-[11px] tracking-wider px-2.5 py-1 rounded border-2 sc-pop-hover disabled:opacity-50",
                )}
                style={{ background: "var(--sc-rust-500)", color: "var(--sc-paper-3)", borderColor: "var(--sc-ink)", boxShadow: "var(--pop-xs)" }}
              >{isRunning ? "⏳" : "▶ Ejecutar"}</button>
              <button
                type="button"
                onClick={() => onToggle(cron.id, !cron.enabled)}
                className="w-10 h-5 rounded-full border-2 relative flex-shrink-0"
                style={{
                  background: cron.enabled ? "var(--sc-sage-500)" : "var(--sc-paper-2)",
                  borderColor: "var(--sc-ink)",
                }}
                title={cron.enabled ? "Activo — click para desactivar" : "Desactivado"}
              >
                <span
                  className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border"
                  style={{
                    background: cron.enabled ? "var(--sc-paper-3)" : "var(--sc-fg-muted)",
                    borderColor: "var(--sc-ink)",
                    left: cron.enabled ? "calc(100% - 18px)" : "1px",
                  }}
                />
              </button>
            </>
          )}
        </>
      }
      footer={
        flash ? (
          <div
            className="px-2.5 py-1.5 rounded-sc-md border-2 text-xs"
            style={{
              background: flash.status === "ok" ? "var(--sc-sage-100)" : "var(--sc-brick-bg)",
              borderColor: flash.status === "ok" ? "var(--sc-sage-500)" : "var(--sc-brick-500)",
              color: flash.status === "ok" ? "var(--sc-ink)" : "var(--sc-brick-500)",
            }}
          >
            {flash.status === "ok" ? "✓" : "✗"} {flash.message}
          </div>
        ) : undefined
      }
    />
  );
}
