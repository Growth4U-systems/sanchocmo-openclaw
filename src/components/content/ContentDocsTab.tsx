"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/router";
import { cn } from "@/lib/utils";
import { DocSlideOver } from "@/components/shared/doc-slideover";
import { useOpenChat } from "@/hooks/useChat";
import { useProjects } from "@/hooks/useProjects";
import { findTaskThreadForDoc, buildTaskThread } from "@/lib/chat-openers";

interface DocItem {
  path: string;
  name: string;
  description: string;
  status: string;
  lastModified?: string;
  section: string;
  taskId?: string;
}

interface Props {
  slug: string;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  "in-progress": { bg: "bg-blue-50", text: "text-blue-700", label: "En progreso" },
  "completed": { bg: "bg-green-50", text: "text-green-700", label: "Completado" },
  "todo": { bg: "bg-gray-50", text: "text-gray-500", label: "Pendiente" },
  "active": { bg: "bg-green-50", text: "text-green-700", label: "Activo" },
};

export function ContentDocsTab({ slug }: Props) {
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [openDocPath, setOpenDocPath] = useState<string | null>(null);
  const openChat = useOpenChat();
  const { data: projectsData } = useProjects(slug || null);
  const router = useRouter();

  const handleOpenChat = useCallback((doc: DocItem) => {
    if (!slug) return;
    // Try task thread convergence first
    const taskThread = findTaskThreadForDoc(slug, doc.path, projectsData);
    if (taskThread) { openChat(slug, taskThread); return; }
    // Fallback: open chat for the task if we have a taskId
    if (doc.taskId) {
      const config = buildTaskThread(slug, doc.taskId, doc.name, "P14", {
        taskSkill: undefined,
        taskStatus: doc.status,
      });
      openChat(slug, config);
    }
  }, [slug, projectsData, openChat]);

  const handleOpenFull = useCallback((doc: DocItem) => {
    if (!slug) return;
    // Open in foundation doc viewer with chat pre-opened
    handleOpenChat(doc);
    const docPath = doc.path.startsWith("brand/") ? doc.path : `brand/${slug}/${doc.path}`;
    router.push(`/dashboard/${slug}/brand-brain?doc=${encodeURIComponent(docPath)}`);
  }, [slug, router, handleOpenChat]);

  useEffect(() => {
    if (!slug) return;
    Promise.all([
      // Fetch tasks from P14
      fetch(`/api/projects?slug=${slug}`).then((r) => r.json()).catch(() => ({ projects: [] })),
      // Fetch pillars
      fetch(`/api/content-engine/pillars?slug=${slug}`).then((r) => r.json()).catch(() => ({ exists: false })),
    ]).then(([projData, pillarsData]) => {
      const items: DocItem[] = [];

      // Find the Content Engine SETUP project (P14) — strategy/pillars/setup/POV docs.
      // Match by id === "P14" first (most specific). Falling back to a generic "Content Engine"
      // .includes match would also catch weekly content projects like "Content Engine - Semana 18"
      // which is NOT what this tab shows.
      const projects = projData.projects || [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ceProject = projects.find((p: any) => p.id === "P14")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        || projects.find((p: any) => p.name === "Content Engine");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tasks = (ceProject?.tasks || []) as any[];

      for (const task of tasks) {
        if (!task.deliverable_file) continue;
        const paths = Array.isArray(task.deliverable_file) ? task.deliverable_file : [task.deliverable_file];
        for (const path of paths) {
          if (typeof path !== "string" || path.length === 0) continue;
          items.push({
            path,
            name: task.name,
            description: task.description?.slice(0, 120) || "",
            status: task.status || "todo",
            taskId: task.id,
            section: task.phase <= 1 ? "setup" : task.niche ? "niche" : "setup",
          });
        }
      }

      // Check for messaging docs (Phase 3 niche docs)
      // These might exist even without tasks (e.g., migrated data)
      if (pillarsData.exists) {
        // Pillars doc is already covered by tasks, but verify
        const hasPillarsTask = items.some((i) => i.path.includes("content-pillars"));
        if (!hasPillarsTask) {
          items.push({
            path: `brand/${slug}/content/content-pillars.md`,
            name: "Content Pillars",
            description: `${pillarsData.pillars?.length || 0} pillars definidos`,
            status: "active",
            section: "setup",
          });
        }
      }

      // Fetch last modified for each doc
      Promise.all(
        items.map((item) =>
          fetch(`/api/docs/${item.path}`)
            .then((r) => r.json())
            .then((data) => ({ ...item, lastModified: data.lastModified || null }))
            .catch(() => item)
        )
      ).then((enriched) => {
        setDocs(enriched);
        setLoading(false);
      });
    });
  }, [slug]);

  const setupDocs = useMemo(() => docs.filter((d) => d.section === "setup"), [docs]);
  const nicheDocs = useMemo(() => docs.filter((d) => d.section === "niche"), [docs]);

  const completedCount = docs.filter((d) => d.status === "completed" || d.status === "active" || d.status === "in-progress").length;

  if (loading) return <p className="text-muted-foreground text-sm py-8 text-center">Cargando documentos...</p>;

  if (docs.length === 0) {
    return (
      <div className="text-center py-12">
        <span className="text-4xl mb-3 block">📄</span>
        <p className="text-sm text-muted-foreground mb-2">No hay documentos del Content Engine todavia</p>
        <p className="text-xs text-muted-foreground">Ejecuta el Proceso 1 (Content Strategy → Pillars → Setup) para generar los primeros documentos</p>
      </div>
    );
  }

  const renderDoc = (doc: DocItem) => {
    const st = STATUS_STYLES[doc.status] || STATUS_STYLES["todo"];
    const filename = doc.path.split("/").pop() || doc.path;
    return (
      <div
        key={doc.path}
        className="bg-white border border-[#E8E2D9] rounded-lg px-4 py-3 hover:border-rust/40 transition-colors"
        style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}
      >
        {/* Top row: name + status */}
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-semibold text-[#2C3E50] truncate flex-1">{doc.name}</span>
          <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0", st.bg, st.text)}>
            {st.label}
          </span>
        </div>
        {/* Meta row: filename + date */}
        <div className="text-[11px] text-muted-foreground mb-2">
          {filename}
          {doc.lastModified && (
            <> · {new Date(doc.lastModified).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}</>
          )}
        </div>
        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOpenDocPath(doc.path)}
            className="text-[11px] px-2.5 py-1 rounded-md border border-[#E5E2DC] text-[#7A7A7A] hover:bg-[#E5E2DC] hover:text-[#1A1A1A] transition-colors"
            title="Ver documento"
          >
            📄 Ver
          </button>
          <button
            type="button"
            onClick={() => handleOpenChat(doc)}
            className="text-[11px] px-2.5 py-1 rounded-md border border-[#E5E2DC] text-[#7A7A7A] hover:bg-[#E5E2DC] hover:text-[#1A1A1A] transition-colors"
            title="Abrir chat"
          >
            💬 Chat
          </button>
          {doc.taskId && (
            <a
              href={`/dashboard/${slug}/projects/P14/tasks/${doc.taskId}`}
              className="text-[11px] px-2.5 py-1 rounded-md border border-[#E5E2DC] text-[#7A7A7A] hover:bg-[#E5E2DC] hover:text-[#1A1A1A] transition-colors no-underline"
              title={`Ir a tarea ${doc.taskId}`}
            >
              📋 Tarea
            </a>
          )}
          <button
            type="button"
            onClick={() => handleOpenFull(doc)}
            className="text-[11px] px-2.5 py-1 rounded-md border border-[#E5E2DC] text-[#7A7A7A] hover:bg-[#E5E2DC] hover:text-[#1A1A1A] transition-colors"
            title="Abrir en vista completa"
          >
            ⤢ Abrir
          </button>
        </div>
      </div>
    );
  };

  return (
    <div>
      {/* Progress bar */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-xs text-muted-foreground font-medium">Progreso: {completedCount}/{docs.length}</span>
        <div className="flex-1 h-1.5 bg-muted/30 rounded-full overflow-hidden">
          <div
            className="h-full bg-rust rounded-full transition-all"
            style={{ width: `${docs.length ? (completedCount / docs.length) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Setup docs */}
      {setupDocs.length > 0 && (
        <div className="mb-6">
          <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Content Engine Setup</h3>
          <div className="space-y-2">
            {setupDocs.map(renderDoc)}
          </div>
        </div>
      )}

      {/* Niche docs */}
      {nicheDocs.length > 0 && (
        <div>
          <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Messaging Per Niche</h3>
          <div className="space-y-2">
            {nicheDocs.map(renderDoc)}
          </div>
        </div>
      )}

      {/* Doc SlideOver */}
      <DocSlideOver
        slug={slug}
        docPath={
          openDocPath
            ? openDocPath.startsWith("brand/")
              ? openDocPath
              : `brand/${slug}/${openDocPath}`
            : null
        }
        onClose={() => setOpenDocPath(null)}
      />
    </div>
  );
}
