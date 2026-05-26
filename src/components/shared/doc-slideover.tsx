"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/router";
import dynamic from "next/dynamic";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useBrandBrain } from "@/hooks/useBrandBrain";
import { useProjects } from "@/hooks/useProjects";
import { useOpenChat } from "@/hooks/useChat";
import { findTaskThreadForDoc, buildPillarThread } from "@/lib/chat-openers";
import { normalizeBrandDocPath, stripBrandPrefix } from "@/lib/doc-paths";
import { cn } from "@/lib/utils";

const MarkdownEditor = dynamic(
  () => import("@/components/brand-brain/markdown-editor").then((m) => m.MarkdownEditor),
  { ssr: false, loading: () => <p className="text-sm text-muted-foreground p-6">Cargando editor...</p> }
);

/**
 * Doc Slide-Over — pixel-perfect port of legacy v2-slideover.
 * Header: ✕ | Title | [Status dropdown] [✏️ Editar] [⤢ Abrir]
 * Body: markdown viewer OR Toast UI editor
 */

interface DocSlideOverProps {
  slug: string;
  docPath: string | null;
  onClose: () => void;
}

const FOLDER_MAP: Record<string, string> = {
  "company-brief": "company-brief",
  market: "market-analysis", competitors: "competitor-analysis",
  self: "self-analysis", swot: "market-synthesis", "market-synthesis": "market-synthesis",
  "foundation-report": "foundation-presentation", "foundation-presentation": "foundation-presentation",
  ecps: "niche-discovery", positioning: "positioning", pricing: "pricing",
  "brand-voice": "brand-voice", "visual-identity": "visual-identity",
  "strategic-plan": "strategic-plan", "metrics-plan": "metrics-setup",
};

const STATUS_OPTIONS = [
  { value: "not-started", label: "No iniciado" },
  { value: "in-progress", label: "En progreso" },
  { value: "pending-review", label: "Pendiente revision" },
  { value: "approved", label: "Aprobado" },
];

const STATUS_STYLES: Record<string, { bg: string; border: string; color: string }> = {
  "not-started": { bg: "#F5F5F5", border: "#D0D0D0", color: "#666" },
  "in-progress": { bg: "#EFF6FF", border: "#93C5FD", color: "#1D4ED8" },
  "pending-review": { bg: "#FFFBEB", border: "#FCD34D", color: "#B45309" },
  approved: { bg: "#ECFDF5", border: "#6EE7B7", color: "#047857" },
};

function docPathToLinkedKey(docPath: string): string {
  const parts = docPath.split("/").filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    const clean = parts[i].replace(".md", "").replace(".html", "");
    if (FOLDER_MAP[clean]) return FOLDER_MAP[clean];
  }
  return docPath.replace(/\/current\.md$/, "").replace(/\//g, "-");
}

function findPillarInfo(
  foundation: { sections?: Record<string, { pillars?: Record<string, { status?: string }> }> } | undefined,
  linkedKey: string
): { section: string; pillar: string; status: string } | null {
  if (!foundation?.sections) return null;
  for (const [secKey, secData] of Object.entries(foundation.sections)) {
    for (const [pName, pInfo] of Object.entries(secData.pillars || {})) {
      if (pName === linkedKey) return { section: secKey, pillar: pName, status: pInfo.status || "not-started" };
    }
  }
  return null;
}

