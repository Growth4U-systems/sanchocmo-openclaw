"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useProjects } from "@/hooks/useProjects";

interface TaskSlideOverProps {
  slug: string;
  projectId: string | null;
  taskId: string | null;
  onClose: () => void;
  onOpenDoc?: (docPath: string) => void;
  onOpenChat?: () => void;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  completed: { bg: "bg-green-50", text: "text-green-700", label: "Completado" },
  "in-progress": { bg: "bg-blue-50", text: "text-blue-700", label: "En progreso" },
  todo: { bg: "bg-gray-50", text: "text-gray-500", label: "Pendiente" },
  blocked: { bg: "bg-red-50", text: "text-red-600", label: "Bloqueado" },
  cancelled: { bg: "bg-gray-50", text: "text-gray-400", label: "Cancelado" },
};

export function TaskSlideOver({ slug, projectId, taskId, onClose, onOpenDoc, onOpenChat }: TaskSlideOverProps) {
  const router = useRouter();
  const { data: projectsData } = useProjects(slug || null);
  const isOpen = !!taskId && !!projectId;

  // Find the task from projectsData
  const { task, project } = useMemo(() => {
    if (!projectsData || !projectId || !taskId) return { task: null, project: null };
    for (const pw of projectsData) {
      if (pw.project.id === projectId) {
        const t = pw.tasks.find((t) => t.id === taskId);
        if (t) return { task: t, project: pw.project };
      }
    }
    // Fallback: search all projects
    for (const pw of projectsData) {
      const t = pw.tasks.find((t) => t.id === taskId);
      if (t) return { task: t, project: pw.project };
    }
    return { task: null, project: null };
  }, [projectsData, projectId, taskId]);

  const st = task ? (STATUS_STYLES[task.status] || STATUS_STYLES.todo) : STATUS_STYLES.todo;

  // Body scroll lock
  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  const deliverableFile = task?.deliverable_file;
  const dfStr = typeof deliverableFile === "string" ? deliverableFile : Array.isArray(deliverableFile) ? deliverableFile[0] : null;
  const filename = dfStr ? dfStr.split("/").pop() || dfStr : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const attachments = (task as any)?.attachments as { path: string; type?: string; label?: string; source?: string }[] | undefined;

  const btnClass = "inline-flex items-center gap-1.5 px-2.5 py-1 text-[12px] bg-transparent border border-[#E5E2DC] dark:border-[#313244] rounded-md cursor-pointer text-[#7A7A7A] dark:text-[#6c7086] hover:bg-[#E5E2DC] dark:hover:bg-[#313244] hover:text-[#1A1A1A] dark:hover:text-[#cdd6f4] transition-colors";

  return (
    <>
      {/* Overlay */}
      <div
        className={cn(
          "fixed inset-0 bg-black/40 z-[500] transition-opacity duration-250",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={cn(
          "fixed top-0 h-screen z-[501] bg-white dark:bg-[#1E1E2E] shadow-[-4px_0_24px_rgba(0,0,0,.15)] flex flex-col transition-[right,visibility] duration-300 ease-[cubic-bezier(.16,1,.3,1)]",
          "w-[600px] max-w-[90vw]",
          !isOpen && "invisible"
        )}
        style={{ right: isOpen ? 0 : "-100vw" }}
      >
        {/* Header */}
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[#E5E2DC] dark:border-[#313244] bg-[#FAFAF8] dark:bg-[#181825] shrink-0">
          <button type="button" onClick={onClose} className="text-lg text-[#7A7A7A] hover:text-[#1A1A1A] px-2 py-1 rounded-md hover:bg-[#E5E2DC] transition-colors">
            ✕
          </button>
          <span className="text-[10px] font-mono text-muted-foreground bg-muted/40 px-2 py-0.5 rounded">
            {taskId}
          </span>
          <span className="text-sm font-bold text-[#1A1A1A] dark:text-[#cdd6f4] truncate flex-1">
            {task?.name || taskId}
          </span>
          <span className={cn("text-[10px] font-semibold px-2.5 py-1 rounded-full", st.bg, st.text)}>
            {st.label}
          </span>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {!task ? (
            <p className="text-sm text-muted-foreground text-center py-10">Cargando tarea...</p>
          ) : (
            <>
              {/* Description */}
              {task.description && (
                <div>
                  <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Descripcion</h3>
                  <p className="text-sm text-[#2C3E50] leading-relaxed">{task.description}</p>
                </div>
              )}

              {/* Info grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#FAFAF8] rounded-lg p-3 border border-[#E8E2D9]">
                  <p className="text-[9px] text-muted-foreground uppercase font-semibold mb-0.5">Tipo</p>
                  <p className="text-xs text-[#2C3E50] font-medium capitalize">{task.type || "—"}</p>
                </div>
                <div className="bg-[#FAFAF8] rounded-lg p-3 border border-[#E8E2D9]">
                  <p className="text-[9px] text-muted-foreground uppercase font-semibold mb-0.5">Skill</p>
                  <p className="text-xs font-medium">
                    <span className="bg-rust/10 text-rust px-2 py-0.5 rounded-full text-[10px]">{task.skill || "—"}</span>
                  </p>
                </div>
                <div className="bg-[#FAFAF8] rounded-lg p-3 border border-[#E8E2D9]">
                  <p className="text-[9px] text-muted-foreground uppercase font-semibold mb-0.5">Owner</p>
                  <p className="text-xs text-[#2C3E50] font-medium">{task.owner || "—"}</p>
                </div>
                <div className="bg-[#FAFAF8] rounded-lg p-3 border border-[#E8E2D9]">
                  <p className="text-[9px] text-muted-foreground uppercase font-semibold mb-0.5">Proyecto</p>
                  <Link href={`/dashboard/${slug}/projects/${project?.id}`} className="text-xs text-rust hover:underline no-underline font-medium">
                    📁 {project?.id} — {project?.name}
                  </Link>
                </div>
              </div>

              {/* Pillar */}
              {task.pillar && (
                <div className="bg-[#FAFAF8] rounded-lg p-3 border border-[#E8E2D9]">
                  <p className="text-[9px] text-muted-foreground uppercase font-semibold mb-0.5">Pillar</p>
                  <p className="text-xs text-[#2C3E50] font-medium">{task.pillar}</p>
                </div>
              )}

              {/* Deliverable / Criteria */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {task.deliverable && (
                  <div className="bg-[#FAFAF8] rounded-lg p-3 border border-[#E8E2D9] border-l-4 border-l-green-400">
                    <p className="text-[9px] text-muted-foreground uppercase font-semibold mb-0.5">📦 Entregable</p>
                    <p className="text-xs text-[#2C3E50] leading-relaxed">{task.deliverable}</p>
                  </div>
                )}
                {task.done_criteria && (
                  <div className="bg-[#FAFAF8] rounded-lg p-3 border border-[#E8E2D9] border-l-4 border-l-blue-400">
                    <p className="text-[9px] text-muted-foreground uppercase font-semibold mb-0.5">✓ Criterio de completado</p>
                    <p className="text-xs text-[#2C3E50] leading-relaxed">{task.done_criteria}</p>
                  </div>
                )}
              </div>

              {/* Documents */}
              <div>
                <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Documentos</h3>
                <div className="space-y-1.5">
                  {dfStr && (
                    <button
                      type="button"
                      onClick={() => onOpenDoc?.(dfStr)}
                      className="w-full text-left bg-white border border-[#E8E2D9] rounded-lg px-3 py-2 flex items-center gap-2 hover:border-rust/40 transition-colors"
                    >
                      <span>📄</span>
                      <span className="text-xs text-[#2C3E50] font-medium truncate flex-1">{filename}</span>
                      <span className="text-[10px] text-muted-foreground">Abrir ↗</span>
                    </button>
                  )}
                  {attachments && attachments.length > 0 && attachments.map((att, i) => {
                    if (att.path === dfStr) return null; // Skip primary doc (already shown)
                    const attName = att.path.split("/").pop() || att.path;
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => onOpenDoc?.(att.path)}
                        className="w-full text-left bg-white border border-[#E8E2D9] rounded-lg px-3 py-2 flex items-center gap-2 hover:border-rust/40 transition-colors"
                      >
                        <span>📎</span>
                        <span className="text-xs text-[#2C3E50] truncate flex-1">{att.label || attName}</span>
                        {att.source && <span className="text-[9px] text-muted-foreground">{att.source}</span>}
                      </button>
                    );
                  })}
                  {!dfStr && (!attachments || attachments.length === 0) && (
                    <p className="text-xs text-muted-foreground italic py-2">Sin documentos asociados</p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-[#E5E2DC] dark:border-[#313244] bg-[#FAFAF8] dark:bg-[#181825] shrink-0 flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              // Navigate to task page + open chat (no doc slide-over)
              if (projectId && taskId && onOpenChat) onOpenChat();
              onClose();
              if (projectId && taskId) router.push(`/dashboard/${slug}/projects/${projectId}/tasks/${taskId}`);
            }}
            className={btnClass}
          >
            ⤢ Abrir tarea
          </button>
          {onOpenChat && (
            <button type="button" onClick={() => { onClose(); onOpenChat(); }} className={btnClass}>
              💬 Chat
            </button>
          )}
        </div>
      </div>
    </>
  );
}
