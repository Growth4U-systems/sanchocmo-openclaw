import { useRouter } from "next/router";
import { useMemo, useCallback, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useProjects } from "@/hooks/useProjects";
import { useIdeas } from "@/hooks/useIdeas";
import { useOpenChat } from "@/hooks/useChat";
import { buildTaskThread } from "@/lib/chat-openers";
import type { Idea } from "@/types";

import { StatusPill } from "@/components/shared/status-pill";
import { TaskTypeBadge } from "@/components/shared/task-type-badge";
import { ChannelBadge } from "@/components/shared/channel-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { WorkEditor } from "@/components/projects/work-editor";

// ---------------------------------------------------------------------------
// Content Pipeline definition (ported from legacy)
// ---------------------------------------------------------------------------

const CONTENT_PIPELINES: Record<string, { label: string; steps: string[] }> = {
  blog: {
    label: "Blog / Articulo",
    steps: ["📝 Draft", "🖼️ Assets", "👀 Review", "✅ Approved", "📅 Scheduled", "📤 Published"],
  },
  social: {
    label: "Social Media",
    steps: ["📝 Draft", "🖼️ Assets", "👀 Review", "✅ Approved", "📅 Scheduled", "📤 Published"],
  },
  email: {
    label: "Email",
    steps: ["📝 Draft", "👀 Review", "✅ Approved", "📤 Sent"],
  },
};

const CHANNEL_TO_PIPELINE: Record<string, string> = {
  content: "blog",
  web: "blog",
  social: "social",
  email: "email",
};

const CONTENT_PIECE_STATES = [
  { icon: "⬜", label: "Pendiente" },
  { icon: "🔧", label: "En progreso" },
  { icon: "✅", label: "Publicado" },
];

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

