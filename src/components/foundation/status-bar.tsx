/**
 * Foundation Status Bar — sticky bottom bar with status pill + action buttons.
 * Ported from renderStatusDropdown() / renderDocView() actions area.
 */

"use client";

import { useUpdatePillarStatus } from "@/hooks/useFoundation";
import { StatusPill } from "@/components/shared/status-pill";
import { cn } from "@/lib/utils";
import type { PillarStatus } from "@/types";

// Status actions available
const STATUS_ACTIONS: { status: PillarStatus; label: string; cls: string }[] = [
  { status: "approved", label: "\u2705 Aprobar", cls: "bg-green-500 text-white hover:bg-green-600" },
  {
    status: "request-changes",
    label: "\u26A0\uFE0F Pedir cambios",
    cls: "bg-yellow-400 text-black hover:bg-yellow-500",
  },
  {
    status: "request-refresh",
    label: "\uD83D\uDD04 Actualizar",
    cls: "bg-blue-500 text-white hover:bg-blue-600",
  },
];

interface StatusBarProps {
  slug: string;
  section: string;
  pillar: string;
  status: string;
  approvedAt?: string;
  completedAt?: string;
  onStatusChange?: (status: PillarStatus) => void;
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

  const handleAction = (newStatus: PillarStatus) => {
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
      ? "approved"
      : status === "generated"
        ? "pending-review"
        : status;

  // Show Generate button if not-started
  const isNotStarted = status === "not-started";

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
