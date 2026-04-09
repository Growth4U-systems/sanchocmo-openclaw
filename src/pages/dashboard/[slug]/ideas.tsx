import { useState, useMemo, useCallback } from "react";
import Head from "next/head";
import { useTranslations } from "next-intl";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useSlugSync } from "@/hooks/useSlugSync";
import { Modal } from "@/components/shared/modal";
import { useIdeas, useCreateIdea, useUpdateIdeaStatus, useDeleteIdea } from "@/hooks/useIdeas";
import { useProjects } from "@/hooks/useProjects";
import { useOpenChat } from "@/hooks/useChat";
import { cn } from "@/lib/utils";
import { useCronRuns } from "@/hooks/useRecurringTasks";
import { CronInsightsFeed } from "@/components/insights/cron-insights-feed";
import { RecommendationsTab } from "@/components/insights/recommendations-tab";
import type { Idea, IdeaStatus, IdeaList } from "@/types";

// ============================================================
// Constants
// ============================================================

const IDEA_LIST_CONFIG: Record<string, { icon: string; label: string; description: string; type: string }> = {
  keywords:    { icon: "🔍", label: "Keywords para rankear", description: "Oportunidades SEO detectadas", type: "content" },
  trending:    { icon: "🔥", label: "Contenido trending para crear", description: "Temas en tendencia en el nicho", type: "content" },
  gaps:        { icon: "🏆", label: "Gaps vs competencia", description: "Contenido que competidores no cubren bien", type: "content" },
  repurpose:   { icon: "♻️", label: "Contenido para reutilizar", description: "Ideas de atomización cross-canal", type: "content" },
  medios:      { icon: "📢", label: "Medios donde aparecer", description: "Blogs, revistas, podcasts para PR/guest posts", type: "contact" },
  partners:    { icon: "🤝", label: "Partners para colaborar", description: "Empresas/personas para co-marketing", type: "contact" },
  influencers: { icon: "🎯", label: "Influencers para contactar", description: "Creadores relevantes en el nicho", type: "contact" },
  outreach:    { icon: "📨", label: "Prospects para contactar", description: "Leads para outreach directo", type: "contact" },
};

const IDEA_SOURCE_LABELS: Record<string, string> = {
  seo_geo: "🔍 SEO/GEO", signal: "📡 Signal", competitor: "🏆 Competencia",
  meeting: "🗣️ Reunión", manual: "💡 Manual", trust_engine: "🔄 Trust Engine",
  paa: "❓ PAA", trending: "Trending", serp_gaps: "SERP Gaps", atalaya: "🏰 Atalaya",
};

const IDEA_CHANNEL_CONFIG: Record<string, { icon: string; label: string }> = {
  blog: { icon: "📰", label: "Blog" }, instagram: { icon: "📸", label: "Instagram" },
  linkedin: { icon: "💼", label: "LinkedIn" }, twitter: { icon: "🐦", label: "Twitter" },
};

const IDEA_CHANNEL_COLORS: Record<string, { bg: string; fg: string }> = {
  blog: { bg: "#E3F2FD", fg: "#1565C0" }, instagram: { bg: "#F3E5F5", fg: "#7B1FA2" },
  linkedin: { bg: "#E8F5E9", fg: "#2E7D32" }, twitter: { bg: "#E1F5FE", fg: "#0277BD" },
};

const CONTENT_LISTS: IdeaList[] = ["keywords", "trending", "gaps", "repurpose"];
const CONTACT_LISTS: IdeaList[] = ["medios", "partners", "influencers", "outreach"];
const ALL_LISTS: IdeaList[] = [...CONTENT_LISTS, ...CONTACT_LISTS];
const CONTENT_CHANNELS = ["blog", "instagram", "linkedin", "twitter"];

const STATUS_TABS: { value: string; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "new", label: "Nuevas" },
  { value: "approved", label: "Aprobadas" },
  { value: "executed", label: "Publicadas" },
  { value: "rejected", label: "Descartadas" },
];

const SOURCE_OPTIONS = [
  { value: "manual", label: "💡 Manual" },
  { value: "seo_geo", label: "🔍 SEO/GEO" },
  { value: "signal", label: "📡 Signal" },
  { value: "competitor", label: "🏆 Competencia" },
  { value: "meeting", label: "🗣️ Reunión" },
  { value: "trust_engine", label: "🔄 Trust Engine" },
  { value: "paa", label: "❓ PAA" },
];

const MAIN_TABS = [
  { value: "ideas", icon: "📝", label: "Ideas" },
  { value: "contactos", icon: "👥", label: "Contactos" },
  { value: "insights", icon: "📡", label: "Insights" },
  { value: "recommendations", icon: "🎯", label: "Recommendations" },
];

const STATUS_LABELS: Record<string, string> = {
  new: "Nueva", approved: "Aprobada", rejected: "Descartada", executed: "Publicada",
  assigned: "Asignada", in_progress: "En progreso", done: "Publicada",
};

const STATUS_BADGE_COLORS: Record<string, { bg: string; fg: string }> = {
  new: { bg: "#E3F2FD", fg: "#1565C0" },
  approved: { bg: "#E8F5E9", fg: "#2E7D32" },
  rejected: { bg: "#FFEBEE", fg: "#C62828" },
  executed: { bg: "#F3E5F5", fg: "#6A1B9A" },
};

