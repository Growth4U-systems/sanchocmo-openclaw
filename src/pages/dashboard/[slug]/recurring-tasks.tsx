import { useState } from "react";
import { useSession } from "next-auth/react";
import Head from "next/head";
import { useTranslations } from "next-intl";
import { useSlugSync } from "@/hooks/useSlugSync";
import ReactMarkdown from "react-markdown";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useRecurringTasks, useCronRuns, useToggleRecurringTask } from "@/hooks/useRecurringTasks";
import { useSetCronModel } from "@/hooks/useModels";
import { ModelPicker } from "@/components/admin/ModelPicker";
import { CronPublishChannel } from "@/components/recurring/CronPublishChannel";
import { cn } from "@/lib/utils";

interface CronRun {
  jobId: string;
  jobName: string;
  status: string;
  summary: string;
  durationMs: number | null;
  model: string | null;
  runAtMs: number | null;
  category: string;
  hasOutput: boolean;
}

export default function RecurringTasksPage() {
  const slug = useSlugSync();
  const t = useTranslations("recurringTasks");
  const { data: session } = useSession();
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "admin";
  const { data: tasksData, isLoading: tasksLoading } = useRecurringTasks(slug);
  const { data: runsData, isLoading: runsLoading } = useCronRuns(slug);
  const toggleMutation = useToggleRecurringTask();
  const setCronModel = useSetCronModel(slug);
  const [selectedRun, setSelectedRun] = useState<CronRun | null>(null);
  const [pendingCron, setPendingCron] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"tasks" | "history">("tasks");

  const tasks = tasksData?.[slug] || [];
  const runs: CronRun[] = Array.isArray(runsData) ? runsData : [];

  return (
    <DashboardLayout>
      <Head>
        <title>{t("title")} — {slug} — Mission Control</title>
      </Head>

      <h1 className="font-heading text-2xl text-navy mb-1">{t("title")}</h1>
      <p className="text-sm text-muted-foreground mb-6">{slug}</p>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab("tasks")}
          className={cn(
            "px-4 py-2 rounded-lg text-sm font-semibold border-2 transition-all",
            activeTab === "tasks"
              ? "bg-rust text-white border-rust"
              : "border-border hover:border-rust"
          )}
        >
          🔄 {t("title")} ({tasks.length})
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={cn(
            "px-4 py-2 rounded-lg text-sm font-semibold border-2 transition-all",
            activeTab === "history"
              ? "bg-rust text-white border-rust"
              : "border-border hover:border-rust"
          )}
        >
          📜 Historial ({runs.length})
        </button>
      </div>

      {activeTab === "tasks" && (
        <div className="space-y-3">
          {tasksLoading && <p className="text-muted-foreground">Cargando...</p>}
          {!tasksLoading && tasks.length === 0 && (
            <p className="text-muted-foreground">No hay tareas recurrentes configuradas.</p>
          )}
          {tasks.map((task: Record<string, unknown>) => (
            <div
              key={task.id as string}
              className="rounded-lg border-[3px] border-ink bg-card p-4 shadow-comic-sm flex items-center gap-4"
            >
              {/* Toggle */}
              <button
                onClick={() => toggleMutation.mutate({ slug, taskId: task.id as string })}
                disabled={toggleMutation.isPending}
                className={cn(
                  "w-10 h-6 rounded-full transition-colors flex-shrink-0 relative",
                  task.status === "active" ? "bg-sage" : "bg-border"
                )}
              >
                <div
                  className={cn(
                    "w-5 h-5 rounded-full bg-white border border-ink absolute top-0.5 transition-all",
                    task.status === "active" ? "left-4" : "left-0.5"
                  )}
                />
              </button>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate">{task.name as string}</div>
                <div className="text-xs text-muted-foreground flex gap-3 mt-0.5">
                  <span>{String(task.schedule || "—")}</span>
                  {task.task_type ? <span className="capitalize">{String(task.task_type)}</span> : null}
                  {task.agent ? <span>🤖 {String(task.agent)}</span> : null}
                  {!isAdmin && task.model ? <span className="font-mono">{String(task.model)}</span> : null}
                </div>
              </div>

              {/* Publish-channel picker (admin only, publishing crons) */}
              {isAdmin && typeof task.cron_key === "string" && task.cron_key && (
                <CronPublishChannel slug={slug} cronKey={task.cron_key as string} />
              )}

              {/* Model picker (admin only) */}
              {isAdmin && task._source === "openclaw-cron" && (
                <ModelPicker
                  value={
                    typeof task.model === "string" && task.model && task.model !== "—"
                      ? task.model
                      : null
                  }
                  size="sm"
                  disabled={pendingCron === (task.id as string)}
                  onChange={(next) => {
                    if (!next) return;
                    const id = task.id as string;
                    setPendingCron(id);
                    setCronModel.mutate(
                      { cronId: id, model: next },
                      { onSettled: () => setPendingCron(null) }
                    );
                  }}
                />
              )}

              {/* Status badge */}
              <span
                className={cn(
                  "px-2 py-0.5 rounded text-xs font-semibold",
                  task.status === "active"
                    ? "bg-sage/20 text-sage"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {task.status as string}
              </span>
            </div>
          ))}
        </div>
      )}

      {activeTab === "history" && (
        <div className="space-y-3">
          {runsLoading && <p className="text-muted-foreground">Cargando historial...</p>}
          {!runsLoading && runs.length === 0 && (
            <p className="text-muted-foreground">No hay ejecuciones registradas.</p>
          )}
          {runs.map((run, i) => (
            <button
              key={`${run.jobId}-${i}`}
              onClick={() => setSelectedRun(run)}
              className="w-full rounded-lg border-[3px] border-ink bg-card p-4 shadow-comic-sm text-left hover:shadow-comic transition-shadow"
            >
              <div className="flex items-center gap-3">
                <span className={cn(
                  "w-3 h-3 rounded-full flex-shrink-0",
                  run.status === "ok" ? "bg-sage" : "bg-destructive"
                )} />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">{run.jobName}</div>
                  <div className="text-xs text-muted-foreground flex gap-3 mt-0.5">
                    {run.runAtMs && (
                      <span>{new Date(run.runAtMs).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })}</span>
                    )}
                    {run.durationMs && <span>{(run.durationMs / 1000).toFixed(1)}s</span>}
                    {run.model && <span>{run.model}</span>}
                    {run.category && <span className="capitalize">{run.category}</span>}
                  </div>
                </div>
                {run.hasOutput && <span className="text-xs text-sage font-semibold">📄 Output</span>}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Run detail slide-over */}
      {selectedRun && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSelectedRun(null)} />
          <div className="relative w-full max-w-xl bg-card border-l-[3px] border-ink h-full overflow-y-auto p-6">
            <button onClick={() => setSelectedRun(null)} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
              ✕
            </button>

            <h2 className="font-heading text-xl text-navy mb-1">{selectedRun.jobName}</h2>
            <div className="text-xs text-muted-foreground mb-4 flex gap-3">
              <span className={cn(
                "px-2 py-0.5 rounded font-semibold",
                selectedRun.status === "ok" ? "bg-sage/20 text-sage" : "bg-destructive/20 text-destructive"
              )}>
                {selectedRun.status}
              </span>
              {selectedRun.runAtMs && (
                <span>{new Date(selectedRun.runAtMs).toLocaleString("es-ES")}</span>
              )}
              {selectedRun.durationMs && <span>{(selectedRun.durationMs / 1000).toFixed(1)}s</span>}
            </div>

            {selectedRun.summary && (
              <article className="prose prose-sm max-w-none dark:prose-invert">
                <ReactMarkdown>{selectedRun.summary}</ReactMarkdown>
              </article>
            )}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
