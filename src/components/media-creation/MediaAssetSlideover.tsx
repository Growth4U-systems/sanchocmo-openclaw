/**
 * Slide-over para ver un asset visual del brand. Render según extensión:
 *   - .html → iframe sandbox
 *   - .md → markdown
 *   - .png/.webp/.jpg/.svg/.gif → img
 *   - .json → pretty JSON
 *   - directorio (templates/<id>/) → busca template.html / slide-cover.html / index.html
 */

"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { SlideOver } from "@/components/shared/slide-over";
import type { BrandAsset } from "@/hooks/useBrandAssets";
import { cn } from "@/lib/utils";

// (Reutiliza el componente SlideOver compartido — mismo wrapper que DocSlideOver
// y SettingsSlideover. No introducimos un slide-over propio.)

interface Props {
  slug: string;
  asset: BrandAsset | null;
  onClose: () => void;
  onRequestEdit: (asset: BrandAsset) => void;
}

const TEXT_EXTS = new Set([".md", ".markdown", ".txt", ".css", ".js", ".json", ".html", ".svg"]);
const IMAGE_EXTS = new Set([".png", ".webp", ".jpg", ".jpeg", ".gif", ".ico"]);

function ext(p: string): string {
  const i = p.lastIndexOf(".");
  return i === -1 ? "" : p.slice(i).toLowerCase();
}

export function MediaAssetSlideover({ slug, asset, onClose, onRequestEdit }: Props) {
  const [textContent, setTextContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Body scroll lock — mismo patrón que DocSlideOver
  useEffect(() => {
    const isOpen = !!asset;
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [asset]);

  useEffect(() => {
    if (!asset) {
      setTextContent(null);
      return;
    }
    setTextContent(null);

    const e = ext(asset.path);
    const isDirectory = !!asset.entryFile || (asset.files && asset.files.length > 0);
    const baseHref = `/api/brand-files/brand/${encodeURIComponent(slug)}/${asset.relativePath}`;

    // Si es directorio, el preview lo monta el iframe con asset.entryFile (ya resuelto server-side).
    // Si es archivo de texto, lo cargamos para render markdown/JSON inline.
    if (!isDirectory && TEXT_EXTS.has(e)) {
      setLoading(true);
      fetch(baseHref)
        .then((r) => r.text())
        .then((t) => {
          setTextContent(t);
          setLoading(false);
        })
        .catch(() => setLoading(false));
      return;
    }
    setLoading(false);
  }, [asset, slug]);

  if (!asset) return null;

  const e = ext(asset.path);
  const baseHref = `/api/brand-files/brand/${encodeURIComponent(slug)}/${asset.relativePath}`;
  const downloadHref = `${baseHref}?download=1`;
  const isDirectory = !!asset.entryFile || (asset.files && asset.files.length > 0);
  const entryHref = asset.entryFile
    ? `/api/brand-files/brand/${encodeURIComponent(slug)}/${asset.entryFile}`
    : null;

  return (
    <SlideOver
      open
      onClose={onClose}
      width="w-[60vw] max-w-3xl"
      title={asset.name}
      actions={
        <>
          <a
            href={downloadHref}
            download
            className="text-sm hover:scale-110 transition-transform p-1.5 rounded-md hover:bg-muted/40 no-underline"
            title="Descargar"
          >
            {"⬇️"}
          </a>
          <button
            type="button"
            onClick={() => onRequestEdit(asset)}
            className="text-sm hover:scale-110 transition-transform p-1.5 rounded-md hover:bg-muted/40"
            title="Pídele a Maese Pedro"
          >
            {"💬"}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="text-[11px] text-muted-foreground font-mono break-all">{asset.path}</div>
        <div className="text-[11px] text-muted-foreground flex flex-wrap gap-3">
          <span>tipo: <code className="bg-muted px-1.5 py-0.5 rounded">{asset.kind}</code></span>
          {asset.size !== undefined && <span>size: {(asset.size / 1024).toFixed(1)} KB</span>}
          {asset.modifiedAt && <span>modified: {new Date(asset.modifiedAt).toLocaleString()}</span>}
          {asset.meta?.task_id ? <span>task: <code>{String(asset.meta.task_id)}</code></span> : null}
        </div>

        <div className="border border-border rounded-lg overflow-hidden bg-muted/20">
          {loading && <p className="p-6 text-sm text-muted-foreground">Cargando preview…</p>}

          {/* Imagen single-file */}
          {!loading && !isDirectory && IMAGE_EXTS.has(e) && (
            <div className="flex items-center justify-center bg-checkered min-h-[300px] p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={baseHref} alt={asset.name} className="max-w-full max-h-[60vh] object-contain" />
            </div>
          )}

          {/* HTML single-file */}
          {!loading && !isDirectory && e === ".html" && (
            <iframe
              src={baseHref}
              sandbox="allow-scripts"
              className="w-full h-[60vh] bg-white"
              title={asset.name}
            />
          )}

          {/* Directorio con entry HTML */}
          {!loading && isDirectory && entryHref && (
            <iframe
              src={entryHref}
              sandbox="allow-scripts"
              className="w-full h-[60vh] bg-white"
              title={asset.name}
            />
          )}

          {/* Markdown render */}
          {!loading && textContent !== null && (e === ".md" || e === ".markdown") && (
            <div className="p-6 prose prose-sm max-w-none bg-card">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{textContent}</ReactMarkdown>
            </div>
          )}

          {/* Texto raw / JSON / CSS / JS / SVG source */}
          {!loading && textContent !== null && (e === ".json" || e === ".txt" || e === ".css" || e === ".js" || e === ".svg") && (
            <pre className={cn("p-6 text-xs bg-card overflow-x-auto whitespace-pre-wrap font-mono")}>
              {e === ".json" ? (() => { try { return JSON.stringify(JSON.parse(textContent), null, 2); } catch { return textContent; } })() : textContent}
            </pre>
          )}

          {/* Fallback */}
          {!loading && !isDirectory && !IMAGE_EXTS.has(e) && !textContent && e !== ".html" && (
            <p className="p-6 text-sm text-muted-foreground">
              Sin preview disponible para este tipo de archivo.
            </p>
          )}

          {/* Directorio sin entry HTML */}
          {!loading && isDirectory && !entryHref && (
            <p className="p-6 text-sm text-muted-foreground">
              Carpeta sin HTML de preview. Lista de archivos abajo.
            </p>
          )}
        </div>

        {/* Listado de archivos para directorios — descargables individualmente */}
        {asset.files && asset.files.length > 0 && (
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground bg-muted/30 border-b border-border">
              {asset.files.length} archivo{asset.files.length === 1 ? "" : "s"} en esta carpeta
            </div>
            <div className="divide-y divide-border/40">
              {asset.files.map((f) => (
                <div key={f.relativePath} className="flex items-center gap-3 px-4 py-2 hover:bg-muted/20 transition-colors">
                  <span className="text-xs text-muted-foreground">{"📄"}</span>
                  <span className="flex-1 text-xs font-mono truncate">{f.name}</span>
                  <span className="text-[10px] text-muted-foreground">{(f.size / 1024).toFixed(1)} KB</span>
                  <a
                    href={`/api/brand-files/brand/${encodeURIComponent(slug)}/${f.relativePath}?download=1`}
                    download
                    className="text-sm hover:scale-110 transition-transform p-1 rounded-md hover:bg-muted/40 no-underline"
                    title="Descargar"
                  >
                    {"⬇️"}
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </SlideOver>
  );
}
