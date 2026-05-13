import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useSlugSync } from "@/hooks/useSlugSync";
import { useProjects } from "@/hooks/useProjects";
import { EmptyState } from "@/components/shared/empty-state";
import { DocSlideOver } from "@/components/shared/doc-slideover";
import { useBrandBrain } from "@/hooks/useBrandBrain";
import { useOpenChat, useSendMessage } from "@/hooks/useChat";
import { useChatStore } from "@/stores/chat";
import { cn } from "@/lib/utils";

function EmbedWrapper({ children }: { children: React.ReactNode }) {
  return <div className="p-4">{children}</div>;
}

// ============================================================
// Trust Engine constants — ported from legacy mission-control.html
// ============================================================

interface TEModuleDef {
  id: string;
  name: string;
  icon: string;
  cmd: string;
  skill: string;
  file: string; // JSON filename for module data
}

interface TEPhaseDef {
  num: number;
  title: string;
  desc: string;
  modules: TEModuleDef[];
}

const TE_PHASES: TEPhaseDef[] = [
  {
    num: 1,
    title: "An\u00e1lisis",
    desc: "Analizar presencia en IA y buscadores, identificar brechas",
    modules: [
      { id: "geo-analysis", name: "GEO Analysis", icon: "\uD83E\uDD16", cmd: "trust-engine geo", skill: "trust-engine", file: "geo-analysis.json" },
      { id: "serp-analysis", name: "SERP Analysis", icon: "\uD83D\uDCCA", cmd: "trust-engine serp", skill: "trust-engine", file: "serp-analysis.json" },
      { id: "gap-analysis", name: "Gap Analysis", icon: "\uD83D\uDD17", cmd: "trust-engine gaps", skill: "trust-engine", file: "gap-analysis.json" },
      { id: "recommendations", name: "Recommendations", icon: "\u2705", cmd: "trust-engine recs", skill: "trust-engine", file: "recommendations.json" },
    ],
  },
  {
    num: 2,
    title: "Acci\u00f3n",
    desc: "Generar activos ejecutables: keywords e influencers",
    modules: [
      { id: "keywords", name: "Keywords", icon: "\uD83D\uDD11", cmd: "trust-engine keywords", skill: "trust-engine", file: "keywords.json" },
      { id: "influencers", name: "Influencers", icon: "\uD83C\uDFAF", cmd: "trust-engine influencers", skill: "trust-engine", file: "influencers.json" },
    ],
  },
];

const TE_MODULES = TE_PHASES.flatMap((p) => p.modules);

type TEStatus = "completed" | "running" | "pending" | "locked" | "error";

// ============================================================
// Types for API responses
// ============================================================

interface TERunState {
  modules: Record<string, {
    status: TEStatus;
    depends_on?: string[];
    last_run?: string;
    error?: string;
  }>;
}

// ============================================================
// Component
// ============================================================

// ============================================================
// Trust Engine intro content (shared between empty state and active view)
// ============================================================

