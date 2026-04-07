import { useState, useMemo, useCallback } from "react";
import Head from "next/head";
import { useTranslations } from "next-intl";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useSlugSync } from "@/hooks/useSlugSync";
import { StatCard } from "@/components/shared/stat-card";
import { CollapsibleSection } from "@/components/shared/collapsible-section";
import { FilterBar } from "@/components/shared/filter-bar";
import { Modal } from "@/components/shared/modal";
import { useIdeas, useCreateIdea, useUpdateIdeaStatus, useDeleteIdea } from "@/hooks/useIdeas";
import { useOpenChat } from "@/hooks/useChat";
import { cn } from "@/lib/utils";
import type { Idea, IdeaStatus, IdeaList } from "@/types";

// ============================================================
// Constants — ported from legacy mc-work.js
// ============================================================

const IDEA_LIST_CONFIG: Record<string, { icon: string; label: string; description: string; type: string }> = {
  keywords:    { icon: "\uD83D\uDD0D", label: "Keywords para rankear", description: "Oportunidades SEO detectadas", type: "content" },
  trending:    { icon: "\uD83D\uDD25", label: "Contenido trending para crear", description: "Temas en tendencia en el nicho", type: "content" },
  gaps:        { icon: "\uD83C\uDFC6", label: "Gaps vs competencia", description: "Contenido que competidores no cubren bien", type: "content" },
  repurpose:   { icon: "\u267B\uFE0F", label: "Contenido para reutilizar", description: "Ideas de atomizaci\u00f3n cross-canal", type: "content" },
  medios:      { icon: "\uD83D\uDCE2", label: "Medios donde aparecer", description: "Blogs, revistas, podcasts para PR/guest posts", type: "contact" },
  partners:    { icon: "\uD83E\uDD1D", label: "Partners para colaborar", description: "Empresas/personas para co-marketing", type: "contact" },
  influencers: { icon: "\uD83C\uDFAF", label: "Influencers para contactar", description: "Creadores relevantes en el nicho", type: "contact" },
  outreach:    { icon: "\uD83D\uDCE8", label: "Prospects para contactar", description: "Leads para outreach directo", type: "contact" },
};

const IDEA_SOURCE_LABELS: Record<string, string> = {
  seo_geo: "\uD83D\uDD0D SEO/GEO", signal: "\uD83D\uDCE1 Signal", competitor: "\uD83C\uDFC6 Competencia",
  meeting: "\uD83D\uDDE3\uFE0F Reuni\u00f3n", manual: "\uD83D\uDCA1 Manual", trust_engine: "\uD83D\uDD04 Trust Engine",
  paa: "\u2753 PAA", trending: "Trending", serp_gaps: "SERP Gaps",
};

const IDEA_CHANNEL_CONFIG: Record<string, { icon: string; label: string }> = {
  blog: { icon: "\uD83D\uDCF0", label: "Blog" }, instagram: { icon: "\uD83D\uDCF8", label: "Instagram" },
  linkedin: { icon: "\uD83D\uDCBC", label: "LinkedIn" }, twitter: { icon: "\uD83D\uDC26", label: "Twitter" },
};

const IDEA_CHANNEL_COLORS: Record<string, { bg: string; fg: string }> = {
  blog: { bg: "#E3F2FD", fg: "#1565C0" }, instagram: { bg: "#F3E5F5", fg: "#7B1FA2" },
  linkedin: { bg: "#E8F5E9", fg: "#2E7D32" }, twitter: { bg: "#E1F5FE", fg: "#0277BD" },
};

const CONTENT_LISTS: IdeaList[] = ["keywords", "trending", "gaps", "repurpose"];
const CONTACT_LISTS: IdeaList[] = ["medios", "partners", "influencers", "outreach"];
const ALL_LISTS: IdeaList[] = [...CONTENT_LISTS, ...CONTACT_LISTS];
const CONTENT_CHANNELS = ["blog", "instagram", "linkedin", "twitter"];

const STATUS_TABS: { value: IdeaStatus | "all"; label: string; emoji: string }[] = [
  { value: "all", label: "Todas", emoji: "" },
  { value: "new", label: "Nuevas", emoji: "\uD83C\uDD95" },
  { value: "approved", label: "Aprobadas", emoji: "\u2705" },
  { value: "rejected", label: "Rechazadas", emoji: "\u274C" },
  { value: "executed", label: "Ejecutadas", emoji: "\u2714\uFE0F" },
];

