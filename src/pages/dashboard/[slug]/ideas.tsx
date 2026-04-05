import { useRouter } from "next/router";
import { useState, useMemo } from "react";
import Head from "next/head";
import { useTranslations } from "next-intl";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useIdeas, useUpdateIdeaStatus, useDeleteIdea } from "@/hooks/useIdeas";
import { cn } from "@/lib/utils";
import type { Idea, IdeaStatus, IdeaType } from "@/types";

const STATUS_TABS: { value: IdeaStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pool", label: "Pool" },
  { value: "assigned", label: "Assigned" },
  { value: "in_progress", label: "In Progress" },
  { value: "done", label: "Done" },
];

const TYPE_OPTIONS: { value: IdeaType | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "content", label: "\ud83d\udcdd Content" },
  { value: "contact", label: "\ud83d\udc65 Contact" },
];

const SORT_OPTIONS = [
  { value: "priority_score", label: "Priority" },
  { value: "created_at", label: "Date" },
] as const;

type SortField = (typeof SORT_OPTIONS)[number]["value"];

const STATUS_FLOW: IdeaStatus[] = ["pool", "assigned", "in_progress", "done"];

function statusBadgeClass(status: IdeaStatus): string {
  switch (status) {
    case "pool":
      return "bg-muted text-muted-foreground";
    case "assigned":
      return "bg-blue-100 text-blue-800";
    case "in_progress":
      return "bg-yellow/20 text-yellow-800";
    case "done":
      return "bg-sage/20 text-sage";
  }
}

function typeBadge(type: IdeaType): { icon: string; className: string } {
  if (type === "content") return { icon: "\ud83d\udcdd", className: "text-sage" };
  return { icon: "\ud83d\udc65", className: "text-navy" };
}

function priorityBadge(score: number): { icon: string; className: string } {
  if (score >= 70) return { icon: "\ud83d\udd34", className: "bg-rust/15 text-rust" };
  if (score >= 40) return { icon: "\ud83d\udfe1", className: "bg-yellow/20 text-yellow-800" };
  return { icon: "\u2b1c", className: "bg-border text-muted-foreground" };
}

