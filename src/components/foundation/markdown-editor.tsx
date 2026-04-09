"use client";

import { useEffect, useRef, useState, useCallback } from "react";

/**
 * Markdown/WYSIWYG editor using Toast UI Editor.
 * Lazy-loaded to avoid SSR issues.
 */

interface MarkdownEditorProps {
  initialContent: string;
  onSave: (content: string) => Promise<void>;
  onCancel: () => void;
}

export function MarkdownEditor({ initialContent, onSave, onCancel }: MarkdownEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<unknown>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    let mounted = true;

    async function initEditor() {
      // Dynamic import to avoid SSR
      // @ts-expect-error — @toast-ui/editor types don't resolve via package.json exports
      const { default: Editor } = await import("@toast-ui/editor");
      // @ts-expect-error — CSS import has no type declarations
      await import("@toast-ui/editor/dist/toastui-editor.css");

      if (!mounted || !containerRef.current) return;

      const editor = new Editor({
        el: containerRef.current,
        initialEditType: "markdown",
        initialValue: initialContent,
        previewStyle: "vertical",
        height: "600px",
        usageStatistics: false,
        theme: "light",
        toolbarItems: [
          ["heading", "bold", "italic", "strike"],
          ["hr", "quote"],
          ["ul", "ol", "task"],
          ["table", "link"],
          ["code", "codeblock"],
        ],
      });

      editorRef.current = editor;

      // Force height on the editor UI element
      const editorEl = containerRef.current?.querySelector('.toastui-editor-defaultUI') as HTMLElement;
      if (editorEl) {
        editorEl.style.height = '600px';
      }
    }

    initEditor();

    return () => {
      mounted = false;
      if (editorRef.current) {
        try {
          (editorRef.current as { destroy: () => void }).destroy();
        } catch { /* ignore */ }
      }
    };
  }, [initialContent]);

  const handleSave = useCallback(async () => {
    if (!editorRef.current) return;
    setSaving(true);
    setStatus("");
    try {
      const md = (editorRef.current as { getMarkdown: () => string }).getMarkdown();
      await onSave(md);
      setStatus("Guardado");
      setTimeout(() => setStatus(""), 2000);
    } catch {
      setStatus("Error al guardar");
    } finally {
      setSaving(false);
    }
  }, [onSave]);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[#E5E2DC] dark:border-[#313244] bg-[#FAFAF8] dark:bg-[#181825] shrink-0">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-3 py-1.5 text-xs font-semibold rounded-md bg-rust text-white hover:opacity-90 disabled:opacity-50"
        >
          💾 Guardar
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-xs font-semibold rounded-md border border-[#E5E2DC] dark:border-[#313244] text-muted-foreground hover:bg-[#E5E2DC] dark:hover:bg-[#313244]"
        >
          ✖ Cancelar
        </button>
        {status && (
          <span className="text-xs text-muted-foreground ml-2">{status}</span>
        )}
      </div>

      {/* Editor container */}
      <div ref={containerRef} className="flex-1 min-h-0" />
    </div>
  );
}
