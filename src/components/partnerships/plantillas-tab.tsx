/**
 * Plantillas (SAN-80) — biblioteca de secuencias + briefs como assets estilo
 * Brand Brain (decisiones de diseño 2026-06-11):
 *
 *  - Cada línea con la fila de acciones de file-tree.tsx: ⬇️ Descargar (.md)
 *    · 📄 Abrir (doc renderizado en doc-slideover) · 💬 Chat con Sancho
 *    (ChatSidebar real, hilo de la plantilla, Rocinante) · 📋 Ir a tarea
 *    (la búsqueda Outreach que la instancia).
 *  - Click en la línea = editor (pasos con delay + variables {{handle}}/
 *    {{quality_score}}/{{precio}} insertables en el cursor).
 *  - La biblioteca guarda ORIGINALES; cada búsqueda instancia copias
 *    (chip "＋ asignar plantilla" en Encuentra / fila Plantillas del plan).
 */

"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useOpenChat } from "@/hooks/useChat";
import { buildOutreachTemplateThread } from "@/lib/chat-openers";
import { SlideOver } from "@/components/shared/slide-over";
import { DocSlideOver } from "@/components/shared/doc-slideover";
// Imports de LEAF modules client-safe (el index del paquete arrastra fs).
import type { PartnershipTemplate, TemplateStep } from "@/lib/partnerships/templates";
import type { DiscoverySearchRecord } from "@/lib/partnerships/discovery-types";
import { NarratorCaption, ToastViewport, useToast } from "./ui";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const text = await res.text();
  const payload = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : `Request failed (${res.status})`;
    throw new Error(message);
  }
  return payload as T;
}

const VARIABLES = ["{{handle}}", "{{quality_score}}", "{{precio}}"] as const;

interface EditorState {
  id: string | null; // null = nueva
  name: string;
  kind: "sequence" | "brief";
  type: "partnerships" | "b2b";
  description: string;
  steps: TemplateStep[];
}

function emptyEditor(): EditorState {
  return {
    id: null,
    name: "Nueva secuencia",
    kind: "sequence",
    type: "partnerships",
    description: "",
    steps: [{ title: "Paso 1", delayDays: 0, subject: "Asunto…", body: "Hola {{handle}}, …" }],
  };
}

