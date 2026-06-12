"use client";

import { useRef } from "react";
import { TEMPLATE_VARIABLES } from "@/lib/partnerships/templates";
import type { TemplateStep } from "@/lib/partnerships/templates";

export interface EditorState {
  id: string | null; // null = nueva
  name: string;
  kind: "sequence" | "brief";
  type: "partnerships" | "b2b";
  description: string;
  steps: TemplateStep[];
}

export interface SequenceEditorProps {
  editor: EditorState;
  onChange: (next: EditorState) => void;
  onSave: () => void;
  saving: boolean;
}

export function SequenceEditor({ editor, onChange, onSave, saving }: SequenceEditorProps) {
  const lastTextarea = useRef<HTMLTextAreaElement | null>(null);

  function patchStep(index: number, patch: Partial<TemplateStep>) {
    onChange({ ...editor, steps: editor.steps.map((s, i) => (i === index ? { ...s, ...patch } : s)) });
  }

  function applyToBody(transform: (value: string, start: number, end: number) => { value: string; caret: number }) {
    const ta = lastTextarea.current;
    if (!ta) return;
    const index = Number(ta.dataset.step ?? -1);
    if (!Number.isInteger(index) || index < 0 || index >= editor.steps.length) return;
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? ta.value.length;
    const { value, caret } = transform(ta.value, start, end);
    patchStep(index, { body: value });
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = caret;
    });
  }

  function insertText(text: string) {
    applyToBody((value, start, end) => ({
      value: value.slice(0, start) + text + value.slice(end),
      caret: start + text.length,
    }));
  }

  function wrapSelection(token: string) {
    applyToBody((value, start, end) => {
      const sel = value.slice(start, end);
      const wrapped = `${token}${sel}${token}`;
      return { value: value.slice(0, start) + wrapped + value.slice(end), caret: start + token.length + sel.length + token.length };
    });
  }

  function insertVariable(variable: string) {
    insertText(variable);
  }

  return (
    <div className="space-y-4 p-1" data-testid="template-editor">
      <label className="block">
        <span className="text-xs font-semibold text-muted-foreground">Nombre</span>
        <input
          value={editor.name}
          onChange={(e) => onChange({ ...editor, name: e.target.value })}
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-semibold focus:border-rust focus:outline-none"
          data-testid="editor-name"
        />
      </label>
      <div className="flex flex-wrap gap-4">
        <label className="block">
          <span className="text-xs font-semibold text-muted-foreground">Tipo de campaña</span>
          <select
            value={editor.type}
            onChange={(e) => onChange({ ...editor, type: e.target.value === "b2b" ? "b2b" : "partnerships" })}
            className="mt-1 rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-rust focus:outline-none"
            data-testid="editor-type"
          >
            <option value="partnerships">Partnerships</option>
            <option value="b2b">B2B</option>
          </select>
        </label>
        {!editor.id && (
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">Clase</span>
            <select
              value={editor.kind}
              onChange={(e) => onChange({ ...editor, kind: e.target.value === "brief" ? "brief" : "sequence" })}
              className="mt-1 rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-rust focus:outline-none"
            >
              <option value="sequence">Secuencia</option>
              <option value="brief">Brief</option>
            </select>
          </label>
        )}
      </div>
      <label className="block">
        <span className="text-xs font-semibold text-muted-foreground">Descripción (una línea)</span>
        <input
          value={editor.description}
          onChange={(e) => onChange({ ...editor, description: e.target.value })}
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-rust focus:outline-none"
        />
      </label>

      <div>
        <span className="text-xs font-semibold text-muted-foreground">Variables</span>
        <div className="mt-1 flex flex-wrap gap-2">
          {TEMPLATE_VARIABLES.map((variable) => (
            <button
              key={variable}
              type="button"
              onClick={() => insertVariable(variable)}
              className="rounded-full border border-border bg-muted/50 px-3 py-0.5 text-xs font-medium transition-colors hover:bg-muted"
              data-variable={variable}
            >
              {variable}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Click en un chip para insertarla donde esté el cursor del último paso editado.
        </p>
      </div>

      {editor.steps.map((step, index) => (
        <div key={index}>
          {index > 0 && (
            <div className="mb-2 flex items-center gap-2 pl-3 text-xs text-muted-foreground">
              <span className="w-7 border-b border-dashed border-border" /> ⏱ espera
              <input
                type="number"
                min={1}
                max={30}
                value={step.delayDays}
                onChange={(e) => {
                  const delayDays = Math.max(1, parseInt(e.target.value, 10) || 1);
                  patchStep(index, { delayDays });
                }}
                className="w-14 rounded-md border border-border bg-background px-2 py-0.5 text-center text-sm focus:border-rust focus:outline-none"
                data-testid={`step-delay-${index}`}
              />
              días <span className="flex-1 border-b border-dashed border-border" />
            </div>
          )}
          <div className="rounded-xl border border-border bg-card p-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-rust font-heading text-xs text-white">
                {index + 1}
              </span>
              <input
                value={step.title}
                onChange={(e) => patchStep(index, { title: e.target.value })}
                className="w-32 rounded border border-border bg-background px-2 py-0.5 text-xs font-semibold focus:border-rust focus:outline-none"
                title="Título del paso"
              />
              {editor.kind === "sequence" && (
                <input
                  value={step.subject ?? ""}
                  placeholder="Asunto…"
                  onChange={(e) => patchStep(index, { subject: e.target.value })}
                  className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-0.5 text-xs focus:border-rust focus:outline-none"
                  data-testid={`step-subject-${index}`}
                />
              )}
              {editor.kind === "sequence" && editor.steps.length > 1 && (
                <button
                  type="button"
                  title="Eliminar paso"
                  onClick={() =>
                    onChange({ ...editor, steps: editor.steps.filter((_, i) => i !== index) })
                  }
                  className="grid h-6 w-6 place-items-center rounded-md border border-border bg-transparent text-xs text-muted-foreground transition-colors hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive"
                >
                  ✕
                </button>
              )}
            </div>
            <div className="mb-1 flex gap-1">
              <button type="button" title="Negrita" onClick={() => wrapSelection("**")} className="grid h-6 w-6 place-items-center rounded border border-border bg-muted/40 text-xs font-bold hover:bg-muted">B</button>
              <button type="button" title="Cursiva" onClick={() => wrapSelection("*")} className="grid h-6 w-6 place-items-center rounded border border-border bg-muted/40 text-xs italic hover:bg-muted">i</button>
              <button type="button" title="Enlace" onClick={() => insertText("[texto](https://)")} className="grid h-6 w-6 place-items-center rounded border border-border bg-muted/40 text-xs hover:bg-muted">🔗</button>
              <button type="button" title="Lista" onClick={() => insertText("\n- ")} className="grid h-6 w-6 place-items-center rounded border border-border bg-muted/40 text-xs hover:bg-muted">•</button>
            </div>
            <textarea
              value={step.body}
              data-step={index}
              onFocus={(e) => {
                lastTextarea.current = e.currentTarget;
              }}
              onChange={(e) => patchStep(index, { body: e.target.value })}
              className="min-h-[110px] w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed focus:border-rust focus:outline-none"
              data-testid={`step-body-${index}`}
            />
          </div>
        </div>
      ))}

      <div className="flex flex-wrap gap-3 pt-1">
        {editor.kind === "sequence" && (
          <button
            type="button"
            onClick={() =>
              onChange({
                ...editor,
                steps: [
                  ...editor.steps,
                  {
                    title: `Paso ${editor.steps.length + 1}`,
                    delayDays: 3,
                    subject: "Re: seguimiento",
                    body: "Hola {{handle}}, …",
                  },
                ],
              })
            }
            className="rounded-lg border-2 border-border bg-background px-3 py-1.5 text-sm font-semibold transition-colors hover:bg-muted"
            data-testid="add-step"
          >
            ＋ Añadir paso
          </button>
        )}
        <button
          type="button"
          disabled={saving}
          onClick={onSave}
          className="rounded-lg border-2 border-rust bg-rust px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-rust/90 disabled:opacity-50"
          data-testid="save-template"
        >
          {saving ? "Guardando…" : "💾 Guardar"}
        </button>
      </div>
    </div>
  );
}
