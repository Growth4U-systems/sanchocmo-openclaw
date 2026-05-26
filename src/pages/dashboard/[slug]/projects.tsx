import React, { useState, useMemo, useCallback } from "react";
import Head from "next/head";
import Link from "next/link";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useSlugSync } from "@/hooks/useSlugSync";
import {
  useProjects,
  useUpdateProject,
} from "@/hooks/useProjects";
import { useOpenChat } from "@/hooks/useChat";
import { buildTaskThread, buildProjectThread } from "@/lib/chat-openers";
import { cn } from "@/lib/utils";
import type { Project, Task } from "@/types";

import { StatCard } from "@/components/shared/stat-card";
import { StatusPill } from "@/components/shared/status-pill";
import { TaskTypeBadge } from "@/components/shared/task-type-badge";
import { ChannelBadge } from "@/components/shared/channel-badge";
import { ProgressBar } from "@/components/shared/progress-bar";
import { TabGroup } from "@/components/shared/tab-group";
import { CollapsibleSection } from "@/components/shared/collapsible-section";
import { EmptyState } from "@/components/shared/empty-state";
import { WorkEditor } from "@/components/projects/work-editor";

// ---------------------------------------------------------------------------
// Local types
// ---------------------------------------------------------------------------

interface ProjectWithTasks {
  project: Project;
  tasks: Task[];
}

const DONE_STATUSES = ["completed", "done", "discarded", "cancelled"];

function isDone(status: string) {
  return DONE_STATUSES.includes(status);
}

function tasksDoneCount(tasks: Task[]): number {
  return tasks.filter((t) => isDone(t.status)).length;
}

function tasksPendingCount(tasks: Task[]): number {
  return tasks.filter((t) => !isDone(t.status)).length;
}

function isArchivedProject(p: Project): boolean {
  return p?.status === "archived" || p?.status === "cancelled";
}

/** Normaliza statuses de proyecto para la UI */
function displayStatus(status: string): string {
  if (status === "active") return "in-progress";
  return status;
}

/** Labels en español para el pill de proyecto */
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

/** Prioridad de ordenamiento: in-progress/active primero, completed/done al final */
const STATUS_SORT_ORDER: Record<string, number> = {
  "in-progress": 0,
  "in_progress": 0,
  active: 0,
  todo: 1,
  pending: 1,
  ready: 1,
  blocked: 2,
  completed: 3,
  done: 3,
};

function sortByStatus(a: ProjectWithTasks, b: ProjectWithTasks): number {
  const aOrder = STATUS_SORT_ORDER[a.project.status] ?? 1;
  const bOrder = STATUS_SORT_ORDER[b.project.status] ?? 1;
  return aOrder - bOrder;
}

// ---------------------------------------------------------------------------
// Kanban columns definition (task-level, matching legacy)
// ---------------------------------------------------------------------------

const KANBAN_TASK_COLS = [
  { key: "todo", label: "Por hacer", statuses: ["todo", "pending", "ready"], icon: "📋" },
  { key: "in-progress", label: "En progreso", statuses: ["in-progress", "in_progress"], icon: "🔧" },
  { key: "blocked", label: "Bloqueado", statuses: ["blocked"], icon: "⛔" },
  { key: "done", label: "Completado", statuses: ["completed", "done"], icon: "✅" },
  { key: "discarded", label: "Descartado", statuses: ["discarded", "cancelled"], icon: "🗑️" },
];

const KANBAN_PROJECT_COLS = [
  { key: "in-progress", label: "En progreso", statuses: ["in-progress", "in_progress", "active"], icon: "🔧" },
  { key: "todo", label: "Por hacer", statuses: ["todo", "pending", "ready"], icon: "📋" },
  { key: "blocked", label: "Pend. aprobar", statuses: ["blocked"], icon: "⏳" },
  { key: "done", label: "Completado", statuses: ["completed", "done"], icon: "✅" },
];

