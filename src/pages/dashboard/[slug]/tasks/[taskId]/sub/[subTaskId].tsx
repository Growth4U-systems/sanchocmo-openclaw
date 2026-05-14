import { useEffect } from "react";
import { useRouter } from "next/router";
import { DashboardLayout } from "@/components/layout/DashboardLayout";

export default function LegacyTaskSubRouteRedirect() {
  const router = useRouter();
  const slug = router.query.slug as string | undefined;
  const subTaskId = router.query.subTaskId as string | undefined;

  useEffect(() => {
    if (!slug || !subTaskId) return;
    router.replace(`/dashboard/${slug}/tasks/${subTaskId}`);
  }, [router, slug, subTaskId]);

  return (
    <DashboardLayout>
      <p className="text-sm text-muted-foreground">Abriendo tarea...</p>
    </DashboardLayout>
  );
}
