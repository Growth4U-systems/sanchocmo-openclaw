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
 * Legacy ContentTask metadata-only page. We've merged its UI into the draft
 * page (which already has DashboardLayout chat sidebar, channel switcher, and
 * a collapsible Detalles section with all editable fields). To keep existing
 * URLs working — Idea Bank chips, task-index links, etc. — we redirect to
 * the first target channel's draft view.
 */
export default function ContentTaskRedirectPage() {
  const slug = useSlugSync() || "";
  const router = useRouter();
  const projectId = (router.query.projectId as string) || "";
  const taskId = (router.query.taskId as string) || "";
  const contentTaskId = (router.query.contentTaskId as string) || "";
  const taskBackHref = slug && taskId ? `/dashboard/${slug}/tasks/${taskId}` : "/dashboard";

  const { data: ct, isLoading } = useContentTask(
    slug || null,
    taskId || null,
    contentTaskId || null,
  );

  useEffect(() => {
    if (!ct || !slug || !projectId || !taskId || !contentTaskId) return;
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
              href={taskBackHref}
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