// Effective status: if project is blocked, todo tasks become blocked
function effectiveStatus(task: Task, projectBlocked: boolean): string {
  const s = task.status;
  if (projectBlocked && ["todo", "pending", "ready"].includes(s)) return "blocked";
  return s;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ProjectsPage() {
  const slug = useSlugSync() || "";
  const { data, isLoading } = useProjects(slug || null);
  const [tab, setTab] = useState<string>("list");
  const [kanbanMode, setKanbanMode] = useState<"projects" | "tasks">("projects");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"task" | "project">("task");
  const [editorId, setEditorId] = useState<string | null>(null);
  const openChat = useOpenChat();

  // Separate active and archived
  const { active, archived } = useMemo(() => {
    if (!data) return { active: [] as ProjectWithTasks[], archived: [] as ProjectWithTasks[] };
    return {
      active: data.filter((pw) => !isArchivedProject(pw.project)).sort(sortByStatus),
      archived: data.filter((pw) => isArchivedProject(pw.project)),
    };
  }, [data]);

  // Stats calculated from data
  const stats = useMemo(() => {
    const totalTasks = active.reduce((s, pw) => s + pw.tasks.length, 0);
    const doneTasks = active.reduce((s, pw) => s + tasksDoneCount(pw.tasks), 0);
    const activeCount = active.filter((pw) => pw.project.status === "active" || pw.project.status === "in-progress").length;
    const blockedCount = active.filter((pw) => pw.project.status === "blocked").length;
    const pct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
    return { activeCount, blockedCount, doneTasks, totalTasks, pct };
  }, [active]);

  // All tasks for kanban (from non-archived projects)
  const kanbanTasks = useMemo(() => {
    const all: (Task & { projectId: string; projectName: string; effectiveStatus: string })[] = [];
    for (const pw of active) {
      const pBlocked = pw.project.status === "blocked";
      for (const t of pw.tasks) {
        all.push({
          ...t,
          projectId: pw.project.id,
          projectName: pw.project.name,
          effectiveStatus: effectiveStatus(t, pBlocked),
        });
      }
    }
    return all;
  }, [active]);

  const openEditor = useCallback((mode: "task" | "project", id: string) => {
    setEditorMode(mode);
    setEditorId(id);
    setEditorOpen(true);
  }, []);

  const handleChatTask = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    (t: Task, projectId: string, projectName: string) => {
      if (!slug) return;
      const tType = t.type || t.batch_type || "execution";
      const config = buildTaskThread(slug, t.id, t.name, projectId, {
        taskSkill: t.skill,
        taskChannel: t.channel,
        taskStatus: t.status,
        taskType: tType,
        pillar: t.pillar,
      });
      openChat(slug, config);
    },
    [slug, openChat]
  );

  const handleChatProject = useCallback(
    (p: Project) => {
      if (!slug) return;
      const config = buildProjectThread(slug, p.id, p.name, {
        strategy: p.strategy,
        status: p.status,
      });
      openChat(slug, config);
    },
    [slug, openChat]
  );

  // Find any project/task for editor context
  const allProjects = data || [];

  // --- Loading / Empty states ---
  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground">Cargando proyectos...</p>
        </div>
      </DashboardLayout>
    );
  }

  if (!data || data.length === 0) {
    return (
      <DashboardLayout>
        <Head>
          <title>{`Proyectos - ${slug} - Mission Control`}</title>
        </Head>
        <EmptyState
          icon="📋"
          message="Sin proyectos. Ejecuta el strategic plan para generar proyectos."
        />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <Head>
        <title>{`Proyectos - ${slug} - Mission Control`}</title>
      </Head>

      {/* Header + Stats row */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="font-heading text-2xl text-navy mb-1">📋 Proyectos</h1>
          <p className="text-sm text-muted-foreground">
            Gestion de proyectos y tareas del plan estrategico
          </p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <StatCard value={stats.activeCount} label="En progreso" color="text-blue-600" />
          <StatCard value={stats.blockedCount} label="Pend. aprobar" color="text-destructive" />
          <StatCard value={`${stats.doneTasks}/${stats.totalTasks}`} label="Tareas" />
          <StatCard value={`${stats.pct}%`} label="Progreso" color="text-sage" />
        </div>
      </div>

      {/* Tabs */}
      <TabGroup
        tabs={[
          { key: "list", label: "Por Proyecto", icon: "📂" },
          { key: "kanban", label: "Kanban", icon: "📋" },
        ]}
        activeTab={tab}
        onChange={setTab}
      />

      {/* List View */}
      {tab === "list" && (
        <div className="space-y-3">
          {active.map((pw) => (
            <ProjectCard
              key={pw.project.id}
              pw={pw}
              slug={slug}
              onChatTask={handleChatTask}
              onChatProject={handleChatProject}
              onEditTask={(id) => openEditor("task", id)}
              onEditProject={(id) => openEditor("project", id)}
            />
          ))}

          {/* Archived section */}
          {archived.length > 0 && (
            <div className="mt-6 border-t border-border pt-4">
              <CollapsibleSection
                title={`📦 Archivados (${archived.length})`}
                icon="📦"
                count={archived.length}
                defaultOpen={false}
              >
                <div className="space-y-2 opacity-60">
                  {archived.map((pw) => (
                    <div
                      key={pw.project.id}
                      className="border-[3px] border-ink rounded-lg shadow-comic bg-card px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-heading font-bold text-muted-foreground text-sm">
                          {pw.project.id}
                        </span>
                        <span className="font-medium text-muted-foreground">
                          {pw.project.name}
                        </span>
                        <StatusPill status={pw.project.status} />
                        {pw.project.archive_reason && (
                          <span className="text-xs text-muted-foreground">
                            — {pw.project.archive_reason}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CollapsibleSection>
            </div>
          )}
        </div>
      )}

      {/* Kanban View */}
      {tab === "kanban" && (
        <div>
          {/* Kanban mode selector */}
          <div className="flex gap-1 mb-4 bg-muted/30 rounded-lg p-1 w-fit">
            <button
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                kanbanMode === "projects" ? "bg-white shadow-sm text-ink font-semibold" : "text-muted-foreground hover:text-ink"
              )}
              onClick={() => setKanbanMode("projects")}
            >
              Ver proyectos
            </button>
            <button
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                kanbanMode === "tasks" ? "bg-white shadow-sm text-ink font-semibold" : "text-muted-foreground hover:text-ink"
              )}
              onClick={() => setKanbanMode("tasks")}
            >
              Ver tareas
            </button>
          </div>

          {/* Kanban: Projects */}
          {kanbanMode === "projects" && (
            <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: 400 }}>
              {KANBAN_PROJECT_COLS.map((col) => {
                const colProjects = active.filter((pw) =>
                  col.statuses.includes(pw.project.status)
                );
                return (
                  <div
                    key={col.key}
                    className="flex-1 min-w-[240px] max-w-[320px] bg-white rounded-xl flex flex-col border border-border"
                  >
                    <div className="flex justify-between px-3 py-2 font-heading text-sm font-semibold border-b border-border">
                      <span>{col.icon} {col.label}</span>
                      <span className="bg-border text-[11px] px-2 py-0.5 rounded-full font-bold">
                        {colProjects.length}
                      </span>
                    </div>
                    <div className="p-2 flex flex-col gap-2 overflow-y-auto flex-1">
                      {colProjects.map((pw) => {
                        const done = tasksDoneCount(pw.tasks);
                        const pending = tasksPendingCount(pw.tasks);
                        const pct = pw.tasks.length > 0 ? Math.round((done / pw.tasks.length) * 100) : 0;
                        return (
                          <Link
                            key={pw.project.id}
                            href={`/dashboard/${slug}/tasks/${pw.project.id}`}
                            className="bg-white border-2 border-ink rounded-lg p-3 cursor-pointer hover:border-rust transition-colors block shadow-sm"
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <span className="font-heading text-[11px] font-semibold text-rust bg-rust/10 px-2 py-0.5 rounded">
                                {pw.project.id}
                              </span>
                              {pw.project.phase !== undefined && (
                                <span className="text-[10px] text-muted-foreground">
                                  Fase {pw.project.phase}
                                </span>
                              )}
                            </div>
                            <div className="font-semibold text-sm mb-2">{pw.project.name}</div>
                            <div className="flex items-center gap-2">
                              <div className="flex-1">
                                <ProgressBar value={pct} />
                              </div>
                              {pending > 0 ? (
                                <span className="text-[10px] font-semibold text-amber-600">
                                  {pending} pend.
                                </span>
                              ) : pw.tasks.length > 0 ? (
                                <span className="text-[10px] font-semibold text-sage">
                                  ✓
                                </span>
                              ) : null}
                            </div>
                          </Link>
                        );
                      })}
                      {colProjects.length === 0 && (
                        <p className="text-[11px] text-muted-foreground text-center py-8">
                          Sin proyectos
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Kanban: Tasks */}
          {kanbanMode === "tasks" && (
            <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: 400 }}>
              {KANBAN_TASK_COLS.map((col) => {
                const colTasks = kanbanTasks.filter((t) =>
                  col.statuses.includes(t.effectiveStatus)
                );
                return (
                  <div
                    key={col.key}
                    className="flex-1 min-w-[240px] max-w-[320px] bg-white rounded-xl flex flex-col border border-border"
                  >
                    <div className="flex justify-between px-3 py-2 font-heading text-sm font-semibold border-b border-border">
                      <span>{col.icon} {col.label}</span>
                      <span className="bg-border text-[11px] px-2 py-0.5 rounded-full font-bold">
                        {colTasks.length}
                      </span>
                    </div>
                    <div className="p-2 flex flex-col gap-2 overflow-y-auto flex-1">
                      {colTasks.map((t) => {
                        const tType = t.type || t.batch_type || "execution";
                        const isFnd = tType === "foundation" && !!t.pillar;
                        return (
                          <Link
                            key={t.id}
                            href={`/dashboard/${slug}/tasks/${t.id}`}
                            className="bg-white border border-border rounded-lg p-3 cursor-pointer hover:border-rust transition-colors block"
                          >
                            <div className="flex justify-between mb-1 items-center">
                              <span className="font-heading text-[11px] font-semibold text-rust bg-rust/10 px-2 py-0.5 rounded">
                                {t.projectId}
                              </span>
                              <span className="flex gap-1 items-center">
                                <span className="text-[10px] text-muted-foreground">{t.id}</span>
                                <TaskTypeBadge type={tType} />
                                {t.channel && <ChannelBadge channel={t.channel} />}
                                {t.owner && t.owner !== "Sancho" && (
                                  <span className="text-[10px] bg-blue-500/12 text-blue-600 px-1.5 py-0.5 rounded">
                                    👤 {t.owner}
                                  </span>
                                )}
                                <button
                                  className="bg-transparent border-none cursor-pointer text-xs opacity-50 hover:opacity-100"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleChatTask(t, t.projectId, t.projectName);
                                  }}
                                >
                                  💬
                                </button>
                                {!isFnd && (
                                  <button
                                    className="bg-transparent border-none cursor-pointer text-xs opacity-50 hover:opacity-100"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      openEditor("task", t.id);
                                    }}
                                  >
                                    ✏️
                                  </button>
                                )}
                              </span>
                            </div>
                            <div className="font-semibold text-sm mb-1">{t.name}</div>
                            <div className="text-xs text-muted-foreground">{t.projectName}</div>
                          </Link>
                        );
                      })}
                      {colTasks.length === 0 && (
                        <p className="text-[11px] text-muted-foreground text-center py-8">
                          Sin tareas
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Work Editor SlideOver */}
      <WorkEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        mode={editorMode}
        editId={editorId}
        slug={slug}
        projects={allProjects}
      />
    </DashboardLayout>
  );
}

// ---------------------------------------------------------------------------
// Project Card (list view — collapsible with tasks)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Project status dropdown options
// ---------------------------------------------------------------------------

const PROJECT_STATUS_OPTIONS = [
  { value: "in-progress", label: "En progreso" },
  { value: "todo", label: "Por hacer" },
  { value: "blocked", label: "Pendiente de aprobar" },
  { value: "completed", label: "Completado" },
] as const;

/* eslint-disable @typescript-eslint/no-unused-vars */
function ProjectCard({
  pw,
  slug,
  onChatTask,
  onChatProject,
  onEditTask,
  onEditProject,
}: {
  pw: ProjectWithTasks;
  slug: string;
  onChatTask: (t: Task, projectId: string, projectName: string) => void;
  onChatProject: (p: Project) => void;
  onEditTask: (id: string) => void;
  onEditProject: (id: string) => void;
}) {
  /* eslint-enable @typescript-eslint/no-unused-vars */
  const { project: p, tasks } = pw;
  const done = tasksDoneCount(tasks);
  const pending = tasksPendingCount(tasks);
  const pct = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0;
  const [expanded, setExpanded] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const updateProject = useUpdateProject();
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  React.useEffect(() => {
    if (!statusOpen) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setStatusOpen(false);
      }
    }
    const t = setTimeout(() => document.addEventListener("click", handleClick), 0);
    return () => { clearTimeout(t); document.removeEventListener("click", handleClick); };
  }, [statusOpen]);

  const handleStatusChange = (newStatus: string) => {
    setStatusOpen(false);
    if (displayStatus(p.status) === newStatus) return;
    updateProject.mutate({ slug, projectId: p.id, updates: { status: newStatus as Project["status"] } });
  };

  return (
    <div className="border-[3px] border-ink rounded-lg shadow-comic bg-white">
      {/* Project header — click toggles task list */}
      <div
        className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/20 transition-colors cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <span className={cn("text-muted-foreground text-xs shrink-0 transition-transform", expanded && "rotate-90")}>
            ▶
          </span>
          <span className="font-heading font-bold text-rust text-sm shrink-0">
            {p.id}
          </span>
          <span className="font-semibold text-[15px] truncate">{p.name}</span>
          {/* Clickable status pill with dropdown */}
          <div className="relative shrink-0" ref={dropdownRef}>
            <button
              className="appearance-none bg-transparent border-none cursor-pointer p-0 flex items-center gap-1"
              onClick={(e) => {
                e.stopPropagation();
                setStatusOpen(!statusOpen);
              }}
              title="Cambiar estado"
            >
              <StatusPill
                status={displayStatus(p.status)}
                size="lg"
                labelOverride={PROJECT_STATUS_LABELS[p.status]}
              />
              <span className="text-[10px] text-muted-foreground">▾</span>
            </button>
            {statusOpen && (
              <div className="absolute top-full left-0 mt-1 bg-white border-2 border-ink rounded-lg shadow-lg z-50 min-w-[150px] py-1">
                {PROJECT_STATUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    className={cn(
                      "w-full text-left px-3 py-1.5 text-xs hover:bg-muted/40 transition-colors",
                      displayStatus(p.status) === opt.value && "bg-muted/20 font-semibold"
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStatusChange(opt.value);
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {p.blocked_by && (
            <span className="text-[11px] text-destructive shrink-0">
              ⛔ {p.blocked_by}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {p.phase !== undefined && (
            <span className="text-[11px] text-muted-foreground">
              Fase {p.phase}
            </span>
          )}
          <div className="w-[70px]">
            <ProgressBar value={pct} />
          </div>
          {pending > 0 ? (
            <span className="text-xs font-semibold text-amber-600 bg-amber-500/15 px-2 py-0.5 rounded-full">
              {pending} pendiente{pending !== 1 ? "s" : ""}
            </span>
          ) : tasks.length > 0 ? (
            <span className="text-xs font-semibold text-sage bg-sage/15 px-2 py-0.5 rounded-full">
              ✓ Completado
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">Sin tareas</span>
          )}
          <Link
            href={`/dashboard/${slug}/tasks/${p.id}`}
            className="text-sm text-muted-foreground hover:text-rust"
            onClick={(e) => e.stopPropagation()}
            title="Ver detalle"
          >
            →
          </Link>
        </div>
      </div>

      {/* Task rows — collapsible */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 space-y-2">
          {tasks.map((t) => {
            const tDone = isDone(t.status);
            const tType = t.type || t.batch_type || "execution";
            const isFnd = tType === "foundation" && !!t.pillar;
            const taskUrl = `/dashboard/${slug}/tasks/${t.id}`;
            return (
              <Link
                key={t.id}
                href={taskUrl}
                className={cn(
                  "block rounded-lg border border-border bg-white p-3 hover:border-rust hover:shadow-sm transition-all cursor-pointer",
                  tDone && "opacity-50 bg-muted/30"
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <StatusPill status={t.status} size="md" />
                  <span
                    className={cn(
                      "text-sm font-semibold flex-1",
                      tDone && "line-through text-muted-foreground"
                    )}
                  >
                    {t.name}
                  </span>
                  <span className="flex gap-1.5 items-center shrink-0">
                    {t.channel && <ChannelBadge channel={t.channel} />}
                    {t.owner && t.owner !== "Sancho" && (
                      <span className="text-[10px] bg-blue-500/12 text-blue-600 px-1.5 py-0.5 rounded">
                        👤 {t.owner}
                      </span>
                    )}
                    <button
                      className="bg-transparent border-none cursor-pointer text-[13px] opacity-40 hover:opacity-100"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onChatTask(t, p.id, p.name);
                      }}
                    >
                      💬
                    </button>
                    {!isFnd && (
                      <button
                        className="bg-transparent border-none cursor-pointer text-[13px] opacity-40 hover:opacity-100"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onEditTask(t.id);
                        }}
                      >
                        ✏️
                      </button>
                    )}
                  </span>
                </div>
                {t.description && (
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-1 mt-0.5">
                    {t.description}
                  </p>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