const SOURCE_OPTIONS = [
  { value: "manual", label: "\uD83D\uDCA1 Manual" },
  { value: "seo_geo", label: "\uD83D\uDD0D SEO/GEO" },
  { value: "signal", label: "\uD83D\uDCE1 Signal" },
  { value: "competitor", label: "\uD83C\uDFC6 Competencia" },
  { value: "meeting", label: "\uD83D\uDDE3\uFE0F Reuni\u00f3n" },
  { value: "trust_engine", label: "\uD83D\uDD04 Trust Engine" },
  { value: "paa", label: "\u2753 PAA" },
];

// ============================================================
// Helpers
// ============================================================

/** Normalize legacy idea to current schema */
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
  // Map legacy statuses
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
  if (score >= 70) return "\uD83D\uDD34";
  if (score >= 40) return "\uD83D\uDFE1";
  return "\u2B1C";
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

  // Filters
  const [statusFilter, setStatusFilter] = useState<IdeaStatus | "all">("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Modals
  const [detailIdea, setDetailIdea] = useState<Idea | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // Create form state
  const [formTitle, setFormTitle] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formAction, setFormAction] = useState("");
  const [formList, setFormList] = useState<IdeaList>("keywords");
  const [formSource, setFormSource] = useState("manual");
  const [formPriority, setFormPriority] = useState(50);
  const [formChannels, setFormChannels] = useState<string[]>(["blog"]);

  // Normalize all ideas
  const ideas: Idea[] = useMemo(() => {
    const raw = data?.[slug] || [];
    return raw.map(normalizeIdea).sort(
      (a, b) => (b.created_at || "").localeCompare(a.created_at || "")
    );
  }, [data, slug]);

  // Available sources for dropdown
  const availableSources = useMemo(() => [...new Set(ideas.map((i) => i.source).filter(Boolean))], [ideas]);
  const availableChannels = useMemo(() => {
    const s = new Set<string>();
    ideas.forEach((i) => (i.channels || []).forEach((c) => s.add(c)));
    return CONTENT_CHANNELS.filter((c) => s.has(c));
  }, [ideas]);

  // Stats
  const total = ideas.length;
  const newCount = ideas.filter((i) => i.status === "new").length;
  const approvedCount = ideas.filter((i) => i.status === "approved").length;
  const approvedRate = total > 0 ? Math.round((approvedCount / total) * 100) : 0;

  // Filter
  const filtered = useMemo(() => {
    let list = ideas;
    if (statusFilter !== "all") list = list.filter((i) => i.status === statusFilter);
    if (sourceFilter !== "all") list = list.filter((i) => i.source === sourceFilter);
    if (channelFilter !== "all") list = list.filter((i) => (i.channels || []).includes(channelFilter));
    return list;
  }, [ideas, statusFilter, sourceFilter, channelFilter]);

  // Group by list
  const groups = useMemo(() => {
    const map: Record<string, Idea[]> = {};
    for (const idea of filtered) {
      const key = idea.list || "_none";
      if (!map[key]) map[key] = [];
      map[key].push(idea);
    }
    // Return ordered keys
    const ordered = ALL_LISTS.filter((k) => map[k] && map[k].length > 0);
    const unknown = Object.keys(map).filter((k) => !ALL_LISTS.includes(k as IdeaList) && k !== "_none");
    if (map._none) unknown.push("_none");
    return [...ordered, ...unknown].map((key) => ({ key, ideas: map[key] || [] }));
  }, [filtered]);

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

  // Status actions
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

  // Chat opener for idea
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

  // Create idea
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

  // Analytics data
  const analyticsData = useMemo(() => {
    const stats: Record<string, { total: number; approved: number; rejected: number }> = {};
    ideas.forEach((i) => {
      const src = i.source || "unknown";
      if (!stats[src]) stats[src] = { total: 0, approved: 0, rejected: 0 };
      stats[src].total++;
      if (i.status === "approved" || i.status === "executed") stats[src].approved++;
      else if (i.status === "rejected") stats[src].rejected++;
    });
    return Object.entries(stats)
      .sort((a, b) => b[1].total - a[1].total)
      .map(([src, s]) => ({
        source: IDEA_SOURCE_LABELS[src] || src,
        ...s,
        rate: s.total > 0 ? Math.round((s.approved / s.total) * 100) : 0,
      }));
  }, [ideas]);

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
          <h1 className="font-heading text-2xl text-navy mb-1">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-rust text-white font-bold rounded-lg border-2 border-ink shadow-[3px_3px_0] shadow-ink hover:translate-y-px hover:shadow-[2px_2px_0] hover:shadow-ink transition-all text-sm"
        >
          + {t("newIdea")}
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard value={total} label={t("stats.total")} />
        <StatCard value={newCount} label={t("stats.new")} color="text-blue-600" />
        <StatCard value={approvedCount} label={t("stats.approved")} color="text-sage" />
        <StatCard value={`${approvedRate}%`} label={t("stats.approvalRate")} />
      </div>

      {/* Filter tabs */}
      <div className="rounded-lg border-[3px] border-ink bg-card p-4 mb-6 shadow-comic">
        <div className="flex flex-wrap gap-2 mb-3">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={cn(
                "px-3.5 py-1.5 rounded-full text-[13px] font-semibold border-2 transition-all",
                statusFilter === tab.value
                  ? "border-rust bg-rust text-white"
                  : "border-border bg-card hover:border-rust"
              )}
            >
              {tab.emoji ? `${tab.emoji} ` : ""}{tab.label}
            </button>
          ))}
        </div>

        <FilterBar>
          {/* Source dropdown */}
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="rounded-lg border-2 border-border bg-background px-3 py-1.5 text-xs font-semibold focus:border-rust focus:outline-none"
          >
            <option value="all">{t("sourceAll")}</option>
            {availableSources.map((s) => (
              <option key={s} value={s}>{IDEA_SOURCE_LABELS[s] || s}</option>
            ))}
          </select>

          {/* Channel dropdown */}
          {availableChannels.length > 0 && (
            <select
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value)}
              className="rounded-lg border-2 border-border bg-background px-3 py-1.5 text-xs font-semibold focus:border-rust focus:outline-none"
            >
              <option value="all">{t("channelAll")}</option>
              {availableChannels.map((c) => (
                <option key={c} value={c}>{IDEA_CHANNEL_CONFIG[c]?.icon} {IDEA_CHANNEL_CONFIG[c]?.label || c}</option>
              ))}
            </select>
          )}

          {/* Select all */}
          <label className="text-[13px] text-muted-foreground cursor-pointer flex items-center gap-1.5 ml-auto">
            <input
              type="checkbox"
              checked={selected.size === filtered.length && filtered.length > 0}
              onChange={toggleSelectAll}
            />
            {t("selectAll")}
          </label>
        </FilterBar>
      </div>

      {/* Empty state */}
      {filtered.length === 0 ? (
        <div className="border-[3px] border-ink rounded-lg bg-card p-10 text-center shadow-comic">
          <p className="text-muted-foreground">{t("empty")}</p>
        </div>
      ) : (
        /* Grouped display by list */
        <div className="space-y-2">
          {groups.map(({ key, ideas: groupIdeas }, gi) => {
            const cfg = IDEA_LIST_CONFIG[key] || { icon: "\uD83D\uDCCC", label: key, description: "" };
            return (
              <CollapsibleSection
                key={key}
                title={`${cfg.label} (${groupIdeas.length})`}
                icon={cfg.icon}
                count={groupIdeas.length}
                defaultOpen={gi === 0}
              >
                {cfg.description && (
                  <p className="text-[12px] text-muted-foreground mb-2">{cfg.description}</p>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-[13px]">
                    <thead>
                      <tr className="bg-background">
                        <th className="w-8 p-2 text-center">
                          <input
                            type="checkbox"
                            checked={groupIdeas.every((i) => selected.has(i.id))}
                            onChange={() => {
                              const allSelected = groupIdeas.every((i) => selected.has(i.id));
                              setSelected((prev) => {
                                const next = new Set(prev);
                                groupIdeas.forEach((i) => allSelected ? next.delete(i.id) : next.add(i.id));
                                return next;
                              });
                            }}
                          />
                        </th>
                        <th className="p-2 text-left">{t("titleAction")}</th>
                        <th className="w-[50px] p-2 text-center">{t("score")}</th>
                        <th className="p-2 text-left">{t("channels")}</th>
                        <th className="p-2 text-left">{t("source")}</th>
                        <th className="w-[80px] p-2 text-center">{t("date")}</th>
                        <th className="w-[130px] p-2 text-center">{t("actions")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupIdeas.map((idea) => {
                        const sc = scoreColor(idea.priority_score || 0);
                        const date = idea.created_at
                          ? new Date(idea.created_at).toLocaleDateString("es-ES", { day: "numeric", month: "short" })
                          : "";
                        const isRejected = idea.status === "rejected";
                        const rowOpacity = idea.status === "approved" ? "opacity-60" : isRejected ? "opacity-40" : "";

                        return (
                          <tr key={idea.id} className={cn("border-b border-border", rowOpacity)}>
                            <td className="p-2 text-center">
                              <input
                                type="checkbox"
                                checked={selected.has(idea.id)}
                                onChange={() => toggleSelect(idea.id)}
                              />
                            </td>
                            <td className="p-2">
                              <div
                                className={cn(
                                  "font-semibold cursor-pointer text-rust hover:underline",
                                  isRejected && "line-through"
                                )}
                                onClick={() => setDetailIdea(idea)}
                              >
                                {idea.title || "Sin t\u00edtulo"}
                              </div>
                              {idea.action && (
                                <div className="text-[12px] text-muted-foreground mt-0.5 line-clamp-1">
                                  {idea.action}
                                </div>
                              )}
                            </td>
                            <td className="p-2 text-center">
                              <span className="font-bold text-[14px]" style={{ color: sc }}>
                                {idea.priority_score != null ? Math.round(idea.priority_score) : "-"}
                              </span>
                            </td>
                            <td className="p-2">
                              <div className="flex gap-1 flex-wrap">
                                {(idea.channels || []).map((ch) => {
                                  const cc = IDEA_CHANNEL_COLORS[ch] || { bg: "#ECEFF1", fg: "#37474F" };
                                  const cfg2 = IDEA_CHANNEL_CONFIG[ch] || { icon: "\uD83D\uDCCC", label: ch };
                                  return (
                                    <span
                                      key={ch}
                                      className="px-1.5 py-px rounded-lg text-[10px] font-semibold whitespace-nowrap"
                                      style={{ background: cc.bg, color: cc.fg }}
                                    >
                                      {cfg2.icon} {cfg2.label}
                                    </span>
                                  );
                                })}
                              </div>
                            </td>
                            <td className="p-2">
                              <span className="px-1.5 py-px rounded-lg text-[10px] font-semibold whitespace-nowrap bg-orange-50 text-orange-800">
                                {idea.source ? (IDEA_SOURCE_LABELS[idea.source] || idea.source) : ""}
                              </span>
                            </td>
                            <td className="p-2 text-center text-[12px] text-muted-foreground">{date}</td>
                            <td className="p-2 text-center">
                              <div className="flex gap-0.5 justify-center">
                                {idea.status === "new" && (
                                  <>
                                    <button
                                      title="Aprobar"
                                      onClick={() => handleStatusChange(idea.id, "approved")}
                                      className="bg-transparent border-none cursor-pointer text-[14px] p-0.5"
                                    >
                                      {"\u2705"}
                                    </button>
                                    <button
                                      title="Rechazar"
                                      onClick={() => handleStatusChange(idea.id, "rejected")}
                                      className="bg-transparent border-none cursor-pointer text-[14px] p-0.5"
                                    >
                                      {"\u274C"}
                                    </button>
                                  </>
                                )}
                                <button
                                  title="Chat"
                                  onClick={() => handleChat(idea)}
                                  className="bg-transparent border-none cursor-pointer text-[14px] p-0.5"
                                >
                                  {"\uD83D\uDCAC"}
                                </button>
                                <button
                                  title="Editar"
                                  onClick={() => setDetailIdea(idea)}
                                  className="bg-transparent border-none cursor-pointer text-[14px] p-0.5"
                                >
                                  {"\u270F\uFE0F"}
                                </button>
                                <button
                                  title="Eliminar"
                                  onClick={() => {
                                    if (confirm(t("confirmDelete"))) handleDelete(idea.id);
                                  }}
                                  className="bg-transparent border-none cursor-pointer text-[14px] p-0.5"
                                >
                                  {"\uD83D\uDDD1\uFE0F"}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CollapsibleSection>
            );
          })}
        </div>
      )}

      {/* Analytics section */}
      {analyticsData.length > 0 && (
        <div className="mt-8">
          <CollapsibleSection title={t("analytics")} icon={"\uD83D\uDCCA"}>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr>
                    <th className="text-left p-2 border-b-2 border-border">{t("source")}</th>
                    <th className="text-center p-2 border-b-2 border-border">Total</th>
                    <th className="text-center p-2 border-b-2 border-border">{t("stats.approved")}</th>
                    <th className="text-center p-2 border-b-2 border-border">{t("status.rejected")}</th>
                    <th className="text-center p-2 border-b-2 border-border">{t("stats.approvalRate")}</th>
                    <th className="p-2 border-b-2 border-border">Visual</th>
                  </tr>
                </thead>
                <tbody>
                  {analyticsData.map((row) => {
                    const rateColor = row.rate >= 60 ? "text-sage" : row.rate >= 30 ? "text-yellow-700" : "text-destructive";
                    const maxTotal = Math.max(...analyticsData.map((r) => r.total));
                    const barW = maxTotal > 0 ? Math.round((row.approved / maxTotal) * 100) : 0;
                    return (
                      <tr key={row.source} className="border-b border-border">
                        <td className="p-2">{row.source}</td>
                        <td className="p-2 text-center font-semibold">{row.total}</td>
                        <td className="p-2 text-center text-sage">{row.approved}</td>
                        <td className="p-2 text-center text-destructive">{row.rejected}</td>
                        <td className={cn("p-2 text-center font-semibold", rateColor)}>{row.rate}%</td>
                        <td className="p-2">
                          <div className="bg-border rounded h-2 w-full">
                            <div className="bg-sage rounded h-2" style={{ width: `${barW}%` }} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CollapsibleSection>
        </div>
      )}

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-center gap-4 bg-card border-t-[3px] border-ink p-3 shadow-comic">
          <span className="text-sm font-semibold">
            {selected.size} {t("selected")}
          </span>
          <button
            onClick={() => handleBulk("approved")}
            className="px-4 py-1.5 bg-sage text-white font-semibold rounded-lg text-sm border-2 border-ink shadow-[2px_2px_0] shadow-ink hover:translate-y-px hover:shadow-[1px_1px_0] hover:shadow-ink transition-all"
          >
            {"\u2705"} {t("bulkApprove")}
          </button>
          <button
            onClick={() => handleBulk("rejected")}
            className="px-4 py-1.5 bg-destructive text-white font-semibold rounded-lg text-sm border-2 border-ink shadow-[2px_2px_0] shadow-ink hover:translate-y-px hover:shadow-[1px_1px_0] hover:shadow-ink transition-all"
          >
            {"\u274C"} {t("bulkReject")}
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="px-3 py-1.5 bg-card text-foreground font-semibold rounded-lg text-sm border-2 border-border hover:border-ink transition-all"
          >
            {t("no")}
          </button>
        </div>
      )}

      {/* Idea detail modal */}
      <Modal
        open={!!detailIdea}
        onClose={() => setDetailIdea(null)}
        title={detailIdea?.title || ""}
        size="lg"
      >
        {detailIdea && (
          <IdeaDetailContent
            idea={detailIdea}
            slug={slug}
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
        title={`\uD83D\uDCA1 ${t("newIdea")}`}
        size="lg"
      >
        <div className="space-y-3">
          <div>
            <label className="text-[12px] font-semibold block mb-1">{t("createTitle") as string || "T\u00edtulo"}</label>
            <input
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              className="w-full p-2 border border-border rounded-md bg-background text-sm"
              placeholder="T\u00edtulo de la idea"
            />
          </div>
          <div>
            <label className="text-[12px] font-semibold block mb-1">{t("description")}</label>
            <textarea
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
              rows={2}
              className="w-full p-2 border border-border rounded-md bg-background text-sm resize-y"
              placeholder="Descripci\u00f3n detallada"
            />
          </div>
          <div>
            <label className="text-[12px] font-semibold block mb-1">{t("list")}</label>
            <select
              value={formList}
              onChange={(e) => setFormList(e.target.value as IdeaList)}
              className="w-full p-2 border border-border rounded-md bg-background text-sm"
            >
              <optgroup label="\uD83D\uDCDD Contenido">
                <option value="keywords">{"\uD83D\uDD0D"} Keywords para rankear</option>
                <option value="trending">{"\uD83D\uDD25"} Contenido trending</option>
                <option value="gaps">{"\uD83C\uDFC6"} Gaps vs competencia</option>
                <option value="repurpose">{"\u267B\uFE0F"} Contenido para reutilizar</option>
              </optgroup>
              <optgroup label="\uD83D\uDC65 Contactos">
                <option value="medios">{"\uD83D\uDCE2"} Medios donde aparecer</option>
                <option value="partners">{"\uD83E\uDD1D"} Partners</option>
                <option value="influencers">{"\uD83C\uDFAF"} Influencers</option>
                <option value="outreach">{"\uD83D\uDCE8"} Prospects</option>
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
              placeholder="Ej: Escribir art\u00edculo SEO para rankear en 'keyword X'"
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
              className="px-4 py-2 border-2 border-border rounded-lg bg-card font-semibold text-sm"
            >
              {t("no")}
            </button>
            <button
              onClick={handleCreate}
              disabled={createIdea.isPending}
              className="px-4 py-2 bg-rust text-white font-bold rounded-lg border-2 border-ink shadow-[3px_3px_0] shadow-ink text-sm"
            >
              {createIdea.isPending ? "..." : `Crear Idea`}
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

/* eslint-disable @typescript-eslint/no-unused-vars */
function IdeaDetailContent({
  idea,
  slug,
  t,
  onStatusChange,
  onDelete,
  onChat,
  onClose,
}: {
  idea: Idea;
  slug: string;
  t: ReturnType<typeof useTranslations>;
  onStatusChange: (id: string, status: string) => void;
  onDelete: (id: string) => void;
  onChat: (idea: Idea) => void;
  onClose: () => void;
}) {
  /* eslint-enable @typescript-eslint/no-unused-vars */
  const statusColors: Record<string, string> = { new: "#3B82F6", approved: "#4A5D23", rejected: "#C0392B", executed: "#888" };
  const statusLabels: Record<string, string> = { new: "Nueva", approved: "Aprobada", rejected: "Rechazada", executed: "Ejecutada" };
  const sc = statusColors[idea.status] || "#888";
  const listCfg = IDEA_LIST_CONFIG[idea.list] || { icon: "\uD83D\uDCCC", label: idea.list || "\u2014" };

  return (
    <div className="max-h-[70vh] overflow-y-auto">
      {/* Status pill */}
      <div className="mb-4">
        <span
          className="px-2.5 py-1 rounded-full text-[13px] font-semibold"
          style={{ background: `${sc}20`, color: sc }}
        >
          {statusLabels[idea.status] || idea.status}
        </span>
      </div>

      {/* Action */}
      {idea.action && (
        <div className="mb-4 bg-background border-l-4 border-rust rounded-r-lg p-3">
          <div className="text-[12px] text-muted-foreground mb-1 font-semibold">{"\uD83C\uDFAF"} {t("action")}</div>
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
          <div className="text-[14px]">{IDEA_SOURCE_LABELS[idea.source] || idea.source || "\u2014"}</div>
        </div>
        <div>
          <div className="text-[12px] text-muted-foreground">{t("priority")}</div>
          <div className="text-[18px] font-bold" style={{ color: scoreColor(idea.priority_score || 0) }}>
            {scoreEmoji(idea.priority_score || 0)} {idea.priority_score || "\u2014"}
          </div>
        </div>
        <div>
          <div className="text-[12px] text-muted-foreground">{t("created")}</div>
          <div className="text-[14px]">
            {idea.created_at ? new Date(idea.created_at).toLocaleDateString("es-ES") : "\u2014"}
          </div>
        </div>
      </div>

      {/* Channels */}
      {idea.channels && idea.channels.length > 0 && (
        <div className="mb-4">
          <div className="text-[12px] text-muted-foreground mb-1.5">{t("channels")}</div>
          <div className="flex flex-wrap gap-1.5">
            {idea.channels.map((ch) => {
              const cfg = IDEA_CHANNEL_CONFIG[ch] || { icon: "\uD83D\uDCC4", label: ch };
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
              <div key={piece.id} className="border-2 border-border rounded-lg p-3">
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
            {"\u2705"} {new Date(idea.approved_at).toLocaleString("es-ES")}
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
              className="px-5 py-2 bg-sage text-white font-semibold rounded-md text-sm"
            >
              {"\u2705"} Aprobar
            </button>
            <button
              onClick={() => { onStatusChange(idea.id, "rejected"); onClose(); }}
              className="px-5 py-2 bg-destructive text-white font-semibold rounded-md text-sm"
            >
              {"\u274C"} Rechazar
            </button>
          </>
        )}
        <button
          onClick={() => onChat(idea)}
          className="px-5 py-2 bg-navy text-white font-semibold rounded-md text-sm"
        >
          {"\uD83D\uDCAC"} Chat
        </button>
        <button
          onClick={() => { if (confirm(t("confirmDelete"))) { onDelete(idea.id); } }}
          className="px-5 py-2 bg-background border-2 border-border rounded-md text-sm"
        >
          {"\uD83D\uDDD1\uFE0F"} {t("delete")}
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
