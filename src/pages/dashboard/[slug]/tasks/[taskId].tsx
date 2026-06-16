import React, { useCallback, useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { DocSlideOver } from "@/components/shared/doc-slideover";
import { EmptyState } from "@/components/shared/empty-state";
import { ProgressBar } from "@/components/shared/progress-bar";
import { SkillPicker } from "@/components/shared/skill-picker";
import { StatusPill } from "@/components/shared/status-pill";
import { TaskTypeBadge } from "@/components/shared/task-type-badge";
import { useOpenChat } from "@/hooks/useChat";
import { useSlugSync } from "@/hooks/useSlugSync";
import { type TaskRow, useTask, useTaskRows, useUpdateTask, useUpdateTaskStatus } from "@/hooks/useTasks";
import { buildContentTaskThread, buildProjectThread, buildTaskThread } from "@/lib/chat-openers";
import { taskBriefText, taskCompletionText, taskExecutionNotesText } from "@/lib/data/task-brief";
import { VALID_TASK_STATUSES, statusLabel, normalizeTaskStatusQuiet } from "@/lib/task-status";

// SAN-192: vocabulario único de task (6 valores, incl. pending-review). Fuente
// en src/lib/task-status.ts — no declarar listas/labels/normalizadores locales.
const TASK_STATUS_OPTIONS = VALID_TASK_STATUSES;
const CONTENT_TASK_STATUS_OPTIONS = ["New", "Approved", "Draft", "Pending Media", "Ready", "Published", "Discarded", "Deferred"];
const PROJECT_KANBAN_STATUSES = ["todo", "in-progress", "blocked", "completed"];
const TASK_TYPE_OPTIONS = ["project", "content", "foundation", "research", "analysis", "execution", "outreach", "tool", "media"];
const AGENT_OPTIONS = [
  { value: "sancho", label: "Sancho" },
  { value: "hamete", label: "Hamete" },
  { value: "dulcinea", label: "Dulcinea" },
  { value: "rocinante", label: "Rocinante" },
  { value: "maese-pedro", label: "Maese Pedro" },
  { value: "mambrino", label: "Mambrino" },
  { value: "merlin", label: "Merlin" },
  { value: "sanson", label: "Sanson" },
  { value: "cervantes", label: "Cervantes" },
] as const;

function isContentTask(row?: Partial<TaskRow> | null): boolean {
  return row?.type === "content_task" || row?.type === "content_subtask";
}

function rowTypeLabel(type?: string): string {
  return type === "content_subtask" ? "content_task" : type || "task";
}

function skillList(skill?: string | null, skills?: unknown): string[] {
  const fromArray = Array.isArray(skills) ? skills.map((item) => String(item).trim()).filter(Boolean) : [];
  const fromPrimary = (skill || "").split(",").map((item) => item.trim()).filter(Boolean);
  return Array.from(new Set([...fromPrimary, ...fromArray]));
}

function dependencyIds(value: unknown): string[] {
  const raw = Array.isArray(value) ? value.join(",") : String(value || "");
  return raw.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean);
}

function dependencyInputValue(value: unknown): string {
  return dependencyIds(value).join(", ");
}

function resolveDependency(id: string, rows: TaskRow[] | undefined, currentTask: TaskRow | null): TaskRow | null {
  if (!rows?.length) return null;
  const direct = rows.find((row) => row.id === id);
  if (direct) return direct;
  if (currentTask?.project_id && !id.startsWith(currentTask.project_id)) {
    return rows.find((row) => row.id === `${currentTask.project_id}-${id}`) || null;
  }
  return null;
}

function normalizeAgent(agent?: string | null, owner?: string | null): string {
  if (agent) return agent;
  const raw = (owner || "").toLowerCase().trim();
  if (!raw || raw === "escudero content") return "dulcinea";
  if (raw === "maese pedro") return "maese-pedro";
  if (raw === "merlín") return "merlin";
  if (raw === "sansón") return "sanson";
  return raw.replace(/\s+/g, "-");
}

function agentLabel(agent?: string | null): string {
  return AGENT_OPTIONS.find((option) => option.value === agent)?.label || agent || "Sin agente";
}