export default function IdeasPage() {
  const router = useRouter();
  const slug = router.query.slug as string;
  const t = useTranslations("ideas");

  const { data, isLoading } = useIdeas(slug);
  const updateStatus = useUpdateIdeaStatus();
  const deleteIdea = useDeleteIdea();

  const [statusFilter, setStatusFilter] = useState<IdeaStatus | "all">("all");
  const [typeFilter, setTypeFilter] = useState<IdeaType | "all">("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortField>("priority_score");
  const [selectedIdea, setSelectedIdea] = useState<Idea | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const ideas: Idea[] = useMemo(() => data?.[slug] || [], [data, slug]);

  const filtered = useMemo(() => {
    let list = ideas;

    if (statusFilter !== "all") {
      list = list.filter((i) => i.status === statusFilter);
    }
    if (typeFilter !== "all") {
      list = list.filter((i) => i.type === typeFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.description.toLowerCase().includes(q)
      );
    }

    list = [...list].sort((a, b) => {
      if (sortBy === "priority_score") return b.priority_score - a.priority_score;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return list;
  }, [ideas, statusFilter, typeFilter, search, sortBy]);

  // Keep selected idea in sync with data
  const activeIdea = useMemo(() => {
    if (!selectedIdea) return null;
    return ideas.find((i) => i.id === selectedIdea.id) || selectedIdea;
  }, [ideas, selectedIdea]);

  function handleStatusChange(idea: Idea, newStatus: IdeaStatus) {
    updateStatus.mutate({ slug, ideaId: idea.id, status: newStatus });
  }

  function handleDelete(idea: Idea) {
    deleteIdea.mutate(
      { slug, ideaId: idea.id },
      {
        onSuccess: () => {
          setSelectedIdea(null);
          setConfirmDelete(false);
        },
      }
    );
  }

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

      <h1 className="font-heading text-2xl text-navy mb-1">{t("title")}</h1>
      <p className="text-sm text-muted-foreground mb-6">{t("subtitle")}</p>

      {/* Filters bar */}
      <div className="rounded-lg border-[3px] border-ink bg-card p-4 mb-6 shadow-comic">
        {/* Status tabs */}
        <div className="flex flex-wrap gap-2 mb-3">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold border-2 transition-all",
                statusFilter === tab.value
                  ? "border-rust bg-rust text-white"
                  : "border-border hover:border-rust"
              )}
            >
              {tab.label}
              {tab.value !== "all" && (
                <span className="ml-1 opacity-70">
                  ({ideas.filter((i) => i.status === tab.value).length})
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Type filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as IdeaType | "all")}
            className="rounded-lg border-2 border-border bg-background px-3 py-1.5 text-xs font-semibold focus:border-rust focus:outline-none"
          >
            {TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {/* Search */}
          <input
            type="text"
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 min-w-[200px] rounded-lg border-2 border-border bg-background px-3 py-1.5 text-sm focus:border-rust focus:outline-none"
          />

          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortField)}
            className="rounded-lg border-2 border-border bg-background px-3 py-1.5 text-xs font-semibold focus:border-rust focus:outline-none"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Ideas count */}
      <p className="text-xs text-muted-foreground mb-3">
        {filtered.length} {filtered.length === 1 ? "idea" : "ideas"}
      </p>

      {/* Ideas list */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-muted-foreground">{t("empty")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((idea) => {
            const tb = typeBadge(idea.type);
            const pb = priorityBadge(idea.priority_score);
            return (
              <button
                key={idea.id}
                onClick={() => {
                  setSelectedIdea(idea);
                  setConfirmDelete(false);
                }}
                className={cn(
                  "rounded-lg border-[3px] border-ink bg-card p-4 text-left transition-all hover:shadow-comic",
                  activeIdea?.id === idea.id && "ring-2 ring-rust"
                )}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-heading text-sm text-navy leading-tight line-clamp-2">
                    {idea.title}
                  </h3>
                  <span className={cn("shrink-0 text-lg", tb.className)}>
                    {tb.icon}
                  </span>
                </div>

                {/* Badges row */}
                <div className="flex flex-wrap items-center gap-1.5 mb-2">
                  <span
                    className={cn(
                      "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                      statusBadgeClass(idea.status)
                    )}
                  >
                    {idea.status.replace("_", " ")}
                  </span>
                  <span
                    className={cn(
                      "px-2 py-0.5 rounded text-[10px] font-bold",
                      pb.className
                    )}
                  >
                    {pb.icon} {idea.priority_score}
                  </span>
                </div>

                {/* Channels */}
                {idea.channels_suggested.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-1">
                    {idea.channels_suggested.map((ch) => (
                      <span
                        key={ch}
                        className="px-1.5 py-0.5 bg-muted rounded text-[10px]"
                      >
                        {ch}
                      </span>
                    ))}
                  </div>
                )}

                {/* Source */}
                <p className="text-[10px] text-muted-foreground truncate">
                  {idea.source}
                </p>
              </button>
            );
          })}
        </div>
      )}

      {/* Slide-over detail panel */}
      {activeIdea && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => {
              setSelectedIdea(null);
              setConfirmDelete(false);
            }}
          />
          <div className="relative w-full max-w-md bg-card border-l-[3px] border-ink h-full overflow-y-auto p-6">
            <button
              onClick={() => {
                setSelectedIdea(null);
                setConfirmDelete(false);
              }}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
            >
              \u2715
            </button>

            {/* Title */}
            <h2 className="font-heading text-xl text-navy mb-1 pr-8">
              {activeIdea.title}
            </h2>

            {/* Type + Status */}
            <div className="flex items-center gap-2 mb-4">
              <span className={cn("text-lg", typeBadge(activeIdea.type).className)}>
                {typeBadge(activeIdea.type).icon}
              </span>
              <span className="text-xs font-semibold capitalize">
                {activeIdea.type}
              </span>
              <span
                className={cn(
                  "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                  statusBadgeClass(activeIdea.status)
                )}
              >
                {activeIdea.status.replace("_", " ")}
              </span>
            </div>

            {/* Description */}
            <div className="mb-6">
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                {t("description")}
              </div>
              <p className="text-sm leading-relaxed">{activeIdea.description}</p>
            </div>

            {/* Priority */}
            <div className="mb-4">
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                {t("priority")}
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "px-2 py-0.5 rounded text-xs font-bold",
                    priorityBadge(activeIdea.priority_score).className
                  )}
                >
                  {priorityBadge(activeIdea.priority_score).icon}{" "}
                  {activeIdea.priority_score}
                </span>
              </div>
            </div>

            {/* Channels */}
            {activeIdea.channels_suggested.length > 0 && (
              <div className="mb-4">
                <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                  {t("channels")}
                </div>
                <div className="flex flex-wrap gap-1">
                  {activeIdea.channels_suggested.map((ch) => (
                    <span
                      key={ch}
                      className="px-2 py-0.5 bg-muted rounded text-xs"
                    >
                      {ch}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Source */}
            <div className="mb-4">
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                {t("source")}
              </div>
              <p className="text-sm">{activeIdea.source}</p>
            </div>

            {/* Goal */}
            {activeIdea.goal && (
              <div className="mb-4">
                <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                  {t("goal")}
                </div>
                <p className="text-sm capitalize">{activeIdea.goal}</p>
              </div>
            )}

            {/* Theme */}
            {activeIdea.theme && (
              <div className="mb-4">
                <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                  {t("theme")}
                </div>
                <p className="text-sm capitalize">{activeIdea.theme}</p>
              </div>
            )}

            {/* Pieces */}
            {activeIdea.pieces && activeIdea.pieces.length > 0 && (
              <div className="mb-6">
                <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                  {t("pieces")}
                </div>
                <div className="space-y-2">
                  {activeIdea.pieces.map((piece) => (
                    <div
                      key={piece.id}
                      className="rounded-lg border-2 border-border p-3"
                    >
                      <p className="text-sm font-semibold">{piece.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">
                          {piece.channel}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {piece.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Status change */}
            <div className="mb-6">
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                {t("changeStatus")}
              </div>
              <div className="flex flex-wrap gap-2">
                {STATUS_FLOW.map((status) => (
                  <button
                    key={status}
                    onClick={() => handleStatusChange(activeIdea, status)}
                    disabled={
                      activeIdea.status === status || updateStatus.isPending
                    }
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-semibold border-2 transition-all",
                      activeIdea.status === status
                        ? "border-rust bg-rust text-white"
                        : "border-border hover:border-rust"
                    )}
                  >
                    {status.replace("_", " ")}
                  </button>
                ))}
              </div>
            </div>

            {/* Delete */}
            <div className="border-t border-border pt-4">
              {!confirmDelete ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="text-xs text-rust hover:underline"
                >
                  {t("delete")}
                </button>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="text-xs text-rust font-semibold">
                    {t("confirmDelete")}
                  </span>
                  <button
                    onClick={() => handleDelete(activeIdea)}
                    disabled={deleteIdea.isPending}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rust text-white border-2 border-rust hover:bg-rust/90"
                  >
                    {t("yes")}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border-2 border-border hover:border-ink"
                  >
                    {t("no")}
                  </button>
                </div>
              )}
            </div>

            {/* Timestamps */}
            <div className="text-xs text-muted-foreground space-y-1 mt-6 pt-4 border-t border-border">
              <p>
                {t("created")}: {new Date(activeIdea.created_at).toLocaleDateString()}
              </p>
              {activeIdea.approved_at && (
                <p>
                  {t("approved")}: {new Date(activeIdea.approved_at).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