export default function TaskDetailPage() {
  const router = useRouter();
  const slug = (router.query.slug as string) || "";
  const projectId = (router.query.projectId as string) || "";
  const taskId = (router.query.taskId as string) || "";
  const { data: allProjects, isLoading } = useProjects(slug || null);
  const openChat = useOpenChat();
  const [editorOpen, setEditorOpen] = useState(false);

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

  // Load ideas for this task
  const ideaIds = useMemo(() => task?.idea_ids || [], [task]);
  const { data: ideasData } = useIdeas(
    slug || null,
    ideaIds.length > 0 ? undefined : undefined
  );

  const taskIdeas: Idea[] = useMemo(() => {
    if (!ideasData || !slug || ideaIds.length === 0) return [];
    const allIdeas = ideasData[slug] || [];
    const idSet = new Set(ideaIds);
    return allIdeas.filter((i: Idea) => idSet.has(i.id));
  }, [ideasData, slug, ideaIds]);

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

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
        <div>
          <div className="flex items-center gap-3 mb-1.5">
            <span className="font-heading font-bold text-rust text-lg">
              {task.id}
            </span>
            <h1 className="font-heading text-2xl text-foreground m-0">
              {task.name}
            </h1>
            <StatusPill status={task.status} size="md" />
            <TaskTypeBadge type={taskType} />
          </div>
          {/* Badges row */}
          <div className="flex items-center gap-2 flex-wrap">
            {task.channel && <ChannelBadge channel={task.channel} />}
            {task.owner && (
              <span className="text-xs text-muted-foreground">
                👤 {task.owner}
              </span>
            )}
            {task.depends_on && (
              <span className="text-xs text-muted-foreground">
                ⛓️ {task.depends_on}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleChat}
            className="px-3.5 py-1.5 bg-rust text-white border border-rust rounded-lg cursor-pointer text-[13px] font-semibold hover:opacity-90 transition-opacity"
          >
            💬 Chat
          </button>
          <button
            onClick={() => {
              setEditorOpen(true);
            }}
            className="px-3.5 py-1.5 bg-card border border-border rounded-lg cursor-pointer text-[13px] hover:border-rust transition-colors"
          >
            ✏️ Editar
          </button>
        </div>
      </div>

      {/* Description */}
      {task.description && (
        <p className="text-[15px] leading-relaxed mb-4">{task.description}</p>
      )}

      {/* Deliverable */}
      {task.deliverable && (
        <div className="text-sm mb-2 px-3.5 py-2.5 bg-sage/8 rounded-lg">
          <strong>📦 Entregable:</strong> {task.deliverable}
        </div>
      )}

      {/* Done criteria */}
      {task.done_criteria && (
        <div className="text-sm mb-2 px-3.5 py-2.5 bg-blue-500/8 rounded-lg">
          <strong>✓ Criterio:</strong> {task.done_criteria}
        </div>
      )}

      {/* Content Pipeline (for content-type tasks) */}
      {taskType === "content" && <ContentPipeline channel={task.channel} />}

      {/* Documents section */}
      <div className="border-t-2 border-border pt-5 mt-5">
        <div className="font-heading text-base font-semibold text-navy mb-3">
          📄 Documentos ({docs.length})
        </div>
        {docs.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground text-[13px] border border-dashed border-border rounded-lg">
            Sin documentos. El chat creara documentos aqui al ejecutar la tarea.
          </div>
        ) : (
          <div className="space-y-1">
            {docs.map((doc, i) => {
              const docName =
                doc.title ||
                doc.name ||
                doc.path.split("/").pop()?.replace(".md", "") ||
                "doc";
              const docDate = doc.created_at
                ? new Date(doc.created_at).toLocaleDateString("es-ES", {
                    day: "numeric",
                    month: "short",
                  })
                : "";
              const statusIcon =
                doc.status === "approved"
                  ? "✅"
                  : doc.status === "draft"
                  ? "📝"
                  : "📄";
              const isImage = /\.(png|jpe?g|webp|gif|svg)$/i.test(doc.path);

              if (isImage) {
                return (
                  <div
                    key={i}
                    className="inline-block mr-2 mb-2 border border-border rounded-lg overflow-hidden cursor-pointer hover:border-rust transition-colors"
                    onClick={() => window.open(`/docs/${doc.path}`, "_blank")}
                  >
                    <img
                      src={`/docs/${doc.path}`}
                      alt={docName}
                      className="max-h-[120px] max-w-[200px] block"
                    />
                    <div className="px-2 py-1 text-[11px] text-muted-foreground bg-background">
                      {docName}
                    </div>
                  </div>
                );
              }

              return (
                <a
                  key={i}
                  href={`/docs/${doc.path}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2.5 px-3 py-2 border border-border rounded-lg mb-1 no-underline text-foreground hover:border-rust transition-colors"
                >
                  <span className="text-base">{statusIcon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[13px]">{docName}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {doc.path}
                    </div>
                  </div>
                  {docDate && (
                    <span className="text-[11px] text-muted-foreground">
                      {docDate}
                    </span>
                  )}
                </a>
              );
            })}
          </div>
        )}
      </div>

      {/* Ideas / Contacts section */}
      {(taskType === "content" || taskType === "outreach" || ideaIds.length > 0) && (
        <div className="border-t-2 border-border pt-5 mt-5">
          <div className="font-heading text-base font-semibold text-navy mb-3">
            {taskType === "outreach" ? "👥 Contactos" : "💡 Ideas"} ({ideaIds.length})
          </div>

          {ideaIds.length === 0 ? (
            <div className="text-muted-foreground text-[13px] italic py-4 text-center">
              Sin {taskType === "outreach" ? "contactos" : "ideas"} asignados.
            </div>
          ) : taskIdeas.length === 0 ? (
            <div className="text-muted-foreground">Cargando...</div>
          ) : taskType === "outreach" ? (
            <OutreachKanban ideas={taskIdeas} />
          ) : (
            <ContentIdeas ideas={taskIdeas} taskId={task.id} />
          )}
        </div>
      )}

      {/* Work Editor SlideOver */}
      <WorkEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        mode="task"
        editId={task.id}
        slug={slug}
        projects={allProjects || []}
      />
    </DashboardLayout>
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
          <span key={i} className="contents">
            <span className="text-[11px] px-2 py-0.5 rounded bg-rust/8 text-rust font-medium">
              {step}
            </span>
            {i < pipeline.steps.length - 1 && (
              <span className="text-[10px] text-muted-foreground">→</span>
            )}
          </span>
        ))}
      </div>
      <div className="flex gap-3 flex-wrap mt-2">
        {CONTENT_PIECE_STATES.map((s) => (
          <span key={s.label} className="text-[10px] text-muted-foreground">
            {s.icon} {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Outreach Kanban (contacts by pipeline_status)
// ---------------------------------------------------------------------------

function OutreachKanban({ ideas }: { ideas: Idea[] }) {
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

  // Show columns that have items or are key stages
  const visibleCols = PIPELINE_COLS.filter(
    (col) =>
      (groups[col.key]?.length || 0) > 0 ||
      ["pending", "ready", "contacted", "interested"].includes(col.key)
  );

  // Stats
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
                <span className="text-muted-foreground font-normal">
                  {colIdeas.length}
                </span>
              </div>
              {colIdeas.length > 0 ? (
                colIdeas.map((idea) => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const d = (idea as any).source_data || {};
                  const name = [d.first_name, d.last_name]
                    .filter(Boolean)
                    .join(" ");
                  const emailBadge =
                    d.email_status === "verified"
                      ? "✅"
                      : d.email_status === "catch-all"
                      ? "⚠️"
                      : "";
                  return (
                    <div
                      key={idea.id}
                      className="p-2 border border-border rounded-md mb-1 bg-card cursor-pointer hover:border-rust transition-colors"
                      style={{ borderLeft: `3px solid ${col.color}` }}
                    >
                      <div className="font-bold text-xs">
                        {d.company_name || idea.title}
                      </div>
                      {name && (
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {name}
                        </div>
                      )}
                      {d.job_title && (
                        <div className="text-[10px] text-muted-foreground">
                          {d.job_title}
                        </div>
                      )}
                      <div className="flex gap-1 mt-1 items-center">
                        {d.email ? (
                          <span className="text-[9px]">📧{emailBadge}</span>
                        ) : (
                          <span className="text-[9px] text-destructive">
                            📧❌
                          </span>
                        )}
                        {d.linkedin_url && (
                          <span className="text-[9px]">💼</span>
                        )}
                        {d.seniority && (
                          <span className="text-[8px] px-1 py-0.5 rounded bg-rust/10 text-rust">
                            {d.seniority}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="py-3 text-center text-muted-foreground text-[11px] italic border border-dashed border-border rounded-md">
                  —
                </div>
              )}
            </div>
          );
        })}
      </div>
      {/* Summary stats */}
      <div className="flex gap-4 mt-3 px-3 py-2 bg-background rounded-md text-[11px]">
        <span>
          <strong>{total}</strong> contactos
        </span>
        <span>
          <strong>{contacted}</strong> contactados (
          {total > 0 ? Math.round((contacted / total) * 100) : 0}%)
        </span>
        <span>
          <strong>{replied}</strong> respondieron (
          {total > 0 ? Math.round((replied / total) * 100) : 0}%)
        </span>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Content Ideas list
// ---------------------------------------------------------------------------

function ContentIdeas({ ideas, taskId }: { ideas: Idea[]; taskId: string }) {
  return (
    <div className="space-y-1.5">
      {ideas.map((idea) => {
        const pieces = (idea.pieces || []).filter(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (p) => !(p as any).task_id || (p as any).task_id === taskId
        );
        return (
          <div
            key={idea.id}
            className="px-3.5 py-2.5 border border-border rounded-lg"
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[13px]">
                {idea.title}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {/* eslint-disable @typescript-eslint/no-explicit-any */}
                {[
                  (idea as any).source_data?.volume
                    ? `vol:${(idea as any).source_data.volume}`
                    : "",
                  (idea as any).source_data?.kd
                    ? `KD:${(idea as any).source_data.kd}`
                    : "",
                  idea.priority_score ? `⭐${idea.priority_score}` : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
                {/* eslint-enable @typescript-eslint/no-explicit-any */}
              </span>
            </div>
            {pieces.length > 0 && (
              <div className="flex gap-2 mt-1.5 flex-wrap">
                {pieces.map((p) => {
                  const statusIcon =
                    p.status === "published"
                      ? "✅"
                      : p.status === "in-progress"
                      ? "🔧"
                      : "⬜";
                  return (
                    <span
                      key={p.id}
                      className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md border border-border bg-background"
                    >
                      {statusIcon} {p.channel}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
