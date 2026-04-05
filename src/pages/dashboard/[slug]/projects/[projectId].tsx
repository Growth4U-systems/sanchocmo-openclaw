import { useRouter } from "next/router";
import { useMemo, useCallback, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useProjects, useArchiveProject } from "@/hooks/useProjects";
import { useIdeas } from "@/hooks/useIdeas";
import { useOpenChat } from "@/hooks/useChat";
import { buildTaskThread, buildProjectThread } from "@/lib/chat-openers";
import { cn } from "@/lib/utils";
import type { Project, Task, Idea } from "@/types";

import { StatusPill } from "@/components/shared/status-pill";
import { TaskTypeBadge } from "@/components/shared/task-type-badge";
import { ChannelBadge } from "@/components/shared/channel-badge";
import { ProgressBar } from "@/components/shared/progress-bar";
import { CollapsibleSection } from "@/components/shared/collapsible-section";
import { EmptyState } from "@/components/shared/empty-state";
import { WorkEditor } from "@/components/projects/work-editor";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DONE_STATUSES = ["completed", "done", "discarded", "cancelled"];
function isDone(s: string) {
  return DONE_STATUSES.includes(s);
}

function getObjectiveText(obj: Project["objective"]): string {
  if (!obj) return "";
  if (typeof obj === "string") return obj;
  return obj.description || "";
}

