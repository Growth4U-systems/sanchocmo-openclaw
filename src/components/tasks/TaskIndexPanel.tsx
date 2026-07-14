"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useOpenChat } from "@/hooks/useChat";
import { buildContentTaskThread, buildTaskThread } from "@/lib/chat-openers";
import {
  projectTaskIndex,
  type TaskIndexFilter,
  type VisibleTaskIndexRow,
} from "@/lib/task-index-hierarchy";
import type { TaskIndexEntry, TaskIndexResponse, TaskIndexStats } from "@/lib/task-index-types";
import { cn } from "@/lib/utils";

interface Props {
  slug: string;
}

function contentDraftHref(slug: string, task: TaskIndexEntry): string | null {
  if (!task.isContentTask || !task.parentTaskId || task.projectId === "SIN-PROYECTO") return null;
  const channel = task.targetChannels?.[0] || "linkedin";
  return `/dashboard/${encodeURIComponent(slug)}/tasks/${encodeURIComponent(task.projectId)}`
    + `/sub/${encodeURIComponent(task.parentTaskId)}/content/${encodeURIComponent(task.taskId)}`
    + `/draft/${encodeURIComponent(channel)}`;
}

function taskHref(slug: string, task: TaskIndexEntry): string {
  return `/dashboard/${encodeURIComponent(slug)}/tasks/${encodeURIComponent(task.taskId)}`;
}

function isPlaceholder(task: TaskIndexEntry): boolean {
  return task.deliverableFile.includes("/tasks/") && task.deliverableFile.endsWith("/deliverable.md");
}

function statusClass(status: string): string {
  if (status === "completed" || status === "Published") return "bg-green-50 text-green-700";
  if (status === "in-progress" || status === "Draft" || status === "Approved") return "bg-blue-50 text-blue-700";
  return "bg-gray-50 text-gray-500";
}

function TaskLabel({ row, slug, onToggle }: {
  row: VisibleTaskIndexRow;
  slug: string;
  onToggle: (key: string) => void;
}) {
  const task = row.entry;

  return (
    <div
      className="flex min-w-0 items-center"
      style={{ paddingLeft: `${Math.min(row.depth, 8) * 16}px` }}
    >
      {row.hasChildren ? (
        <button
          type="button"
          onClick={() => onToggle(row.key)}
          aria-expanded={row.expanded}
          aria-label={`${row.expanded ? "Contraer" : "Desplegar"} ${task.taskId}`}
          className="mr-1 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] text-muted-foreground hover:text-[#2C3E50] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust/40"
        >
          {row.expanded ? "▾" : "▸"}
        </button>
      ) : row.depth > 0 ? (
        <span className="mr-1 inline-block w-4 shrink-0 text-center text-muted-foreground/60" aria-hidden="true">↳</span>
      ) : null}
      <Link
        href={taskHref(slug, task)}
        className="shrink-0 font-medium text-[#2C3E50] no-underline hover:text-rust"
      >
        {task.taskId}
      </Link>
      <span className="ml-1.5 truncate text-muted-foreground">{task.taskName.slice(0, 40)}</span>
      {task.isContentTask ? (
        <span className="ml-1.5 shrink-0 rounded-full bg-rust/10 px-1.5 py-0.5 text-[9px] text-rust">
          ✍️ content
          {task.targetChannels?.length ? ` · ${task.targetChannels.join("/")}` : ""}
        </span>
      ) : null}
    </div>
  );
}

