/**
 * Foundation Page — faithful replica of legacy Mission Control doc browser.
 *
 * Two modes:
 * 1. Folder View (default): depth bar, warning banner, file tree grouped by section
 * 2. Doc View (when a pillar doc is selected): breadcrumbs, markdown viewer, status bar
 *
 * Ported from: renderFoundation(), renderDocBrowserRoot(), renderDocView(),
 * renderFoundationDepthBar(), renderFoundationWarning() in mission-control.html
 */

import { useRouter } from "next/router";
import Head from "next/head";
import { useState, useCallback, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useSlugSync } from "@/hooks/useSlugSync";
import { useFoundation, useUpdatePillarStatus, useOtherDocs } from "@/hooks/useFoundation";
import { useOpenChat } from "@/hooks/useChat";
import { useProjects } from "@/hooks/useProjects";
import { buildPillarThread, findTaskThreadForDoc } from "@/lib/chat-openers";
import { DepthBar } from "@/components/foundation/depth-bar";
import { WarningsBanner } from "@/components/foundation/warnings-banner";
import { FileTree } from "@/components/foundation/file-tree";
import { EmptyState } from "@/components/shared/empty-state";
import dynamic from "next/dynamic";
import ReactMarkdown from "react-markdown";

const MarkdownEditor = dynamic(
  () => import("@/components/foundation/markdown-editor").then((m) => m.MarkdownEditor),
  { ssr: false, loading: () => <p className="text-sm text-muted-foreground p-6">Cargando editor...</p> }
);
import remarkGfm from "remark-gfm";
import type { FoundationState, Section, Pillar, PillarStatus } from "@/types";

// ============================================================
// DocViewerBody — just the markdown content, no breadcrumbs
// ============================================================

// DocViewerBody removed — inlined into selectedDoc view

// ============================================================
// Status Dropdown — matches legacy renderStatusDropdown()
// ============================================================

const STATUS_OPTS = [
  { value: "not-started", label: "No iniciado", bg: "#F5F5F5", border: "#D0D0D0", color: "#666" },
  { value: "in-progress", label: "En progreso", bg: "#EFF6FF", border: "#93C5FD", color: "#1D4ED8" },
  { value: "pending-review", label: "Pendiente revision", bg: "#FFFBEB", border: "#FCD34D", color: "#B45309" },
  { value: "approved", label: "Aprobado", bg: "#ECFDF5", border: "#6EE7B7", color: "#047857" },
];

