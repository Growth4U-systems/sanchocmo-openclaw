/**
 * Foundation Status Bar — sticky bottom bar with status pill + action buttons.
 * Ported from renderStatusDropdown() / renderDocView() actions area.
 */

"use client";

import { useUpdatePillarStatus } from "@/hooks/useBrandBrain";
import { StatusPill } from "@/components/shared/status-pill";
import { cn } from "@/lib/utils";
import type { TaskStatus } from "@/types";

// Status actions available
// SAN-183 F5: vocabulario único — "Pedir cambios"/"Actualizar" colapsan en
// reabrir la task (todo); el porqué se cuenta en el chat del pilar.
const STATUS_ACTIONS: { status: TaskStatus; label: string; cls: string }[] = [
  { status: "completed", label: "\u2705 Aprobar", cls: "bg-green-500 text-white hover:bg-green-600" },
  {
    status: "todo",
    label: "\u26A0\uFE0F Pedir cambios",
    cls: "bg-yellow-400 text-black hover:bg-yellow-500",
  },
];

interface StatusBarProps {
  slug: string;
  section: string;
  pillar: string;
  status: string;
  approvedAt?: string;
  completedAt?: string;
  onStatusChange?: (status: TaskStatus) => void;
}

export function StatusBar({
  slug,
  section,
  pillar,
  status,
  approvedAt,
  completedAt,
  onStatusChange,
}: StatusBarProps) {
  const mutation = useUpdatePillarStatus();

  const handleAction = (newStatus: TaskStatus) => {
    mutation.mutate(
      { slug, section, pillar, status: newStatus },
      {
        onSuccess: () => {
          onStatusChange?.(newStatus);
        },
      },
    );
  };

  // Normalize for display
  const displayStatus =
    status === "done"
      ? "completed"
      : status === "generated"
        ? "pending-review"
        : status;

  // Show Generate button if not-started
  const isNotStarted = status === "todo";

  // Timestamp
  const lastModified = approvedAt || completedAt;

  return (
    <div className="sticky bottom-0 z-10 flex items-center gap-3 px-4 py-3 bg-card border-t-2 border-ink rounded-b-lg flex-wrap">
      {/* Current status */}
      <StatusPill status={displayStatus} size="md" />

      {/* Spacer */}
      <div className="flex-1" />

      {/* Last modified */}
      {lastModified && (
        <span className="text-[10px] text-muted-foreground hidden sm:inline">
          Modificado: {new Date(lastModified).toLocaleDateString("es")}
        </span>
      )}

      {/* Actions */}
      {isNotStarted ? (
        <button
          type="button"
          onClick={() => handleAction("in-progress")}
          disabled={mutation.isPending}
          className={cn(
            "px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors",
            "bg-rust text-white hover:opacity-90",
            mutation.isPending && "opacity-50 cursor-not-allowed",
          )}
        >
          {"\u25B6\uFE0F"} Generar
        </button>
      ) : (
        STATUS_ACTIONS.filter((a) => a.status !== displayStatus).map((action) => (
          <button
            key={action.status}
            type="button"
            onClick={() => handleAction(action.status)}
            disabled={mutation.isPending}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
              action.cls,
              mutation.isPending && "opacity-50 cursor-not-allowed",
            )}
          >
            {action.label}
          </button>
        ))
      )}
    </div>
  );
}
