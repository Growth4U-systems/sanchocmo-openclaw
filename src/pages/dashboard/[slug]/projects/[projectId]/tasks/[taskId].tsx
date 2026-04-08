import { useRouter } from "next/router";
import React, { useMemo, useCallback, useState, useEffect, useRef } from "react";
import Head from "next/head";
import Link from "next/link";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useSlugSync } from "@/hooks/useSlugSync";
import { useProjects, useUpdateTask, useUpdateTaskStatus } from "@/hooks/useProjects";
import { useIdeas, useUpdateIdeaStatus, useUpdatePipelineStatus, useUpdatePipelineStep } from "@/hooks/useIdeas";
import { useOpenChat } from "@/hooks/useChat";
import { buildTaskThread } from "@/lib/chat-openers";
import { PRJ_CHANNELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { Idea, Task } from "@/types";

import { StatusPill } from "@/components/shared/status-pill";
import { EmptyState } from "@/components/shared/empty-state";
import { SkillPicker } from "@/components/shared/skill-picker";
import { DocSlideOver } from "@/components/shared/doc-slideover";
import { SlideOver } from "@/components/shared/slide-over";

// ---------------------------------------------------------------------------
// Content Pipeline definition (ported from legacy)
// ---------------------------------------------------------------------------

const CONTENT_PIPELINES: Record<string, { label: string; steps: { key: string; icon: string; label: string }[] }> = {
  blog: {
    label: "Blog / SEO",
    steps: [
      { key: "research", icon: "🔍", label: "Research" },
      { key: "redactar", icon: "📝", label: "Redactar" },
      { key: "imagen", icon: "🖼️", label: "Imagen" },
      { key: "schema", icon: "🧩", label: "Schema" },
      { key: "qa", icon: "🔎", label: "QA" },
      { key: "revisar", icon: "👀", label: "Revisar" },
      { key: "calendario", icon: "📅", label: "Calendario" },
      { key: "publicar", icon: "📤", label: "Publicar" },
      { key: "atomizar", icon: "⚡", label: "Atomizar" },
    ],
  },
  linkedin: {
    label: "LinkedIn",
    steps: [
      { key: "redactar", icon: "📝", label: "Redactar" },
      { key: "visual", icon: "🖼️", label: "Visual" },
      { key: "qa", icon: "🔎", label: "QA" },
      { key: "revisar", icon: "👀", label: "Revisar" },
      { key: "calendario", icon: "📅", label: "Calendario" },
      { key: "publicar", icon: "📤", label: "Publicar" },
    ],
  },
  instagram: {
    label: "Instagram",
    steps: [
      { key: "redactar", icon: "📝", label: "Redactar" },
      { key: "visual", icon: "🖼️", label: "Visual/Reel" },
      { key: "qa", icon: "🔎", label: "QA" },
      { key: "revisar", icon: "👀", label: "Revisar" },
      { key: "calendario", icon: "📅", label: "Calendario" },
      { key: "publicar", icon: "📤", label: "Publicar" },
    ],
  },
  tiktok: {
    label: "TikTok",
    steps: [
      { key: "guion", icon: "📝", label: "Guión" },
      { key: "video", icon: "🎬", label: "Vídeo" },
      { key: "qa", icon: "🔎", label: "QA" },
      { key: "revisar", icon: "👀", label: "Revisar" },
      { key: "calendario", icon: "📅", label: "Calendario" },
      { key: "publicar", icon: "📤", label: "Publicar" },
    ],
  },
  email: {
    label: "Email",
    steps: [
      { key: "redactar", icon: "📝", label: "Redactar" },
      { key: "template", icon: "🎨", label: "Template" },
      { key: "qa", icon: "🔎", label: "QA" },
      { key: "revisar", icon: "👀", label: "Revisar" },
      { key: "calendario", icon: "📅", label: "Calendario" },
      { key: "enviar", icon: "📤", label: "Enviar" },
    ],
  },
  youtube: {
    label: "YouTube",
    steps: [
      { key: "research", icon: "🔍", label: "Research" },
      { key: "guion", icon: "📝", label: "Guión" },
      { key: "thumbnail", icon: "🖼️", label: "Thumbnail" },
      { key: "qa", icon: "🔎", label: "QA" },
      { key: "revisar", icon: "👀", label: "Revisar" },
      { key: "calendario", icon: "📅", label: "Calendario" },
      { key: "publicar", icon: "📤", label: "Publicar" },
    ],
  },
};

const CHANNEL_TO_PIPELINE: Record<string, string> = {
  content: "blog",
  web: "blog",
  blog: "blog",
  social: "instagram",
  linkedin: "linkedin",
  instagram: "instagram",
  tiktok: "tiktok",
  email: "email",
  newsletter: "email",
  youtube: "youtube",
};

// Outreach pipeline columns (ported from legacy PIPELINE_COLS)
const PIPELINE_COLS = [
  { key: "pending", icon: "⬜", label: "Pendiente", color: "var(--muted)" },
  { key: "finding_dm", icon: "🔍", label: "Buscando DM", color: "var(--blue)" },
  { key: "enriching", icon: "📧", label: "Enriqueciendo", color: "var(--yellow)" },
  { key: "ready", icon: "✅", label: "Listo", color: "var(--green)" },
  { key: "contacted", icon: "📤", label: "Contactado", color: "var(--rust)" },
  { key: "replied", icon: "💬", label: "Respondio", color: "#22A06B" },
  { key: "interested", icon: "🤝", label: "Interesado", color: "#6554C0" },
  { key: "call_booked", icon: "📅", label: "Call agendada", color: "#00B8D9" },
  { key: "closed", icon: "✅", label: "Cerrado", color: "var(--green)" },
  { key: "discarded", icon: "❌", label: "Descartado", color: "var(--red)" },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const TASK_STATUS_OPTIONS = [
  { value: "todo", label: "Por hacer" },
  { value: "in-progress", label: "En progreso" },
  { value: "blocked", label: "Bloqueado" },
  { value: "completed", label: "Completado" },
  { value: "discarded", label: "Descartado" },
];

const TASK_TYPE_OPTIONS = [
  { value: "execution", label: "Execution" },
  { value: "content", label: "Content" },
  { value: "outreach", label: "Outreach" },
  { value: "foundation", label: "Foundation" },
  { value: "research", label: "Research" },
  { value: "analysis", label: "Analysis" },
];

export default function TaskDetailPage() {
  const slug = useSlugSync() || "";
  const router = useRouter();
  const projectId = (router.query.projectId as string) || "";
  const taskId = (router.query.taskId as string) || "";
  const { data: allProjects, isLoading } = useProjects(slug || null);
  const openChat = useOpenChat();
  const updateTask = useUpdateTask();
  const updateTaskStatus = useUpdateTaskStatus();

  // Inline editing
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<Task>>({});
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
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [statusOpen]);

  // Find project and task
  const pw = useMemo(() => {
    if (!allProjects) return null;
    return allProjects.find((p) => p.project.id === projectId) || null;
  }, [allProjects, projectId]);

  const project = pw?.project;
  const task = useMemo(() => {
    if (!pw) return null;
    return pw.tasks.find((t) => t.id === taskId) || null;
  }, [pw, taskId]);

  const taskType = task ? (task.type || task.batch_type || "execution") : "execution";

  // Populate draft when entering edit mode
  useEffect(() => {
    if (editing && task) {
      setDraft({
        name: task.name,
        description: task.description,
        type: (task.type || task.batch_type || "execution") as Task["type"],
        skill: task.skill,
        channel: task.channel,
        owner: task.owner,
        status: task.status === "done" ? "completed" : task.status === "cancelled" ? "discarded" : task.status,
        deliverable: task.deliverable,
        done_criteria: task.done_criteria,
      });
    }
  }, [editing, task]);

  // Load ideas for this task (by idea_ids on task OR task_id on idea)
  const ideaIds = useMemo(() => task?.idea_ids || [], [task]);
  const { data: ideasData } = useIdeas(slug || null);
  const updateIdeaStatus = useUpdateIdeaStatus();

  const taskIdeas: Idea[] = useMemo(() => {
    if (!ideasData || !slug) return [];
    const allIdeas = ideasData[slug] || [];
    const idSet = new Set(ideaIds);
    return allIdeas.filter((i: Idea) =>
      idSet.has(i.id) || i.task_id === taskId
    );
  }, [ideasData, slug, ideaIds, taskId]);

  // Chat handler
  const handleChat = useCallback(() => {
    if (!slug || !project || !task) return;
    const config = buildTaskThread(slug, task.id, task.name, project.id, {
      taskSkill: task.skill,
      taskChannel: task.channel,
      taskStatus: task.status,
      taskType,
      pillar: task.pillar,
    });
    openChat(slug, config);
  }, [slug, project, task, taskType, openChat]);

  // Save inline edits
  const handleSave = useCallback(() => {
    if (!slug || !taskId) return;
    updateTask.mutate(
      { slug, taskId, fields: draft },
      { onSuccess: () => setEditing(false) }
    );
  }, [slug, taskId, draft, updateTask]);

  // --- Loading / Not found ---
  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground">Cargando tarea...</p>
        </div>
      </DashboardLayout>
    );
  }

  if (!project || !task) {
    return (
      <DashboardLayout>
        <Head>
          <title>Tarea no encontrada — Mission Control</title>
        </Head>
        <EmptyState icon="🔍" message="Tarea no encontrada." />
      </DashboardLayout>
    );
  }

  // Tool tasks redirect to their dedicated page
  if (taskType === "tool" && task.skill) {
    const toolPages: Record<string, string> = {
      "trust-engine": "trust-engine",
      // "atalaya": "atalaya", — future
    };
    const toolPage = toolPages[task.skill];
    if (toolPage) {
      router.replace(`/dashboard/${slug}/${toolPage}?from=${project.id}`);
      return (
        <DashboardLayout>
          <div className="flex items-center justify-center py-20">
            <p className="text-muted-foreground">Redirigiendo a {task.skill}...</p>
          </div>
        </DashboardLayout>
      );
    }
  }

  const docs = task.documents || [];

  return (
    <DashboardLayout>
      <Head>
        <title>
          {task.id} — {task.name} — Mission Control
        </title>
      </Head>

      {/* Back link */}
      <div className="mb-4">
        <Link
          href={`/dashboard/${slug}/projects/${project.id}`}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← {project.name}
        </Link>
      </div>

      {/* ===== HERO CARD ===== */}
      <div className="bg-white border border-[#E8E2D9] rounded-[10px] p-5 mb-6" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-4 flex-1 min-w-0">
            <span className="font-bold text-[#C45D35] text-lg bg-[#F5E6DF] px-4 py-2 rounded-lg border border-[#C45D35]/20 shrink-0" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              {task.id}
            </span>
            <div className="flex-1 min-w-0">
              {editing ? (
                <input
                  value={draft.name || ""}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  className="text-xl font-bold text-[#2C3E50] w-full border border-[#E8E2D9] rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#2C3E50] transition-colors bg-white"
                />
              ) : (
                <h1 className="text-xl font-bold text-[#2C3E50] m-0">{task.name}</h1>
              )}
            </div>
          </div>
          <div className="flex gap-2 shrink-0 items-center">
            {/* Inline status pill with dropdown */}
            <div className="relative" ref={statusRef}>
              <button
                className="appearance-none bg-transparent border border-[#E8E2D9] rounded-lg cursor-pointer px-3 py-1.5 flex items-center gap-1.5 hover:border-[#2C3E50] transition-colors"
                onClick={() => setStatusOpen(!statusOpen)}
              >
                <StatusPill status={task.status} size="md" />
                <span className="text-[10px] text-[#7F8C8D]">▾</span>
              </button>
              {statusOpen && (
                <div className="absolute top-full right-0 mt-1 bg-white border-2 border-[#2C3E50] rounded-lg shadow-lg z-50 min-w-[170px] py-1">
                  {TASK_STATUS_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      className={`w-full text-left px-3 py-2 text-xs hover:bg-[#F0EDE8] transition-colors ${
                        task.status === opt.value ? "bg-[#F0EDE8] font-semibold" : ""
                      }`}
                      onClick={() => {
                        setStatusOpen(false);
                        if (task.status === opt.value) return;
                        updateTaskStatus.mutate({ slug, projectId, taskId: task.id, status: opt.value });
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={handleChat}
              className="px-3.5 py-1.5 bg-[#2C3E50] text-white rounded-lg cursor-pointer text-[13px] font-semibold hover:bg-[#34495E] transition-all"
            >
              Chat
            </button>
            {editing ? (
              <>
                <button
                  onClick={handleSave}
                  disabled={updateTask.isPending}
                  className="px-3.5 py-1.5 bg-[#27AE60] text-white rounded-lg cursor-pointer text-[13px] font-semibold hover:bg-[#229954] transition-all disabled:opacity-50"
                >
                  {updateTask.isPending ? "..." : "Guardar"}
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="px-3.5 py-1.5 bg-white border border-[#E8E2D9] rounded-lg cursor-pointer text-[13px] hover:border-[#2C3E50] transition-colors font-semibold"
                >
                  Cancelar
                </button>
              </>
            ) : (
              <button
                onClick={() => setEditing(true)}
                className="px-3.5 py-1.5 bg-white border border-[#E8E2D9] rounded-lg cursor-pointer text-[13px] hover:border-[#2C3E50] transition-colors font-semibold"
              >
                Editar
              </button>
            )}
          </div>
        </div>

        {editing ? (
          <textarea
            value={draft.description || ""}
            onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
            rows={3}
            className="w-full mt-3 text-[14px] leading-relaxed text-[#2C3E50] border border-[#E8E2D9] rounded-lg px-3 py-2 focus:outline-none focus:border-[#2C3E50] transition-colors bg-white resize-y"
            placeholder="Descripción de la tarea..."
          />
        ) : task.description ? (
          <p className="text-[14px] leading-relaxed mt-3 text-[#7F8C8D]">{task.description}</p>
        ) : null}
      </div>


      {/* ===== METADATA GRID ===== */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <MetaCard label="Tipo" editing={editing}>
          {editing ? (
            <select value={draft.type || "execution"} onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value as Task["type"] }))} className="w-full border border-[#E8E2D9] rounded-lg px-2 py-1 text-[13px] bg-white focus:outline-none focus:border-[#2C3E50]">
              {TASK_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ) : <span className="capitalize">{taskType}</span>}
        </MetaCard>
        <MetaCard label="Canal" editing={editing}>
          {editing ? (
            <select value={draft.channel || ""} onChange={(e) => setDraft((d) => ({ ...d, channel: e.target.value }))} className="w-full border border-[#E8E2D9] rounded-lg px-2 py-1 text-[13px] bg-white focus:outline-none focus:border-[#2C3E50]">
              <option value="">—</option>
              {PRJ_CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          ) : <span>{task.channel || "—"}</span>}
        </MetaCard>
        <MetaCard label="Responsable" editing={editing}>
          {editing ? (
            <select value={draft.owner || "Sancho"} onChange={(e) => setDraft((d) => ({ ...d, owner: e.target.value }))} className="w-full border border-[#E8E2D9] rounded-lg px-2 py-1 text-[13px] bg-white focus:outline-none focus:border-[#2C3E50]">
              <option value="Sancho">Sancho</option>
              <option value="Equipo">Equipo</option>
            </select>
          ) : <span>{task.owner || "Sancho"}</span>}
        </MetaCard>
        {task.depends_on && !editing && (
          <MetaCard label="Depende de" editing={false}>
            <span>{task.depends_on}</span>
          </MetaCard>
        )}
      </div>

      {/* ===== SKILLS (searchable multi-select) ===== */}
      <div className="bg-white border border-[#E8E2D9] rounded-[10px] p-4 mb-6" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
        <div className="text-[11px] text-[#7F8C8D] uppercase tracking-[0.5px] font-semibold mb-2">Skills</div>
        {editing ? (
          <SkillPicker
            value={(draft.skill || "").split(",").map((s) => s.trim()).filter(Boolean)}
            onChange={(skills) => setDraft((d) => ({ ...d, skill: skills.join(", ") }))}
          />
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {(task.skill || "").split(",").map((s) => s.trim()).filter(Boolean).length > 0 ? (
              (task.skill || "").split(",").map((s) => s.trim()).filter(Boolean).map((s) => (
                <span key={s} className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-blue-500/10 text-blue-600">
                  🧰 {s}
                </span>
              ))
            ) : (
              <span className="text-[14px] font-semibold text-[#2C3E50]">—</span>
            )}
          </div>
        )}
      </div>

      {/* ===== INFO CARDS ===== */}
      {(editing || task.deliverable || task.done_criteria) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {(editing || task.deliverable) && (
            <div className="bg-white border border-[#E8E2D9] rounded-[10px] p-4 border-l-4 border-l-[#27AE60]" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-base">📦</span>
                <span className="font-semibold text-sm text-[#27AE60]">Entregable</span>
              </div>
              {editing ? (
                <textarea value={draft.deliverable || ""} onChange={(e) => setDraft((d) => ({ ...d, deliverable: e.target.value }))} rows={2} className="w-full border border-[#E8E2D9] rounded-lg px-3 py-2 text-sm bg-white resize-y focus:outline-none focus:border-[#2C3E50]" placeholder="Qué se entrega al completar..." />
              ) : (
                <p className="text-sm leading-relaxed text-[#2C3E50]">{task.deliverable}</p>
              )}
            </div>
          )}
          {(editing || task.done_criteria) && (
            <div className="bg-white border border-[#E8E2D9] rounded-[10px] p-4 border-l-4 border-l-[#3498DB]" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-base">✓</span>
                <span className="font-semibold text-sm text-[#3498DB]">Criterio de completado</span>
              </div>
              {editing ? (
                <textarea value={draft.done_criteria || ""} onChange={(e) => setDraft((d) => ({ ...d, done_criteria: e.target.value }))} rows={2} className="w-full border border-[#E8E2D9] rounded-lg px-3 py-2 text-sm bg-white resize-y focus:outline-none focus:border-[#2C3E50]" placeholder="Cómo sabemos que está hecho..." />
              ) : (
                <p className="text-sm leading-relaxed text-[#2C3E50]">{task.done_criteria}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Content Pipeline */}
      {taskType === "content" && <ContentPipeline channel={task.channel} />}

      {/* Tool tasks redirect to their dedicated page — see redirect above */}

      {/* ===== DOCUMENTS ===== */}
      <div className="bg-white border border-[#E8E2D9] rounded-[10px] overflow-hidden mb-6" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
        <div className="px-4 py-3 border-b border-[#E8E2D9] flex items-center gap-2">
          <span className="text-base">📄</span>
          <span className="font-semibold text-sm text-[#2C3E50]">Documentos</span>
          <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
            {docs.length}
          </span>
        </div>
        <div className="p-4">
          {docs.length === 0 ? (
            <div className="text-center py-6 text-sm text-muted-foreground/50 italic">
              Sin documentos. El chat creara documentos aqui al ejecutar la tarea.
            </div>
          ) : (
            <div className="space-y-1.5">
              {docs.map((doc, i) => {
                const docName =
                  doc.title || doc.name || doc.path.split("/").pop()?.replace(".md", "") || "doc";
                const docDate = doc.created_at
                  ? new Date(doc.created_at).toLocaleDateString("es-ES", { day: "numeric", month: "short" })
                  : "";
                const statusIcon = doc.status === "approved" ? "✅" : doc.status === "draft" ? "📝" : "📄";
                const isImage = /\.(png|jpe?g|webp|gif|svg)$/i.test(doc.path);

                if (isImage) {
                  return (
                    <div
                      key={i}
                      className="inline-block mr-2 mb-2 border border-border rounded-lg overflow-hidden cursor-pointer hover:border-rust hover:shadow-sm transition-all"
                      onClick={() => window.open(`/docs/${doc.path}`, "_blank")}
                    >
                      <img src={`/docs/${doc.path}`} alt={docName} className="max-h-[120px] max-w-[200px] block" />
                      <div className="px-2 py-1 text-[10px] text-muted-foreground bg-white">{docName}</div>
                    </div>
                  );
                }

                return (
                  <button
                    key={i}
                    onClick={() => setOpenDocPath(doc.path)}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 border border-border rounded-lg text-foreground bg-background hover:border-rust hover:shadow-sm transition-all cursor-pointer text-left"
                  >
                    <span className="text-base">{statusIcon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-[13px]">{docName}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{doc.path}</div>
                    </div>
                    {docDate && <span className="text-[11px] text-muted-foreground shrink-0">{docDate}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ===== IDEAS / CONTACTS ===== */}
      {(taskType === "content" || taskType === "outreach" || ideaIds.length > 0) && (
        <div className="bg-white border border-[#E8E2D9] rounded-[10px] overflow-hidden mb-6" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
          <div className="px-4 py-3 border-b border-[#E8E2D9] flex items-center gap-2">
            <span className="text-base">{taskType === "outreach" ? "👥" : "💡"}</span>
            <span className="font-semibold text-sm text-[#2C3E50]">
              {taskType === "outreach" ? "Contactos" : "Ideas"}
            </span>
            <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              {ideaIds.length}
            </span>
          </div>
          <div className="p-4">
            {ideaIds.length === 0 ? (
              <div className="text-center py-6 text-sm text-muted-foreground/50 italic">
                Sin {taskType === "outreach" ? "contactos" : "ideas"} asignados.
              </div>
            ) : taskIdeas.length === 0 ? (
              <div className="text-muted-foreground text-sm">Cargando...</div>
            ) : taskType === "outreach" ? (
              <OutreachKanban ideas={taskIdeas} slug={slug} />
            ) : (
              <ContentIdeas ideas={taskIdeas} channel={task.channel || ""} slug={slug} onStatusChange={(ideaId, status) => {
                updateIdeaStatus.mutate({ slug, ideaId, status });
              }} />
            )}
          </div>
        </div>
      )}

      {/* Document SlideOver */}
      <DocSlideOver slug={slug} docPath={openDocPath ? `brand/${slug}/${openDocPath}` : null} onClose={() => setOpenDocPath(null)} />
    </DashboardLayout>
  );
}

// ---------------------------------------------------------------------------
// MetaCard — small card for metadata grid
// ---------------------------------------------------------------------------

function MetaCard({ label, editing, children }: { label: string; editing: boolean; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-[#E8E2D9] rounded-[10px] px-4 py-3" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
      <div className="text-[11px] text-[#7F8C8D] uppercase tracking-[0.5px] mb-1">{label}</div>
      <div className={editing ? "" : "text-[14px] font-semibold text-[#2C3E50]"}>{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Content Pipeline visual
// ---------------------------------------------------------------------------

function ContentPipeline({ channel }: { channel: string }) {
  const pipelineKey = CHANNEL_TO_PIPELINE[channel] || "blog";
  const pipeline = CONTENT_PIPELINES[pipelineKey] || CONTENT_PIPELINES.blog;

  return (
    <div className="border-t-2 border-border pt-4 mt-4 mb-4">
      <div className="font-heading text-sm font-semibold text-navy mb-2.5">
        🔄 Pipeline: {pipeline.label}
      </div>
      <div className="flex gap-1 items-center flex-wrap">
        {pipeline.steps.map((step, i) => (
          <span key={step.key} className="contents">
            <span className="text-[11px] px-2 py-0.5 rounded bg-rust/8 text-rust font-medium">
              {step.icon} {step.label}
            </span>
            {i < pipeline.steps.length - 1 && (
              <span className="text-[10px] text-muted-foreground">→</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Outreach Kanban (contacts by pipeline_status)
// ---------------------------------------------------------------------------

function OutreachKanban({ ideas, slug }: { ideas: Idea[]; slug: string }) {
  const [selectedContact, setSelectedContact] = useState<Idea | null>(null);
  const updatePipeline = useUpdatePipelineStatus();

  const groups = useMemo(() => {
    const map: Record<string, Idea[]> = {};
    for (const col of PIPELINE_COLS) map[col.key] = [];
    for (const idea of ideas) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ps = (idea as any).pipeline_status || "pending";
      if (!map[ps]) map[ps] = [];
      map[ps].push(idea);
    }
    return map;
  }, [ideas]);

  const visibleCols = PIPELINE_COLS.filter(
    (col) =>
      (groups[col.key]?.length || 0) > 0 ||
      ["pending", "ready", "contacted", "interested"].includes(col.key)
  );

  const total = ideas.length;
  const contacted = ideas.filter((i) =>
    ["contacted", "replied", "interested", "call_booked", "closed"].includes(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (i as any).pipeline_status || ""
    )
  ).length;
  const replied = ideas.filter((i) =>
    ["replied", "interested", "call_booked", "closed"].includes(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (i as any).pipeline_status || ""
    )
  ).length;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const selData = (selectedContact as any)?.source_data || {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const selPipelineStatus = (selectedContact as any)?.pipeline_status || "pending";

  return (
    <>
      <div className="flex gap-2 overflow-x-auto pb-2">
        {visibleCols.map((col) => {
          const colIdeas = groups[col.key] || [];
          return (
            <div key={col.key} className="min-w-[180px] max-w-[220px] shrink-0">
              <div
                className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 mb-1.5 flex items-center gap-1"
                style={{ color: col.color }}
              >
                {col.icon} {col.label}{" "}
                <span className="text-muted-foreground font-normal">{colIdeas.length}</span>
              </div>
              {colIdeas.length > 0 ? (
                colIdeas.map((idea) => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const d = (idea as any).source_data || {};
                  const name = [d.first_name, d.last_name].filter(Boolean).join(" ");
                  const emailBadge = d.email_status === "verified" ? "✅" : d.email_status === "catch-all" ? "⚠️" : "";
                  return (
                    <div
                      key={idea.id}
                      className="p-2 border border-border rounded-md mb-1 bg-card cursor-pointer hover:border-rust transition-colors"
                      style={{ borderLeft: `3px solid ${col.color}` }}
                      onClick={() => setSelectedContact(idea)}
                    >
                      <div className="font-bold text-xs">{d.company_name || idea.title}</div>
                      {name && <div className="text-[11px] text-muted-foreground mt-0.5">{name}</div>}
                      {d.job_title && <div className="text-[10px] text-muted-foreground">{d.job_title}</div>}
                      <div className="flex gap-1 mt-1 items-center">
                        {d.email ? <span className="text-[9px]">📧{emailBadge}</span> : <span className="text-[9px] text-destructive">📧❌</span>}
                        {d.linkedin_url && <span className="text-[9px]">💼</span>}
                        {d.seniority && <span className="text-[8px] px-1 py-0.5 rounded bg-rust/10 text-rust">{d.seniority}</span>}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="py-3 text-center text-muted-foreground text-[11px] italic border border-dashed border-border rounded-md">—</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary stats */}
      <div className="flex gap-4 mt-3 px-3 py-2 bg-background rounded-md text-[11px]">
        <span><strong>{total}</strong> contactos</span>
        <span><strong>{contacted}</strong> contactados ({total > 0 ? Math.round((contacted / total) * 100) : 0}%)</span>
        <span><strong>{replied}</strong> respondieron ({total > 0 ? Math.round((replied / total) * 100) : 0}%)</span>
      </div>

      {/* Contact detail SlideOver */}
      <SlideOver
        open={!!selectedContact}
        onClose={() => setSelectedContact(null)}
        title={selData.company_name || selectedContact?.title || "Contacto"}
        width="w-[500px] max-w-full"
      >
        {selectedContact && (
          <div className="space-y-5">
            {/* Pipeline status selector */}
            <div>
              <label className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide block mb-1.5">Estado pipeline</label>
              <select
                value={selPipelineStatus}
                onChange={(e) => {
                  updatePipeline.mutate({ slug, ideaId: selectedContact.id, pipeline_status: e.target.value });
                  // Optimistic update for the local view
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  (selectedContact as any).pipeline_status = e.target.value;
                  setSelectedContact({ ...selectedContact });
                }}
                className="w-full border border-[#E8E2D9] rounded-lg px-3 py-2 text-sm font-semibold bg-white focus:outline-none focus:border-[#2C3E50]"
              >
                {PIPELINE_COLS.map((col) => (
                  <option key={col.key} value={col.key}>{col.icon} {col.label}</option>
                ))}
              </select>
            </div>

            {/* Contact info */}
            <div className="grid grid-cols-2 gap-3">
              {selData.first_name && <ContactField label="Nombre" value={`${selData.first_name || ""} ${selData.last_name || ""}`} />}
              {selData.job_title && <ContactField label="Cargo" value={selData.job_title} />}
              {selData.company_name && <ContactField label="Empresa" value={selData.company_name} />}
              {selData.seniority && <ContactField label="Seniority" value={selData.seniority} />}
              {selData.email && (
                <ContactField
                  label="Email"
                  value={`${selData.email} ${selData.email_status === "verified" ? "✅" : selData.email_status === "catch-all" ? "⚠️" : ""}`}
                />
              )}
              {selData.linkedin_url && <ContactField label="LinkedIn" value={selData.linkedin_url} isLink />}
              {selData.company_url && <ContactField label="Web" value={selData.company_url} isLink />}
              {selData.location && <ContactField label="Ubicación" value={selData.location} />}
              {selData.industry && <ContactField label="Industria" value={selData.industry} />}
              {selData.employees && <ContactField label="Empleados" value={String(selData.employees)} />}
            </div>

            {/* Description / notes */}
            {selectedContact.description && (
              <div>
                <label className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide block mb-1">Descripción</label>
                <p className="text-sm text-foreground leading-relaxed">{selectedContact.description}</p>
              </div>
            )}
            {selectedContact.action && (
              <div>
                <label className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide block mb-1">Acción</label>
                <p className="text-sm text-foreground leading-relaxed">{selectedContact.action}</p>
              </div>
            )}
          </div>
        )}
      </SlideOver>
    </>
  );
}

function ContactField({ label, value, isLink }: { label: string; value: string; isLink?: boolean }) {
  return (
    <div className="bg-background border border-border rounded-lg px-3 py-2">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">{label}</div>
      {isLink ? (
        <a href={value.startsWith("http") ? value : `https://${value}`} target="_blank" rel="noreferrer" className="text-sm font-medium text-rust hover:underline truncate block">{value}</a>
      ) : (
        <div className="text-sm font-medium text-foreground truncate">{value}</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Content Ideas list
// ---------------------------------------------------------------------------

function ContentIdeas({ ideas, channel, slug, onStatusChange }: {
  ideas: Idea[];
  channel: string;
  slug: string;
  onStatusChange: (ideaId: string, status: string) => void;
}) {
  const pipelineKey = CHANNEL_TO_PIPELINE[channel] || "blog";
  const pipeline = CONTENT_PIPELINES[pipelineKey] || CONTENT_PIPELINES.blog;
  const updateStep = useUpdatePipelineStep();
  const [selectedIdea, setSelectedIdea] = useState<Idea | null>(null);

  // Full columns: new | approved (no step yet) | pipeline steps... | rejected
  const ALL_COLS = useMemo(() => [
    { key: "_new", icon: "📥", label: "Nuevas" },
    { key: "_approved", icon: "✅", label: "Aprobadas" },
    ...pipeline.steps,
  ], [pipeline.steps]);

  const groups = useMemo(() => {
    const map: Record<string, Idea[]> = {};
    for (const col of ALL_COLS) map[col.key] = [];
    map._rejected = [];
    for (const idea of ideas) {
      if (idea.status === "rejected") { map._rejected.push(idea); continue; }
      if (idea.status === "new") { map._new.push(idea); continue; }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const step = (idea as any).pipeline_step;
      if (!step) { map._approved.push(idea); continue; }
      if (!map[step]) map[step] = [];
      map[step].push(idea);
    }
    return map;
  }, [ideas, ALL_COLS]);

  const rejectedIdeas = groups._rejected || [];

  // Show columns that have items, plus first 4 always
  const visibleCols = ALL_COLS.filter(
    (col, i) => (groups[col.key]?.length || 0) > 0 || i < 4
  );

  // Selected idea detail
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const selData = (selectedIdea as any)?.source_data || {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const selStep = (selectedIdea as any)?.pipeline_step || "";
  const selStepIdx = selStep ? pipeline.steps.findIndex((s) => s.key === selStep) : -1;

  return (
    <div className="space-y-4">
      {/* Pipeline kanban */}
      <div className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1">
        Pipeline: {pipeline.label}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-2">
        {visibleCols.map((col) => {
          const colIdeas = groups[col.key] || [];
          const isNew = col.key === "_new";
          return (
            <div key={col.key} className="min-w-[200px] max-w-[260px] shrink-0 flex flex-col">
              <div className="text-[10px] font-bold uppercase tracking-wide px-2 py-1.5 mb-1.5 flex items-center gap-1.5 text-[#2C3E50]">
                <span>{col.icon}</span>
                <span>{col.label}</span>
                <span className="text-muted-foreground font-normal ml-auto">{colIdeas.length}</span>
              </div>
              <div className="flex-1 space-y-1.5 min-h-[80px]">
                {colIdeas.map((idea) => (
                  <div
                    key={idea.id}
                    className="p-2.5 border border-border rounded-lg bg-white hover:border-rust hover:shadow-sm transition-all cursor-pointer"
                    onClick={() => setSelectedIdea(idea)}
                  >
                    <div className="font-semibold text-xs mb-1">{idea.title}</div>
                    {idea.priority_score ? <div className="text-[10px] text-amber-600 mb-1">⭐ {idea.priority_score}</div> : null}
                    {isNew && (
                      <div className="flex gap-1 mt-1.5">
                        <button
                          className="text-[10px] px-1.5 py-0.5 rounded bg-[#E8F5E9] text-[#2E7D32] font-medium hover:bg-[#C8E6C9] transition-colors"
                          onClick={(e) => { e.stopPropagation(); onStatusChange(idea.id, "approved"); }}
                        >
                          ✅ Aprobar
                        </button>
                        <button
                          className="text-[10px] px-1.5 py-0.5 rounded bg-[#FFEBEE] text-[#C62828] font-medium hover:bg-[#FFCDD2] transition-colors"
                          onClick={(e) => { e.stopPropagation(); onStatusChange(idea.id, "rejected"); }}
                        >
                          ❌
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {colIdeas.length === 0 && (
                  <div className="py-4 text-center text-muted-foreground text-[11px] italic border border-dashed border-border rounded-lg">—</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Rejected */}
      {rejectedIdeas.length > 0 && (
        <div className="opacity-40">
          <div className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1">Rechazadas ({rejectedIdeas.length})</div>
          <div className="space-y-1">
            {rejectedIdeas.map((idea) => (
              <div key={idea.id} className="px-3 py-1.5 text-[12px] text-muted-foreground line-through">{idea.title}</div>
            ))}
          </div>
        </div>
      )}

      {/* Idea detail SlideOver */}
      <SlideOver
        open={!!selectedIdea}
        onClose={() => setSelectedIdea(null)}
        title={selectedIdea?.title || "Idea"}
        width="w-[500px] max-w-full"
        actions={selectedIdea?.status === "new" ? (
          <div className="flex gap-1.5">
            <button
              className="px-2.5 py-1 text-xs font-semibold bg-[#E8F5E9] text-[#2E7D32] rounded-md hover:bg-[#C8E6C9] transition-colors"
              onClick={() => { onStatusChange(selectedIdea.id, "approved"); setSelectedIdea(null); }}
            >
              ✅ Aprobar
            </button>
            <button
              className="px-2.5 py-1 text-xs font-semibold bg-[#FFEBEE] text-[#C62828] rounded-md hover:bg-[#FFCDD2] transition-colors"
              onClick={() => { onStatusChange(selectedIdea.id, "rejected"); setSelectedIdea(null); }}
            >
              ❌ Rechazar
            </button>
          </div>
        ) : undefined}
      >
        {selectedIdea && (
          <div className="space-y-5">
            {/* Pipeline step selector */}
            {selectedIdea.status !== "new" && selectedIdea.status !== "rejected" && (
              <div>
                <label className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide block mb-1.5">Paso del pipeline</label>
                <select
                  value={selStep || "_approved"}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "_approved") {
                      // Remove pipeline_step
                      updateStep.mutate({ slug, ideaId: selectedIdea.id, pipeline_step: "" });
                    } else {
                      updateStep.mutate({ slug, ideaId: selectedIdea.id, pipeline_step: val });
                    }
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (selectedIdea as any).pipeline_step = val === "_approved" ? "" : val;
                    setSelectedIdea({ ...selectedIdea });
                  }}
                  className="w-full border border-[#E8E2D9] rounded-lg px-3 py-2 text-sm font-semibold bg-white focus:outline-none focus:border-[#2C3E50]"
                >
                  <option value="_approved">✅ Aprobada (sin iniciar)</option>
                  {pipeline.steps.map((s) => (
                    <option key={s.key} value={s.key}>{s.icon} {s.label}</option>
                  ))}
                </select>

                {/* Quick move buttons */}
                <div className="flex gap-2 mt-2">
                  {selStepIdx > 0 && (
                    <button
                      className="text-xs px-2 py-1 rounded border border-border hover:bg-muted/40 transition-colors text-muted-foreground"
                      onClick={() => {
                        const prev = pipeline.steps[selStepIdx - 1].key;
                        updateStep.mutate({ slug, ideaId: selectedIdea.id, pipeline_step: prev });
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        (selectedIdea as any).pipeline_step = prev;
                        setSelectedIdea({ ...selectedIdea });
                      }}
                    >
                      ← {pipeline.steps[selStepIdx - 1].label}
                    </button>
                  )}
                  {selStepIdx >= 0 && selStepIdx < pipeline.steps.length - 1 && (
                    <button
                      className="text-xs px-2 py-1 rounded border border-rust/30 bg-rust/5 hover:bg-rust/15 transition-colors text-rust font-medium"
                      onClick={() => {
                        const next = pipeline.steps[selStepIdx + 1].key;
                        updateStep.mutate({ slug, ideaId: selectedIdea.id, pipeline_step: next });
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        (selectedIdea as any).pipeline_step = next;
                        setSelectedIdea({ ...selectedIdea });
                      }}
                    >
                      {pipeline.steps[selStepIdx + 1].icon} {pipeline.steps[selStepIdx + 1].label} →
                    </button>
                  )}
                  {!selStep && pipeline.steps.length > 0 && (
                    <button
                      className="text-xs px-2 py-1 rounded border border-rust/30 bg-rust/5 hover:bg-rust/15 transition-colors text-rust font-medium"
                      onClick={() => {
                        const first = pipeline.steps[0].key;
                        updateStep.mutate({ slug, ideaId: selectedIdea.id, pipeline_step: first });
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        (selectedIdea as any).pipeline_step = first;
                        setSelectedIdea({ ...selectedIdea });
                      }}
                    >
                      {pipeline.steps[0].icon} Iniciar {pipeline.steps[0].label} →
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Info */}
            <div className="space-y-3">
              {selectedIdea.description && (
                <div>
                  <label className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide block mb-1">Descripción</label>
                  <p className="text-sm text-foreground leading-relaxed">{selectedIdea.description}</p>
                </div>
              )}
              {selectedIdea.action && (
                <div>
                  <label className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide block mb-1">Acción</label>
                  <p className="text-sm text-foreground leading-relaxed">{selectedIdea.action}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                {selectedIdea.priority_score ? <ContactField label="Prioridad" value={`⭐ ${selectedIdea.priority_score}`} /> : null}
                {selData.volume ? <ContactField label="Volumen" value={String(selData.volume)} /> : null}
                {selData.kd ? <ContactField label="KD" value={String(selData.kd)} /> : null}
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {(selectedIdea as any).source ? <ContactField label="Fuente" value={String((selectedIdea as any).source)} /> : null}
                {selectedIdea.channels?.length ? <ContactField label="Canales" value={selectedIdea.channels.join(", ")} /> : null}
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {(selectedIdea as any).theme ? <ContactField label="Tema" value={String((selectedIdea as any).theme)} /> : null}
              </div>

              {/* Pieces */}
              {(selectedIdea.pieces || []).length > 0 && (
                <div>
                  <label className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide block mb-1.5">Piezas de contenido</label>
                  <div className="space-y-1">
                    {selectedIdea.pieces.map((p) => (
                      <div key={p.id} className="flex items-center gap-2 px-2.5 py-1.5 bg-background border border-border rounded-md text-xs">
                        <span>{p.status === "published" ? "📤" : p.status === "approved" ? "✅" : p.status === "review" ? "👀" : "📝"}</span>
                        <span className="font-medium">{p.channel}</span>
                        <span className="text-muted-foreground">{p.title || p.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </SlideOver>
    </div>
  );
}