function formatTaskDate(value?: string | Date | null): string {
  if (!value) return "Sin fecha";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  return new Intl.DateTimeFormat("es", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function missingBriefText(field: string): React.ReactNode {
  return (
    <span className="italic" style={{ color: "var(--sc-fg-muted)" }}>
      Pendiente de definir. Completa este campo para que humanos y agentes entiendan {field}.
    </span>
  );
}

function channelsForTask(task: Partial<TaskRow> | null | undefined): string[] {
  if (Array.isArray(task?.target_channels)) return task.target_channels.filter(Boolean);
  if (typeof task?.channel === "string" && task.channel.trim()) {
    return task.channel.split(",").map((channel) => channel.trim()).filter(Boolean);
  }
  return [];
}

function contentTaskEditorHref(slug: string, task: TaskRow): string {
  if (task.project_id && task.parent_id) {
    const channel = channelsForTask(task)[0] || "linkedin";
    return `/dashboard/${slug}/tasks/${task.project_id}/sub/${task.parent_id}/content/${task.id}/draft/${channel}`;
  }
  return `/dashboard/${slug}/content-creation?tab=ideas&focus=${encodeURIComponent(task.id)}`;
}

function taskDetailHref(slug: string, task: TaskRow): string {
  return isContentTask(task) ? contentTaskEditorHref(slug, task) : `/dashboard/${slug}/tasks/${task.id}`;
}

type DetailDoc = {
  path: string;
  name?: string;
  title?: string;
  status?: string;
  created_at?: string;
  source?: string;
  kind?: string;
};

function docName(pathValue: string): string {
  return pathValue.split("/").filter(Boolean).pop() || pathValue;
}

function addDocFromPath(list: DetailDoc[], pathValue: unknown, title?: string) {
  if (typeof pathValue !== "string") return;
  const cleanPath = pathValue.trim().replace(/[),.;:]+$/g, "");
  if (!cleanPath || cleanPath.includes("{") || cleanPath.endsWith("/")) return;
  list.push({
    path: cleanPath,
    name: title || docName(cleanPath),
    title: title || docName(cleanPath),
    status: "draft",
  });
}

function extractDocPaths(text: unknown): string[] {
  if (typeof text !== "string") return [];
  const matches = text.match(/(?:brand\/[A-Za-z0-9_-]+\/)?[A-Za-z0-9_./-]+\.(?:md|markdown|json|html|pdf|docx|txt)/g);
  return matches || [];
}

function asDocs(task: Partial<TaskRow> | null | undefined): DetailDoc[] {
  const docs = Array.isArray(task?.documents) ? task.documents as DetailDoc[] : [];
  const attachments = Array.isArray(task?.attachments)
    ? task.attachments.map((attachment) => ({
        path: attachment.path,
        name: attachment.label || attachment.path.split("/").pop(),
        title: attachment.label,
        status: "draft",
        created_at: attachment.added_at,
      }))
    : [];
  const generated: DetailDoc[] = [];
  if (Array.isArray(task?.output_documents)) {
    for (const doc of task.output_documents as DetailDoc[]) {
      if (doc?.path) generated.push({ ...doc, status: doc.status || "draft" });
    }
  }
  const deliverableFiles = Array.isArray(task?.deliverable_file) ? task.deliverable_file : [task?.deliverable_file];
  for (const file of deliverableFiles) addDocFromPath(generated, file, "Documento principal");

  if (Array.isArray(task?.output_files)) {
    for (const file of task.output_files) addDocFromPath(generated, file);
  }

  if (generated.length === 0 && docs.length === 0 && attachments.length === 0) {
    for (const pathValue of extractDocPaths(task?.deliverable)) addDocFromPath(generated, pathValue);
  }

  const seen = new Set<string>();
  return [...docs, ...attachments, ...generated].filter((doc) => {
    if (!doc?.path || seen.has(doc.path)) return false;
    seen.add(doc.path);
    return true;
  });
}

export default function UnifiedTaskDetailPage() {
  const slug = useSlugSync() || "";
  const router = useRouter();
  const taskId = (router.query.taskId as string) || "";
  const { data: fetchedTask, isLoading: taskLoading } = useTask(slug || null, taskId || null);
  const { data: rows, isLoading: rowsLoading } = useTaskRows(slug || null);
  const updateStatus = useUpdateTaskStatus();
  const updateTask = useUpdateTask();
  const openChat = useOpenChat();
  const [openDocPath, setOpenDocPath] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftBrief, setDraftBrief] = useState("");
  const [draftOwner, setDraftOwner] = useState("Sancho");
  const [draftType, setDraftType] = useState("execution");
  const [draftStatus, setDraftStatus] = useState("todo");
  const [draftCompletion, setDraftCompletion] = useState("");
  const [draftExecutionNotes, setDraftExecutionNotes] = useState("");
  const [draftDependsOn, setDraftDependsOn] = useState("");
  const [draftSkill, setDraftSkill] = useState<string[]>([]);

  const row = useMemo(() => rows?.find((item) => item.id === taskId), [rows, taskId]);
  const task = useMemo(() => ({ ...(fetchedTask || {}), ...(row || {}) }) as TaskRow | null, [fetchedTask, row]);
  const children = useMemo(() => rows?.filter((item) => item.parent_id === taskId) || [], [rows, taskId]);
  const docs = useMemo(() => asDocs(task), [task]);
  const isCt = isContentTask(task);
  const editorHref = task && isCt ? contentTaskEditorHref(slug, task) : null;
  const statusOptions = isCt ? CONTENT_TASK_STATUS_OPTIONS : TASK_STATUS_OPTIONS;
  const selectedStatus = isCt ? task?.status || "" : normalizeTaskStatusQuiet(task?.status);
  const brief = task ? taskBriefText(task) : "";
  const completion = task ? taskCompletionText(task) : "";
  const executionNotes = task ? taskExecutionNotesText(task) : "";
  const dependsOnIds = useMemo(() => dependencyIds(task?.depends_on), [task?.depends_on]);
  const dependencies = useMemo(
    () => dependsOnIds.map((id) => ({ id, task: resolveDependency(id, rows, task) })),
    [dependsOnIds, rows, task],
  );
  const completedChildren = children.filter((child) => ["completed", "done", "Published"].includes(child.status)).length;
  const progress = children.length > 0 ? Math.round((completedChildren / children.length) * 100) : 0;
  const requiredMissing = editorOpen
    ? [
        ["nombre", draftName],
        ["brief", draftBrief],
        ["completion", draftCompletion],
      ].filter(([, value]) => !String(value || "").trim())
    : [];

  const handleChat = useCallback(() => {
    if (!slug || !task) return;
    if (isContentTask(task)) {
      if (!task.parent_id || !task.project_id) return;
      openChat(slug, buildContentTaskThread(slug, task.parent_id, task.id, task.name, task.project_id, {
        skill: task.skill,
        status: task.status,
        docPath: docs[0]?.path,
        agent: task.agent,
        skills: skillList(task.skill, task.skills),
        inputDocuments: task.input_documents,
        requiredInputs: task.required_inputs,
        outputDocuments: task.output_documents,
        dependsOn: dependsOnIds,
      }));
      return;
    }
    if (task.type === "project") {
      openChat(slug, buildProjectThread(slug, task.id, task.name, {
        strategy: task.strategy,
        status: task.status,
        agent: task.agent,
        skills: skillList(task.skill, task.skills),
        inputDocuments: task.input_documents,
        requiredInputs: task.required_inputs,
        outputDocuments: task.output_documents,
        dependsOn: dependsOnIds,
      }));
      return;
    }
    if (task.project_id) {
      openChat(slug, buildTaskThread(slug, task.id, task.name, task.project_id, {
        taskSkill: task.skill,
        taskChannel: task.channel,
        taskStatus: task.status,
        taskType: task.type,
        pillar: task.pillar,
        deliverableFile: typeof task.deliverable_file === "string" ? task.deliverable_file : undefined,
        agent: task.agent,
        skills: skillList(task.skill, task.skills),
        inputDocuments: task.input_documents,
        requiredInputs: task.required_inputs,
        outputDocuments: task.output_documents,
        dependsOn: dependsOnIds,
      }));
    }
  }, [dependsOnIds, docs, openChat, slug, task]);

  const beginEdit = useCallback(() => {
    if (!task) return;
    setDraftName(task.name || "");
    setDraftBrief(taskBriefText(task));
    setDraftOwner(normalizeAgent(task.agent, task.owner));
    setDraftType(rowTypeLabel(task.type));
    setDraftStatus(selectedStatus || "todo");
    setDraftCompletion(taskCompletionText(task));
    setDraftExecutionNotes(taskExecutionNotesText(task));
    setDraftDependsOn(dependencyInputValue(task.depends_on));
    setDraftSkill(skillList(task.skill, task.skills));
    setEditorOpen(true);
  }, [selectedStatus, task]);

  const cancelEdit = useCallback(() => {
    setEditorOpen(false);
  }, []);

  const saveInlineEdit = useCallback(() => {
    if (!slug || !task) return;
    updateTask.mutate(
      {
        slug,
        taskId: task.id,
        fields: {
          name: draftName,
          brief: draftBrief,
          agent: draftOwner,
          type: draftType,
          status: draftStatus,
          completion: draftCompletion,
          execution_notes: draftExecutionNotes,
          depends_on: draftDependsOn,
          skill: draftSkill[0] || "",
          skills: draftSkill,
        } as never,
      },
      { onSuccess: () => setEditorOpen(false) },
    );
  }, [draftBrief, draftCompletion, draftDependsOn, draftExecutionNotes, draftName, draftOwner, draftSkill, draftStatus, draftType, slug, task, updateTask]);

  useEffect(() => {
    if (!editorHref) return;
    router.replace(editorHref);
  }, [editorHref, router]);

  if (taskLoading || rowsLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground">Cargando tarea...</p>
        </div>
      </DashboardLayout>
    );
  }

  if (!task?.id) {
    return (
      <DashboardLayout>
        <Head><title>Tarea no encontrada — Mission Control</title></Head>
        <EmptyState icon="🔍" message="Tarea no encontrada." />
      </DashboardLayout>
    );
  }

  if (isCt) {
    return (
      <DashboardLayout>
        <Head><title>{`${task.id} — ContentTask — Mission Control`}</title></Head>
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground">Abriendo editor de ContentTask...</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <Head><title>{`${task.id} — ${task.name} — Mission Control`}</title></Head>

      <div className="mb-3">
        <Link
          href={`/dashboard/${slug}/tasks`}
          className="inline-flex items-center gap-1.5 rounded-sc-md border-2 px-3 py-1 text-[12px] font-semibold no-underline transition-colors hover:bg-[var(--sc-paper-2)]"
          style={{ borderColor: "var(--sc-ink)", background: "var(--sc-paper-3)", color: "var(--sc-ink)", boxShadow: "var(--pop-xs)" }}
        >
          ← Tareas
        </Link>
      </div>

      <div
        className="rounded-sc-lg border-[3px] p-4 mb-3"
        style={{ background: "var(--sc-paper-3)", borderColor: "var(--sc-ink)", boxShadow: "var(--pop-md)" }}
      >
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span
                className="rounded-sc-pill border-2 px-2.5 py-1 font-mono text-[11px] font-bold shrink-0"
                style={{ background: "var(--sc-paper-2)", borderColor: "var(--sc-ink)", color: "var(--sc-rust-600)" }}
              >
                {task.id}
              </span>
              {editorOpen ? (
                <input
                  value={draftName}
                  onChange={(event) => setDraftName(event.target.value)}
                  className="flex-1 min-w-[12rem] rounded-sc-md border-2 bg-white px-3 py-1.5 font-heading text-2xl font-bold leading-tight focus:outline-none"
                  style={{ borderColor: "var(--sc-ink)", color: "var(--sc-ink)" }}
                  aria-label="Nombre"
                />
              ) : (
                <h1 className="font-heading text-2xl font-bold leading-tight m-0" style={{ color: "var(--sc-ink)" }}>{task.name}</h1>
              )}
            </div>
            {task.parent_name && <span className="text-xs text-muted-foreground mt-1 block">Bajo {task.parent_name}</span>}
          </div>
          <div className="flex gap-2 shrink-0 items-center flex-wrap">
            <select
              value={editorOpen ? draftStatus : selectedStatus}
              onChange={(event) => {
                if (editorOpen) setDraftStatus(event.target.value);
                else updateStatus.mutate({ slug, taskId: task.id, status: event.target.value });
              }}
              className="h-9 rounded-sc-md border-2 bg-white px-3 text-sm font-semibold"
              style={{ borderColor: "var(--sc-ink)", color: "var(--sc-ink)", boxShadow: "var(--pop-xs)" }}
            >
              {statusOptions.map((status) => <option key={status} value={status}>{isCt ? status : statusLabel(status)}</option>)}
            </select>
            {editorOpen && (
              <button
                onClick={cancelEdit}
                className="h-9 rounded-sc-md border-2 px-3.5 text-[13px] font-heading font-bold transition-all sc-pop-hover"
                style={{ background: "var(--sc-paper-3)", borderColor: "var(--sc-ink)", color: "var(--sc-ink)", boxShadow: "var(--pop-xs)" }}
              >
                Cancelar
              </button>
            )}
            <button
              onClick={editorOpen ? saveInlineEdit : beginEdit}
              disabled={editorOpen && updateTask.isPending}
              className="h-9 rounded-sc-md border-2 px-3.5 text-[13px] font-heading font-bold transition-all sc-pop-hover"
              style={{ background: editorOpen ? "var(--sc-navy-500)" : "var(--sc-sun-300)", borderColor: "var(--sc-ink)", color: editorOpen ? "var(--sc-paper-3)" : "var(--sc-ink)", boxShadow: "var(--pop-xs)" }}
              title={editorOpen && requiredMissing.length > 0 ? `Falta: ${requiredMissing.map(([label]) => label).join(", ")}` : undefined}
            >
              {editorOpen ? "Guardar" : "Editar"}
            </button>
            <button
              onClick={handleChat}
              disabled={isCt && (!task.parent_id || !task.project_id)}
              className="h-9 rounded-sc-md border-2 px-3.5 text-[13px] font-heading font-bold transition-all sc-pop-hover disabled:opacity-50"
              style={{ background: "var(--sc-navy-500)", borderColor: "var(--sc-ink)", color: "var(--sc-paper-3)", boxShadow: "var(--pop-xs)" }}
            >
              Chat
            </button>
          </div>
        </div>
      </div>

      <div
        className="rounded-sc-md border-2 px-3 py-2 mb-3"
        style={{ background: "var(--sc-paper-2)", borderColor: "var(--sc-ink)", boxShadow: "var(--pop-xs)" }}
      >
        <div className="task-detail-meta-grid">
          <MetaItem label="Tipo">
            {editorOpen ? (
              <select
                value={draftType}
                onChange={(event) => setDraftType(event.target.value)}
                className="w-full rounded-sc-md border-2 bg-white px-2 py-1 text-[13px] font-bold focus:outline-none"
                style={{ borderColor: "var(--sc-ink)", color: "var(--sc-ink)" }}
                aria-label="Tipo"
              >
                {TASK_TYPE_OPTIONS.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            ) : (
              <TaskTypeBadge type={rowTypeLabel(task.type)} />
            )}
          </MetaItem>
          <MetaItem label="Agente">
            {editorOpen ? (
              <select
                value={draftOwner}
                onChange={(event) => setDraftOwner(event.target.value)}
                className="w-full rounded-sc-md border-2 bg-white px-2 py-1 text-[13px] font-bold focus:outline-none"
                style={{ borderColor: "var(--sc-ink)", color: "var(--sc-ink)" }}
                aria-label="Agente"
              >
                {AGENT_OPTIONS.map((agent) => (
                  <option key={agent.value} value={agent.value}>{agent.label}</option>
                ))}
              </select>
            ) : agentLabel(normalizeAgent(task.agent, task.owner))}
          </MetaItem>
          <MetaItem label="Skills">
            {editorOpen ? (
              <SkillPicker value={draftSkill} onChange={setDraftSkill} />
            ) : (
              <SkillChips skills={skillList(task.skill, task.skills)} />
            )}
          </MetaItem>
          <MetaItem label="Creada">{formatTaskDate(task.created_at)}</MetaItem>
          <MetaItem label="Actualizada">{formatTaskDate(task.updated_at)}</MetaItem>
        </div>
      </div>

      <style jsx global>{`
        .task-detail-meta-grid {
          display: grid;
          grid-template-columns: minmax(8rem, 0.75fr) minmax(8rem, 0.75fr) minmax(12rem, 1.4fr) minmax(9rem, 0.85fr) minmax(9rem, 0.85fr);
          gap: 0.5rem 0.75rem;
          align-items: start;
        }

        @media (max-width: 980px) {
          .task-detail-meta-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }

        @media (max-width: 640px) {
          .task-detail-meta-grid {
            grid-template-columns: minmax(0, 1fr);
          }
        }
      `}</style>

      <div
        className="rounded-sc-lg border-[3px] overflow-hidden mb-3"
        style={{ background: "var(--sc-paper-3)", borderColor: "var(--sc-ink)", boxShadow: "var(--pop-md)" }}
      >
        <div className="px-4 py-2 border-b-2 flex items-center justify-between gap-3 flex-wrap" style={{ background: "var(--sc-paper-2)", borderColor: "var(--sc-ink)" }}>
          <div>
            <h2 className="font-heading font-bold text-sm m-0" style={{ color: "var(--sc-ink)" }}>Brief operativo</h2>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--sc-fg-muted)" }}>
              La parte que leen humanos y agentes para saber exactamente qué hacer.
            </p>
          </div>
          {editorOpen && requiredMissing.length > 0 && (
            <span
              className="rounded-sc-pill border-2 px-2.5 py-1 text-[11px] font-semibold"
              style={{ background: "var(--sc-sun-100)", borderColor: "var(--sc-ink)", color: "var(--sc-ink)" }}
            >
              Faltan {requiredMissing.length} campos
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 p-3">
          <InfoCard accent="var(--sc-rust-500)" title="Brief">
            {editorOpen ? (
              <InlineTextarea
                value={draftBrief}
                onChange={setDraftBrief}
                label="Brief"
                helper="Qué significa la tarea, por qué existe y qué resultado busca."
                rows={4}
              />
            ) : brief || missingBriefText("qué es esta tarea, por qué existe y qué resultado busca")}
          </InfoCard>
          <InfoCard accent="var(--sc-sage-500)" title="Completion">
            {editorOpen ? (
              <InlineTextarea
                value={draftCompletion}
                onChange={setDraftCompletion}
                label="Completion"
                helper="Evidencia observable de que la tarea está terminada, incluyendo el entregable si aplica."
                rows={4}
              />
            ) : completion || missingBriefText("qué evidencia demuestra que está terminada")}
          </InfoCard>
          {(editorOpen || executionNotes) && (
            <InfoCard accent="var(--sc-navy-500)" title="Notas de ejecución">
              {editorOpen ? (
                <InlineTextarea
                  value={draftExecutionNotes}
                  onChange={setDraftExecutionNotes}
                  label="Notas de ejecución"
                  helper="Opcional. Solo restricciones, pasos o decisiones que la skill no cubra por defecto."
                  rows={4}
                />
              ) : executionNotes}
            </InfoCard>
          )}
          {(editorOpen || dependencies.length > 0) && (
            <InfoCard accent="var(--sc-sun-500)" title="Depende de">
              {editorOpen ? (
                <InlineTextarea
                  value={draftDependsOn}
                  onChange={setDraftDependsOn}
                  label="Depende de"
                  helper="Opcional. IDs de tareas previas, separados por coma. Se usa para saber si esta tarea puede empezar."
                  rows={2}
                />
              ) : (
                <DependencyList dependencies={dependencies} slug={slug} />
              )}
            </InfoCard>
          )}
        </div>
      </div>

      {task.type === "project" && (
        <div
          className="flex items-center gap-3 rounded-sc-md border-2 px-3 py-1.5 mb-3"
          style={{ background: "var(--sc-paper-2)", borderColor: "var(--sc-ink)", boxShadow: "var(--pop-xs)" }}
        >
          <span className="font-heading text-[10px] uppercase tracking-wider shrink-0" style={{ color: "var(--sc-fg-muted)" }}>Progreso</span>
          <div className="flex-1 min-w-0">
            <ProgressBar value={progress} />
          </div>
          <span className="text-[11px] font-bold shrink-0 tabular-nums" style={{ color: "var(--sc-ink)" }}>
            {completedChildren}/{children.length} · {progress}%
          </span>
        </div>
      )}

      {task.type === "project" && children.length > 0 && (
        <ProjectChildrenKanban slug={slug} childrenRows={children} />
      )}

      {task.type !== "project" && children.length > 0 && (
        <div
          className="rounded-sc-lg border-[3px] overflow-hidden mb-3"
          style={{ background: "var(--sc-paper-3)", borderColor: "var(--sc-ink)", boxShadow: "var(--pop-md)" }}
        >
          <SectionHeader
            icon="↳"
            title="Tareas relacionadas"
            subtitle="Hijas directas de esta tarea"
            count={children.length}
            accent="var(--sc-navy-500)"
          />
          <div className="p-3 space-y-2">
            {children.map((child) => (
              <Link
                key={child.id}
                href={taskDetailHref(slug, child)}
                className="flex items-center gap-3 rounded-sc-md border-2 p-3 no-underline sc-pop-hover"
                style={{ background: "var(--sc-paper-3)", borderColor: "var(--sc-ink)", boxShadow: "var(--pop-xs)" }}
              >
                <TaskTypeBadge type={rowTypeLabel(child.type)} />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm truncate" style={{ color: "var(--sc-ink)" }}>{child.name}</div>
                  <div className="text-[11px]" style={{ color: "var(--sc-fg-muted)" }}>{child.id}</div>
                </div>
                <StatusPill status={child.status} />
              </Link>
            ))}
          </div>
        </div>
      )}

      <div
        className="rounded-sc-lg border-[3px] overflow-hidden mb-3"
        style={{ background: "var(--sc-paper-3)", borderColor: "var(--sc-ink)", boxShadow: "var(--pop-md)" }}
      >
        <SectionHeader
          icon="▣"
          title="Documentos"
          subtitle="Archivos, entregables y adjuntos detectados"
          count={docs.length}
          accent="var(--sc-rust-500)"
        />
        <div className="p-4">
          {docs.length === 0 ? (
            <div className="text-center py-6 text-sm italic" style={{ color: "var(--sc-fg-subtle)" }}>Sin documentos.</div>
          ) : (
            <div className="space-y-2">
              {docs.map((doc) => {
                const name = doc.title || doc.name || doc.path.split("/").pop() || doc.path;
                const isExpected = doc.kind === "output" || [
                  "default-output",
                  "project-index",
                  "deliverable_file",
                  "output_files",
                  "output_documents",
                ].includes(doc.source || "");
                return (
                  <button
                    key={doc.path}
                    onClick={() => setOpenDocPath(doc.path)}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 border-2 rounded-sc-md transition-all cursor-pointer text-left sc-pop-hover"
                    style={{ background: "var(--sc-paper-3)", borderColor: "var(--sc-ink)", color: "var(--sc-ink)", boxShadow: "var(--pop-xs)" }}
                  >
                    <span>📄</span>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-[13px]">{name}</div>
                      <div className="flex flex-wrap items-center gap-2 text-[10px]" style={{ color: "var(--sc-fg-muted)" }}>
                        {isExpected && (
                          <span className="rounded-full border px-1.5 py-0.5 font-semibold" style={{ borderColor: "var(--sc-border)", color: "var(--sc-rust-600)" }}>
                            Output esperado
                          </span>
                        )}
                        <span className="truncate">{doc.path}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <DocSlideOver
        slug={slug}
        docPath={openDocPath ? openDocPath.startsWith("brand/") ? openDocPath : `brand/${slug}/${openDocPath}` : null}
        onClose={() => setOpenDocPath(null)}
      />
    </DashboardLayout>
  );
}

function MetaItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="font-heading text-[10px] uppercase tracking-wider mb-0.5" style={{ color: "var(--sc-fg-muted)" }}>{label}</div>
      <div className="text-[13px] font-bold min-w-0" style={{ color: "var(--sc-ink)" }}>{children}</div>
    </div>
  );
}

function SkillChips({ skills }: { skills: string[] }) {
  if (skills.length === 0) {
    return <span className="text-[13px]" style={{ color: "var(--sc-fg-muted)" }}>Sin skills</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {skills.map((skill) => (
        <span
          key={skill}
          className="inline-flex max-w-full items-center rounded-sc-pill border-2 px-2 py-0.5 text-[11px] font-semibold"
          style={{ background: "var(--sc-paper-3)", borderColor: "var(--sc-ink)", color: "var(--sc-ink)" }}
        >
          <span className="truncate">{skill}</span>
        </span>
      ))}
    </div>
  );
}

function DependencyList({ dependencies, slug }: { dependencies: Array<{ id: string; task: TaskRow | null }>; slug: string }) {
  if (dependencies.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {dependencies.map(({ id, task }) => {
        if (!task) {
          return (
            <div
              key={id}
              className="rounded-sc-md border-2 px-3 py-2"
              style={{ background: "var(--sc-paper-2)", borderColor: "var(--sc-ink)" }}
            >
              <div className="font-mono text-[12px] font-bold" style={{ color: "var(--sc-rust-600)" }}>{id}</div>
              <div className="text-[11px]" style={{ color: "var(--sc-fg-muted)" }}>Referencia legacy o externa no resuelta</div>
            </div>
          );
        }

        return (
          <Link
            key={id}
            href={taskDetailHref(slug, task)}
            className="flex items-center gap-3 rounded-sc-md border-2 px-3 py-2 no-underline sc-pop-hover"
            style={{ background: "var(--sc-paper-2)", borderColor: "var(--sc-ink)", color: "var(--sc-ink)" }}
          >
            <TaskTypeBadge type={rowTypeLabel(task.type)} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-bold">{task.name}</div>
              <div className="font-mono text-[11px]" style={{ color: "var(--sc-fg-muted)" }}>{task.id}</div>
            </div>
            <StatusPill status={task.status} />
          </Link>
        );
      })}
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  subtitle,
  count,
  accent,
}: {
  icon: string;
  title: string;
  subtitle: string;
  count: number;
  accent: string;
}) {
  return (
    <div
      className="border-b-2 px-4 py-2"
      style={{ background: "var(--sc-paper-2)", borderColor: "var(--sc-ink)" }}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="grid h-7 w-7 shrink-0 place-items-center rounded-sc-md border-2 font-heading text-sm font-bold"
            style={{ background: accent, borderColor: "var(--sc-ink)", color: "var(--sc-paper-3)", boxShadow: "var(--pop-xs)" }}
          >
            {icon}
          </span>
          <div className="min-w-0">
            <h2 className="font-heading font-bold text-sm m-0 truncate" style={{ color: "var(--sc-ink)" }}>{title}</h2>
            <p className="text-[11px] mt-0.5 truncate" style={{ color: "var(--sc-fg-muted)" }}>{subtitle}</p>
          </div>
        </div>
        <span
          className="rounded-sc-pill border-2 px-2.5 py-1 font-mono text-[11px] font-bold"
          style={{ background: "var(--sc-paper-3)", borderColor: "var(--sc-ink)", color: "var(--sc-ink)" }}
        >
          {count}
        </span>
      </div>
    </div>
  );
}

function ProjectChildrenKanban({ slug, childrenRows }: { slug: string; childrenRows: TaskRow[] }) {
  const updateStatus = useUpdateTaskStatus();

  return (
    <div
      className="rounded-sc-lg border-[3px] overflow-hidden mb-3"
      style={{ background: "var(--sc-paper-3)", borderColor: "var(--sc-ink)", boxShadow: "var(--pop-md)" }}
    >
      <SectionHeader
        icon="▦"
        title="Tareas del proyecto"
        subtitle="Kanban de las tareas hijas"
        count={childrenRows.length}
        accent="var(--sc-sage-500)"
      />
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5 p-2.5">
        {PROJECT_KANBAN_STATUSES.map((status) => {
          const tasks = childrenRows.filter((child) => normalizeTaskStatusQuiet(child.status) === status);
          return (
            <div
              key={status}
              className="rounded-sc-md border-2 min-h-[88px] overflow-hidden"
              style={{ background: "var(--sc-paper-2)", borderColor: "var(--sc-ink)" }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const childId = event.dataTransfer.getData("application/x-mc-task-id") || event.dataTransfer.getData("text/plain");
                if (!childId) return;
                const child = childrenRows.find((item) => item.id === childId);
                if (!child || normalizeTaskStatusQuiet(child.status) === status) return;
                updateStatus.mutate({ slug, taskId: childId, status });
              }}
            >
              <div className="flex items-center justify-between gap-2 px-3 py-2 border-b-2" style={{ borderColor: "var(--sc-ink)", background: "var(--sc-paper-3)" }}>
                <span className="font-heading text-[11px] font-bold uppercase" style={{ color: "var(--sc-ink)" }}>{statusLabel(status)}</span>
                <span className="text-[11px]" style={{ color: "var(--sc-fg-muted)" }}>{tasks.length}</span>
              </div>
              <div className="p-2 space-y-2">
                {tasks.length === 0 ? (
                  <div className="py-5 text-center text-xs italic" style={{ color: "var(--sc-fg-subtle)" }}>Sin tareas</div>
                ) : (
                  tasks.map((child) => (
                    <Link
                      key={child.id}
                      href={taskDetailHref(slug, child)}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("application/x-mc-task-id", child.id);
                        event.dataTransfer.setData("text/plain", child.id);
                      }}
                      className="block cursor-grab rounded-sc-md border-2 p-2.5 no-underline sc-pop-hover active:cursor-grabbing"
                      style={{ background: "var(--sc-paper-3)", borderColor: "var(--sc-ink)", boxShadow: "var(--pop-xs)" }}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <TaskTypeBadge type={rowTypeLabel(child.type)} />
                      </div>
                      <div className="font-semibold text-sm leading-tight" style={{ color: "var(--sc-ink)" }}>{child.name}</div>
                      <div className="text-[11px] mt-1" style={{ color: "var(--sc-fg-muted)" }}>{child.id}</div>
                    </Link>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InlineTextarea({
  value,
  onChange,
  label,
  helper,
  rows = 4,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  helper: string;
  rows?: number;
}) {
  return (
    <label className="block">
      <span className="sr-only">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        className="w-full rounded-sc-md border-2 bg-white px-3 py-2 text-sm leading-relaxed resize-y focus:outline-none"
        style={{ borderColor: "var(--sc-ink)", color: "var(--sc-ink)" }}
      />
      <span className="mt-1 block text-[11px] leading-relaxed" style={{ color: "var(--sc-fg-muted)" }}>{helper}</span>
    </label>
  );
}

function InfoCard({ title, accent, children }: { title: string; accent: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-sc-md border-2 p-3 border-l-[10px]"
      style={{ background: "var(--sc-paper-3)", borderColor: "var(--sc-ink)", borderLeftColor: accent, boxShadow: "var(--pop-xs)" }}
    >
      <div className="font-heading font-bold text-sm mb-1.5" style={{ color: "var(--sc-ink)" }}>{title}</div>
      <div className="whitespace-pre-wrap text-sm leading-relaxed" style={{ color: "var(--sc-fg-soft)" }}>{children}</div>
    </div>
  );
}
