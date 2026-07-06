"use client";

import { useEffect, useState } from "react";
import type { MediaAsset } from "@/lib/data/drafts";

interface ImagePreviewProps {
  media: MediaAsset;
}

/** Full-size preview for an image asset. Uses a plain <img> (not next/image)
 *  so onError fires reliably when R2 misses / blocks the request — when the
 *  load fails we surface the URL and the HTTP error to the user instead of
 *  rendering a silent black void. */
export function ImagePreview({ media }: ImagePreviewProps) {
  const isPdf = media.type === "application/pdf";
  const [errored, setErrored] = useState(false);

  // Reset error state when the displayed asset changes (e.g. ←/→ nav).
  useEffect(() => {
    setErrored(false);
  }, [media.url]);

  return (
    <div className="flex-1 bg-[#0a0a0a] flex items-center justify-center min-h-[60vh] relative overflow-hidden">
      {isPdf ? (
        <a
          href={media.url}
          target="_blank"
          rel="noreferrer"
          className="text-white text-center p-8"
        >
          <div className="text-6xl mb-3">📄</div>
          <div className="text-sm font-bold uppercase tracking-wider">Carrusel PDF</div>
          <div className="text-xs opacity-70 mt-2 underline">Abrir en pestaña nueva ↗</div>
        </a>
      ) : errored ? (
        <ImageErrorFallback url={media.url} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={media.url}
          alt={media.prompt || "Media asset"}
          className="max-w-full max-h-full object-contain"
          onError={() => setErrored(true)}
        />
      )}
    </div>
  );
}

function ImageErrorFallback({ url }: { url: string }) {
  return (
    <div className="text-center p-8 max-w-2xl text-white">
      <div className="text-5xl mb-3">⚠️</div>
      <div className="text-sm font-bold mb-2">No se pudo cargar la imagen</div>
      <p className="text-xs opacity-80 mb-4 leading-relaxed">
        La URL no responde o el navegador la rechazó (404 / CORS / acceso
        denegado). Suele ser que el bucket público de R2 dejó de servir o que
        las credenciales rotaron.
      </p>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="inline-block text-[11px] font-mono break-all bg-white/10 hover:bg-white/20 px-3 py-2 rounded-md underline decoration-dotted"
      >
        {url}
      </a>
      <p className="text-[10px] opacity-60 mt-3">
        Click para abrirla en pestaña nueva y ver la respuesta exacta de R2.
      </p>
    </div>
  );
}
