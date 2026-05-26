/**
 * Foundation Doc Viewer — faithful port of legacy doc browser view.
 * Fetches markdown, renders with ReactMarkdown + remark-gfm.
 * Uses /api/docs/ endpoint (docPath already includes brand/{slug}/...).
 */

"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

interface DocViewerProps {
  slug: string;
  docPath: string;
  onBack: () => void;
}

export function DocViewer({ slug, docPath, onBack }: DocViewerProps) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setContent(null);

    // docPath already includes "brand/{slug}/..." — use /api/docs/ directly
    fetch(`/api/docs/${docPath}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (data.ok && data.content) {
          setContent(data.content);
        } else {
          setError(data.error || "Documento no encontrado");
        }
      })
      .catch((e) => {
        setError(e.message || "Error cargando documento");
      })
      .finally(() => setLoading(false));
  }, [slug, docPath]);

  // Breadcrumbs from docPath — strip "brand/{slug}/" prefix for display
  const displayPath = docPath.replace(/^brand\/[^/]+\//, "");
  const parts = displayPath.split("/").filter(Boolean);
  const fileName = parts[parts.length - 1] || displayPath;
  const folderParts = parts.slice(0, -1);

  return (
    <div className="flex flex-col h-full">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-1.5 text-sm flex-wrap px-1 mb-3">
        <button
          type="button"
          onClick={onBack}
          className="text-rust font-semibold hover:underline shrink-0"
        >
          {"\u2190"} {slug}
        </button>
        {folderParts.map((part) => (
          <span key={part} className="flex items-center gap-1.5">
            <span className="text-muted-foreground">{"\u203A"}</span>
            <span className="text-muted-foreground">{part}</span>
          </span>
        ))}
        <span className="text-muted-foreground">{"\u203A"}</span>
        <span className="font-bold text-foreground">{fileName}</span>
      </div>

      {/* Doc content */}
      <div className="flex-1 overflow-auto rounded-lg border border-border bg-card p-6">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <p className="text-sm text-muted-foreground">Cargando documento...</p>
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center py-20">
            <p className="text-sm text-red-500 mb-2">Error: {error}</p>
            <button
              type="button"
              onClick={onBack}
              className="text-sm text-rust hover:underline"
            >
              Volver al listado
            </button>
          </div>
        )}

        {content && (
          <article
            className={cn(
              "prose prose-sm max-w-none",
              "dark:prose-invert",
              "prose-headings:font-heading prose-headings:text-rust",
              "prose-a:text-rust",
              "prose-table:border-collapse prose-th:border prose-th:border-border prose-th:px-3 prose-th:py-2 prose-th:bg-muted/30 prose-th:text-left prose-th:text-xs prose-th:font-bold",
              "prose-td:border prose-td:border-border prose-td:px-3 prose-td:py-2 prose-td:text-xs",
            )}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </article>
        )}
      </div>
    </div>
  );
}