export function DocSlideOver({ slug, docPath, onClose }: DocSlideOverProps) {
  const [content, setContent] = useState<string | null>(null);
  const [lastModified, setLastModified] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missingDoc, setMissingDoc] = useState(false);
  const [editing, setEditing] = useState(false);
  const { data: foundation, refetch: refetchFoundation } = useBrandBrain(slug);
  const { data: projectsData } = useProjects(slug || null);
  const openChat = useOpenChat();
  const router = useRouter();
  const normalizedDocPath = useMemo(() => {
    if (!docPath) return null;
    try {
      return normalizeBrandDocPath(slug, docPath);
    } catch {
      return docPath;
    }
  }, [slug, docPath]);
  const [canonicalDocPath, setCanonicalDocPath] = useState<string | null>(null);
  const activeDocPath = canonicalDocPath || normalizedDocPath;
  const isOpen = !!normalizedDocPath;

  // Fetch doc content
  useEffect(() => {
    if (!normalizedDocPath) return;
    setLoading(true);
    setError(null);
    setMissingDoc(false);
    setContent(null);
    setEditing(false);
    setCanonicalDocPath(null);

    fetch(`/api/docs/${normalizedDocPath}`)
      .then((res) => {
        if (res.status === 404) {
          setMissingDoc(true);
          return null;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!data) return;
        if (data.ok && data.content) {
          setContent(data.content);
          setLastModified(data.lastModified || null);
          setCanonicalDocPath(data.canonicalPath || data.path || normalizedDocPath);
        } else {
          setError(data.error || "No se pudo cargar el documento");
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [normalizedDocPath]);

  // Body scroll lock
  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  // Pillar info for status dropdown
  const linkedKey = useMemo(() => activeDocPath ? docPathToLinkedKey(activeDocPath) : "", [activeDocPath]);
  const pillarInfo = useMemo(() => findPillarInfo(foundation, linkedKey), [foundation, linkedKey]);
  const normStatus = pillarInfo
    ? pillarInfo.status === "done" ? "approved" : pillarInfo.status === "generated" ? "pending-review" : pillarInfo.status
    : null;
  const currentStatus = normStatus && STATUS_STYLES[normStatus] ? normStatus : "not-started";
  const statusStyle = STATUS_STYLES[currentStatus];

  // Title
  const displayTitle = activeDocPath
    ?.split("/").pop()
    ?.replace(/\.md$/, "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "Documento";

  async function handleStatusChange(newStatus: string) {
    if (!pillarInfo) return;
    try {
      await fetch("/api/foundation/pillar-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, section: pillarInfo.section, pillar: pillarInfo.pillar, status: newStatus }),
      });
      refetchFoundation();
    } catch { /* ignore */ }
  }

  function handleOpenFull() {
    onClose();
    if (!activeDocPath) {
      router.push(`/dashboard/${slug}/brand-brain`);
      return;
    }
    // Convergence rule (2026-04-15): before opening the full doc viewer,
    // resolve the thread that owns this doc — if it's attached to a task,
    // we open THAT thread (not a new pillar/content thread). Then we trigger
    // openChat() so the chat sidebar is already populated when the user
    // arrives at the foundation page. Finally we router.push (not
    // window.location.href) so the navigation is client-side and instant.
    const taskThread = findTaskThreadForDoc(slug, activeDocPath, projectsData);
    if (taskThread) {
      openChat(slug, taskThread);
    } else {
      // Fallback: derive a pillar thread for the doc. linkedKey is the
      // pillar slug we computed from the docPath.
      if (linkedKey) {
        const config = buildPillarThread(slug, linkedKey, activeDocPath);
        openChat(slug, config);
      }
    }
    router.push(`/dashboard/${slug}/brand-brain?doc=${encodeURIComponent(activeDocPath)}`);
  }

  async function handleSave(newContent: string) {
    if (!activeDocPath) return;
    const res = await fetch(`/api/docs/${activeDocPath}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: newContent }),
    });
    if (!res.ok) throw new Error("Save failed");
    // Refresh content
    setContent(newContent);
    setMissingDoc(false);
    setLastModified(new Date().toISOString());
    setEditing(false);
  }

  async function handleCreateDraft() {
    if (!docPath) return;
    const ext = docPath.split(".").pop()?.toLowerCase();
    if (ext !== "md" && ext !== "html") return;
    const draft = ext === "html"
      ? `<!doctype html>\n<html lang="es">\n<head>\n  <meta charset="utf-8" />\n  <title>${displayTitle}</title>\n</head>\n<body>\n  <h1>${displayTitle}</h1>\n</body>\n</html>\n`
      : `# ${displayTitle}\n\n> Documento esperado declarado por la task. Completa este borrador con el output final.\n\n`;
    await handleSave(draft);
    if (ext === "md") setEditing(true);
  }

  // ── Public share link ────────────────────────────────────────────────
  // Generates a stateless HMAC-signed token via /api/docs/share, then
  // copies the resulting public URL to the clipboard. Third parties can
  // open the URL without needing MC login.
  const [shareCopied, setShareCopied] = useState(false);
  async function handleCopyShareLink() {
    if (!activeDocPath || !slug) return;
    try {
      const res = await fetch("/api/docs/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, docPath: activeDocPath }),
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
      // Surface a soft error in the button state so the user knows it failed.
      console.error("Share link copy failed:", (e as Error).message);
      setShareCopied(false);
    }
  }

  const isJson = activeDocPath?.endsWith(".json") || false;
  const canCreateDraft = !!activeDocPath && (activeDocPath.endsWith(".md") || activeDocPath.endsWith(".html"));
  const parsedJson = useMemo(() => {
    if (!isJson || !content) return null;
    try { return JSON.parse(content); } catch { return null; }
  }, [isJson, content]);

  // ── HTML 2-col edit/preview state ─────────────────────────────────
  // For any `.html` document we render a split view: text editor (left) +
  // live iframe preview (right). For carousel templates specifically, the
  // preview goes through the template-preview-html endpoint so `{{slot.*}}`
  // and `{{brand.*}}` placeholders get resolved to the brand's actual
  // values — that way you see the real render, not the template source.
  const isHtmlDoc = !!(activeDocPath?.endsWith(".html") || (content && (content.trimStart().startsWith("<!DOCTYPE") || content.trimStart().startsWith("<html"))));
  const [htmlDraft, setHtmlDraft] = useState<string>("");
  const [savingHtml, setSavingHtml] = useState(false);
  const [previewRevision, setPreviewRevision] = useState(0);
  useEffect(() => {
    if (isHtmlDoc && content !== null) setHtmlDraft(content);
  }, [isHtmlDoc, content]);

  const templateInfo = useMemo(() => {
    if (!activeDocPath) return null;
    const m = activeDocPath.match(/^brand\/([^/]+)\/brand-book\/visual-identity\/templates\/([^/]+)\/(slide-cover|slide-body|slide-cta|template)\.html$/);
    if (!m) return null;
    return { slug: m[1], id: m[2], file: m[3] };
  }, [activeDocPath]);

  const previewSrc = templateInfo
    ? `/api/content-engine/template-preview-html?slug=${encodeURIComponent(templateInfo.slug)}&id=${encodeURIComponent(templateInfo.id)}&file=${templateInfo.file}&_=${previewRevision}`
    : null;
  const isHtmlDirty = isHtmlDoc && content !== null && htmlDraft !== content;

  async function handleSaveHtml() {
    if (!activeDocPath || htmlDraft === null) return;
    setSavingHtml(true);
    try {
      const res = await fetch(`/api/docs/${activeDocPath}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: htmlDraft }),
      });
      if (!res.ok) throw new Error("Save failed");
      setContent(htmlDraft);
      setPreviewRevision((r) => r + 1);  // bust iframe cache
    } finally {
      setSavingHtml(false);
    }
  }

  const btnClass = "inline-flex items-center gap-1.5 px-2.5 py-1 text-[13px] bg-transparent border border-[#E5E2DC] dark:border-[#313244] rounded-md cursor-pointer text-[#7A7A7A] dark:text-[#6c7086] hover:bg-[#E5E2DC] dark:hover:bg-[#313244] hover:text-[#1A1A1A] dark:hover:text-[#cdd6f4] transition-colors";

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
          "w-[75vw] max-sm:w-screen",
          !isOpen && "invisible"
        )}
        style={{ right: isOpen ? 0 : "-100vw" }}
      >
        {/* Header */}
        <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-[#E5E2DC] dark:border-[#313244] bg-[#FAFAF8] dark:bg-[#181825] shrink-0">
          <button type="button" onClick={onClose} className="bg-transparent border-none text-lg cursor-pointer text-[#7A7A7A] dark:text-[#6c7086] px-2 py-1 rounded-md hover:bg-[#E5E2DC] dark:hover:bg-[#313244] hover:text-[#1A1A1A] dark:hover:text-[#cdd6f4] transition-colors">
            ✕
          </button>
          <span className="text-[13px] font-bold text-[#1A1A1A] dark:text-[#cdd6f4] truncate">
            {displayTitle}
          </span>

          <div className="ml-auto flex items-center gap-2">
            {pillarInfo && (
              <select
                value={currentStatus}
                onChange={(e) => handleStatusChange(e.target.value)}
                className="px-2 py-1 text-xs font-semibold rounded-md cursor-pointer border"
                style={{ background: statusStyle.bg, borderColor: statusStyle.border, color: statusStyle.color }}
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            )}

            {!isJson && !isHtmlDoc && (
              <button type="button" onClick={() => { if (editing) { setEditing(false); } else if (content) { setEditing(true); } }} className={btnClass}>
                {editing ? "👁 Ver" : "✏️ Editar"}
              </button>
            )}

            {isHtmlDoc && (
              <button
                type="button"
                onClick={handleSaveHtml}
                disabled={!isHtmlDirty || savingHtml}
                className={cn(btnClass, isHtmlDirty && "!bg-rust !text-white !border-rust hover:!bg-rust/90")}
                title={isHtmlDirty ? "Guardar cambios y refrescar preview" : "No hay cambios pendientes"}
              >
                {savingHtml ? "Guardando..." : isHtmlDirty ? "💾 Guardar" : "💾 Guardado"}
              </button>
            )}

            <button
              type="button"
              onClick={handleCopyShareLink}
              disabled={missingDoc}
              className={cn(btnClass, missingDoc && "opacity-50 cursor-not-allowed hover:bg-transparent")}
              title="Copia un link público para compartir con terceros"
            >
              {shareCopied ? "✓ Copiado" : "🔗 Compartir"}
            </button>

            {/* Task link — find the task that owns this doc by searching projectsData directly */}
            {(() => {
              if (!activeDocPath || !projectsData) return null;
              const norm = stripBrandPrefix(activeDocPath, slug);
              const withBrand = activeDocPath;
              for (const pw of projectsData) {
                for (const task of pw.tasks) {
                  const df = task.deliverable_file;
                  const dfStr = typeof df === "string" ? df : Array.isArray(df) ? df[0] : null;
                  if (!dfStr) continue;
                  if (dfStr === activeDocPath || dfStr === norm || dfStr === withBrand) {
                    return (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          router.push(`/dashboard/${slug}/tasks/${task.id}`);
                        }}
                        className={btnClass}
                        title={`Ir a tarea ${task.id}`}
                      >
                        📋 Tarea
                      </button>
                    );
                  }
                  // Check attachments too
                  if (task.attachments) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const hit = (task.attachments as any[]).some((a: {path?: string}) =>
                      a?.path === activeDocPath || a?.path === norm || a?.path === withBrand
                    );
                    if (hit) {
                      return (
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            router.push(`/dashboard/${slug}/tasks/${task.id}`);
                          }}
                          className={btnClass}
                          title={`Ir a tarea ${task.id}`}
                        >
                          📋 Tarea
                        </button>
                      );
                    }
                  }
                }
              }
              return null;
            })()}

            <button
              type="button"
              onClick={handleOpenFull}
              disabled={missingDoc}
              className={cn(btnClass, missingDoc && "opacity-50 cursor-not-allowed hover:bg-transparent")}
              title="Abrir en Documents"
            >
              ⤢ Abrir
            </button>
          </div>
        </div>

        {/* Body — viewer or editor.
            Key forces clean remount when activeDocPath changes, preventing
            Toast UI editor DOM desync (removeChild crash). */}
        {editing && content !== null ? (
          <div className="flex-1 min-h-0" key={`editor-${activeDocPath}`}>
            <MarkdownEditor
              initialContent={content}
              onSave={handleSave}
              onCancel={() => setEditing(false)}
            />
          </div>
        ) : isHtmlDoc && content !== null ? (
          <div className="flex-1 min-h-0 grid grid-cols-2 divide-x divide-[#E5E2DC] dark:divide-[#313244]">
            {/* HTML editor (left) */}
            <div className="flex flex-col min-h-0 bg-[#1e1e2e]">
              <div className="px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider text-[#a6adc8] border-b border-[#313244] bg-[#181825] flex items-center justify-between">
                <span>HTML · {activeDocPath?.split("/").pop()}</span>
                {isHtmlDirty && <span className="text-[10px] text-[#f9e2af]">● sin guardar</span>}
              </div>
              <textarea
                value={htmlDraft}
                onChange={(e) => setHtmlDraft(e.target.value)}
                className="flex-1 w-full font-mono text-[12px] leading-relaxed p-4 bg-[#1e1e2e] text-[#cdd6f4] border-0 focus:outline-none resize-none"
                spellCheck={false}
              />
            </div>
            {/* Preview (right) */}
            <div className="flex flex-col min-h-0 bg-[#fafafa] dark:bg-[#181825]">
              <div className="px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider text-[#7A7A7A] dark:text-[#6c7086] border-b border-[#E5E2DC] dark:border-[#313244] bg-[#FAFAF8] dark:bg-[#181825] flex items-center justify-between">
                <span>
                  {templateInfo ? "Preview con slots de prueba (sustituye {{...}})" : "Preview HTML"}
                </span>
                {isHtmlDirty && (
                  <span className="text-[10px] text-rust">guarda para refrescar</span>
                )}
              </div>
              <div className="flex-1 overflow-auto p-4">
                <iframe
                  key={`preview-${previewRevision}`}
                  src={previewSrc || undefined}
                  srcDoc={previewSrc ? undefined : (isHtmlDirty ? htmlDraft : content)}
                  className="w-full border border-[#E5E2DC] rounded-lg bg-white"
                  style={{ minHeight: "calc(100vh - 160px)" }}
                  sandbox="allow-same-origin"
                  title={displayTitle}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6">
            {loading && <p className="text-sm text-muted-foreground text-center py-20">Cargando documento...</p>}
            {missingDoc && (
              <div className="mx-auto max-w-xl rounded-xl border border-dashed border-[#D8CDBA] bg-[#FAF4E3] p-6 text-center">
                <div className="text-3xl mb-3">▣</div>
                <h3 className="font-heading text-lg font-bold text-[#1D1A17]">Documento esperado pendiente</h3>
                <p className="mt-2 text-sm text-[#6D6257]">
                  La task declara este output, pero el archivo todavía no existe. Esto es normal si el agente aún no lo ha producido.
                </p>
                <div className="mt-4 rounded-md bg-white/70 px-3 py-2 text-left font-mono text-[11px] text-[#6D6257] break-all">
                  {activeDocPath}
                </div>
                {canCreateDraft && (
                  <button
                    type="button"
                    onClick={handleCreateDraft}
                    className="mt-5 inline-flex items-center justify-center rounded-md border-2 border-[#1B1720] bg-[#F7C948] px-4 py-2 text-sm font-bold text-[#1B1720] shadow-[3px_3px_0_#1B1720] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0_#1B1720]"
                  >
                    Crear borrador
                  </button>
                )}
              </div>
            )}
            {error && !missingDoc && <p className="text-sm text-red-500 text-center py-20">{error}</p>}
            {content && (
              isJson && parsedJson ? (
                <JsonViewer data={parsedJson} />
              ) : (
                <article className={cn(
                  "prose prose-sm max-w-none dark:prose-invert",
                  "prose-headings:font-heading prose-headings:text-rust prose-a:text-rust",
                  "prose-table:border-collapse prose-th:border prose-th:border-border prose-th:px-3 prose-th:py-2 prose-th:bg-muted/30 prose-th:text-left prose-th:text-xs prose-th:font-bold",
                  "prose-td:border prose-td:border-border prose-td:px-3 prose-td:py-2 prose-td:text-xs",
                )}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
                </article>
              )
            )}
          </div>
        )}

        {/* Footer */}
        {activeDocPath && !editing && (
          <div className="flex items-center justify-between px-4 py-2 border-t border-[#E5E2DC] dark:border-[#313244] bg-[#FAFAF8] dark:bg-[#181825] text-[10px] text-muted-foreground shrink-0">
            <span className="truncate">{activeDocPath}</span>
            {lastModified && (
              <span className="flex-shrink-0 ml-3">
                Editado: {new Date(lastModified).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// JSON Viewer — renders structured JSON as readable cards and tables
// ---------------------------------------------------------------------------

export function JsonViewer({ data }: { data: unknown }) {
  if (data === null || data === undefined) return <span className="text-muted-foreground text-xs">null</span>;
  if (typeof data !== "object") return <span className="text-sm">{String(data)}</span>;

  // Top-level: show metadata header + render data section
  const obj = data as Record<string, unknown>;
  const metaKeys = ["module", "version", "created_at", "updated_at", "status", "metadata"];
  const contentKeys = Object.keys(obj).filter((k) => !metaKeys.includes(k));
  const hasMeta = metaKeys.some((k) => k in obj);

  return (
    <div className="space-y-4">
      {/* Metadata header */}
      {hasMeta && (
        <div className="flex flex-wrap gap-3 pb-3 border-b border-border">
          {obj.module ? <MetaBadge label="Modulo" value={String(obj.module)} /> : null}
          {obj.status ? <MetaBadge label="Estado" value={String(obj.status)} /> : null}
          {obj.version ? <MetaBadge label="Version" value={String(obj.version)} /> : null}
          {obj.created_at ? <MetaBadge label="Creado" value={new Date(String(obj.created_at)).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })} /> : null}
          {obj.updated_at ? <MetaBadge label="Actualizado" value={new Date(String(obj.updated_at)).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })} /> : null}
        </div>
      )}

      {/* Content sections */}
      {contentKeys.map((key) => (
        <JsonSection key={key} label={key} data={obj[key]} depth={0} />
      ))}
    </div>
  );
}

function MetaBadge({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className="text-muted-foreground font-medium">{label}:</span>
      <span className="font-semibold text-foreground bg-muted/50 px-2 py-0.5 rounded">{value}</span>
    </div>
  );
}

// Smart cell renderer — detects scores, URLs, types, severity, etc.
function SmartCell({ colKey, value }: { colKey: string; value: unknown }) {
  if (value === null || value === undefined) return <span className="text-muted-foreground">—</span>;
  const str = String(value);
  const key = colKey.toLowerCase();

  // Score / numeric fields with color coding
  if ((key.includes("score") || key === "kd" || key.includes("impact") || key.includes("relevance")) && typeof value === "number") {
    const color = value >= 70 ? "text-green-700" : value >= 40 ? "text-yellow-700" : "text-muted-foreground";
    return <span className={cn("font-bold tabular-nums", color)}>{value}</span>;
  }

  // Volume with K formatting
  if ((key === "vol" || key === "volume" || key.includes("search_volume") || key === "subscribers") && typeof value === "number") {
    const fmt = value >= 1000 ? `${(value / 1000).toFixed(1)}K` : String(value);
    return <span className="tabular-nums font-medium">{fmt}</span>;
  }

  // Percentage
  if (key.includes("pct") || key.includes("percent") || key.includes("rate") || key.includes("visibility")) {
    const num = typeof value === "number" ? value : parseFloat(str);
    if (!isNaN(num)) {
      const color = num >= 70 ? "text-green-700" : num >= 40 ? "text-yellow-700" : "text-muted-foreground";
      return <span className={cn("font-bold tabular-nums", color)}>{num.toFixed(1)}%</span>;
    }
  }

  // Type / category / tag fields → colored badge
  if (key === "type" || key === "category" || key === "content_type" || key === "recommendation_type" || key === "source" || key === "platform") {
    const tagColors: Record<string, string> = {
      keyword: "bg-blue-50 text-blue-700 border-blue-200",
      prompt: "bg-purple-50 text-purple-700 border-purple-200",
      critical: "bg-red-50 text-red-700 border-red-200",
      high: "bg-orange-50 text-orange-700 border-orange-200",
      medium: "bg-yellow-50 text-yellow-700 border-yellow-200",
      low: "bg-muted/50 text-muted-foreground border-border",
      youtube: "bg-red-50 text-red-700 border-red-200",
      instagram: "bg-pink-50 text-pink-700 border-pink-200",
      review: "bg-green-50 text-green-700 border-green-200",
      ranking: "bg-blue-50 text-blue-700 border-blue-200",
      guide: "bg-purple-50 text-purple-700 border-purple-200",
    };
    const cls = tagColors[str.toLowerCase()] || "bg-muted/40 text-foreground border-border";
    return <span className={cn("inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full border", cls)}>{str}</span>;
  }

  // Severity
  if (key === "severity" || key === "priority" || key === "threat_level") {
    const sevColors: Record<string, string> = {
      critical: "bg-red-100 text-red-800",
      high: "bg-orange-100 text-orange-800",
      medium: "bg-yellow-100 text-yellow-800",
      low: "bg-muted/50 text-muted-foreground",
    };
    const cls = sevColors[str.toLowerCase()] || "bg-muted/40";
    return <span className={cn("inline-block text-[10px] font-bold px-2 py-0.5 rounded-full", cls)}>{str}</span>;
  }

  // Sentiment
  if (key === "sentiment") {
    const cls = str === "positive" ? "text-green-700" : str === "negative" ? "text-red-700" : "text-muted-foreground";
    return <span className={cn("font-medium", cls)}>{str}</span>;
  }

  // URL / domain — linkify
  if (key === "url" || key === "profile_url" || key === "source_url") {
    return <a href={str} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate block max-w-[200px]">{str.replace(/^https?:\/\/(www\.)?/, "")}</a>;
  }
  if (key === "domain") {
    return <span className="font-medium text-foreground">{str}</span>;
  }

  // Boolean
  if (typeof value === "boolean") {
    return <span>{value ? "✓" : "✗"}</span>;
  }

  // Arrays in cells
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-muted-foreground">—</span>;
    return (
      <div className="flex flex-wrap gap-1">
        {value.slice(0, 5).map((v, i) => (
          <span key={i} className="text-[10px] bg-muted/40 px-1.5 py-0.5 rounded">{String(v)}</span>
        ))}
        {value.length > 5 && <span className="text-[10px] text-muted-foreground">+{value.length - 5}</span>}
      </div>
    );
  }

  // Nested objects in cells
  if (typeof value === "object") {
    return <span className="text-muted-foreground text-[10px]">{JSON.stringify(value).slice(0, 80)}</span>;
  }

  // Name/title fields — bold
  if (key === "name" || key === "title" || key === "keyword" || key === "handle" || key === "display_name") {
    return <span className="font-semibold">{str}</span>;
  }

  return <>{str}</>;
}

function JsonSection({ label, data, depth }: { label: string; data: unknown; depth: number }) {
  const title = label.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  if (data === null || data === undefined) return null;

  // Primitive
  if (typeof data !== "object") {
    return (
      <div className="flex items-baseline gap-2 py-0.5">
        <span className="text-xs text-muted-foreground font-medium min-w-[120px]">{title}</span>
        <SmartCell colKey={label} value={data} />
      </div>
    );
  }

  // Array of objects → table with smart cells
  if (Array.isArray(data) && data.length > 0 && typeof data[0] === "object" && data[0] !== null) {
    const allKeys = Array.from(new Set(data.flatMap((row) => Object.keys(row as Record<string, unknown>))));
    // Prioritize name/title/keyword first, then the rest, cap at 8
    const priorityKeys = ["name", "title", "keyword", "handle", "display_name", "domain", "url"];
    const sorted = [
      ...priorityKeys.filter((k) => allKeys.includes(k)),
      ...allKeys.filter((k) => !priorityKeys.includes(k)),
    ];
    const keys = sorted.slice(0, 8);

    return (
      <div>
        <div className="flex items-baseline justify-between mb-2">
          <h3 className="text-sm font-bold text-foreground">{title}</h3>
          <span className="text-[10px] text-muted-foreground font-medium">{data.length} registros</span>
        </div>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-muted/30">
                {keys.map((k) => (
                  <th key={k} className="text-left px-3 py-2 font-bold border-b-2 border-border text-muted-foreground text-[10px] uppercase tracking-wider whitespace-nowrap">
                    {k.replace(/[_-]/g, " ")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => {
                const r = row as Record<string, unknown>;
                return (
                  <tr key={i} className="border-b border-border/50 last:border-0 hover:bg-muted/10 transition-colors">
                    {keys.map((k) => (
                      <td key={k} className="px-3 py-2 max-w-[250px]">
                        <SmartCell colKey={k} value={r[k]} />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {data.length > 50 && <p className="text-[10px] text-muted-foreground mt-1">Mostrando {Math.min(data.length, 50)} de {data.length} filas</p>}
      </div>
    );
  }

  // Array of primitives — chips
  if (Array.isArray(data)) {
    return (
      <div>
        <h3 className="text-sm font-bold text-foreground mb-1">{title}</h3>
        <div className="flex flex-wrap gap-1.5">
          {data.map((item, i) => (
            <span key={i} className="text-xs bg-muted/40 px-2 py-0.5 rounded font-medium">{String(item)}</span>
          ))}
        </div>
      </div>
    );
  }

  // Nested object — card
  const entries = Object.entries(data as Record<string, unknown>);

  // Summary card: if object has mostly numeric values at depth 0, show as score grid
  if (depth === 0) {
    const numericEntries = entries.filter(([, v]) => typeof v === "number");
    if (numericEntries.length >= 3 && numericEntries.length === entries.length) {
      return (
        <div>
          <h3 className="text-sm font-bold text-foreground mb-2">{title}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {numericEntries.map(([k, v]) => {
              const num = v as number;
              const color = k.includes("error") || k.includes("critical") ? "text-red-700"
                : num >= 70 ? "text-green-700" : num >= 40 ? "text-yellow-700" : "text-blue-700";
              return (
                <div key={k} className="bg-muted/10 border border-border rounded-lg p-3 text-center">
                  <div className={cn("text-xl font-extrabold tabular-nums", color)}>{num}</div>
                  <div className="text-[10px] text-muted-foreground font-semibold mt-1 uppercase tracking-wider">
                    {k.replace(/[_-]/g, " ")}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }
  }

  if (depth > 2) {
    return (
      <div className="py-0.5">
        <span className="text-xs text-muted-foreground font-medium">{title}: </span>
        <span className="text-xs">{JSON.stringify(data).slice(0, 100)}</span>
      </div>
    );
  }

  return (
    <div className={depth === 0 ? "bg-background border border-border rounded-lg p-4" : "pl-3 border-l-2 border-border"}>
      <h3 className={cn("font-bold text-foreground mb-2", depth === 0 ? "text-sm" : "text-xs")}>{title}</h3>
      <div className="space-y-1.5">
        {entries.map(([k, v]) => (
          <JsonSection key={k} label={k} data={v} depth={depth + 1} />
        ))}
      </div>
    </div>
  );
}
