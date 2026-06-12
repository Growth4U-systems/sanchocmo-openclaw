/**
 * Plantillas (SAN-80) — biblioteca de secuencias + briefs como assets estilo
 * Brand Brain (decisiones de diseño 2026-06-11):
 *
 *  - Cada línea con la fila de acciones de file-tree.tsx: ⬇️ Descargar (.md)
 *    · 📄 Abrir (doc renderizado en doc-slideover) · 💬 Chat con Sancho
 *    (ChatSidebar real, hilo de la plantilla, Rocinante) · 📋 Ir a tarea
 *    (la búsqueda Outreach que la instancia).
 *  - Click en la línea = editor (pasos con delay + variables {{nombre}}/
 *    {{handle}}/{{plataforma}}/{{seguidores}}/{{sector}}/{{precio}} insertables
 *    en el cursor).
 *  - La biblioteca guarda ORIGINALES; cada búsqueda instancia copias
 *    (chip "＋ asignar plantilla" en Encuentra / fila Plantillas del plan).
 */

"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useOpenChat } from "@/hooks/useChat";
import { buildOutreachTemplateThread } from "@/lib/chat-openers";
import { SlideOver } from "@/components/shared/slide-over";
import { DocSlideOver } from "@/components/shared/doc-slideover";
import { TaskSlideOver } from "@/components/shared/task-slideover";
// Imports de LEAF modules client-safe (el index del paquete arrastra fs).
import type { PartnershipTemplate } from "@/lib/partnerships/templates";
import type { DiscoverySearchRecord } from "@/lib/partnerships/discovery-types";
import { SequenceEditor, type EditorState } from "./sequence-editor";
import { ToastViewport, useToast } from "./ui";

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
  const [taskId, setTaskId] = useState<string | null>(null);

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
    setEditor({
      id: template.id,
      name: template.name,
      kind: template.kind,
      type: template.type,
      description: template.description,
      steps: template.steps.map((step) => ({ ...step })),
    });
  }

  function taskIdForTemplate(template: PartnershipTemplate): string | null {
    const owner = searches.find((search) =>
      (search.templates || []).some((instance) => instance.templateId === template.id),
    );
    return owner?.taskId ?? null;
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
        <p className="m-0 text-sm text-muted-foreground">
          Cada búsqueda instancia sus plantillas — aquí viven los originales.
        </p>
        <button
          type="button"
          onClick={() => setEditor(emptyEditor())}
          className="rounded-lg border-2 border-rust bg-rust px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rust/90"
          data-testid="nueva-plantilla"
        >
          ＋ Nueva plantilla
        </button>
      </div>

      {templatesQuery.isLoading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Cargando biblioteca…</p>
      ) : templatesQuery.error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {String((templatesQuery.error as Error).message)}
        </div>
      ) : (
        sections.map((section) => {
          const rows = templates.filter((template) => template.kind === section.key);
          return (
            <section key={section.key} className="mb-8" data-testid={`tpl-section-${section.key}`}>
              <h2 className="text-sm font-semibold text-foreground">{section.title}</h2>
              <p className="mb-3 mt-0.5 text-xs text-muted-foreground">{section.sub}</p>
              <div className="overflow-hidden rounded-xl border border-border bg-card">
                {rows.length === 0 && (
                  <p className="px-5 py-6 text-center text-sm text-muted-foreground">
                    Nada por aquí — crea la primera con «＋ Nueva plantilla».
                  </p>
                )}
                {rows.map((template) => (
                  <div
                    key={template.id}
                    onClick={() => setDocPath(`brand/${slug}/outreach/templates/${template.id}.md`)}
                    data-template-id={template.id}
                    className={cn(
                      "group flex cursor-pointer items-center gap-3 border-b border-border/60 px-4 py-3 transition-colors last:border-b-0 hover:bg-muted/40",
                      template.type === "b2b" && "opacity-60 hover:opacity-90",
                    )}
                  >
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border bg-muted/40 text-lg" aria-hidden>
                      {template.kind === "sequence" ? "✉️" : "📝"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold text-foreground">{template.name}</div>
                      <div className="truncate text-xs text-muted-foreground">{template.description}</div>
                    </div>
                    <span
                      className={cn(
                        "rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                        template.type === "b2b"
                          ? "border-navy/40 bg-navy/10 text-navy"
                          : "border-sage/50 bg-sage/10 text-sage",
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
                        className="grid h-8 w-8 place-items-center rounded-md border border-border bg-transparent text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        data-action="download"
                      >
                        ⬇️
                      </a>
                      <button
                        type="button"
                        title="Chat con Sancho sobre esta plantilla"
                        onClick={() => openChat(slug, buildOutreachTemplateThread(slug, template))}
                        className="grid h-8 w-8 place-items-center rounded-md border border-border bg-transparent text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        data-action="open-chat"
                      >
                        💬
                      </button>
                      {(() => {
                        const ownerTaskId = taskIdForTemplate(template);
                        return (
                          <button
                            type="button"
                            title={ownerTaskId ? "Abrir la tarea de la búsqueda que la instancia" : "Aún ninguna búsqueda usa esta plantilla — asígnala desde Encuentra"}
                            disabled={!ownerTaskId}
                            onClick={() => ownerTaskId && setTaskId(ownerTaskId)}
                            className="grid h-8 w-8 place-items-center rounded-md border border-border bg-transparent text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
                            data-action="goto-task"
                          >
                            📋
                          </button>
                        );
                      })()}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })
      )}

      <p className="text-[11px] text-muted-foreground">
        * Las plantillas se comportan como los documentos de Brand Brain — clic en la línea abre el
        documento renderizado (y dentro, «✏️ Editar secuencia») · ⬇️ descarga el .md · 💬 chat con
        Sancho · 📋 abre la tarea de la búsqueda que la instancia.
      </p>

      {/* ── Editor slideover ── */}
      <SlideOver
        open={!!editor}
        onClose={() => setEditor(null)}
        title={editor?.id ? (editor.kind === "brief" ? "✏️ Editar brief" : "✏️ Editar secuencia") : "✏️ Nueva plantilla"}
        width="w-[560px] max-w-[94vw]"
      >
        {editor && (
          <SequenceEditor
            editor={editor}
            onChange={setEditor}
            onSave={() => saveMutation.mutate(editor)}
            saving={saveMutation.isPending}
          />
        )}
      </SlideOver>

      {/* ── Doc renderizado (clic en la línea) + «✏️ Editar secuencia» dentro ── */}
      {docPath && (() => {
        const openId = docPath.split("/").pop()?.replace(/\.md$/, "") ?? "";
        const tpl = templates.find((t) => t.id === openId) ?? null;
        return (
          <DocSlideOver
            slug={slug}
            docPath={docPath}
            onClose={() => setDocPath(null)}
            headerAction={
              tpl ? (
                <button
                  type="button"
                  onClick={() => { setDocPath(null); openEditor(tpl); }}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-transparent px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  data-action="edit-structured"
                >
                  ✏️ {tpl.kind === "brief" ? "Editar brief" : "Editar secuencia"}
                </button>
              ) : null
            }
          />
        );
      })()}

      {taskId && (
        <TaskSlideOver
          slug={slug}
          projectId={null}
          taskId={taskId}
          onClose={() => setTaskId(null)}
          onOpenDoc={(p) => { setTaskId(null); setDocPath(p); }}
        />
      )}

      <ToastViewport toast={toast} />
    </div>
  );
}