// ============================================================
// Helpers
// ============================================================

function normalizeIdea(idea: Idea): Idea {
  const i = { ...idea };
  if (!i.channels && i.channels_suggested) {
    i.channels = Array.isArray(i.channels_suggested) ? i.channels_suggested : [];
  }
  if (!i.channels) i.channels = [];
  if (!i.list) {
    if (i.type === "contact") {
      const tc = i.target_channel || i.category || "outreach";
      if (tc === "podcasts" || tc === "medios") i.list = "medios";
      else if (tc === "influencers") i.list = "influencers";
      else if (tc === "partners") i.list = "partners";
      else i.list = "outreach";
    } else {
      const cat = i.category || "";
      if (cat === "geo_optimization" || i.source === "seo_geo" || i.source === "paa") i.list = "keywords";
      else if (cat === "comparison" || cat === "ranking" || i.source === "competitor") i.list = "gaps";
      else if (i.source === "signal" || i.source === "trending") i.list = "trending";
      else i.list = "keywords";
    }
  }
  if (!ALL_LISTS.includes(i.list)) {
    i.list = i.type === "contact" ? "outreach" : "keywords";
  }
  if (!i.action) i.action = i.description || i.notes || "";
  if (i.status === "pool") i.status = "new";
  if (i.status === "done") i.status = "executed";
  return i;
}

function scoreColor(score: number): string {
  if (score >= 70) return "#4A5D23";
  if (score >= 40) return "#E6A817";
  return "#888";
}

function scoreEmoji(score: number): string {
  if (score >= 70) return "🔴";
  if (score >= 40) return "🟡";
  return "⬜";
}

// ============================================================
// Component
// ============================================================

