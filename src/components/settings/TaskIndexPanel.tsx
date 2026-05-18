"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useOpenChat } from "@/hooks/useChat";
import { buildTaskThread, buildContentTaskThread } from "@/lib/chat-openers";

interface TaskIndexEntry {
  projectId: string;
  projectName: string;
  taskId: string;
  taskName: string;
  status: string;
  skill: string;
  skillOk: boolean;
  deliverableFile: string;
  docExists: boolean;
  mcChatThreadId: string;
  threadFileExists: boolean;
  pillar: string | null;
  type: string;
  parentTaskId?: string;
  ideaId?: string;
  targetChannels?: string[];
  channelSkills?: { channel: string; skill: string }[];
  isContentTask?: boolean;
}

interface Stats {
  total: number;
  docOk: number;
  docMissing: number;
  docPlaceholder: number;
  skillOk: number;
  threadOk: number;
}

interface Props {
  slug: string;
}

export function TaskIndexPanel({ slug }: Props) {
  const [entries, setEntries] = useState<TaskIndexEntry[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "ok" | "issues">("all");
  const [search, setSearch] = useState("");
  const openChat = useOpenChat();

  useEffect(() => {
    fetch(`/api/system/task-index?slug=${slug}`)
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          setEntries(data.entries || []);
          setStats(data.stats || null);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug]);

  const filtered = useMemo(() => {
    let result = entries;
    if (filter === "ok") result = result.filter(e => e.docExists && e.skillOk && e.threadFileExists);
    if (filter === "issues") result = result.filter(e => !e.docExists || !e.skillOk || !e.threadFileExists);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(e =>
        e.taskId.toLowerCase().includes(q) ||
        e.taskName.toLowerCase().includes(q) ||
        e.projectName.toLowerCase().includes(q) ||
        e.skill.toLowerCase().includes(q) ||
        (e.pillar || "").toLowerCase().includes(q)
      );
    }
    return result;
  }, [entries, filter, search]);

  // Group by project
  const grouped = useMemo(() => {
    const map = new Map<string, TaskIndexEntry[]>();
    for (const e of filtered) {
      const key = e.projectId;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return Array.from(map.entries());
  }, [filtered]);

  if (loading) return <p className="text-sm text-muted-foreground py-8 text-center">Cargando indice...</p>;

  return (
    <div>
      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="bg-white border border-[#E8E2D9] rounded-lg px-3 py-2 text-center" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <p className="text-lg font-bold text-[#2C3E50]">{stats.total}</p>
            <p className="text-[9px] text-muted-foreground uppercase">Total tareas</p>
          </div>
          <div className="bg-white border border-[#E8E2D9] rounded-lg px-3 py-2 text-center" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <p className="text-lg font-bold text-green-600">{stats.docOk}</p>
            <p className="text-[9px] text-muted-foreground uppercase">Doc ✅</p>
          </div>
          <div className="bg-white border border-[#E8E2D9] rounded-lg px-3 py-2 text-center" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <p className="text-lg font-bold text-amber-600">{stats.docPlaceholder}</p>
            <p className="text-[9px] text-muted-foreground uppercase">Placeholder</p>
          </div>
          <div className="bg-white border border-[#E8E2D9] rounded-lg px-3 py-2 text-center" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <p className="text-lg font-bold text-[#2C3E50]">{stats.skillOk}/{stats.total}</p>
            <p className="text-[9px] text-muted-foreground uppercase">Skill ✅</p>
          </div>
        </div>
      )}

      {/* Search + filter */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por tarea, proyecto, skill..."
          className="flex-1 text-[12px] border border-[#E8E2D9] rounded-md px-3 py-1.5 focus:outline-none focus:border-rust"
        />
        <div className="flex gap-1">
          {(["all", "ok", "issues"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={cn("text-[11px] px-3 py-1.5 rounded-md font-medium transition-colors",
                filter === f ? "bg-rust text-white" : "bg-muted/40 text-muted-foreground hover:bg-muted"
              )}>
              {f === "all" ? "Todos" : f === "ok" ? "✅ OK" : "⚠️ Issues"}
            </button>
          ))}
        </div>
      </div>

      {/* Table grouped by project */}
      {grouped.map(([projectId, tasks]) => (
        <div key={projectId} className="mb-4">
          <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
            {projectId} — {tasks[0]?.projectName}
          </h3>
          <div className="bg-white border border-[#E8E2D9] rounded-lg overflow-hidden" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-muted/20 border-b border-[#E8E2D9]">
                  <th className="text-left px-3 py-1.5 font-semibold text-muted-foreground">Tarea</th>
                  <th className="text-center px-2 py-1.5 font-semibold text-muted-foreground">Doc</th>
                  <th className="text-center px-2 py-1.5 font-semibold text-muted-foreground">Skill</th>
                  <th className="text-center px-2 py-1.5 font-semibold text-muted-foreground">Thread</th>
                  <th className="text-center px-2 py-1.5 font-semibold text-muted-foreground">Estado</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map(task => {
                  const taskHref = task.isContentTask && task.parentTaskId
                    ? `/dashboard/${slug}/tasks/${task.parentTaskId}/sub/${task.taskId}`
                    : `/dashboard/${slug}/tasks/${task.taskId}`;
                  return (
                  <tr key={task.taskId} className="border-b border-[#E8E2D9]/50 last:border-0 hover:bg-muted/10">
                    <td className="px-3 py-2">
                      {task.isContentTask && (
                        <span className="text-muted-foreground/60 mr-1" title="ContentTask">↳</span>
                      )}
                      <Link href={taskHref}
                        className="text-[#2C3E50] hover:text-rust no-underline font-medium">
                        {task.taskId}
                      </Link>
                      <span className="text-muted-foreground ml-1.5">{task.taskName.slice(0, 40)}</span>
                      {task.isContentTask && (
                        <span className="ml-1.5 text-[9px] bg-rust/10 text-rust px-1.5 py-0.5 rounded-full">
                          ✍️ content
                          {task.targetChannels?.length ? ` · ${task.targetChannels.join("/")}` : ""}
                        </span>
                      )}
                    </td>
                    <td className="text-center px-2 py-2">
                      {task.docExists ? (
                        task.isContentTask && task.parentTaskId ? (
                          <Link
                            href={`/dashboard/${slug}/projects/${task.projectId}/tasks/${task.parentTaskId}/content/${task.taskId}/draft/${task.targetChannels?.[0] || "linkedin"}`}
                            className="text-green-600 hover:text-green-800 no-underline"
                            title={task.deliverableFile}
                          >
                            ✅
                          </Link>
                        ) : (
                          <Link href={`/dashboard/${slug}/brand-brain?doc=${encodeURIComponent(task.deliverableFile)}`}
                            className="text-green-600 hover:text-green-800 no-underline" title={task.deliverableFile}>
                            ✅
                          </Link>
                        )
                      ) : task.deliverableFile.includes("deliverable.md") ? (
                        <span title={task.deliverableFile}>⏳</span>
                      ) : (
                        <span title={task.deliverableFile}>❌</span>
                      )}
                    </td>
                    <td className="text-center px-2 py-2">
                      {task.isContentTask && task.channelSkills && task.channelSkills.length > 0 ? (
                        <div className="flex flex-wrap gap-1 justify-center">
                          {task.channelSkills.map((cs) => (
                            <Link
                              key={cs.channel}
                              href={`/dashboard/${slug}/skills/${cs.skill}`}
                              className="text-[9px] bg-rust/10 text-rust px-1.5 py-0.5 rounded-full hover:bg-rust/20 no-underline transition-colors"
                              title={`${cs.channel} → ${cs.skill}`}
                            >
                              {cs.channel}: {cs.skill}
                            </Link>
                          ))}
                        </div>
                      ) : task.skillOk ? (
                        <Link href={`/dashboard/${slug}/skills/${task.skill}`}
                          className="text-[9px] bg-rust/10 text-rust px-1.5 py-0.5 rounded-full hover:bg-rust/20 no-underline transition-colors">
                          {task.skill}
                        </Link>
                      ) : "❌"}
                    </td>
                    <td className="text-center px-2 py-2">
                      {task.threadFileExists ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (task.isContentTask && task.parentTaskId) {
                              const config = buildContentTaskThread(
                                slug,
                                task.parentTaskId,
                                task.taskId,
                                task.taskName,
                                task.projectId,
                                {
                                  skill: task.skill,
                                  status: task.status,
                                  docPath: task.deliverableFile || undefined,
                                },
                              );
                              openChat(slug, config);
                              return;
                            }
                            const config = buildTaskThread(
                              slug, task.taskId, task.taskName, task.projectId,
                              { taskSkill: task.skill, pillar: task.pillar || undefined, deliverableFile: task.deliverableFile || undefined }
                            );
                            openChat(slug, config);
                          }}
                          className="text-green-600 hover:text-green-800"
                          title={`Abrir chat: ${task.mcChatThreadId}`}
                        >
                          ✅
                        </button>
                      ) : "❌"}
                    </td>
                    <td className="text-center px-2 py-2">
                      <span className={cn("text-[9px] px-1.5 py-0.5 rounded-full font-medium",
                        task.status === "completed" || task.status === "Published" ? "bg-green-50 text-green-700" :
                        task.status === "in-progress" || task.status === "Draft" || task.status === "Approved" ? "bg-blue-50 text-blue-700" :
                        "bg-gray-50 text-gray-500"
                      )}>{task.status}</span>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {filtered.length === 0 && (
        <p className="text-center text-muted-foreground text-sm py-8">
          {search ? `Sin resultados para "${search}"` : "Sin tareas"}
        </p>
      )}
    </div>
  );
}
