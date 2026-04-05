/** Vertical timeline for Trust Engine with phased items, status dots, and action buttons. */

"use client";

import { cn } from "@/lib/utils";

export interface TimelineItem {
  id: string;
  title: string;
  icon?: string;
  description?: string;
  status: "completed" | "running" | "pending" | "locked" | "error";
  meta?: string;
  actions?: {
    label: string;
    variant: "primary" | "secondary" | "navy";
    onClick: () => void;
  }[];
}

export interface TimelinePhase {
  number: number;
  title: string;
  description?: string;
  items: TimelineItem[];
}

const STATUS_DOT: Record<TimelineItem["status"], string> = {
  completed: "bg-sage",
  running: "bg-yellow-400 animate-pulse",
  pending: "bg-card border-2 border-border",
  locked: "bg-muted-foreground/30",
  error: "bg-destructive",
};

const STATUS_LABEL: Record<TimelineItem["status"], { text: string; cls: string }> = {
  completed: { text: "Completed", cls: "bg-sage/20 text-sage" },
  running: { text: "Running", cls: "bg-yellow-400/20 text-yellow-700" },
  pending: { text: "Pending", cls: "bg-border text-muted-foreground" },
  locked: { text: "Locked", cls: "bg-muted text-muted-foreground" },
  error: { text: "Error", cls: "bg-destructive/20 text-destructive" },
};

const ACTION_VARIANT: Record<string, string> = {
  primary: "bg-rust text-white",
  navy: "bg-navy text-white",
  secondary: "bg-card text-foreground",
};

interface TimelineProps {
  phases: TimelinePhase[];
}

export function Timeline({ phases }: TimelineProps) {
  return (
    <div className="space-y-10">
      {phases.map((phase) => (
        <div key={phase.number}>
          {/* Phase header */}
          <div className="flex items-center gap-3 mb-4">
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-navy text-white text-sm font-bold shrink-0">
              {phase.number}
            </span>
            <div>
              <h3 className="text-lg font-semibold text-navy">{phase.title}</h3>
              {phase.description && (
                <p className="text-[11px] text-muted-foreground">
                  {phase.description}
                </p>
              )}
            </div>
          </div>

          {/* Timeline items */}
          <div className="relative ml-4 pl-8">
            {/* Vertical line */}
            <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-border" />

            <div className="space-y-4">
              {phase.items.map((item) => (
                <div key={item.id} className="relative">
                  {/* Status dot */}
                  <span
                    className={cn(
                      "absolute -left-8 top-4 w-7 h-7 rounded-full flex items-center justify-center -translate-x-1/2",
                      STATUS_DOT[item.status],
                    )}
                  >
                    {item.icon && (
                      <span className="text-xs">{item.icon}</span>
                    )}
                  </span>

                  {/* Card */}
                  <div className="border-[3px] border-ink rounded-[10px] p-4 shadow-comic-sm bg-card hover:-translate-y-0.5 transition-all">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-semibold text-foreground">
                          {item.title}
                        </h4>
                        {item.description && (
                          <p className="text-[11px] text-muted-foreground mt-1">
                            {item.description}
                          </p>
                        )}
                        {item.meta && (
                          <span className="text-[10px] text-muted-foreground">
                            {item.meta}
                          </span>
                        )}
                      </div>

                      {/* Status badge */}
                      <span
                        className={cn(
                          "text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0",
                          STATUS_LABEL[item.status].cls,
                        )}
                      >
                        {STATUS_LABEL[item.status].text}
                      </span>
                    </div>

                    {/* Action buttons */}
                    {item.actions && item.actions.length > 0 && (
                      <div className="flex gap-2 mt-3">
                        {item.actions.map((action) => (
                          <button
                            key={action.label}
                            type="button"
                            onClick={action.onClick}
                            className={cn(
                              "px-3.5 py-1.5 rounded-md text-[11px] font-semibold border-2 border-ink shadow-[2px_2px_0] shadow-ink transition-all hover:translate-y-px hover:shadow-[1px_1px_0] hover:shadow-ink",
                              ACTION_VARIANT[action.variant],
                            )}
                          >
                            {action.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
