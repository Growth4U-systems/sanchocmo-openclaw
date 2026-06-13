import React, { useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { EmptyState } from "@/components/shared/empty-state";
import { ProgressBar } from "@/components/shared/progress-bar";
import { StatCard } from "@/components/shared/stat-card";
import { StatusPill } from "@/components/shared/status-pill";
import { TaskTypeBadge } from "@/components/shared/task-type-badge";
import { useSlugSync } from "@/hooks/useSlugSync";
import { type TaskRow, useTaskRows, useUpdateTaskStatus } from "@/hooks/useTasks";
import { cn } from "@/lib/utils";
import { TASK_STATUS_OPTIONS, normalizeTaskStatusQuiet, statusLabel } from "@/lib/task-status";

const OPERATIONAL_DONE = new Set(["completed", "done", "cancelled", "archived"]);
const STATUS_FILTER_ACTIVE = "__active__";
const TASK_STATUS_FILTERS = [
  { value: STATUS_FILTER_ACTIVE, label: "Estados activos" },
  { value: "all", label: "Todos los estados" },
  { value: "todo", label: "Por hacer" },
  { value: "in-progress", label: "En progreso" },
  { value: "pending-review", label: "Pendiente revisión" },
  { value: "blocked", label: "Bloqueadas" },
  { value: "completed", label: "Completadas" },
  { value: "cancelled", label: "Canceladas" },
  { value: "archived", label: "Archivadas" },
] as const;

function isContentTask(row: TaskRow): boolean {
  return row.type === "content_task" || row.type === "content_subtask";
}

function isDone(row: TaskRow): boolean {
  return OPERATIONAL_DONE.has(row.status);
}

function isActive(row: TaskRow): boolean {
  return normalizeTaskStatusQuiet(row.status) === "in-progress";
}

// SAN-192: status canónico de task (7 valores) — sin colapsar. Fuente: task-status.ts.
function displayStatus(row: TaskRow): string {
  return normalizeTaskStatusQuiet(row.status);
}

function rowTypeLabel(type: string): string {
  return type === "content_subtask" ? "content_task" : type;
}

function channelsForRow(row: TaskRow): string[] {
  if (Array.isArray(row.target_channels)) return row.target_channels.filter(Boolean);
  return [];
}

function taskHref(slug: string, row: TaskRow): string {
  if (!isContentTask(row)) return `/dashboard/${slug}/tasks/${row.id}`;
  if (row.project_id && row.parent_id) {
    const channel = channelsForRow(row)[0] || "linkedin";
    return `/dashboard/${slug}/tasks/${row.project_id}/sub/${row.parent_id}/content/${row.id}/draft/${channel}`;
  }
  return `/dashboard/${slug}/content-creation?tab=ideas&focus=${encodeURIComponent(row.id)}`;
}

function rowDepth(row: TaskRow): 0 | 1 | 2 {
  if (typeof row.depth === "number") return row.depth;
  if (isContentTask(row) && row.parent_id) return 2;
  if (row.parent_id) return 1;
  return 0;
}

function typeOptionLabel(type: string): string {
  if (type === "all") return "Todos los tipos";
  return type;
}

function agentLabel(agent?: string | null): string {
  const labels: Record<string, string> = {
    sancho: "Sancho",
    hamete: "Hamete",
    dulcinea: "Dulcinea",
    rocinante: "Rocinante",
    "maese-pedro": "Maese Pedro",
    mambrino: "Mambrino",
    merlin: "Merlin",
    sanson: "Sanson",
    cervantes: "Cervantes",
  };
  return labels[agent || ""] || agent || "Sin agente";
}

function relationLabel(row: TaskRow, count: number): string | null {
  if (!count) return null;
  if (row.type === "project") return `${count} ${count === 1 ? "tarea" : "tareas"}`;
  if (row.type === "content") return `${count} ${count === 1 ? "pieza" : "piezas"}`;
  return `${count} ${count === 1 ? "relacionada" : "relacionadas"}`;
}

function completionSummary(children: TaskRow[]): string | null {
  if (children.length === 0) return null;
  const done = children.filter(isDone).length;
  return `${done}/${children.length} tareas completadas`;
}

// SAN-192: una columna por estado canónico (incl. pending-review, cancelled,
// archived). key = el propio status → arrastrar fija ese status directamente.
const KANBAN_ICONS: Record<string, string> = {
  todo: "📋",
  "in-progress": "🔄",
  "pending-review": "🔎",
  completed: "✅",
  blocked: "⛔",
  cancelled: "✖️",
  archived: "📦",
};
const KANBAN_COLUMNS = TASK_STATUS_OPTIONS.map((o) => ({
  key: o.value as string,
  label: o.label,
  icon: KANBAN_ICONS[o.value] ?? "•",
}));

export default function TasksPage() {
  const slug = useSlugSync() || "";
  const { data: rows, isLoading } = useTaskRows(slug || null);
  const updateStatus = useUpdateTaskStatus();
  const [tab, setTab] = useState("tree");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState(STATUS_FILTER_ACTIVE);
  const [agentFilter, setAgentFilter] = useState("all");

  const allRows = useMemo(() => (rows || []).filter((row) => !isContentTask(row)), [rows]);
  const childrenByParent = useMemo(() => {
    const map = new Map<string, TaskRow[]>();
    for (const row of allRows) {
      if (!row.parent_id) continue;
      const bucket = map.get(row.parent_id) || [];
      bucket.push(row);
      map.set(row.parent_id, bucket);
    }
    return map;
  }, [allRows]);
  const topLevelRows = useMemo(() => allRows.filter((row) => !row.parent_id), [allRows]);

  const typeOptions = useMemo(() => {
    const values = new Set(topLevelRows.map((row) => rowTypeLabel(row.type)));
    return ["all", ...Array.from(values).sort()];
  }, [topLevelRows]);

  const statusOptions = useMemo(() => {
    return TASK_STATUS_FILTERS;
  }, []);

  const agentOptions = useMemo(() => {
    const values = new Set(allRows.map((row) => row.agent).filter(Boolean));
    return ["all", ...Array.from(values).sort()];
  }, [allRows]);

  const filteredRows = useMemo(() => {
    return topLevelRows.filter((row) => {
      const normalizedType = rowTypeLabel(row.type);
      if (typeFilter !== "all" && normalizedType !== typeFilter) return false;
      if (tab === "tree" && statusFilter === STATUS_FILTER_ACTIVE && isDone(row)) return false;
      if (
        statusFilter !== STATUS_FILTER_ACTIVE
        && statusFilter !== "all"
        && normalizeTaskStatusQuiet(row.status) !== statusFilter
      ) return false;
      if (agentFilter !== "all") {
        const childRows = childrenByParent.get(row.id) || [];
        const agentMatches = row.agent === agentFilter || childRows.some((child) => child.agent === agentFilter);
        if (!agentMatches) return false;
      }
      return true;
    });
  }, [agentFilter, childrenByParent, statusFilter, tab, topLevelRows, typeFilter]);

  const stats = useMemo(() => {
    const total = filteredRows.length;
    const done = filteredRows.filter(isDone).length;
    const active = filteredRows.filter(isActive).length;
    return {
      active,
      done,
      total,
      pct: total > 0 ? Math.round((done / total) * 100) : 0,
    };
  }, [filteredRows]);

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground">Cargando tareas...</p>
        </div>
      </DashboardLayout>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <DashboardLayout>
        <Head><title>{`Tareas — ${slug} — Mission Control`}</title></Head>
        <EmptyState icon="📋" message="Sin tareas todavía." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <Head><title>{`Tareas — ${slug} — Mission Control`}</title></Head>

      <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="font-heading text-2xl text-navy mb-1">📋 Tareas</h1>
          <p className="text-sm text-muted-foreground">
            Gestion de tareas y proyectos raíz del plan estrategico
          </p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <StatCard value={stats.active} label="En progreso" color="text-blue-600" />
          <StatCard value={stats.done} label="Completadas" subtitle={`de ${stats.total} visibles`} />
          <StatCard value={`${stats.pct}%`} label="Progreso" color="text-sage" />
        </div>
      </div>

      <div
        className="rounded-sc-lg border-[2.5px] p-3 mb-5 flex gap-2 flex-wrap items-center"
        style={{ background: "var(--sc-paper-3)", borderColor: "var(--sc-ink)", boxShadow: "var(--pop-sm)" }}
      >
        <div className="flex shrink-0">
          {[
            { key: "tree", label: "Lista", icon: "📋" },
            { key: "kanban", label: "Kanban", icon: "▦" },
          ].map((view, index, arr) => {
            const active = tab === view.key;
            return (
              <button
                key={view.key}
                type="button"
                onClick={() => {
                  setTab(view.key);
                  if (view.key === "kanban" && statusFilter === STATUS_FILTER_ACTIVE) {
                    setStatusFilter("all");
                  }
                }}
                className="font-heading uppercase text-[12px] tracking-wider px-3 py-2 border-[2.5px] inline-flex items-center gap-1.5 transition-all"
                style={{
                  background: active ? "var(--sc-rust-500)" : "var(--sc-paper-3)",
                  color: active ? "var(--sc-paper-3)" : "var(--sc-ink)",
                  borderColor: "var(--sc-ink)",
                  borderRadius: index === 0 ? "8px 0 0 8px" : index === arr.length - 1 ? "0 8px 8px 0" : 0,
                  borderRightWidth: index === arr.length - 1 ? 2.5 : 0,
                }}
              >
                <span>{view.icon}</span>
                {view.label}
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:flex xl:flex-wrap gap-2 w-full xl:w-auto">
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            className="h-10 min-w-0 rounded-sc-md border-2 bg-white px-3 font-heading text-[11px] uppercase tracking-wider focus:outline-none"
            style={{ background: "var(--sc-paper-3)", borderColor: "var(--sc-ink)", boxShadow: "var(--pop-xs)" }}
          >
            {typeOptions.map((type) => (
              <option key={type} value={type}>{typeOptionLabel(type)}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="h-10 min-w-0 rounded-sc-md border-2 bg-white px-3 font-heading text-[11px] uppercase tracking-wider focus:outline-none"
            style={{ background: "var(--sc-paper-3)", borderColor: "var(--sc-ink)", boxShadow: "var(--pop-xs)" }}
          >
            {statusOptions.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
          <select
            value={agentFilter}
            onChange={(event) => setAgentFilter(event.target.value)}
            className="h-10 min-w-0 rounded-sc-md border-2 bg-white px-3 font-heading text-[11px] uppercase tracking-wider focus:outline-none"
            style={{ background: "var(--sc-paper-3)", borderColor: "var(--sc-ink)", boxShadow: "var(--pop-xs)" }}
          >
            {agentOptions.map((agent) => (
              <option key={agent} value={agent}>{agent === "all" ? "Todos los agentes" : agentLabel(String(agent))}</option>
            ))}
          </select>
        </div>
      </div>

      {tab === "tree" ? (
        <div className="space-y-2">
          {filteredRows.map((row) => (
            <TaskTreeRow
              key={row.id}
              row={row}
              slug={slug}
            >
              {childrenByParent.get(row.id) || []}
            </TaskTreeRow>
          ))}
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: 420 }}>
          {KANBAN_COLUMNS.map((col) => {
            const colRows = filteredRows.filter((row) => normalizeTaskStatusQuiet(row.status) === col.key);
            return (
              <div
                key={col.key}
                className="flex-1 min-w-[250px] max-w-[340px] bg-white rounded-xl flex flex-col border border-border"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const taskId = event.dataTransfer.getData("application/x-mc-task-id") || event.dataTransfer.getData("text/plain");
                  if (!taskId || !slug) return;
                  const task = filteredRows.find((row) => row.id === taskId);
                  const nextStatus = col.key;
                  if (!task || normalizeTaskStatusQuiet(task.status) === nextStatus) return;
                  updateStatus.mutate({ slug, taskId, status: nextStatus });
                }}
              >
                <div className="flex justify-between px-3 py-2 font-heading text-sm font-semibold border-b border-border">
                  <span>{col.icon} {col.label}</span>
                  <span className="bg-border text-[11px] px-2 py-0.5 rounded-full font-bold">{colRows.length}</span>
                </div>
                <div className="p-2 flex flex-col gap-2 overflow-y-auto flex-1">
                  {colRows.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground text-center py-8">Sin tareas</p>
                  ) : colRows.map((row) => (
                    <TaskKanbanCard key={row.id} row={row} slug={slug}>{childrenByParent.get(row.id) || []}</TaskKanbanCard>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </DashboardLayout>
  );
}

function TaskTreeRow({
  row,
  slug,
  children,
}: {
  row: TaskRow;
  slug: string;
  children: TaskRow[];
}) {
  const depth = rowDepth(row);
  const pending = row.children_count || children.length;
  const href = taskHref(slug, row);
  const rowMeta = row.agent ? `${agentLabel(row.agent)}${row.skill ? ` · ${row.skill}` : ""}` : row.skill;
  const relation = relationLabel(row, Number(pending || 0));
  const completion = completionSummary(children);
  const context = row.parent_name
    ? `Bajo ${row.parent_name}`
    : "Tarea raíz";
  return (
    <div
      className={cn(
        "rounded-sc-lg border-[2.5px] px-3 py-3 sm:px-4",
        depth === 1 && "ml-3 border-l-[7px] sm:ml-7 xl:ml-10",
        depth === 2 && "ml-6 border-l-[7px] sm:ml-12 xl:ml-20",
      )}
      style={{
        background: depth === 2 ? "var(--sc-sun-50)" : "var(--sc-paper-3)",
        borderColor: "var(--sc-ink)",
        boxShadow: "var(--pop-xs)",
      }}
    >
      <div className="flex min-w-0 items-start gap-3">
        <Link
          href={href}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-sc-md border-2 font-heading text-xs no-underline"
          style={{ background: "var(--sc-paper-3)", borderColor: "var(--sc-rust-500)" }}
          aria-label="Abrir tarea"
        >
          ▶
        </Link>
        <Link href={href} className="min-w-0 flex-1 no-underline">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="min-w-0 max-w-full truncate font-heading text-[16px] font-bold leading-tight text-foreground">
              {row.name}
            </span>
            <span className="hidden max-w-[220px] truncate font-mono text-[10px] font-bold uppercase text-muted-foreground sm:inline">
              {row.id}
            </span>
          </div>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            <span className="truncate">{context}</span>
            {rowMeta ? <span className="truncate">{rowMeta}</span> : null}
          </div>
        </Link>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 text-xs sm:max-w-[48%]">
          <TaskTypeBadge type={rowTypeLabel(row.type)} />
          <StatusPill status={displayStatus(row)} size="md" labelOverride={statusLabel(row.status)} />
          {completion ? (
            <span className="font-semibold text-sage">{completion}</span>
          ) : relation ? (
            <span className="font-semibold text-rust">{relation}</span>
          ) : null}
          <Link href={href} className="hidden text-lg text-muted-foreground hover:text-rust no-underline md:block">→</Link>
        </div>
      </div>
    </div>
  );
}

function TaskKanbanCard({ row, slug, children }: { row: TaskRow; slug: string; children: TaskRow[] }) {
  const done = isDone(row);
  const href = taskHref(slug, row);
  const completion = completionSummary(children);
  return (
    <Link
      href={href}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("application/x-mc-task-id", row.id);
        event.dataTransfer.setData("text/plain", row.id);
      }}
      className={cn(
        "block cursor-grab rounded-lg border border-border bg-white p-3 hover:border-rust hover:shadow-sm transition-all no-underline active:cursor-grabbing",
        done && "opacity-60",
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <TaskTypeBadge type={rowTypeLabel(row.type)} />
        <StatusPill status={displayStatus(row)} labelOverride={statusLabel(row.status)} />
      </div>
      <div className="font-semibold text-sm leading-snug text-foreground">{row.name}</div>
      <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
        <span className="truncate">{completion || row.parent_name || row.project_id || "Tarea raíz"}</span>
        <span className="font-semibold">{row.id}</span>
      </div>
      {row.type === "project" && row.children_count ? (
        <div className="mt-2">
          <ProgressBar value={Number(row.children_count || 0)} max={Number(row.children_count || 1)} />
        </div>
      ) : null}
    </Link>
  );
}
