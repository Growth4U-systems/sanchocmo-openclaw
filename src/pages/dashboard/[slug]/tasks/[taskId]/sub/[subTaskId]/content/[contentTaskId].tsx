import { useEffect } from "react";
import { useRouter } from "next/router";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useSlugSync } from "@/hooks/useSlugSync";
import { useContentTask } from "@/hooks/useContentTasks";

export default function LegacyContentTaskRouteRedirect() {
  const slug = useSlugSync() || "";
  const router = useRouter();
  const taskId = router.query.taskId as string | undefined;
  const subTaskId = router.query.subTaskId as string | undefined;
  const contentTaskId = router.query.contentTaskId as string | undefined;
  const { data: ct } = useContentTask(slug || null, subTaskId || null, contentTaskId || null);

  useEffect(() => {
    if (!slug || !taskId || !subTaskId || !contentTaskId || !ct) return;
    const channel = ct.target_channels?.[0] || "linkedin";
    router.replace(`/dashboard/${slug}/tasks/${taskId}/sub/${subTaskId}/content/${contentTaskId}/draft/${channel}`);
  }, [router, slug, taskId, subTaskId, contentTaskId, ct]);

  return (
    <DashboardLayout>
      <p className="text-sm text-muted-foreground">Abriendo ContentTask...</p>
    </DashboardLayout>
  );
}
