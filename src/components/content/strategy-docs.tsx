/** Strategy documents panel for Content Creation page.
 *
 * Two modes (like Foundation):
 * 1. File Tree (default): depth bar, sections grouped by section field, doc rows
 * 2. Doc Viewer (when a doc is selected): inline markdown viewer with header bar
 *
 * When hasProject=false: marketing empty state with niche selector + CTA.
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { DepthBar } from "@/components/foundation/depth-bar";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/* ---------- Types ---------- */

interface StrategyDocItem {
  id: string;
  name: string;
  description: string;
  type: string | null;
  pillar: string | null;
  channel: string | null;
  niche: string | null;
  status: string;
  deliverable: string | null;
  output_files: string[];
  depends_on: string | null;
  owner: string | null;
  key: string;
  section: string;
  skill: string | null;
  docPath: string | null;
  children?: Array<{ name: string; status: string; docPath: string }>;
}

interface StrategyDocsProps {
  slug: string;
  hasProject: boolean;
  documents: StrategyDocItem[];
  niches: Array<{ slug: string; name: string }>;
  selectedNiche: string | null;
  onCreateProject: (nicheSlug: string) => void;
  onOpenChat: (docKey: string, docPath?: string) => void;
  onViewDoc: (docPath: string) => void;
}

/* ---------- Constants ---------- */

const SECTIONS = [
  { key: "strategy", icon: "\uD83C\uDFAF", label: "Estrategia" },
  { key: "channels", icon: "\uD83D\uDCE1", label: "Setup Canales" },
  { key: "planning", icon: "\uD83D\uDCC5", label: "Planificaci\u00F3n" },
  { key: "prerequisites", icon: "\u2699\uFE0F", label: "Prerequisitos" },
];

const STATUS_BADGE: Record<string, string> = {
  done: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border border-green-200 dark:border-green-800",
  review: "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-800",
  wip: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800",
  todo: "bg-muted/50 text-muted-foreground border border-border",
  blocked: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400 border border-red-200 dark:border-red-800",
};

/* ---------- Helpers ---------- */

function statusToCls(status: string): string {
  if (status === "approved" || status === "done") return "done";
  if (status === "pending-review") return "review";
  if (status === "in-progress") return "wip";
  if (status === "blocked") return "blocked";
  return "todo";
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    approved: "Aprobado",
    done: "Completado",
    "pending-review": "Pendiente revisi\u00F3n",
    "in-progress": "En progreso",
    "not-started": "No iniciado",
    blocked: "Bloqueado",
  };
  return labels[status] || status;
}

function isBlocked(doc: StrategyDocItem, allDocs: StrategyDocItem[]): boolean {
  if (!doc.depends_on) return false;
  const dep = allDocs.find((d) => d.key === doc.depends_on);
  if (!dep) return true;
  return !["approved", "done"].includes(dep.status);
}

/* ---------- Niche pill colors ---------- */

const NICHE_COLORS = [
  "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
  "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
];

function nicheColor(niche: string): string {
  let hash = 0;
  for (let i = 0; i < niche.length; i++) hash = (hash * 31 + niche.charCodeAt(i)) | 0;
  return NICHE_COLORS[Math.abs(hash) % NICHE_COLORS.length];
}

/* ---------- Selected doc state ---------- */

interface SelectedDoc {
  key: string;
  name: string;
  status: string;
  deliverable: string;
}

/* ---------- Doc Row (PillarRow-style) ---------- */

function DocRow({
  doc,
  blocked,
  dependsOnName,
  onSelectDoc,
  onOpenChat,
}: {
  doc: StrategyDocItem;
  blocked: boolean;
  dependsOnName: string | null;
  onSelectDoc: (doc: StrategyDocItem) => void;
  onOpenChat: (docKey: string, docPath?: string) => void;
}) {
  const effectiveStatus = blocked ? "blocked" : doc.status;
  const cls = statusToCls(effectiveStatus);
  const hasDoc = !!doc.deliverable && doc.status !== "not-started";

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-5 py-3 hover:bg-muted/20 transition-colors",
        blocked && "opacity-60",
      )}
    >
      <span className="w-[9px] ml-4 flex-shrink-0" />

      <span className="flex-1 text-sm font-medium text-foreground/80 flex items-center gap-2">
        {doc.name}
        {doc.niche && (
          <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full", nicheColor(doc.niche))}>
            {doc.niche}
          </span>
        )}
        {blocked && dependsOnName && (
          <span className="text-[10px] text-destructive font-normal">
            Bloqueado por: {dependsOnName}
          </span>
        )}
      </span>

      <span
        className={cn(
          "text-[11px] font-medium px-2.5 py-1 rounded-full hidden sm:inline-block",
          STATUS_BADGE[cls] || STATUS_BADGE.todo,
        )}
      >
        {statusLabel(effectiveStatus)}
      </span>

      <div className="flex items-center gap-1">
        {hasDoc && (
          <a
            href={`/api/docs/${doc.deliverable}?download=1`}
            download
            onClick={(e) => e.stopPropagation()}
            className="text-sm hover:scale-110 transition-transform p-1 rounded-md hover:bg-muted/40 no-underline"
            title="Descargar"
          >
            {"\u2B07\uFE0F"}
          </a>
        )}
        {hasDoc && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelectDoc(doc);
            }}
            className="text-sm hover:scale-110 transition-transform p-1 rounded-md hover:bg-muted/40"
            title="Ver documento"
          >
            {"\uD83D\uDCC4"}
          </button>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenChat(doc.key, doc.docPath ?? undefined);
          }}
          className="text-sm hover:scale-110 transition-transform p-1 rounded-md hover:bg-muted/40"
          title="Chat con Sancho"
        >
          {"\uD83D\uDCAC"}
        </button>
      </div>
    </div>
  );
}

