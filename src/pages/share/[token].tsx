/**
 * /share/[token] — Public document viewer.
 *
 * Unauthenticated. Renders any document whose share token validates.
 * Layout: minimal header (filename + brand) + content area (markdown or
 * HTML iframe). No DashboardLayout, no auth guard, no chat sidebar.
 *
 * Used by third parties who receive a shared link from a MC user via
 * the "Copy public link" button on the doc viewer.
 */

import { useEffect, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ShareResponse {
  ok: boolean;
  slug?: string;
  path?: string;
  filename?: string;
  content?: string;
  iat?: number;
  error?: string;
}

export default function SharePage() {
  const router = useRouter();
  const { token } = router.query;
  const [data, setData] = useState<ShareResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || typeof token !== "string") return;
    setLoading(true);
    setError(null);
    fetch(`/api/share/${token}`)
      .then((res) => res.json().then((j) => ({ status: res.status, body: j })))
      .then(({ status, body }) => {
        if (status !== 200 || !body.ok) {
          setError(body.error || `HTTP ${status}`);
          return;
        }
        setData(body);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const isHtml =
    !!data?.content &&
    (data.path?.endsWith(".html") ||
      data.content.trimStart().startsWith("<!DOCTYPE") ||
      data.content.trimStart().startsWith("<html"));

  const displayTitle = data?.filename
    ? data.filename.replace(/\.(md|html|txt)$/i, "").replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "Documento";

  return (
    <>
      <Head>
        <title>{displayTitle} — Shared Document</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>

      <div className="min-h-screen bg-[#FAFAF8] dark:bg-[#1E1E2E] flex flex-col">
        {/* Minimal header */}
        <header className="bg-white dark:bg-[#181825] border-b border-[#E5E2DC] dark:border-[#313244] px-6 py-3 flex items-center gap-3">
          <span className="text-xl">📄</span>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold text-[#1A1A1A] dark:text-[#cdd6f4] truncate">
              {displayTitle}
            </h1>
            {data?.slug && (
              <p className="text-[10px] text-[#7A7A7A] dark:text-[#6c7086] truncate">
                {data.slug} · shared via Mission Control
              </p>
            )}
          </div>
          {token && typeof token === "string" && data?.ok && (
            <a
              href={`/api/share/${token}?download=1`}
              download
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] bg-transparent border border-[#E5E2DC] dark:border-[#313244] rounded-md text-[#7A7A7A] dark:text-[#6c7086] hover:bg-[#E5E2DC] dark:hover:bg-[#313244] hover:text-[#1A1A1A] dark:hover:text-[#cdd6f4] transition-colors no-underline"
            >
              ⬇ Descargar
            </a>
          )}
        </header>

        {/* Content area */}
        <main className="flex-1 overflow-y-auto">
          {loading && (
            <p className="text-sm text-muted-foreground text-center py-20">Cargando documento...</p>
          )}

          {error && (
            <div className="max-w-2xl mx-auto px-6 py-20 text-center">
              <p className="text-2xl mb-2">🔒</p>
              <p className="text-sm text-red-500 font-medium mb-1">No se pudo cargar el documento</p>
              <p className="text-xs text-muted-foreground">{error}</p>
              <p className="text-xs text-muted-foreground mt-4">
                El link puede haber expirado o ser inválido. Pide al remitente que genere uno nuevo.
              </p>
            </div>
          )}

          {data?.content && !error && (
            isHtml ? (
              <iframe
                srcDoc={data.content}
                className="w-full border-0 bg-white"
                style={{ minHeight: "calc(100vh - 60px)" }}
                sandbox="allow-same-origin"
                title={displayTitle}
              />
            ) : (
              <article className="max-w-3xl mx-auto px-6 py-8 prose prose-sm dark:prose-invert prose-headings:font-heading prose-headings:text-rust prose-a:text-rust prose-table:border-collapse prose-th:border prose-th:border-border prose-th:px-3 prose-th:py-2 prose-th:bg-muted/30 prose-th:text-left prose-th:text-xs prose-th:font-bold prose-td:border prose-td:border-border prose-td:px-3 prose-td:py-2 prose-td:text-xs">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{data.content}</ReactMarkdown>
              </article>
            )
          )}
        </main>

        {/* Footer */}
        <footer className="border-t border-[#E5E2DC] dark:border-[#313244] bg-white dark:bg-[#181825] px-6 py-2 text-[10px] text-muted-foreground text-center">
          Powered by Mission Control · Read-only public link
        </footer>
      </div>
    </>
  );
}
