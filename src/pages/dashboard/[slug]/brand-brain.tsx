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
import { useState, useCallback, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useSlugSync } from "@/hooks/useSlugSync";
import { useBrandBrain, useBrandBrainOtherDocs, useUpdatePillarStatus } from "@/hooks/useBrandBrain";
import { useOpenChat } from "@/hooks/useChat";
import { useProjects } from "@/hooks/useProjects";
import { buildPillarThread, findTaskThreadForDoc } from "@/lib/chat-openers";
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
import type { BrandBrainState, Section, Pillar, PillarStatus } from "@/types";

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
        pInfo.status === "not-started" && ffDone.has(pName) ? "approved" : pInfo.status;
      if (["approved", "done"].includes(effective)) approved++;
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

  useEffect(() => {
    if (!selectedDoc?.docPath) {
      setDocContent(null);
      setDocLastModified(null);
      setDocUsedFallback(false);
      setDocCanonicalPath(null);
      return;
    }
    setDocLoading(true);
    setDocContent(null);
    setDocLastModified(null);
    setDocUsedFallback(false);
    setDocCanonicalPath(null);
    setEditing(false);
    fetch(`/api/docs/${selectedDoc.docPath}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && data.content) {
          setDocContent(data.content);
          setDocLastModified(data.lastModified || null);
          setDocUsedFallback(Boolean(data.usedFallback));
          setDocCanonicalPath(data.canonicalPath || null);
        }
      })
      .catch(() => {})
      .finally(() => setDocLoading(false));
  }, [selectedDoc?.docPath]);

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
        pillar: { status: "approved" } as Pillar,
        docPath: docParam,
      });
      return;
    }
    setSelectedDoc({ sectionKey: "", pillarKey: docParam.split("/").pop()?.replace(".md", "") || "", pillar: { status: "approved" } as Pillar, docPath: docParam });
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
        pillar: { status: "approved" } as Pillar,
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
      (selectedDoc.pillar.status as string) === "done" ? "approved"
        : selectedDoc.pillar.status === "generated" ? "pending-review"
          : selectedDoc.pillar.status || "not-started";

    const btnClass = "inline-flex items-center gap-1.5 px-2.5 py-1 text-[13px] bg-transparent border border-[#E5E2DC] dark:border-[#313244] rounded-md cursor-pointer text-[#7A7A7A] dark:text-[#6c7086] hover:bg-[#E5E2DC] dark:hover:bg-[#313244] hover:text-[#1A1A1A] dark:hover:text-[#cdd6f4] transition-colors";

    return (
      <DashboardLayout>
        <Head>
          <title>{`${pillarTitle} - ${slug} - Mission Control`}</title>
        </Head>

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
          {docUsedFallback && docCanonicalPath?.endsWith("/lite.md") && (
            <span
              className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200 flex-shrink-0"
              title={`Mostrando ${docCanonicalPath} (preliminar de fast-foundation). Ejecuta la skill full para producir current.md.`}
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
            return (
              <iframe
                srcDoc={docContent}
                className="w-full border border-[#E5E2DC] rounded-lg bg-white"
                style={{ minHeight: "80vh" }}
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
          {"🧠"} Brand Brain
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
