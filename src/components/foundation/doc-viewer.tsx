/**
 * Foundation Doc Viewer — renders markdown content for a selected pillar doc.
 * Fetches from /api/chat/doc/{slug}/{docPath} and renders with ReactMarkdown.
 */

"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
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

    fetch(`/api/chat/doc/${slug}/${docPath}`)
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

  // Breadcrumbs
  const parts = docPath.split("/").filter(Boolean);
  const fileName = parts[parts.length - 1] || docPath;
  const folderParts = parts.slice(0, -1);

  return (
    <div className="flex flex-col h-full">
      {/* Top bar with back + breadcrumbs */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-rust font-semibold hover:underline shrink-0"
        >
          {"\u2190"} Volver
        </button>

        <div className="flex items-center gap-1.5 text-sm flex-wrap">
          <button
            type="button"
            onClick={onBack}
            className="text-rust font-bold hover:underline"
          >
            {"\uD83D\uDCC2"} {slug}
          </button>
          {folderParts.map((part) => (
            <span key={part} className="flex items-center gap-1.5">
              <span className="text-muted-foreground">{"\u203A"}</span>
              <span className="text-muted-foreground">{part}</span>
            </span>
          ))}
          <span className="text-muted-foreground">{"\u203A"}</span>
          <span className="font-semibold text-foreground">{fileName}</span>
        </div>
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
              "prose-headings:font-heading prose-headings:text-navy",
              "prose-a:text-rust",
            )}
          >
            <ReactMarkdown>{content}</ReactMarkdown>
          </article>
        )}
      </div>
    </div>
  );
}
