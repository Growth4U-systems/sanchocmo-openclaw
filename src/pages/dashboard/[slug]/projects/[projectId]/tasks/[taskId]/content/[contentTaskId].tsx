"use client";

import { useEffect } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import Link from "next/link";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useSlugSync } from "@/hooks/useSlugSync";
import { useContentTask } from "@/hooks/useContentTasks";

/**
 * /dashboard/[slug]/projects/[projectId]/tasks/[taskId]/content/[contentTaskId]
 *
 * Legacy ContentTask metadata-only page. The UI is now in the draft page;
 * we keep this route as a redirect to preserve existing URLs (task-index
 * links, etc.). It redirects to the first target channel's draft view.
 */
export default function ContentTaskRedirectPage() {
  const slug = useSlugSync() || "";
  const router = useRouter();
  const projectId = (router.query.projectId as string) || "";
  const taskId = (router.query.taskId as string) || "";
  const contentTaskId = (router.query.contentTaskId as string) || "";

  const { data: ct, isLoading } = useContentTask(
    slug || null,
    taskId || null,
    contentTaskId || null,
  );

  useEffect(() => {
    if (!ct || !slug) return;
    const channel = ct.target_channels?.[0] || "linkedin";
    router.replace(
      `/dashboard/${slug}/tasks/${projectId}/sub/${taskId}/content/${contentTaskId}/draft/${channel}`,
    );
  }, [ct, slug, projectId, taskId, contentTaskId, router]);

  return (
    <DashboardLayout>
      <Head>
        <title>{ct?.name ? `${ct.name} · ContentTask` : "ContentTask"}</title>
      </Head>
      <div className="p-6">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando...</p>
        ) : !ct ? (
          <>
            <Link
              href={`/dashboard/${slug}/tasks/${taskId}`}
              className="text-sm text-rust hover:underline"
            >
              ← Volver a la task
            </Link>
            <p className="mt-4 text-sm text-muted-foreground">ContentTask no encontrada.</p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Abriendo draft...</p>
        )}
      </div>
    </DashboardLayout>
  );
}