function TrustEngineIntro({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white dark:bg-card border border-border rounded-xl mb-5 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2.5 px-4 py-3.5 text-left hover:bg-muted/20 transition-colors"
      >
        <span className={cn("text-[10px] text-muted-foreground transition-transform", open && "rotate-90")}>▶</span>
        <span className="text-[13px] font-bold text-foreground">🔒 ¿Qué es el Trust Engine?</span>
      </button>
      {open && (
        <div className="px-4 pb-5 pl-9 text-[13px] text-muted-foreground leading-[1.75]">
          <p>
            Antes de comprarte, tu cliente pasa por <strong className="text-rust font-bold">4 momentos</strong> donde necesita confiar en ti.
            Hoy, esos puntos de contacto probablemente están vacíos — y eso mata la conversión.
          </p>

          <h4 className="text-foreground text-[13px] font-bold mt-4 mb-1.5">El Customer Journey de la confianza</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 my-3">
            {[
              { before: "📱 Ve un post en redes sociales", after: "De alguien que le da confianza", label: "Cubierto por: Influencers" },
              { before: "🖥️ Llega a tu landing", after: "Con incentivo y social proof", label: "Cubierto por: Own Media" },
              { before: "📰 Lee un artículo sobre ti", after: "De un tercero independiente", label: "Cubierto por: SERP + Gap + Keywords" },
              { before: "🔍 Te busca en Google", after: "Encuentra resultados positivos", label: "Cubierto por: SEO Audit + GEO Analysis" },
            ].map((c) => (
              <div key={c.label} className="bg-muted/10 border border-border/50 rounded-lg p-2.5">
                <div className="text-[11px] text-muted-foreground mb-1">{c.before}</div>
                <div className="text-[12px] text-rust font-semibold">→ {c.after}</div>
                <div className="text-[10px] text-muted-foreground mt-1">{c.label}</div>
              </div>
            ))}
          </div>

          <p className="mb-2.5">
            Búsquedas típicas de tu cliente:{" "}
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[11px] font-medium">&quot;opiniones de [tu marca]&quot;</span>{" "}
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[11px] font-medium">&quot;¿es seguro [tu marca]?&quot;</span>{" "}
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[11px] font-medium">&quot;alternativas a [tu marca]&quot;</span>
          </p>

          <h4 className="text-foreground text-[13px] font-bold mt-4 mb-1.5">¿Qué hace Trust Engine?</h4>
          <ul className="list-disc ml-4 space-y-1">
            <li><strong className="text-rust">Fase 1 — Auditoría:</strong> Analiza qué señales de confianza existen hoy (SEO, medios propios, IA, SERP)</li>
            <li><strong className="text-rust">Fase 2 — Análisis:</strong> Detecta dónde falta cobertura de terceros y genera recomendaciones priorizadas</li>
            <li><strong className="text-rust">Fase 3 — Acción:</strong> Genera 3 listas accionables: keywords para contenido, oportunidades en medios, e influencers/partners</li>
          </ul>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Component
// ============================================================

export default function TrustEnginePage() {
  const router = useRouter();
  const isEmbed = router.query.embed === "1";
  const slug = useSlugSync();
  const t = useTranslations("trustEngine");
  const openChat = useOpenChat();

  // ── Foundation: get niches (ICPs) ──
  const { data: foundation } = useBrandBrain(slug);
  const availableNiches = useMemo(() => {
    if (!foundation?.brand_summary?.icps) return [];
    return foundation.brand_summary.icps.map((item, i) => {
      const name = typeof item === "string" ? item : (item as { name?: string }).name || String(item);
      const nicheSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      return { id: `icp-${i + 1}`, name, slug: nicheSlug };
    });
  }, [foundation]);

  // ── All Trust Engine projects ──
  const { data: projectsData } = useProjects(slug);
  const teProjects = useMemo(() => {
    if (!projectsData) return [];
    return projectsData.filter((p) => p.project.tool === "trust-engine");
  }, [projectsData]);

  // Helper: derive niche slug from project name
  const projectNicheSlug = useCallback((p: { name?: string }) => {
    const name = p.name?.replace(/^Trust Engine\s*[—–-]\s*/i, "").trim() || "";
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }, []);

  // ── Selected niche ──
  const [selectedNicheIdx, setSelectedNicheIdx] = useState(0);
  const currentNiche = availableNiches[selectedNicheIdx] || null;
  const currentNicheSlug = currentNiche?.slug;

  // Find project for current niche
  const currentNicheProject = useMemo(() => {
    if (!currentNicheSlug || !teProjects.length) return null;
    return teProjects.find((p) => projectNicheSlug(p.project) === currentNicheSlug) || null;
  }, [teProjects, currentNicheSlug, projectNicheSlug]);

  // ── State ──
  const [openDocPath, setOpenDocPath] = useState<string | null>(null);
  const [activating, setActivating] = useState(false);

  // Create project for a niche
  const handleCreateProject = useCallback(async (nicheName: string, _nicheSlug: string) => {
    if (!slug || !nicheName) return;
    setActivating(true);
    try {
      await fetch("/api/projects/create-tool-project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, strategy: "#02", name: `Trust Engine — ${nicheName}` }),
      });
      window.location.reload();
    } catch { /* empty */ } finally {
      setActivating(false);
    }
  }, [slug]);

  // Open doc in slideover (per-niche path, fallback to root)
  const handleViewDoc = useCallback((modId: string) => {
    const mod = TE_MODULES.find((m) => m.id === modId);
    if (!mod || !slug) return;
    // Try niche subdir first, DocSlideOver/API will handle fallback
    const subdir = currentNicheSlug ? `${currentNicheSlug}/` : "";
    setOpenDocPath(`brand/${slug}/trust-engine/${subdir}${mod.file}`);
  }, [slug, currentNicheSlug]);

  // Open chat — just toggle sidebar open on the trust-engine thread, never send a message
  const { sidebarOpen: chatOpen, currentThread, openSidebar: rawOpenSidebar, setCurrentSlug } = useChatStore();
  const handleOpenChat = useCallback((_modId: string) => {
    if (!slug) return;
    const teThreadId = currentNicheSlug ? `${slug}:trust-engine:${currentNicheSlug}` : `${slug}:trust-engine`;
    setCurrentSlug(slug);
    if (chatOpen && currentThread === teThreadId) return;
    rawOpenSidebar({
      threadId: teThreadId,
      threadName: currentNiche ? `Trust Engine — ${currentNiche.name}` : "Trust Engine",
      skill: "trust-engine",
      skills: ["trust-engine", "keyword-research", "seo-content", "outreach-sequence-builder"],
      linkedTo: "trust-engine",
      docPath: null,
      threadState: undefined,
    });
  }, [slug, currentNicheSlug, currentNiche, chatOpen, currentThread, rawOpenSidebar, setCurrentSlug]);

  // Fetch run state (per niche)
  const { data: runState, isLoading } = useQuery<TERunState>({
    queryKey: ["trust-engine-state", slug, currentNicheSlug],
    queryFn: async () => {
      const params = new URLSearchParams({ slug: slug! });
      if (currentNicheSlug) params.set("niche", currentNicheSlug);
      const res = await fetch(`/api/trust-engine/run-state?${params}`);
      if (!res.ok) return { modules: {} };
      return res.json();
    },
    enabled: !!slug,
    staleTime: 10_000,
  });

  // (Doc viewing/editing now handled by DocSlideOver)

  // Get effective status for a module
  const getStatus = useCallback(
    (modId: string): TEStatus => {
      const mod = runState?.modules?.[modId];
      if (!mod) return "pending";
      if (["completed", "running", "error"].includes(mod.status)) return mod.status;
      const deps = mod.depends_on || [];
      for (const dep of deps) {
        const d = runState?.modules?.[dep];
        if (!d || d.status !== "completed") return "locked";
      }
      return mod.status || "pending";
    },
    [runState]
  );

  // Summary counts
  const counts = useMemo(() => {
    const c: Record<TEStatus, number> = { completed: 0, running: 0, pending: 0, locked: 0, error: 0 };
    TE_MODULES.forEach((m) => c[getStatus(m.id)]++);
    return c;
  }, [getStatus]);

  const total = useMemo(() => Object.values(counts).reduce((a, b) => a + b, 0), [counts]);

  // Launch a module via chat
  // Rerun — opens chat then sends a specific message about what to re-execute
  const sendMessage = useSendMessage();
  const handleLaunch = useCallback(
    (modId: string) => {
      const mod = TE_MODULES.find((m) => m.id === modId);
      if (!mod || !slug) return;
      const phase = TE_PHASES.find((p) => p.modules.some((m) => m.id === modId));

      const rerunMessages: Record<string, string> = {
        "foundation-import": `Quiero volver a ejecutar la configuración del Trust Engine. Usa \`${mod.cmd}\` para reimportar los datos de Foundation y regenerar config.json con nichos, subnichos y competidores actualizados.`,
        "seo-audit": `Quiero re-ejecutar el SEO Audit. Usa \`${mod.cmd}\` para volver a analizar Lighthouse, health checks y Core Web Vitals del sitio web.`,
        "own-media-audit": `Quiero re-ejecutar el Own Media Audit. Usa \`${mod.cmd}\` para re-escanear blog, redes sociales y presencia técnica.`,
        "geo-analysis": `Quiero re-ejecutar el GEO Analysis. Usa \`${mod.cmd}\` para volver a consultar ChatGPT, Gemini y Perplexity sobre visibilidad en IA por nicho y subnicho.`,
        "serp-analysis": `Quiero re-ejecutar el SERP Analysis. Usa \`${mod.cmd}\` para volver a buscar en Serper las posiciones de Google por keyword.`,
        "gap-analysis": `Quiero re-ejecutar el Gap Analysis. Usa \`${mod.cmd}\` para recalcular gaps de presencia, densidad y tipo cruzando GEO + SERP.`,
        "recommendations": `Quiero regenerar las recomendaciones. Usa \`${mod.cmd}\` para crear nuevas recomendaciones basadas en todos los audits completados.`,
        "keywords": `Quiero re-ejecutar la expansión de keywords. Usa \`${mod.cmd}\` para generar nuevos keywords por subnicho, competidores y oportunidades.`,
        "influencers": `Quiero re-ejecutar el descubrimiento de influencers y medios. Usa \`${mod.cmd}\` para buscar nuevos perfiles, medios y directorios del sector.`,
      };

      const message = rerunMessages[modId] || `Quiero volver a ejecutar el paso "${mod.name}" (Fase ${phase?.num}: ${phase?.title}). Usa \`${mod.cmd}\` para regenerar los datos.`;
      const teThreadId = currentNicheSlug ? `${slug}:trust-engine:${currentNicheSlug}` : `${slug}:trust-engine`;

      // 1. Open the chat sidebar on the trust-engine thread (no auto-message)
      handleOpenChat(modId);

      // 2. Send the rerun message explicitly
      setTimeout(() => {
        sendMessage.mutate({ text: message, threadId: teThreadId });
      }, 100);
    },
    [slug, handleOpenChat, sendMessage]
  );


  // (Foundation niches and availableNiches defined above)

  // Section open/close state
  const [openSections, setOpenSections] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(TE_PHASES.map((p) => [p.num, true]))
  );
  const toggleSection = (num: number) => setOpenSections((s) => ({ ...s, [num]: !s[num] }));

  // Status helpers
  const STATUS_BADGE: Record<string, string> = {
    completed: "bg-green-100 text-green-700 border border-green-200",
    running: "bg-yellow-50 text-yellow-700 border border-yellow-200",
    pending: "bg-muted/50 text-muted-foreground border border-border",
    locked: "bg-muted/50 text-muted-foreground border border-border",
    error: "bg-red-50 text-red-700 border border-red-200",
  };
  const STATUS_LABEL: Record<string, string> = {
    completed: "Completado",
    running: "En progreso",
    pending: "No iniciado",
    locked: "No iniciado",
    error: "Error",
  };

  // Niche name for display
  const currentNicheName = currentNiche?.name || "";
  const hasProjectForNiche = !!currentNicheProject;

  const content = (
    <>
      {!slug ? (
        <EmptyState icon="\uD83D\uDD0D" message={t("selectClient")} />
      ) : (
        <>
          <Head>
            <title>{t("title")} — {slug} — Mission Control</title>
          </Head>

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <p className="text-muted-foreground">Cargando Trust Engine...</p>
            </div>
          ) : availableNiches.length === 0 ? (
            /* ── No niches in Foundation ────────────────────────── */
            <div className="max-w-xl mx-auto py-16 px-4 text-center">
              <div className="w-20 h-20 rounded-full bg-rust/10 flex items-center justify-center text-4xl mx-auto mb-5">🔒</div>
              <h1 className="font-heading text-[26px] text-navy mb-2">Trust Engine</h1>
              <p className="text-[14px] text-muted-foreground max-w-md mx-auto leading-relaxed mb-6">
                Completa primero <strong className="text-foreground">Foundation</strong> para definir tus nichos (ECPs). Luego podrás crear proyectos de Trust Engine.
              </p>
              <TrustEngineIntro defaultOpen />
            </div>
          ) : (
            /* ── Main view: header + niche selector + content ──── */
            <div>
              {/* Header */}
              <div className="flex items-center justify-between mb-1 gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  <h1 className="font-heading text-2xl text-navy">🔒 Trust Engine</h1>
                  <span className="text-sm text-rust font-bold">{slug}</span>
                </div>
              </div>

              {/* Niche selector bar */}
              <div className="flex items-center gap-3 mb-5 flex-wrap">
                <select
                  value={selectedNicheIdx}
                  onChange={(e) => setSelectedNicheIdx(Number(e.target.value))}
                  className="text-[13px] font-semibold px-3 py-2 border-2 border-border rounded-lg bg-white dark:bg-card cursor-pointer"
                >
                  {availableNiches.map((n, i) => (
                    <option key={n.id} value={i}>{n.name}</option>
                  ))}
                </select>
                {hasProjectForNiche && (
                  <span className="text-[10px] font-semibold text-sage bg-sage/10 border border-sage/20 px-2 py-0.5 rounded-full">
                    Proyecto activo
                  </span>
                )}
              </div>

              {!hasProjectForNiche ? (
                /* ── Empty state for this niche ─────────────────── */
                <div className="max-w-lg mx-auto py-10 text-center">
                  <div className="w-16 h-16 rounded-full bg-rust/10 flex items-center justify-center text-3xl mx-auto mb-4">🎯</div>
                  <h2 className="font-heading text-xl text-navy mb-2">
                    {currentNicheName}
                  </h2>
                  <p className="text-[13px] text-muted-foreground mb-6 leading-relaxed max-w-md mx-auto">
                    Este nicho aún no tiene un proyecto de Trust Engine. Crea uno para analizar la presencia y confianza en este segmento.
                  </p>
                  <button
                    onClick={() => handleCreateProject(currentNicheName, currentNicheSlug || "")}
                    disabled={activating}
                    className={cn(
                      "px-6 py-3 bg-rust text-white font-bold rounded-lg text-[14px] hover:bg-rust/90 transition-all shadow-sm",
                      activating && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    {activating ? "Creando..." : `Crear proyecto para "${currentNicheName}"`}
                  </button>

                  <div className="mt-10 text-left">
                    <TrustEngineIntro defaultOpen />
                  </div>
                </div>
              ) : (
                /* ── Active niche: progress + docs ─────────────── */
                <>
                  {/* Progress bar */}
                  <div className="mb-5">
                    <div className="flex justify-between text-[11px] text-muted-foreground font-semibold mb-1.5">
                      <span>Progreso — {currentNicheName}</span>
                      <span>{counts.completed}/{total} · {total > 0 ? Math.round((counts.completed / total) * 100) : 0}%</span>
                    </div>
                    <div className="h-2 bg-border rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-sage transition-all duration-500" style={{ width: `${total > 0 ? Math.round((counts.completed / total) * 100) : 0}%` }} />
                    </div>
                  </div>

                  {/* Intro (collapsed) */}
                  <TrustEngineIntro />

                  {/* Document sections */}
                  {TE_PHASES.map((phase) => {
                    const phaseCompleted = phase.modules.filter((m) => getStatus(m.id) === "completed").length;
                    return (
                      <div key={phase.num} className="bg-white dark:bg-card border border-border rounded-xl mb-4 overflow-hidden">
                        <button
                          onClick={() => toggleSection(phase.num)}
                          className="w-full flex items-center gap-2.5 px-4 py-3.5 hover:bg-muted/20 transition-colors"
                        >
                          <span className={cn("text-[10px] text-muted-foreground transition-transform", openSections[phase.num] && "rotate-90")}>▶</span>
                          <span className="text-[13px] font-bold text-foreground flex-1 text-left">{phase.title}: {currentNicheName}</span>
                          <span className="text-[10px] text-muted-foreground bg-muted/30 px-2 py-0.5 rounded-full font-semibold">
                            {phaseCompleted}/{phase.modules.length}
                          </span>
                        </button>

                        {openSections[phase.num] && (
                          <div className="border-t border-border">
                            {phase.modules.map((mod) => {
                              const status = getStatus(mod.id);
                              const isDone = status === "completed";
                              return (
                                <div
                                  key={mod.id}
                                  className="flex items-center px-4 py-2.5 pl-10 gap-2.5 hover:bg-muted/10 transition-colors border-t border-border/50 first:border-t-0"
                                >
                                  <span className="text-[14px] shrink-0">{mod.icon}</span>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-[12px] font-semibold text-foreground">{mod.name}</div>
                                  </div>
                                  <span className={cn("text-[10px] font-semibold px-2.5 py-0.5 rounded-full shrink-0", STATUS_BADGE[status] || STATUS_BADGE.pending)}>
                                    {STATUS_LABEL[status] || "No iniciado"}
                                  </span>
                                  <div className="flex gap-0.5 shrink-0">
                                    {isDone ? (
                                      <button onClick={() => handleViewDoc(mod.id)} className="text-[14px] p-1 rounded-md opacity-40 hover:opacity-100 hover:bg-muted/30 hover:scale-110 transition-all" title="Ver documento">📄</button>
                                    ) : (
                                      <button onClick={() => handleLaunch(mod.id)} className="text-[14px] p-1 rounded-md opacity-60 hover:opacity-100 hover:bg-muted/30 hover:scale-110 transition-all" title="Ejecutar">▶️</button>
                                    )}
                                    <button onClick={() => handleOpenChat(mod.id)} className="text-[14px] p-1 rounded-md opacity-40 hover:opacity-100 hover:bg-muted/30 hover:scale-110 transition-all" title="Chat">💬</button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}

          {/* DocSlideOver */}
          {slug && <DocSlideOver slug={slug} docPath={openDocPath} onClose={() => setOpenDocPath(null)} />}
        </>
      )}
    </>
  );

  if (isEmbed) return <EmbedWrapper>{content}</EmbedWrapper>;
  return <DashboardLayout>{content}</DashboardLayout>;
}

// ============================================================
// Summary pill component — moved to TrustEngineOverview
// ============================================================

// ============================================================
// Module Data Viewer — renders each module's JSON as readable cards
// ============================================================

/* eslint-disable @typescript-eslint/no-explicit-any */

function DataSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h4 className="text-[13px] font-bold text-[#2C3E50] uppercase tracking-[0.5px] mb-2 pb-1 border-b border-[#E8E2D9]">{title}</h4>
      {children}
    </div>
  );
}

function DataCard({ title, subtitle, badges, children }: { title: string; subtitle?: string; badges?: { label: string; bg: string; fg: string }[]; children?: React.ReactNode }) {
  return (
    <div className="border border-[#E8E2D9] rounded-lg p-3 mb-2 bg-[#FDFCFA]">
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <div className="text-[13px] font-semibold text-[#2C3E50]">{title}</div>
          {subtitle && <div className="text-[11px] text-[#7F8C8D] mt-0.5">{subtitle}</div>}
        </div>
        {badges && (
          <div className="flex gap-1 shrink-0">
            {badges.map((b, i) => (
              <span key={i} className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ background: b.bg, color: b.fg }}>{b.label}</span>
            ))}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

function ScoreBar({ score, max = 100, label }: { score: number; max?: number; label?: string }) {
  const pct = Math.min(100, Math.max(0, (score / max) * 100));
  const color = pct >= 70 ? "#27AE60" : pct >= 40 ? "#F39C12" : "#E74C3C";
  return (
    <div className="flex items-center gap-2 mt-1">
      {label && <span className="text-[10px] text-[#7F8C8D] w-16 shrink-0">{label}</span>}
      <div className="flex-1 h-2 bg-[#E8E2D9] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-[11px] font-bold" style={{ color }}>{Math.round(score)}</span>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ModuleDataView({ moduleId, data: rawData }: { moduleId: string; data: Record<string, any> }) {
  const [showRaw, setShowRaw] = useState(false);

  // All TE modules wrap their data in { module, version, data: {...} }
  // Unwrap to get the actual content
  const data = rawData.data && typeof rawData.data === "object" && !Array.isArray(rawData.data)
    ? rawData.data
    : rawData;

  return (
    <div className="max-h-[65vh] overflow-y-auto">
      {/* Toggle raw view */}
      <div className="flex justify-end mb-3">
        <button
          onClick={() => setShowRaw(!showRaw)}
          className="text-[10px] text-[#7F8C8D] hover:text-[#2C3E50] underline"
        >
          {showRaw ? "Vista legible" : "Ver JSON"}
        </button>
      </div>

      {showRaw ? (
        <pre className="bg-[#F5F2ED] border border-[#E8E2D9] rounded-lg p-4 text-[11px] whitespace-pre-wrap break-all">
          {JSON.stringify(rawData, null, 2)}
        </pre>
      ) : (
        <ModuleRenderer moduleId={moduleId} data={data} />
      )}
    </div>
  );
}

function ModuleRenderer({ moduleId, data }: { moduleId: string; data: Record<string, any> }) {
  switch (moduleId) {
    case "foundation-import":
      return <ConfigRenderer data={data} />;
    case "seo-audit":
      return <SeoAuditRenderer data={data} />;
    case "own-media-audit":
      return <OwnMediaRenderer data={data} />;
    case "keywords":
      return <KeywordsRenderer data={data} />;
    case "influencers":
      return <InfluencersRenderer data={data} />;
    case "geo-analysis":
      return <GeoRenderer data={data} />;
    case "serp-analysis":
      return <SerpRenderer data={data} />;
    case "gap-analysis":
      return <GapsRenderer data={data} />;
    case "recommendations":
      return <RecommendationsRenderer data={data} />;
    default:
      return <GenericRenderer data={data} />;
  }
}

function ConfigRenderer({ data }: { data: Record<string, any> }) {
  const brand = data.brand || data.project || {};
  const niches = data.niches || [];
  const competitors = data.competitors || [];
  return (
    <>
      <DataSection title="Marca">
        <div className="grid grid-cols-2 gap-2 text-[12px]">
          <div><span className="text-[#7F8C8D]">Nombre:</span> <span className="font-semibold">{brand.name || brand.slug || "—"}</span></div>
          <div><span className="text-[#7F8C8D]">Web:</span> <span className="font-semibold">{brand.website || "—"}</span></div>
          <div><span className="text-[#7F8C8D]">Mercado:</span> <span className="font-semibold">{data.market_filter?.country || "—"}</span></div>
          <div><span className="text-[#7F8C8D]">Idioma:</span> <span className="font-semibold">{data.market_filter?.language || "—"}</span></div>
        </div>
      </DataSection>
      {niches.length > 0 && (
        <DataSection title={`Nichos (${niches.length})`}>
          {niches.map((n: any, i: number) => (
            <DataCard key={i} title={n.name || n.id} subtitle={`${(n.subniches || n.subnichos || []).length} subnichos · Prioridad: ${n.priority || "—"}`} />
          ))}
        </DataSection>
      )}
      {competitors.length > 0 && (
        <DataSection title={`Competidores (${competitors.length})`}>
          {competitors.map((c: any, i: number) => (
            <DataCard key={i} title={c.name || c.domain} subtitle={c.domain} badges={c.threat_level ? [{ label: c.threat_level, bg: c.threat_level === "high" ? "#FFEBEE" : "#FFF8E1", fg: c.threat_level === "high" ? "#C62828" : "#F57F17" }] : []} />
          ))}
        </DataSection>
      )}
    </>
  );
}

function SeoAuditRenderer({ data }: { data: Record<string, any> }) {
  const score = data.score ?? data.seo_score ?? 0;
  const rawLh = data.lighthouse || {};
  // Lighthouse can be { mobile: { performance, seo, ... } } or flat { performance, seo, ... }
  const lh = rawLh.mobile || rawLh;
  const cwv = rawLh.core_web_vitals || {};
  const criticalIssues = rawLh.critical_issues || [];
  const healthChecks = data.health_checks || data.checks || [];
  const issues = data.issues || [];
  const url = data.url_analyzed || "";
  return (
    <>
      <DataSection title="Score Global">
        <ScoreBar score={score} />
        {url && <p className="text-[11px] text-[#7F8C8D] mt-1">URL: {url}</p>}
      </DataSection>
      {(lh.performance != null || lh.seo != null) && (
        <DataSection title="Lighthouse">
          <div className="space-y-1">
            {lh.performance != null && <ScoreBar score={lh.performance} label="Perf" />}
            {lh.seo != null && <ScoreBar score={lh.seo} label="SEO" />}
            {lh.accessibility != null && <ScoreBar score={lh.accessibility} label="A11y" />}
            {(lh.best_practices ?? lh["best-practices"]) != null && <ScoreBar score={lh.best_practices ?? lh["best-practices"]} label="BP" />}
          </div>
        </DataSection>
      )}
      {Object.keys(cwv).length > 0 && (
        <DataSection title="Core Web Vitals">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {Object.entries(cwv).map(([key, val]: [string, any]) => (
              <div key={key} className="border border-[#E8E2D9] rounded-lg p-2 bg-[#FDFCFA] text-center">
                <div className="text-[10px] text-[#7F8C8D] uppercase font-bold">{key}</div>
                <div className={`text-[16px] font-bold ${val.status === "pass" ? "text-[#27AE60]" : "text-[#E74C3C]"}`}>
                  {val.value}{val.unit}
                </div>
                <div className="text-[9px] text-[#95A5A6]">target: {val.target}{val.unit}</div>
              </div>
            ))}
          </div>
        </DataSection>
      )}
      {criticalIssues.length > 0 && (
        <DataSection title={`Critical Issues (${criticalIssues.length})`}>
          {criticalIssues.map((issue: string, i: number) => (
            <div key={i} className="flex items-start gap-2 text-[12px] py-1">
              <span className="text-[#E74C3C] shrink-0">⚠️</span>
              <span className="text-[#2C3E50]">{issue}</span>
            </div>
          ))}
        </DataSection>
      )}
      {healthChecks.length > 0 && (
        <DataSection title={`Health Checks (${healthChecks.filter((h: any) => h.pass || h.status === "pass").length}/${healthChecks.length})`}>
          <div className="grid grid-cols-2 gap-1">
            {healthChecks.map((h: any, i: number) => (
              <div key={i} className="flex items-center gap-1.5 text-[11px]">
                <span>{h.pass || h.status === "pass" ? "✅" : "❌"}</span>
                <span className="text-[#2C3E50]">{h.name || h.check || h.id || `Check ${i + 1}`}</span>
              </div>
            ))}
          </div>
        </DataSection>
      )}
      {issues.length > 0 && (
        <DataSection title={`Issues (${issues.length})`}>
          {issues.slice(0, 10).map((issue: any, i: number) => (
            <DataCard key={i} title={issue.title || issue.issue || issue.message || `Issue ${i + 1}`} subtitle={issue.description || issue.recommendation || issue.fix || ""} badges={issue.severity ? [{ label: issue.severity, bg: issue.severity === "critical" ? "#FFEBEE" : issue.severity === "high" ? "#FFF3E0" : "#F5F5F5", fg: issue.severity === "critical" ? "#C62828" : issue.severity === "high" ? "#E65100" : "#666" }] : []} />
          ))}
        </DataSection>
      )}
    </>
  );
}

function OwnMediaRenderer({ data }: { data: Record<string, any> }) {
  const score = data.overall_score ?? data.score ?? 0;
  const contentScore = data.content_score || {};
  const socialScore = data.social_score || {};
  const techScore = data.technical_score || {};
  const blog = contentScore.blog || data.blog || {};
  const platforms = socialScore.platforms || {};
  const issues = data.issues || [];
  return (
    <>
      <DataSection title="Score Global">
        <ScoreBar score={score} />
        {data.scoring_breakdown && (
          <div className="space-y-1 mt-2">
            {data.scoring_breakdown.content != null && <ScoreBar score={data.scoring_breakdown.content} label="Content" />}
            {data.scoring_breakdown.social != null && <ScoreBar score={data.scoring_breakdown.social} label="Social" />}
            {data.scoring_breakdown.technical != null && <ScoreBar score={data.scoring_breakdown.technical} label="Tech" />}
          </div>
        )}
      </DataSection>
      {blog.exists != null && (
        <DataSection title="Blog">
          <div className="grid grid-cols-2 gap-2 text-[12px]">
            <div><span className="text-[#7F8C8D]">Existe:</span> <span className="font-semibold">{blog.exists ? "✅ Sí" : "❌ No"}</span></div>
            {blog.url && <div><span className="text-[#7F8C8D]">URL:</span> <span className="font-semibold">{blog.url}</span></div>}
            {blog.post_count && <div><span className="text-[#7F8C8D]">Posts:</span> <span className="font-semibold">{blog.post_count}</span></div>}
          </div>
          {blog.sample_articles && blog.sample_articles.length > 0 && (
            <div className="mt-2 space-y-1">
              {blog.sample_articles.slice(0, 5).map((a: any, i: number) => (
                <div key={i} className="text-[11px] text-[#2C3E50]">• {a.title || a.url}</div>
              ))}
            </div>
          )}
        </DataSection>
      )}
      {Object.keys(platforms).length > 0 && (
        <DataSection title="Redes Sociales">
          {Object.entries(platforms).map(([name, info]: [string, any]) => (
            <DataCard key={name} title={name.charAt(0).toUpperCase() + name.slice(1)} subtitle={info.url || (info.found ? "" : "No encontrado")} badges={[
              { label: info.found ? "✅" : "❌", bg: info.found ? "#E8F5E9" : "#FFEBEE", fg: info.found ? "#2E7D32" : "#C62828" },
              ...(info.followers ? [{ label: `${info.followers.toLocaleString()} seg`, bg: "#E3F2FD", fg: "#1565C0" }] : []),
              ...(info.posting_frequency ? [{ label: info.posting_frequency, bg: "#F0EDE8", fg: "#7F8C8D" }] : []),
            ]} />
          ))}
        </DataSection>
      )}
      {issues.length > 0 && (
        <DataSection title={`Issues (${issues.length})`}>
          {issues.slice(0, 8).map((issue: any, i: number) => (
            <DataCard key={i} title={issue.title || issue.issue || `Issue ${i + 1}`} subtitle={issue.recommendation || issue.description || ""} badges={issue.severity ? [{ label: issue.severity, bg: issue.severity === "high" ? "#FFEBEE" : "#FFF8E1", fg: issue.severity === "high" ? "#C62828" : "#F57F17" }] : []} />
          ))}
        </DataSection>
      )}
    </>
  );
}

function KeywordsRenderer({ data }: { data: Record<string, any> }) {
  const topKws = data.top_keywords || [];
  const summary = data.execution_summary || {};
  const layers = data.layers || {};
  const coverage = data.subnicho_coverage || {};
  return (
    <>
      {summary.total_keywords && (
        <DataSection title="Resumen">
          <div className="flex gap-3 flex-wrap text-[12px]">
            <span className="px-2 py-1 rounded-lg bg-[#F0EDE8] text-[#7F8C8D]">Total: {summary.total_keywords}</span>
            <span className="px-2 py-1 rounded-lg bg-[#E3F2FD] text-[#1565C0]">SERP: {summary.serp_keywords || "—"}</span>
            <span className="px-2 py-1 rounded-lg bg-[#E8F5E9] text-[#2E7D32]">Nuevos: {summary.new_keywords_generated || "—"}</span>
            <span className="px-2 py-1 rounded-lg bg-[#FFF8E1] text-[#F57F17]">Competidores: {summary.competitor_keywords_included || "—"}</span>
          </div>
        </DataSection>
      )}
      <DataSection title={`Top Keywords (${topKws.length})`}>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr className="border-b-2 border-[#E8E2D9]">
                <th className="text-left px-2 py-1.5 text-[#7F8C8D] uppercase">Keyword</th>
                <th className="text-right px-2 py-1.5 text-[#7F8C8D] uppercase">Score</th>
                <th className="text-left px-2 py-1.5 text-[#7F8C8D] uppercase">Rationale</th>
              </tr>
            </thead>
            <tbody>
              {topKws.map((kw: any, i: number) => (
                <tr key={i} className="border-b border-[#F5F2ED] hover:bg-[#FDFCFA]">
                  <td className="px-2 py-1.5 font-medium text-[#2C3E50]">{kw.keyword || kw.term || kw}</td>
                  <td className="px-2 py-1.5 text-right font-bold" style={{ color: (kw.opportunity_score || 0) >= 0.7 ? "#27AE60" : (kw.opportunity_score || 0) >= 0.4 ? "#F39C12" : "#888" }}>
                    {kw.opportunity_score != null ? Math.round(kw.opportunity_score * 100) : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-[#7F8C8D] max-w-[300px] truncate">{kw.rationale || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DataSection>
      {Object.keys(layers).length > 0 && (
        <DataSection title="Layers">
          {Object.entries(layers).map(([layerName, layerData]: [string, any]) => {
            const kws = layerData.keywords || [];
            return (
              <DataCard key={layerName} title={layerName.replace(/_/g, " ")} subtitle={`${kws.length} keywords`}>
                {kws.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {kws.slice(0, 8).map((k: any, j: number) => (
                      <span key={j} className="text-[10px] px-1.5 py-0.5 bg-[#F0EDE8] rounded">{k.keyword || k}</span>
                    ))}
                    {kws.length > 8 && <span className="text-[10px] text-[#95A5A6]">+{kws.length - 8} más</span>}
                  </div>
                )}
              </DataCard>
            );
          })}
        </DataSection>
      )}
    </>
  );
}

function InfluencersRenderer({ data }: { data: Record<string, any> }) {
  // tier3_acionable (typo in original data) or tier3 or fallback
  const items = data.tier3_acionable || data.tier3_actionable || data.tier3 || data.tier2_filtered || data.influencers || [];
  const actionable = Array.isArray(items) ? items : [];
  const summary = data.execution_summary || {};
  return (
    <>
      {summary.discovered_raw && (
        <DataSection title="Resumen">
          <div className="flex gap-3 flex-wrap text-[12px]">
            <span className="px-2 py-1 rounded-lg bg-[#F0EDE8] text-[#7F8C8D]">Raw: {summary.discovered_raw}</span>
            <span className="px-2 py-1 rounded-lg bg-[#FFF8E1] text-[#F57F17]">Filtrados: {summary.tier2_filtered}</span>
            <span className="px-2 py-1 rounded-lg bg-[#E8F5E9] text-[#2E7D32]">Accionables: {summary.tier3_acionable || summary.tier3_actionable}</span>
          </div>
        </DataSection>
      )}
      <DataSection title={`Influencers & Medios (${actionable.length})`}>
        {actionable.slice(0, 20).map((inf: any, i: number) => (
          <DataCard key={i} title={inf.name || inf.domain || `#${i + 1}`} subtitle={inf.url || inf.brief || ""} badges={[
            { label: inf.type || inf.platform || "—", bg: "#F0EDE8", fg: "#7F8C8D" },
            ...(inf.relevance_score != null ? [{ label: `Score: ${inf.relevance_score}`, bg: inf.relevance_score >= 70 ? "#E8F5E9" : "#FFF8E1", fg: inf.relevance_score >= 70 ? "#2E7D32" : "#F57F17" }] : []),
            ...(inf.followers ? [{ label: `${inf.followers.toLocaleString()} seg`, bg: "#E3F2FD", fg: "#1565C0" }] : []),
          ]}>
            {inf.collaboration_type && (
              <div className="text-[10px] text-[#7F8C8D] mt-1">Colaboración: <span className="font-semibold">{inf.collaboration_type}</span></div>
            )}
            {inf.specific_content_url && (
              <div className="text-[10px] text-[#7F8C8D] mt-0.5 truncate">Ejemplo: {inf.specific_content_url}</div>
            )}
          </DataCard>
        ))}
      </DataSection>
    </>
  );
}

function GeoRenderer({ data }: { data: Record<string, any> }) {
  const summary = data.execution_summary || {};
  const niches = data.niches || [];
  const cross = data.cross_niche_summary || {};
  return (
    <>
      {summary.total_runs && (
        <DataSection title="Resumen ejecucion">
          <div className="flex gap-3 flex-wrap text-[12px]">
            <span className="px-2 py-1 rounded-lg bg-[#F0EDE8] text-[#7F8C8D]">Runs: {summary.total_runs}</span>
            <span className="px-2 py-1 rounded-lg bg-[#E3F2FD] text-[#1565C0]">P1: {summary.provider_1}</span>
            <span className="px-2 py-1 rounded-lg bg-[#E8F5E9] text-[#2E7D32]">P2: {summary.provider_2}</span>
          </div>
        </DataSection>
      )}
      {cross.client_visibility_overall != null && (
        <DataSection title="Visibilidad del cliente">
          <ScoreBar score={cross.client_visibility_overall} label="Global" />
          {cross.client_visibility_by_niche && Object.entries(cross.client_visibility_by_niche).map(([niche, pct]: [string, any]) => (
            <ScoreBar key={niche} score={pct} label={niche} />
          ))}
        </DataSection>
      )}
      {cross.opportunity_gaps && cross.opportunity_gaps.length > 0 && (
        <DataSection title={`Oportunidades (${cross.opportunity_gaps.length})`}>
          {cross.opportunity_gaps.slice(0, 8).map((g: any, i: number) => (
            <DataCard key={i} title={g.domain || g.title || `#${i + 1}`} subtitle={g.description || g.reason || ""} />
          ))}
        </DataSection>
      )}
      {niches.length > 0 && (
        <DataSection title={`Nichos analizados (${niches.length})`}>
          {niches.map((n: any, i: number) => (
            <DataCard key={i} title={n.name || n.id} subtitle={`${n.subniches_tested || 0} subnichos · Visibility: ${n.visibility_rate ?? "—"}%`} badges={[
              { label: `${(n.runs || []).length} runs`, bg: "#F0EDE8", fg: "#7F8C8D" },
            ]} />
          ))}
        </DataSection>
      )}
      {cross.competitor_presence && Object.keys(cross.competitor_presence).length > 0 && (
        <DataSection title="Presencia competidores">
          <div className="space-y-1">
            {Object.entries(cross.competitor_presence).map(([comp, pct]: [string, any]) => (
              <ScoreBar key={comp} score={typeof pct === "number" ? pct : (pct?.visibility || 0)} label={comp} />
            ))}
          </div>
        </DataSection>
      )}
    </>
  );
}

function SerpRenderer({ data }: { data: Record<string, any> }) {
  const summary = data.summary || data.execution_summary || {};
  const keywords = data.keywords || [];
  const competitors = data.competitor_analysis || {};
  return (
    <>
      <DataSection title="Resumen">
        <div className="flex gap-3 flex-wrap text-[12px]">
          <span className="px-2 py-1 rounded-lg bg-[#F0EDE8] text-[#7F8C8D]">Total: {summary.total_keywords || keywords.length}</span>
          <span className="px-2 py-1 rounded-lg bg-[#E8F5E9] text-[#2E7D32]">Top 3: {summary.client_in_top3 ?? summary.client_position_top3 ?? "—"}</span>
          <span className="px-2 py-1 rounded-lg bg-[#E3F2FD] text-[#1565C0]">Top 10: {summary.client_in_top10 ?? summary.client_position_top10 ?? "—"}</span>
          <span className="px-2 py-1 rounded-lg bg-[#FFEBEE] text-[#C62828]">Invisible: {summary.client_invisible ?? "—"} ({summary.client_invisible_pct ?? "—"}%)</span>
        </div>
      </DataSection>
      {keywords.length > 0 && (
        <DataSection title={`Keywords (${keywords.length})`}>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] border-collapse">
              <thead>
                <tr className="border-b-2 border-[#E8E2D9]">
                  <th className="text-left px-2 py-1.5 text-[#7F8C8D] uppercase">Keyword</th>
                  <th className="text-left px-2 py-1.5 text-[#7F8C8D] uppercase">Nicho</th>
                  <th className="text-center px-2 py-1.5 text-[#7F8C8D] uppercase">Posicion</th>
                  <th className="text-left px-2 py-1.5 text-[#7F8C8D] uppercase">Competidores Top 3</th>
                </tr>
              </thead>
              <tbody>
                {keywords.slice(0, 30).map((kw: any, i: number) => {
                  const pos = kw.client_position;
                  const posColor = pos && pos <= 3 ? "#27AE60" : pos && pos <= 10 ? "#F39C12" : "#E74C3C";
                  return (
                    <tr key={i} className="border-b border-[#F5F2ED] hover:bg-[#FDFCFA]">
                      <td className="px-2 py-1.5 font-medium text-[#2C3E50]">{kw.keyword}</td>
                      <td className="px-2 py-1.5 text-[#7F8C8D]">{kw.subnicho || kw.niche || "—"}</td>
                      <td className="px-2 py-1.5 text-center font-bold" style={{ color: posColor }}>
                        {pos ?? "—"}
                      </td>
                      <td className="px-2 py-1.5 text-[#7F8C8D] text-[10px]">
                        {(kw.competitors_in_top3 || []).join(", ") || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {keywords.length > 30 && <p className="text-[10px] text-[#95A5A6] mt-2 text-center">+ {keywords.length - 30} keywords más</p>}
          </div>
        </DataSection>
      )}
      {Object.keys(competitors).length > 0 && (
        <DataSection title={`Competidores (${Object.keys(competitors).length})`}>
          {Object.entries(competitors).map(([name, cData]: [string, any]) => (
            <DataCard key={name} title={name} subtitle={`${cData.keywords_in_top3 || cData.top3 || "?"} en top 3 · ${cData.keywords_in_top10 || cData.top10 || "?"} en top 10`} />
          ))}
        </DataSection>
      )}
    </>
  );
}

function GapsRenderer({ data }: { data: Record<string, any> }) {
  // gap_modes: { presence_gaps: { gaps: [] }, density_gaps: { gaps: [] }, type_gaps: { gaps: [] } }
  const gapModes = data.gap_modes || {};
  const allGaps: any[] = [];
  for (const [modeName, modeData] of Object.entries(gapModes)) {
    for (const g of ((modeData as any).gaps || [])) {
      allGaps.push({ ...g, _mode: modeName });
    }
  }
  // Fallback for flat structure
  if (allGaps.length === 0 && data.gaps) {
    allGaps.push(...data.gaps);
  }

  const modeLabels: Record<string, { label: string; bg: string; fg: string }> = {
    presence_gaps: { label: "Presencia", bg: "#E3F2FD", fg: "#1565C0" },
    density_gaps: { label: "Densidad", bg: "#FFF3E0", fg: "#E65100" },
    type_gaps: { label: "Tipo", bg: "#F3E5F5", fg: "#6A1B9A" },
  };

  return (
    <>
      {/* Summary */}
      <DataSection title={`Gaps (${allGaps.length})`}>
        <div className="flex gap-3 mb-3">
          {Object.entries(gapModes).map(([mode, mData]: [string, any]) => {
            const m = modeLabels[mode] || { label: mode, bg: "#F0EDE8", fg: "#7F8C8D" };
            return (
              <span key={mode} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-semibold" style={{ background: m.bg, color: m.fg }}>
                {m.label}: {(mData.gaps || []).length}
              </span>
            );
          })}
        </div>
        {allGaps.slice(0, 15).map((gap: any, i: number) => {
          const m = modeLabels[gap._mode] || { label: gap.gap_type || "—", bg: "#F0EDE8", fg: "#7F8C8D" };
          return (
            <DataCard key={i} title={gap.domain || gap.title || `Gap ${i + 1}`} subtitle={gap.url_title || gap.specific_url || gap.description || ""} badges={[
              { label: m.label, bg: m.bg, fg: m.fg },
              { label: gap.domain_type || "—", bg: "#F0EDE8", fg: "#7F8C8D" },
              ...(gap.niche ? [{ label: gap.niche, bg: "#E8F5E9", fg: "#2E7D32" }] : []),
            ]}>
              {gap.subnicho && (
                <div className="text-[10px] text-[#7F8C8D] mt-1">Subnicho: {gap.subnicho}</div>
              )}
            </DataCard>
          );
        })}
      </DataSection>
    </>
  );
}

function RecommendationsRenderer({ data }: { data: Record<string, any> }) {
  const recs = data.recommendations || [];
  return (
    <DataSection title={`Recomendaciones (${recs.length})`}>
      {recs.slice(0, 15).map((rec: any, i: number) => (
        <DataCard key={i} title={rec.title || `Rec ${i + 1}`} subtitle={rec.description || rec.rationale || ""} badges={[
          { label: rec.severity || rec.priority || "—", bg: rec.severity === "critical" || rec.priority === "high" ? "#FFEBEE" : "#FFF8E1", fg: rec.severity === "critical" || rec.priority === "high" ? "#C62828" : "#F57F17" },
          { label: rec.category || "—", bg: "#F0EDE8", fg: "#7F8C8D" },
        ]}>
          {rec.fix_steps && rec.fix_steps.length > 0 && (
            <div className="mt-2 space-y-0.5">
              {rec.fix_steps.slice(0, 3).map((step: string, j: number) => (
                <div key={j} className="text-[10px] text-[#2C3E50]">{j + 1}. {step}</div>
              ))}
            </div>
          )}
        </DataCard>
      ))}
    </DataSection>
  );
}

function GenericRenderer({ data }: { data: Record<string, any> }) {
  const entries = Object.entries(data).filter(([k]) => !k.startsWith("_"));
  return (
    <>
      {entries.map(([key, val]) => {
        if (Array.isArray(val) && val.length > 0 && typeof val[0] === "object") {
          return (
            <DataSection key={key} title={`${key} (${val.length})`}>
              {val.slice(0, 10).map((item: any, i: number) => (
                <DataCard key={i} title={item.title || item.name || item.keyword || item.domain || JSON.stringify(item).slice(0, 60)} subtitle={item.description || item.url || ""} />
              ))}
              {val.length > 10 && <p className="text-[10px] text-[#95A5A6] text-center">+ {val.length - 10} más</p>}
            </DataSection>
          );
        }
        if (typeof val === "object" && val && !Array.isArray(val)) {
          return (
            <DataSection key={key} title={key}>
              <div className="grid grid-cols-2 gap-1 text-[11px]">
                {Object.entries(val).slice(0, 8).map(([k, v]) => (
                  <div key={k}><span className="text-[#7F8C8D]">{k}:</span> <span className="font-semibold">{String(v)}</span></div>
                ))}
              </div>
            </DataSection>
          );
        }
        return (
          <div key={key} className="text-[11px] mb-1"><span className="text-[#7F8C8D]">{key}:</span> <span className="font-semibold">{String(val)}</span></div>
        );
      })}
    </>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */
