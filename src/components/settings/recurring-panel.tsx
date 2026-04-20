"use client";

import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ComicCard } from "@/components/shared/comic-card";
import { CollapsibleSection } from "@/components/shared/collapsible-section";
import { Modal } from "@/components/shared/modal";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface CronTask {
  id: string;
  name: string;
  category: string;
  enabled: boolean;
  status?: string;
  schedule: string | { expr?: string; kind?: string; everyMs?: number };
  last_run?: string;
  next_run?: string;
  last_status?: string;
  last_duration_ms?: number;
  consecutive_errors?: number;
  prompt?: string;
  agent?: string;
  model?: string;
  client_slug?: string;
  scripts?: Array<{ name: string; path: string; lines: number; lang: string }>;
}

interface AvailableTemplate {
  template_key: string;
  name: string;
  description: string;
  requires: string;
  p00_task: string | null;
}

type CategoryKey = "intelligence" | "metrics" | "outreach" | "content" | "system" | "other";

const CATEGORY_META: Record<CategoryKey, { icon: string; label: string }> = {
  metrics: { icon: "📊", label: "Metrics" },
  intelligence: { icon: "🧠", label: "Intelligence" },
  outreach: { icon: "📨", label: "Outreach" },
  content: { icon: "✍️", label: "Content" },
  system: { icon: "⚙️", label: "System" },
  other: { icon: "📋", label: "Otros" },
};

const CATEGORY_ORDER: CategoryKey[] = ["metrics", "intelligence", "outreach", "content", "system", "other"];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function cronToHuman(schedule: CronTask["schedule"]): string {
  if (!schedule) return "—";
  if (typeof schedule === "string") return schedule;

  if (schedule.kind === "every" && schedule.everyMs) {
    const h = Math.round(schedule.everyMs / 3600000);
    if (h >= 24) return `Cada ${Math.round(h / 24)}d`;
    if (h >= 1) return `Cada ${h}h`;
    const m = Math.round(schedule.everyMs / 60000);
    return `Cada ${m}min`;
  }

  const expr = schedule.expr || "";
  const parts = expr.split(/\s+/);
  if (parts.length < 5) return expr;

  const [min, hour, dom, , dow] = parts;
  const dowMap: Record<string, string> = {
    "0": "Dom", "1": "Lun", "2": "Mar", "3": "Mié", "4": "Jue", "5": "Vie", "6": "Sáb",
  };

  const hStr = hour.includes(",")
    ? hour.split(",").map((h) => `${h}:${min.padStart(2, "0")}`).join(", ")
    : `${hour}:${min.padStart(2, "0")}`;

  let dayStr = "";
  if (dow === "*" && dom === "*") dayStr = "Cada día";
  else if (dow === "1-5") dayStr = "L-V";
  else if (dow === "0-4") dayStr = "D-J";
  else if (dow !== "*") {
    if (dow.includes("-")) {
      const [a, b] = dow.split("-");
      dayStr = `${dowMap[a] || a}-${dowMap[b] || b}`;
    } else {
      dayStr = dow.split(",").map((d) => dowMap[d] || d).join(", ");
    }
  } else if (dom === "1") dayStr = "Día 1 del mes";
  else dayStr = `Día ${dom}`;

  return `${dayStr} ${hStr}`;
}

function relTime(iso?: string): string {
  if (!iso) return "Nunca";
  const diff = Date.now() - new Date(iso).getTime();
  const abs = Math.abs(diff);
  const future = diff < 0;

  if (abs < 60_000) return future ? "En <1 min" : "Hace <1 min";
  if (abs < 3600_000) {
    const m = Math.round(abs / 60_000);
    return future ? `En ${m} min` : `Hace ${m} min`;
  }
  if (abs < 86400_000) {
    const h = Math.round(abs / 3600_000);
    return future ? `En ${h}h` : `Hace ${h}h`;
  }
  const d = Math.round(abs / 86400_000);
  return future ? `En ${d}d` : `Hace ${d}d`;
}

