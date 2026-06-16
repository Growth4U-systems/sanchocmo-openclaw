/**
 * Outreach > Strategy tab (SAN-195).
 *
 * Setup de la sección Outreach: el primer "Crear proyecto de Outreach" siembra
 * el task-set `outreach-setup` (conectar proveedores → estrategia → provisionar
 * brain de YALC) reutilizando el creador genérico `POST /api/tasks`
 * (type=project + seedFromTaskSet) — sin endpoints nuevos. Una vez sembrado,
 * cada tarea abre su hilo de chat con Rocinante vía buildTaskThread.
 */

import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useOpenChat } from "@/hooks/useChat";
import { buildTaskThread } from "@/lib/chat-openers";
import { statusLabel } from "@/lib/task-status";
import { StatusPill } from "@/components/shared/status-pill";
import type { Project, Task } from "@/types";

interface Props {
  slug: string;
}

interface ProjectWithTasks {
  project: Project;
  tasks: Task[];
}

const SETUP_SECTION = "outreach-setup";

export function OutreachStrategyTab({ slug }: Props) {
  const openChat = useOpenChat();
  const queryClient = useQueryClient();

  const queryKey = useMemo(() => ["tasks", slug, "projects"] as const, [slug]);
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async (): Promise<ProjectWithTasks[]> => {
      const res = await fetch(
        `/api/tasks?slug=${encodeURIComponent(slug)}&type=project&include=children`,
      );
      if (!res.ok) throw new Error("Failed to load projects");
      const json = await res.json();
      return (json.projects ?? []) as ProjectWithTasks[];
    },
    enabled: Boolean(slug),
  });

  const setup = (data ?? []).find((p) => p.project.category === SETUP_SECTION);

  const handleCreate = useCallback(async () => {
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        type: "project",
        name: "Outreach",
        category: SETUP_SECTION,
        status: "in-progress",
        description:
          "Setup de la sección Outreach: conectar proveedores, definir estrategia y provisionar el brain de YALC.",
        seedFromTaskSet: SETUP_SECTION,
      }),
    });
    if (!res.ok && res.status !== 409) {
      console.error("[outreach] create setup project failed:", await res.text());
      return;
    }
    const json = await res.json().catch(() => ({}));
    const projectId: string | undefined = json?.task?.id;
    await queryClient.invalidateQueries({ queryKey });
    openChat(slug, {
      threadId: `${slug}:outreach:setup`,
      threadName: "Outreach — Setup",
      skill: "outreach-playbook",
      skills: ["outreach-playbook", "yalc-operator"],
      agent: "rocinante",
      linkedTo: projectId ? `projects/${projectId}` : "rocinante",
      docPath: null,
      threadState: "create",
      initialMessage:
        `He creado el proyecto de Outreach${projectId ? ` (${projectId})` : ""} con las tareas de setup: ` +
        "conectar proveedores, definir estrategia (outreach-playbook) y provisionar el brain de YALC. " +
        "Empecemos por la estrategia. ¿Arrancamos?",
    });
  }, [slug, openChat, queryClient, queryKey]);

  const openTask = useCallback(
    (task: Task, projectId: string) => {
      openChat(
        slug,
        buildTaskThread(slug, task.id, task.name, projectId, {
          taskSkill: task.skill,
          taskChannel: task.channel,
          taskStatus: task.status,
          taskType: task.type,
          agent: task.agent,
          deliverableFile: Array.isArray(task.deliverable_file)
            ? task.deliverable_file[0]
            : task.deliverable_file,
        }),
      );
    },
    [slug, openChat],
  );

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Cargando…</div>;
  }

  // Empty state — no setup project seeded yet.
  if (!setup) {
    return (
      <div className="rounded-xl border-2 border-dashed border-border p-8 text-center">
        <div className="text-4xl mb-3">🎯</div>
        <h2 className="font-heading text-xl text-navy mb-2">Pon en marcha el Outreach</h2>
        <p className="text-sm text-muted-foreground max-w-xl mx-auto mb-6">
          Crea el proyecto de Outreach para sembrar las tareas de setup: conectar proveedores
          (Instantly/Gmail + Apollo), definir la estrategia con Rocinante (outreach-playbook) y
          provisionar el brain de YALC. Después podrás lanzar búsquedas y campañas.
        </p>
        <button
          type="button"
          onClick={handleCreate}
          className="px-5 py-2.5 rounded-lg text-sm font-semibold bg-rust text-white border-2 border-rust transition-all hover:opacity-90"
        >
          Crear proyecto de Outreach
        </button>
      </div>
    );
  }

  // Seeded — show the setup tasks, each opens its chat with Rocinante.
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-heading text-lg text-navy">{setup.project.name} — Setup</h2>
          <p className="text-xs text-muted-foreground">{setup.project.id}</p>
        </div>
        <StatusPill status={setup.project.status} labelOverride={statusLabel(setup.project.status)} size="md" />
      </div>

      <ul className="space-y-2">
        {setup.tasks.map((task) => (
          <li
            key={task.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-muted-foreground">{task.id}</span>
                <StatusPill status={task.status} labelOverride={statusLabel(task.status)} />
              </div>
              <div className="text-sm font-medium text-foreground truncate">{task.name}</div>
              <div className="text-xs text-muted-foreground truncate">
                {task.skill} · {task.agent}
              </div>
            </div>
            <button
              type="button"
              onClick={() => openTask(task, setup.project.id)}
              className="shrink-0 rounded-md border border-border bg-transparent px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              data-action="open-chat"
            >
              💬 Abrir
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
