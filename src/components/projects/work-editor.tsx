/**
 * Work Editor — SlideOver form for editing tasks and projects.
 * Faithful port of openWorkEditor / saveWorkEditor from mc-work.js.
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { SlideOver } from "@/components/shared/slide-over";
import {
  useUpdateTaskStatus,
  useUpdateProject,
} from "@/hooks/useProjects";
import { useOpenChat } from "@/hooks/useChat";
import { buildTaskThread, buildProjectThread } from "@/lib/chat-openers";
import { PRJ_CHANNELS } from "@/lib/constants";
import type { Project, Task } from "@/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProjectWithTasks {
  project: Project;
  tasks: Task[];
}

interface WorkEditorProps {
  open: boolean;
  onClose: () => void;
  mode: "task" | "project";
  editId: string | null;
  slug: string;
  projects: ProjectWithTasks[];
}

// ---------------------------------------------------------------------------
// Status options
// ---------------------------------------------------------------------------

const TASK_STATUS_OPTIONS = [
  { value: "todo", label: "Por hacer" },
  { value: "in-progress", label: "En progreso" },
  { value: "blocked", label: "Bloqueado" },
  { value: "completed", label: "Completado" },
  { value: "discarded", label: "Descartado" },
];

const PROJECT_STATUS_OPTIONS = [
  { value: "todo", label: "Por hacer" },
  { value: "in-progress", label: "En progreso" },
  { value: "blocked", label: "Bloqueado" },
  { value: "completed", label: "Completado" },
  { value: "discarded", label: "Descartado" },
  { value: "archived", label: "Archivado" },
];

const TASK_TYPE_OPTIONS = [
  { value: "execution", label: "⚙️ Execution" },
  { value: "content", label: "📝 Content" },
  { value: "outreach", label: "📤 Outreach" },
  { value: "foundation", label: "🏗️ Foundation" },
  { value: "research", label: "🔬 Research" },
  { value: "analysis", label: "📊 Analysis" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WorkEditor({
  open,
  onClose,
  mode,
  editId,
  slug,
  projects,
}: WorkEditorProps) {
  const updateTask = useUpdateTaskStatus();
  const updateProject = useUpdateProject();
  const openChat = useOpenChat();

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  // Task-specific
  const [taskType, setTaskType] = useState("execution");
  const [deliverable, setDeliverable] = useState("");
  const [doneCriteria, setDoneCriteria] = useState("");
  const [channel, setChannel] = useState("");
  const [taskStatus, setTaskStatus] = useState("todo");
  const [owner, setOwner] = useState("Sancho");
  const [skill, setSkill] = useState("");

  // Project-specific
  const [objective, setObjective] = useState("");
  const [approach, setApproach] = useState("");
  const [projStatus, setProjStatus] = useState("active");
  const [reviewDate, setReviewDate] = useState("");

  // Find the entity being edited
  const { entity, parentProjectId } = useMemo(() => {
    if (!editId || !projects) return { entity: null, parentProjectId: "" };

    if (mode === "task") {
      for (const pw of projects) {
        const t = pw.tasks.find((t) => t.id === editId);
        if (t) return { entity: t, parentProjectId: pw.project.id };
      }
      return { entity: null, parentProjectId: "" };
    } else {
      const pw = projects.find((p) => p.project.id === editId);
      return { entity: pw?.project || null, parentProjectId: editId };
    }
  }, [editId, mode, projects]);

  // Populate form when entity changes
  useEffect(() => {
    if (!entity) return;

    if (mode === "task") {
      const t = entity as Task;
      setName(t.name || "");
      setDescription(t.description || "");
      setTaskType(t.type || t.batch_type || "execution");
      setDeliverable(t.deliverable || "");
      setDoneCriteria(t.done_criteria || "");
      setChannel(t.channel || "");
      // Normalize status
      const normSt =
        t.status === "done"
          ? "completed"
          : t.status === "cancelled"
          ? "discarded"
          : t.status;
      setTaskStatus(normSt || "todo");
      setOwner(t.owner || "Sancho");
      setSkill(t.skill || "");
    } else {
      const p = entity as Project;
      const obj =
        typeof p.objective === "string"
          ? p.objective
          : p.objective?.description || "";
      setName(p.name || "");
      setDescription(p.description || "");
      setObjective(obj);
      setApproach(p.approach || "");
      setProjStatus(p.status || "active");
      setReviewDate(p.review_date || "");
    }
  }, [entity, mode]);

  // Also open chat sidebar when editor opens (matching legacy behavior)
  useEffect(() => {
    if (!open || !entity || !slug) return;

    if (mode === "task") {
      const t = entity as Task;
      const tType = t.type || t.batch_type || "execution";
      const config = buildTaskThread(slug, t.id, t.name, parentProjectId, {
        taskSkill: t.skill,
        taskChannel: t.channel,
        taskStatus: t.status,
        taskType: tType,
        pillar: t.pillar,
      });
      openChat(slug, config);
    } else {
      const p = entity as Project;
      const config = buildProjectThread(slug, p.id, p.name, {
        strategy: p.strategy,
        status: p.status,
      });
      openChat(slug, config);
    }
  }, [open, entity, mode, slug, parentProjectId, openChat]);

  const handleSave = useCallback(() => {
    if (!editId || !slug) return;

    if (mode === "task") {
      updateTask.mutate(
        {
          slug,
          projectId: parentProjectId,
          taskId: editId,
          status: taskStatus,
          // Extend: full task updates would need a dedicated mutation
          // For now this covers the primary use case (status changes)
        },
        { onSuccess: onClose }
      );
    } else {
      updateProject.mutate(
        {
          slug,
          projectId: editId,
          updates: {
            name,
            description,
            objective,
            approach,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            status: projStatus as any,
            review_date: reviewDate || null,
          },
        },
        { onSuccess: onClose }
      );
    }
  }, [
    editId,
    slug,
    mode,
    parentProjectId,
    taskStatus,
    name,
    description,
    objective,
    approach,
    projStatus,
    reviewDate,
    updateTask,
    updateProject,
    onClose,
  ]);

  const title = editId
    ? `✏️ ${editId} — ${name}`
    : mode === "task"
    ? "✏️ Nueva tarea"
    : "✏️ Nuevo proyecto";

  const actions = (
    <>
      <button
        onClick={handleSave}
        disabled={updateTask.isPending || updateProject.isPending}
        className="px-3 py-1.5 bg-rust text-white rounded-lg text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        💾 Guardar
      </button>
    </>
  );

  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title={title}
      actions={actions}
      width="w-[600px] max-w-[90vw]"
    >
      <div className="max-w-[700px] space-y-4">
        {/* Shared fields */}
        <Field label="Nombre">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:border-rust transition-colors"
          />
        </Field>

        <Field label="Descripcion">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card resize-y focus:outline-none focus:border-rust transition-colors"
          />
        </Field>

        {/* Task-only fields */}
        {mode === "task" && (
          <>
            <Field label="Tipo">
              <select
                value={taskType}
                onChange={(e) => setTaskType(e.target.value)}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:border-rust transition-colors"
              >
                {TASK_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="📦 Entregable">
              <textarea
                value={deliverable}
                onChange={(e) => setDeliverable(e.target.value)}
                rows={2}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card resize-y focus:outline-none focus:border-rust transition-colors"
              />
            </Field>

            <Field label="✓ Criterio de completado">
              <textarea
                value={doneCriteria}
                onChange={(e) => setDoneCriteria(e.target.value)}
                rows={2}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card resize-y focus:outline-none focus:border-rust transition-colors"
              />
            </Field>

            <div className="flex gap-3">
              <div className="flex-1">
                <Field label="Canal">
                  <select
                    value={channel}
                    onChange={(e) => setChannel(e.target.value)}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:border-rust transition-colors"
                  >
                    <option value="">—</option>
                    {PRJ_CHANNELS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="flex-1">
                <Field label="Estado">
                  <select
                    value={taskStatus}
                    onChange={(e) => setTaskStatus(e.target.value)}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:border-rust transition-colors"
                  >
                    {TASK_STATUS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>

            <Field label="Owner">
              <input
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:border-rust transition-colors"
              />
            </Field>

            <Field label="Skill">
              <input
                value={skill}
                onChange={(e) => setSkill(e.target.value)}
                placeholder="ej: seo-content, outreach-sequence-builder"
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:border-rust transition-colors"
              />
            </Field>
          </>
        )}

        {/* Project-only fields */}
        {mode === "project" && (
          <>
            <Field label="Objetivo">
              <textarea
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                rows={2}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card resize-y focus:outline-none focus:border-rust transition-colors"
              />
            </Field>

            <Field label="Enfoque">
              <textarea
                value={approach}
                onChange={(e) => setApproach(e.target.value)}
                rows={3}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card resize-y focus:outline-none focus:border-rust transition-colors"
              />
            </Field>

            <div className="flex gap-3">
              <div className="flex-1">
                <Field label="Estado">
                  <select
                    value={projStatus}
                    onChange={(e) => setProjStatus(e.target.value)}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:border-rust transition-colors"
                  >
                    {PROJECT_STATUS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="flex-1">
                <Field label="Review date">
                  <input
                    type="date"
                    value={reviewDate}
                    onChange={(e) => setReviewDate(e.target.value)}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:border-rust transition-colors"
                  />
                </Field>
              </div>
            </div>
          </>
        )}
      </div>
    </SlideOver>
  );
}

// ---------------------------------------------------------------------------
// Field wrapper
// ---------------------------------------------------------------------------

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}
