"use client";

import { useEffect, useState, useMemo } from "react";
import dynamic from "next/dynamic";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useFoundation } from "@/hooks/useFoundation";
import { cn } from "@/lib/utils";

const MarkdownEditor = dynamic(
  () => import("@/components/foundation/markdown-editor").then((m) => m.MarkdownEditor),
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const { data: foundation, refetch: refetchFoundation } = useFoundation(slug);
  const isOpen = !!docPath;

  // Fetch doc content
  useEffect(() => {
    if (!docPath) return;
    setLoading(true);
    setError(null);
    setContent(null);
    setEditing(false);

    fetch(`/api/docs/${docPath}`)
      .then((res) => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
      .then((data) => { if (data.ok && data.content) setContent(data.content); else setError(data.error || "Not found"); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [docPath]);

  // Body scroll lock
  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  // Pillar info for status dropdown
  const linkedKey = useMemo(() => docPath ? docPathToLinkedKey(docPath) : "", [docPath]);
  const pillarInfo = useMemo(() => findPillarInfo(foundation, linkedKey), [foundation, linkedKey]);
  const normStatus = pillarInfo
    ? pillarInfo.status === "done" ? "approved" : pillarInfo.status === "generated" ? "pending-review" : pillarInfo.status
    : null;
  const currentStatus = normStatus && STATUS_STYLES[normStatus] ? normStatus : "not-started";
  const statusStyle = STATUS_STYLES[currentStatus];

  // Title
  const displayTitle = docPath
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
    if (docPath) window.location.href = `/dashboard/${slug}/foundation?doc=${encodeURIComponent(docPath)}`;
    else window.location.href = `/dashboard/${slug}/foundation`;
  }

  async function handleSave(newContent: string) {
    if (!docPath) return;
    const res = await fetch(`/api/docs/${docPath}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: newContent }),
    });
    if (!res.ok) throw new Error("Save failed");
    // Refresh content
    setContent(newContent);
    setEditing(false);
  }

  const isJson = docPath?.endsWith(".json") || false;
  const parsedJson = useMemo(() => {
    if (!isJson || !content) return null;
    try { return JSON.parse(content); } catch { return null; }
  }, [isJson, content]);

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

            {!isJson && !(docPath?.endsWith(".html") || (content && (content.trimStart().startsWith("<!DOCTYPE") || content.trimStart().startsWith("<html")))) && (
              <button type="button" onClick={() => { if (editing) { setEditing(false); } else if (content) { setEditing(true); } }} className={btnClass}>
                {editing ? "👁 Ver" : "✏️ Editar"}
              </button>
            )}

            <button type="button" onClick={handleOpenFull} className={btnClass} title="Abrir en Documents">
              ⤢ Abrir
            </button>
          </div>
        </div>

        {/* Body — viewer or editor */}
        {editing && content !== null ? (
          <div className="flex-1 min-h-0">
            <MarkdownEditor
              initialContent={content}
              onSave={handleSave}
              onCancel={() => setEditing(false)}
            />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6">
            {loading && <p className="text-sm text-muted-foreground text-center py-20">Cargando documento...</p>}
            {error && <p className="text-sm text-red-500 text-center py-20">{error}</p>}
            {content && (
              isJson && parsedJson ? (
                <JsonViewer data={parsedJson} />
              ) : (docPath?.endsWith(".html") || content.trimStart().startsWith("<!DOCTYPE") || content.trimStart().startsWith("<html")) ? (
                <iframe
                  srcDoc={content}
                  className="w-full border-0 rounded-lg bg-white"
                  style={{ minHeight: "calc(100vh - 120px)" }}
                  sandbox="allow-same-origin"
                  title={displayTitle}
                />
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
        {docPath && !editing && (
          <div className="flex items-center px-4 py-2 border-t border-[#E5E2DC] dark:border-[#313244] bg-[#FAFAF8] dark:bg-[#181825] text-[10px] text-muted-foreground shrink-0">
            <span className="truncate">{docPath}</span>
          </div>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// JSON Viewer — renders structured JSON as readable cards and tables
// ---------------------------------------------------------------------------

function JsonViewer({ data }: { data: unknown }) {
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

function JsonSection({ label, data, depth }: { label: string; data: unknown; depth: number }) {
  const title = label.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  if (data === null || data === undefined) return null;

  // Primitive
  if (typeof data !== "object") {
    return (
      <div className="flex items-baseline gap-2 py-0.5">
        <span className="text-xs text-muted-foreground font-medium min-w-[120px]">{title}</span>
        <span className="text-sm">{String(data)}</span>
      </div>
    );
  }

  // Array of objects → table
  if (Array.isArray(data) && data.length > 0 && typeof data[0] === "object" && data[0] !== null) {
    const keys = Array.from(new Set(data.flatMap((row) => Object.keys(row as Record<string, unknown>)))).slice(0, 8);
    return (
      <div>
        <h3 className="text-sm font-bold text-[#2C3E50] mb-2">{title}</h3>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-muted/30">
                {keys.map((k) => (
                  <th key={k} className="text-left px-3 py-2 font-bold border-b border-border text-muted-foreground">
                    {k.replace(/[_-]/g, " ")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => {
                const r = row as Record<string, unknown>;
                return (
                  <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/10">
                    {keys.map((k) => (
                      <td key={k} className="px-3 py-2 max-w-[250px] truncate">
                        {typeof r[k] === "object" && r[k] !== null
                          ? Array.isArray(r[k]) ? (r[k] as unknown[]).length + " items" : JSON.stringify(r[k]).slice(0, 60)
                          : String(r[k] ?? "")}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {data.length > 20 && <p className="text-[10px] text-muted-foreground mt-1">{data.length} filas totales</p>}
      </div>
    );
  }

  // Array of primitives
  if (Array.isArray(data)) {
    return (
      <div>
        <h3 className="text-sm font-bold text-[#2C3E50] mb-1">{title}</h3>
        <div className="flex flex-wrap gap-1">
          {data.map((item, i) => (
            <span key={i} className="text-xs bg-muted/40 px-2 py-0.5 rounded">{String(item)}</span>
          ))}
        </div>
      </div>
    );
  }

  // Nested object — card
  const entries = Object.entries(data as Record<string, unknown>);
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
      <h3 className={cn("font-bold text-[#2C3E50] mb-2", depth === 0 ? "text-sm" : "text-xs")}>{title}</h3>
      <div className="space-y-1.5">
        {entries.map(([k, v]) => (
          <JsonSection key={k} label={k} data={v} depth={depth + 1} />
        ))}
      </div>
    </div>
  );
}
