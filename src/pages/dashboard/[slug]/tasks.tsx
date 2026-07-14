import Head from "next/head";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { TaskIndexPanel } from "@/components/tasks/TaskIndexPanel";
import { useSlugSync } from "@/hooks/useSlugSync";

export default function TasksPage() {
  const slug = useSlugSync() || "";

  return (
    <DashboardLayout>
      <Head><title>{`Tareas — ${slug} — Mission Control`}</title></Head>
      <h1 className="sr-only">Tareas</h1>
      <TaskIndexPanel slug={slug} />
    </DashboardLayout>
  );
}