function StatusDropdown({ slug, section, pillar, status }: { slug: string; section: string; pillar: string; status: string }) {
  const { mutate } = useUpdatePillarStatus();
  const current = STATUS_OPTS.find((o) => o.value === status) || STATUS_OPTS[0];

  return (
    <select
      value={status}
      onChange={(e) => mutate({ slug, section, pillar, status: e.target.value as PillarStatus })}
      className="px-2 py-1 text-xs font-semibold rounded-md cursor-pointer border"
      style={{ background: current.bg, borderColor: current.border, color: current.color }}
    >
      {STATUS_OPTS.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}

// ============================================================
// Foundation stats calculation (same logic as brand-column.tsx)
// ============================================================

const FF_PILLAR_MAP: Record<string, string> = {
  "company-brief": "company-brief",
  "self-l1": "self-analysis",
  "market-l1": "market-analysis",
  "brand-voice-snapshot": "brand-voice",
  "niche-basic": "niche-discovery",
};

const EXCLUDED_SECTIONS = ["fast-foundation", "foundation-presentation"];

function ffDonePillars(sections: Record<string, Section>): Set<string> {
  const done = new Set<string>();
  const ff = sections["fast-foundation"];
  if (!ff) return done;
  for (const [ffName, pInfo] of Object.entries(ff.pillars || {})) {
    if (["approved", "done"].includes(pInfo.status)) {
      done.add(FF_PILLAR_MAP[ffName] || ffName);
    }
  }
  return done;
}

function calcFoundationStats(foundation: FoundationState | undefined) {
  let approved = 0;
  let total = 0;
  if (!foundation?.sections) return { approved, total, pct: 0 };

  const ffDone = ffDonePillars(foundation.sections);
  for (const [secKey, secData] of Object.entries(foundation.sections)) {
    if (EXCLUDED_SECTIONS.includes(secKey)) continue;
    for (const [pName, pInfo] of Object.entries(secData.pillars || {})) {
      if (pInfo.optional) continue;
      total++;
      const effective =
        pInfo.status === "not-started" && ffDone.has(pName) ? "approved" : pInfo.status;
      if (["approved", "done"].includes(effective)) approved++;
    }
  }
  return { approved, total, pct: total > 0 ? Math.round((approved / total) * 100) : 0 };
}

// ============================================================
// Selected doc state
// ============================================================

interface SelectedDoc {
  sectionKey: string;
  pillarKey: string;
  pillar: Pillar;
  docPath: string;
  /** Parent pillar key for deep-dive docs (e.g. "competitor-analysis" for a competitor deep-dive) */
  parentPillar?: string;
}

// ============================================================
// Page Component
// ============================================================

export default function FoundationPage() {
  const slug = useSlugSync();
  const router = useRouter();
  const { data: foundation, isLoading } = useFoundation(slug);
  const { data: otherDocs } = useOtherDocs(slug);
  const { data: projectsData } = useProjects(slug || null);
  const openChat = useOpenChat();

  const [selectedDoc, setSelectedDoc] = useState<SelectedDoc | null>(null);
  const [editing, setEditing] = useState(false);
  const [docContent, setDocContent] = useState<string | null>(null);
  const [docLastModified, setDocLastModified] = useState<string | null>(null);
  const [docLoading, setDocLoading] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  // Fetch doc content whenever selectedDoc changes
  useEffect(() => {
    if (!selectedDoc?.docPath) { setDocContent(null); setDocLastModified(null); return; }
    setDocLoading(true);
    setDocContent(null);
    setDocLastModified(null);
    setEditing(false);
    fetch(`/api/docs/${selectedDoc.docPath}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && data.content) {
          setDocContent(data.content);
          setDocLastModified(data.lastModified || null);
        }
      })
      .catch(() => {})
      .finally(() => setDocLoading(false));
  }, [selectedDoc?.docPath]);

  // Open doc from query param ?doc=brand/slug/path
  useEffect(() => {
    const docParam = router.query.doc as string | undefined;
    if (!docParam || !foundation?.sections || selectedDoc) return;
    // Find the pillar matching this doc path
    for (const [secKey, secData] of Object.entries(foundation.sections)) {
      for (const [pKey, pInfo] of Object.entries(secData.pillars || {})) {
        if (pInfo.output_file === docParam) {
          setSelectedDoc({ sectionKey: secKey, pillarKey: pKey, pillar: pInfo, docPath: docParam });
          return;
        }
      }
    }
    // If no pillar match, still open the doc
    setSelectedDoc({ sectionKey: "", pillarKey: docParam.split("/").pop()?.replace(".md", "") || "", pillar: { status: "approved" } as Pillar, docPath: docParam });
  }, [router.query.doc, foundation, selectedDoc]);

  // Handle selecting a doc from the file tree
  const handleSelectDoc = useCallback(
    (sectionKey: string, pillarKey: string, pillar: Pillar) => {
      const docPath = pillar.output_file;
      if (!docPath) return;
      setSelectedDoc({ sectionKey, pillarKey, pillar, docPath });
    },
    [],
  );

  // Handle opening chat for a pillar (or deep-dive doc with parent pillar context).
  //
  // Convergence rule (2026-04-15): before opening any new thread for a doc,
  // check if the doc is already attached to a task (via `deliverable_file`
  // or `attachments[]`). If yes, open the task's thread instead — every
  // document attached to a task must share that ONE thread, never a new one.
  const handleOpenChat = useCallback(
    (pillarKey: string, docPath?: string) => {
      if (!slug) return;

      // 1. Task-ownership lookup (first priority)
      if (docPath) {
        const taskThread = findTaskThreadForDoc(slug, docPath, projectsData);
        if (taskThread) {
          openChat(slug, taskThread);
          return;
        }
      }

      // 2. Pillar thread fallback
      // For deep-dive docs, use the parent pillar for skill resolution
      // but keep the specific doc name for the thread name
      const skillPillar = selectedDoc?.parentPillar || pillarKey;
      const config = buildPillarThread(slug, skillPillar, docPath);
      // Override thread ID and name to be specific to this deep-dive doc
      if (selectedDoc?.parentPillar && pillarKey !== skillPillar) {
        config.threadId = `${slug}:${pillarKey}`;
        config.threadName = pillarKey.replace(/-/g, " ");
      }
      openChat(slug, config);
    },
    [slug, openChat, selectedDoc?.parentPillar, projectsData],
  );

  // Handle selecting an "other doc" (no pillar/section), with optional parent pillar for deep-dives
  const handleSelectOtherDoc = useCallback(
    (docPath: string, docName: string, parentPillar?: string) => {
      const pillarKey = docName.toLowerCase().replace(/\s+/g, "-");
      setSelectedDoc({
        sectionKey: "",
        pillarKey,
        pillar: { status: "approved" } as Pillar,
        docPath,
        parentPillar,
      });
    },
    [],
  );

  // Handle going back. If the doc lives under a project (docPath contains
  // `projects/{projDir}/...`), navigate to the project or task page instead
  // of clearing back to the Foundation folder view — the user expects the
  // breadcrumb to take them to the parent container, not to Foundation.
  const handleBack = useCallback(() => {
    if (selectedDoc?.docPath) {
      const m = selectedDoc.docPath.match(
        /(?:brand\/[^/]+\/)?projects\/([^/]+)(?:\/(?:T(\d+)|tasks\/([^/]+)))?/i
      );
      if (m && slug) {
        const projDir = m[1]; // e.g. "P01-fontaneria"
        const projId = projDir.match(/^(P\d+)/)?.[1]; // e.g. "P01"
        const taskNum = m[2]; // e.g. "08" from T08
        const taskId = m[3]; // e.g. "P01-T08" from tasks/{taskId}

        if (projId) {
          if (taskNum) {
            // Navigate to the task page
            router.push(`/dashboard/${slug}/projects/${projId}/tasks/${projId}-T${taskNum}`);
          } else if (taskId) {
            router.push(`/dashboard/${slug}/projects/${projId}/tasks/${taskId}`);
          } else {
            // Navigate to the project page
            router.push(`/dashboard/${slug}/projects/${projId}`);
          }
          setSelectedDoc(null);
          return;
        }
      }
    }
    setSelectedDoc(null);
  }, [selectedDoc, slug, router]);


  // --- Loading state ---
  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground">Cargando Foundation...</p>
        </div>
      </DashboardLayout>
    );
  }

  // --- No data state ---
  if (!foundation || !foundation.sections) {
    return (
      <DashboardLayout>
        <Head>
          <title>Documents &mdash; {slug} &mdash; Mission Control</title>
        </Head>
        <EmptyState
          icon={"\uD83D\uDCC2"}
          message={`No se encontro foundation state para ${slug}`}
        />
      </DashboardLayout>
    );
  }

  const stats = calcFoundationStats(foundation);

  // ============================================================
  // MODE 2: Doc View — matches legacy slide-over header
  // Header: ✕ | Title | [Status dropdown] | 💬 Chat | ✏️ Editar
  // ============================================================
  if (selectedDoc) {
    const pillarTitle = selectedDoc.pillarKey
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c: string) => c.toUpperCase());
    const displayPath = selectedDoc.docPath.replace(/^brand\/[^/]+\//, "");
    const normStatus =
      (selectedDoc.pillar.status as string) === "done" ? "approved"
        : selectedDoc.pillar.status === "generated" ? "pending-review"
          : selectedDoc.pillar.status || "not-started";

    const btnClass = "inline-flex items-center gap-1.5 px-2.5 py-1 text-[13px] bg-transparent border border-[#E5E2DC] dark:border-[#313244] rounded-md cursor-pointer text-[#7A7A7A] dark:text-[#6c7086] hover:bg-[#E5E2DC] dark:hover:bg-[#313244] hover:text-[#1A1A1A] dark:hover:text-[#cdd6f4] transition-colors";

    return (
      <DashboardLayout>
        <Head>
          <title>{pillarTitle} &mdash; {slug} &mdash; Mission Control</title>
        </Head>

        {/* Header bar */}
        <div className="flex items-center gap-2.5 mb-4 flex-wrap">
          <button
            type="button"
            onClick={handleBack}
            className="text-xs text-muted-foreground hover:text-rust"
          >
            ← {displayPath.split("/").slice(0, -1).join("/") || selectedDoc.pillarKey}
          </button>

          <span className="text-sm font-bold text-foreground truncate">
            {pillarTitle}
          </span>
          {docLastModified && (
            <span className="text-[10px] text-muted-foreground flex-shrink-0">
              Editado: {new Date(docLastModified).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
            </span>
          )}

          <div className="ml-auto flex items-center gap-2">
            {/* Status dropdown */}
            {selectedDoc.sectionKey && (
              <StatusDropdown
                slug={slug}
                section={selectedDoc.sectionKey}
                pillar={selectedDoc.pillarKey}
                status={normStatus}
              />
            )}

            {/* Download */}
            <a
              href={`/api/docs/${selectedDoc.docPath}?download=1`}
              download
              className={btnClass + " no-underline"}
            >
              ⬇ Descargar
            </a>

            {/* Share — public link */}
            <button
              type="button"
              onClick={async () => {
                try {
                  const res = await fetch("/api/docs/share", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ slug, docPath: selectedDoc.docPath }),
                  });
                  if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err.error || `HTTP ${res.status}`);
                  }
                  const data = await res.json();
                  if (!data?.url) throw new Error("No URL returned");
                  await navigator.clipboard.writeText(data.url);
                  setShareCopied(true);
                  setTimeout(() => setShareCopied(false), 2000);
                } catch (e) {
                  console.error("Share link copy failed:", (e as Error).message);
                }
              }}
              className={btnClass}
              title="Copia un link público para compartir con terceros"
            >
              {shareCopied ? "✓ Copiado" : "🔗 Compartir"}
            </button>

            {/* Chat */}
            <button
              type="button"
              onClick={() => handleOpenChat(selectedDoc.pillarKey, selectedDoc.docPath)}
              className={btnClass}
            >
              💬 Chat
            </button>

            {/* Editar — toggle editor (hide for HTML presentations) */}
            {!(selectedDoc.docPath.endsWith(".html") || (docContent && (docContent.trimStart().startsWith("<!DOCTYPE") || docContent.trimStart().startsWith("<html")))) && (
              <button
                type="button"
                onClick={() => setEditing(!editing)}
                disabled={!docContent}
                className={btnClass}
              >
                {editing ? "👁 Ver" : "✏️ Editar"}
              </button>
            )}
          </div>
        </div>

        {/* Doc content — toggle between viewer and editor */}
        {docLoading && <p className="text-sm text-muted-foreground text-center py-20">Cargando documento...</p>}
        {!docLoading && editing && docContent ? (
          <div className="min-h-[60vh]">
            <MarkdownEditor
              initialContent={docContent}
              onSave={async (content) => {
                const res = await fetch(`/api/docs/${selectedDoc.docPath}`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ content }),
                });
                if (!res.ok) throw new Error("Save failed");
                setDocContent(content);
                setEditing(false);
              }}
              onCancel={() => setEditing(false)}
            />
          </div>
        ) : !docLoading && docContent ? (
          selectedDoc.docPath.endsWith(".html") || docContent.trimStart().startsWith("<!DOCTYPE") || docContent.trimStart().startsWith("<html") ? (
            <iframe
              srcDoc={docContent}
              className="w-full border-0 rounded-lg bg-white"
              style={{ minHeight: "80vh" }}
              sandbox="allow-same-origin"
              title={pillarTitle}
            />
          ) : (
            <article className="prose prose-sm max-w-none dark:prose-invert prose-headings:font-heading prose-headings:text-rust prose-a:text-rust prose-table:border-collapse prose-th:border prose-th:border-border prose-th:px-3 prose-th:py-2 prose-th:bg-muted/30 prose-th:text-left prose-th:text-xs prose-th:font-bold prose-td:border prose-td:border-border prose-td:px-3 prose-td:py-2 prose-td:text-xs">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{docContent}</ReactMarkdown>
            </article>
          )
        ) : !docLoading ? (
          <p className="text-sm text-red-500 text-center py-20">Documento no encontrado</p>
        ) : null}

      </DashboardLayout>
    );
  }

  // ============================================================
  // MODE 1: Folder View (default)
  // ============================================================
  return (
    <DashboardLayout>
      <Head>
        <title>Documents &mdash; {slug} &mdash; Mission Control</title>
      </Head>

      {/* Page title + breadcrumbs + download */}
      <div className="flex items-center gap-3 mb-2 flex-wrap">
        <h1 className="font-heading text-2xl text-navy m-0">
          {"\uD83D\uDCC2"} Documents
        </h1>
        <div className="text-sm text-muted-foreground flex items-center gap-1.5">
          <span className="text-rust font-bold">{slug}</span>
        </div>
        <a
          href={`/api/foundation/download?slug=${encodeURIComponent(slug)}`}
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium bg-transparent border border-[#E5E2DC] dark:border-[#313244] rounded-md text-[#7A7A7A] dark:text-[#6c7086] hover:bg-[#E5E2DC] dark:hover:bg-[#313244] hover:text-[#1A1A1A] dark:hover:text-[#cdd6f4] transition-colors no-underline"
        >
          ⬇ Descargar todo
        </a>
      </div>

      {/* Foundation depth bar */}
      <DepthBar approved={stats.approved} total={stats.total} />

      {/* Warning banner if < 100% */}
      <WarningsBanner approved={stats.approved} total={stats.total} />

      {/* File tree */}
      <FileTree
        slug={slug}
        foundation={foundation}
        otherDocs={otherDocs}
        onSelectDoc={handleSelectDoc}
        onSelectOtherDoc={handleSelectOtherDoc}
        onOpenChat={handleOpenChat}
      />
    </DashboardLayout>
  );
}
