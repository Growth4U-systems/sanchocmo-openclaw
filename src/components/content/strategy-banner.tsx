/**
 * StrategyBanner — Client-global strategy tasks for Content Creation.
 *
 * Context:
 *   Before Phase 1 of the Content Creation refactor, the client-global tasks
 *   (Content Strategy, LinkedIn setup, Editorial Calendar, Crons) were mixed
 *   in with per-niche tasks under a confusing "All Niches" dropdown. The
 *   user couldn't tell which tasks were global vs niche-specific.
 *
 *   This banner sits ABOVE the niche-filtered tabs. It always shows the
 *   client-global tasks regardless of niche selection, because they apply
 *   to the whole client.
 *
 * Design:
 *   - Collapsible (default: collapsed when all tasks done, expanded otherwise)
 *   - Progress pill: X / Y completed
 *   - Each task row has: name, status badge, chat button, doc button
 *   - Compact — fits above the tabs without dominating the page
 */

"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export interface StrategyBannerTask {
  id: string;
  key: string;
  name: string;
  status: string;
  deliverable: string | null;
  docPath: string | null;
  pillar?: string | null;
}

interface StrategyBannerProps {
  tasks: StrategyBannerTask[];
  /**
   * Called when the user clicks the chat button on a task row. Receives the
   * full task so the parent can decide which thread to open — for tasks with
   * a `pillar`, the parent should route to `buildPillarThread(slug, pillar)`
   * so the banner thread converges with the thread used by the Foundation
   * task page. Otherwise threads fork by entry point and history gets split.
   */
  onOpenChat: (task: StrategyBannerTask) => void;
  onSelectDoc?: (doc: { key: string; name: string; status: string; deliverable: string }) => void;
}

const STATUS_BADGE: Record<string, string> = {
  done: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border border-green-200 dark:border-green-800",
  review: "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-800",
  wip: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800",
  todo: "bg-muted/50 text-muted-foreground border border-border",
  blocked: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400 border border-red-200 dark:border-red-800",
};

function statusToCls(status: string): string {
  if (status === "approved" || status === "done") return "done";
  if (status === "pending-review") return "review";
  if (status === "in-progress") return "wip";
  if (status === "blocked") return "blocked";
  return "todo";
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    approved: "Aprobado",
    done: "Completado",
    "pending-review": "Pendiente revisión",
    "in-progress": "En progreso",
    "not-started": "No iniciado",
    pending: "No iniciado",
    blocked: "Bloqueado",
  };
  return labels[status] || status;
}

function isDoneStatus(s: string): boolean {
  return s === "approved" || s === "done" || s === "completed";
}

export function StrategyBanner({ tasks, onOpenChat, onSelectDoc }: StrategyBannerProps) {
  const doneCount = tasks.filter((t) => isDoneStatus(t.status)).length;
  const total = tasks.length;
  const allDone = total > 0 && doneCount === total;

  // Collapse by default when everything is done; expand otherwise.
  const [expanded, setExpanded] = useState<boolean>(!allDone);

  if (tasks.length === 0) return null;

  return (
    <div className="mb-6 rounded-xl border-[3px] border-ink bg-card shadow-comic-sm overflow-hidden">
      {/* Header — always visible, clickable to toggle */}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-3 px-5 py-3 hover:bg-muted/20 transition-colors text-left"
      >
        <span className="text-xl">🎯</span>
        <span className="font-heading text-base text-navy flex-1">
          Strategy Setup
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            (cliente-global — aplica a todos los nichos)
          </span>
        </span>
        <span
          className={cn(
            "text-[11px] font-medium px-2.5 py-1 rounded-full",
            allDone ? STATUS_BADGE.done : STATUS_BADGE.todo,
          )}
        >
          {doneCount}/{total} {allDone ? "✓" : ""}
        </span>
        <span className="text-muted-foreground text-sm">{expanded ? "▼" : "▶"}</span>
      </button>

      {/* Body — tasks list */}
      {expanded && (
        <div className="divide-y divide-border/40 border-t border-border/60">
          {tasks.map((task) => {
            const cls = statusToCls(task.status);
            const hasDoc = !!task.deliverable && task.status !== "not-started" && task.status !== "pending";
            return (
              <div
                key={task.id || task.key}
                className="flex items-center gap-3 px-5 py-3 hover:bg-muted/10 transition-colors"
              >
                <span className="flex-1 text-sm font-medium text-foreground/80">
                  {task.name}
                </span>
                <span
                  className={cn(
                    "text-[11px] font-medium px-2.5 py-1 rounded-full hidden sm:inline-block",
                    STATUS_BADGE[cls] || STATUS_BADGE.todo,
                  )}
                >
                  {statusLabel(task.status)}
                </span>
                <div className="flex items-center gap-1">
                  {hasDoc && task.deliverable && onSelectDoc && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectDoc({
                          key: task.key,
                          name: task.name,
                          status: task.status,
                          deliverable: task.deliverable!,
                        });
                      }}
                      className="text-sm hover:scale-110 transition-transform p-1 rounded-md hover:bg-muted/40"
                      title="Ver documento"
                    >
                      📄
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenChat(task);
                    }}
                    className="text-sm hover:scale-110 transition-transform p-1 rounded-md hover:bg-muted/40"
                    title="Chat con Sancho"
                  >
                    💬
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