function getMetricsHtml(obj: Project["objective"]): { metric: string; baseline: string; target: string; unit: string } | null {
  if (!obj || typeof obj === "string") return null;
  if (!obj.metric) return null;
  return {
    metric: obj.metric,
    baseline: String(obj.baseline ?? ""),
    target: String(obj.target ?? ""),
    unit: obj.unit || "",
  };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ProjectDetailPage() {
  const router = useRouter();
  const slug = (router.query.slug as string) || "";
  const projectId = (router.query.projectId as string) || "";
  const { data: allProjects, isLoading } = useProjects(slug || null);
  const archiveProject = useArchiveProject();
  const openChat = useOpenChat();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"task" | "project">("project");
  const [editorId, setEditorId] = useState<string | null>(null);

  // Find this project
  const pw = useMemo(() => {
    if (!allProjects) return null;
    return allProjects.find((p) => p.project.id === projectId) || null;
  }, [allProjects, projectId]);

  const project = pw?.project;
  const tasks = useMemo(() => pw?.tasks || [], [pw]);

  // Ideas (unassigned to tasks — for the "Idea Pool" section)
  const { data: ideasData } = useIdeas(slug || null, { project: projectId, unassigned: true });
  const unassignedIdeas: Idea[] = useMemo(() => {
    if (!ideasData || !slug) return [];
    return (ideasData[slug] || []).filter(
      (idea: Idea) => !idea.task_id && idea.project_ids?.includes(projectId)
    );
  }, [ideasData, slug, projectId]);

  // Computed
  const tasksDone = tasks.filter((t) => isDone(t.status)).length;
  const pct = tasks.length > 0 ? Math.round((tasksDone / tasks.length) * 100) : 0;
  const objectiveText = project ? getObjectiveText(project.objective) : "";
  const metrics = project ? getMetricsHtml(project.objective) : null;
  const strategyText = project ? (typeof project.strategy === "string" ? project.strategy : "") : "";
  const projectSkills = [...new Set(tasks.map((t) => t.skill).filter(Boolean))];

  // All docs across tasks
  const allDocs = useMemo(() => {
    return tasks.flatMap((t) =>
      (t.documents || []).map((d) => ({ ...d, taskId: t.id, taskName: t.name }))
    );
  }, [tasks]);

  // Docs grouped by task
  const docsByTask = useMemo(() => {
    const map: Record<string, { name: string; docs: typeof allDocs }> = {};
    for (const d of allDocs) {
      if (!map[d.taskId]) map[d.taskId] = { name: d.taskName, docs: [] };
      map[d.taskId].docs.push(d);
    }
    return map;
  }, [allDocs]);

  const handleChatProject = useCallback(() => {
    if (!slug || !project) return;
    const config = buildProjectThread(slug, project.id, project.name, {
      strategy: project.strategy,
      status: project.status,
    });
    openChat(slug, config);
  }, [slug, project, openChat]);

  const handleChatTask = useCallback(
    (t: Task) => {
      if (!slug || !project) return;
      const tType = t.type || t.batch_type || "execution";
      const config = buildTaskThread(slug, t.id, t.name, project.id, {
        taskSkill: t.skill,
        taskChannel: t.channel,
        taskStatus: t.status,
        taskType: tType,
        pillar: t.pillar,
      });
      openChat(slug, config);
    },
    [slug, project, openChat]
  );

  const handleArchive = useCallback(() => {
    if (!slug || !project) return;
    archiveProject.mutate(
      { slug, projectId: project.id },
      { onSuccess: () => router.push(`/dashboard/${slug}/projects`) }
    );
  }, [slug, project, archiveProject, router]);

  const openEditor = useCallback((mode: "task" | "project", id: string) => {
    setEditorMode(mode);
    setEditorId(id);
    setEditorOpen(true);
  }, []);

  // --- Loading / Not found ---
  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground">Cargando proyecto...</p>
        </div>
      </DashboardLayout>
    );
  }

  if (!project) {
    return (
      <DashboardLayout>
        <Head>
          <title>Proyecto no encontrado — Mission Control</title>
        </Head>
        <EmptyState icon="🔍" message="Proyecto no encontrado." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <Head>
        <title>
          {project.id} — {project.name} — Mission Control
        </title>
      </Head>

      {/* Back link */}
      <div className="mb-4">
        <Link
          href={`/dashboard/${slug}/projects`}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Todos los proyectos
        </Link>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
        <div>
          <div className="flex items-center gap-3 mb-1.5">
            <span className="font-heading font-bold text-rust text-lg">
              {project.id}
            </span>
            <h1 className="font-heading text-2xl text-foreground m-0">
              {project.name}
            </h1>
            <StatusPill status={project.status} size="md" />
            {project.blocked_by && (
              <span className="text-xs text-destructive">
                ⛔ Bloqueado por {project.blocked_by}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {project.phase !== undefined ? `Fase ${project.phase} · ` : ""}
            {strategyText ? `${strategyText} · ` : ""}
            Review: {project.review_date || "—"}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleChatProject}
            className="px-3.5 py-1.5 bg-card border border-border rounded-lg cursor-pointer text-[13px] hover:border-rust transition-colors"
          >
            💬 Chat
          </button>
          <button
            onClick={() => openEditor("project", project.id)}
            className="px-3.5 py-1.5 bg-card border border-border rounded-lg cursor-pointer text-[13px] hover:border-rust transition-colors"
          >
            ✏️ Editar
          </button>
          {project.status !== "archived" && project.status !== "cancelled" && (
            <button
              onClick={handleArchive}
              disabled={archiveProject.isPending}
              className="px-3.5 py-1.5 bg-card border border-border rounded-lg cursor-pointer text-[13px] hover:border-rust transition-colors disabled:opacity-50"
            >
              📦 Archivar
            </button>
          )}
        </div>
      </div>

      {/* Description */}
      {project.description && (
        <p className="text-[15px] leading-relaxed mb-4">{project.description}</p>
      )}

      {/* Objective */}
      {objectiveText && (
        <div className="text-sm mb-2 px-3.5 py-2.5 bg-rust/8 rounded-lg">
          <strong>🎯 Objetivo:</strong> {objectiveText}
        </div>
      )}

      {/* Approach */}
      {project.approach && (
        <div className="text-sm mb-2 px-3.5 py-2.5 bg-navy/8 rounded-lg">
          <strong>📋 Enfoque:</strong> {project.approach}
        </div>
      )}

      {/* Metrics */}
      {metrics && (
        <div className="text-sm mb-3 px-3.5 py-2.5 bg-sage/10 rounded-lg">
          <strong>{metrics.metric}</strong>: {metrics.baseline}
          {metrics.unit} → {metrics.target}
          {metrics.unit}
        </div>
      )}

      {/* Skills */}
      {projectSkills.length > 0 && (
        <div className="flex gap-1.5 flex-wrap mb-3">
          {projectSkills.map((s) => (
            <span
              key={s}
              className="text-[11px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-600"
            >
              {s}
            </span>
          ))}
        </div>
      )}

      {/* Progress bar */}
      <div className="flex items-center gap-3 mb-5">
        <div className="flex-1">
          <ProgressBar value={pct} height="md" />
        </div>
        <span className="text-sm font-semibold text-muted-foreground">
          {tasksDone}/{tasks.length} tareas ({pct}%)
        </span>
      </div>

      {/* Tasks section */}
      <div className="font-heading text-base font-semibold text-navy mb-3">
        Tareas
      </div>
      {tasks.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground text-sm">
          Sin tareas.
        </div>
      ) : (
        <div className="space-y-1.5 mb-6">
          {tasks.map((t) => {
            const tDone = isDone(t.status);
            const tType = t.type || t.batch_type || "execution";
            const isFnd = tType === "foundation" && !!t.pillar;
            const docCount = (t.documents || []).length;
            const ideaCount = (t.idea_ids || []).length;

            return (
              <Link
                key={t.id}
                href={`/dashboard/${slug}/projects/${project.id}/tasks/${t.id}`}
                className={cn(
                  "block border-[3px] border-ink rounded-lg shadow-comic bg-card px-4 py-2.5 cursor-pointer hover:bg-muted/20 transition-colors",
                  tDone && "opacity-60"
                )}
              >
                <div className="flex items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
                    <StatusPill status={t.status} />
                    <span
                      className={cn(
                        "font-semibold text-sm",
                        tDone && "line-through"
                      )}
                    >
                      {t.name}
                    </span>
                    <TaskTypeBadge type={tType} />
                    {t.skill && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/12 text-blue-600 font-medium">
                        {t.skill}
                      </span>
                    )}
                    {docCount > 0 && (
                      <span className="text-[10px] text-muted-foreground">
                        📄{docCount}
                      </span>
                    )}
                    {ideaCount > 0 && (
                      <span className="text-[10px] text-muted-foreground">
                        💡{ideaCount}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-1.5 items-center shrink-0">
                    {t.channel && <ChannelBadge channel={t.channel} />}
                    {t.owner && t.owner !== "Sancho" && (
                      <span className="text-[10px] bg-blue-500/12 text-blue-600 px-2 py-0.5 rounded">
                        👤 {t.owner}
                      </span>
                    )}
                    <span className="font-heading text-[11px] text-muted-foreground">
                      {t.id}
                    </span>
                    <button
                      className="bg-transparent border-none cursor-pointer text-[13px] opacity-50 hover:opacity-100"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleChatTask(t);
                      }}
                    >
                      💬
                    </button>
                    {!isFnd && (
                      <button
                        className="bg-transparent border-none cursor-pointer text-[13px] opacity-50 hover:opacity-100"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          openEditor("task", t.id);
                        }}
                      >
                        ✏️
                      </button>
                    )}
                    <span className="text-sm text-muted-foreground">→</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Documents section */}
      {allDocs.length > 0 && (
        <div className="border-t-2 border-border pt-5 mt-6">
          <div className="font-heading text-base font-semibold text-navy mb-3">
            📄 Documentos del proyecto ({allDocs.length})
          </div>
          {Object.entries(docsByTask).map(([tid, group]) => (
            <div key={tid} className="mb-3">
              <div className="text-xs font-semibold text-muted-foreground mb-1.5">
                {tid} — {group.name}
              </div>
              <div className="flex flex-wrap gap-2">
                {group.docs.map((doc, i) => {
                  const docName =
                    doc.title || doc.name || doc.path.split("/").pop()?.replace(".md", "") || "doc";
                  const isImage = /\.(png|jpe?g|webp|gif|svg)$/i.test(doc.path);
                  const icon = doc.path.endsWith(".pdf") ? "📑" : "📄";

                  if (isImage) {
                    return (
                      <div
                        key={i}
                        className="border border-border rounded-lg overflow-hidden cursor-pointer hover:border-rust transition-colors"
                      >
                        <img
                          src={`/docs/${doc.path}`}
                          alt={docName}
                          className="max-h-[100px] max-w-[160px] block"
                        />
                        <div className="px-1.5 py-1 text-[10px] text-muted-foreground bg-background">
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
                      className="flex items-center gap-1.5 px-2.5 py-1.5 border border-border rounded-md text-xs text-foreground hover:border-rust transition-colors no-underline"
                    >
                      <span>{icon}</span>
                      <span>{docName}</span>
                    </a>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Idea Pool — unassigned ideas */}
      {unassignedIdeas.length > 0 && (
        <div className="mt-6">
          <CollapsibleSection
            title="💡 Idea Pool"
            icon="💡"
            count={unassignedIdeas.length}
            defaultOpen={false}
          >
            <div className="space-y-1.5">
              {unassignedIdeas.map((idea) => (
                <div
                  key={idea.id}
                  className="px-3 py-2 border border-border rounded-lg text-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{idea.title}</span>
                    {idea.priority_score > 0 && (
                      <span className="text-[11px] text-muted-foreground">
                        ⭐{idea.priority_score}
                      </span>
                    )}
                  </div>
                  {idea.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                      {idea.description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CollapsibleSection>
        </div>
      )}

      {/* Work Editor SlideOver */}
      <WorkEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        mode={editorMode}
        editId={editorId}
        slug={slug}
        projects={allProjects || []}
      />
    </DashboardLayout>
  );
}