export function TaskIndexPanel({ slug }: Props) {
  const [entries, setEntries] = useState<TaskIndexEntry[]>([]);
  const [stats, setStats] = useState<TaskIndexStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<TaskIndexFilter>("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const openChat = useOpenChat();

  useEffect(() => {
    if (!slug) return;
    const controller = new AbortController();
    let active = true;

    setLoading(true);
    setError("");
    setExpanded(new Set());

    void fetch(`/api/tasks?slug=${encodeURIComponent(slug)}&view=index`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json() as Partial<TaskIndexResponse> & { error?: string };
        if (!response.ok || !data.ok) throw new Error(data.error || "No se pudo cargar el índice");
        if (!active) return;
        setEntries(data.entries || []);
        setStats(data.stats || null);
      })
      .catch((fetchError: unknown) => {
        if (!active || controller.signal.aborted) return;
        setEntries([]);
        setStats(null);
        setError(fetchError instanceof Error ? fetchError.message : "No se pudo cargar el índice");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [slug]);

  const groups = useMemo(
    () => projectTaskIndex(entries, { filter, search, expanded }),
    [entries, expanded, filter, search],
  );

  const toggleExpanded = (key: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const openTaskChat = (task: TaskIndexEntry) => {
    if (task.isContentTask && task.parentTaskId) {
      const config = buildContentTaskThread(
        slug,
        task.parentTaskId,
        task.taskId,
        task.taskName,
        task.projectId,
        {
          skill: task.skill || undefined,
          skills: task.skills,
          agent: task.agent,
          status: task.status,
          docPath: task.deliverableFile || undefined,
        },
      );
      // The row can be anchored to a promoted/custom chat. The builder still
      // supplies the task harness, while the persisted id preserves history.
      if (task.threadFileExists && task.mcChatThreadId) {
        config.threadId = task.mcChatThreadId;
      }
      openChat(slug, config);
      return;
    }

    const config = buildTaskThread(
      slug,
      task.taskId,
      task.taskName,
      task.projectId,
      {
        taskSkill: task.skill || undefined,
        taskStatus: task.status,
        taskType: task.type,
        skills: task.skills,
        agent: task.agent,
        pillar: task.pillar || undefined,
        deliverableFile: task.deliverableFile || undefined,
      },
    );
    // Pillar tasks intentionally converge on their canonical pillar thread.
    // Other tasks may own a persisted custom thread that must not be replaced
    // by a newly generated empty task thread.
    if (!task.pillar && task.threadFileExists && task.mcChatThreadId) {
      config.threadId = task.mcChatThreadId;
    }
    openChat(slug, config);
  };

  if (loading) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Cargando índice...</p>;
  }

  if (error) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{error}</p>;
  }

  return (
    <div>
      {stats ? (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-lg border border-[#E8E2D9] bg-white px-3 py-2 text-center" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <p className="text-lg font-bold text-[#2C3E50]">{stats.total}</p>
            <p className="text-[9px] uppercase text-muted-foreground">Total tareas</p>
          </div>
          <div className="rounded-lg border border-[#E8E2D9] bg-white px-3 py-2 text-center" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <p className="text-lg font-bold text-green-600">{stats.docOk}</p>
            <p className="text-[9px] uppercase text-muted-foreground">Doc ✅</p>
          </div>
          <div className="rounded-lg border border-[#E8E2D9] bg-white px-3 py-2 text-center" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <p className="text-lg font-bold text-amber-600">{stats.docPlaceholder}</p>
            <p className="text-[9px] uppercase text-muted-foreground">Placeholder</p>
          </div>
          <div className="rounded-lg border border-[#E8E2D9] bg-white px-3 py-2 text-center" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <p className="text-lg font-bold text-[#2C3E50]">{stats.skillOk}/{stats.total}</p>
            <p className="text-[9px] uppercase text-muted-foreground">Skill ✅</p>
          </div>
        </div>
      ) : null}

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por tarea, proyecto, skill..."
          aria-label="Buscar en el índice de tareas"
          className="min-w-0 flex-1 rounded-md border border-[#E8E2D9] px-3 py-1.5 text-[12px] focus:border-rust focus:outline-none"
        />
        <div className="flex gap-1 self-end sm:self-auto">
          {(["all", "ok", "issues"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setFilter(option)}
              aria-pressed={filter === option}
              className={cn(
                "rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors",
                filter === option
                  ? "bg-rust text-white"
                  : "bg-muted/40 text-muted-foreground hover:bg-muted",
              )}
            >
              {option === "all" ? "Todos" : option === "ok" ? "✅ OK" : "⚠️ Issues"}
            </button>
          ))}
        </div>
      </div>

      {groups.map((group) => (
        <section key={group.projectId} className="mb-4">
          <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {group.projectId} — {group.projectName}
          </h3>
          <div className="overflow-hidden rounded-lg border border-[#E8E2D9] bg-white" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-[11px]">
                <thead>
                  <tr className="border-b border-[#E8E2D9] bg-muted/20">
                    <th scope="col" className="px-3 py-1.5 text-left font-semibold text-muted-foreground">Tarea</th>
                    <th scope="col" className="px-2 py-1.5 text-center font-semibold text-muted-foreground">Doc</th>
                    <th scope="col" className="px-2 py-1.5 text-center font-semibold text-muted-foreground">Skill</th>
                    <th scope="col" className="px-2 py-1.5 text-center font-semibold text-muted-foreground">Thread</th>
                    <th scope="col" className="px-2 py-1.5 text-center font-semibold text-muted-foreground">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map((row) => {
                    const task = row.entry;
                    const draftHref = contentDraftHref(slug, task);
                    return (
                      <tr key={row.key} className="border-b border-[#E8E2D9]/50 last:border-0 hover:bg-muted/10">
                        <td className="px-3 py-2">
                          <TaskLabel row={row} slug={slug} onToggle={toggleExpanded} />
                        </td>
                        <td className="px-2 py-2 text-center">
                          {task.docExists ? (
                            <Link
                              href={draftHref || `/dashboard/${encodeURIComponent(slug)}/brand-brain?doc=${encodeURIComponent(task.deliverableFile)}`}
                              className="text-green-600 no-underline hover:text-green-800"
                              title={task.deliverableFile}
                              aria-label={`Abrir documento de ${task.taskId}`}
                            >
                              ✅
                            </Link>
                          ) : isPlaceholder(task) ? (
                            <span title={task.deliverableFile} aria-label={`Documento pendiente de ${task.taskId}`}>⏳</span>
                          ) : (
                            <span title={task.deliverableFile} aria-label={`Documento no disponible para ${task.taskId}`}>❌</span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-center">
                          {task.isContentTask && task.channelSkills?.length ? (
                            <div className="flex flex-wrap justify-center gap-1">
                              {task.channelSkills.map((channelSkill) => (
                                <Link
                                  key={channelSkill.channel}
                                  href={`/dashboard/${encodeURIComponent(slug)}/skills/${encodeURIComponent(channelSkill.skill)}`}
                                  className="rounded-full bg-rust/10 px-1.5 py-0.5 text-[9px] text-rust no-underline transition-colors hover:bg-rust/20"
                                  title={`${channelSkill.channel} → ${channelSkill.skill}`}
                                >
                                  {channelSkill.channel}: {channelSkill.skill}
                                </Link>
                              ))}
                            </div>
                          ) : task.skillOk && task.skill ? (
                            <Link
                              href={`/dashboard/${encodeURIComponent(slug)}/skills/${encodeURIComponent(task.skill)}`}
                              className="rounded-full bg-rust/10 px-1.5 py-0.5 text-[9px] text-rust no-underline transition-colors hover:bg-rust/20"
                            >
                              {task.skill}
                            </Link>
                          ) : task.skillOk && task.executionMode === "agent" ? (
                            <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] text-blue-700">
                              {task.agent ? `${task.agent} · auto` : "Agente · auto"}
                            </span>
                          ) : "❌"}
                        </td>
                        <td className="px-2 py-2 text-center">
                          {task.threadFileExists ? (
                            <button
                              type="button"
                              onClick={() => openTaskChat(task)}
                              className="text-green-600 hover:text-green-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust/40"
                              title={`Abrir chat: ${task.mcChatThreadId}`}
                              aria-label={`Abrir chat de ${task.taskId}`}
                            >
                              ✅
                            </button>
                          ) : (
                            <span aria-label={`Chat no disponible para ${task.taskId}`}>❌</span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-center">
                          <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-medium", statusClass(task.status))}>
                            {task.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ))}

      {groups.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {search ? `Sin resultados para "${search}"` : "Sin tareas"}
        </p>
      ) : null}
    </div>
  );
}
