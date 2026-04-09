/**
 * Variant A: "Card-based with sections"
 * - Hero card header with comic-style border
 * - Objective/Approach/Metrics in individual bordered cards with colored left borders
 * - Tasks grouped by status with visual hierarchy
 * - Collapsible Documents and Ideas sections
 */

import { useRouter } from "next/router";
import React, { useMemo, useCallback, useState, useEffect, useRef } from "react";
import Head from "next/head";
import Link from "next/link";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useSlugSync } from "@/hooks/useSlugSync";
import { useProjects, useArchiveProject, useUpdateProject, useUpdateTaskStatus } from "@/hooks/useProjects";
import { useIdeas } from "@/hooks/useIdeas";
import { useOpenChat } from "@/hooks/useChat";
import { buildTaskThread, buildProjectThread } from "@/lib/chat-openers";
import { cn } from "@/lib/utils";
import type { Project, Task, Idea } from "@/types";

import { StatusPill } from "@/components/shared/status-pill";
import { TaskTypeBadge } from "@/components/shared/task-type-badge";
import { ChannelBadge } from "@/components/shared/channel-badge";
import { ProgressBar } from "@/components/shared/progress-bar";
import { CollapsibleSection } from "@/components/shared/collapsible-section";
import { EmptyState } from "@/components/shared/empty-state";
import { DocSlideOver } from "@/components/shared/doc-slideover";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DONE_STATUSES = ["completed", "done", "discarded", "cancelled"];
function isDone(s: string) {
  return DONE_STATUSES.includes(s);
}

/** Normaliza "active" → "in-progress" para la UI */
function displayStatus(status: string): string {
  if (status === "active") return "in-progress";
  return status;
}

const PROJECT_STATUS_LABELS: Record<string, string> = {
  "in-progress": "en progreso",
  "in_progress": "en progreso",
  active: "en progreso",
  todo: "por hacer",
  pending: "por hacer",
  blocked: "pend. aprobar",
  completed: "completado",
  done: "completado",
};

const PROJECT_STATUS_OPTIONS = [
  { value: "in-progress", label: "En progreso" },
  { value: "todo", label: "Por hacer" },
  { value: "blocked", label: "Pendiente de aprobar" },
  { value: "completed", label: "Completado" },
] as const;

function getObjectiveText(obj: Project["objective"]): string {
  if (!obj) return "";
  if (typeof obj === "string") return obj;
  return obj.description || "";
}