/* ---------- Child doc row (indented) ---------- */

function ChildDocRow({
  child,
  parentKey,
  onSelectDoc,
  onOpenChat,
}: {
  child: { name: string; status: string; docPath: string };
  parentKey: string;
  onSelectDoc: (doc: SelectedDoc) => void;
  onOpenChat: (docKey: string, docPath?: string) => void;
}) {
  const cls = statusToCls(child.status);
  const hasDoc = !!child.docPath && child.status !== "not-started";

  return (
    <div className="flex items-center gap-3 px-5 py-3 pl-12 hover:bg-muted/20 transition-colors">
      <span className="flex-1 text-sm font-medium text-foreground/80">{child.name}</span>

      <span
        className={cn(
          "text-[11px] font-medium px-2.5 py-1 rounded-full hidden sm:inline-block",
          STATUS_BADGE[cls] || STATUS_BADGE.todo,
        )}
      >
        {statusLabel(child.status)}
      </span>

      <div className="flex items-center gap-1">
        {hasDoc && (
          <a
            href={`/api/docs/${child.docPath}?download=1`}
            download
            onClick={(e) => e.stopPropagation()}
            className="text-sm hover:scale-110 transition-transform p-1 rounded-md hover:bg-muted/40 no-underline"
            title="Descargar"
          >
            {"\u2B07\uFE0F"}
          </a>
        )}
        {hasDoc && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelectDoc({
                key: parentKey,
                name: child.name,
                status: child.status,
                deliverable: child.docPath,
              });
            }}
            className="text-sm hover:scale-110 transition-transform p-1 rounded-md hover:bg-muted/40"
            title="Ver documento"
          >
            {"\uD83D\uDCC4"}
          </button>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenChat(parentKey, child.docPath);
          }}
          className="text-sm hover:scale-110 transition-transform p-1 rounded-md hover:bg-muted/40"
          title="Chat con Sancho"
        >
          {"\uD83D\uDCAC"}
        </button>
      </div>
    </div>
  );
}

/* ================================================================
   Main Component
   ================================================================ */

