"use client";

import { type ReactNode, useState, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface SettingsSlideOverProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  files: Array<{ name: string; content: string }>;
  editable?: boolean;
  onSave?: (fileName: string, content: string) => Promise<void>;
  onDelete?: () => void;
  copyPathPrefix?: string;
  headerContent?: ReactNode;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function SettingsSlideOver({
  open,
  onClose,
  title,
  subtitle,
  files,
  editable = true,
  onSave,
  onDelete,
  copyPathPrefix,
  headerContent,
}: SettingsSlideOverProps) {
  const [activeFile, setActiveFile] = useState(files[0]?.name ?? "");
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");
  const [copyStatus, setCopyStatus] = useState("");

  // Reset state when opening with different content
  useEffect(() => {
    if (open && files.length > 0) {
      setActiveFile(files[0].name);
      setEditing(false);
      setCopyStatus("");
    }
  }, [open, files[0]?.name]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Body scroll lock
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const fileContent = files.find((f) => f.name === activeFile)?.content ?? "";

  const handleCopyPath = useCallback(() => {
    if (!copyPathPrefix) return;
    navigator.clipboard.writeText(`${copyPathPrefix}/${activeFile}`);
    setCopyStatus("📋 Copiado");
    setTimeout(() => setCopyStatus(""), 2000);
  }, [copyPathPrefix, activeFile]);

  const handleStartEdit = useCallback(() => {
    setEditContent(fileContent);
    setEditing(true);
    setSaveStatus("");
  }, [fileContent]);

  const handleSave = useCallback(async () => {
    if (!onSave) return;
    setSaving(true);
    setSaveStatus("");
    try {
      await onSave(activeFile, editContent);
      setSaveStatus("✅ Guardado");
      setEditing(false);
      setTimeout(() => setSaveStatus(""), 2000);
    } catch {
      setSaveStatus("❌ Error al guardar");
    } finally {
      setSaving(false);
    }
  }, [onSave, activeFile, editContent]);

  const handleCancelEdit = useCallback(() => {
    setEditing(false);
    setSaveStatus("");
  }, []);

  const btnClass = "inline-flex items-center gap-1.5 px-2.5 py-1 text-[13px] bg-transparent border border-[#E5E2DC] dark:border-[#313244] rounded-md cursor-pointer text-[#7A7A7A] dark:text-[#6c7086] hover:bg-[#E5E2DC] dark:hover:bg-[#313244] hover:text-[#1A1A1A] dark:hover:text-[#cdd6f4] transition-colors";

  if (!open) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className={cn(
          "fixed inset-0 bg-black/40 z-[500] transition-opacity duration-250",
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={cn(
          "fixed top-0 h-screen z-[501] bg-white dark:bg-[#1E1E2E] shadow-[-4px_0_24px_rgba(0,0,0,.15)] flex flex-col transition-[right,visibility] duration-300 ease-[cubic-bezier(.16,1,.3,1)]",
          "w-[75vw] max-sm:w-screen",
          !open && "invisible"
        )}
        style={{ right: open ? 0 : "-100vw" }}
      >
        {/* ── Header ─────────────────────────────────────────── */}
        <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-[#E5E2DC] dark:border-[#313244] bg-[#FAFAF8] dark:bg-[#181825] shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="bg-transparent border-none text-lg cursor-pointer text-[#7A7A7A] dark:text-[#6c7086] px-2 py-1 rounded-md hover:bg-[#E5E2DC] dark:hover:bg-[#313244] hover:text-[#1A1A1A] dark:hover:text-[#cdd6f4] transition-colors"
          >
            ✕
          </button>

          <div className="truncate">
            <span className="text-[13px] font-bold text-[#1A1A1A] dark:text-[#cdd6f4]">
              {title}
            </span>
            {subtitle && (
              <span className="text-[11px] text-muted-foreground ml-2">{subtitle}</span>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2">
            {(copyStatus || saveStatus) && (
              <span className="text-xs text-muted-foreground">{saveStatus || copyStatus}</span>
            )}

            {copyPathPrefix && (
              <button type="button" onClick={handleCopyPath} className={btnClass}>
                📋 Ruta
              </button>
            )}

            {editable && files.length > 0 && !editing && (
              <button
                type="button"
                onClick={handleStartEdit}
                className={btnClass}
              >
                ✏️ Editar
              </button>
            )}

            {onDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[13px] bg-transparent border border-red-300 dark:border-red-700 rounded-md cursor-pointer text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                🗑 Eliminar
              </button>
            )}
          </div>
        </div>

        {/* ── Body ────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Header content (badges, metadata grids, etc.) */}
          {!editing && headerContent}

          {/* File tabs */}
          {files.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {files.map((f) => (
                <button
                  key={f.name}
                  onClick={() => {
                    setActiveFile(f.name);
                    if (editing) {
                      // Switch file in edit mode: load new file content
                      setEditContent(files.find((ff) => ff.name === f.name)?.content ?? "");
                    }
                  }}
                  className={cn(
                    "px-2.5 py-1 text-[11px] rounded border border-ink font-medium transition-colors",
                    activeFile === f.name
                      ? "bg-rust text-white border-rust"
                      : "bg-card hover:bg-muted"
                  )}
                >
                  {f.name}
                </button>
              ))}
            </div>
          )}

          {editing ? (
            /* Editor mode — textarea + save/cancel */
            <div className="space-y-3">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full bg-background border-2 border-ink rounded-lg p-4 text-xs font-mono whitespace-pre-wrap resize-y min-h-[400px] max-h-[70vh] focus:outline-none focus:border-rust"
                spellCheck={false}
              />
              <div className="flex gap-2 items-center">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-1.5 bg-gradient-to-br from-rust to-[#D4734F] text-white border-2 border-ink rounded-md text-[13px] font-bold shadow-comic cursor-pointer hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? "⏳ Guardando..." : "💾 Guardar"}
                </button>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="px-4 py-1.5 border border-border rounded-md text-[13px] text-muted-foreground hover:text-foreground"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            /* View mode — markdown preview */
            fileContent && (
              <article className={cn(
                "prose prose-sm max-w-none dark:prose-invert",
                "prose-headings:font-heading prose-headings:text-rust prose-a:text-rust",
                "prose-table:border-collapse prose-th:border prose-th:border-border prose-th:px-3 prose-th:py-2 prose-th:bg-muted/30 prose-th:text-left prose-th:text-xs prose-th:font-bold",
                "prose-td:border prose-td:border-border prose-td:px-3 prose-td:py-2 prose-td:text-xs",
              )}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{fileContent}</ReactMarkdown>
              </article>
            )
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────── */}
        {!editing && copyPathPrefix && (
          <div className="flex items-center px-4 py-2 border-t border-[#E5E2DC] dark:border-[#313244] bg-[#FAFAF8] dark:bg-[#181825] text-[10px] text-muted-foreground shrink-0">
            <span className="truncate">{copyPathPrefix}/{activeFile}</span>
          </div>
        )}
      </div>
    </>
  );
}
