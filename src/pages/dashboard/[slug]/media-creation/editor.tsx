/**
 * Media Creation — Editor agentic.
 * Embebe el web app de Open Design (localhost:3100) como iframe full-height
 * apuntando al project del brand activo. MC envuelve con su chrome (header,
 * breadcrumb, botón volver). Sin construir editor propio: el upstream es la
 * fuente de toda la UX agéntica (chat, comment overlay, slider tweaks, etc.).
 */

import { useRouter } from "next/router";
import Head from "next/head";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useSlugSync } from "@/hooks/useSlugSync";

interface ResolveProjectResponse {
  projectId: string;
  baseDir: string;
  webUrl: string;
  daemonUrl: string;
}

function useOdProjectForBrand(slug: string | null) {
  return useQuery<ResolveProjectResponse>({
    queryKey: ["od-resolve-project", slug],
    queryFn: async () => {
      const res = await fetch(`/api/open-design/resolve-project?slug=${encodeURIComponent(slug as string)}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      return res.json();
    },
    enabled: !!slug,
    staleTime: 60_000,
  });
}

export default function MediaCreationEditorPage() {
  const router = useRouter();
  const slug = useSlugSync() || ((router.query.slug as string) ?? null);
  const artifactQuery = router.query.artifact;
  const artifactId = Array.isArray(artifactQuery) ? artifactQuery[0] : artifactQuery;

  const { data, isLoading, error } = useOdProjectForBrand(slug);

  const iframeUrl = data
    ? artifactId
      ? `${data.webUrl}?artifact=${encodeURIComponent(artifactId)}`
      : data.webUrl
    : null;

  return (
    <>
      <Head>
        <title>Editor — {slug} — Mission Control</title>
      </Head>
      <DashboardLayout>
        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <h1 className="font-heading text-2xl text-navy">Editor agentic</h1>
          <Link
            href={`/dashboard/${slug}/media-creation?tab=assets`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] bg-transparent border border-[#E5E2DC] rounded-md text-[#7A7A7A] hover:bg-[#E5E2DC] hover:text-[#1A1A1A] transition-colors no-underline"
          >
            ← Volver a Media Creation
          </Link>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          {slug}
          {data && (
            <>
              {" · "}
              <code className="text-[11px] bg-muted px-1.5 py-0.5 rounded">project {data.projectId.slice(0, 8)}</code>
              {" · "}
              <a
                href={data.webUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-rust hover:underline"
              >
                Abrir en pestaña nueva ↗
              </a>
            </>
          )}
        </p>

        {/* Estados */}
        {isLoading && (
          <div className="rounded-xl border border-border bg-white p-8 text-center text-sm text-muted-foreground">
            Conectando con Open Design…
          </div>
        )}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 space-y-2">
            <p className="font-semibold">No se puede conectar al daemon de Open Design.</p>
            <p>{String(error instanceof Error ? error.message : error)}</p>
            <p className="text-xs">
              Verifica que está corriendo:{" "}
              <code className="bg-red-100 px-1.5 py-0.5 rounded">~/.openclaw/scripts/od-daemon.sh status</code>
            </p>
          </div>
        )}

        {/* Iframe */}
        {iframeUrl && (
          <iframe
            src={iframeUrl}
            className="w-full rounded-xl border border-border bg-white"
            style={{ height: "calc(100vh - 220px)", minHeight: 600 }}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
            title={`Open Design — ${slug}`}
          />
        )}
      </DashboardLayout>
    </>
  );
}