export function StrategyDocs({
  slug,
  hasProject,
  documents,
  niches,
  selectedNiche,
  onCreateProject,
  onOpenChat,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onViewDoc,
}: StrategyDocsProps) {
  const [localNiche, setLocalNiche] = useState<string>(
    selectedNiche || niches[0]?.slug || "",
  );

  const [selectedDoc, setSelectedDoc] = useState<SelectedDoc | null>(null);
  const [docContent, setDocContent] = useState<string | null>(null);
  const [docLoading, setDocLoading] = useState(false);

  // Fetch doc content whenever selectedDoc changes
  useEffect(() => {
    if (!selectedDoc?.deliverable) {
      setDocContent(null);
      return;
    }
    setDocLoading(true);
    setDocContent(null);
    fetch(`/api/docs/${selectedDoc.deliverable}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && data.content) setDocContent(data.content);
      })
      .catch(() => {})
      .finally(() => setDocLoading(false));
  }, [selectedDoc?.deliverable]);

  const handleSelectDoc = useCallback((doc: StrategyDocItem) => {
    if (!doc.deliverable) return;
    setSelectedDoc({
      key: doc.key,
      name: doc.name,
      status: doc.status,
      deliverable: doc.deliverable,
    });
  }, []);

  const handleSelectChildDoc = useCallback((doc: SelectedDoc) => {
    setSelectedDoc(doc);
  }, []);

  const handleBack = useCallback(() => {
    setSelectedDoc(null);
  }, []);

  /* ============================================================
     hasProject = false  →  Empty state (marketing copy)
     ============================================================ */

  if (!hasProject) {
    return (
      <div className="max-w-2xl mx-auto py-10 space-y-8">
        {/* Hero */}
        <div className="text-center space-y-3">
          <h2 className="font-heading text-2xl text-navy">
            Tu maquina de contenido empieza aqui
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-lg mx-auto">
            El 95% de las empresas publican contenido sin estrategia: topics
            aleatorios, sin pilares claros, sin saber que funciona. Eso cambia hoy.
          </p>
        </div>

        {/* What you get */}
        <div className="rounded-xl border-[3px] border-ink bg-card p-6 shadow-comic-sm space-y-5">
          <h3 className="font-heading text-base text-navy">Que vas a conseguir</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              {
                icon: "\uD83C\uDFAF",
                title: "Content Strategy",
                desc: "14 decisiones basadas en datos: tu Content Tilt (donde eres la unica voz creible), tu Villano (el enemigo comun de tu audiencia), los Trigger Events que activan la compra, y 11 decisiones mas.",
              },
              {
                icon: "\uD83D\uDCD6",
                title: "Content Playbook",
                desc: "El cerebro de tu contenido: pilares, guia de escritura, 28 formulas de hooks, playbooks por plataforma (LinkedIn, IG, TikTok...), cadena de repurposing.",
              },
              {
                icon: "\uD83D\uDCE1",
                title: "Setup de Canales",
                desc: "Perfil optimizado en cada plataforma: headline que convierte, About que engancha, Featured section, bio \u2014 todo basado en datos de tu nicho.",
              },
              {
                icon: "\uD83D\uDCC5",
                title: "Calendario BOFU-first",
                desc: "Contenido bottom-funnel primero (vs-pages, case studies, alternatives) \u2014 lo que convierte. Luego thought leadership. No al reves.",
              },
            ].map((item) => (
              <div key={item.title} className="flex gap-3">
                <span className="text-2xl flex-shrink-0">{item.icon}</span>
                <div>
                  <p className="text-sm font-semibold text-navy">{item.title}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* How it works */}
        <div className="rounded-xl border-[3px] border-ink bg-card p-6 shadow-comic-sm space-y-4">
          <h3 className="font-heading text-base text-navy">Como funciona</h3>
          <div className="space-y-3">
            {[
              { step: "1", text: "Sancho analiza tu Foundation (ECPs, positioning, competencia) y toma 14 decisiones estrategicas" },
              { step: "2", text: "Genera el Content Playbook completo: pilares, hooks, playbooks por plataforma, guia de escritura" },
              { step: "3", text: "Configura tus perfiles en cada canal con datos reales de tu nicho" },
              { step: "4", text: "Investiga keywords por pilar y crea el calendario editorial BOFU-first" },
              { step: "5", text: "Activa los crons que generan ideas automaticamente (noticias, SERP gaps, competencia)" },
            ].map((s) => (
              <div key={s.step} className="flex gap-3 items-start">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-rust text-white text-xs font-bold flex items-center justify-center">
                  {s.step}
                </span>
                <p className="text-sm text-muted-foreground leading-relaxed">{s.text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Frameworks */}
        <div className="text-center">
          <p className="text-xs text-muted-foreground">
            Basado en frameworks de Elena Verna (Growth Loops), Joe Pulizzi (Content
            Tilt), Katelyn Bourgoin (Trigger Events), Rob Walling (BOFU-first),
            Ashley Faus (Content Playground), Amanda Natividad (Zero-Click) y mas.
          </p>
        </div>

        {/* CTA */}
        <div className="flex flex-col items-center gap-4 pt-2">
          {niches.length > 1 && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">Nicho:</span>
              <select
                value={localNiche}
                onChange={(e) => setLocalNiche(e.target.value)}
                className="rounded-lg border-2 border-border bg-card px-4 py-2 text-sm font-semibold"
              >
                {niches.map((n) => (
                  <option key={n.slug} value={n.slug}>{n.name}</option>
                ))}
              </select>
            </div>
          )}
          <button
            onClick={() => onCreateProject(localNiche || niches[0]?.slug || "default")}
            className="px-8 py-3 rounded-xl bg-rust text-white font-heading text-base hover:opacity-90 transition-opacity shadow-comic-sm border-[3px] border-ink"
          >
            Crear Estrategia de Contenido
          </button>
        </div>
      </div>
    );
  }

  /* ============================================================
     hasProject = true, Mode 2: Doc Viewer (selectedDoc)
     ============================================================ */

  if (selectedDoc) {
    const btnClass =
      "inline-flex items-center gap-1.5 px-2.5 py-1 text-[13px] bg-transparent border border-[#E5E2DC] dark:border-[#313244] rounded-md cursor-pointer text-[#7A7A7A] dark:text-[#6c7086] hover:bg-[#E5E2DC] dark:hover:bg-[#313244] hover:text-[#1A1A1A] dark:hover:text-[#cdd6f4] transition-colors";

    return (
      <div className="space-y-4">
        {/* Header bar */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={handleBack}
            className="text-xs text-muted-foreground hover:text-rust bg-transparent border-none cursor-pointer"
          >
            &larr; Volver
          </button>

          <span className="text-sm font-bold text-foreground truncate">
            {selectedDoc.name}
          </span>

          <div className="ml-auto flex items-center gap-2">
            {/* Status badge (read-only) */}
            <span
              className={cn(
                "text-[11px] font-medium px-2.5 py-1 rounded-full",
                STATUS_BADGE[statusToCls(selectedDoc.status)] || STATUS_BADGE.todo,
              )}
            >
              {statusLabel(selectedDoc.status)}
            </span>

            {/* Chat */}
            <button
              type="button"
              onClick={() => onOpenChat(selectedDoc.key, selectedDoc.deliverable)}
              className={btnClass}
            >
              {"\uD83D\uDCAC"} Chat
            </button>
          </div>
        </div>

        {/* Doc content */}
        {docLoading && (
          <p className="text-sm text-muted-foreground text-center py-20">
            Cargando documento...
          </p>
        )}
        {!docLoading && docContent ? (
          selectedDoc.deliverable.endsWith(".html") ||
          docContent.trimStart().startsWith("<!DOCTYPE") ||
          docContent.trimStart().startsWith("<html") ? (
            <iframe
              srcDoc={docContent}
              className="w-full border-0 rounded-lg bg-white"
              style={{ minHeight: "80vh" }}
              sandbox="allow-same-origin"
              title={selectedDoc.name}
            />
          ) : (
            <article className="prose prose-sm max-w-none dark:prose-invert prose-headings:font-heading prose-headings:text-rust prose-a:text-rust prose-table:border-collapse prose-th:border prose-th:border-border prose-th:px-3 prose-th:py-2 prose-th:bg-muted/30 prose-th:text-left prose-th:text-xs prose-th:font-bold prose-td:border prose-td:border-border prose-td:px-3 prose-td:py-2 prose-td:text-xs">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{docContent}</ReactMarkdown>
            </article>
          )
        ) : !docLoading ? (
          <p className="text-sm text-red-500 text-center py-20">
            Documento no encontrado
          </p>
        ) : null}
      </div>
    );
  }

  /* ============================================================
     hasProject = true, Mode 1: File Tree (default)
     ============================================================ */

  const approvedCount = documents.filter(
    (d) => d.status === "approved" || d.status === "done",
  ).length;

  const grouped = SECTIONS.map((sec) => ({
    ...sec,
    docs: documents.filter((d) => d.section === sec.key),
  })).filter((g) => g.docs.length > 0);

  return (
    <div className="space-y-6">
      {/* Depth bar */}
      <DepthBar approved={approvedCount} total={documents.length} />

      {/* Sections */}
      <div className="space-y-3">
        {grouped.map((section) => {
          const sectionApproved = section.docs.filter(
            (d) => d.status === "approved" || d.status === "done",
          ).length;
          const allDone =
            sectionApproved === section.docs.length && section.docs.length > 0;

          return (
            <div
              key={section.key}
              className="rounded-xl border border-border bg-white dark:bg-card overflow-hidden"
            >
              {/* Section header */}
              <div className="flex items-center gap-3 px-5 py-4 border-b border-border/60">
                <span className="text-xl">{section.icon}</span>
                <span className="text-base font-bold text-foreground">
                  {section.label}
                </span>
                <span
                  className={cn(
                    "ml-auto text-[11px] font-medium px-2.5 py-1 rounded-full",
                    allDone ? STATUS_BADGE.done : STATUS_BADGE.todo,
                  )}
                >
                  {sectionApproved}/{section.docs.length}
                </span>
              </div>

              {/* Document rows */}
              <div className="divide-y divide-border/40">
                {section.docs.map((doc) => {
                  const blocked = isBlocked(doc, documents);
                  const depDoc = doc.depends_on
                    ? documents.find((d) => d.key === doc.depends_on)
                    : null;

                  return (
                    <div key={doc.key}>
                      <DocRow
                        doc={doc}
                        blocked={blocked}
                        dependsOnName={depDoc?.name || doc.depends_on}
                        onSelectDoc={handleSelectDoc}
                        onOpenChat={onOpenChat}
                      />
                      {doc.children?.map((child) => (
                        <ChildDocRow
                          key={child.name}
                          child={child}
                          parentKey={doc.key}
                          onSelectDoc={handleSelectChildDoc}
                          onOpenChat={onOpenChat}
                        />
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
