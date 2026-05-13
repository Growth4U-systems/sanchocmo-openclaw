"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useOpenChat } from "@/hooks/useChat";
import { buildContentTaskThread, buildTaskThread } from "@/lib/chat-openers";

type DocRef = { path: string; name?: string; title?: string; source?: string };
type InputRef = { id: string; label: string; kind?: string; optional?: boolean; source?: string };

interface TaskIndexEntry {
  projectId: string;
  projectName: string;
  taskId: string;
  taskName: string;
  status: string;
  type: string;
  agent: string;
  skill: string;
  skills: string[];
  inputDocuments: DocRef[];
  requiredInputs: InputRef[];
  outputDocuments: DocRef[];
  dependsOn: string[];
  mcChatThreadId: string;
  threadFileExists: boolean;
  outputDocsExist: number;
  outputDocsMissing: number;
  issues: string[];
  ok: boolean;
  pillar: string | null;
  parentTaskId?: string;
  isContentTask?: boolean;
}

interface Stats {
  total: number;
  ok: number;
  issues: number;
  agentOk: number;
  skillOk: number;
  outputOk: number;
  inputOk: number;
  threadOk: number;
}

interface Props {
  slug: string;
}

const AGENT_LABELS: Record<string, string> = {
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

function agentLabel(agent: string) {
  return AGENT_LABELS[agent] || agent || "Sin agente";
}

function taskHref(slug: string, task: TaskIndexEntry) {
  if (task.isContentTask) return `/dashboard/${slug}/content-creation?tab=ideas&focus=${encodeURIComponent(task.taskId)}`;
  return `/dashboard/${slug}/tasks/${task.taskId}`;
}

function firstDocLabel(docs: DocRef[]) {
  if (docs.length === 0) return "Sin output";
  const first = docs[0];
  const label = first.title || first.name || first.path.split("/").pop() || first.path;
  return docs.length === 1 ? label : `${label} +${docs.length - 1}`;
}

export function TaskIndexPanel({ slug }: Props) {
  const [entries, setEntries] = useState<TaskIndexEntry[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "ok" | "issues">("all");
  const [search, setSearch] = useState("");
  const openChat = useOpenChat();

  useEffect(() => {
    setLoading(true);
    fetch(`/api/system/task-index?slug=${slug}`)
      .then((r) => r.json())
      .then((data) => {
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
    if (filter === "ok") result = result.filter((entry) => entry.ok);
    if (filter === "issues") result = result.filter((entry) => !entry.ok);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((entry) =>
        entry.taskId.toLowerCase().includes(q) ||
        entry.taskName.toLowerCase().includes(q) ||
        entry.projectName.toLowerCase().includes(q) ||
        entry.agent.toLowerCase().includes(q) ||
        entry.skill.toLowerCase().includes(q) ||
        entry.skills.some((skill) => skill.toLowerCase().includes(q)) ||
        entry.outputDocuments.some((doc) => doc.path.toLowerCase().includes(q)),
      );
    }
    return result;
  }, [entries, filter, search]);

  if (loading) return <p className="text-sm text-muted-foreground py-8 text-center">Cargando indice...</p>;

  return (
    <div className="space-y-4">
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat value={stats.total} label="Tareas indexadas" />
          <Stat value={stats.ok} label="OK" tone="ok" />
          <Stat value={stats.issues} label="Con issues" tone="warn" />
          <Stat value={`${stats.agentOk}/${stats.total}`} label="Con agente" />
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por tarea, agente, skill, documento..."
          className="min-w-[260px] flex-1 rounded-sc-md border-2 px-3 py-2 text-sm focus:outline-none"
          style={{ background: "var(--sc-paper-3)", borderColor: "var(--sc-ink)" }}
        />
        {(["all", "ok", "issues"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className="rounded-sc-md border-2 px-3 py-2 text-xs font-heading font-bold"
            style={{
              background: filter === key ? "var(--sc-rust-500)" : "var(--sc-paper-3)",
              borderColor: "var(--sc-ink)",
              color: filter === key ? "var(--sc-paper-3)" : "var(--sc-ink)",
            }}
          >
            {key === "all" ? "Todos" : key === "ok" ? "OK" : "Issues"}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-sc-lg border-2" style={{ borderColor: "var(--sc-ink)", background: "var(--sc-paper-3)" }}>
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr className="border-b-2 text-left text-[11px] uppercase tracking-wider" style={{ borderColor: "var(--sc-ink)", background: "var(--sc-paper-2)" }}>
              <th className="px-3 py-2">Task</th>
              <th className="px-3 py-2">Agente</th>
              <th className="px-3 py-2">Skills</th>
              <th className="px-3 py-2">Inputs</th>
              <th className="px-3 py-2">Output docs</th>
              <th className="px-3 py-2">Thread</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Issues</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((task) => (
              <tr key={task.taskId} className="border-b last:border-0 align-top" style={{ borderColor: "var(--sc-border)" }}>
                <td className="px-3 py-3">
                  <Link href={taskHref(slug, task)} className="font-bold no-underline hover:text-rust" style={{ color: "var(--sc-ink)" }}>
                    {task.taskName}
                  </Link>
                  <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                    <span className="font-mono">{task.taskId}</span>
                    <span>{task.type}</span>
                    {task.projectId !== task.taskId ? <span>{task.projectName}</span> : null}
                  </div>
                </td>
                <td className="px-3 py-3 font-semibold">{agentLabel(task.agent)}</td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    {task.skills.map((skill) => (
                      <Link key={skill} href={`/dashboard/${slug}/skills/${skill}`} className="rounded-full border px-2 py-0.5 text-[11px] no-underline">
                        {skill}
                      </Link>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-3 text-xs">
                  {task.dependsOn.length > 0 ? <div>Depende: {task.dependsOn.join(", ")}</div> : null}
                  {task.requiredInputs.length > 0 ? <div>{task.requiredInputs.map((input) => input.label).join(", ")}</div> : null}
                  {task.dependsOn.length === 0 && task.requiredInputs.length === 0 ? <span className="text-muted-foreground">No declara inputs</span> : null}
                </td>
                <td className="px-3 py-3 text-xs">
                  <div className={cn(task.outputDocuments.length === 0 && "text-red-700")}>{firstDocLabel(task.outputDocuments)}</div>
                  {task.outputDocsMissing > 0 ? <div className="text-amber-700">{task.outputDocsMissing} sin archivo detectado</div> : null}
                </td>
                <td className="px-3 py-3">
                  <button
                    type="button"
                    onClick={() => {
                      const config = task.isContentTask && task.parentTaskId
                        ? buildContentTaskThread(slug, task.parentTaskId, task.taskId, task.taskName, task.projectId, {
                            skill: task.skill,
                            status: task.status,
                            docPath: task.outputDocuments[0]?.path,
                            agent: task.agent,
                            skills: task.skills,
                            outputDocuments: task.outputDocuments,
                            inputDocuments: task.inputDocuments,
                            requiredInputs: task.requiredInputs,
                            dependsOn: task.dependsOn,
                          })
                        : buildTaskThread(slug, task.taskId, task.taskName, task.projectId, {
                            taskSkill: task.skill,
                            taskStatus: task.status,
                            taskType: task.type,
                            pillar: task.pillar || undefined,
                            deliverableFile: task.outputDocuments[0]?.path,
                            agent: task.agent,
                            skills: task.skills,
                            outputDocuments: task.outputDocuments,
                            inputDocuments: task.inputDocuments,
                            requiredInputs: task.requiredInputs,
                            dependsOn: task.dependsOn,
                          });
                      openChat(slug, config);
                    }}
                    className={cn("rounded-full px-2 py-1 text-[11px] font-bold", task.threadFileExists ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700")}
                  >
                    {task.threadFileExists ? "Abrir" : "Crear"}
                  </button>
                </td>
                <td className="px-3 py-3 text-xs">{task.status}</td>
                <td className="px-3 py-3 text-xs">
                  {task.issues.length === 0 ? <span className="text-green-700 font-bold">OK</span> : task.issues.join(", ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <p className="text-center text-muted-foreground text-sm py-8">
          {search ? `Sin resultados para "${search}"` : "Sin tareas"}
        </p>
      )}
    </div>
  );
}

function Stat({ value, label, tone }: { value: string | number; label: string; tone?: "ok" | "warn" }) {
  return (
    <div className="rounded-sc-md border-2 px-3 py-2 text-center" style={{ background: "var(--sc-paper-3)", borderColor: "var(--sc-ink)" }}>
      <div className={cn("font-heading text-xl font-bold", tone === "ok" && "text-green-700", tone === "warn" && "text-amber-700")}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}