function getMetricsHtml(obj: Project["objective"]): { metric: string; baseline: string; target: string; unit: string } | null {
  if (!obj || typeof obj === "string") return null;
  if (!obj.metric) return null;
  return {
    metric: obj.metric,
    baseline: String(obj.baseline ?? ""),
    target: String(obj.target ?? ""),
    unit: obj.unit || "",
  };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ProjectDetailPage() {
  const slug = useSlugSync() || "";
  const router = useRouter();
  const projectId = (router.query.projectId as string) || "";
  const { data: allProjects, isLoading } = useProjects(slug || null);
  const archiveProject = useArchiveProject();
  const updateProject = useUpdateProject();
  const updateTaskStatus = useUpdateTaskStatus();
  const openChat = useOpenChat();
  // Inline editing
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<Project>>({});
  const [statusOpen, setStatusOpen] = useState(false);
  const statusRef = useRef<HTMLDivElement>(null);
  const [openDocPath, setOpenDocPath] = useState<string | null>(null);

  // Close status dropdown on outside click
  useEffect(() => {
    if (!statusOpen) return;
    function handleClick(e: MouseEvent) {
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) {
        setStatusOpen(false);
      }
    }
    const t = setTimeout(() => document.addEventListener("click", handleClick), 0);
    return () => { clearTimeout(t); document.removeEventListener("click", handleClick); };
  }, [statusOpen]);

  // Find this project
  const pw = useMemo(() => {
    if (!allProjects) return null;
    return allProjects.find((p) => p.project.id === projectId) || null;
  }, [allProjects, projectId]);

  const project = pw?.project;
  const tasks = useMemo(() => pw?.tasks || [], [pw]);

  // Ideas — all for this project (includes assigned + unassigned)
  const { data: ideasData } = useIdeas(slug || null, { project: projectId });
  const allProjectIdeas: Idea[] = useMemo(() => {
    if (!ideasData || !slug) return [];
    return (ideasData[slug] || []).filter(
      (idea: Idea) => idea.project_ids?.includes(projectId)
    );
  }, [ideasData, slug, projectId]);

  // Ideas grouped by task_id
  const ideasByTask = useMemo(() => {
    const map: Record<string, Idea[]> = {};
    for (const idea of allProjectIdeas) {
      if (idea.task_id) {
        if (!map[idea.task_id]) map[idea.task_id] = [];
        map[idea.task_id].push(idea);
      }
    }
    return map;
  }, [allProjectIdeas]);

  // Unassigned ideas (no task_id)
  const unassignedIdeas = useMemo(() =>
    allProjectIdeas.filter((i) => !i.task_id),
    [allProjectIdeas]
  );

  // Computed
  const tasksDone = tasks.filter((t) => isDone(t.status)).length;
  const pct = tasks.length > 0 ? Math.round((tasksDone / tasks.length) * 100) : 0;
  const objectiveText = project ? getObjectiveText(project.objective) : "";
  const metrics = project ? getMetricsHtml(project.objective) : null;

  // Tasks in 4 kanban columns — always visible
  const KANBAN_COLUMNS = [
    { key: "todo", label: "Por hacer", icon: "📋", color: "border-t-yellow-400", dotColor: "bg-yellow-400", statuses: ["todo", "pending"] },
    { key: "progress", label: "En progreso", icon: "🔄", color: "border-t-blue-500", dotColor: "bg-blue-500", statuses: ["in-progress", "in_progress"] },
    { key: "blocked", label: "Bloqueada", icon: "🚫", color: "border-t-red-500", dotColor: "bg-red-500", statuses: ["blocked"] },
    { key: "done", label: "Completadas", icon: "✅", color: "border-t-green-500", dotColor: "bg-green-500", statuses: ["completed", "done", "discarded", "cancelled"] },
  ] as const;

  const tasksByColumn = useMemo(() => {
    const cols: Record<string, Task[]> = { todo: [], progress: [], blocked: [], done: [] };
    for (const t of tasks) {
      const col = KANBAN_COLUMNS.find((c) => (c.statuses as readonly string[]).includes(t.status));
      const key = col?.key || "todo";
      cols[key].push(t);
    }
    return cols;
  }, [tasks]);


  // All docs across tasks
  const allDocs = useMemo(() => {
    return tasks.flatMap((t) =>
      (t.documents || []).map((d) => ({ ...d, taskId: t.id, taskName: t.name }))
    );
  }, [tasks]);

  // Docs grouped by task
  const docsByTask = useMemo(() => {
    const map: Record<string, { name: string; docs: typeof allDocs }> = {};
    for (const d of allDocs) {
      if (!map[d.taskId]) map[d.taskId] = { name: d.taskName, docs: [] };
      map[d.taskId].docs.push(d);
    }
    return map;
  }, [allDocs]);

  const handleChatProject = useCallback(() => {
    if (!slug || !project) return;
    const config = buildProjectThread(slug, project.id, project.name, {
      strategy: project.strategy,
      status: project.status,
    });
    openChat(slug, config);
  }, [slug, project, openChat]);

  const handleChatTask = useCallback(
    (t: Task) => {
      if (!slug || !project) return;
      const tType = t.type || t.batch_type || "execution";
      const config = buildTaskThread(slug, t.id, t.name, project.id, {
        taskSkill: t.skill,
        taskChannel: t.channel,
        taskStatus: t.status,
        taskType: tType,
        pillar: t.pillar,
      });
      openChat(slug, config);
    },
    [slug, project, openChat]
  );

  const handleArchive = useCallback(() => {
    if (!slug || !project) return;
    archiveProject.mutate(
      { slug, projectId: project.id },
      { onSuccess: () => router.push(`/dashboard/${slug}/projects`) }
    );
  }, [slug, project, archiveProject, router]);

  // Populate draft when entering edit mode
  useEffect(() => {
    if (editing && project) {
      const obj = typeof project.objective === "string" ? project.objective : project.objective?.description || "";
      setDraft({
        name: project.name,
        description: project.description,
        objective: obj,
        approach: project.approach,
        status: project.status,
        review_date: project.review_date,
      } as Partial<Project>);
    }
  }, [editing, project]);

  const handleSaveProject = useCallback(() => {
    if (!slug || !projectId) return;
    updateProject.mutate(
      { slug, projectId, updates: draft },
      { onSuccess: () => setEditing(false) }
    );
  }, [slug, projectId, draft, updateProject]);

  // --- Loading / Not found ---
  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground">Cargando proyecto...</p>
        </div>
      </DashboardLayout>
    );
  }

  if (!project) {
    return (
      <DashboardLayout>
        <Head>
          <title>Proyecto no encontrado — Mission Control</title>
        </Head>
        <EmptyState icon="🔍" message="Proyecto no encontrado." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <Head>
        <title>
          {project.id} — {project.name} — Mission Control
        </title>
      </Head>

      {/* Back link */}
      <div className="mb-4">
        <Link
          href={`/dashboard/${slug}/projects`}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Todos los proyectos
        </Link>
      </div>

      {/* ===== HERO CARD ===== */}
      <div className="bg-white border border-[#E8E2D9] rounded-[10px] p-5 mb-6" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-4 flex-1 min-w-0">
            <span className="font-bold text-[#C45D35] text-lg bg-[#F5E6DF] px-4 py-2 rounded-lg border border-[#C45D35]/20 shrink-0" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              {project.id}
            </span>
            <div className="flex-1 min-w-0">
              {editing ? (
                <input
                  value={(draft as Record<string, string>).name || ""}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  className="text-xl font-bold text-[#2C3E50] w-full border border-[#E8E2D9] rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#2C3E50] bg-white"
                />
              ) : (
                <h1 className="text-xl font-bold text-[#2C3E50] m-0">{project.name}</h1>
              )}
              {/* Progress inline */}
              <div className="flex items-center gap-3 mt-3">
                <div className="flex-1">
                  <ProgressBar value={pct} height="sm" />
                </div>
                <span className="text-xs font-semibold text-[#7F8C8D] shrink-0">
                  {tasksDone}/{tasks.length} ({pct}%)
                </span>
              </div>
            </div>
          </div>
          <div className="flex gap-2 shrink-0 items-center">
            {/* Inline status pill with dropdown */}
            <div className="relative" ref={statusRef}>
              <button
                className="appearance-none bg-transparent border border-[#E8E2D9] rounded-lg cursor-pointer px-3 py-1.5 flex items-center gap-1.5 hover:border-[#2C3E50] transition-colors"
                onClick={() => setStatusOpen(!statusOpen)}
              >
                <StatusPill
                  status={displayStatus(project.status)}
                  size="md"
                  labelOverride={PROJECT_STATUS_LABELS[project.status]}
                />
                <span className="text-[10px] text-[#7F8C8D]">▾</span>
              </button>
              {statusOpen && (
                <div className="absolute top-full right-0 mt-1 bg-white border-2 border-[#2C3E50] rounded-lg shadow-lg z-50 min-w-[170px] py-1">
                  {PROJECT_STATUS_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      className={`w-full text-left px-3 py-2 text-xs hover:bg-[#F0EDE8] transition-colors ${
                        displayStatus(project.status) === opt.value ? "bg-[#F0EDE8] font-semibold" : ""
                      }`}
                      onClick={() => {
                        setStatusOpen(false);
                        if (displayStatus(project.status) === opt.value) return;
                        updateProject.mutate({ slug, projectId: project.id, updates: { status: opt.value as Project["status"] } });
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={handleChatProject}
              className="px-3.5 py-1.5 bg-[#2C3E50] text-white rounded-lg cursor-pointer text-[13px] font-semibold hover:bg-[#34495E] transition-all"
            >
              Chat
            </button>
            {editing ? (
              <>
                <button
                  onClick={handleSaveProject}
                  disabled={updateProject.isPending}
                  className="px-3.5 py-1.5 bg-[#27AE60] text-white rounded-lg cursor-pointer text-[13px] font-semibold hover:bg-[#229954] transition-all disabled:opacity-50"
                >
                  {updateProject.isPending ? "..." : "Guardar"}
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="px-3.5 py-1.5 bg-white border border-[#E8E2D9] rounded-lg cursor-pointer text-[13px] hover:border-[#2C3E50] transition-colors font-semibold"
                >
                  Cancelar
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setEditing(true)}
                  className="px-3.5 py-1.5 bg-white border border-[#E8E2D9] rounded-lg cursor-pointer text-[13px] hover:border-[#2C3E50] transition-colors font-semibold"
                >
                  Editar
                </button>
                {project.status !== "archived" && project.status !== "cancelled" && (
                  <button
                    onClick={handleArchive}
                    disabled={archiveProject.isPending}
                    className="px-3.5 py-1.5 bg-white border border-[#E8E2D9] rounded-lg cursor-pointer text-[13px] hover:border-[#E74C3C] text-[#E74C3C] transition-colors font-semibold disabled:opacity-50"
                  >
                    Archivar
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {editing ? (
          <textarea
            value={(draft as Record<string, string>).description || ""}
            onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
            rows={3}
            className="w-full mt-3 text-[14px] text-[#2C3E50] border border-[#E8E2D9] rounded-lg px-3 py-2 focus:outline-none focus:border-[#2C3E50] bg-white resize-y"
            placeholder="Descripción del proyecto..."
          />
        ) : project.description ? (
          <p className="text-[14px] leading-relaxed mt-3 text-[#7F8C8D]">{project.description}</p>
        ) : null}
      </div>

      {/* ===== INFO CARDS ROW ===== */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {(editing || objectiveText) && (
          <div className="bg-white border border-[#E8E2D9] rounded-[10px] p-4 border-l-4 border-l-[#C45D35]" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-base">🎯</span>
              <span className="font-semibold text-sm text-[#C45D35]">Objetivo</span>
            </div>
            {editing ? (
              <textarea
                value={(draft as Record<string, string>).objective || ""}
                onChange={(e) => setDraft((d) => ({ ...d, objective: e.target.value }))}
                rows={2}
                className="w-full border border-[#E8E2D9] rounded-lg px-3 py-2 text-sm bg-white resize-y focus:outline-none focus:border-[#2C3E50]"
              />
            ) : (
              <p className="text-sm leading-relaxed text-[#2C3E50]">{objectiveText}</p>
            )}
          </div>
        )}

        {(editing || project.approach) && (
          <div className="bg-white border border-[#E8E2D9] rounded-[10px] p-4 border-l-4 border-l-[#2C3E50]" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-base">📋</span>
              <span className="font-semibold text-sm text-[#2C3E50]">Enfoque</span>
            </div>
            {editing ? (
              <textarea
                value={(draft as Record<string, string>).approach || ""}
                onChange={(e) => setDraft((d) => ({ ...d, approach: e.target.value }))}
                rows={3}
                className="w-full border border-[#E8E2D9] rounded-lg px-3 py-2 text-sm bg-white resize-y focus:outline-none focus:border-[#2C3E50]"
              />
            ) : (
              <p className="text-sm leading-relaxed text-[#2C3E50]">{project.approach}</p>
            )}
          </div>
        )}

        {metrics && !editing && (
          <div className="bg-white border border-[#E8E2D9] rounded-[10px] p-4 border-l-4 border-l-[#27AE60]" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-base">📊</span>
              <span className="font-semibold text-sm text-[#27AE60]">Metricas</span>
            </div>
            <p className="text-sm text-[#2C3E50]">
              <strong>{metrics.metric}</strong>: {metrics.baseline}
              {metrics.unit} → {metrics.target}
              {metrics.unit}
            </p>
          </div>
        )}

        {editing && (
          <div className="bg-white border border-[#E8E2D9] rounded-[10px] p-4 border-l-4 border-l-[#7F8C8D]" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-base">📅</span>
              <span className="font-semibold text-sm text-[#7F8C8D]">Review date</span>
            </div>
            <input
              type="date"
              value={(draft as Record<string, string>).review_date || ""}
              onChange={(e) => setDraft((d) => ({ ...d, review_date: e.target.value }))}
              className="w-full border border-[#E8E2D9] rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#2C3E50]"
            />
          </div>
        )}
      </div>

      {/* ===== TASKS — 4-COLUMN KANBAN ===== */}
      <div className="text-lg font-bold text-[#2C3E50] mb-4">
        Tareas
      </div>

      <div className="grid grid-cols-4 gap-3 mb-6">
        {KANBAN_COLUMNS.map((col) => {
          const colTasks = tasksByColumn[col.key] || [];
          return (
            <div key={col.key} className="rounded-xl bg-white border border-border shadow-sm overflow-hidden">
              {/* Column header with colored top border */}
              <div className={cn("border-t-2 px-3 py-2.5 flex items-center justify-between bg-white", col.color)}>
                <div className="flex items-center gap-2">
                  <span className="text-sm">{col.icon}</span>
                  <span className="text-xs font-bold uppercase tracking-wide text-[#2C3E50]">
                    {col.label}
                  </span>
                </div>
                <span className={cn(
                  "text-[11px] font-bold min-w-[22px] text-center px-1.5 py-0.5 rounded-full",
                  colTasks.length > 0 ? "bg-foreground/10 text-foreground" : "bg-muted/50 text-muted-foreground"
                )}>
                  {colTasks.length}
                </span>
              </div>

              {/* Task cards */}
              <div className="p-2 space-y-2 min-h-[140px] bg-background/50">
                {colTasks.length === 0 ? (
                  <div className="flex items-center justify-center h-[120px] text-xs text-muted-foreground/40 italic">
                    Sin tareas
                  </div>
                ) : (
                  colTasks.map((t) => {
                    const tDone = isDone(t.status);
                    const tType = t.type || t.batch_type || "execution";
                    const isFnd = tType === "foundation" && !!t.pillar;
                    const docCount = (t.documents || []).length;
                    const taskIdeas = ideasByTask[t.id] || [];
                    const ideaCount = taskIdeas.length;

                    return (
                      <Link
                        key={t.id}
                        href={`/dashboard/${slug}/projects/${project.id}/tasks/${t.id}`}
                        className={cn(
                          "group block rounded-lg border border-border bg-white p-2.5 cursor-pointer hover:border-rust hover:shadow-md transition-all",
                          tDone && "opacity-50"
                        )}
                      >
                        <div className={cn("text-[13px] font-semibold leading-snug mb-1.5", tDone && "line-through")}>
                          {t.name}
                        </div>
                        <div className="flex items-center gap-1 flex-wrap mb-1.5">
                          <TaskTypeBadge type={tType} />
                          {t.skill && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 font-medium">
                              {t.skill}
                            </span>
                          )}
                          {t.channel && <ChannelBadge channel={t.channel} />}
                        </div>
                        <div className="flex items-center justify-between text-[9px] text-muted-foreground">
                          <div className="flex items-center gap-1.5">
                            {t.owner && t.owner !== "Sancho" && (
                              <span>👤 {t.owner}</span>
                            )}
                            {docCount > 0 && <span>📄{docCount}</span>}
                            {ideaCount > 0 && <span>💡{ideaCount}</span>}
                          </div>
                          <span className="font-semibold">{t.id}</span>
                        </div>
                        {/* Hover actions */}
                        <div className="flex gap-2 mt-1.5 pt-1.5 border-t border-transparent group-hover:border-border transition-colors opacity-0 group-hover:opacity-100">
                          <button
                            className="text-[10px] text-muted-foreground hover:text-[#2C3E50] transition-colors"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleChatTask(t); }}
                          >
                            💬 Chat
                          </button>
                          {/* Quick status change buttons */}
                          {!isDone(t.status) && t.status !== "in-progress" && t.status !== "in_progress" && (
                            <button
                              className="text-[10px] text-blue-600 hover:text-blue-800 transition-colors"
                              onClick={(e) => {
                                e.preventDefault(); e.stopPropagation();
                                updateTaskStatus.mutate({ slug, projectId: project.id, taskId: t.id, status: "in-progress" });
                              }}
                            >
                              ▶ Iniciar
                            </button>
                          )}
                          {!isDone(t.status) && (
                            <button
                              className="text-[10px] text-green-600 hover:text-green-800 transition-colors"
                              onClick={(e) => {
                                e.preventDefault(); e.stopPropagation();
                                updateTaskStatus.mutate({ slug, projectId: project.id, taskId: t.id, status: "done" });
                              }}
                            >
                              ✓ Completar
                            </button>
                          )}
                          {!isFnd && (
                            <Link
                              href={`/dashboard/${slug}/projects/${project.id}/tasks/${t.id}`}
                              className="text-[10px] text-muted-foreground hover:text-[#C45D35] transition-colors ml-auto no-underline"
                              onClick={(e) => { e.stopPropagation(); }}
                            >
                              ✏️ Editar
                            </Link>
                          )}
                        </div>
                      </Link>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ===== DOCUMENTS ===== */}
      <div className="bg-white border border-[#E8E2D9] rounded-[10px] overflow-hidden mb-6" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
        <div className="px-4 py-3 border-b border-[#E8E2D9] flex items-center gap-2">
          <span className="text-base">📄</span>
          <span className="font-semibold text-sm text-[#2C3E50]">Documentos</span>
          <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
            {allDocs.length}
          </span>
        </div>
        <div className="p-4">
          {allDocs.length === 0 ? (
            <div className="text-center py-6 text-sm text-muted-foreground/50 italic">
              Este proyecto aun no tiene documentos. Se generaran al ejecutar las tareas.
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(docsByTask).map(([tid, group]) => (
                <div key={tid}>
                  <div className="text-xs font-semibold text-muted-foreground mb-2">
                    {tid} — {group.name}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {group.docs.map((doc, i) => {
                      const docName =
                        doc.title || doc.name || doc.path.split("/").pop()?.replace(".md", "") || "doc";
                      const isImage = /\.(png|jpe?g|webp|gif|svg)$/i.test(doc.path);
                      const icon = doc.path.endsWith(".pdf") ? "📑" : "📄";

                      if (isImage) {
                        return (
                          <div
                            key={i}
                            className="border border-border rounded-lg overflow-hidden cursor-pointer hover:border-rust hover:shadow-sm transition-all"
                          >
                            <img
                              src={`/docs/${doc.path}`}
                              alt={docName}
                              className="max-h-[100px] max-w-[160px] block"
                            />
                            <div className="px-2 py-1 text-[10px] text-muted-foreground bg-white">
                              {docName}
                            </div>
                          </div>
                        );
                      }
                      return (
                        <button
                          key={i}
                          onClick={() => setOpenDocPath(doc.path)}
                          className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg text-xs text-foreground bg-background hover:border-rust hover:shadow-sm transition-all cursor-pointer"
                        >
                          <span>{icon}</span>
                          <span className="font-medium">{docName}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ===== IDEA POOL — COLLAPSIBLE ===== */}
      {unassignedIdeas.length > 0 && (
        <div className="mb-6">
          <CollapsibleSection
            title="Idea Pool"
            icon="💡"
            count={unassignedIdeas.length}
            defaultOpen={false}
          >
            <div className="space-y-1.5">
              {unassignedIdeas.map((idea) => (
                <div
                  key={idea.id}
                  className="px-3 py-2 border border-border rounded-lg text-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{idea.title}</span>
                    {idea.priority_score > 0 && (
                      <span className="text-[11px] text-muted-foreground">
                        ⭐ {idea.priority_score}
                      </span>
                    )}
                  </div>
                  {idea.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                      {idea.description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CollapsibleSection>
        </div>
      )}

      {/* Document SlideOver */}
      <DocSlideOver slug={slug} docPath={openDocPath ? `brand/${slug}/${openDocPath}` : null} onClose={() => setOpenDocPath(null)} />
    </DashboardLayout>
  );
}
