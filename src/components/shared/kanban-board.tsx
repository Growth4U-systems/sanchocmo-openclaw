/** Generic multi-column kanban board with custom card rendering. */

import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface KanbanColumn<T> {
  key: string;
  label: string;
  icon?: string;
  color?: string;
  items: T[];
}

interface KanbanBoardProps<T> {
  columns: KanbanColumn<T>[];
  renderCard: (item: T) => ReactNode;
  emptyLabel?: string;
}

export function KanbanBoard<T>({
  columns,
  renderCard,
  emptyLabel = "No items",
}: KanbanBoardProps<T>) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {columns.map((col) => (
        <div
          key={col.key}
          className="min-w-[250px] flex-1 bg-card rounded-lg border-2 border-border"
        >
          {/* Column header */}
          <div
            className={cn(
              "px-3 py-2 text-xs font-bold uppercase tracking-wider flex items-center gap-2",
              col.color ?? "text-foreground",
            )}
          >
            {col.icon && <span>{col.icon}</span>}
            <span>{col.label}</span>
            <span className="ml-auto text-[10px] font-semibold bg-border text-muted-foreground rounded-full px-1.5 py-0.5">
              {col.items.length}
            </span>
          </div>

          {/* Column body */}
          <div className="p-2 space-y-2 min-h-[200px]">
            {col.items.length > 0
              ? col.items.map((item, idx) => (
                  <div key={idx}>{renderCard(item)}</div>
                ))
              : (
                <p className="text-[11px] text-muted-foreground text-center py-8">
                  {emptyLabel}
                </p>
              )}
          </div>
        </div>
      ))}
    </div>
  );
}