export default function IdeasPage() {
  const slug = useSlugSync();
  const t = useTranslations("ideas");

  const { data, isLoading } = useIdeas(slug);
  const createIdea = useCreateIdea();
  const updateStatus = useUpdateIdeaStatus();
  const deleteIdea = useDeleteIdea();
  const openChat = useOpenChat();

  // Projects (for task creation)
  const { data: projectsData } = useProjects(slug);
  const projectList = useMemo(() =>
    (projectsData || []).map((p) => ({
      id: p.project.id || "",
      name: p.project.name || p.project.id || "",
      status: p.project.status || "active",
    })),
    [projectsData]
  );

  // Cron runs for Insights tab
  const { data: cronRuns } = useCronRuns(slug, 20);

  // Project filter for ideas
  const [projectFilter, setProjectFilter] = useState("");

  // Main tab
  const [activeTab, setActiveTab] = useState("ideas");
  // View mode
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  // Filters
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Modals
  const [detailIdea, setDetailIdea] = useState<Idea | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showCreateTask, setShowCreateTask] = useState(false);
  // Create task form state
  const [taskProject, setTaskProject] = useState("");
  const [taskProjectSearch, setTaskProjectSearch] = useState("");
  const [taskName, setTaskName] = useState("");
  const [taskType, setTaskType] = useState("content");
  const [creatingTask, setCreatingTask] = useState(false);
  // Create form state
  const [formTitle, setFormTitle] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formAction, setFormAction] = useState("");
  const [formList, setFormList] = useState<IdeaList>("keywords");
  const [formSource, setFormSource] = useState("manual");
  const [formPriority, setFormPriority] = useState(50);
  const [formChannels, setFormChannels] = useState<string[]>(["blog"]);

  // Normalize all ideas
  const allIdeas: Idea[] = useMemo(() => {
    const raw = data?.[slug] || [];
    return raw.map(normalizeIdea).sort(
      (a, b) => (b.created_at || "").localeCompare(a.created_at || "")
    );
  }, [data, slug]);

  // Split by type
  const contentIdeas = useMemo(() => allIdeas.filter((i) => i.type !== "contact"), [allIdeas]);
  const contactIdeas = useMemo(() => allIdeas.filter((i) => i.type === "contact"), [allIdeas]);

  // Current ideas based on active tab
  const tabIdeas = activeTab === "contactos" ? contactIdeas : contentIdeas;

  // Contact sub-counts
  const contactEmpresas = contactIdeas.filter((i) => i.list === "partners" || i.list === "medios").length;
  const contactPersonas = contactIdeas.filter((i) => i.list === "influencers" || i.list === "outreach").length;

  // Stats
  const total = tabIdeas.length;
  const pendingCount = tabIdeas.filter((i) => i.status === "new").length;
  const approvedCount = tabIdeas.filter((i) => i.status === "approved").length;
  const publishedCount = tabIdeas.filter((i) => i.status === "executed").length;

  // Available sources for dropdown
  const availableSources = useMemo(() => [...new Set(tabIdeas.map((i) => i.source).filter(Boolean))], [tabIdeas]);

  // Filter
  const filtered = useMemo(() => {
    let list = tabIdeas;
    if (statusFilter !== "all") list = list.filter((i) => i.status === statusFilter);
    if (sourceFilter !== "all") list = list.filter((i) => i.source === sourceFilter);
    if (projectFilter) list = list.filter((i) => i.project_ids?.includes(projectFilter));
    return list;
  }, [tabIdeas, statusFilter, sourceFilter, projectFilter]);

  // Bulk helpers
  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((i) => i.id)));
    }
  }, [selected.size, filtered]);

  const handleBulk = useCallback(
    async (status: "approved" | "rejected") => {
      const promises = [...selected].map((ideaId) =>
        updateStatus.mutateAsync({ slug, ideaId, status })
      );
      await Promise.allSettled(promises);
      setSelected(new Set());
    },
    [selected, slug, updateStatus]
  );

  const handleStatusChange = useCallback(
    (ideaId: string, status: string) => {
      updateStatus.mutate({ slug, ideaId, status });
    },
    [slug, updateStatus]
  );

  const handleDelete = useCallback(
    (ideaId: string) => {
      deleteIdea.mutate({ slug, ideaId }, { onSuccess: () => setDetailIdea(null) });
    },
    [slug, deleteIdea]
  );

  const handleChat = useCallback(
    (idea: Idea) => {
      const threadId = `${slug}:idea:${idea.id}`;
      openChat(slug, {
        threadId,
        threadName: idea.title,
        skill: "sancho-manager",
        skills: ["sancho-manager"],
        linkedTo: `ideas/${idea.id}`,
        docPath: null,
        threadState: "continue",
      });
    },
    [slug, openChat]
  );

  const handleCreate = useCallback(async () => {
    if (!formTitle.trim()) return;
    const isContentList = CONTENT_LISTS.includes(formList);
    await createIdea.mutateAsync({
      slug,
      idea: {
        title: formTitle,
        description: formDesc,
        action: formAction,
        list: formList,
        type: isContentList ? "content" : "contact",
        source: formSource,
        priority_score: formPriority,
        status: "new" as IdeaStatus,
        channels: isContentList ? formChannels : [],
        target_channel: isContentList ? "" : formList,
      } as Partial<Idea>,
    });
    setShowCreate(false);
    setFormTitle("");
    setFormDesc("");
    setFormAction("");
    setFormPriority(50);
  }, [slug, formTitle, formDesc, formAction, formList, formSource, formPriority, formChannels, createIdea]);

  const handleCreateTask = useCallback(async () => {
    if (!taskProject || !taskName.trim() || !slug) return;
    setCreatingTask(true);
    try {
      const res = await fetch("/api/projects/create-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          projectId: taskProject,
          name: taskName,
          batchType: taskType,
          ideaIds: [...selected],
        }),
      });
      if (!res.ok) throw new Error("Failed to create task");
      setShowCreateTask(false);
      setSelected(new Set());
      setTaskName("");
      setTaskProject("");
      setTaskType("content");
    } catch {
      alert("Error al crear la tarea");
    } finally {
      setCreatingTask(false);
    }
  }, [slug, taskProject, taskName, taskType, selected]);

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground">{t("title")}...</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <Head>
        <title>{t("title")} — {slug} — Mission Control</title>
      </Head>

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-[#2C3E50] mb-1">💡 {t("title")}</h1>
          <p className="text-sm text-muted-foreground">
            {slug.charAt(0).toUpperCase() + slug.slice(1)} — Ideas, contactos y recomendaciones
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-[#2C3E50] text-white font-semibold rounded-lg text-sm hover:bg-[#34495E] transition-all"
        >
          + {t("newIdea")}
        </button>
      </div>

      {/* Main Tabs — matches legacy mc-work.js style */}
      <div className="flex gap-0 px-0 border-b border-[#E8E2D9]">
        {MAIN_TABS.map((tab) => {
          const isActive = activeTab === tab.value;
          let badge = "";
          if (tab.value === "ideas") badge = String(contentIdeas.length);
          else if (tab.value === "contactos") badge = `${contactEmpresas} emp / ${contactPersonas} ct`;
          return (
            <button
              key={tab.value}
              onClick={() => { setActiveTab(tab.value); setStatusFilter("all"); setSourceFilter("all"); setSelected(new Set()); }}
              className={cn(
                "px-5 py-2.5 text-[14px] font-medium transition-all rounded-t-lg border border-transparent -mb-px flex items-center gap-1.5",
                isActive
                  ? "bg-white border-[#E8E2D9] border-b-white text-[#C45D35] font-semibold"
                  : "text-[#7F8C8D] hover:text-[#2C3E50]"
              )}
            >
              {tab.icon} {tab.label}
              {badge && (
                <span className={cn(
                  "ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold",
                  isActive ? "bg-[#F5E6DF] text-[#C45D35]" : "bg-[#F0EDE8] text-[#7F8C8D]"
                )}>
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Ideas & Contactos tabs content */}
      {(activeTab === "ideas" || activeTab === "contactos") && (
        <>
          {/* Stats row — legacy style: thin border, shadow, centered */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6 mt-6">
            {[
              { value: total, label: "TOTAL" },
              { value: pendingCount, label: "PENDIENTES" },
              { value: approvedCount, label: "APROBADAS" },
              { value: publishedCount, label: "PUBLICADAS" },
            ].map((stat) => (
              <div
                key={stat.label}
                className="bg-white border border-[#E8E2D9] rounded-[10px] px-4 py-3 text-center"
                style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}
              >
                <div className="text-2xl font-bold text-[#2C3E50]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{stat.value}</div>
                <div className="text-[11px] text-[#7F8C8D] uppercase tracking-[0.5px] mt-0.5">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Status filters + view toggle — legacy style */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex flex-wrap gap-2">
              {STATUS_TABS.map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => setStatusFilter(tab.value)}
                  className={cn(
                    "px-3.5 py-1.5 rounded-full text-[12px] font-semibold border transition-all",
                    statusFilter === tab.value
                      ? "border-[#2C3E50] bg-[#2C3E50] text-white"
                      : "border-[#E8E2D9] bg-white text-[#7F8C8D] hover:border-[#2C3E50]"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* View toggle: Lista | Calendario — legacy style */}
            <div className="flex items-center border border-[#E8E2D9] rounded-lg overflow-hidden">
              <button
                onClick={() => setViewMode("list")}
                className={cn(
                  "px-3 py-1.5 text-[12px] font-semibold transition-all flex items-center gap-1",
                  viewMode === "list"
                    ? "bg-[#2C3E50] text-white"
                    : "bg-white text-[#7F8C8D] hover:text-[#2C3E50]"
                )}
              >
                ☰ Lista
              </button>
              <button
                onClick={() => setViewMode("calendar")}
                className={cn(
                  "px-3 py-1.5 text-[12px] font-semibold transition-all flex items-center gap-1",
                  viewMode === "calendar"
                    ? "bg-[#2C3E50] text-white"
                    : "bg-white text-[#7F8C8D] hover:text-[#2C3E50]"
                )}
              >
                📅 Calendario
              </button>
            </div>
          </div>

          {/* Source + Project filter + select all */}
          <div className="flex items-center gap-3 mb-4">
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="rounded-lg border border-[#E8E2D9] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#7F8C8D] focus:border-[#C45D35] focus:outline-none"
            >
              <option value="all">{t("sourceAll")}</option>
              {availableSources.map((s) => (
                <option key={s} value={s}>{IDEA_SOURCE_LABELS[s] || s}</option>
              ))}
            </select>
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="rounded-lg border border-[#E8E2D9] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#7F8C8D] focus:border-[#C45D35] focus:outline-none"
            >
              <option value="">Todos los proyectos</option>
              {projectList.map((p) => (
                <option key={p.id} value={p.id}>{p.id} — {p.name}</option>
              ))}
            </select>

            <label className="text-[12px] text-[#7F8C8D] cursor-pointer flex items-center gap-1.5 ml-auto">
              <input
                type="checkbox"
                checked={selected.size === filtered.length && filtered.length > 0}
                onChange={toggleSelectAll}
              />
              {t("selectAll")}
            </label>
          </div>

          {/* Flat table — legacy style */}
          {filtered.length === 0 ? (
            <div className="bg-white border border-[#E8E2D9] rounded-[10px] p-10 text-center mt-4" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <p className="text-[#7F8C8D]">
                {activeTab === "ideas"
                  ? "Sin ideas de contenido. Lanza un scan desde Atalaya."
                  : "Sin contactos. Lanza un scan desde Atalaya."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto mt-4 bg-white border border-[#E8E2D9] rounded-[10px]" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr>
                    <th className="w-8 px-3 py-2 text-center border-b-2 border-[#E8E2D9]">
                      <input
                        type="checkbox"
                        checked={selected.size === filtered.length && filtered.length > 0}
                        onChange={toggleSelectAll}
                      />
                    </th>
                    <th className="px-3 py-2 text-left text-[11px] text-[#7F8C8D] uppercase tracking-[0.5px] font-semibold border-b-2 border-[#E8E2D9]">IDEA</th>
                    <th className="w-[60px] px-3 py-2 text-center text-[11px] text-[#7F8C8D] uppercase tracking-[0.5px] font-semibold border-b-2 border-[#E8E2D9]">SCORE</th>
                    <th className="px-3 py-2 text-left text-[11px] text-[#7F8C8D] uppercase tracking-[0.5px] font-semibold border-b-2 border-[#E8E2D9]">CANALES</th>
                    <th className="px-3 py-2 text-left text-[11px] text-[#7F8C8D] uppercase tracking-[0.5px] font-semibold border-b-2 border-[#E8E2D9]">FUENTE</th>
                    <th className="px-3 py-2 text-left text-[11px] text-[#7F8C8D] uppercase tracking-[0.5px] font-semibold border-b-2 border-[#E8E2D9]">PROYECTO</th>
                    <th className="w-[90px] px-3 py-2 text-center text-[11px] text-[#7F8C8D] uppercase tracking-[0.5px] font-semibold border-b-2 border-[#E8E2D9]">STATUS</th>
                    <th className="w-[130px] px-3 py-2 text-center text-[11px] text-[#7F8C8D] uppercase tracking-[0.5px] font-semibold border-b-2 border-[#E8E2D9]">ACCIONES</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((idea) => {
                    const sc = scoreColor(idea.priority_score || 0);
                    const isRejected = idea.status === "rejected";
                    const rowOpacity = idea.status === "approved" ? "opacity-60" : isRejected ? "opacity-40" : "";
                    const stColor = STATUS_BADGE_COLORS[idea.status] || { bg: "#F5F5F5", fg: "#888" };

                    return (
                      <tr key={idea.id} className={cn("hover:bg-[#FDFCFA] transition-colors", rowOpacity)}>
                        <td className="px-3 py-2.5 text-center border-b border-[#F5F2ED] align-middle">
                          <input
                            type="checkbox"
                            checked={selected.has(idea.id)}
                            onChange={() => toggleSelect(idea.id)}
                          />
                        </td>
                        <td className="px-3 py-2.5 border-b border-[#F5F2ED] align-middle max-w-[300px]">
                          <div
                            className={cn(
                              "font-semibold cursor-pointer text-[#2C3E50] hover:underline text-[13px]",
                              isRejected && "line-through"
                            )}
                            onClick={() => setDetailIdea(idea)}
                          >
                            {idea.title || "Sin título"}
                          </div>
                          {idea.action && !/^Fuente:\s*\(?/.test(idea.action) && (
                            <div className="text-[12px] text-[#7F8C8D] mt-0.5 line-clamp-1">
                              {idea.action}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center border-b border-[#F5F2ED] align-middle">
                          <span className="font-bold text-[14px]" style={{ color: sc }}>
                            {idea.priority_score != null ? Math.round(idea.priority_score) : "-"}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 border-b border-[#F5F2ED] align-middle">
                          <div className="flex gap-1 flex-wrap">
                            {(idea.channels || []).map((ch) => {
                              const cc = IDEA_CHANNEL_COLORS[ch] || { bg: "#ECEFF1", fg: "#37474F" };
                              const cfg = IDEA_CHANNEL_CONFIG[ch] || { icon: "📌", label: ch };
                              return (
                                <span
                                  key={ch}
                                  className="inline-block px-1.5 py-px rounded text-[10px] font-medium whitespace-nowrap mr-0.5"
                                  style={{ background: cc.bg, color: cc.fg }}
                                >
                                  {cfg.icon} {cfg.label}
                                </span>
                              );
                            })}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 border-b border-[#F5F2ED] align-middle">
                          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap bg-[#F0EDE8] text-[#7F8C8D]">
                            {idea.source ? (IDEA_SOURCE_LABELS[idea.source] || idea.source) : ""}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 border-b border-[#F5F2ED] align-middle">
                          {idea.project_ids && idea.project_ids.length > 0 ? (
                            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap bg-[#E3F2FD] text-[#1565C0]">
                              {idea.project_ids.map((pid) => {
                                const proj = projectList.find((p) => p.id === pid);
                                return proj ? `${proj.id} ${proj.name}` : pid;
                              }).join(", ")}
                            </span>
                          ) : (
                            <span className="text-[10px] text-[#95A5A6]">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center border-b border-[#F5F2ED] align-middle">
                          <span
                            className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase whitespace-nowrap"
                            style={{ background: stColor.bg, color: stColor.fg }}
                          >
                            {STATUS_LABELS[idea.status] || idea.status}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-center border-b border-[#F5F2ED] align-middle">
                          <div className="flex gap-0.5 justify-center">
                            {idea.status === "new" && (
                              <>
                                <button
                                  title="Aprobar"
                                  onClick={() => handleStatusChange(idea.id, "approved")}
                                  className="bg-transparent border-none cursor-pointer text-[14px] p-0.5 hover:scale-110 transition-transform"
                                >
                                  ✅
                                </button>
                                <button
                                  title="Rechazar"
                                  onClick={() => handleStatusChange(idea.id, "rejected")}
                                  className="bg-transparent border-none cursor-pointer text-[14px] p-0.5 hover:scale-110 transition-transform"
                                >
                                  ❌
                                </button>
                              </>
                            )}
                            <button
                              title="Chat"
                              onClick={() => handleChat(idea)}
                              className="bg-transparent border-none cursor-pointer text-[14px] p-0.5 hover:scale-110 transition-transform"
                            >
                              💬
                            </button>
                            <button
                              title="Editar"
                              onClick={() => setDetailIdea(idea)}
                              className="bg-transparent border-none cursor-pointer text-[14px] p-0.5 hover:scale-110 transition-transform"
                            >
                              ✏️
                            </button>
                            <button
                              title="Eliminar"
                              onClick={() => {
                                if (confirm(t("confirmDelete"))) handleDelete(idea.id);
                              }}
                              className="bg-transparent border-none cursor-pointer text-[14px] p-0.5 hover:scale-110 transition-transform"
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Insights tab — Cron outputs feed */}
      {activeTab === "insights" && (() => {
        const hasCronRuns = cronRuns && Array.isArray(cronRuns) && cronRuns.length > 0;

        return (
          <div className="mt-6 space-y-5">
            {!hasCronRuns && (
              <div className="bg-white border border-[#E8E2D9] rounded-[10px] p-10 text-center" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                <div className="text-2xl mb-2">📡</div>
                <p className="text-[#7F8C8D]">Sin insights aún. Los insights se generan automáticamente desde las tareas recurrentes.</p>
              </div>
            )}

            {/* Cron Insights Feed */}
            {hasCronRuns && (
              <CronInsightsFeed runs={cronRuns} />
            )}
          </div>
        );
      })()}

      {/* Recommendations tab */}
      {activeTab === "recommendations" && (
        <RecommendationsTab slug={slug} />
      )}

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-center gap-4 bg-white border-t border-border p-3 shadow-lg">
          <span className="text-sm font-semibold">
            {selected.size} {t("selected")}
          </span>
          <button
            onClick={() => {
              setTaskType(tabIdeas.some((i) => selected.has(i.id) && i.type === "contact") ? "outreach" : "content");
              setTaskProject(projectList[0]?.id ?? "");
              setShowCreateTask(true);
            }}
            className="px-4 py-1.5 bg-[#2C3E50] text-white font-semibold rounded-lg text-sm hover:bg-[#34495E] transition-all"
          >
            📋 Crear tarea
          </button>
          <button
            onClick={() => handleBulk("approved")}
            className="px-4 py-1.5 bg-[#27AE60] text-white font-semibold rounded-lg text-sm hover:bg-[#229954] transition-all"
          >
            ✅ {t("bulkApprove")}
          </button>
          <button
            onClick={() => handleBulk("rejected")}
            className="px-4 py-1.5 bg-[#E74C3C] text-white font-semibold rounded-lg text-sm hover:bg-[#C0392B] transition-all"
          >
            ❌ {t("bulkReject")}
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="px-3 py-1.5 bg-white text-[#2C3E50] font-semibold rounded-lg text-sm border border-[#E8E2D9] hover:border-[#2C3E50] transition-all"
          >
            {t("no")}
          </button>
        </div>
      )}

      {/* Detail modal */}
      <Modal
        open={!!detailIdea}
        onClose={() => setDetailIdea(null)}
        title={detailIdea?.title || ""}
        size="lg"
      >
        {detailIdea && (
          <IdeaDetailContent
            idea={detailIdea}
            t={t}
            onStatusChange={handleStatusChange}
            onDelete={handleDelete}
            onChat={handleChat}
            onClose={() => setDetailIdea(null)}
          />
        )}
      </Modal>

      {/* Create idea modal */}
      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title={`💡 ${t("newIdea")}`}
        size="lg"
      >
        <div className="space-y-3">
          <div>
            <label className="text-[12px] font-semibold block mb-1">Título</label>
            <input
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              className="w-full p-2 border border-border rounded-md bg-background text-sm"
              placeholder="Título de la idea"
            />
          </div>
          <div>
            <label className="text-[12px] font-semibold block mb-1">{t("description")}</label>
            <textarea
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
              rows={2}
              className="w-full p-2 border border-border rounded-md bg-background text-sm resize-y"
              placeholder="Descripción detallada"
            />
          </div>
          <div>
            <label className="text-[12px] font-semibold block mb-1">{t("list")}</label>
            <select
              value={formList}
              onChange={(e) => setFormList(e.target.value as IdeaList)}
              className="w-full p-2 border border-border rounded-md bg-background text-sm"
            >
              <optgroup label="📝 Contenido">
                <option value="keywords">🔍 Keywords para rankear</option>
                <option value="trending">🔥 Contenido trending</option>
                <option value="gaps">🏆 Gaps vs competencia</option>
                <option value="repurpose">♻️ Contenido para reutilizar</option>
              </optgroup>
              <optgroup label="👥 Contactos">
                <option value="medios">📢 Medios donde aparecer</option>
                <option value="partners">🤝 Partners</option>
                <option value="influencers">🎯 Influencers</option>
                <option value="outreach">📨 Prospects</option>
              </optgroup>
            </select>
          </div>
          <div>
            <label className="text-[12px] font-semibold block mb-1">{t("action")}</label>
            <textarea
              value={formAction}
              onChange={(e) => setFormAction(e.target.value)}
              rows={2}
              className="w-full p-2 border border-border rounded-md bg-background text-sm resize-y"
              placeholder="Ej: Escribir artículo SEO para rankear en 'keyword X'"
            />
          </div>
          {CONTENT_LISTS.includes(formList) && (
            <div>
              <label className="text-[12px] font-semibold block mb-1">{t("channels")}</label>
              <div className="flex gap-3 flex-wrap">
                {CONTENT_CHANNELS.map((ch) => (
                  <label key={ch} className="text-[13px] cursor-pointer flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={formChannels.includes(ch)}
                      onChange={(e) => {
                        if (e.target.checked) setFormChannels((p) => [...p, ch]);
                        else setFormChannels((p) => p.filter((c) => c !== ch));
                      }}
                    />
                    {IDEA_CHANNEL_CONFIG[ch]?.icon} {IDEA_CHANNEL_CONFIG[ch]?.label || ch}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] font-semibold block mb-1">{t("source")}</label>
              <select
                value={formSource}
                onChange={(e) => setFormSource(e.target.value)}
                className="w-full p-2 border border-border rounded-md bg-background text-sm"
              >
                {SOURCE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[12px] font-semibold block mb-1">{t("priority")} (0-100)</label>
              <input
                type="number"
                min={0}
                max={100}
                value={formPriority}
                onChange={(e) => setFormPriority(Number(e.target.value))}
                className="w-full p-2 border border-border rounded-md bg-background text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 border border-[#E8E2D9] rounded-lg bg-white font-semibold text-sm hover:border-[#2C3E50] transition-all"
            >
              {t("no")}
            </button>
            <button
              onClick={handleCreate}
              disabled={createIdea.isPending}
              className="px-4 py-2 bg-[#2C3E50] text-white font-semibold rounded-lg text-sm hover:bg-[#34495E] transition-all"
            >
              {createIdea.isPending ? "..." : "Crear Idea"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Create task from ideas modal */}
      <Modal
        open={showCreateTask}
        onClose={() => { setShowCreateTask(false); setTaskProject(""); setTaskProjectSearch(""); }}
        title="📋 Crear tarea"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-[13px] text-[#7F8C8D]">
            {selected.size} idea{selected.size !== 1 ? "s" : ""} seleccionada{selected.size !== 1 ? "s" : ""}
          </p>

          {/* Project picker with search */}
          <div>
            <label className="text-[12px] font-semibold block mb-1">Proyecto</label>
            {taskProject ? (
              <div className="flex items-center gap-2 p-2 border border-[#E8E2D9] rounded-lg bg-[#FDFCFA]">
                <span className="text-[13px] font-bold text-[#C45D35]">{taskProject}</span>
                <span className="text-[13px] text-[#2C3E50]">
                  {taskProject === "__NEW__" ? "Nuevo proyecto" : projectList.find((p) => p.id === taskProject)?.name || ""}
                </span>
                <span className="flex-1" />
                <button
                  type="button"
                  onClick={() => { setTaskProject(""); setTaskProjectSearch(""); }}
                  className="text-[11px] text-[#7F8C8D] hover:text-[#2C3E50]"
                >
                  Cambiar
                </button>
              </div>
            ) : (
              <>
                <input
                  type="text"
                  placeholder="Buscar proyecto..."
                  value={taskProjectSearch}
                  onChange={(e) => setTaskProjectSearch(e.target.value)}
                  autoFocus
                  className="w-full text-[13px] px-3 py-2 mb-1.5 border border-[#E8E2D9] rounded-lg bg-white outline-none focus:border-[#C45D35]"
                />
                <div className="flex flex-col gap-0.5 max-h-40 overflow-y-auto border border-[#E8E2D9] rounded-lg">
                  {projectList
                    .filter((p) => !["archived", "cancelled", "discarded"].includes(p.status))
                    .filter((p) => {
                      if (!taskProjectSearch) return true;
                      const q = taskProjectSearch.toLowerCase();
                      return p.id.toLowerCase().includes(q) || p.name.toLowerCase().includes(q);
                    })
                    .map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => { setTaskProject(p.id); setTaskProjectSearch(""); }}
                        className="text-left text-[12px] px-3 py-2 hover:bg-[#2C3E50]/5 transition-colors"
                      >
                        <span className="font-bold text-[#C45D35]">{p.id}</span>{" "}
                        <span className="text-[#2C3E50]">{p.name}</span>
                      </button>
                    ))}
                </div>
                <button
                  type="button"
                  onClick={() => setTaskProject("__NEW__")}
                  className="text-[11px] font-semibold text-[#C45D35] hover:text-[#A04B2A] mt-1.5"
                >
                  + Crear nuevo proyecto
                </button>
              </>
            )}
          </div>

          <div>
            <label className="text-[12px] font-semibold block mb-1">Nombre de la tarea</label>
            <input
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
              className="w-full p-2 border border-border rounded-md bg-background text-sm"
              placeholder="Ej: Batch contenido LinkedIn Q2"
            />
          </div>
          <div>
            <label className="text-[12px] font-semibold block mb-1">Tipo</label>
            <select
              value={taskType}
              onChange={(e) => setTaskType(e.target.value)}
              className="w-full p-2 border border-border rounded-md bg-background text-sm"
            >
              <option value="content">📝 Content</option>
              <option value="outreach">👥 Outreach</option>
              <option value="research">🔍 Research</option>
              <option value="execution">⚙️ Execution</option>
            </select>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button
              onClick={() => { setShowCreateTask(false); setTaskProject(""); setTaskProjectSearch(""); }}
              className="px-4 py-2 border border-[#E8E2D9] rounded-lg bg-white font-semibold text-sm hover:border-[#2C3E50] transition-all"
            >
              Cancelar
            </button>
            <button
              onClick={handleCreateTask}
              disabled={creatingTask || !taskProject || !taskName.trim()}
              className="px-4 py-2 bg-[#2C3E50] text-white font-semibold rounded-lg text-sm hover:bg-[#34495E] transition-all disabled:opacity-50"
            >
              {creatingTask ? "..." : "Crear tarea"}
            </button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
}

// ============================================================
// Idea Detail Content (inside modal)
// ============================================================

function IdeaDetailContent({
  idea,
  t,
  onStatusChange,
  onDelete,
  onChat,
  onClose,
}: {
  idea: Idea;
  t: ReturnType<typeof useTranslations>;
  onStatusChange: (id: string, status: string) => void;
  onDelete: (id: string) => void;
  onChat: (idea: Idea) => void;
  onClose: () => void;
}) {
  const stColor = STATUS_BADGE_COLORS[idea.status] || { bg: "#F5F5F5", fg: "#888" };
  const listCfg = IDEA_LIST_CONFIG[idea.list] || { icon: "📌", label: idea.list || "—" };

  return (
    <div className="max-h-[70vh] overflow-y-auto">
      {/* Status pill */}
      <div className="mb-4">
        <span
          className="px-2.5 py-1 rounded-full text-[13px] font-semibold"
          style={{ background: stColor.bg, color: stColor.fg }}
        >
          {STATUS_LABELS[idea.status] || idea.status}
        </span>
      </div>

      {/* Action */}
      {idea.action && (
        <div className="mb-4 bg-[#FDFCFA] border-l-4 border-[#3498DB] rounded-r-lg p-3">
          <div className="text-[12px] text-muted-foreground mb-1 font-semibold">🎯 {t("action")}</div>
          <div className="text-[15px] leading-relaxed">{idea.action}</div>
        </div>
      )}

      {/* Description */}
      {idea.description && (
        <div className="mb-4">
          <div className="text-[13px] text-muted-foreground mb-1">{t("description")}</div>
          <div className="text-[15px] leading-relaxed">{idea.description}</div>
        </div>
      )}

      {/* Metadata grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <div className="text-[12px] text-muted-foreground">{t("list")}</div>
          <div className="text-[14px]">{listCfg.icon} {listCfg.label}</div>
        </div>
        <div>
          <div className="text-[12px] text-muted-foreground">{t("source")}</div>
          <div className="text-[14px]">{IDEA_SOURCE_LABELS[idea.source] || idea.source || "—"}</div>
        </div>
        <div>
          <div className="text-[12px] text-muted-foreground">{t("priority")}</div>
          <div className="text-[18px] font-bold" style={{ color: scoreColor(idea.priority_score || 0) }}>
            {scoreEmoji(idea.priority_score || 0)} {idea.priority_score || "—"}
          </div>
        </div>
        <div>
          <div className="text-[12px] text-muted-foreground">{t("created")}</div>
          <div className="text-[14px]">
            {idea.created_at ? new Date(idea.created_at).toLocaleDateString("es-ES") : "—"}
          </div>
        </div>
      </div>

      {/* Channels */}
      {idea.channels && idea.channels.length > 0 && (
        <div className="mb-4">
          <div className="text-[12px] text-muted-foreground mb-1.5">{t("channels")}</div>
          <div className="flex flex-wrap gap-1.5">
            {idea.channels.map((ch) => {
              const cfg = IDEA_CHANNEL_CONFIG[ch] || { icon: "📄", label: ch };
              return (
                <span key={ch} className="px-2 py-0.5 bg-background border border-border rounded-full text-[12px]">
                  {cfg.icon} {cfg.label}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Source data */}
      {idea.source_data && Object.keys(idea.source_data).length > 0 && (
        <div className="mb-4">
          <div className="text-[12px] text-muted-foreground mb-1.5">{t("sourceData")}</div>
          <pre className="bg-background border border-border rounded-lg p-3 text-[12px] whitespace-pre-wrap break-all">
            {JSON.stringify(idea.source_data, null, 2)}
          </pre>
        </div>
      )}

      {/* Pieces */}
      {idea.pieces && idea.pieces.length > 0 && (
        <div className="mb-4">
          <div className="text-[12px] text-muted-foreground mb-1.5">{t("pieces")}</div>
          <div className="space-y-2">
            {idea.pieces.map((piece) => (
              <div key={piece.id} className="border border-[#E8E2D9] rounded-lg p-3">
                <p className="text-sm font-semibold">{piece.title}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">{piece.channel}</span>
                  <span className="text-[10px] text-muted-foreground">{piece.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Approval info */}
      {idea.approved_at && (
        <div className="mb-4">
          <div className="text-[12px] text-muted-foreground mb-1">{t("approval")}</div>
          <div className="text-[14px]">
            ✅ {new Date(idea.approved_at).toLocaleString("es-ES")}
            {idea.approved_by ? ` por ${idea.approved_by}` : ""}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2 mt-5 pt-4 border-t border-border">
        {idea.status === "new" && (
          <>
            <button
              onClick={() => { onStatusChange(idea.id, "approved"); onClose(); }}
              className="px-5 py-2 bg-[#27AE60] text-white font-semibold rounded-md text-sm hover:bg-[#229954] transition-all"
            >
              ✅ Aprobar
            </button>
            <button
              onClick={() => { onStatusChange(idea.id, "rejected"); onClose(); }}
              className="px-5 py-2 bg-[#E74C3C] text-white font-semibold rounded-md text-sm hover:bg-[#C0392B] transition-all"
            >
              ❌ Descartar
            </button>
          </>
        )}
        <button
          onClick={() => onChat(idea)}
          className="px-5 py-2 bg-[#2C3E50] text-white font-semibold rounded-md text-sm hover:bg-[#34495E] transition-all"
        >
          💬 Chat
        </button>
        <button
          onClick={() => { if (confirm(t("confirmDelete"))) { onDelete(idea.id); } }}
          className="px-5 py-2 bg-white border border-[#E8E2D9] rounded-md text-sm hover:border-[#2C3E50] transition-all"
        >
          🗑️ {t("delete")}
        </button>
        <button
          onClick={onClose}
          className="px-5 py-2 bg-background border-2 border-border rounded-md text-sm ml-auto"
        >
          {t("close")}
        </button>
      </div>
    </div>
  );
}

