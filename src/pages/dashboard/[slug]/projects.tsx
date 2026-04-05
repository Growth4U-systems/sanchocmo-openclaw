import { useRouter } from "next/router";
import { useState, useMemo } from "react";
import Head from "next/head";
import { useTranslations } from "next-intl";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  useProjects,
  useUpdateTaskStatus,
  useArchiveProject,
} from "@/hooks/useProjects";
import { cn } from "@/lib/utils";
import { PRJ_STATUS_COLOR, TASK_TYPE_META, PRJ_CH_ICON } from "@/lib/constants";
import type { Project, Task, TaskStatus, ProjectStatus } from "@/types";

// ---------------------------------------------------------------------------
// Local types
// ---------------------------------------------------------------------------

interface ProjectWithTasks {
  project: Project;
  tasks: Task[];
}

type ViewMode = "list" | "kanban";

const TASK_STATUSES: TaskStatus[] = ["todo", "ready", "in_progress", "done"];

const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "Por hacer",
  ready: "Listo",
  in_progress: "En progreso",
  done: "Hecho",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tasksDoneCount(tasks: Task[]): number {
  return tasks.filter((t) => t.status === "done").length;
}

function primaryChannel(tasks: Task[]): string {
  if (tasks.length === 0) return "—";
  const counts: Record<string, number> = {};
  for (const t of tasks) {
    counts[t.channel] = (counts[t.channel] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

function statusBgStyle(status: ProjectStatus): React.CSSProperties {
  return { background: PRJ_STATUS_COLOR[status] ?? "var(--border)" };
}

function statusTextClass(status: ProjectStatus): string {
  if (status === "completed" || status === "blocked") return "text-white";
  return "";
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ProjectsPage() {
  const router = useRouter();
  const slug = (router.query.slug as string) || null;
  const t = useTranslations("projects");
  const { data, isLoading } = useProjects(slug);
  const [view, setView] = useState<ViewMode>("list");
  const [selected, setSelected] = useState<ProjectWithTasks | null>(null);

  // Group projects by status for kanban
  const grouped = useMemo(() => {
    const map: Record<ProjectStatus, ProjectWithTasks[]> = {
      todo: [],
      active: [],
      completed: [],
      blocked: [],
    };
    if (data) {
      for (const pw of data) {
        const s = pw.project.status as ProjectStatus;
        (map[s] ?? map.todo).push(pw);
      }
    }
    return map;
  }, [data]);

  // --- Loading / Empty states ---
  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground">{t("title")}...</p>
        </div>
      </DashboardLayout>
    );
  }

  if (!data || data.length === 0) {
    return (
      <DashboardLayout>
        <Head>
          <title>{t("title")} — {slug} — Mission Control</title>
        </Head>
        <h1 className="font-heading text-2xl text-navy mb-1">{t("title")}</h1>
        <div className="text-center py-20">
          <p className="text-muted-foreground">{t("empty")}</p>
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading text-2xl text-navy mb-1">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">
            {data.length} {t("projectCount")}
          </p>
        </div>

        {/* View toggle */}
        <div className="flex gap-1 border-[3px] border-ink rounded-lg overflow-hidden">
          <button
            onClick={() => setView("list")}
            className={cn(
              "px-3 py-1.5 text-sm font-semibold transition-colors",
              view === "list"
                ? "bg-navy text-white"
                : "bg-card text-muted-foreground hover:text-foreground"
            )}
          >
            {t("listView")}
          </button>
          <button
            onClick={() => setView("kanban")}
            className={cn(
              "px-3 py-1.5 text-sm font-semibold transition-colors",
              view === "kanban"
                ? "bg-navy text-white"
                : "bg-card text-muted-foreground hover:text-foreground"
            )}
          >
            {t("kanbanView")}
          </button>
        </div>
      </div>

      {/* Views */}
      {view === "list" ? (
        <ListView items={data} onSelect={setSelected} />
      ) : (
        <KanbanView grouped={grouped} onSelect={setSelected} />
      )}

      {/* Slide-over */}
      {selected && (
        <ProjectSlideOver
          slug={slug!}
          pw={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </DashboardLayout>
  );
}

// ---------------------------------------------------------------------------
// List View
// ---------------------------------------------------------------------------

function ListView({
  items,
  onSelect,
}: {
  items: ProjectWithTasks[];
  onSelect: (pw: ProjectWithTasks) => void;
}) {
  const t = useTranslations("projects");

  return (
    <div className="border-[3px] border-ink rounded-lg shadow-comic overflow-hidden bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-[3px] border-ink bg-muted/40">
            <th className="text-left px-4 py-3 font-heading text-navy">{t("colName")}</th>
            <th className="text-left px-4 py-3 font-heading text-navy">{t("colStatus")}</th>
            <th className="text-left px-4 py-3 font-heading text-navy">{t("colTasks")}</th>
            <th className="text-left px-4 py-3 font-heading text-navy">{t("colPhase")}</th>
            <th className="text-left px-4 py-3 font-heading text-navy">{t("colChannel")}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((pw) => {
            const { project, tasks } = pw;
            const done = tasksDoneCount(tasks);
            const ch = primaryChannel(tasks);
            return (
              <tr
                key={project.id}
                onClick={() => onSelect(pw)}
                className="border-b border-border hover:bg-muted/20 cursor-pointer transition-colors"
              >
                <td className="px-4 py-3 font-semibold">{project.name}</td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "px-2 py-0.5 rounded text-xs font-bold capitalize",
                      statusTextClass(project.status as ProjectStatus)
                    )}
                    style={statusBgStyle(project.status as ProjectStatus)}
                  >
                    {project.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {done}/{tasks.length}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {project.phase === -1 ? "F" : project.phase}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {PRJ_CH_ICON[ch] ?? ""} {ch}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Kanban View
// ---------------------------------------------------------------------------

function KanbanView({
  grouped,
  onSelect,
}: {
  grouped: Record<ProjectStatus, ProjectWithTasks[]>;
  onSelect: (pw: ProjectWithTasks) => void;
}) {
  const t = useTranslations("projects");

  const KANBAN_COLS: { key: ProjectStatus; label: string }[] = [
    { key: "todo", label: t("statusTodo") },
    { key: "active", label: t("statusActive") },
    { key: "completed", label: t("statusCompleted") },
    { key: "blocked", label: t("statusBlocked") },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {KANBAN_COLS.map((col) => (
        <div key={col.key} className="flex flex-col">
          {/* Column header */}
          <div
            className={cn(
              "px-3 py-2 rounded-t-lg text-sm font-bold capitalize border-[3px] border-b-0 border-ink",
              statusTextClass(col.key)
            )}
            style={statusBgStyle(col.key)}
          >
            {col.label}{" "}
            <span className="opacity-70">({grouped[col.key].length})</span>
          </div>

          {/* Cards */}
          <div className="flex-1 border-[3px] border-ink rounded-b-lg bg-card p-2 space-y-2 min-h-[120px]">
            {grouped[col.key].length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">
                {t("emptyColumn")}
              </p>
            )}
            {grouped[col.key].map((pw) => (
              <button
                key={pw.project.id}
                onClick={() => onSelect(pw)}
                className="w-full text-left rounded-lg border-2 border-ink p-3 bg-card hover:shadow-comic-sm transition-all"
              >
                <div className="font-semibold text-sm mb-1 truncate">
                  {pw.project.name}
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {tasksDoneCount(pw.tasks)}/{pw.tasks.length} tasks
                  </span>
                  <span>
                    {pw.project.phase === -1 ? "F" : `P${pw.project.phase}`}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Project Slide-Over
// ---------------------------------------------------------------------------

function ProjectSlideOver({
  slug,
  pw,
  onClose,
}: {
  slug: string;
  pw: ProjectWithTasks;
  onClose: () => void;
}) {
  const t = useTranslations("projects");
  const updateTask = useUpdateTaskStatus();
  const archiveProject = useArchiveProject();
  const { project, tasks } = pw;

  function handleTaskStatusChange(taskId: string, status: TaskStatus) {
    updateTask.mutate({ slug, projectId: project.id, taskId, status });
  }

  function handleArchive() {
    archiveProject.mutate(
      { slug, projectId: project.id },
      { onSuccess: onClose }
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-md bg-card border-l-[3px] border-ink h-full overflow-y-auto p-6">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
        >
          ✕
        </button>

        {/* Project info */}
        <h2 className="font-heading text-xl text-navy mb-1 pr-8">
          {project.name}
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          {project.strategy}
        </p>

        {/* Status badge */}
        <div className="mb-6">
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
            {t("colStatus")}
          </div>
          <span
            className={cn(
              "inline-block px-3 py-1 rounded text-sm font-bold capitalize",
              statusTextClass(project.status as ProjectStatus)
            )}
            style={statusBgStyle(project.status as ProjectStatus)}
          >
            {project.status}
          </span>
        </div>

        {/* Phase */}
        <div className="mb-6">
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
            {t("colPhase")}
          </div>
          <span className="text-sm font-medium">
            {project.phase === -1 ? "Foundation" : `Phase ${project.phase}`}
          </span>
        </div>

        {/* Tasks */}
        <div className="mb-6">
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
            {t("colTasks")} ({tasksDoneCount(tasks)}/{tasks.length})
          </div>
          <div className="space-y-2">
            {tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onStatusChange={(s) => handleTaskStatusChange(task.id, s)}
                isPending={updateTask.isPending}
              />
            ))}
            {tasks.length === 0 && (
              <p className="text-sm text-muted-foreground">{t("noTasks")}</p>
            )}
          </div>
        </div>

        {/* Archive button */}
        <div className="mt-6 pt-4 border-t border-border">
          <button
            onClick={handleArchive}
            disabled={archiveProject.isPending}
            className="w-full px-4 py-2 rounded-lg border-[3px] border-ink text-sm font-bold text-rust hover:bg-red/10 transition-colors disabled:opacity-50"
          >
            {archiveProject.isPending ? t("archiving") : t("archive")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Task Row (inside slide-over)
// ---------------------------------------------------------------------------

function TaskRow({
  task,
  onStatusChange,
  isPending,
}: {
  task: Task;
  onStatusChange: (status: TaskStatus) => void;
  isPending: boolean;
}) {
  const meta = TASK_TYPE_META[task.type] ?? { color: "var(--border)", icon: "📋" };

  return (
    <div className="flex items-center gap-2 rounded-lg border-2 border-ink p-2 bg-card">
      {/* Type badge */}
      <span
        className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold text-white"
        style={{ background: meta.color }}
      >
        {meta.icon} {task.type}
      </span>

      {/* Name */}
      <span className="flex-1 text-sm truncate" title={task.name}>
        {task.name}
      </span>

      {/* Status dropdown */}
      <select
        value={task.status}
        onChange={(e) => onStatusChange(e.target.value as TaskStatus)}
        disabled={isPending}
        className="shrink-0 text-xs border border-border rounded px-1.5 py-1 bg-card cursor-pointer disabled:opacity-50"
      >
        {TASK_STATUSES.map((s) => (
          <option key={s} value={s}>
            {TASK_STATUS_LABEL[s]}
          </option>
        ))}
      </select>
    </div>
  );
}