export function PlantillasTab({ slug }: { slug: string }) {
  const router = useRouter();
  const openChat = useOpenChat();
  const queryClient = useQueryClient();
  const { toast, showToast } = useToast();

  const templatesKey = ["partnerships", slug, "templates"] as const;
  const templatesQuery = useQuery({
    queryKey: templatesKey,
    queryFn: () =>
      fetchJson<{ templates: PartnershipTemplate[] }>(
        `/api/partnerships/templates?slug=${encodeURIComponent(slug)}`,
      ),
    enabled: !!slug,
  });
  const searchesQuery = useQuery({
    queryKey: ["partnerships", slug, "searches"],
    queryFn: () =>
      fetchJson<{ searches: DiscoverySearchRecord[] }>(
        `/api/partnerships/searches?slug=${encodeURIComponent(slug)}`,
      ),
    enabled: !!slug,
  });

  const templates = useMemo(() => templatesQuery.data?.templates || [], [templatesQuery.data]);
  const searches = useMemo(() => searchesQuery.data?.searches || [], [searchesQuery.data]);

  const [editor, setEditor] = useState<EditorState | null>(null);
  const [docPath, setDocPath] = useState<string | null>(null);
  const lastTextarea = useRef<HTMLTextAreaElement | null>(null);

  const saveMutation = useMutation({
    mutationFn: (state: EditorState) => {
      const body = JSON.stringify({
        slug,
        name: state.name,
        kind: state.kind,
        type: state.type,
        description: state.description,
        steps: state.steps,
      });
      return state.id
        ? fetchJson(`/api/partnerships/templates/${encodeURIComponent(state.id)}?slug=${encodeURIComponent(slug)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body,
          })
        : fetchJson(`/api/partnerships/templates?slug=${encodeURIComponent(slug)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
          });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: templatesKey });
      setEditor(null);
      showToast("💾 Plantilla guardada — las búsquedas nuevas instanciarán esta versión");
    },
    onError: (error) => showToast(`⚠️ ${error instanceof Error ? error.message : "No se pudo guardar"}`, "warn"),
  });

  function openEditor(template: PartnershipTemplate) {
    lastTextarea.current = null;
    setEditor({
      id: template.id,
      name: template.name,
      kind: template.kind,
      type: template.type,
      description: template.description,
      steps: template.steps.map((step) => ({ ...step })),
    });
  }

  function gotoTask(template: PartnershipTemplate) {
    const owner = searches.find((search) =>
      (search.templates || []).some((instance) => instance.templateId === template.id),
    );
    if (!owner) {
      showToast("📋 Ninguna búsqueda instancia esta plantilla todavía — asígnala desde Encuentra", "warn");
      return;
    }
    showToast(`📋 Búsqueda que la instancia: «${owner.title}» — abriendo Encuentra…`);
    void router.push(
      { pathname: router.pathname, query: { slug } }, // tab=encuentra es el default
      undefined,
      { shallow: true },
    );
  }

  function insertVariable(variable: string) {
    const ta = lastTextarea.current;
    if (!ta || !editor) return;
    const index = Number(ta.dataset.step ?? -1);
    if (!Number.isInteger(index) || index < 0 || index >= editor.steps.length) return;
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? ta.value.length;
    const value = ta.value.slice(0, start) + variable + ta.value.slice(end);
    setEditor((prev) => {
      if (!prev) return prev;
      const steps = prev.steps.map((step, i) => (i === index ? { ...step, body: value } : step));
      return { ...prev, steps };
    });
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = start + variable.length;
    });
  }

  const sections: Array<{ key: "sequence" | "brief"; title: string; sub: string }> = [
    {
      key: "sequence",
      title: "✉️ Secuencias de contacto",
      sub: "Cadenas de emails con delays — cada búsqueda instancia su copia y el envío rellena las variables por creator.",
    },
    {
      key: "brief",
      title: "📝 Briefs de campaña",
      sub: "Documentos que se adjuntan al acuerdo: qué pieza, qué mensaje, qué líneas rojas.",
    },
  ];

  return (
    <div data-testid="plantillas-tab">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <NarratorCaption>
          Cada búsqueda instancia sus plantillas — aquí viven los originales…
        </NarratorCaption>
        <button
          type="button"
          onClick={() => {
            lastTextarea.current = null;
            setEditor(emptyEditor());
          }}
          className="rounded-md border-2 border-ink bg-rust px-4 py-2 text-sm font-bold text-white shadow-comic-sm transition-transform hover:-translate-y-0.5"
          data-testid="nueva-plantilla"
        >
          ＋ Nueva plantilla
        </button>
      </div>

      {templatesQuery.isLoading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Cargando biblioteca…</p>
      ) : templatesQuery.error ? (
        <div className="rounded-lg border-2 border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {String((templatesQuery.error as Error).message)}
        </div>
      ) : (
        sections.map((section) => {
          const rows = templates.filter((template) => template.kind === section.key);
          return (
            <section key={section.key} className="mb-8" data-testid={`tpl-section-${section.key}`}>
              <h2 className="font-heading text-xl tracking-wide text-ink">{section.title}</h2>
              <p className="mb-3 mt-0.5 text-xs text-muted-foreground">{section.sub}</p>
              <div className="overflow-hidden rounded-xl border-2 border-border bg-card shadow-comic-sm">
                {rows.length === 0 && (
                  <p className="px-5 py-6 text-center text-sm italic text-muted-foreground">
                    Nada por aquí — crea la primera con «＋ Nueva plantilla».
                  </p>
                )}
                {rows.map((template) => (
                  <div
                    key={template.id}
                    onClick={() => openEditor(template)}
                    data-template-id={template.id}
                    className={cn(
                      "group flex cursor-pointer items-center gap-3 border-b-2 border-dashed border-border px-4 py-3 transition-colors last:border-b-0 hover:bg-yellow-50",
                      template.type === "b2b" && "opacity-60 hover:opacity-90",
                    )}
                  >
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border-2 border-ink bg-background text-lg shadow-comic-sm" aria-hidden>
                      {template.kind === "sequence" ? "✉️" : "📝"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-bold text-ink">{template.name}</div>
                      <div className="truncate text-xs text-muted-foreground">{template.description}</div>
                    </div>
                    <span
                      className={cn(
                        "rounded-full border-2 border-ink px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide shadow-comic-sm",
                        template.type === "b2b" ? "bg-navy text-white" : "bg-sage text-white",
                      )}
                    >
                      {template.type === "b2b" ? "B2B" : "Partnerships"}
                    </span>
                    <span className="hidden w-28 shrink-0 text-right text-[11px] text-muted-foreground sm:block">
                      ✎{" "}
                      {template.updatedAt
                        ? new Date(template.updatedAt).toLocaleDateString("es-ES", { day: "2-digit", month: "short" })
                        : "—"}
                    </span>
                    {/* Fila de acciones estilo Brand Brain (file-tree.tsx) */}
                    <div
                      className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <a
                        href={`/api/docs/brand/${slug}/outreach/templates/${template.id}.md?download=1`}
                        download
                        title="Descargar .md"
                        className="grid h-8 w-8 place-items-center rounded-md border-2 border-border bg-card text-sm shadow-comic-sm transition-all hover:-translate-y-0.5 hover:border-ink hover:bg-yellow-100"
                        data-action="download"
                      >
                        ⬇️
                      </a>
                      <button
                        type="button"
                        title="Ver documento"
                        onClick={() => setDocPath(`brand/${slug}/outreach/templates/${template.id}.md`)}
                        className="grid h-8 w-8 place-items-center rounded-md border-2 border-border bg-card text-sm shadow-comic-sm transition-all hover:-translate-y-0.5 hover:border-ink hover:bg-yellow-100"
                        data-action="open-doc"
                      >
                        📄
                      </button>
                      <button
                        type="button"
                        title="Chat con Sancho sobre esta plantilla"
                        onClick={() => openChat(slug, buildOutreachTemplateThread(slug, template))}
                        className="grid h-8 w-8 place-items-center rounded-md border-2 border-border bg-card text-sm shadow-comic-sm transition-all hover:-translate-y-0.5 hover:border-ink hover:bg-yellow-100"
                        data-action="open-chat"
                      >
                        💬
                      </button>
                      <button
                        type="button"
                        title="Ir a la tarea/búsqueda que la instancia"
                        onClick={() => gotoTask(template)}
                        className="grid h-8 w-8 place-items-center rounded-md border-2 border-border bg-card text-sm shadow-comic-sm transition-all hover:-translate-y-0.5 hover:border-ink hover:bg-yellow-100"
                        data-action="goto-task"
                      >
                        📋
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })
      )}

      <p className="text-[11px] italic text-muted-foreground">
        * Las plantillas se comportan como los documentos de Brand Brain — ⬇️ descarga el .md ·
        📄 abre el documento renderizado · 💬 chat con Sancho (hilo de la plantilla) · 📋 va a la
        búsqueda que la instancia. Click en la línea abre el editor.
      </p>

      {/* ── Editor slideover ── */}
      <SlideOver
        open={!!editor}
        onClose={() => setEditor(null)}
        title={editor?.id ? (editor.kind === "brief" ? "✏️ Editar brief" : "✏️ Editar secuencia") : "✏️ Nueva plantilla"}
        width="w-[560px] max-w-[94vw]"
      >
        {editor && (
          <div className="space-y-4 p-1" data-testid="template-editor">
            <label className="block">
              <span className="text-xs font-bold text-muted-foreground">Nombre</span>
              <input
                value={editor.name}
                onChange={(e) => setEditor({ ...editor, name: e.target.value })}
                className="mt-1 w-full rounded-md border-2 border-border bg-background px-3 py-2 text-sm font-bold focus:border-ink focus:outline-none"
                data-testid="editor-name"
              />
            </label>
            <div className="flex flex-wrap gap-4">
              <label className="block">
                <span className="text-xs font-bold text-muted-foreground">Tipo de campaña</span>
                <select
                  value={editor.type}
                  onChange={(e) => setEditor({ ...editor, type: e.target.value === "b2b" ? "b2b" : "partnerships" })}
                  className="mt-1 rounded-md border-2 border-border bg-background px-3 py-2 text-sm font-bold focus:border-ink focus:outline-none"
                  data-testid="editor-type"
                >
                  <option value="partnerships">Partnerships</option>
                  <option value="b2b">B2B</option>
                </select>
              </label>
              {!editor.id && (
                <label className="block">
                  <span className="text-xs font-bold text-muted-foreground">Clase</span>
                  <select
                    value={editor.kind}
                    onChange={(e) => setEditor({ ...editor, kind: e.target.value === "brief" ? "brief" : "sequence" })}
                    className="mt-1 rounded-md border-2 border-border bg-background px-3 py-2 text-sm font-bold focus:border-ink focus:outline-none"
                  >
                    <option value="sequence">Secuencia</option>
                    <option value="brief">Brief</option>
                  </select>
                </label>
              )}
            </div>
            <label className="block">
              <span className="text-xs font-bold text-muted-foreground">Descripción (una línea)</span>
              <input
                value={editor.description}
                onChange={(e) => setEditor({ ...editor, description: e.target.value })}
                className="mt-1 w-full rounded-md border-2 border-border bg-background px-3 py-2 text-sm focus:border-ink focus:outline-none"
              />
            </label>

            <div>
              <span className="text-xs font-bold text-muted-foreground">Variables</span>
              <div className="mt-1 flex flex-wrap gap-2">
                {VARIABLES.map((variable) => (
                  <button
                    key={variable}
                    type="button"
                    onClick={() => insertVariable(variable)}
                    className="rounded-full border-2 border-ink bg-yellow-200 px-3 py-0.5 text-xs font-semibold text-ink shadow-comic-sm transition-transform hover:-translate-y-0.5"
                    data-variable={variable}
                  >
                    {variable}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[11px] italic text-muted-foreground">
                Click en un chip para insertarla donde esté el cursor del último paso editado.
              </p>
            </div>

            {editor.steps.map((step, index) => (
              <div key={index}>
                {index > 0 && (
                  <div className="mb-2 flex items-center gap-2 pl-3 text-xs text-muted-foreground">
                    <span className="w-7 border-b-2 border-dashed border-border" /> ⏱ espera
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={step.delayDays}
                      onChange={(e) => {
                        const delayDays = Math.max(1, parseInt(e.target.value, 10) || 1);
                        setEditor((prev) =>
                          prev
                            ? { ...prev, steps: prev.steps.map((s, i) => (i === index ? { ...s, delayDays } : s)) }
                            : prev,
                        );
                      }}
                      className="w-14 rounded-md border-2 border-border bg-background px-2 py-0.5 text-center text-sm font-bold focus:border-ink focus:outline-none"
                      data-testid={`step-delay-${index}`}
                    />
                    días <span className="flex-1 border-b-2 border-dashed border-border" />
                  </div>
                )}
                <div className="rounded-xl border-2 border-border bg-card p-3 shadow-comic-sm">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="grid h-6 w-6 place-items-center rounded-full border-2 border-ink bg-rust font-heading text-xs text-white shadow-comic-sm">
                      {index + 1}
                    </span>
                    <input
                      value={step.title}
                      onChange={(e) =>
                        setEditor((prev) =>
                          prev
                            ? { ...prev, steps: prev.steps.map((s, i) => (i === index ? { ...s, title: e.target.value } : s)) }
                            : prev,
                        )
                      }
                      className="w-32 rounded border border-border bg-background px-2 py-0.5 text-xs font-bold focus:border-ink focus:outline-none"
                      title="Título del paso"
                    />
                    {editor.kind === "sequence" && (
                      <input
                        value={step.subject ?? ""}
                        placeholder="Asunto…"
                        onChange={(e) =>
                          setEditor((prev) =>
                            prev
                              ? { ...prev, steps: prev.steps.map((s, i) => (i === index ? { ...s, subject: e.target.value } : s)) }
                              : prev,
                          )
                        }
                        className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-0.5 text-xs italic focus:border-ink focus:outline-none"
                        data-testid={`step-subject-${index}`}
                      />
                    )}
                    {editor.kind === "sequence" && editor.steps.length > 1 && (
                      <button
                        type="button"
                        title="Eliminar paso"
                        onClick={() =>
                          setEditor((prev) =>
                            prev ? { ...prev, steps: prev.steps.filter((_, i) => i !== index) } : prev,
                          )
                        }
                        className="grid h-6 w-6 place-items-center rounded-md border-2 border-border bg-card text-xs shadow-comic-sm transition-colors hover:border-destructive hover:bg-destructive hover:text-white"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <textarea
                    value={step.body}
                    data-step={index}
                    onFocus={(e) => {
                      lastTextarea.current = e.currentTarget;
                    }}
                    onChange={(e) =>
                      setEditor((prev) =>
                        prev
                          ? { ...prev, steps: prev.steps.map((s, i) => (i === index ? { ...s, body: e.target.value } : s)) }
                          : prev,
                      )
                    }
                    className="min-h-[110px] w-full resize-y rounded-md border-2 border-border bg-background px-3 py-2 text-sm leading-relaxed focus:border-ink focus:outline-none"
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
                    setEditor((prev) =>
                      prev
                        ? {
                            ...prev,
                            steps: [
                              ...prev.steps,
                              {
                                title: `Paso ${prev.steps.length + 1}`,
                                delayDays: 3,
                                subject: "Re: seguimiento",
                                body: "Hola {{handle}}, …",
                              },
                            ],
                          }
                        : prev,
                    )
                  }
                  className="rounded-md border-2 border-border bg-card px-3 py-1.5 text-sm font-bold shadow-comic-sm transition-transform hover:-translate-y-0.5 hover:border-ink"
                  data-testid="add-step"
                >
                  ＋ Añadir paso
                </button>
              )}
              <button
                type="button"
                disabled={saveMutation.isPending}
                onClick={() => saveMutation.mutate(editor)}
                className="rounded-md border-2 border-ink bg-rust px-4 py-1.5 text-sm font-bold text-white shadow-comic-sm transition-transform hover:-translate-y-0.5 disabled:opacity-50"
                data-testid="save-template"
              >
                {saveMutation.isPending ? "Guardando…" : "💾 Guardar"}
              </button>
            </div>
          </div>
        )}
      </SlideOver>

      {/* ── Doc renderizado (📄) ── */}
      {docPath && <DocSlideOver slug={slug} docPath={docPath} onClose={() => setDocPath(null)} />}

      <ToastViewport toast={toast} />
    </div>
  );
}
