/**
 * Brand Brain Page — la memoria estratégica de la marca.
 *
 * Two modes:
 * 1. Folder View (default): depth bar, warning banner, unified file tree
 * 2. Doc View (when a pillar doc is selected): breadcrumbs, markdown viewer, status bar
 *
 * Renamed from Foundation (2026-05-09). Storage on disk remains foundation-state.json.
 */

import { useRouter } from "next/router";
import Head from "next/head";
import { useState, useCallback, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { TitleIcon } from "@/components/layout/title-icon";
import { useSlugSync } from "@/hooks/useSlugSync";
import { useBrandBrain, useBrandBrainOtherDocs, useUpdatePillarStatus } from "@/hooks/useBrandBrain";
import { useOpenChat } from "@/hooks/useChat";
import { useProjects } from "@/hooks/useProjects";
import { buildHtmlConversionThread, buildPillarThread, findTaskThreadForDoc } from "@/lib/chat-openers";
import { htmlSiblingOf } from "@/lib/doc-paths";
import { DepthBar } from "@/components/brand-brain/depth-bar";
import { WarningsBanner } from "@/components/brand-brain/warnings-banner";
import { FileTree } from "@/components/brand-brain/file-tree";
import { EmptyState } from "@/components/shared/empty-state";
import { TaskSlideOver } from "@/components/shared/task-slideover";
import { DocSlideOver } from "@/components/shared/doc-slideover";
import { TemplateViewer } from "@/components/brand-brain/TemplateViewer";
import dynamic from "next/dynamic";
import ReactMarkdown from "react-markdown";

const MarkdownEditor = dynamic(
  () => import("@/components/brand-brain/markdown-editor").then((m) => m.MarkdownEditor),
  { ssr: false, loading: () => <p className="text-sm text-muted-foreground p-6">Cargando editor...</p> }
);
import remarkGfm from "remark-gfm";
import type { BrandBrainState, Section, Pillar, TaskStatus } from "@/types";
import { TASK_STATUS_OPTIONS } from "@/lib/task-status";

// SAN-192: el selector de DOCUMENTO usa el mismo vocabulario único de task que
// el selector de TAREA — fuente única en src/lib/task-status.ts (6 valores).
function StatusDropdown({ slug, section, pillar, status }: { slug: string; section: string; pillar: string; status: string }) {
  const { mutate } = useUpdatePillarStatus();
  const current = TASK_STATUS_OPTIONS.find((o) => o.value === status) || TASK_STATUS_OPTIONS[0];

  return (
    <select
      value={status}
      onChange={(e) => mutate({ slug, section, pillar, status: e.target.value as TaskStatus })}
      className="px-2 py-1 text-xs font-semibold rounded-md cursor-pointer border"
      style={{ background: current.bg, borderColor: current.border, color: current.color }}
    >
      {TASK_STATUS_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}

const FF_PILLAR_MAP: Record<string, string> = {
  "company-brief": "company-brief",
  "self-l1": "self-analysis",
  "market-l1": "market-analysis",
  "brand-voice-snapshot": "brand-voice",
  "niche-basic": "niche-discovery",
};

const EXCLUDED_SECTIONS = ["foundation-presentation"];

function ffDonePillars(sections: Record<string, Section>): Set<string> {
  const done = new Set<string>();
  const cb = sections["company-brief"];
  if (!cb) return done;
  for (const [cbName, pInfo] of Object.entries(cb.pillars || {})) {
    if (pInfo.status === "completed") {
      done.add(FF_PILLAR_MAP[cbName] || cbName);
    }
  }
  return done;
}

function calcBrandBrainStats(brandBrain: BrandBrainState | undefined) {
  let approved = 0;
  let total = 0;
  if (!brandBrain?.sections) return { approved, total, pct: 0 };

  const ffDone = ffDonePillars(brandBrain.sections);
  for (const [secKey, secData] of Object.entries(brandBrain.sections)) {
    if (EXCLUDED_SECTIONS.includes(secKey)) continue;
    for (const [pName, pInfo] of Object.entries(secData.pillars || {})) {
      if (pInfo.optional) continue;
      total++;
      const effective =
        pInfo.status === "todo" && ffDone.has(pName) ? "completed" : pInfo.status;
      if (effective === "completed") approved++;
    }
  }
  return { approved, total, pct: total > 0 ? Math.round((approved / total) * 100) : 0 };
}

interface SelectedDoc {
  sectionKey: string;
  pillarKey: string;
  pillar: Pillar;
  docPath: string;
  parentPillar?: string;
}

export default function BrandBrainPage() {
  const slug = useSlugSync();
  const router = useRouter();
  const { data: brandBrain, isLoading } = useBrandBrain(slug);
  const { data: otherDocs } = useBrandBrainOtherDocs(slug);
  const { data: projectsData } = useProjects(slug || null);
  const openChat = useOpenChat();

  // Client feedback (SAN-15 comments) surfaced inside Brand Brain so a doc's
  // comments + the "Analizar feedback" trigger live next to the doc itself.
  const { data: clientComments } = useQuery<{
    documents?: Array<{
      docPath: string;
      count: number;
      comments: Array<{ id: string; author: string; body: string; anchorText: string | null; createdAt: string }>;
    }>;
  }>({
    queryKey: ["client-comments", slug],
    queryFn: async () => {
      const res = await fetch(`/api/clients/${slug}/comments`);
      if (!res.ok) return { documents: [] };
      return res.json();
    },
    enabled: !!slug,
    staleTime: 30_000,
  });
  const docRelKey = useCallback(
    // Collapse .commented siblings AND the md/html canonical pair (SAN-149)
    // onto the .md key so a doc's feedback matches no matter which form
    // was shared or is being viewed.
    (p: string) =>
      p
        .replace(/^brand\/[^/]+\//, "")
        .replace(/\.commented(?=\.[a-z0-9]+$|$)/i, "")
        .replace(/\.html$/i, ".md"),
    [],
  );
  const { commentCounts, commentsByRel } = useMemo(() => {
    const counts: Record<string, number> = {};
    const byRel = new Map<
      string,
      { count: number; comments: Array<{ id: string; author: string; body: string; anchorText: string | null; createdAt: string }> }
    >();
    for (const d of clientComments?.documents ?? []) {
      const key = docRelKey(d.docPath);
      counts[key] = (counts[key] ?? 0) + d.count;
      const prev = byRel.get(key);
      byRel.set(key, {
        count: (prev?.count ?? 0) + d.count,
        comments: [...(prev?.comments ?? []), ...d.comments],
      });
    }
    return { commentCounts: counts, commentsByRel: byRel };
  }, [clientComments, docRelKey]);

  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeMsg, setAnalyzeMsg] = useState<string | null>(null);
  const analyzeFeedback = useCallback(
    async (docPath: string) => {
      if (!slug) return;
      setAnalyzing(true);
      setAnalyzeMsg(null);
      try {
        const res = await fetch(`/api/clients/${slug}/analyze-feedback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ docPath: docPath.startsWith("brand/") ? docPath : `brand/${slug}/${docPath}` }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error || "No se pudo disparar el análisis");
        setAnalyzeMsg(
          d.forwardedToGateway
            ? "Análisis disparado — Sansón está procesando. Aparecerá en la pestaña Mejoras."
            : `No se disparó: ${d.error || "sin comentarios"}`,
        );
      } catch (e) {
        setAnalyzeMsg(e instanceof Error ? e.message : "Error");
      } finally {
        setAnalyzing(false);
      }
    },
    [slug],
  );

  // Author-agent review loop (SAN-148): visible counterpart of the
  // 15-minute auto-dispatch — asks the doc's AUTHOR to read the open
  // threads, propose an Apply/Skip plan in the doc's chat and resolve.
  const [applying, setApplying] = useState(false);
  const applyFeedback = useCallback(
    async (docPath: string) => {
      if (!slug) return;
      setApplying(true);
      setAnalyzeMsg(null);
      try {
        const res = await fetch(`/api/clients/${slug}/review-comments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ docPath: docPath.startsWith("brand/") ? docPath : `brand/${slug}/${docPath}` }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error || "No se pudo despachar la revisión");
        setAnalyzeMsg(
          d.forwardedToGateway
            ? `Revisión despachada a ${d.agent} — propondrá el plan Apply/Skip en el chat del documento (botón 💬 Chat).`
            : `No se despachó: ${d.error || "sin comentarios abiertos"}`,
        );
      } catch (e) {
        setAnalyzeMsg(e instanceof Error ? e.message : "Error");
      } finally {
        setApplying(false);
      }
    },
    [slug],
  );

  const [selectedDoc, setSelectedDoc] = useState<SelectedDoc | null>(null);
  const [taskSlideOver, setTaskSlideOver] = useState<{ projectId: string; taskId: string } | null>(null);
  const [docSlideOverPath, setDocSlideOverPath] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [docContent, setDocContent] = useState<string | null>(null);
  const [docLastModified, setDocLastModified] = useState<string | null>(null);
  const [docUsedFallback, setDocUsedFallback] = useState(false);
  const [docCanonicalPath, setDocCanonicalPath] = useState<string | null>(null);
  const [docLoading, setDocLoading] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  // ── HTML-canonical sibling (SAN-149) — same behavior as DocSlideOver ──
  // When the .md has a generated .html sibling, the HTML is the canonical
  // view by default, with a "Ver fuente (.md)" toggle back to the source.
  const [htmlSibling, setHtmlSibling] = useState<string | null>(null);
  const [htmlSiblingStale, setHtmlSiblingStale] = useState(false);
  const [viewSource, setViewSource] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    setViewSource(false);
    setHtmlSibling(null);
    setHtmlSiblingStale(false);
  }, [selectedDoc?.docPath]);

  useEffect(() => {
    if (!selectedDoc?.docPath) {
      setDocContent(null);
      setDocLastModified(null);
      setDocUsedFallback(false);
      setDocCanonicalPath(null);
      return;
    }
    let cancelled = false;
    setDocLoading(true);
    setDocContent(null);
    setDocLastModified(null);
    setDocUsedFallback(false);
    setDocCanonicalPath(null);
    setEditing(false);
    (async () => {
      try {
        const res = await fetch(`/api/docs/${selectedDoc.docPath}`);
        const data = await res.json();
        if (cancelled || !data.ok || !data.content) return;
        setHtmlSibling(data.htmlSibling || null);
        setHtmlSiblingStale(Boolean(data.htmlSiblingStale));

        if (data.htmlSibling && !viewSource) {
          const sibRes = await fetch(`/api/docs/${data.htmlSibling}`);
          if (sibRes.ok) {
            const sib = await sibRes.json();
            if (cancelled) return;
            if (sib.ok && sib.content) {
              setDocContent(sib.content);
              setDocLastModified(sib.lastModified || null);
              setDocCanonicalPath(sib.canonicalPath || data.htmlSibling);
              return;
            }
          }
        }

        setDocContent(data.content);
        setDocLastModified(data.lastModified || null);
        setDocUsedFallback(Boolean(data.usedFallback));
        setDocCanonicalPath(data.canonicalPath || null);
      } catch {
        // soft-fail: "Documento no encontrado" state
      } finally {
        if (!cancelled) setDocLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedDoc?.docPath, viewSource, refreshTick]);

  // ── Convertir en HTML (SAN-149): dispatch html-output to the doc's
  // author agent via its chat thread, then poll the expected sibling. ──
  const [convertState, setConvertState] = useState<"idle" | "converting" | "error">("idle");
  const expectedSibling = useMemo(() => {
    if (!selectedDoc?.docPath) return null;
    try { return htmlSiblingOf(selectedDoc.docPath); } catch { return null; }
  }, [selectedDoc?.docPath]);

  const handleConvertToHtml = useCallback(() => {
    if (!selectedDoc?.docPath || !slug || convertState === "converting") return;
    const thread = buildHtmlConversionThread(slug, selectedDoc.docPath, projectsData);
    openChat(slug, thread);
    setConvertState("converting");
  }, [selectedDoc?.docPath, slug, convertState, projectsData, openChat]);

  useEffect(() => {
    if (convertState !== "converting" || !expectedSibling) return;
    const startedAt = Date.now();
    const TIMEOUT_MS = 5 * 60 * 1000;
    const interval = setInterval(async () => {
      if (Date.now() - startedAt > TIMEOUT_MS) {
        clearInterval(interval);
        setConvertState("error");
        return;
      }
      try {
        const res = await fetch(`/api/docs/${expectedSibling}`);
        if (res.ok) {
          clearInterval(interval);
          setConvertState("idle");
          setViewSource(false);
          setRefreshTick((t) => t + 1);
        }
      } catch {
        // network hiccup — keep polling
      }
    }, 6000);
    return () => clearInterval(interval);
  }, [convertState, expectedSibling]);

  useEffect(() => {
    const docParam = router.query.doc as string | undefined;
    if (!docParam || !brandBrain?.sections || selectedDoc) return;
    for (const [secKey, secData] of Object.entries(brandBrain.sections)) {
      for (const [pKey, pInfo] of Object.entries(secData.pillars || {})) {
        if (pInfo.output_file === docParam) {
          setSelectedDoc({ sectionKey: secKey, pillarKey: pKey, pillar: pInfo, docPath: docParam });
          return;
        }
      }
    }
    const templateMatch = docParam.match(/^brand\/[^/]+\/brand-book\/visual-identity\/templates\/[^/]+\//);
    if (templateMatch) {
      for (const [secKey, secData] of Object.entries(brandBrain.sections)) {
        const viPillar = secData.pillars?.["visual-identity"];
        if (viPillar) {
          setSelectedDoc({
            sectionKey: secKey,
            pillarKey: "visual-identity",
            pillar: viPillar,
            docPath: docParam,
          });
          return;
        }
      }
      setSelectedDoc({
        sectionKey: "",
        pillarKey: "visual-identity",
        pillar: { status: "completed" } as Pillar,
        docPath: docParam,
      });
      return;
    }
    setSelectedDoc({ sectionKey: "", pillarKey: docParam.split("/").pop()?.replace(".md", "") || "", pillar: { status: "completed" } as Pillar, docPath: docParam });
  }, [router.query.doc, brandBrain, selectedDoc]);

  const handleSelectDoc = useCallback(
    (sectionKey: string, pillarKey: string, pillar: Pillar) => {
      const docPath = pillar.output_file;
      if (!docPath) return;
      setSelectedDoc({ sectionKey, pillarKey, pillar, docPath });
    },
    [],
  );

  const handleOpenChat = useCallback(
    (pillarKey: string, docPath?: string) => {
      if (!slug) return;

      if (docPath) {
        const taskThread = findTaskThreadForDoc(slug, docPath, projectsData);
        if (taskThread) {
          openChat(slug, taskThread);
          return;
        }
      }

      const skillPillar = selectedDoc?.parentPillar || pillarKey;
      const config = buildPillarThread(slug, skillPillar, docPath);
      if (selectedDoc?.parentPillar && pillarKey !== skillPillar) {
        config.threadId = `${slug}:${pillarKey}`;
        config.threadName = pillarKey.replace(/-/g, " ");
      }
      openChat(slug, config);
    },
    [slug, openChat, selectedDoc?.parentPillar, projectsData],
  );

  const handleSelectOtherDoc = useCallback(
    (docPath: string, docName: string, parentPillar?: string) => {
      const pillarKey = docName.toLowerCase().replace(/\s+/g, "-");
      setSelectedDoc({
        sectionKey: "",
        pillarKey,
        pillar: { status: "completed" } as Pillar,
        docPath,
        parentPillar,
      });
    },
    [],
  );

  const handleBack = useCallback(() => {
    if (selectedDoc?.docPath && slug) {
      if (/(?:brand\/[^/]+\/)?content\//.test(selectedDoc.docPath)) {
        router.push(`/dashboard/${slug}/content-creation`);
        setSelectedDoc(null);
        return;
      }

      const m = selectedDoc.docPath.match(
        /(?:brand\/[^/]+\/)?projects\/([^/]+)(?:\/(?:T(\d+)|tasks\/([^/]+)))?/i
      );
      if (m) {
        const projDir = m[1];
        const projId = projDir.match(/^(P\d+)/)?.[1];
        const taskNum = m[2];
        const taskId = m[3];

        if (projId) {
          if (taskNum) {
            router.push(`/dashboard/${slug}/tasks/${projId}-T${taskNum}`);
          } else if (taskId) {
            router.push(`/dashboard/${slug}/tasks/${taskId}`);
          } else {
            router.push(`/dashboard/${slug}/tasks/${projId}`);
          }
          setSelectedDoc(null);
          return;
        }
      }
    }
    setSelectedDoc(null);
  }, [selectedDoc, slug, router]);

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground">Cargando Brand Brain...</p>
        </div>
      </DashboardLayout>
    );
  }

  if (!brandBrain || !brandBrain.sections) {
    return (
      <DashboardLayout>
        <Head>
          <title>{`Brand Brain - ${slug} - Mission Control`}</title>
        </Head>
        <EmptyState
          icon={"🧠"}
          message={`No se encontro Brand Brain para ${slug}`}
        />
      </DashboardLayout>
    );
  }

  const stats = calcBrandBrainStats(brandBrain);

  if (selectedDoc) {
    const pillarTitle = selectedDoc.pillarKey
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c: string) => c.toUpperCase());
    const displayPath = selectedDoc.docPath.replace(/^brand\/[^/]+\//, "");
    const normStatus =
      (selectedDoc.pillar.status as string) === "done" ? "completed"
        : selectedDoc.pillar.status || "todo";

    const btnClass = "inline-flex items-center gap-1.5 px-2.5 py-1 text-[13px] bg-transparent border border-[#E5E2DC] dark:border-[#313244] rounded-md cursor-pointer text-[#7A7A7A] dark:text-[#6c7086] hover:bg-[#E5E2DC] dark:hover:bg-[#313244] hover:text-[#1A1A1A] dark:hover:text-[#cdd6f4] transition-colors";

    // HTML deliverables take the whole content area (SAN-149): full-bleed
    // layout with the header bar padded manually and the iframe filling the
    // rest of the viewport. Carousel templates keep the boxed TemplateViewer.
    const tplDoc = /^brand\/[^/]+\/brand-book\/visual-identity\/templates\/[^/]+\/(slide-cover|slide-body|slide-cta|template)\.html$/.test(selectedDoc.docPath);
    const viewingHtml =
      !editing && !docLoading && !!docContent && !tplDoc &&
      (selectedDoc.docPath.endsWith(".html") ||
        docContent.trimStart().startsWith("<!DOCTYPE") ||
        docContent.trimStart().startsWith("<html"));

    return (
      <DashboardLayout fullBleed={viewingHtml}>
        <Head>
          <title>{`${pillarTitle} - ${slug} - Mission Control`}</title>
        </Head>

        <div className={`flex items-center gap-2.5 flex-wrap ${viewingHtml ? "px-6 py-3 mb-0 border-b border-[#E5E2DC] dark:border-[#313244]" : "mb-4"}`}>
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
          {docUsedFallback && docCanonicalPath?.endsWith("/lite.md") && (
            <span
              className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200 flex-shrink-0"
              title={`Mostrando ${docCanonicalPath} (preliminar de kickoff). Ejecuta la skill full para producir current.md.`}
            >
              Preliminar (lite)
            </span>
          )}
          {docLastModified && (
            <span className="text-[10px] text-muted-foreground flex-shrink-0">
              Editado: {new Date(docLastModified).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
            </span>
          )}

          <div className="ml-auto flex items-center gap-2">
            {selectedDoc.sectionKey && (
              <StatusDropdown
                slug={slug}
                section={selectedDoc.sectionKey}
                pillar={selectedDoc.pillarKey}
                status={normStatus}
              />
            )}

            <a
              href={`/api/docs/${selectedDoc.docPath}?download=1`}
              download
              className={btnClass + " no-underline"}
            >
              ⬇ Descargar
            </a>

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

            <button
              type="button"
              onClick={() => handleOpenChat(selectedDoc.pillarKey, selectedDoc.docPath)}
              className={btnClass}
            >
              💬 Chat
            </button>

            {/* HTML-canonical controls (SAN-149) */}
            {htmlSibling && (
              <button
                type="button"
                onClick={() => setViewSource((v) => !v)}
                className={btnClass}
                title={viewSource ? "Ver el documento HTML canónico" : "Ver la fuente markdown editable"}
              >
                {viewSource ? "📄 Ver HTML" : "📝 Ver fuente (.md)"}
              </button>
            )}
            {selectedDoc.docPath.endsWith(".md") && docContent && (!htmlSibling || htmlSiblingStale) && (
              <button
                type="button"
                onClick={handleConvertToHtml}
                disabled={convertState === "converting"}
                className={btnClass + (convertState === "converting" ? " opacity-60 cursor-wait" : "")}
                title={
                  convertState === "error"
                    ? "La conversión sigue en el chat — el HTML tarda más de lo esperado"
                    : htmlSiblingStale
                      ? "El .md cambió después de generar el HTML — regenerar"
                      : "Genera el documento HTML canónico con la skill html-output"
                }
              >
                {convertState === "converting"
                  ? "⏳ Generando HTML…"
                  : convertState === "error"
                    ? "⚠️ Reintentar HTML"
                    : htmlSiblingStale
                      ? "🔄 Regenerar HTML"
                      : "🎨 Convertir en HTML"}
              </button>
            )}

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

        {(() => {
          const dc = commentsByRel.get(docRelKey(selectedDoc.docPath));
          if (!dc || dc.comments.length === 0) return null;
          return (
            <div className={`mb-4 rounded-lg border border-yellow-300/60 bg-yellow-50/60 dark:bg-yellow-900/10 p-4 ${viewingHtml ? "mx-6 mt-4" : ""}`}>
              <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                <span className="text-sm font-bold text-yellow-900 dark:text-yellow-200">
                  💬 Comentarios del cliente ({dc.count})
                </span>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => applyFeedback(selectedDoc.docPath)}
                    disabled={applying || analyzing}
                    className="inline-flex items-center gap-1 rounded-md border-2 border-[#1B1720] bg-[#F7C948] px-3 py-1 text-xs font-bold text-[#1B1720] shadow-[2px_2px_0_#1B1720] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0_#1B1720] disabled:opacity-50"
                    title="El agente autor del doc lee el feedback, propone un plan Apply/Skip en el chat del documento y resuelve los comentarios"
                  >
                    💬 {applying ? "Despachando..." : "Aplicar feedback"}
                  </button>
                  <button
                    type="button"
                    onClick={() => analyzeFeedback(selectedDoc.docPath)}
                    disabled={analyzing || applying}
                    className="inline-flex items-center gap-1 rounded-md border border-rust/40 bg-rust/10 px-3 py-1 text-xs font-bold text-rust hover:bg-rust/15 disabled:opacity-50"
                    title="Sansón clasifica el feedback en insights de mejora (pestaña Mejoras de Intelligence)"
                  >
                    🛡️ {analyzing ? "Analizando..." : "Clasificar (Mejoras)"}
                  </button>
                </div>
              </div>
              {analyzeMsg && (
                <p className="mb-2 rounded-md border border-border bg-background/70 px-3 py-2 text-[12px] font-medium text-foreground">
                  {analyzeMsg}
                </p>
              )}
              <ul className="space-y-2 m-0 list-none p-0">
                {dc.comments.map((c) => (
                  <li key={c.id} className="text-[12px]">
                    <span className="font-semibold">{c.author}</span>
                    <span className="text-muted-foreground"> · {new Date(c.createdAt).toLocaleDateString("es-ES")}</span>
                    {c.anchorText && (
                      <div className="mt-0.5 border-l-2 border-rust/50 pl-2 italic text-muted-foreground">
                        &ldquo;{c.anchorText.slice(0, 160)}&rdquo;
                      </div>
                    )}
                    <div className="mt-0.5">{c.body}</div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })()}

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
          (() => {
            const isHtml = selectedDoc.docPath.endsWith(".html") ||
              docContent.trimStart().startsWith("<!DOCTYPE") || docContent.trimStart().startsWith("<html");
            if (!isHtml) {
              return (
                <article className="prose prose-sm max-w-none dark:prose-invert prose-headings:font-heading prose-headings:text-rust prose-a:text-rust prose-table:border-collapse prose-th:border prose-th:border-border prose-th:px-3 prose-th:py-2 prose-th:bg-muted/30 prose-th:text-left prose-th:text-xs prose-th:font-bold prose-td:border prose-td:border-border prose-td:px-3 prose-td:py-2 prose-td:text-xs">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{docContent}</ReactMarkdown>
                </article>
              );
            }
            const tplMatch = selectedDoc.docPath.match(/^brand\/([^/]+)\/brand-book\/visual-identity\/templates\/([^/]+)\/(slide-cover|slide-body|slide-cta|template)\.html$/);
            if (tplMatch) {
              return (
                <TemplateViewer
                  slug={tplMatch[1]}
                  templateId={tplMatch[2]}
                  fileKey={tplMatch[3] as "template" | "slide-cover" | "slide-body" | "slide-cta"}
                  htmlDocPath={selectedDoc.docPath}
                />
              );
            }
            // Served by URL (not srcDoc) so in-page anchors (`#section`)
            // navigate within the iframe document instead of resolving
            // against the dashboard URL (SAN-149). Full-bleed: the iframe
            // fills everything below the header bar.
            return (
              <iframe
                src={`/api/docs/${docCanonicalPath || selectedDoc.docPath}?raw=1`}
                className="w-full border-0 bg-white block"
                style={{ height: "calc(100vh - 58px)" }}
                sandbox="allow-same-origin"
                title={pillarTitle}
              />
            );
          })()
        ) : !docLoading ? (
          <p className="text-sm text-red-500 text-center py-20">Documento no encontrado</p>
        ) : null}

      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <Head>
        <title>{`Brand Brain - ${slug} - Mission Control`}</title>
      </Head>

      <div className="flex items-center gap-3 mb-2 flex-wrap">
        <h1 className="font-heading text-2xl text-navy m-0">
          <TitleIcon name="brand-brain" />Brand Brain
        </h1>
        <div className="text-sm text-muted-foreground flex items-center gap-1.5">
          <span className="text-rust font-bold">{slug}</span>
        </div>
        <a
          href={`/api/brand-brain/download?slug=${encodeURIComponent(slug)}`}
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium bg-transparent border border-[#E5E2DC] dark:border-[#313244] rounded-md text-[#7A7A7A] dark:text-[#6c7086] hover:bg-[#E5E2DC] dark:hover:bg-[#313244] hover:text-[#1A1A1A] dark:hover:text-[#cdd6f4] transition-colors no-underline"
        >
          ⬇ Descargar todo
        </a>
      </div>

      <DepthBar approved={stats.approved} total={stats.total} />

      <WarningsBanner approved={stats.approved} total={stats.total} />

      <FileTree
        slug={slug}
        foundation={brandBrain}
        otherDocs={otherDocs}
        commentCounts={commentCounts}
        onSelectDoc={handleSelectDoc}
        onSelectOtherDoc={handleSelectOtherDoc}
        onOpenChat={handleOpenChat}
        onOpenTask={(docPath) => {
          if (!slug || !projectsData) return;
          const norm = docPath.replace(/^brand\/[^/]+\//, "");
          const withBrand = docPath.startsWith("brand/") ? docPath : `brand/${slug}/${docPath}`;
          for (const pw of projectsData) {
            for (const task of pw.tasks) {
              const df = task.deliverable_file;
              if (!df) continue;
              const dfStr = typeof df === "string" ? df : Array.isArray(df) ? df[0] : null;
              if (!dfStr) continue;
              if (dfStr === docPath || dfStr === norm || dfStr === withBrand) {
                setTaskSlideOver({ projectId: pw.project.id, taskId: task.id });
                return;
              }
              if (task.attachments) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const hit = (task.attachments as any[]).some((a: {path?: string}) =>
                  a?.path === docPath || a?.path === norm || a?.path === withBrand
                );
                if (hit) {
                  setTaskSlideOver({ projectId: pw.project.id, taskId: task.id });
                  return;
                }
              }
            }
          }
        }}
      />

      <TaskSlideOver
        slug={slug || ""}
        projectId={taskSlideOver?.projectId || null}
        taskId={taskSlideOver?.taskId || null}
        onClose={() => setTaskSlideOver(null)}
        onOpenDoc={(docPath) => {
          setTaskSlideOver(null);
          setDocSlideOverPath(docPath);
        }}
        onOpenChat={() => {
          if (!taskSlideOver || !slug || !projectsData) return;
          for (const pw of projectsData) {
            const task = pw.tasks.find(t => t.id === taskSlideOver.taskId);
            if (task) {
              const df = task.deliverable_file;
              const dfStr = typeof df === "string" ? df : undefined;
              handleOpenChat(task.pillar || task.id, dfStr);
              break;
            }
          }
          setTaskSlideOver(null);
        }}
      />

      <DocSlideOver
        slug={slug || ""}
        docPath={
          docSlideOverPath
            ? docSlideOverPath.startsWith("brand/")
              ? docSlideOverPath
              : `brand/${slug}/${docSlideOverPath}`
            : null
        }
        onClose={() => setDocSlideOverPath(null)}
      />
    </DashboardLayout>
  );
}