function fmtDur(ms?: number): string {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function StatusDot({ status }: { status?: string }) {
  const color =
    status === "ok" ? "bg-green-500" :
    status === "error" ? "bg-red-500" :
    "bg-gray-400";
  return <span className={cn("inline-block h-2.5 w-2.5 rounded-full shrink-0", color)} />;
}

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-ink transition-colors",
        checked ? "bg-green-500" : "bg-gray-300",
        disabled && "opacity-50 cursor-not-allowed",
      )}
    >
      <span
        className={cn(
          "pointer-events-none inline-block h-3.5 w-3.5 rounded-full bg-white shadow transform transition-transform mt-[1px]",
          checked ? "translate-x-[15px]" : "translate-x-[1px]",
        )}
      />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Prompt Modal                                                       */
/* ------------------------------------------------------------------ */

function PromptModal({
  task,
  open,
  onClose,
  onSave,
}: {
  task: CronTask | null;
  open: boolean;
  onClose: () => void;
  onSave: (taskId: string, prompt: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");

  if (!task) return null;

  return (
    <Modal open={open} onClose={onClose} title={task.name} size="lg">
      <div className="space-y-4">
        {/* Meta */}
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          {task.agent && (
            <span className="bg-muted px-2 py-0.5 rounded">Agente: {task.agent}</span>
          )}
          {task.model && (
            <span className="bg-muted px-2 py-0.5 rounded">Modelo: {task.model}</span>
          )}
          <span className="bg-muted px-2 py-0.5 rounded">
            Frecuencia: {cronToHuman(task.schedule)}
          </span>
          {task.client_slug && (
            <span className="bg-muted px-2 py-0.5 rounded">Cliente: {task.client_slug}</span>
          )}
        </div>

        {/* Prompt */}
        {editing ? (
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="w-full h-64 bg-background border border-ink rounded p-3 text-xs font-mono resize-y"
          />
        ) : (
          <pre className="bg-background border border-ink rounded p-4 max-h-[400px] overflow-auto text-xs whitespace-pre-wrap">
            {task.prompt || "(sin prompt)"}
          </pre>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2">
          {editing ? (
            <>
              <button
                onClick={() => setEditing(false)}
                className="px-3 py-1.5 text-xs border border-ink rounded hover:bg-muted transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  onSave(task.id, editText);
                  setEditing(false);
                }}
                className="px-3 py-1.5 text-xs bg-rust text-white rounded hover:opacity-90 transition-opacity"
              >
                Guardar
              </button>
            </>
          ) : (
            <button
              onClick={() => {
                setEditText(task.prompt || "");
                setEditing(true);
              }}
              className="px-3 py-1.5 text-xs border border-ink rounded hover:bg-muted transition-colors"
            >
              Editar
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function RecurringPanel() {
  const queryClient = useQueryClient();
  const slug = useAppStore((s) => s.selectedClient) || "";

  /* --- Data fetch: tasks + templates from OpenClaw via API --- */
  const { data, isLoading } = useQuery<{ tasks: CronTask[]; templates: AvailableTemplate[] }>({
    queryKey: ["recurring-tasks", slug],
    queryFn: async () => {
      const url = slug ? `/api/recurring-tasks?slug=${slug}` : "/api/recurring-tasks";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch recurring tasks");
      const raw = await res.json();

      // Extract templates
      const templates: AvailableTemplate[] = raw._available_templates || [];

      // Normalize tasks — API returns { slug: [...tasks] } or { slug1: [...], slug2: [...] }
      const tasks: CronTask[] = [];
      for (const [key, value] of Object.entries(raw)) {
        if (key === "_available_templates") continue;
        if (!Array.isArray(value)) continue;
        for (const t of value as Record<string, unknown>[]) {
          tasks.push({
            id: t.id as string,
            name: (t.name as string) || "—",
            category: (t.task_type as string) || "other",
            enabled: t.status === "active",
            status: t.status as string,
            schedule: (t.schedule_raw as CronTask["schedule"]) || (t.schedule as string),
            last_run: t.last_run_at as string | undefined,
            next_run: t.next_run_at as string | undefined,
            last_status: t.last_status as string | undefined,
            last_duration_ms: t.last_duration_ms as number | undefined,
            consecutive_errors: t.consecutive_errors as number | undefined,
            prompt: t.prompt as string | undefined,
            agent: t.agent as string | undefined,
            model: t.model as string | undefined,
            client_slug: (t.client_slug as string) || (key !== "_system" ? key : undefined),
            scripts: t.scripts as CronTask["scripts"],
          });
        }
      }

      return { tasks, templates };
    },
  });

  const tasks = data?.tasks || [];
  const templates = data?.templates || [];

  /* --- Toggle mutation --- */
  const toggleMut = useMutation({
    mutationFn: async ({ cronId, enable }: { cronId: string; enable: boolean }) => {
      const res = await fetch("/api/system/cron-toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cronId, enable }),
      });
      if (!res.ok) throw new Error("Toggle failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recurring-tasks", slug] });
    },
  });

  /* --- Save prompt mutation --- */
  const saveMut = useMutation({
    mutationFn: async ({ taskId, prompt }: { taskId: string; prompt: string }) => {
      const res = await fetch("/api/recurring-tasks/update-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, prompt }),
      });
      if (!res.ok) throw new Error("Save prompt failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recurring-tasks", slug] });
    },
  });

  /* --- Prompt modal state --- */
  const [promptTask, setPromptTask] = useState<CronTask | null>(null);

  /* --- Group tasks by category --- */
  const grouped = useMemo(() => {
    const groups: Record<string, CronTask[]> = {};
    for (const t of tasks) {
      const cat = t.category || "other";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(t);
    }
    return groups;
  }, [tasks]);

  const handleToggle = useCallback(
    (cronId: string, enable: boolean) => {
      toggleMut.mutate({ cronId, enable });
    },
    [toggleMut],
  );

  const handleSavePrompt = useCallback(
    (taskId: string, prompt: string) => {
      saveMut.mutate({ taskId, prompt });
    },
    [saveMut],
  );

  /* --- Render --- */
  return (
    <section className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading text-xl text-navy">
            🔄 Tareas Recurrentes
          </h2>
          <p className="text-sm text-muted-foreground">
            Crons de OpenClaw — fuente de verdad
          </p>
        </div>

        <button className="px-4 py-2 text-sm font-semibold bg-rust text-white rounded border-2 border-ink shadow-comic hover:-translate-y-0.5 hover:shadow-comic transition-all">
          + Nueva tarea
        </button>
      </div>

      {/* Loading */}
      {isLoading && (
        <ComicCard>
          <p className="text-sm text-muted-foreground animate-pulse">
            Cargando tareas recurrentes...
          </p>
        </ComicCard>
      )}

      {/* Category groups */}
      {CATEGORY_ORDER.filter((cat) => grouped[cat]?.length).map((cat) => {
        const catTasks = grouped[cat];
        const meta = CATEGORY_META[cat] || CATEGORY_META.other;
        return (
          <ComicCard key={cat} className="p-3">
            <CollapsibleSection
              title={meta.label}
              icon={meta.icon}
              count={catTasks.length}
              defaultOpen
            >
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b border-ink/20">
                      <th className="py-1.5 px-2 w-6" />
                      <th className="py-1.5 px-2">Nombre</th>
                      <th className="py-1.5 px-2">Frecuencia</th>
                      <th className="py-1.5 px-2">Último run</th>
                      <th className="py-1.5 px-2">Próximo</th>
                      <th className="py-1.5 px-2">Duración</th>
                      <th className="py-1.5 px-2">Acciones</th>
                      <th className="py-1.5 px-2 text-center">Activo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {catTasks.map((task) => (
                      <tr
                        key={task.id}
                        className={cn(
                          "border-b border-ink/10 hover:bg-muted/50 transition-colors",
                          !task.enabled && "opacity-50",
                        )}
                      >
                        {/* Status dot */}
                        <td className="py-2 px-2">
                          <StatusDot status={task.last_status} />
                        </td>

                        {/* Name */}
                        <td className="py-2 px-2 font-medium max-w-[200px] truncate">
                          {task.name}
                          {(task.consecutive_errors ?? 0) > 0 && (
                            <span className="ml-1 text-red-500 text-[10px]">
                              ({task.consecutive_errors} errores)
                            </span>
                          )}
                        </td>

                        {/* Frequency */}
                        <td className="py-2 px-2 text-muted-foreground">
                          {cronToHuman(task.schedule)}
                        </td>

                        {/* Last run */}
                        <td className="py-2 px-2 text-muted-foreground">
                          {relTime(task.last_run)}
                        </td>

                        {/* Next run */}
                        <td className="py-2 px-2 text-muted-foreground">
                          {relTime(task.next_run)}
                        </td>

                        {/* Duration */}
                        <td className="py-2 px-2 text-muted-foreground">
                          {fmtDur(task.last_duration_ms)}
                        </td>

                        {/* Actions */}
                        <td className="py-2 px-2">
                          <div className="flex gap-1">
                            {task.prompt && (
                              <button
                                onClick={() => setPromptTask(task)}
                                className="hover:bg-muted rounded px-1 transition-colors"
                                title="Ver prompt"
                              >
                                📜
                              </button>
                            )}
                            {task.scripts?.map((s) => (
                              <button
                                key={s.path}
                                className="hover:bg-muted rounded px-1 transition-colors text-[11px] bg-muted/50 px-1.5 py-0.5 border border-ink/10"
                                title={`${s.name} (${s.lines} líneas, ${s.lang})`}
                              >
                                📄 {s.name}
                              </button>
                            ))}
                          </div>
                        </td>

                        {/* Toggle */}
                        <td className="py-2 px-2 text-center">
                          <Toggle
                            checked={task.enabled}
                            onChange={(v) => handleToggle(task.id, v)}
                            disabled={toggleMut.isPending}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CollapsibleSection>
          </ComicCard>
        );
      })}

      {/* Empty state */}
      {!isLoading && tasks.length === 0 && (
        <ComicCard>
          <p className="text-sm text-muted-foreground text-center py-8">
            No hay tareas recurrentes configuradas.
          </p>
        </ComicCard>
      )}

      {/* Available templates */}
      {templates.length > 0 && (
        <ComicCard className="p-3">
          <CollapsibleSection
            title="Disponibles"
            icon="⏸"
            count={templates.length}
            defaultOpen={false}
          >
            <p className="text-xs text-muted-foreground mb-3">
              Estas tareas recurrentes se pueden activar cuando configures las integraciones necesarias.
            </p>
            <div className="space-y-3">
              {templates.map((tmpl) => (
                <div
                  key={tmpl.template_key}
                  className="border border-ink/20 rounded p-3 bg-background"
                >
                  <p className="font-medium text-sm">{tmpl.name.replace("{NAME}", slug)}</p>
                  {tmpl.description && (
                    <p className="text-xs text-muted-foreground mt-1">{tmpl.description}</p>
                  )}
                  {tmpl.requires && (
                    <p className="text-xs mt-1">
                      <span className="font-semibold">Requiere:</span> {tmpl.requires}
                    </p>
                  )}
                  {tmpl.p00_task && (
                    <p className="text-xs text-muted-foreground mt-1">
                      → Tarea: {tmpl.p00_task}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CollapsibleSection>
        </ComicCard>
      )}

      {/* Prompt modal */}
      <PromptModal
        task={promptTask}
        open={!!promptTask}
        onClose={() => setPromptTask(null)}
        onSave={handleSavePrompt}
      />
    </section>
  );
}
